// mic-core is the main game server: player connections, auth and (later) the world.
// It delegates battles to mic-battles over NATS.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/nats-io/nats.go"
	"github.com/redis/go-redis/v9"

	"pokeuniverse/mic-core/internal/account"
	"pokeuniverse/mic-core/internal/admin"
	"pokeuniverse/mic-core/internal/auth"
	"pokeuniverse/mic-core/internal/battles"
	"pokeuniverse/mic-core/internal/config"
	"pokeuniverse/mic-core/internal/health"
	"pokeuniverse/mic-core/internal/httpx"
	"pokeuniverse/mic-core/internal/live"
	"pokeuniverse/mic-core/internal/ratelimit"
	"pokeuniverse/mic-core/internal/realtime"
	"pokeuniverse/mic-core/internal/store"
	"pokeuniverse/mic-core/internal/trainer"
	"pokeuniverse/mic-core/internal/world"
	"pokeuniverse/mic-core/maps"
)

// positionCopyInterval: how often live positions of players who moved are copied to PostgreSQL.
const positionCopyInterval = 30 * time.Second

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	// `mic-core healthcheck` is used by the container healthcheck (the image has no shell or curl).
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		os.Exit(healthcheck())
	}

	if err := run(log); err != nil {
		log.Error("mic-core stopped", "err", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	pool, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()
	if err := store.Migrate(ctx, pool, log); err != nil {
		return err
	}

	rdb := redis.NewClient(&redis.Options{Addr: cfg.RedisAddr, Password: cfg.RedisPassword})
	defer rdb.Close()
	if err := rdb.Ping(ctx).Err(); err != nil {
		return fmt.Errorf("redis: %w", err)
	}

	nc, err := nats.Connect(cfg.NATSURL,
		nats.Name("mic-core"),
		nats.UserInfo(cfg.NATSUser, cfg.NATSPassword),
		nats.MaxReconnects(-1),
	)
	if err != nil {
		return fmt.Errorf("nats: %w", err)
	}
	defer nc.Drain()
	go (&battles.Client{NATS: nc}).WaitReachable(ctx, log)

	accounts := account.NewService(pool, cfg.AdminEmails)
	if n, err := accounts.GrantConfiguredAdmins(ctx); err != nil {
		return err
	} else if n > 0 {
		log.Info("admin role granted from ADMIN_EMAILS", "count", n)
	}

	tokens := auth.NewTokens(cfg.JWTKeyID, cfg.JWTPrivateKey)
	authHandler := &auth.Handler{
		Google:        auth.NewGoogle(cfg.GoogleClientID, cfg.GoogleClientSecret, cfg.Origin()+"/auth/google/callback"),
		Accounts:      accounts,
		Sessions:      auth.NewSessions(pool),
		Tokens:        tokens,
		Redis:         rdb,
		Origin:        cfg.Origin(),
		SecureCookies: cfg.SecureCookies(),
		Log:           log,
	}
	if !authHandler.Google.Enabled() {
		log.Warn("google sign-in disabled: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set")
	}
	go authHandler.CleanupLoop(ctx, time.Hour)

	worldMaps, err := world.LoadMaps(maps.FS)
	if err != nil {
		return err
	}
	positions := live.NewStore(rdb, pool, log)
	go positions.CopyLoop(ctx, positionCopyInterval)
	game, err := world.New(worldMaps, positions, pool, log)
	if err != nil {
		return err
	}
	log.Info("world loaded", "maps", len(worldMaps))
	ws := realtime.NewHandler(tokens, game, cfg.Origin(), log)

	mux := http.NewServeMux()
	(&health.Checker{Postgres: pool, Redis: rdb, NATS: nc}).Register(mux)
	limit := ratelimit.New(rdb, log).PerIP
	authHandler.Register(mux, limit)
	(&admin.Handler{Tokens: tokens}).Register(mux, limit)
	(&trainer.Handler{Tokens: tokens, Pool: pool, Live: positions, Log: log}).Register(mux, limit)
	mux.Handle("GET /ws", ws)

	srv := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           httpx.Middleware(log, mux),
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
	errc := make(chan error, 1)
	go func() {
		log.Info("mic-core listening", "addr", cfg.HTTPAddr)
		errc <- srv.ListenAndServe()
	}()

	select {
	case err := <-errc:
		return err
	case <-ctx.Done():
	}
	log.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	// Players leave first (saving where they are), then the zones stop, then HTTP.
	ws.Shutdown(shutdownCtx)
	game.Close()
	if err := srv.Shutdown(shutdownCtx); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

func healthcheck() int {
	_, port, err := net.SplitHostPort(os.Getenv("HTTP_ADDR"))
	if err != nil {
		port = "8081"
	}
	client := http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get("http://127.0.0.1:" + port + "/readyz")
	if err != nil {
		return 1
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 1
	}
	return 0
}
