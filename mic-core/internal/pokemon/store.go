package pokemon

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	itemv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/item/v1"
	movev1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/move/v1"
	pokemonv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/pokemon/v1"
	speciesv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/species/v1"
	trainerv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/trainer/v1"
	"pokeuniverse/mic-core/internal/db"
)

// ErrStaleSave: the trainer was replaced by a New Game; the old save's party is not saved.
var ErrStaleSave = errors.New("pokemon: stale save")

// Load reads the trainer's party.
func Load(ctx context.Context, q *db.Queries, accountID int64) (Party, error) {
	rows, err := q.ListTrainerPokemon(ctx, accountID)
	if err != nil {
		return nil, fmt.Errorf("load party: %w", err)
	}
	party := make(Party, 0, len(rows))
	for _, r := range rows {
		party = append(party, fromRow(r))
	}
	return party, nil
}

// Write saves the whole party inside the caller's transaction (one action, one transaction),
// only into the save it belongs to (`save`: the trainer's created_at).
func Write(ctx context.Context, q *db.Queries, accountID int64, save time.Time, party Party) error {
	if err := lock(ctx, q, accountID, save); err != nil {
		return err
	}
	if err := q.DeleteTrainerPokemon(ctx, accountID); err != nil {
		return fmt.Errorf("save party: %w", err)
	}
	return insert(ctx, q, accountID, party)
}

// Reset empties a New Game's party and boxes, inside New Game's transaction.
func Reset(ctx context.Context, q *db.Queries, accountID int64) error {
	if err := q.ResetTrainerPokemon(ctx, accountID); err != nil {
		return fmt.Errorf("reset party: %w", err)
	}
	if err := q.ResetTrainerBoxes(ctx, accountID); err != nil {
		return fmt.Errorf("reset boxes: %w", err)
	}
	return nil
}

// lock holds the trainer's row until the transaction ends; ErrStaleSave when it's another save now.
func lock(ctx context.Context, q *db.Queries, accountID int64, save time.Time) error {
	_, err := q.LockTrainerSave(ctx, db.LockTrainerSaveParams{AccountID: accountID, CreatedAt: save})
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrStaleSave
	}
	if err != nil {
		return fmt.Errorf("lock trainer: %w", err)
	}
	return nil
}

func insert(ctx context.Context, q *db.Queries, accountID int64, party Party) error {
	for slot, p := range party {
		if err := q.InsertTrainerPokemon(ctx, toRow(accountID, 0, slot, p)); err != nil {
			return fmt.Errorf("save party: %w", err)
		}
	}
	return nil
}

func toRow(accountID int64, box, slot int, p *Pokemon) db.InsertTrainerPokemonParams {
	moves, pp, ppUps := make([]int16, len(p.Moves)), make([]int16, len(p.Moves)), make([]int16, len(p.Moves))
	for i, m := range p.Moves {
		moves[i], pp[i], ppUps[i] = int16(m.ID), int16(m.PP), int16(m.PPUps)
	}
	return db.InsertTrainerPokemonParams{
		AccountID: accountID, Box: int16(box), Slot: int16(slot), Species: int16(p.Species), Nickname: p.Nickname,
		Level: int16(p.Level), Exp: int32(p.Exp), Personality: int64(p.Personality),
		Ivs: statsColumn(p.IVs), Evs: statsColumn(p.EVs), AbilitySlot: int16(p.AbilitySlot), HeldItem: int16(p.HeldItem),
		Moves: moves, Pp: pp, PpUps: ppUps, Hp: int16(p.HP), Status: int16(p.Status), Friendship: int16(p.Friendship),
		Ball: int16(p.Ball), OtName: p.OT.Name, OtID: int64(p.OT.ID), OtGender: genderColumn(p.OT.Gender),
		MetLevel: int16(p.MetLevel), MetMap: p.MetMap,
	}
}

func fromRow(r db.ListTrainerPokemonRow) *Pokemon {
	moves := make([]Move, len(r.Moves))
	for i := range r.Moves {
		moves[i] = Move{ID: movev1.Move(r.Moves[i]), PP: int(r.Pp[i]), PPUps: int(r.PpUps[i])}
	}
	return &Pokemon{
		Species: speciesv1.Species(r.Species), Nickname: r.Nickname, Level: int(r.Level), Exp: int(r.Exp),
		Personality: uint32(r.Personality), IVs: statsOf(r.Ivs), EVs: statsOf(r.Evs), AbilitySlot: int(r.AbilitySlot),
		HeldItem: itemv1.Item(r.HeldItem), Moves: moves, HP: int(r.Hp), Status: pokemonv1.Status(r.Status),
		Friendship: int(r.Friendship), Ball: itemv1.Item(r.Ball),
		OT:       Trainer{Name: r.OtName, ID: uint32(r.OtID), Gender: genderOf(r.OtGender)},
		MetLevel: int(r.MetLevel), MetMap: r.MetMap,
	}
}

func statsColumn(s Stats) []int16 {
	out := make([]int16, len(s))
	for i, v := range s {
		out[i] = int16(v)
	}
	return out
}

func statsOf(col []int16) Stats {
	var s Stats
	for i := range min(len(col), len(s)) {
		s[i] = int(col[i])
	}
	return s
}

// The trainers table's genders.
func genderColumn(g trainerv1.Gender) string {
	if g == trainerv1.Gender_GENDER_GIRL {
		return "girl"
	}
	return "boy"
}

func genderOf(col string) trainerv1.Gender {
	if col == "girl" {
		return trainerv1.Gender_GENDER_GIRL
	}
	return trainerv1.Gender_GENDER_BOY
}
