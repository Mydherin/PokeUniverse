// Package trainer serves the player's trainer: the save the game's main menu continues from,
// created by New Game.
package trainer

import (
	"errors"
	"io"
	"log/slog"
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
	mux.Handle("PUT /api/trainer", limit("trainer-put", 20, time.Minute, h.Tokens.Require(account.DefaultRole, http.HandlerFunc(h.put))))
}

// maxBody bounds a NewTrainer request: two short names and a gender.
const maxBody = 1 << 10

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
	httpx.WriteProtoJSON(w, http.StatusOK, summary(row.Name, row.Gender, row.PlayTimeSeconds))
}

// put creates the caller's trainer at the end of Oak's speech (New Game), replacing the
// one it had. Saving the same trainer twice gives the same result, so retries are safe.
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
	row, err := db.New(h.Pool).PutTrainer(r.Context(), db.PutTrainerParams{
		AccountID: p.AccountID,
		Name:      req.Name,
		Gender:    gender,
		RivalName: req.RivalName,
	})
	if err != nil {
		h.Log.Error("put trainer", "err", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	httpx.WriteProtoJSON(w, http.StatusOK, summary(row.Name, row.Gender, row.PlayTimeSeconds))
}

var genders = map[trainerv1.Gender]string{
	trainerv1.Gender_GENDER_BOY:  "boy",
	trainerv1.Gender_GENDER_GIRL: "girl",
}

func summary(name, gender string, playTime int64) *trainerv1.TrainerSummary {
	g := trainerv1.Gender_GENDER_BOY
	if gender == "girl" {
		g = trainerv1.Gender_GENDER_GIRL
	}
	return &trainerv1.TrainerSummary{
		Name:            name,
		Gender:          g,
		PlayTimeSeconds: uint32(min(playTime, int64(^uint32(0)))),
		// Badges arrive with the gyms (Phase 10); pokedex_caught stays unset until the Pokédex exists.
		Badges: 0,
	}
}
