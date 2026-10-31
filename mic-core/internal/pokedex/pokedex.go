// Package pokedex keeps the trainer's Pokédex: whether they have it, the National Pokédex, and
// the species seen and caught (pokedex/v1). Catches and sightings come with battles (Phase 9).
package pokedex

import (
	pokedexv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/pokedex/v1"
	speciesv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/species/v1"
	"pokeuniverse/mic-core/internal/db"
)

// NationalCount is how many species there are: the catalog's last number (the National Pokédex).
var NationalCount = func() int {
	values := speciesv1.Species(0).Descriptor().Values()
	return int(values.Get(values.Len() - 1).Number())
}()

// KantoCount is the Kanto Pokédex: species 1 to 151.
const KantoCount = 151

// Set is a set of species, bit n-1 for species n (least significant bit first), as saved and sent.
type Set []byte

// Has reports whether species n is in the set.
func (s Set) Has(n int) bool {
	i := n - 1
	return n >= 1 && n <= NationalCount && i/8 < len(s) && s[i/8]&(1<<(i%8)) != 0
}

// Count is how many species in 1..upTo are in the set.
func (s Set) Count(upTo int) int {
	c := 0
	for n := 1; n <= upTo; n++ {
		if s.Has(n) {
			c++
		}
	}
	return c
}

// clean drops bits past the last species, so a bad save never shows species that don't exist.
func (s Set) clean() Set {
	size := (NationalCount + 7) / 8
	out := make(Set, size)
	copy(out, s)
	if NationalCount%8 != 0 {
		out[size-1] &= 1<<(NationalCount%8) - 1
	}
	return out
}

// Pokedex is the trainer's.
type Pokedex struct {
	Obtained bool
	National bool
	Seen     Set
	Caught   Set
}

// Load reads it from the trainer's row; caught species count as seen.
func Load(row db.GetTrainerRow) Pokedex {
	seen, caught := Set(row.PokedexSeen).clean(), Set(row.PokedexCaught).clean()
	for i := range seen {
		seen[i] |= caught[i]
	}
	return Pokedex{Obtained: row.PokedexObtained, National: row.PokedexNational, Seen: seen, Caught: caught}
}

// CaughtCount is what the Trainer Card and the main menu show (GetCaughtMonsCount): caught
// species in the National Pokédex once it's enabled, else in Kanto's; unset without a Pokédex.
func (p Pokedex) CaughtCount() *uint32 {
	if !p.Obtained {
		return nil
	}
	upTo := KantoCount
	if p.National {
		upTo = NationalCount
	}
	c := uint32(p.Caught.Count(upTo))
	return &c
}

// Proto is the Pokédex for the world snapshot.
func (p Pokedex) Proto() *pokedexv1.Pokedex {
	return &pokedexv1.Pokedex{Obtained: p.Obtained, National: p.National, Seen: p.Seen, Caught: p.Caught}
}
