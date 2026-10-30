package auth

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/redis/go-redis/v9"
	"golang.org/x/oauth2"

	authv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/auth/v1"
	"pokeuniverse/mic-core/internal/account"
	"pokeuniverse/mic-core/internal/httpx"
)

const (
	sessionCookie = "pu_session"
	loginCookie   = "pu_login"
	loginTTL      = 10 * time.Minute
)

// pendingLogin is kept in Redis between /auth/google and its callback.
type pendingLogin struct {
	CodeVerifier string `json:"v"`
	Nonce        string `json:"n"`
}

// Handler serves the HTTPS auth endpoints (tech-stack.md#auth-endpoints).
type Handler struct {
	Google        *Google
	Accounts      *account.Service
	Sessions      *Sessions
	Tokens        *Tokens
	Redis         *redis.Client
	Origin        string
	SecureCookies bool
	Log           *slog.Logger
}

// RateLimit wraps a handler with a per-IP limit.
type RateLimit func(name string, limit int, window time.Duration, next http.Handler) http.Handler

func (h *Handler) Register(mux *http.ServeMux, limit RateLimit) {
	mux.Handle("GET /auth/google", limit("auth-start", 20, time.Minute, http.HandlerFunc(h.start)))
	mux.Handle("GET /auth/google/callback", limit("auth-callback", 20, time.Minute, http.HandlerFunc(h.callback)))
	mux.Handle("POST /auth/refresh", limit("auth-refresh", 60, time.Minute, http.HandlerFunc(h.refresh)))
	mux.Handle("POST /auth/logout", limit("auth-logout", 20, time.Minute, http.HandlerFunc(h.logout)))
}

// start sends the browser to Google with state, nonce and a PKCE challenge.
func (h *Handler) start(w http.ResponseWriter, r *http.Request) {
	if !h.Google.Enabled() {
		h.toLogin(w, r, "unavailable")
		return
	}
	state, nonce, verifier := randomString(32), randomString(32), oauth2.GenerateVerifier()
	url, err := h.Google.AuthCodeURL(state, nonce, verifier)
	if err != nil {
		h.Log.Error("google auth url", "err", err)
		h.toLogin(w, r, "unavailable")
		return
	}
	pending, _ := json.Marshal(pendingLogin{CodeVerifier: verifier, Nonce: nonce})
	if err := h.Redis.Set(r.Context(), loginKey(state), pending, loginTTL).Err(); err != nil {
		h.Log.Error("store pending login", "err", err)
		h.toLogin(w, r, "unavailable")
		return
	}
	// Binds the login to this browser (prevents login CSRF). Lax: it must survive the redirect back from Google.
	http.SetCookie(w, &http.Cookie{
		Name: loginCookie, Value: state, Path: "/auth/google/callback",
		MaxAge: int(loginTTL.Seconds()), HttpOnly: true, Secure: h.SecureCookies, SameSite: http.SameSiteLaxMode,
	})
	http.Redirect(w, r, url, http.StatusFound)
}

// callback finishes sign-in: one use case for both sign-up and login.
func (h *Handler) callback(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{Name: loginCookie, Path: "/auth/google/callback", MaxAge: -1, HttpOnly: true, Secure: h.SecureCookies, SameSite: http.SameSiteLaxMode})

	q := r.URL.Query()
	if q.Get("error") != "" {
		h.toLogin(w, r, "cancelled")
		return
	}
	state := q.Get("state")
	cookie, err := r.Cookie(loginCookie)
	if err != nil || state == "" || subtle.ConstantTimeCompare([]byte(cookie.Value), []byte(state)) != 1 {
		h.toLogin(w, r, "expired")
		return
	}
	raw, err := h.Redis.GetDel(r.Context(), loginKey(state)).Bytes()
	if err != nil {
		h.toLogin(w, r, "expired")
		return
	}
	var pending pendingLogin
	if err := json.Unmarshal(raw, &pending); err != nil {
		h.toLogin(w, r, "expired")
		return
	}

	profile, err := h.Google.Exchange(r.Context(), q.Get("code"), pending.CodeVerifier, pending.Nonce)
	if err != nil {
		h.Log.Warn("google sign-in failed", "err", err)
		h.toLogin(w, r, "failed")
		return
	}
	acc, err := h.Accounts.SignInWithGoogle(r.Context(), profile)
	if err != nil {
		h.Log.Error("sign in", "err", err)
		h.toLogin(w, r, "failed")
		return
	}
	token, expiresAt, err := h.Sessions.Create(r.Context(), acc.ID)
	if err != nil {
		h.Log.Error("create session", "err", err)
		h.toLogin(w, r, "failed")
		return
	}
	h.setSession(w, token, expiresAt)
	h.Log.Info("signed in", "account_id", acc.ID)
	http.Redirect(w, r, "/", http.StatusFound)
}

// refresh rotates the refresh token and returns a new access token with the account.
func (h *Handler) refresh(w http.ResponseWriter, r *http.Request) {
	if !h.sameOrigin(r) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	cookie, err := r.Cookie(sessionCookie)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	accountID, next, expiresAt, err := h.Sessions.Rotate(r.Context(), cookie.Value)
	switch {
	case errors.Is(err, ErrRefreshTokenReused):
		h.Log.Warn("refresh token reuse: all sessions revoked", "account_id", accountID)
		h.clearSession(w)
		w.WriteHeader(http.StatusUnauthorized)
		return
	case errors.Is(err, ErrInvalidRefreshToken):
		h.clearSession(w)
		w.WriteHeader(http.StatusUnauthorized)
		return
	case err != nil:
		h.Log.Error("rotate session", "err", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	h.setSession(w, next, expiresAt)

	acc, err := h.Accounts.Get(r.Context(), accountID)
	if err != nil {
		h.Log.Error("load account", "err", err, "account_id", accountID)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	access, accessExpiresAt, err := h.Tokens.Issue(acc.ID, acc.Roles)
	if err != nil {
		h.Log.Error("issue access token", "err", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	httpx.WriteProtoJSON(w, http.StatusOK, &authv1.RefreshResponse{
		AccessToken:      access,
		ExpiresInSeconds: uint32(time.Until(accessExpiresAt).Seconds()),
		Account: &authv1.Account{
			Id:          uint64(acc.ID),
			DisplayName: acc.DisplayName,
			Email:       acc.Email,
			PictureUrl:  acc.PictureURL,
			Roles:       acc.Roles,
			CreatedAt:   acc.CreatedAt.Unix(),
		},
	})
}

// logout revokes the current session.
func (h *Handler) logout(w http.ResponseWriter, r *http.Request) {
	if !h.sameOrigin(r) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	if cookie, err := r.Cookie(sessionCookie); err == nil {
		if err := h.Sessions.Revoke(r.Context(), cookie.Value); err != nil {
			h.Log.Error("revoke session", "err", err)
		}
	}
	h.clearSession(w)
	w.WriteHeader(http.StatusNoContent)
}

// CleanupLoop deletes expired refresh tokens periodically until ctx ends.
func (h *Handler) CleanupLoop(ctx context.Context, every time.Duration) {
	ticker := time.NewTicker(every)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if n, err := h.Sessions.DeleteExpired(ctx); err != nil {
				h.Log.Error("delete expired sessions", "err", err)
			} else if n > 0 {
				h.Log.Info("expired sessions deleted", "count", n)
			}
		}
	}
}

// The refresh cookie is only sent to /auth and never readable by scripts.
func (h *Handler) setSession(w http.ResponseWriter, token string, expiresAt time.Time) {
	http.SetCookie(w, &http.Cookie{
		Name: sessionCookie, Value: token, Path: "/auth",
		Expires: expiresAt, MaxAge: int(time.Until(expiresAt).Seconds()),
		HttpOnly: true, Secure: h.SecureCookies, SameSite: http.SameSiteStrictMode,
	})
}

func (h *Handler) clearSession(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Path: "/auth", MaxAge: -1, HttpOnly: true, Secure: h.SecureCookies, SameSite: http.SameSiteStrictMode})
}

// sameOrigin blocks cross-site calls to the cookie-authenticated endpoints.
func (h *Handler) sameOrigin(r *http.Request) bool {
	return r.Header.Get("Origin") == h.Origin
}

func (h *Handler) toLogin(w http.ResponseWriter, r *http.Request, reason string) {
	http.Redirect(w, r, "/login?error="+reason, http.StatusFound)
}

func loginKey(state string) string { return "auth:login:" + state }
