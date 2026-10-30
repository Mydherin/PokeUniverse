// Package admin serves the admin HTTP endpoints. Every route requires the admin role.
package admin

import (
	"net/http"
	"time"

	"pokeuniverse/mic-core/internal/account"
	"pokeuniverse/mic-core/internal/auth"
)

// RateLimit wraps a handler with a per-IP limit.
type RateLimit func(name string, limit int, window time.Duration, next http.Handler) http.Handler

type Handler struct {
	Tokens *auth.Tokens
}

func (h *Handler) Register(mux *http.ServeMux, limit RateLimit) {
	route := func(pattern, name string, perMinute int, fn http.HandlerFunc) {
		mux.Handle(pattern, limit(name, perMinute, time.Minute, h.Tokens.Require(account.AdminRole, fn)))
	}
	route("GET /api/admin/access", "admin-access", 60, h.access)
}

// access confirms the caller is an admin: the admin page asks it before showing anything.
func (h *Handler) access(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusNoContent)
}
