package world

import (
	"cmp"
	"context"
	"errors"
	"time"

	itemv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/item/v1"
	partyv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/party/v1"
	realtimev1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/realtime/v1"
	"pokeuniverse/mic-core/internal/db"
	"pokeuniverse/mic-core/internal/item"
	"pokeuniverse/mic-core/internal/pokemon"
)

// OpenBox shows a box of BILL'S PC.
func (p *Player) OpenBox(request uint32, m *partyv1.OpenBox) {
	p.zone.do(func() {
		if _, ok := p.zone.players[p]; !ok {
			return
		}
		view := &partyv1.BoxView{}
		if p.atPC() && m.GetBox() <= pokemon.BoxCount {
			view = p.zone.viewBox(p, int(m.GetBox()))
		}
		view.Request = request
		p.queue(&realtimev1.ServerMessage{Payload: &realtimev1.ServerMessage_BoxView{BoxView: view}})
	})
}

// MovePokemon is WITHDRAW, DEPOSIT and MOVE's placing, SHIFT when `to` is taken.
func (p *Player) MovePokemon(request uint32, m *partyv1.MovePokemon) {
	from, to := place(m.GetFrom()), place(m.GetTo())
	shown := to.Box
	if to.Slot == pokemon.FirstFree && to.Box != 0 {
		shown = 0 // DEPOSIT: the box shown stays (the current one)
	} else if shown == 0 {
		shown = from.Box
	}
	p.zone.do(func() {
		p.zone.boxAction(p, request, shown, from.Box == 0 || to.Box == 0, func(ctx context.Context, q *db.Queries, save time.Time) (pokemon.Party, error) {
			return pokemon.MovePokemon(ctx, q, p.accountID, save, p.party, from, to)
		})
	})
}

// ReleasePokemon is RELEASE, after YES.
func (p *Player) ReleasePokemon(request uint32, m *partyv1.ReleasePokemon) {
	pl := place(m.GetPlace())
	p.zone.do(func() {
		p.zone.boxAction(p, request, pl.Box, pl.Box == 0, func(ctx context.Context, q *db.Queries, save time.Time) (pokemon.Party, error) {
			return pokemon.ReleasePokemon(ctx, q, p.accountID, save, p.party, pl)
		})
	})
}

// SetMarkings is MARK, once its menu closes with OK.
func (p *Player) SetMarkings(request uint32, m *partyv1.SetMarkings) {
	pl := place(m.GetPlace())
	p.zone.do(func() {
		p.zone.boxAction(p, request, pl.Box, pl.Box == 0, func(ctx context.Context, q *db.Queries, save time.Time) (pokemon.Party, error) {
			return pokemon.SetMarkings(ctx, q, p.accountID, save, p.party, pl, int(m.GetMarkings()))
		})
	})
}

// MoveHeldItem is ITEM mode's GIVE or SWITCH: the hand's item, still on `from`, put on `to`.
func (p *Player) MoveHeldItem(request uint32, m *partyv1.MoveHeldItem) {
	from, to := place(m.GetFrom()), place(m.GetTo())
	shown := cmp.Or(to.Box, from.Box)
	p.zone.do(func() {
		p.zone.boxAction(p, request, shown, from.Box == 0 || to.Box == 0, func(ctx context.Context, q *db.Queries, save time.Time) (pokemon.Party, error) {
			return pokemon.MoveHeldItem(ctx, q, p.accountID, save, p.party, from, to)
		})
	})
}

// StoreHeldItem is ITEM mode's BAG, or YES to CLOSE BOX while holding an item.
func (p *Player) StoreHeldItem(request uint32, m *partyv1.StoreHeldItem) {
	p.heldItemInBox(request, place(m.GetPlace()), func(s *item.State, held itemv1.Item) (item.Result, itemv1.Item) {
		if item.IsMail(held) {
			return item.Result{}, held
		}
		return item.TakeHeld(s, held)
	})
}

// GiveHeldItem is ITEM mode's GIVE from the bag.
func (p *Player) GiveHeldItem(request uint32, m *partyv1.GiveHeldItem) {
	p.heldItemInBox(request, place(m.GetPlace()), func(s *item.State, held itemv1.Item) (item.Result, itemv1.Item) {
		return item.Hold(s, m.GetItem(), false, held)
	})
}

// heldItemInBox runs one of item's held-item rules on the Pokémon at pl: refused unless it
// takes or gives the item.
func (p *Player) heldItemInBox(request uint32, pl pokemon.Place, rule func(*item.State, itemv1.Item) (item.Result, itemv1.Item)) {
	p.zone.do(func() {
		p.zone.boxItemAction(p, request, pl.Box, pl.Box == 0, func(ctx context.Context, q *db.Queries, save time.Time, s *item.State) (pokemon.Party, item.Changed, error) {
			var res item.Result
			party, err := pokemon.ChangeHeldItem(ctx, q, p.accountID, save, p.party, pl, func(held itemv1.Item) (itemv1.Item, error) {
				var next itemv1.Item
				res, next = rule(s, held)
				switch res.Outcome {
				case itemv1.ItemOutcome_ITEM_OUTCOME_TAKEN, itemv1.ItemOutcome_ITEM_OUTCOME_GIVEN, itemv1.ItemOutcome_ITEM_OUTCOME_SWAPPED:
					return next, nil
				}
				return held, pokemon.ErrRefused
			})
			return party, res.Changed, err
		})
	})
}

// RenameBox is the box options' NAME.
func (p *Player) RenameBox(request uint32, m *partyv1.RenameBox) {
	box := int(m.GetBox())
	p.zone.do(func() {
		p.zone.boxAction(p, request, box, false, func(ctx context.Context, q *db.Queries, save time.Time) (pokemon.Party, error) {
			if m.GetName() == "" {
				return p.party, pokemon.ErrRefused
			}
			return p.party, pokemon.SetBox(ctx, q, p.accountID, save, box, m.GetName(), -1)
		})
	})
}

// SetBoxWallpaper is the box options' WALLPAPER.
func (p *Player) SetBoxWallpaper(request uint32, m *partyv1.SetBoxWallpaper) {
	box := int(m.GetBox())
	p.zone.do(func() {
		p.zone.boxAction(p, request, box, false, func(ctx context.Context, q *db.Queries, save time.Time) (pokemon.Party, error) {
			return p.party, pokemon.SetBox(ctx, q, p.accountID, save, box, "", int(m.GetWallpaper()))
		})
	})
}

func place(m *partyv1.BoxPlace) pokemon.Place {
	return pokemon.Place{Box: int(m.GetBox()), Slot: int(m.GetSlot())}
}

// boxAction runs a storage action the client predicted, in one transaction with the box it
// answers with (`shown`, 0 for the current one), tagged with `request` (the asking seq). A
// refused or failed one changes nothing and the answer corrects the client: the box, and the
// party when the action touched it.
func (z *zone) boxAction(p *Player, request uint32, shown int, touchesParty bool, act func(context.Context, *db.Queries, time.Time) (pokemon.Party, error)) {
	z.boxItemAction(p, request, shown, touchesParty, func(ctx context.Context, q *db.Queries, save time.Time, _ *item.State) (pokemon.Party, item.Changed, error) {
		party, err := act(ctx, q, save)
		return party, item.Changed{}, err
	})
}

// boxItemAction is boxAction for an action that may also change the items: act gets a copy of
// them, and what it reports changed is saved in the same transaction and sent before the answer.
func (z *zone) boxItemAction(p *Player, request uint32, shown int, touchesParty bool, act func(context.Context, *db.Queries, time.Time, *item.State) (pokemon.Party, item.Changed, error)) {
	if _, ok := z.players[p]; !ok {
		return
	}
	view := &partyv1.BoxView{}
	if p.atPC() && shown >= 0 && shown <= pokemon.BoxCount {
		next, refused := p.party, false
		items, changed := p.items.Clone(), item.Changed{}
		saved := z.transact(p, func(ctx context.Context, q *db.Queries, save time.Time) error {
			party, ch, err := act(ctx, q, save, items)
			if errors.Is(err, pokemon.ErrRefused) {
				refused, err = true, nil
			} else if err == nil {
				next, changed = party, ch
			}
			if err == nil && changed.Any() {
				err = item.Write(ctx, q, p.accountID, save, items, changed)
			}
			if err != nil {
				return err
			}
			view, err = pokemon.ViewBox(ctx, q, p.accountID, save, shown)
			return err
		})
		if !saved {
			view = z.viewBox(p, shown)
		} else if touchesParty && !refused {
			// A changed party leaves nothing waiting from before: both are by slot.
			p.evolving = evolving{}
			p.party = next
		}
		if saved && changed.Any() {
			p.items = items
			z.sendChanged(p, changed)
		}
		if touchesParty {
			z.sendParty(p)
		}
	}
	view.Request = request
	p.queue(&realtimev1.ServerMessage{Payload: &realtimev1.ServerMessage_BoxView{BoxView: view}})
}

// viewBox reads a box in its own transaction; refused (box 0) when it can't be read.
func (z *zone) viewBox(p *Player, box int) *partyv1.BoxView {
	view := &partyv1.BoxView{}
	z.transact(p, func(ctx context.Context, q *db.Queries, save time.Time) error {
		read, err := pokemon.ViewBox(ctx, q, p.accountID, save, box)
		if err == nil {
			view = read
		}
		return err
	})
	return view
}
