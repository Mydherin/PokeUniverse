// Package encounter makes the wild Pokémon a map's tables give: FireRed's slot and level choice
// (pokefirered src/wild_encounter.c), the party lead's abilities as Gen 4 (pokeheartgold
// src/field/encounter_check.c) (phase-7 D3, D4).
package encounter

import (
	abilityv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/ability/v1"
	mapv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/map/v1"
	pokemonv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/pokemon/v1"
	speciesv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/species/v1"

	"pokeuniverse/mic-core/internal/pokemon"
)

// Kind is where the wild Pokémon comes from.
type Kind int

const (
	Land Kind = iota
	Water
	RockSmashKind
	OldRod
	GoodRod
	SuperRod
)

// The slot chances (pokefirered src/data/wild_encounters.json `fields`). A rod's slots start at its
// offset in the fishing table: old 0-1, good 2-4, super 5-9.
var (
	landChances  = []int{20, 20, 10, 10, 10, 10, 5, 5, 4, 4, 1, 1}
	waterChances = []int{60, 30, 5, 4, 1} // Water and Rock Smash.
	rodChances   = map[Kind][]int{OldRod: {70, 30}, GoodRod: {60, 20, 20}, SuperRod: {40, 40, 15, 4, 1}}
	rodOffset    = map[Kind]int{OldRod: 0, GoodRod: 2, SuperRod: 5}
)

// Table is the kind's table in the map's encounters; nil when the map has none.
func (k Kind) Table(w *mapv1.WildEncounters) *mapv1.WildTable {
	var t *mapv1.WildTable
	switch k {
	case Land:
		t = w.GetLand()
	case Water:
		t = w.GetWater()
	case RockSmashKind:
		t = w.GetRockSmash()
	default:
		t = w.GetFishing()
	}
	if len(t.GetSlots()) == 0 {
		return nil
	}
	return t
}

// slots is the slots the kind picks from in its table (a rod's part of the fishing table).
func (k Kind) slots(t *mapv1.WildTable) []*mapv1.WildSlot {
	s := t.GetSlots()
	if off, ok := rodOffset[k]; ok {
		return s[off : off+len(rodChances[k])]
	}
	return s
}

// ChooseSlot is ChooseWildMonIndex_Land (71), _WaterRock (101) and _Fishing (117): a slot of the
// kind's slots, by FireRed's chances.
func ChooseSlot(kind Kind, r pokemon.RNG) int {
	chances := landChances
	switch kind {
	case Water, RockSmashKind:
		chances = waterChances
	case OldRod, GoodRod, SuperRod:
		chances = rodChances[kind]
	}
	roll := r.IntN(100) // Every kind's chances add up to 100.
	for i, c := range chances {
		if roll < c {
			return i
		}
		roll -= c
	}
	return len(chances) - 1
}

// ChooseLevel is ChooseWildMonLevel (155): uniform between the slot's levels, swapped when reversed.
// Hustle, Pressure and Vital Spirit (pokeheartgold EncounterSlot_WildMonLevelRoll 742): 50% the
// highest level. HeartGold's land slots have one level and pick another slot instead
// (ApplyAbilityEffectToSlotLevel 1359); FireRed's land slots have a range, so every kind uses the roll.
func ChooseLevel(slot *mapv1.WildSlot, lead abilityv1.Ability, r pokemon.RNG) int {
	lo, hi := int(slot.GetMinLevel()), int(slot.GetMaxLevel())
	if lo > hi {
		lo, hi = hi, lo
	}
	level := lo + r.IntN(hi-lo+1)
	switch lead {
	case abilityv1.Ability_ABILITY_HUSTLE, abilityv1.Ability_ABILITY_PRESSURE, abilityv1.Ability_ABILITY_VITAL_SPIRIT:
		if r.IntN(2) != 0 {
			return hi
		}
	}
	return level
}

// Options are what the player brings to an encounter.
type Options struct {
	// The party's slot 0, even fainted (Gen 4: EncounterGenState_Init reads party slot 0); nil
	// for none. An egg lead has no ability (no eggs yet).
	Lead *pokemon.Pokemon
	// Repel's test (IsWildLevelAllowedByRepel 601, from M3): while Repel lasts, the level of the
	// first healthy party member; a wild Pokémon below it doesn't appear. 0: no Repel.
	RepelLevel int
	// The player who meets it: its shininess comes from their IDs.
	Trainer pokemon.Trainer
	// Sweet Scent: Intimidate and Keen Eye never skip (pokeheartgold DoesAbilitySuppressEncounter
	// 1145 is only called for steps).
	SweetScent bool
}

func (o Options) ability() abilityv1.Ability {
	if o.Lead == nil {
		return abilityv1.Ability_ABILITY_UNSPECIFIED
	}
	return o.Lead.Ability()
}

// Generate is TryGenerateWildMon (269) with WILD_CHECK_REPEL, plus Gen 4's lead abilities in
// HeartGold's order (FieldSystem_GenerateRegularEncounter 878): Magnet Pull or Static's slot, the
// level (Hustle), Intimidate or Keen Eye's skip, Repel, then the Pokémon (Synchronize, Cute Charm,
// Compound Eyes). False: no wild Pokémon this time (no table, or skipped).
func Generate(w *mapv1.WildEncounters, kind Kind, opts Options, r pokemon.RNG) (*pokemon.Pokemon, bool) {
	t := kind.Table(w)
	if t == nil {
		return nil, false
	}
	slots := kind.slots(t)
	ability := opts.ability()
	i, ok := leadSlot(slots, ability, r)
	if !ok {
		i = ChooseSlot(kind, r)
	}
	slot := slots[i]
	level := ChooseLevel(slot, ability, r)
	if !opts.SweetScent && leadSkips(opts.Lead, ability, level, r) {
		return nil, false
	}
	if opts.RepelLevel > 0 && level < opts.RepelLevel {
		return nil, false
	}
	return pokemon.CreateWild(speciesv1.Species(slot.GetSpecies()), level, opts.Trainer, wildOptions(opts.Lead, ability), r), true
}

// leadSlot is EncounterSlot_AbilityInfluenceOnSlotChoiceCheck (1112) and chooseAbilityCoercedSlot
// (1089): Magnet Pull (Steel) or Static (Electric), 50%, a random slot of that type, only when some
// slots are of that type and some aren't.
func leadSlot(slots []*mapv1.WildSlot, ability abilityv1.Ability, r pokemon.RNG) (int, bool) {
	var want speciesv1.Type
	switch ability {
	case abilityv1.Ability_ABILITY_MAGNET_PULL:
		want = speciesv1.Type_TYPE_STEEL
	case abilityv1.Ability_ABILITY_STATIC:
		want = speciesv1.Type_TYPE_ELECTRIC
	default:
		return 0, false
	}
	if r.IntN(2) != 0 {
		return 0, false
	}
	var found []int
	for i, s := range slots {
		info, _ := pokemon.SpeciesInfo(speciesv1.Species(s.GetSpecies()))
		if info.GetType1() == want || info.GetType2() == want {
			found = append(found, i)
		}
	}
	if len(found) == 0 || len(found) == len(slots) {
		return 0, false
	}
	return found[r.IntN(len(found))], true
}

// leadSkips is DoesAbilitySuppressEncounter (1145): Intimidate or Keen Eye, a lead above level 5
// skips 50% of the wild Pokémon 5 or more levels below it.
func leadSkips(lead *pokemon.Pokemon, ability abilityv1.Ability, level int, r pokemon.RNG) bool {
	if ability != abilityv1.Ability_ABILITY_INTIMIDATE && ability != abilityv1.Ability_ABILITY_KEEN_EYE {
		return false
	}
	if lead.Level <= 5 {
		return false
	}
	return level <= lead.Level-5 && r.IntN(2) == 0
}

// wildOptions is what the lead changes in the Pokémon made: Synchronize 50% its nature
// (getWildMonNature 734), Cute Charm 2/3 the opposite gender (generateWildNonShinyAndAddToParty
// 822; a genderless lead can't have Cute Charm), Compound Eyes the item chances
// (addGeneratedMonToBattleSetupParty 1350). CreateWild rolls the 50% and 2/3.
func wildOptions(lead *pokemon.Pokemon, ability abilityv1.Ability) pokemon.WildOptions {
	switch ability {
	case abilityv1.Ability_ABILITY_SYNCHRONIZE:
		return pokemon.WildOptions{Synchronize: lead.Nature()}
	case abilityv1.Ability_ABILITY_CUTE_CHARM:
		g := pokemonv1.Gender_GENDER_UNSPECIFIED
		switch lead.Gender() {
		case pokemonv1.Gender_GENDER_MALE:
			g = pokemonv1.Gender_GENDER_FEMALE
		case pokemonv1.Gender_GENDER_FEMALE:
			g = pokemonv1.Gender_GENDER_MALE
		}
		return pokemon.WildOptions{CuteCharm: g}
	case abilityv1.Ability_ABILITY_COMPOUND_EYES:
		return pokemon.WildOptions{CompoundEyes: true}
	}
	return pokemon.WildOptions{}
}

// maxRate is MAX_ENCOUNTER_RATE (wild_encounter.c 20): the rate test's roll is out of 1600.
const maxRate = 1600

// RateMod changes a rate test's rate (×16 already): flutes and Cleanse Tag (M3). nil: none.
type RateMod func(rate int) int

// RockSmash is RockSmashWildEncounter (446), for Rock Smash on the map (Phase 12, phase-7 D4):
// the table's rate test without the lead's ability (DoWildEncounterRateTest 309 with
// ignoreAbility), then Generate with Repel. False: no wild Pokémon.
func RockSmash(w *mapv1.WildEncounters, opts Options, mod RateMod, r pokemon.RNG) (*pokemon.Pokemon, bool) {
	t := RockSmashKind.Table(w)
	if t == nil {
		return nil, false
	}
	rate := int(t.GetRate()) * 16
	if mod != nil {
		rate = mod(rate)
	}
	if r.IntN(maxRate) >= min(rate, maxRate) {
		return nil, false
	}
	return Generate(w, RockSmashKind, opts, r)
}

// Fishing is FishingWildEncounter (519), for a rod's bite (Phase 12, phase-7 D4): no Repel test.
// Sticky Hold and Suction Cups (the bite's chance) come with the rods.
func Fishing(w *mapv1.WildEncounters, rod Kind, opts Options, r pokemon.RNG) (*pokemon.Pokemon, bool) {
	opts.RepelLevel = 0
	return Generate(w, rod, opts, r)
}
