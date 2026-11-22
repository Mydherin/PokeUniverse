package auth

import (
	"html/template"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"pokeuniverse/mic-core/internal/account"
)

// Dev only: with GOOGLE_MOCK set, "Continue with Google" opens this form instead of Google and signs in
// whoever it names, so a development deployment (a Mooi preview) works without a Google client.
// The rest of sign-in is the real one: same account upsert, ADMIN_EMAILS, session and refresh cookie.
// Never set GOOGLE_MOCK in production: anyone could sign in as anyone.

// mockSubjectPrefix keeps mock accounts apart from real Google ones (and from bots' "bot:").
const mockSubjectPrefix = "mock:"

// The form posts to google/mock, relative to /auth/google, so it also works under a path prefix.
var mockForm = template.Must(template.New("mock").Parse(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>Mock Google sign-in · PokeUniverse</title>
</head>
<body style="font-family:system-ui,sans-serif;background:#0b0920;color:#eee;display:grid;place-items:center;min-height:100vh;margin:0">
<form method="post" action="google/mock" style="display:grid;gap:12px;width:min(320px,90vw)">
<h1 style="font-size:20px;margin:0">Mock Google sign-in</h1>
<p style="margin:0;color:#aab">Development only (GOOGLE_MOCK). The same email always signs in to the same account.</p>
{{if .Error}}<p style="margin:0;color:#f88">{{.Error}}</p>{{end}}
<label>Email<br><input name="email" type="email" required autofocus value="{{.Email}}" style="width:100%;box-sizing:border-box;padding:8px"></label>
<label>Name (optional)<br><input name="name" maxlength="64" value="{{.Name}}" style="width:100%;box-sizing:border-box;padding:8px"></label>
<button type="submit" style="padding:10px;font-weight:600">Sign in</button>
</form>
</body>
</html>`))

type mockFormData struct{ Email, Name, Error string }

func (h *Handler) registerMock(mux *http.ServeMux, limit RateLimit) {
	mux.Handle("GET /auth/google", limit("auth-start", 20, time.Minute, http.HandlerFunc(h.mockStart)))
	mux.Handle("POST /auth/google/mock", limit("auth-callback", 20, time.Minute, http.HandlerFunc(h.mockCallback)))
}

func (h *Handler) mockStart(w http.ResponseWriter, _ *http.Request) {
	h.renderMock(w, http.StatusOK, mockFormData{})
}

// mockCallback signs in the account of the posted email, as callback does with Google's profile.
func (h *Handler) mockCallback(w http.ResponseWriter, r *http.Request) {
	if !h.sameOrigin(r) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	data := mockFormData{Email: strings.TrimSpace(r.PostFormValue("email")), Name: strings.TrimSpace(r.PostFormValue("name"))}
	addr, err := mail.ParseAddress(data.Email)
	if err != nil || addr.Address != data.Email {
		data.Error = "Enter a valid email address."
		h.renderMock(w, http.StatusBadRequest, data)
		return
	}
	email := strings.ToLower(data.Email)
	name := data.Name
	if name == "" {
		name, _, _ = strings.Cut(email, "@")
	}
	h.signIn(w, r, account.GoogleProfile{Subject: mockSubjectPrefix + email, Email: email, Name: name})
}

func (h *Handler) renderMock(w http.ResponseWriter, status int, data mockFormData) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	if err := mockForm.Execute(w, data); err != nil {
		h.Log.Error("mock sign-in form", "err", err)
	}
}
