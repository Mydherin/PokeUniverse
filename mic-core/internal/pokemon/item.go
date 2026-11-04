package pokemon

import (
	"slices"

	itemv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/item/v1"
	movev1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/move/v1"
	pokemonv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/pokemon/v1"
	speciesv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/species/v1"
)

const (
	// maxPPUps is how many PP UPs a move takes; moves below minPPForUps take none (PokemonUseItemEffects).
	maxPPUps    = 3
	minPPForUps = 5
	// evsPerItem and itemEVLimit are a vitamin's rules (EV_ITEM_RAISE_LIMIT), maxTotalEVs a Pokémon's.
	evsPerItem  = 10
	itemEVLimit = 100
	maxTotalEVs = 510
)

// UseItem is a bag item's effect outside battle on the Pokémon in `slot` (ExecuteTableBasedItemEffect),
// or on every one it works on for SACRED ASH. False: it would do nothing, and nothing changed.
func (pt Party) UseItem(e *itemv1.ItemEffect, slot, moveSlot int, mapID string) bool {
	if e.GetAllParty() {
		worked := false
		for _, p := range pt {
			worked = p.useItem(e, moveSlot, mapID) || worked
		}
		return worked
	}
	p := pt.At(slot)
	return p != nil && p.useItem(e, moveSlot, mapID)
}

// RareCandy raises the Pokémon in `slot` one level through what battles use (Gain), its HP rising
// with its maximum, which brings a fainted one back (ITEM6_HEAL_HP_LVL_UP; use_item_on_mon.c), and
// teaches its moves at the new level. False at level 100: nothing changed.
func (pt Party) RareCandy(slot int, mapID string) (learned, toLearn []movev1.Move, ok bool) {
	p := pt.At(slot)
	if p == nil || p.Level >= MaxLevel {
		return nil, nil, false
	}
	maxHP := p.Stats()[0]
	p.Gain(ExpAt(p.info().GetGrowthRate(), p.Level+1)-p.Exp, Stats{}, mapID)
	p.HP += p.Stats()[0] - maxHP
	learned, toLearn = p.learnAtLevel()
	return learned, toLearn, true
}

// TeachMachineMove is a TM or HM on the Pokémon in `slot` (ItemUseCB_TMHM, Task_LearnedMove): the
// species can learn it and doesn't know it, with a free slot or replacing the move in `forget`,
// which can't be an HM. False: nothing changed.
func (pt Party) TeachMachineMove(slot int, id movev1.Move, forget int, e *itemv1.ItemEffect, mapID string) bool {
	p := pt.At(slot)
	if p == nil || knows(p.Moves, id) || !slices.Contains(p.info().GetMachineMoves(), uint32(id)) {
		return false
	}
	if len(p.Moves) < MaxMoves {
		p.Moves = append(p.Moves, Move{ID: id, PP: MaxPP(id, 0)})
	} else if !p.Replace(forget, id) {
		return false
	}
	p.changeFriendshipByItem(e.GetFriendship(), mapID)
	return true
}

// ItemSceneCloseness is how close FireRed's item scene shows the Pokémon in `slot`, from its friendship
// before the item (GetClosenessFromFriendship): 0 to 3.
func (pt Party) ItemSceneCloseness(slot int) int {
	p := pt.At(slot)
	switch {
	case p == nil || p.Friendship <= 100:
		return 0
	case p.Friendship <= 150:
		return 1
	case p.Friendship <= 200:
		return 2
	}
	return 3
}

// ChangeFriendshipByItem is a bag item's friendship change, for one used in battle.
func (pt Party) ChangeFriendshipByItem(e *itemv1.ItemEffect, slot int, mapID string) {
	if p := pt.At(slot); p != nil {
		p.changeFriendshipByItem(e.GetFriendship(), mapID)
	}
}

func (p *Pokemon) useItem(e *itemv1.ItemEffect, moveSlot int, mapID string) bool {
	if e == nil {
		return false
	}
	worked := p.useOnHP(e)
	worked = p.useOnStatus(e) || worked
	worked = p.useOnPP(e, moveSlot) || worked
	worked = p.useOnEVs(e) || worked
	if worked {
		p.changeFriendshipByItem(e.GetFriendship(), mapID)
	}
	return worked
}

// useOnHP: a revive only on a fainted Pokémon, anything else restoring HP only on one standing.
func (p *Pokemon) useOnHP(e *itemv1.ItemEffect) bool {
	if e.GetHp() == 0 && e.GetHpPercent() == 0 {
		return false
	}
	maxHP := p.Stats()[0]
	if e.GetRevive() != (p.HP == 0) || p.HP >= maxHP {
		return false
	}
	gain := int(e.GetHp())
	if percent := int(e.GetHpPercent()); percent > 0 {
		gain = max(maxHP*percent/100, 1)
	}
	p.HP = min(p.HP+gain, maxHP)
	return true
}

func (p *Pokemon) useOnStatus(e *itemv1.ItemEffect) bool {
	for _, cured := range e.GetCures() {
		if cured == p.Status {
			p.Status = pokemonv1.Status_STATUS_UNSPECIFIED
			return true
		}
	}
	return false
}

func (p *Pokemon) useOnPP(e *itemv1.ItemEffect, moveSlot int) bool {
	if e.GetAllMoves() {
		worked := false
		for i := range p.Moves {
			worked = p.restorePP(e, i) || worked
		}
		return worked
	}
	if moveSlot < 0 || moveSlot >= len(p.Moves) {
		return false
	}
	switch {
	case e.GetPpUp():
		return p.raisePP(moveSlot, p.Moves[moveSlot].PPUps+1)
	case e.GetPpMaxUp():
		return p.raisePP(moveSlot, maxPPUps)
	}
	return p.restorePP(e, moveSlot)
}

func (p *Pokemon) restorePP(e *itemv1.ItemEffect, slot int) bool {
	if e.GetPp() == 0 && !e.GetPpMax() {
		return false
	}
	m := &p.Moves[slot]
	full := MaxPP(m.ID, m.PPUps)
	if m.PP >= full {
		return false
	}
	if e.GetPpMax() {
		m.PP = full
	} else {
		m.PP = min(m.PP+int(e.GetPp()), full)
	}
	return true
}

// raisePP sets a move's PP UPs, its PP rising by what its maximum rose.
func (p *Pokemon) raisePP(slot, ups int) bool {
	m := &p.Moves[slot]
	info, _ := MoveInfo(m.ID)
	if m.PPUps >= maxPPUps || int(info.GetPp()) < minPPForUps {
		return false
	}
	before := MaxPP(m.ID, m.PPUps)
	m.PPUps = ups
	m.PP += MaxPP(m.ID, ups) - before
	return true
}

// useOnEVs is a vitamin. A standing Pokémon's HP rises with its maximum (CalculateMonStats); HP UP
// doesn't work on SHEDINJA (NotUsingHPEVItemOnShedinja).
func (p *Pokemon) useOnEVs(e *itemv1.ItemEffect) bool {
	if e.GetEvStat() == pokemonv1.Stat_STAT_UNSPECIFIED {
		return false
	}
	stat := int(e.GetEvStat()) - 1
	if stat == 0 && p.Species == speciesv1.Species_SPECIES_SHEDINJA {
		return false
	}
	total := 0
	for _, ev := range p.EVs {
		total += ev
	}
	gain := min(evsPerItem, itemEVLimit-p.EVs[stat], maxTotalEVs-total)
	if gain <= 0 {
		return false
	}
	before := p.Stats()[0]
	p.EVs[stat] += gain
	if p.HP > 0 {
		p.HP += p.Stats()[0] - before
	}
	return true
}

// changeFriendshipByItem is UPDATE_FRIENDSHIP_FROM_ITEM: the change by how friendly it is now; a rise
// half as much again with a SOOTHE BELL, +1 from a LUXURY BALL, +1 on the map where it was met.
func (p *Pokemon) changeFriendshipByItem(changes []int32, mapID string) {
	if len(changes) != 3 {
		return
	}
	band := 0
	if p.Friendship >= 200 {
		band = 2
	} else if p.Friendship >= 100 {
		band = 1
	}
	change := int(changes[band])
	if change > 0 {
		if p.HeldItem == itemv1.Item_ITEM_SOOTHE_BELL {
			change = change * 150 / 100
		}
		if p.Ball == itemv1.Item_ITEM_LUXURY_BALL {
			change++
		}
		if p.metOn(mapID) {
			change++
		}
	}
	p.Friendship = max(min(p.Friendship+change, MaxFriendship), 0)
}
