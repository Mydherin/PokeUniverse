package world

import (
	"context"
	"errors"
	"time"

	partyv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/party/v1"
	realtimev1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/realtime/v1"
	"pokeuniverse/mic-core/internal/db"
	"pokeuniverse/mic-core/internal/pokemon"
)

// OpenBox shows a box of BILL'S PC.
func (p *Player) OpenBox(m *partyv1.OpenBox) {
	p.zone.do(func() {
		if _, ok := p.zone.players[p]; !ok {
			return
		}
		view := &partyv1.BoxView{}
		if p.atPC() && m.GetBox() <= pokemon.BoxCount {
			view = p.zone.viewBox(p, int(m.GetBox()))
		}
		p.queue(&realtimev1.ServerMessage{Payload: &realtimev1.ServerMessage_BoxView{BoxView: view}})
	})
}

// MovePokemon is WITHDRAW, DEPOSIT and MOVE's placing, SHIFT when `to` is taken.
func (p *Player) MovePokemon(m *partyv1.MovePokemon) {
	from, to := place(m.GetFrom()), place(m.GetTo())
	shown := to.Box
	if shown == 0 {
		shown = from.Box
	}
	p.zone.do(func() {
		p.zone.boxAction(p, shown, from.Box == 0 || to.Box == 0, func(ctx context.Context, q *db.Queries, save time.Time) (pokemon.Party, error) {
			return pokemon.MovePokemon(ctx, q, p.accountID, save, p.party, from, to)
		})
	})
}

// ReleasePokemon is RELEASE, after YES.
func (p *Player) ReleasePokemon(m *partyv1.ReleasePokemon) {
	pl := place(m.GetPlace())
	p.zone.do(func() {
		p.zone.boxAction(p, pl.Box, pl.Box == 0, func(ctx context.Context, q *db.Queries, save time.Time) (pokemon.Party, error) {
			return pokemon.ReleasePokemon(ctx, q, p.accountID, save, p.party, pl)
		})
	})
}

// RenameBox is the box options' NAME.
func (p *Player) RenameBox(m *partyv1.RenameBox) {
	box := int(m.GetBox())
	p.zone.do(func() {
		p.zone.boxAction(p, box, false, func(ctx context.Context, q *db.Queries, save time.Time) (pokemon.Party, error) {
			if m.GetName() == "" {
				return p.party, pokemon.ErrRefused
			}
			return p.party, pokemon.SetBox(ctx, q, p.accountID, save, box, m.GetName(), -1)
		})
	})
}

// SetBoxWallpaper is the box options' WALLPAPER.
func (p *Player) SetBoxWallpaper(m *partyv1.SetBoxWallpaper) {
	box := int(m.GetBox())
	p.zone.do(func() {
		p.zone.boxAction(p, box, false, func(ctx context.Context, q *db.Queries, save time.Time) (pokemon.Party, error) {
			return p.party, pokemon.SetBox(ctx, q, p.accountID, save, box, "", int(m.GetWallpaper()))
		})
	})
}

func place(m *partyv1.BoxPlace) pokemon.Place {
	return pokemon.Place{Box: int(m.GetBox()), Slot: int(m.GetSlot())}
}

// boxAction runs a storage action the client predicted, in one transaction with the box it
// answers with (`shown`, 0 for the current one). A refused or failed one changes nothing and
// the answer corrects the client: the box, and the party when the action touched it.
func (z *zone) boxAction(p *Player, shown int, touchesParty bool, act func(context.Context, *db.Queries, time.Time) (pokemon.Party, error)) {
	if _, ok := z.players[p]; !ok {
		return
	}
	view := &partyv1.BoxView{}
	if p.atPC() && shown >= 0 && shown <= pokemon.BoxCount {
		next, refused := p.party, false
		saved := z.transact(p, func(ctx context.Context, q *db.Queries, save time.Time) error {
			party, err := act(ctx, q, save)
			if errors.Is(err, pokemon.ErrRefused) {
				refused, err = true, nil
			} else if err == nil {
				next = party
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
		if touchesParty {
			z.sendParty(p)
		}
	}
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
