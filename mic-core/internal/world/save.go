package world

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"

	"pokeuniverse/mic-core/internal/db"
	"pokeuniverse/mic-core/internal/item"
	"pokeuniverse/mic-core/internal/pokemon"
)

// saveTimeout bounds an action's PostgreSQL transaction, run in the zone's goroutine.
const saveTimeout = 2 * time.Second

// saveTrainer saves what an action changed of the trainer's items and party in one transaction
// (one action, one transaction), before it's shown. False when it couldn't be saved: the caller
// undoes the change.
func (z *zone) saveTrainer(p *Player, items item.Changed, party bool) bool {
	return z.transact(p, func(ctx context.Context, q *db.Queries, save time.Time) error {
		if items.Any() {
			if err := item.Write(ctx, q, p.accountID, save, p.items, items); err != nil {
				return err
			}
		}
		if party {
			return pokemon.Write(ctx, q, p.accountID, save, p.party)
		}
		return nil
	})
}

// transact runs one action's writes in one transaction. False (logged) when it failed.
func (z *zone) transact(p *Player, write func(context.Context, *db.Queries, time.Time) error) bool {
	ctx, cancel := context.WithTimeout(context.Background(), saveTimeout)
	defer cancel()
	save := time.UnixMicro(p.gen)
	err := pgx.BeginFunc(ctx, z.w.pool, func(tx pgx.Tx) error { return write(ctx, db.New(tx), save) })
	if err != nil {
		z.w.log.Error("save trainer", "account_id", p.accountID, "err", err)
		return false
	}
	return true
}

// savePokedex saves the trainer's Pokédex inside the caller's transaction.
func savePokedex(ctx context.Context, q *db.Queries, p *Player, save time.Time) error {
	n, err := q.UpdateTrainerPokedex(ctx, db.UpdateTrainerPokedexParams{AccountID: p.accountID, PokedexSeen: p.pokedex.Seen, PokedexCaught: p.pokedex.Caught, CreatedAt: save})
	if err == nil && n == 0 {
		err = pokemon.ErrStaleSave
	}
	return err
}
