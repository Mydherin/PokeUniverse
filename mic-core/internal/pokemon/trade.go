package pokemon

import (
	"context"
	"errors"
	"fmt"
	"time"

	"pokeuniverse/mic-core/internal/db"
)

// Trades (phase-9 D22, D23): FireRed's rule on what can be offered, and the swap.

// ErrTradeChanged: a party no longer holds the Pokémon offered where it was offered.
var ErrTradeChanged = errors.New("pokemon: trade changed")

// CanOffer is trade.c's CanTradeSelectedMon and CheckValidityOfTradeMons: false when the
// Pokémon in the slot is the trainer's only one that can battle ("That's your only POKéMON for
// battle."). There are no Eggs yet; one would count as unable, and could be offered.
func (pt Party) CanOffer(slot int) bool {
	if pt.At(slot) == nil {
		return false
	}
	for i, p := range pt {
		if i != slot && p.HP > 0 {
			return true
		}
	}
	return false
}

// Same is whether two Pokémon are the same one (its personality, species and original trainer):
// how the swap checks the offer is still where it was.
func (p *Pokemon) Same(o *Pokemon) bool {
	return o != nil && p.Personality == o.Personality && p.Species == o.Species && p.OT.ID == o.OT.ID
}

// TradeSide is one trainer's part in a swap: their save, the slot offered and the Pokémon it held.
type TradeSide struct {
	AccountID int64
	Save      time.Time
	Slot      int
	Offered   *Pokemon
}

// Trade swaps the two offered Pokémon inside the caller's transaction, keyed by the trade's ID
// (D23): each received Pokémon takes the place of the one given, held item and all (D22). Both
// trainers are locked (in account order) and their parties read again, so the swap applies only
// while both still hold what they offered (ErrTradeChanged) and both keep a Pokémon that can
// battle. Applied already (the same ID), it changes nothing. It returns both parties as saved.
func Trade(ctx context.Context, q *db.Queries, id string, leader, member TradeSide) (Party, Party, error) {
	first, second := leader, member
	if second.AccountID < first.AccountID {
		first, second = second, first
	}
	for _, s := range []TradeSide{first, second} {
		if err := lock(ctx, q, s.AccountID, s.Save); err != nil {
			return nil, nil, err
		}
	}
	a, err := Load(ctx, q, leader.AccountID)
	if err != nil {
		return nil, nil, err
	}
	b, err := Load(ctx, q, member.AccountID)
	if err != nil {
		return nil, nil, err
	}
	n, err := q.InsertTrade(ctx, db.InsertTradeParams{ID: id, Leader: leader.AccountID, Member: member.AccountID,
		LeaderSlot: int16(leader.Slot), MemberSlot: int16(member.Slot)})
	if err != nil {
		return nil, nil, fmt.Errorf("save trade: %w", err)
	}
	if n == 0 {
		return a, b, nil // Applied already: the parties are its result.
	}
	if !leader.Offered.Same(a.At(leader.Slot)) || !member.Offered.Same(b.At(member.Slot)) ||
		!a.CanOffer(leader.Slot) || !b.CanOffer(member.Slot) {
		return nil, nil, ErrTradeChanged
	}
	a[leader.Slot], b[member.Slot] = b[member.Slot], a[leader.Slot]
	if err := Write(ctx, q, leader.AccountID, leader.Save, a); err != nil {
		return nil, nil, err
	}
	if err := Write(ctx, q, member.AccountID, member.Save, b); err != nil {
		return nil, nil, err
	}
	return a, b, nil
}
