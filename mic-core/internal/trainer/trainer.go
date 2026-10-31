// Package trainer serves the player's trainer: the save the game's main menu continues from.
package trainer

import (
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	trainerv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/trainer/v1"
	"pokeuniverse/mic-core/internal/account"
	"pokeuniverse/mic-core/internal/auth"
	"pokeuniverse/mic-core/internal/db"
	"pokeuniverse/mic-core/internal/httpx"
)

// RateLimit wraps a handler with a per-IP limit.
type RateLimit func(name string, limit int, window time.Duration, next http.Handler) http.Handler

type Handler struct {
	Tokens *auth.Tokens
	Pool   *pgxpool.Pool
	Log    *slog.Logger
}

func (h *Handler) Register(mux *http.ServeMux, limit RateLimit) {
	mux.Handle("GET /api/trainer", limit("trainer", 60, time.Minute, h.Tokens.Require(account.DefaultRole, http.HandlerFunc(h.get))))
}

// get returns the caller's trainer, or 404 when the account has none yet (New Game creates it).
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
	gender := trainerv1.Gender_GENDER_BOY
	if row.Gender == "girl" {
		gender = trainerv1.Gender_GENDER_GIRL
	}
	httpx.WriteProtoJSON(w, http.StatusOK, &trainerv1.TrainerSummary{
		Name:            row.Name,
		Gender:          gender,
		PlayTimeSeconds: uint32(min(row.PlayTimeSeconds, int64(^uint32(0)))),
		// Badges arrive with the gyms (Phase 10); pokedex_caught stays unset until the Pokédex exists.
		Badges: 0,
	})
}
