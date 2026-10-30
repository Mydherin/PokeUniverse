// Package ratelimit limits requests per client with fixed windows in Redis,
// so the limit holds across every mic-core replica.
package ratelimit

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"

	"pokeuniverse/mic-core/internal/httpx"
)

type Limiter struct {
	rdb *redis.Client
	log *slog.Logger
}

func New(rdb *redis.Client, log *slog.Logger) *Limiter {
	return &Limiter{rdb: rdb, log: log}
}

// Allow counts one hit for key and reports whether it is within limit for the current window.
func (l *Limiter) Allow(ctx context.Context, key string, limit int, window time.Duration) (bool, error) {
	slot := time.Now().UnixNano() / int64(window)
	k := fmt.Sprintf("ratelimit:%s:%d", key, slot)
	pipe := l.rdb.TxPipeline()
	incr := pipe.Incr(ctx, k)
	pipe.ExpireNX(ctx, k, window)
	if _, err := pipe.Exec(ctx); err != nil {
		return false, err
	}
	return incr.Val() <= int64(limit), nil
}

// PerIP limits a handler to limit requests per client IP per window.
// If Redis is down it lets requests through rather than locking players out.
func (l *Limiter) PerIP(name string, limit int, window time.Duration, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ok, err := l.Allow(r.Context(), name+":"+httpx.ClientIP(r), limit, window)
		if err != nil {
			l.log.Warn("rate limit unavailable", "err", err)
		} else if !ok {
			w.Header().Set("Retry-After", strconv.Itoa(int(window.Seconds())))
			http.Error(w, "too many requests", http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}
