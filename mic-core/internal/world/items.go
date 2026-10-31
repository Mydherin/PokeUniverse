package world

import (
	"context"
	"time"

	itemv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/item/v1"
	mapv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/map/v1"
	realtimev1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/realtime/v1"
	"pokeuniverse/mic-core/internal/item"
)

// itemSaveTimeout bounds an item action's PostgreSQL transaction, run in the zone's goroutine.
const itemSaveTimeout = 2 * time.Second

// UseItem is USE from the bag, or the registered item with SELECT on the field.
func (p *Player) UseItem(m *itemv1.UseItem) {
	p.zone.do(func() {
		p.zone.itemAction(p, m.GetItem(), func(s *item.State, f item.Field) item.Result {
			f.FromField = m.GetField()
			return item.Use(s, m.GetItem(), f)
		})
	})
}

// GiveItem is GIVE from the bag.
func (p *Player) GiveItem(m *itemv1.GiveItem) {
	p.zone.do(func() {
		p.zone.itemAction(p, m.GetItem(), func(s *item.State, f item.Field) item.Result { return item.Give(s, m.GetItem(), f) })
	})
}

// TossItem throws items away.
func (p *Player) TossItem(m *itemv1.TossItem) {
	p.zone.do(func() {
		p.zone.itemAction(p, m.GetItem(), func(s *item.State, _ item.Field) item.Result { return item.Toss(s, m.GetItem(), int(m.GetQuantity())) })
	})
}

// RegisterItem registers (or deselects) SELECT's item; the client already shows it.
func (p *Player) RegisterItem(m *itemv1.RegisterItem) {
	p.zone.do(func() {
		p.zone.itemChange(p, nil, func(s *item.State) bool { return s.Bag.Register(m.GetItem()) })
	})
}

// MoveItem moves an item within its pocket; the client already shows it.
func (p *Player) MoveItem(m *itemv1.MoveItem) {
	p.zone.do(func() {
		pockets := []itemv1.Pocket{m.GetPocket()}
		p.zone.itemChange(p, pockets, func(s *item.State) bool { return s.Bag.Move(m.GetPocket(), int(m.GetFrom()), int(m.GetTo())) })
	})
}

// itemAction runs an action the client waits for: what changed is saved, then the changed
// pockets and the result are sent (saved before shown). Nothing happens during a script.
func (z *zone) itemAction(p *Player, id itemv1.Item, act func(*item.State, item.Field) item.Result) {
	if _, ok := z.players[p]; !ok {
		return
	}
	var res item.Result
	if p.script == 0 {
		before := p.items.Clone()
		res = act(p.items, z.itemField(p))
		if (len(res.Pockets) > 0 || res.StateChanged) && !z.saveItems(p, res.Pockets) {
			p.items, res = before, item.Result{}
		}
	}
	if len(res.Pockets) > 0 {
		z.sendBag(p, res.Pockets)
	}
	p.queue(&realtimev1.ServerMessage{Payload: &realtimev1.ServerMessage_ItemResult{ItemResult: &itemv1.ItemResult{
		Outcome: res.Outcome, Item: id, Value: uint32(res.Value),
	}}})
}

// itemChange runs a change the client predicted: saved when done, corrected when refused.
func (z *zone) itemChange(p *Player, pockets []itemv1.Pocket, change func(*item.State) bool) {
	if _, ok := z.players[p]; !ok {
		return
	}
	before := p.items.Clone()
	if !change(p.items) || !z.saveItems(p, pockets) {
		p.items = before
		z.sendBag(p, pockets)
	}
}

func (z *zone) saveItems(p *Player, pockets []itemv1.Pocket) bool {
	ctx, cancel := context.WithTimeout(context.Background(), itemSaveTimeout)
	defer cancel()
	if err := item.Save(ctx, z.w.pool, p.accountID, time.UnixMicro(p.gen), p.items, pockets); err != nil {
		z.w.log.Error("save items", "account_id", p.accountID, "err", err)
		return false
	}
	return true
}

func (z *zone) sendBag(p *Player, pockets []itemv1.Pocket) {
	msg := &itemv1.BagChanged{Registered: p.items.Bag.Registered}
	for _, pocket := range pockets {
		msg.Pockets = append(msg.Pockets, p.items.Bag.PocketProto(pocket))
	}
	p.queue(&realtimev1.ServerMessage{Payload: &realtimev1.ServerMessage_BagChanged{BagChanged: msg}})
}

// fishable is water a rod can fish in (FireRed's surfable water, not waterfalls).
var fishable = map[mapv1.TileBehavior]bool{
	mapv1.TileBehavior_TILE_BEHAVIOR_POND_WATER:         true,
	mapv1.TileBehavior_TILE_BEHAVIOR_FAST_WATER:         true,
	mapv1.TileBehavior_TILE_BEHAVIOR_OCEAN_WATER:        true,
	mapv1.TileBehavior_TILE_BEHAVIOR_CYCLING_ROAD_WATER: true,
}

// landElevation is where a player walks beside water (water is elevation 1).
const landElevation = 3

// itemField is what items depend on around the player. No party until Phase 8.
func (z *zone) itemField(p *Player) item.Field {
	ahead := p.pos.Step(p.facing)
	return item.Field{
		MapType:       z.m.Type,
		AllowCycling:  z.m.AllowCycling,
		AllowEscaping: z.m.AllowEscaping,
		// IsPlayerFacingSurfableFishableWater: water ahead, below the land the player stands on.
		FacingWater:    fishable[z.m.Behavior(ahead)] && p.elevation == landElevation && elevationMismatch(p.elevation, z.m.Elevation(ahead)),
		HiddenItemNear: z.m.HiddenItemNear(p.pos),
	}
}
