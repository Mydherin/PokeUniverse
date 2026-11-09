package encounter

import (
	abilityv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/ability/v1"
	itemv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/item/v1"
	mapv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/map/v1"

	"pokeuniverse/mic-core/internal/pokemon"
)

// State is one player's encounter state (pokefirered sWildEncounterData), in memory (phase-7 D8).
type State struct {
	stepsSinceLast int
	buff           int
	prevBehavior   mapv1.TileBehavior
}

// Reset is ResetEncounterRateModifiers (701): on a map change and when a battle starts.
func (s *State) Reset() { s.stepsSinceLast, s.buff = 0, 0 }

// Flute is the WHITE or BLACK FLUTE in effect (FLAG_SYS_WHITE_FLUTE_ACTIVE / BLACK).
type Flute int

const (
	NoFlute Flute = iota
	WhiteFlute
	BlackFlute
)

// Field is what changes the rate besides the lead.
type Field struct {
	Flute Flute
	// On a bike: ×0.8 (no bikes yet; FireRed's branch kept).
	Bike bool
	// Steps of Repel left > 0.
	Repel bool
	// The overworld weather for Sand Veil and Snow Cloak: FireRed's maps have no sandstorm or hail.
	Sandstorm, Hail bool
}

// rateEffect is what the lead does to the rate: 1 halves, 2 doubles (GetAbilityEncounterRateModType,
// with Gen 4's abilities instead of Stench and Illuminate, phase-7 D3).
func rateEffect(lead *pokemon.Pokemon, f Field) int {
	if lead == nil {
		return 0
	}
	switch lead.Ability() {
	case abilityv1.Ability_ABILITY_STENCH, abilityv1.Ability_ABILITY_WHITE_SMOKE, abilityv1.Ability_ABILITY_QUICK_FEET:
		return 1
	case abilityv1.Ability_ABILITY_SAND_VEIL:
		if f.Sandstorm {
			return 1
		}
	case abilityv1.Ability_ABILITY_SNOW_CLOAK:
		if f.Hail {
			return 1
		}
	case abilityv1.Ability_ABILITY_ILLUMINATE, abilityv1.Ability_ABILITY_ARENA_TRAP, abilityv1.Ability_ABILITY_NO_GUARD:
		return 2
	}
	return 0
}

// cleanse is IsLeadMonHoldingCleanseTag; Pure Incense does the same (phase-7 D3).
func cleanse(lead *pokemon.Pokemon) bool {
	return lead != nil && (lead.HeldItem == itemv1.Item_ITEM_CLEANSE_TAG || lead.HeldItem == itemv1.Item_ITEM_PURE_INCENSE)
}

// baseCooldown is GetMapBaseEncounterCooldown (673); false: no table for the cell.
func baseCooldown(t *mapv1.WildTable) (int, bool) {
	if t == nil {
		return 0, false
	}
	switch rate := int(t.GetRate()); {
	case rate >= 80:
		return 0, true
	case rate < 10:
		return 8, true
	default:
		return 8 - rate/10, true
	}
}

// cooldown is HandleWildEncounterCooldown (707): true lets the step go on to the encounter test.
func (s *State) cooldown(t *mapv1.WildTable, lead *pokemon.Pokemon, f Field, r pokemon.RNG) bool {
	base, ok := baseCooldown(t)
	if !ok {
		return false
	}
	minSteps, encRate := base*256, 5*256
	switch f.Flute {
	case WhiteFlute:
		minSteps -= minSteps / 2
		encRate += encRate / 2
	case BlackFlute:
		minSteps *= 2
		encRate /= 2
	}
	if cleanse(lead) {
		minSteps += minSteps / 3
		encRate -= encRate / 3
	}
	switch rateEffect(lead, f) {
	case 1:
		minSteps *= 2
		encRate /= 2
	case 2:
		minSteps /= 2
		encRate *= 2
	}
	minSteps /= 256
	encRate /= 256
	if s.stepsSinceLast >= minSteps {
		return true
	}
	s.stepsSinceLast = min(s.stepsSinceLast+1, 255) // A u8 in FireRed.
	return r.IntN(100) < encRate
}

// rateTest is DoWildEncounterRateTest (309) without ignoreAbility.
func (s *State) rateTest(t *mapv1.WildTable, lead *pokemon.Pokemon, f Field, r pokemon.RNG) bool {
	rate := int(t.GetRate()) * 16
	if f.Bike {
		rate = rate * 80 / 100
	}
	rate += s.buff * 16 / 200
	rate = FieldMod(lead, f)(rate)
	switch rateEffect(lead, f) {
	case 1:
		rate /= 2
	case 2:
		rate *= 2
	}
	return r.IntN(maxRate) < min(rate, maxRate)
}

// FieldMod is ApplyFluteEncounterRateMod and ApplyCleanseTagEncounterRateMod, for RockSmash too.
func FieldMod(lead *pokemon.Pokemon, f Field) RateMod {
	return func(rate int) int {
		switch f.Flute {
		case WhiteFlute:
			rate += rate / 2
		case BlackFlute:
			rate /= 2
		}
		if cleanse(lead) {
			rate = rate * 2 / 3
		}
		return rate
	}
}

// addBuff is AddToWildEncounterRateBuff (778): a miss raises the next step's rate, not under Repel.
func (s *State) addBuff(t *mapv1.WildTable, f Field) {
	if f.Repel {
		s.buff = 0
		return
	}
	s.buff = min(s.buff+int(t.GetRate()), 0xFFFF) // A u16 in FireRed.
}

// cellKind is the kind of encounter a cell gives; false for none.
func cellKind(cell mapv1.EncounterType) (Kind, bool) {
	switch cell {
	case mapv1.EncounterType_ENCOUNTER_TYPE_LAND:
		return Land, true
	case mapv1.EncounterType_ENCOUNTER_TYPE_WATER:
		return Water, true
	}
	return 0, false
}

// Step is TryStandardWildEncounter (757) and StandardWildEncounter (355), on a step the server
// accepted onto a cell of the given encounter kind and behavior. It returns the wild Pokémon that
// appears and its kind. The state is reset when one does, as FireRed.
func (s *State) Step(w *mapv1.WildEncounters, cell mapv1.EncounterType, behavior mapv1.TileBehavior, f Field, opts Options, r pokemon.RNG) (*pokemon.Pokemon, Kind, bool) {
	prev := s.prevBehavior
	s.prevBehavior = behavior
	kind, ok := cellKind(cell)
	if !ok {
		return nil, 0, false
	}
	t := kind.Table(w)
	if !s.cooldown(t, opts.Lead, f, r) {
		return nil, 0, false
	}
	// A cell of another behavior than the last step's passes only 60% (DoGlobalWildEncounterDiceRoll).
	if prev != behavior && r.IntN(100) >= 60 {
		return nil, 0, false
	}
	if !s.rateTest(t, opts.Lead, f, r) {
		s.addBuff(t, f)
		return nil, 0, false
	}
	// Roamers (TryStartRoamerEncounter) come here in Phase 12, before the regular Pokémon.
	if !f.Repel {
		opts.RepelLevel = 0
	}
	mon, ok := Generate(w, kind, opts, r)
	if !ok {
		// Repel's level test or Intimidate / Keen Eye's skip.
		s.addBuff(t, f)
		return nil, 0, false
	}
	s.Reset()
	return mon, kind, true
}

// SweetScent is SweetScentWildEncounter (464): on a land or water cell with a table, a wild
// Pokémon with no rate test, no Repel and no Intimidate / Keen Eye skip (pokeheartgold
// DoesAbilitySuppressEncounter 1145 isn't called for it). False: "nothing here".
func SweetScent(w *mapv1.WildEncounters, cell mapv1.EncounterType, opts Options, r pokemon.RNG) (*pokemon.Pokemon, Kind, bool) {
	kind, ok := cellKind(cell)
	if !ok || kind.Table(w) == nil {
		return nil, 0, false
	}
	opts.RepelLevel, opts.SweetScent = 0, true
	mon, ok := Generate(w, kind, opts, r)
	return mon, kind, ok
}

// RepelLevel is the level IsWildLevelAllowedByRepel (601) compares with: the first healthy
// party member's (no eggs yet). 0 with none: FireRed then allows no wild Pokémon, which can't
// happen with a whole party fainted on the map.
func RepelLevel(party []*pokemon.Pokemon) int {
	for _, m := range party {
		if m.HP > 0 {
			return m.Level
		}
	}
	return 0
}
