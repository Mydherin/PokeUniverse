package battle

import (
	"context"
	"fmt"
	"log/slog"

	battlev1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/battle/v1"
	itemv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/item/v1"
	pokemonv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/pokemon/v1"
	"pokeuniverse/mic-core/internal/db"
	"pokeuniverse/mic-core/internal/item"
	"pokeuniverse/mic-core/internal/pokemon"
)

// MaxMoney is FireRed's most money (MAX_MONEY).
const MaxMoney = 999999

// whiteOutMultipliers: sWhiteOutMoneyLossMultipliers, by badges.
var whiteOutMultipliers = [...]int{2, 4, 6, 9, 12, 16, 20, 25, 30}

// Apply changes the party by its side's outcome (D14): experience and EVs are gained, HP (with
// what levelling up raised, D24), moves, PP and status stay. Badly poisoned becomes poisoned. A
// held item used up (a berry, a herb) is gone; any other change (knocked off, stolen, swapped by
// Trick) is undone, as in Gen 4. The party is in the order the battle started with: it can't
// change during a battle.
func Apply(party pokemon.Party, o *battlev1.SideOutcome) {
	for i, out := range o.GetPokemon() {
		p := party.At(i)
		if p == nil {
			continue
		}
		ev := out.GetEvs()
		p.Gain(int(out.GetExp()), pokemon.Stats{int(ev.GetHp()), int(ev.GetAttack()), int(ev.GetDefense()),
			int(ev.GetSpeed()), int(ev.GetSpAttack()), int(ev.GetSpDefense())})
		p.HP = min(int(out.GetHp()), p.Stats()[0])
		p.Status = out.GetStatus()
		if p.Status == pokemonv1.Status_STATUS_TOXIC {
			p.Status = pokemonv1.Status_STATUS_POISON
		}
		if !p.ApplyMoves(out.GetMoves(), out.GetPp()) {
			slog.Warn("battle outcome: move not learnable", "species", p.Species, "level", p.Level, "moves", out.GetMoves())
		}
		if out.GetHeldItem() == itemv1.Item_ITEM_UNSPECIFIED && usedUp(p.HeldItem) {
			p.HeldItem = itemv1.Item_ITEM_UNSPECIFIED
		}
	}
}

// usedUp is whether holding the item can use it up: berries and FireRed's herbs.
func usedUp(id itemv1.Item) bool {
	if info, ok := item.Info(id); ok && info.GetPocket() == itemv1.Pocket_POCKET_BERRY_POUCH {
		return true
	}
	return id == itemv1.Item_ITEM_WHITE_HERB || id == itemv1.Item_ITEM_MENTAL_HERB
}

// WhiteOutLoss is ComputeWhiteOutMoneyLoss: highest level × 4 × the badges' multiplier, at
// most the money there is. Badges come with the story flags (Phase 10): none until then.
func WhiteOutLoss(party pokemon.Party, money int) int {
	const badges = 0
	return min(party.HighestLevel()*4*whiteOutMultipliers[badges], money)
}

// Record marks the battle's outcome applied, inside its transaction. False when it already was.
func Record(ctx context.Context, q *db.Queries, accountID int64, battleID string, result battlev1.BattleResult, money int) (bool, error) {
	id, err := uuid(battleID)
	if err != nil {
		return false, fmt.Errorf("record outcome: %w", err)
	}
	n, err := q.InsertBattleOutcome(ctx, db.InsertBattleOutcomeParams{BattleID: id, AccountID: accountID, Result: int16(result), Money: int32(money)})
	if err != nil {
		return false, fmt.Errorf("record outcome: %w", err)
	}
	return n == 1, nil
}

// Applied is whether the battle's outcome was applied.
func Applied(ctx context.Context, q *db.Queries, battleID string) (bool, error) {
	id, err := uuid(battleID)
	if err != nil {
		return false, err
	}
	return q.BattleOutcomeApplied(ctx, id)
}
