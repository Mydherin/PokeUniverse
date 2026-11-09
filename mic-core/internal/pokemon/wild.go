package pokemon

import (
	"math/rand/v2"

	itemv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/item/v1"
	pokemonv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/pokemon/v1"
	speciesv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/species/v1"
)

// RNG is the randomness a wild Pokémon is made with (*rand.Rand, or ServerRNG).
type RNG interface {
	IntN(n int) int
	Uint32() uint32
}

type serverRNG struct{}

func (serverRNG) IntN(n int) int  { return rand.IntN(n) }
func (serverRNG) Uint32() uint32 { return rand.Uint32() }

// ServerRNG is the server's own randomness (phase-7 D1).
var ServerRNG RNG = serverRNG{}

// WildOptions are what the party's lead changes in the Pokémon made (Gen 4).
type WildOptions struct {
	// Synchronize: the lead's nature, given 50% of the time (unspecified: none).
	Synchronize pokemonv1.Nature
	// Cute Charm: the lead's opposite gender, given 2/3 of the time to a species that can be
	// either (unspecified: none).
	CuteCharm pokemonv1.Gender
	// Compound Eyes: held item chances 60% / 20% instead of 50% / 5%.
	CompoundEyes bool
}

// Gen 4's held item odds (pokeheartgold sItemOdds, pokemon.c 3736): below the first, no item; below
// the second, the common one; else the rare one. The second row is Compound Eyes'.
var wildItemOdds = [2][2]int{{45, 95}, {20, 80}}

// CreateWild is a wild Pokémon as Gen 4 makes it (pokeheartgold encounter_check.c
// generateWildNonShinyAndAddToParty 822, getWildMonNature 734, pokemon.c CreateMonWithNature 258
// and CreateMonWithGenderNatureLetter 266): Cute Charm's gender is rolled first, then the nature
// (random, or Synchronize's), then a random personality is rerolled until it has that nature and
// gender. IVs random, EVs 0, the species' default moves and friendship. `ot` is the
// player who meets it: its shininess comes from their trainer and secret ID, as FireRed's
// CreateMon does. Its ball, met map and caught data are set when it's caught (M5).
func CreateWild(species speciesv1.Species, level int, ot Trainer, opts WildOptions, r RNG) *Pokemon {
	info, _ := SpeciesInfo(species)
	gender := pokemonv1.Gender_GENDER_UNSPECIFIED
	switch info.GetGenderRatio() {
	case maleOnly, femaleOnly, genderless:
	default:
		if opts.CuteCharm != pokemonv1.Gender_GENDER_UNSPECIFIED && r.IntN(3) != 0 {
			gender = opts.CuteCharm
		}
	}
	nature := pokemonv1.Nature(r.IntN(25) + 1)
	if opts.Synchronize != pokemonv1.Nature_NATURE_UNSPECIFIED && r.IntN(2) == 0 {
		nature = opts.Synchronize
	}
	var personality uint32
	for {
		personality = r.Uint32()
		if NatureOf(personality) == nature &&
			(gender == pokemonv1.Gender_GENDER_UNSPECIFIED || GenderOf(info.GetGenderRatio(), personality) == gender) {
			break
		}
	}
	var ivs Stats
	for i := range ivs {
		ivs[i] = r.IntN(32)
	}
	p := Create(species, level, personality, ivs, Stats{}, ot)
	p.HeldItem = wildHeldItem(info, opts.CompoundEyes, r)
	return p
}

// wildHeldItem is WildMonSetRandomHeldItem (pokeheartgold pokemon.c 3741): a species whose two
// items are the same always holds it.
func wildHeldItem(info *speciesv1.SpeciesInfo, compoundEyes bool, r RNG) itemv1.Item {
	common, rare := itemv1.Item(info.GetItemCommon()), itemv1.Item(info.GetItemRare())
	chance := r.IntN(100)
	if common == rare && common != itemv1.Item_ITEM_UNSPECIFIED {
		return common
	}
	odds := wildItemOdds[0]
	if compoundEyes {
		odds = wildItemOdds[1]
	}
	switch {
	case chance < odds[0]:
		return itemv1.Item_ITEM_UNSPECIFIED
	case chance < odds[1]:
		return common
	}
	return rare
}
