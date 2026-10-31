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
		p.zone.itemAction(p, m.GetItem(), false, func(s *item.State, f item.Field) item.Result {
			f.FromField = m.GetField()
			return item.Use(s, m.GetItem(), f)
		})
	})
}

// GiveItem is GIVE from the bag, or from the PC's WITHDRAW screen.
func (p *Player) GiveItem(m *itemv1.GiveItem) {
	p.zone.do(func() {
		p.zone.itemAction(p, m.GetItem(), m.GetPc(), func(s *item.State, f item.Field) item.Result {
			if m.GetPc() {
				return item.GiveFromPC(s, m.GetItem(), f)
			}
			return item.Give(s, m.GetItem(), f)
		})
	})
}

// TossItem throws items away.
func (p *Player) TossItem(m *itemv1.TossItem) {
	p.zone.do(func() {
		p.zone.itemAction(p, m.GetItem(), false, func(s *item.State, _ item.Field) item.Result { return item.Toss(s, m.GetItem(), int(m.GetQuantity())) })
	})
}

// RegisterItem registers (or deselects) SELECT's item; the client already shows it.
func (p *Player) RegisterItem(m *itemv1.RegisterItem) {
	p.zone.do(func() {
		p.zone.itemChange(p, false, item.Changed{State: true}, func(s *item.State) bool { return s.Bag.Register(m.GetItem()) })
	})
}

// MoveItem moves an item within its pocket; the client already shows it.
func (p *Player) MoveItem(m *itemv1.MoveItem) {
	p.zone.do(func() {
		changed := item.Changed{Pockets: []itemv1.Pocket{m.GetPocket()}}
		p.zone.itemChange(p, false, changed, func(s *item.State) bool { return s.Bag.Move(m.GetPocket(), int(m.GetFrom()), int(m.GetTo())) })
	})
}

// WithdrawItem takes items out of the PC into the bag.
func (p *Player) WithdrawItem(m *itemv1.WithdrawItem) {
	p.zone.do(func() {
		p.zone.itemAction(p, m.GetItem(), true, func(s *item.State, _ item.Field) item.Result {
			return item.Withdraw(s, m.GetItem(), int(m.GetQuantity()))
		})
	})
}

// DepositItem stores items of the bag in the PC.
func (p *Player) DepositItem(m *itemv1.DepositItem) {
	p.zone.do(func() {
		p.zone.itemAction(p, m.GetItem(), true, func(s *item.State, _ item.Field) item.Result {
			return item.Deposit(s, m.GetItem(), int(m.GetQuantity()))
		})
	})
}

// MovePcItem moves a stored item within the PC; the client already shows it.
func (p *Player) MovePcItem(m *itemv1.MovePcItem) {
	p.zone.do(func() {
		p.zone.itemChange(p, true, item.Changed{PC: true}, func(s *item.State) bool { return s.PC.Move(int(m.GetFrom()), int(m.GetTo())) })
	})
}

// allowed is whether the player can act on their items now: PC actions only while the PC is
// on, the others only outside scripts.
func allowed(p *Player, atPC bool) bool {
	if atPC {
		return p.atPC()
	}
	return p.script == 0
}

// itemAction runs an action the client waits for: what changed is saved, then sent with the
// result (saved before shown). Nothing happens when the action isn't allowed now.
func (z *zone) itemAction(p *Player, id itemv1.Item, atPC bool, act func(*item.State, item.Field) item.Result) {
	if _, ok := z.players[p]; !ok {
		return
	}
	var res item.Result
	if allowed(p, atPC) {
		before := p.items.Clone()
		res = act(p.items, z.itemField(p))
		if res.Any() && !z.saveItems(p, res.Changed) {
			p.items, res = before, item.Result{}
		}
	}
	z.sendChanged(p, res.Changed)
	p.queue(&realtimev1.ServerMessage{Payload: &realtimev1.ServerMessage_ItemResult{ItemResult: &itemv1.ItemResult{
		Outcome: res.Outcome, Item: id, Value: uint32(res.Value),
	}}})
}

// itemChange runs a change the client predicted: saved when done, corrected (what it would have
// changed sent again) when refused.
func (z *zone) itemChange(p *Player, atPC bool, changed item.Changed, change func(*item.State) bool) {
	if _, ok := z.players[p]; !ok {
		return
	}
	before := p.items.Clone()
	if !allowed(p, atPC) || !change(p.items) || !z.saveItems(p, changed) {
		p.items = before
		z.sendChanged(p, changed)
	}
}

func (z *zone) saveItems(p *Player, changed item.Changed) bool {
	ctx, cancel := context.WithTimeout(context.Background(), itemSaveTimeout)
	defer cancel()
	if err := item.Save(ctx, z.w.pool, p.accountID, time.UnixMicro(p.gen), p.items, changed); err != nil {
		z.w.log.Error("save items", "account_id", p.accountID, "err", err)
		return false
	}
	return true
}

// sendChanged sends what an action changed: the PC, and the bag's pockets with its registered
// item (part of the state besides the pockets).
func (z *zone) sendChanged(p *Player, changed item.Changed) {
	if changed.PC {
		p.queue(&realtimev1.ServerMessage{Payload: &realtimev1.ServerMessage_PcChanged{PcChanged: &itemv1.PcChanged{Slots: p.items.PC.Proto()}}})
	}
	if len(changed.Pockets) == 0 && !changed.State {
		return
	}
	msg := &itemv1.BagChanged{Registered: p.items.Bag.Registered}
	for _, pocket := range changed.Pockets {
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
