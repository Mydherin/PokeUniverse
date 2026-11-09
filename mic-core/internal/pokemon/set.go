package pokemon

import (
	"math/rand/v2"

	itemv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/item/v1"
	movev1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/move/v1"
	pokemonv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/pokemon/v1"
	speciesv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/species/v1"
)

// Set is a hand-made Pokémon: the test team and NPC trainers' teams. Moves are checked by hand
// against Showdown's Gen 4 learnsets (level-up, TM, tutor or egg).
type Set struct {
	Species speciesv1.Species
	Nature  pokemonv1.Nature
	Item    itemv1.Item
	Moves   []movev1.Move
	EVs     Stats // HP, ATK, DEF, SPEED, SP. ATK, SP. DEF.
	// Nil: random IVs, from the seed.
	IVs *Stats
}

// Create builds the set at `level` for `ot`. The same seed gives the same Pokémon (personality
// with the set's nature, as CreateMonWithNature, and IVs), so two builds always agree.
func (s Set) Create(level int, ot Trainer, seed uint64) *Pokemon {
	r := rand.New(rand.NewPCG(seed, uint64(s.Species)))
	personality := r.Uint32()
	for NatureOf(personality) != s.Nature {
		personality = r.Uint32()
	}
	var ivs Stats
	if s.IVs != nil {
		ivs = *s.IVs
	} else {
		for i := range ivs {
			ivs[i] = r.IntN(MaxIV + 1)
		}
	}
	p := Create(s.Species, level, personality, ivs, s.EVs, ot)
	p.HeldItem = s.Item
	p.Moves = make([]Move, len(s.Moves))
	for i, id := range s.Moves {
		p.Moves[i] = Move{ID: id, PP: MaxPP(id, 0)}
	}
	return p
}
