// Package pokemon plays the trainer's Pokémon: the Gen 4 formulas (stats, growth rates,
// personality), creating a Pokémon, the party and its changes, and saving it to PostgreSQL.
package pokemon

import (
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"

	movev1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/move/v1"
	pokemonv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/pokemon/v1"
	speciesv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/species/v1"
)

// options reads every enum value's option `ext`, once: the catalogs in lib-contracts.
func options[E ~int32, I proto.Message](values protoreflect.EnumValueDescriptors, ext protoreflect.ExtensionType) map[E]I {
	out := make(map[E]I, values.Len())
	for i := range values.Len() {
		v := values.Get(i)
		if info, ok := proto.GetExtension(v.Options(), ext).(I); ok && v.Number() != 0 {
			out[E(v.Number())] = info
		}
	}
	return out
}

var (
	speciesCatalog = options[speciesv1.Species, *speciesv1.SpeciesInfo](speciesv1.Species(0).Descriptor().Values(), speciesv1.E_Info)
	moveCatalog    = options[movev1.Move, *movev1.MoveInfo](movev1.Move(0).Descriptor().Values(), movev1.E_Info)
	natureCatalog  = options[pokemonv1.Nature, *pokemonv1.NatureInfo](pokemonv1.Nature(0).Descriptor().Values(), pokemonv1.E_Info)
)

// SpeciesInfo is the species' facts; false for a number that isn't a species.
func SpeciesInfo(s speciesv1.Species) (*speciesv1.SpeciesInfo, bool) {
	info, ok := speciesCatalog[s]
	return info, ok
}

// MoveInfo is the move's facts; false for a number that isn't a move.
func MoveInfo(m movev1.Move) (*movev1.MoveInfo, bool) {
	info, ok := moveCatalog[m]
	return info, ok
}
