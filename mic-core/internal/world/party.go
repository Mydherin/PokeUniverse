package world

import (
	"context"
	"slices"
	"time"

	itemv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/item/v1"
	movev1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/move/v1"
	partyv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/party/v1"
	pokedexv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/pokedex/v1"
	realtimev1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/realtime/v1"
	speciesv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/species/v1"
	"pokeuniverse/mic-core/internal/db"
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

// UsePartyItem is USE on a party Pokémon, from the bag or the BERRY POUCH.
func (p *Player) UsePartyItem(m *partyv1.UsePartyItem) {
	p.zone.do(func() { p.zone.usePartyItem(p, m) })
}

// usePartyItem applies the item and spends it, all saved or nothing (phase-6 D3). The client waits
// for the answer: what changed, then the result.
func (z *zone) usePartyItem(p *Player, m *partyv1.UsePartyItem) {
	if _, ok := z.players[p]; !ok {
		return
	}
	res := item.Result{Outcome: itemv1.ItemOutcome_ITEM_OUTCOME_NO_EFFECT}
	id, slot := m.GetItem(), int(m.GetSlot())
	var growth *itemv1.ItemGrowth
	dex := p.pokedex
	if effect, ok := item.PokemonEffect(p.items, id); ok && !p.busy() {
		items, party := p.items.Clone(), p.party.Clone()
		closeness := p.party.ItemSceneCloseness(slot)
		info, _ := item.Info(id)
		var pending *speciesv1.Evolution
		worked := false
		switch info.GetFieldUse() {
		case itemv1.FieldUse_FIELD_USE_RARE_CANDY:
			worked, growth, pending = z.useRareCandy(p, slot)
		case itemv1.FieldUse_FIELD_USE_EVOLUTION_ITEM:
			evo := p.party.ItemEvolution(slot, id)
			switch {
			case evo == nil:
			case !pokemon.CanEvolve(evo, p.pokedex.National):
				res = item.Result{Outcome: itemv1.ItemOutcome_ITEM_OUTCOME_CANT_EVOLVE, Value: closeness}
			default:
				worked, growth = true, z.useEvolutionItem(p, slot, evo)
			}
		case itemv1.FieldUse_FIELD_USE_TM_HM:
			worked = p.party.TeachMachineMove(slot, info.GetMove(), int(m.GetMoveSlot()), effect, z.m.ID)
		default:
			worked = p.party.UseItem(effect, slot, int(m.GetMoveSlot()), z.m.ID)
		}
		if worked {
			res = item.SpendOnPokemon(p.items, id)
			res.Value = closeness
			if z.savePartyItem(p, res.Changed, !p.pokedex.Same(dex)) {
				z.sendParty(p)
				if !p.pokedex.Same(dex) {
					z.sendPokedex(p)
				}
				p.evolving = evolving{}
				if growth != nil {
					p.evolving.toLearn = map[int][]movev1.Move{slot: growth.GetToLearn()}
				}
				p.evolving.offer(slot, pending)
			} else {
				p.items, p.party, p.pokedex = items, party, dex
				res, growth = item.Result{Outcome: itemv1.ItemOutcome_ITEM_OUTCOME_NO_EFFECT}, nil
			}
		}
	}
	z.sendChanged(p, res.Changed)
	p.queue(&realtimev1.ServerMessage{Payload: &realtimev1.ServerMessage_ItemResult{ItemResult: &itemv1.ItemResult{
		Outcome: res.Outcome, Item: id, Value: uint32(res.Value), Growth: growth,
	}}})
}

// UseFieldMove is a field move from a party Pokémon's menu.
func (p *Player) UseFieldMove(m *partyv1.UseFieldMove) {
	p.zone.do(func() { p.zone.useFieldMove(p, m) })
}

// useFieldMove answers whether the move can be used; HP it moves is saved before it's shown
// (phase-6 D3). The client waits for the answer.
func (z *zone) useFieldMove(p *Player, m *partyv1.UseFieldMove) {
	if _, ok := z.players[p]; !ok {
		return
	}
	outcome := partyv1.FieldMoveOutcome_FIELD_MOVE_OUTCOME_CANT_USE_HERE
	if !p.busy() {
		before := p.party.Clone()
		outcome = p.party.UseFieldMove(int(m.GetSlot()), m.GetMove(), m.Target)
		if outcome == partyv1.FieldMoveOutcome_FIELD_MOVE_OUTCOME_HP_SHARED {
			if z.saveTrainer(p, item.Changed{}, true) {
				z.sendParty(p)
			} else {
				p.party = before
				outcome = partyv1.FieldMoveOutcome_FIELD_MOVE_OUTCOME_CANT_USE_HERE
			}
		}
	}
	p.queue(&realtimev1.ServerMessage{Payload: &realtimev1.ServerMessage_FieldMoveResult{FieldMoveResult: &partyv1.FieldMoveResult{Outcome: outcome}}})
	if outcome == partyv1.FieldMoveOutcome_FIELD_MOVE_OUTCOME_SWEET_SCENT {
		z.sweetScent(p)
	}
}

// useRareCandy raises the level; what to learn and who it may evolve into come with the answer.
func (z *zone) useRareCandy(p *Player, slot int) (bool, *itemv1.ItemGrowth, *speciesv1.Evolution) {
	learned, toLearn, ok := p.party.RareCandy(slot, z.m.ID)
	if !ok {
		return false, nil, nil
	}
	growth := &itemv1.ItemGrowth{Learned: learned, ToLearn: toLearn}
	evo := p.party.LevelEvolution(slot, night(time.Now()))
	if evo != nil {
		growth.EvolvesTo = speciesv1.Species(evo.GetSpecies())
	}
	return true, growth, evo
}

// useEvolutionItem evolves it at once, saved with the item it spends, since its scene can't be
// stopped (BeginEvolutionScene with canStopEvo FALSE): the client only shows it.
func (z *zone) useEvolutionItem(p *Player, slot int, evo *speciesv1.Evolution) *itemv1.ItemGrowth {
	from := p.party.At(slot).Species
	done := p.party.Evolve(slot, evo, false)
	p.pokedex = p.pokedex.Catch(done.Species...)
	return &itemv1.ItemGrowth{Learned: done.Learned, ToLearn: done.ToLearn, EvolvedFrom: from}
}

// savePartyItem saves the bag and the party, and the Pokédex when it changed, in one transaction.
func (z *zone) savePartyItem(p *Player, changed item.Changed, dex bool) bool {
	return z.transact(p, func(ctx context.Context, q *db.Queries, save time.Time) error {
		if changed.Any() {
			if err := item.Write(ctx, q, p.accountID, save, p.items, changed); err != nil {
				return err
			}
		}
		if err := pokemon.Write(ctx, q, p.accountID, save, p.party); err != nil {
			return err
		}
		if dex {
			return savePokedex(ctx, q, p, save)
		}
		return nil
	})
}

// partyChange runs a change the client predicted: saved when done, corrected (the party sent
// again) when refused.
func (z *zone) partyChange(p *Player, change func(pokemon.Party) bool) {
	if _, ok := z.players[p]; !ok {
		return
	}
	// A changed party leaves nothing waiting from before: both are by slot.
	p.evolving = evolving{}
	before := p.party.Clone()
	if p.busy() || !change(p.party) || !z.saveTrainer(p, item.Changed{}, true) {
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

// evolving is what a won battle left: who may evolve, then the moves each one may still learn.
type evolving struct {
	pending map[int]*speciesv1.Evolution
	toLearn map[int][]movev1.Move
}

// offer sets who the slot may evolve into; nil for no one.
func (e *evolving) offer(slot int, evo *speciesv1.Evolution) {
	if evo == nil {
		delete(e.pending, slot)
		return
	}
	if e.pending == nil {
		e.pending = map[int]*speciesv1.Evolution{}
	}
	e.pending[slot] = evo
}

func (e evolving) proto() []*partyv1.PendingEvolution {
	var out []*partyv1.PendingEvolution
	for slot := range pokemon.PartySize {
		if evo := e.pending[slot]; evo != nil {
			out = append(out, &partyv1.PendingEvolution{Slot: uint32(slot), Species: speciesv1.Species(evo.GetSpecies())})
		}
	}
	return out
}

// night is Gen 4's clock, by the server's: 20:00 to 03:59.
func night(t time.Time) bool { return t.Hour() >= 20 || t.Hour() < 4 }

// EvolvePokemon: the scene wasn't stopped. It can only do what the battle's end or a RARE CANDY offered.
func (p *Player) EvolvePokemon(m *partyv1.EvolvePokemon) {
	p.zone.do(func() { p.zone.evolve(p, int(m.GetSlot())) })
}

// LearnMove: one of the moves an evolution offered replaces another.
func (p *Player) LearnMove(m *partyv1.LearnMove) {
	p.zone.do(func() { p.zone.learnMove(p, int(m.GetSlot()), m.GetMove(), int(m.GetForgetSlot())) })
}

// evolve saves the evolution with what comes with it (the Pokédex, Shedinja and the ball it
// takes) in one transaction, then shows it. The client waits for the answer, so a refusal or a
// failed save answers too.
func (z *zone) evolve(p *Player, slot int) {
	evo := p.evolving.pending[slot]
	if _, ok := z.players[p]; !ok || evo == nil || p.battle != nil {
		return
	}
	delete(p.evolving.pending, slot)
	party, items, dex := p.party.Clone(), p.items.Clone(), p.pokedex
	done := pokemon.Evolved{}
	if pokemon.CanEvolve(evo, p.pokedex.National) {
		done = p.party.Evolve(slot, evo, p.items.Bag.Quantity(itemv1.Item_ITEM_POKE_BALL) > 0)
	}
	var changed item.Changed
	if done.Shed != nil && p.items.Bag.Remove(itemv1.Item_ITEM_POKE_BALL, 1) {
		info, _ := item.Info(itemv1.Item_ITEM_POKE_BALL)
		changed.Pockets = []itemv1.Pocket{info.GetPocket()}
	}
	p.pokedex = p.pokedex.Catch(done.Species...)
	if len(done.Species) == 0 || !z.transact(p, func(ctx context.Context, q *db.Queries, save time.Time) error {
		if changed.Any() {
			if err := item.Write(ctx, q, p.accountID, save, p.items, changed); err != nil {
				return err
			}
		}
		if err := pokemon.Write(ctx, q, p.accountID, save, p.party); err != nil {
			return err
		}
		return savePokedex(ctx, q, p, save)
	}) {
		p.party, p.items, p.pokedex = party, items, dex
		z.sendParty(p)
		p.queue(&realtimev1.ServerMessage{Payload: &realtimev1.ServerMessage_PokemonEvolved{PokemonEvolved: &partyv1.PokemonEvolved{Slot: uint32(slot), Failed: true}}})
		return
	}
	if p.evolving.toLearn == nil {
		p.evolving.toLearn = map[int][]movev1.Move{}
	}
	p.evolving.toLearn[slot] = done.ToLearn
	z.sendChanged(p, changed)
	z.sendParty(p)
	if !p.pokedex.Same(dex) {
		z.sendPokedex(p)
	}
	p.queue(&realtimev1.ServerMessage{Payload: &realtimev1.ServerMessage_PokemonEvolved{PokemonEvolved: &partyv1.PokemonEvolved{
		Slot: uint32(slot), Learned: done.Learned, ToLearn: done.ToLearn,
	}}})
}

// learnMove answers one of the moves an evolution or a RARE CANDY left waiting; once, whatever the
// outcome. What it may evolve into is worked out again: the moves it knows are part of that.
func (z *zone) learnMove(p *Player, slot int, id movev1.Move, forget int) {
	if _, ok := z.players[p]; !ok {
		return
	}
	waiting := p.evolving.toLearn[slot]
	at := slices.Index(waiting, id)
	party := p.party.Clone()
	mon := p.party.At(slot)
	if at >= 0 && mon != nil && mon.Replace(forget, id) && z.saveTrainer(p, item.Changed{}, true) {
		p.evolving.toLearn[slot] = slices.Delete(slices.Clone(waiting), at, at+1)
		p.evolving.offer(slot, p.party.LevelEvolution(slot, night(time.Now())))
	} else {
		p.party = party
	}
	z.sendParty(p)
	result := &partyv1.LearnMoveResult{Slot: uint32(slot)}
	if evo := p.evolving.pending[slot]; evo != nil {
		result.EvolvesTo = speciesv1.Species(evo.GetSpecies())
	}
	p.queue(&realtimev1.ServerMessage{Payload: &realtimev1.ServerMessage_LearnMoveResult{LearnMoveResult: result}})
}

func (z *zone) sendPokedex(p *Player) {
	p.queue(&realtimev1.ServerMessage{Payload: &realtimev1.ServerMessage_PokedexChanged{PokedexChanged: &pokedexv1.PokedexChanged{Pokedex: p.pokedex.Proto()}}})
}

func (z *zone) sendParty(p *Player) {
	p.queue(&realtimev1.ServerMessage{Payload: &realtimev1.ServerMessage_PartyChanged{PartyChanged: &partyv1.PartyChanged{Party: p.party.Proto()}}})
}
