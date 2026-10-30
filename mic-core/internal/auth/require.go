package auth

import (
	"context"
	"net/http"
	"slices"
	"strings"
)

type principalKey struct{}

// PrincipalFrom returns the verified caller of a request wrapped by Require.
func PrincipalFrom(ctx context.Context) (Principal, bool) {
	p, ok := ctx.Value(principalKey{}).(Principal)
	return p, ok
}

// Require protects an HTTP endpoint: a valid access token in `Authorization: Bearer`
// (verified locally, no database call) and, when role is set, that role.
// 401 means sign in or refresh; 403 means signed in without the role.
func (t *Tokens) Require(role string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !ok || raw == "" {
			w.Header().Set("WWW-Authenticate", "Bearer")
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		p, err := t.Verify(raw)
		if err != nil {
			w.Header().Set("WWW-Authenticate", `Bearer error="invalid_token"`)
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		if role != "" && !slices.Contains(p.Roles, role) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), principalKey{}, p)))
	})
}
