package world

import (
	"context"
	"time"

	partyv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/party/v1"
	realtimev1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/realtime/v1"
	"pokeuniverse/mic-core/internal/db"
	"pokeuniverse/mic-core/internal/pokemon"
)

// OpenBox shows a box of BILL'S PC.
func (p *Player) OpenBox(m *partyv1.OpenBox) {
	p.zone.do(func() { p.zone.openBox(p, m) })
}

// openBox answers with the box, read when asked for: boxes aren't kept in memory like the party.
// The client waits for the answer.
func (z *zone) openBox(p *Player, m *partyv1.OpenBox) {
	if _, ok := z.players[p]; !ok {
		return
	}
	view := &partyv1.BoxView{}
	if p.atPC() && m.GetBox() <= pokemon.BoxCount {
		z.transact(p, func(ctx context.Context, q *db.Queries, save time.Time) error {
			read, err := pokemon.ViewBox(ctx, q, p.accountID, save, int(m.GetBox()))
			if err == nil {
				view = read
			}
			return err
		})
	}
	p.queue(&realtimev1.ServerMessage{Payload: &realtimev1.ServerMessage_BoxView{BoxView: view}})
}
