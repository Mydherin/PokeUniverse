package pokemon

import (
	abilityv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/ability/v1"
	itemv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/item/v1"
	partyv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/party/v1"
	pokemonv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/pokemon/v1"
	speciesv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/species/v1"
	trainerv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/trainer/v1"
)

// Trainer is a Pokémon's original trainer.
type Trainer struct {
	Name   string
	ID     uint32
	Gender trainerv1.Gender
}

// Pokemon is one Pokémon, as saved. What follows from it (stats, gender, nature, shiny,
// ability) is computed, never stored.
type Pokemon struct {
	Species  speciesv1.Species
	Nickname string // Empty: the species' name.
	Level    int
	Exp      int
	// Random per Pokémon: gender, nature, shiny, Unown's letter.
	Personality uint32
	IVs, EVs    Stats
	// Which of the species' abilities (0 or 1).
	AbilitySlot int
	HeldItem    itemv1.Item
	Moves       []Move
	HP          int
	Status      pokemonv1.Status
	Friendship  int
	Ball        itemv1.Item
	OT          Trainer
	MetLevel    int
	MetMap      string // Empty: a fateful encounter.
	// MARK's four marks, one bit each (MON_DATA_MARKINGS).
	Markings int
}

// Create is CreateMon: a new Pokémon at full health with its species' default moves, caught in
// a POKé BALL by `ot`, its stats from the IVs and EVs given.
func Create(species speciesv1.Species, level int, personality uint32, ivs, evs Stats, ot Trainer) *Pokemon {
	info, _ := SpeciesInfo(species)
	p := &Pokemon{
		Species: species, Level: level, Exp: ExpAt(info.GetGrowthRate(), level), Personality: personality,
		IVs: ivs, EVs: evs, AbilitySlot: AbilitySlotOf(personality), Moves: DefaultMoves(info, level),
		Friendship: int(info.GetBaseFriendship()), Ball: itemv1.Item_ITEM_POKE_BALL, OT: ot, MetLevel: level,
	}
	p.HP = p.Stats()[0]
	return p
}

func (p *Pokemon) info() *speciesv1.SpeciesInfo {
	info, _ := SpeciesInfo(p.Species)
	return info
}

func (p *Pokemon) Nature() pokemonv1.Nature { return NatureOf(p.Personality) }

func (p *Pokemon) Gender() pokemonv1.Gender {
	return GenderOf(p.info().GetGenderRatio(), p.Personality)
}

func (p *Pokemon) Shiny() bool { return ShinyOf(p.OT.ID, p.Personality) }

// Stats is its six stats now.
func (p *Pokemon) Stats() Stats {
	return CalcStats(p.Species, StatsFrom(p.info().GetBaseStats()), p.IVs, p.EVs, p.Level, p.Nature())
}

// Ability is the species' ability its slot picks (the first when the species has one).
func (p *Pokemon) Ability() abilityv1.Ability {
	abilities := p.info().GetAbilities()
	if len(abilities) == 0 {
		return abilityv1.Ability_ABILITY_UNSPECIFIED
	}
	return abilities[min(p.AbilitySlot, len(abilities)-1)]
}

// Clone copies the Pokémon, so a change can be undone when it can't be saved.
func (p *Pokemon) Clone() *Pokemon {
	c := *p
	c.Moves = append([]Move(nil), p.Moves...)
	return &c
}

// Proto is the Pokémon as its trainer sees it.
func (p *Pokemon) Proto() *partyv1.Pokemon {
	rate := p.info().GetGrowthRate()
	next := ExpAt(rate, p.Level+1)
	if p.Level >= MaxLevel {
		next = ExpAt(rate, MaxLevel)
	}
	moves := make([]*partyv1.Move, len(p.Moves))
	for i, m := range p.Moves {
		moves[i] = &partyv1.Move{Move: m.ID, Pp: uint32(m.PP), MaxPp: uint32(MaxPP(m.ID, m.PPUps))}
	}
	return &partyv1.Pokemon{
		Species: p.Species, Nickname: p.Nickname, Level: uint32(p.Level),
		Exp: uint32(p.Exp), LevelExp: uint32(ExpAt(rate, p.Level)), NextLevelExp: uint32(next),
		Hp: uint32(p.HP), Stats: p.Stats().Proto(), Moves: moves, Status: p.Status, HeldItem: p.HeldItem,
		Ability: p.Ability(), Nature: p.Nature(), Gender: p.Gender(), Shiny: p.Shiny(), Personality: p.Personality,
		Ball: p.Ball, OtName: p.OT.Name, OtIdNo: p.OT.ID & 0xffff, OtGender: p.OT.Gender,
		MetLevel: uint32(p.MetLevel), MetMap: p.MetMap, Markings: uint32(p.Markings),
	}
}
