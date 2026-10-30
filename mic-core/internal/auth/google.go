package auth

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"

	"pokeuniverse/mic-core/internal/account"
)

const googleIssuer = "https://accounts.google.com"

var ErrGoogleDisabled = errors.New("google sign-in is not configured")

// Google runs the OpenID Connect Authorization Code flow with PKCE against Google.
type Google struct {
	clientID     string
	clientSecret string
	redirectURL  string

	// Discovery is lazy, so mic-core starts even if Google is briefly unreachable.
	mu       sync.Mutex
	oauth    *oauth2.Config
	verifier *oidc.IDTokenVerifier
}

func NewGoogle(clientID, clientSecret, redirectURL string) *Google {
	return &Google{clientID: clientID, clientSecret: clientSecret, redirectURL: redirectURL}
}

func (g *Google) Enabled() bool { return g.clientID != "" && g.clientSecret != "" }

func (g *Google) setup() (*oauth2.Config, *oidc.IDTokenVerifier, error) {
	if !g.Enabled() {
		return nil, nil, ErrGoogleDisabled
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.oauth != nil {
		return g.oauth, g.verifier, nil
	}
	// The provider keeps this context to refresh Google's signing keys, so it must not be request-scoped.
	ctx := oidc.ClientContext(context.Background(), &http.Client{Timeout: 10 * time.Second})
	provider, err := oidc.NewProvider(ctx, googleIssuer)
	if err != nil {
		return nil, nil, fmt.Errorf("google discovery: %w", err)
	}
	g.oauth = &oauth2.Config{
		ClientID:     g.clientID,
		ClientSecret: g.clientSecret,
		RedirectURL:  g.redirectURL,
		Endpoint:     provider.Endpoint(),
		Scopes:       []string{oidc.ScopeOpenID, "email", "profile"},
	}
	g.verifier = provider.Verifier(&oidc.Config{ClientID: g.clientID})
	return g.oauth, g.verifier, nil
}

// AuthCodeURL is where the browser goes to sign in on Google.
func (g *Google) AuthCodeURL(state, nonce, codeVerifier string) (string, error) {
	cfg, _, err := g.setup()
	if err != nil {
		return "", err
	}
	return cfg.AuthCodeURL(state,
		oauth2.S256ChallengeOption(codeVerifier),
		oidc.Nonce(nonce),
		oauth2.SetAuthURLParam("prompt", "select_account"),
	), nil
}

// Exchange trades the authorization code for tokens and verifies Google's ID token.
func (g *Google) Exchange(ctx context.Context, code, codeVerifier, nonce string) (account.GoogleProfile, error) {
	cfg, verifier, err := g.setup()
	if err != nil {
		return account.GoogleProfile{}, err
	}
	ctx = oidc.ClientContext(ctx, &http.Client{Timeout: 10 * time.Second})
	token, err := cfg.Exchange(ctx, code, oauth2.VerifierOption(codeVerifier))
	if err != nil {
		return account.GoogleProfile{}, fmt.Errorf("code exchange: %w", err)
	}
	rawIDToken, ok := token.Extra("id_token").(string)
	if !ok {
		return account.GoogleProfile{}, errors.New("no id_token in token response")
	}
	idToken, err := verifier.Verify(ctx, rawIDToken)
	if err != nil {
		return account.GoogleProfile{}, fmt.Errorf("verify id_token: %w", err)
	}
	if idToken.Nonce != nonce {
		return account.GoogleProfile{}, errors.New("id_token nonce mismatch")
	}
	var c struct {
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
		Name          string `json:"name"`
		Picture       string `json:"picture"`
	}
	if err := idToken.Claims(&c); err != nil {
		return account.GoogleProfile{}, fmt.Errorf("id_token claims: %w", err)
	}
	if !c.EmailVerified {
		return account.GoogleProfile{}, errors.New("google email not verified")
	}
	return account.GoogleProfile{
		Subject:    idToken.Subject,
		Email:      c.Email,
		Name:       c.Name,
		PictureURL: c.Picture,
	}, nil
}
