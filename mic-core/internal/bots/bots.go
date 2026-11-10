// Package bots serves the dev-only bot accounts (phase-8 D16): POST /api/dev/bots creates or reuses
// accounts bot-1 … bot-<n>, gives each a fresh trainer on a map and returns their access tokens, so
// infra/bots can fill the world with players. Registered only while BOTS_SECRET is set.
package bots

import (
	"context"
	"crypto/subtle"
	"fmt"
	"io"
	"log/slog"
	"math/rand/v2"
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"google.golang.org/protobuf/encoding/protojson"

	devv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/dev/v1"
	mapv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/map/v1"
	"pokeuniverse/mic-core/internal/account"
	"pokeuniverse/mic-core/internal/auth"
	"pokeuniverse/mic-core/internal/db"
	"pokeuniverse/mic-core/internal/httpx"
	"pokeuniverse/mic-core/internal/item"
	"pokeuniverse/mic-core/internal/live"
	"pokeuniverse/mic-core/internal/pokemon"
	"pokeuniverse/mic-core/internal/world"
)

// Role marks bot accounts; it opens no route (they play with the user role).
const Role = "bot"

const (
	maxBots = 100
	maxBody = 1 << 10
)

// RateLimit wraps a handler with a per-IP limit.
type RateLimit func(name string, limit int, window time.Duration, next http.Handler) http.Handler

type Handler struct {
	Secret string
	Tokens *auth.Tokens
	Pool   *pgxpool.Pool
	Live   *live.Store
	Maps   world.Maps
	Log    *slog.Logger
}

// Register adds the route only when a secret is set: without one it is a 404.
func (h *Handler) Register(mux *http.ServeMux, limit RateLimit) {
	if h.Secret == "" {
		return
	}
	h.Log.Warn("dev bots endpoint enabled (BOTS_SECRET is set): never set it in production")
	mux.Handle("POST /api/dev/bots", limit("dev-bots", 30, time.Minute, http.HandlerFunc(h.spawn)))
}

func (h *Handler) spawn(w http.ResponseWriter, r *http.Request) {
	if subtle.ConstantTimeCompare([]byte(r.Header.Get("X-Bots-Secret")), []byte(h.Secret)) != 1 {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBody))
	if err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	var req devv1.SpawnBots
	if err := protojson.Unmarshal(body, &req); err != nil || req.Count < 1 || req.Count > maxBots {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	var spots []world.Point
	if !req.RefreshOnly {
		m, ok := h.Maps[req.Map]
		if !ok {
			http.Error(w, "unknown map", http.StatusUnprocessableEntity)
			return
		}
		if spots = spread(m, int(req.Count)); len(spots) == 0 {
			http.Error(w, "no free tile", http.StatusUnprocessableEntity)
			return
		}
	}
	resp := &devv1.SpawnedBots{}
	for n := 1; n <= int(req.Count); n++ {
		var bot *devv1.SpawnedBot
		if req.RefreshOnly {
			bot, err = h.token(r.Context(), n)
		} else {
			bot, err = h.create(r.Context(), n, req.Map, spots[(n-1)%len(spots)])
		}
		if err != nil {
			h.Log.Error("dev bots", "n", n, "err", err)
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		resp.Bots = append(resp.Bots, bot)
	}
	h.Log.Info("dev bots issued", "count", req.Count, "map", req.Map, "refresh_only", req.RefreshOnly)
	httpx.WriteProtoJSON(w, http.StatusOK, resp)
}

// create makes or reuses account bot-<n> and gives it a new trainer at p, as New Game does
// (PUT /api/trainer), in one transaction; the test team comes when it enters the world.
func (h *Handler) create(ctx context.Context, n int, mapID string, p world.Point) (*devv1.SpawnedBot, error) {
	var id int64
	err := pgx.BeginFunc(ctx, h.Pool, func(tx pgx.Tx) error {
		q := db.New(tx)
		name := "bot-" + strconv.Itoa(n)
		row, err := q.UpsertGoogleAccount(ctx, db.UpsertGoogleAccountParams{
			GoogleSub:   "bot:" + strconv.Itoa(n),
			Email:       name + "@bots.invalid",
			DisplayName: name,
		})
		if err != nil {
			return fmt.Errorf("upsert account: %w", err)
		}
		id = row.ID
		for _, role := range []string{account.DefaultRole, Role} {
			if err := q.AssignRole(ctx, db.AssignRoleParams{AccountID: id, Name: role}); err != nil {
				return fmt.Errorf("assign role: %w", err)
			}
		}
		gender := "boy"
		if n%2 == 0 {
			gender = "girl"
		}
		if _, err := q.PutTrainer(ctx, db.PutTrainerParams{
			AccountID: id,
			Name:      "BOT" + strconv.Itoa(n),
			Gender:    gender,
			RivalName: "RIVAL",
			MapID:     mapID,
			X:         int32(p.X),
			Y:         int32(p.Y),
			Facing:    live.FacingName(mapv1.Direction_DIRECTION_SOUTH),
			TrainerID: int64(rand.Uint32()),
		}); err != nil {
			return fmt.Errorf("put trainer: %w", err)
		}
		if err := item.Reset(ctx, q, id); err != nil {
			return err
		}
		return pokemon.Reset(ctx, q, id)
	})
	if err != nil {
		return nil, err
	}
	// The old save's live position must not win over the new one (as PUT /api/trainer).
	if err := h.Live.Clear(ctx, id); err != nil {
		return nil, fmt.Errorf("clear live state: %w", err)
	}
	return h.issue(n, id)
}

// token issues a new access token for an existing bot-<n>.
func (h *Handler) token(ctx context.Context, n int) (*devv1.SpawnedBot, error) {
	id, err := db.New(h.Pool).GetAccountIDByGoogleSub(ctx, "bot:"+strconv.Itoa(n))
	if err != nil {
		return nil, fmt.Errorf("find bot: %w", err)
	}
	return h.issue(n, id)
}

func (h *Handler) issue(n int, id int64) (*devv1.SpawnedBot, error) {
	token, expires, err := h.Tokens.Issue(id, []string{account.DefaultRole, Role})
	if err != nil {
		return nil, err
	}
	return &devv1.SpawnedBot{N: uint32(n), AccountId: uint64(id), AccessToken: token, ExpiresAt: expires.Unix()}, nil
}

// spread picks up to count free tiles spread over the map: walkable, no warp, NPC or encounter
// cell, and not the New Game start tile, so bots don't stack or stand on the player.
func spread(m *world.Map, count int) []world.Point {
	var free []world.Point
	for y := range m.Height {
		for x := range m.Width {
			p := world.Point{X: x, Y: y}
			if !m.Walkable(p) || m.WarpAt(p) != nil || m.NpcAt(p) != nil ||
				m.Encounter(p) != mapv1.EncounterType_ENCOUNTER_TYPE_UNSPECIFIED ||
				(m.ID == world.Start.Map && p.X == world.Start.X && p.Y == world.Start.Y) {
				continue
			}
			free = append(free, p)
		}
	}
	if len(free) <= count {
		return free
	}
	spots := make([]world.Point, count)
	for i := range spots {
		spots[i] = free[i*len(free)/count]
	}
	return spots
}
