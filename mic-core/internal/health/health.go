// Package health serves liveness and readiness checks.
package health

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nats-io/nats.go"
	"github.com/redis/go-redis/v9"
)

type Checker struct {
	Postgres *pgxpool.Pool
	Redis    *redis.Client
	NATS     *nats.Conn
}

func (c *Checker) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	mux.HandleFunc("GET /readyz", c.ready)
}

// ready reports whether every dependency is reachable.
func (c *Checker) ready(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := c.check(ctx); err != nil {
		http.Error(w, err.Error(), http.StatusServiceUnavailable)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func (c *Checker) check(ctx context.Context) error {
	if err := c.Postgres.Ping(ctx); err != nil {
		return errors.New("postgres unavailable")
	}
	if err := c.Redis.Ping(ctx).Err(); err != nil {
		return errors.New("redis unavailable")
	}
	if !c.NATS.IsConnected() {
		return errors.New("nats unavailable")
	}
	return nil
}
