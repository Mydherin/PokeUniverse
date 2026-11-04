package pokemon

import (
	itemv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/item/v1"
	movev1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/move/v1"
	pokemonv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/pokemon/v1"
	speciesv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/species/v1"
)

// kantoLast is the last species before the National Pokédex (SPECIES_MEW).
const kantoLast = 151

// Evolutions is who evolves after a won battle, by slot (gLeveledUpInBattle): those that gained a
// level compared with `before`, fainted or not. GetEvolutionTargetSpecies for each.
func Evolutions(party, before Party, night bool) map[int]*speciesv1.Evolution {
	out := map[int]*speciesv1.Evolution{}
	for i, p := range party {
		if was := before.At(i); was != nil && p.Level > was.Level {
			if evo := party.levelEvolution(p, night); evo != nil {
				out[i] = evo
			}
		}
	}
	return out
}

// CanEvolve: without the National Pokédex nothing evolves past Kanto's species (the scene stops
// by itself, evolution_scene.c:640).
func CanEvolve(evo *speciesv1.Evolution, national bool) bool {
	return national || evo.GetSpecies() <= kantoLast
}

// levelEvolution is the first level evolution whose conditions all hold; none with an EVERSTONE.
func (pt Party) levelEvolution(p *Pokemon, night bool) *speciesv1.Evolution {
	if p.HeldItem == itemv1.Item_ITEM_EVERSTONE {
		return nil
	}
	for _, e := range p.info().GetEvolutions() {
		if e.GetMethod() == speciesv1.EvolutionMethod_EVOLUTION_METHOD_LEVEL && pt.meets(p, e, night) {
			return e
		}
	}
	return nil
}

// ItemEvolution is what the item evolves the Pokémon into (EVO_MODE_ITEM_USE), or nil. A held
// EVERSTONE doesn't stop it: Gen 4's rule (GetMonEvolution, EVOCTX_ITEM_USE), FireRed's would.
func (pt Party) ItemEvolution(slot int, id itemv1.Item) *speciesv1.Evolution {
	p := pt.At(slot)
	if p == nil {
		return nil
	}
	for _, e := range p.info().GetEvolutions() {
		if e.GetMethod() == speciesv1.EvolutionMethod_EVOLUTION_METHOD_ITEM && e.GetItem() == uint32(id) &&
			(e.GetGender() == pokemonv1.Gender_GENDER_UNSPECIFIED || e.GetGender() == p.Gender()) {
			return e
		}
	}
	return nil
}

// LevelEvolution is who the Pokémon in the slot evolves into at its level now (EVO_MODE_NORMAL).
func (pt Party) LevelEvolution(slot int, night bool) *speciesv1.Evolution {
	p := pt.At(slot)
	if p == nil {
		return nil
	}
	return pt.levelEvolution(p, night)
}

func (pt Party) meets(p *Pokemon, e *speciesv1.Evolution, night bool) bool {
	stats := p.Stats()
	attack, defense := stats[1], stats[2]
	switch {
	case p.Level < int(e.GetLevel()),
		p.Friendship < int(e.GetFriendship()),
		e.GetItem() != 0 && uint32(p.HeldItem) != e.GetItem(),
		e.GetGender() != pokemonv1.Gender_GENDER_UNSPECIFIED && p.Gender() != e.GetGender(),
		e.GetMove() != 0 && !knows(p.Moves, movev1.Move(e.GetMove())):
		return false
	}
	switch e.GetTime() {
	case speciesv1.EvolutionTime_EVOLUTION_TIME_DAY:
		if night {
			return false
		}
	case speciesv1.EvolutionTime_EVOLUTION_TIME_NIGHT:
		if !night {
			return false
		}
	}
	switch e.GetStats() {
	case speciesv1.EvolutionStats_EVOLUTION_STATS_ATTACK_HIGHER:
		if attack <= defense {
			return false
		}
	case speciesv1.EvolutionStats_EVOLUTION_STATS_EQUAL:
		if attack != defense {
			return false
		}
	case speciesv1.EvolutionStats_EVOLUTION_STATS_DEFENSE_HIGHER:
		if attack >= defense {
			return false
		}
	}
	low := (p.Personality>>16)%10 < 5
	switch e.GetPersonality() {
	case speciesv1.EvolutionPersonality_EVOLUTION_PERSONALITY_LOW:
		if !low {
			return false
		}
	case speciesv1.EvolutionPersonality_EVOLUTION_PERSONALITY_HIGH:
		if low {
			return false
		}
	}
	if e.GetPartySpecies() != 0 {
		for _, m := range pt {
			if uint32(m.Species) == e.GetPartySpecies() {
				return true
			}
		}
		return false
	}
	return true
}

// Evolved is what an evolution did.
type Evolved struct {
	// The species to mark seen and caught: it, and Shedinja. Empty: nothing happened.
	Species []speciesv1.Species
	// New moves at its level, already in free slots; and those with no slot free.
	Learned, ToLearn []movev1.Move
	// Left behind in the party's last slot (spends a POKé BALL).
	Shed *Pokemon
}

// Evolve changes the Pokémon in the slot (CalculateMonStats: HP rises with max HP, a fainted one
// stays fainted; the nickname stays), teaches it the new species' moves at its level
// (MonTryLearningNewMove) and leaves Shedinja behind when there's room and a ball (CreateShedinja;
// it copies the moves known now, before any answer to ToLearn). A held item it needed is gone.
func (pt *Party) Evolve(slot int, evo *speciesv1.Evolution, hasBall bool) Evolved {
	p := pt.At(slot)
	if p == nil {
		return Evolved{}
	}
	shed := p.shedEvolution()
	maxHP := p.Stats()[0]
	p.Species = speciesv1.Species(evo.GetSpecies())
	if p.HP > 0 {
		p.HP += p.Stats()[0] - maxHP
	}
	if evo.GetMethod() == speciesv1.EvolutionMethod_EVOLUTION_METHOD_LEVEL && evo.GetItem() != 0 {
		p.HeldItem = itemv1.Item_ITEM_UNSPECIFIED
	}
	done := Evolved{Species: []speciesv1.Species{p.Species}}
	done.Learned, done.ToLearn = p.learnAtLevel()
	if shed != nil && hasBall && len(*pt) < PartySize {
		c := p.Clone()
		c.Species, c.Nickname = speciesv1.Species(shed.GetSpecies()), ""
		c.HeldItem, c.Status = itemv1.Item_ITEM_UNSPECIFIED, pokemonv1.Status_STATUS_UNSPECIFIED
		if c.HP > 0 {
			c.HP = c.Stats()[0]
		}
		*pt = append(*pt, c)
		done.Shed = c
		done.Species = append(done.Species, c.Species)
	}
	return done
}

// learnAtLevel teaches its species' moves at its level (MonTryLearningNewMove): those with a free
// slot now, and those with none, to be answered.
func (p *Pokemon) learnAtLevel() (learned, toLearn []movev1.Move) {
	for _, lm := range p.info().GetLevelMoves() {
		id := movev1.Move(lm.GetMove())
		if int(lm.GetLevel()) != p.Level || knows(p.Moves, id) {
			continue
		}
		if len(p.Moves) < MaxMoves {
			p.Moves = append(p.Moves, Move{ID: id, PP: MaxPP(id, 0)})
			learned = append(learned, id)
		} else {
			toLearn = append(toLearn, id)
		}
	}
	return learned, toLearn
}

func (p *Pokemon) shedEvolution() *speciesv1.Evolution {
	for _, e := range p.info().GetEvolutions() {
		if e.GetMethod() == speciesv1.EvolutionMethod_EVOLUTION_METHOD_SHED {
			return e
		}
	}
	return nil
}
