// Package trainer serves the player's trainer: the save the game's main menu continues from,
// created by New Game, and its options.
package trainer

import (
	"errors"
	"io"
	"log/slog"
	"math/rand/v2"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"google.golang.org/protobuf/encoding/protojson"

	trainerv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/trainer/v1"
	"pokeuniverse/mic-core/internal/account"
	"pokeuniverse/mic-core/internal/auth"
	"pokeuniverse/mic-core/internal/db"
	"pokeuniverse/mic-core/internal/httpx"
	"pokeuniverse/mic-core/internal/item"
	"pokeuniverse/mic-core/internal/live"
	"pokeuniverse/mic-core/internal/pokedex"
	"pokeuniverse/mic-core/internal/world"
)

// RateLimit wraps a handler with a per-IP limit.
type RateLimit func(name string, limit int, window time.Duration, next http.Handler) http.Handler

type Handler struct {
	Tokens *auth.Tokens
	Pool   *pgxpool.Pool
	Live   *live.Store
	Log    *slog.Logger
}

func (h *Handler) Register(mux *http.ServeMux, limit RateLimit) {
	mux.Handle("GET /api/trainer", limit("trainer", 60, time.Minute, h.Tokens.Require(account.DefaultRole, http.HandlerFunc(h.get))))
	mux.Handle("PUT /api/trainer", limit("trainer-put", 20, time.Minute, h.Tokens.Require(account.DefaultRole, http.HandlerFunc(h.put))))
	mux.Handle("PUT /api/trainer/options", limit("trainer-options", 60, time.Minute, h.Tokens.Require(account.DefaultRole, http.HandlerFunc(h.putOptions))))
}

// maxBody bounds a NewTrainer request: two short names and a gender.
const maxBody = 1 << 10

// get returns the caller's trainer, or 404 when the account has none yet (New Game creates it).
// The location and play time are the live ones while the trainer is (or was just) online.
func (h *Handler) get(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	row, err := db.New(h.Pool).GetTrainer(r.Context(), p.AccountID)
	if errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, "no trainer", http.StatusNotFound)
		return
	}
	if err != nil {
		h.Log.Error("get trainer", "err", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	if pos, ok, err := h.Live.Location(r.Context(), p.AccountID, row.CreatedAt.UnixMicro()); err != nil {
		h.Log.Error("get trainer location", "err", err)
	} else if ok {
		row.MapID, row.X, row.Y = pos.Map, int32(pos.X), int32(pos.Y)
		row.PlayTimeSeconds = int64(pos.Played / time.Second)
	}
	httpx.WriteProtoJSON(w, http.StatusOK, summary(row))
}

// put creates the caller's trainer at the end of Oak's speech (New Game), replacing the
// one it had. A retry saves it again with a new trainer ID, as a new game would; the client
// keeps the answer it gets, so retries are safe.
func (h *Handler) put(w http.ResponseWriter, r *http.Request) {
	p, _ := auth.PrincipalFrom(r.Context())
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBody))
	if err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	var req trainerv1.NewTrainer
	if err := protojson.Unmarshal(body, &req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	gender, ok := genders[req.Gender]
	if !ok || !ValidName(req.Name) || !ValidName(req.RivalName) {
		http.Error(w, "invalid trainer", http.StatusUnprocessableEntity)
		return
	}
	// The trainer and its starting bag, saved together.
	var row db.PutTrainerRow
	err = pgx.BeginFunc(r.Context(), h.Pool, func(tx pgx.Tx) error {
		q := db.New(tx)
		var err error
		row, err = q.PutTrainer(r.Context(), db.PutTrainerParams{
			AccountID: p.AccountID,
			Name:      req.Name,
			Gender:    gender,
			RivalName: req.RivalName,
			MapID:     world.Start.Map,
			X:         int32(world.Start.X),
			Y:         int32(world.Start.Y),
			Facing:    live.FacingName(world.Start.Facing),
			// SetTrainerId(Random32()): a new ID every New Game.
			TrainerID: int64(rand.Uint32()),
		})
		if err != nil {
			return err
		}
		return item.Reset(r.Context(), q, p.AccountID)
	})
	if err != nil {
		h.Log.Error("put trainer", "err", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	// The old save's live position must not win over the new one; a connection still playing
	// it is disconnected on its next save. On failure the client retries the whole request.
	if err := h.Live.Clear(r.Context(), p.AccountID); err != nil {
		h.Log.Error("put trainer: clear live state", "err", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	httpx.WriteProtoJSON(w, http.StatusOK, summary(db.GetTrainerRow(row)))
}

var genders = map[trainerv1.Gender]string{
	trainerv1.Gender_GENDER_BOY:  "boy",
	trainerv1.Gender_GENDER_GIRL: "girl",
}

func summary(row db.GetTrainerRow) *trainerv1.TrainerSummary {
	g := trainerv1.Gender_GENDER_BOY
	if row.Gender == "girl" {
		g = trainerv1.Gender_GENDER_GIRL
	}
	return &trainerv1.TrainerSummary{
		Name:            row.Name,
		Gender:          g,
		PlayTimeSeconds: uint32(min(row.PlayTimeSeconds, int64(^uint32(0)))),
		// Badges arrive with the gyms (Phase 10).
		Badges:        0,
		PokedexCaught: pokedex.Load(row).CaughtCount(),
		Location:      &trainerv1.Location{Map: row.MapID, X: uint32(row.X), Y: uint32(row.Y)},
		IdNo:          uint32(row.TrainerID & 0xffff),
		Money:         uint32(row.Money),
		Options:       options(row),
	}
}
