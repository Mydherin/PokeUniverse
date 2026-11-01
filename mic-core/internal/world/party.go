package world

import (
	itemv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/item/v1"
	partyv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/party/v1"
	realtimev1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/realtime/v1"
	"pokeuniverse/mic-core/internal/item"
	"pokeuniverse/mic-core/internal/pokemon"
)

// SwapPartySlots is SWITCH in the party menu; the client already shows it.
func (p *Player) SwapPartySlots(m *partyv1.SwapPartySlots) {
	p.zone.do(func() {
		p.zone.partyChange(p, func(party pokemon.Party) bool { return party.Swap(int(m.GetFrom()), int(m.GetTo())) })
	})
}

// SwapPokemonMoves is SWITCH on the summary's move page; the client already shows it.
func (p *Player) SwapPokemonMoves(m *partyv1.SwapPokemonMoves) {
	p.zone.do(func() {
		p.zone.partyChange(p, func(party pokemon.Party) bool {
			return party.SwapMoves(int(m.GetSlot()), int(m.GetFrom()), int(m.GetTo()))
		})
	})
}

// GivePartyItem gives a party Pokémon an item to hold, from the bag or (while the PC is on) the PC.
func (p *Player) GivePartyItem(m *partyv1.GivePartyItem) {
	p.zone.do(func() {
		p.zone.heldItemAction(p, int(m.GetSlot()), m.GetPc(), func(s *item.State, mon *pokemon.Pokemon) (item.Result, itemv1.Item) {
			res, held := item.Hold(s, m.GetItem(), m.GetPc(), mon.HeldItem)
			mon.HeldItem = held
			return res, m.GetItem()
		})
	})
}

// TakePartyItem takes a party Pokémon's held item into the bag.
func (p *Player) TakePartyItem(m *partyv1.TakePartyItem) {
	p.zone.do(func() {
		p.zone.heldItemAction(p, int(m.GetSlot()), false, func(s *item.State, mon *pokemon.Pokemon) (item.Result, itemv1.Item) {
			taken := mon.HeldItem
			res, held := item.TakeHeld(s, taken)
			mon.HeldItem = held
			return res, taken
		})
	})
}

// partyChange runs a change the client predicted: saved when done, corrected (the party sent
// again) when refused.
func (z *zone) partyChange(p *Player, change func(pokemon.Party) bool) {
	if _, ok := z.players[p]; !ok {
		return
	}
	before := p.party.Clone()
	if p.script != 0 || !change(p.party) || !z.saveTrainer(p, item.Changed{}, true) {
		p.party = before
		z.sendParty(p)
	}
}

// heldItemAction runs a held-item action on the party Pokémon in `slot`, which the client waits
// for: what changed is saved, then sent with the result reporting the item `act` names (saved
// before shown). Nothing happens when the action isn't allowed now or the slot is empty.
func (z *zone) heldItemAction(p *Player, slot int, atPC bool, act func(*item.State, *pokemon.Pokemon) (item.Result, itemv1.Item)) {
	if _, ok := z.players[p]; !ok {
		return
	}
	var res item.Result
	var reported itemv1.Item
	if mon := p.party.At(slot); mon != nil && allowed(p, atPC) {
		items, party, held := p.items.Clone(), p.party.Clone(), mon.HeldItem
		res, reported = act(p.items, mon)
		partyChanged := mon.HeldItem != held
		if (res.Any() || partyChanged) && !z.saveTrainer(p, res.Changed, partyChanged) {
			p.items, p.party, res, partyChanged = items, party, item.Result{}, false
		}
		if partyChanged {
			z.sendParty(p)
		}
	}
	z.sendChanged(p, res.Changed)
	p.queue(&realtimev1.ServerMessage{Payload: &realtimev1.ServerMessage_ItemResult{ItemResult: &itemv1.ItemResult{
		Outcome: res.Outcome, Item: reported, Value: uint32(res.Value),
	}}})
}

func (z *zone) sendParty(p *Player) {
	p.queue(&realtimev1.ServerMessage{Payload: &realtimev1.ServerMessage_PartyChanged{PartyChanged: &partyv1.PartyChanged{Party: p.party.Proto()}}})
}
