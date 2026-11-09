package pokemon

import (
	pokemonv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/pokemon/v1"
)

// What a Pokémon's personality (a random 32-bit value set when it's created) decides.

// Gender ratios with a fixed gender (the species' gender_ratio).
const (
	maleOnly   = 0
	femaleOnly = 254
	genderless = 255
)

// GenderOf is GetGenderFromSpeciesAndPersonality: female when the personality's low byte is below
// the species' ratio.
func GenderOf(ratio uint32, personality uint32) pokemonv1.Gender {
	switch ratio {
	case maleOnly:
		return pokemonv1.Gender_GENDER_MALE
	case femaleOnly:
		return pokemonv1.Gender_GENDER_FEMALE
	case genderless:
		return pokemonv1.Gender_GENDER_GENDERLESS
	}
	if personality&0xff < ratio {
		return pokemonv1.Gender_GENDER_FEMALE
	}
	return pokemonv1.Gender_GENDER_MALE
}

// NatureOf is GetNatureFromPersonality: personality % 25 (the enum is FireRed's NATURE_ + 1).
func NatureOf(personality uint32) pokemonv1.Nature {
	return pokemonv1.Nature(personality%25 + 1)
}

// ShinyOf is IsShinyOtIdPersonality: the trainer ID's and the personality's halves XORed are below 8.
func ShinyOf(otID, personality uint32) bool {
	return (otID>>16)^(otID&0xffff)^(personality>>16)^(personality&0xffff) < 8
}

// AbilitySlotOf is the ability a new Pokémon gets when its species has two: the personality's lowest bit.
func AbilitySlotOf(personality uint32) int {
	return int(personality & 1)
}
