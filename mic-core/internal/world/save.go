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
	ctx, cancel := context.WithTimeout(context.Background(), saveTimeout)
	defer cancel()
	save := time.UnixMicro(p.gen)
	err := pgx.BeginFunc(ctx, z.w.pool, func(tx pgx.Tx) error {
		q := db.New(tx)
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
	if err != nil {
		z.w.log.Error("save trainer", "account_id", p.accountID, "err", err)
		return false
	}
	return true
}
