// Package httpx holds small HTTP helpers shared by mic-core handlers.
package httpx

import (
	"bufio"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"time"

	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
)

// ClientIP returns the player's IP. mic-core is only reachable through the
// spa-pokeuniverse proxy, which sets X-Real-IP.
func ClientIP(r *http.Request) string {
	if ip := r.Header.Get("X-Real-IP"); ip != "" {
		return ip
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// WriteProtoJSON writes a contract message as Protocol Buffers JSON.
func WriteProtoJSON(w http.ResponseWriter, status int, msg proto.Message) {
	body, err := protojson.Marshal(msg)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(body)
}

// Middleware wraps every request with panic recovery, access logs and base security headers.
func Middleware(log *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		defer func() {
			if v := recover(); v != nil {
				log.Error("panic", "path", r.URL.Path, "panic", v)
				http.Error(rec, "internal error", http.StatusInternalServerError)
			}
			if r.URL.Path != "/healthz" && r.URL.Path != "/readyz" {
				log.Info("http", "method", r.Method, "path", r.URL.Path, "status", rec.status, "duration_ms", time.Since(start).Milliseconds())
			}
		}()
		h := rec.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Cache-Control", "no-store")
		next.ServeHTTP(rec, r)
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

// Unwrap lets http.ResponseController reach the underlying writer.
func (s *statusRecorder) Unwrap() http.ResponseWriter { return s.ResponseWriter }

// Hijack hands the connection over to the WebSocket upgrader.
func (s *statusRecorder) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	h, ok := s.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, errors.New("hijack not supported")
	}
	s.status = http.StatusSwitchingProtocols
	return h.Hijack()
}
