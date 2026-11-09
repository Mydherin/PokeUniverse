package pokemon

import (
	pokemonv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/pokemon/v1"
	speciesv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/species/v1"
)

// Stats is one value per stat in FireRed's order (pokemonv1.Stat - 1): HP, ATTACK, DEFENSE,
// SPEED, SP. ATK, SP. DEF.
type Stats [6]int

// MaxIV is the highest IV.
const MaxIV = 31

// StatsFrom reads a contract's six stats.
func StatsFrom(s *pokemonv1.Stats) Stats {
	return Stats{int(s.GetHp()), int(s.GetAttack()), int(s.GetDefense()), int(s.GetSpeed()), int(s.GetSpAttack()), int(s.GetSpDefense())}
}

func (s Stats) Proto() *pokemonv1.Stats {
	return &pokemonv1.Stats{Hp: uint32(s[0]), Attack: uint32(s[1]), Defense: uint32(s[2]), Speed: uint32(s[3]), SpAttack: uint32(s[4]), SpDefense: uint32(s[5])}
}

// CalcStats is the Gen 4 stat formula (CalculateMonStats): HP is
// (2×base + IV + EV/4) × level/100 + level + 10 (always 1 for SHEDINJA); the others
// (2×base + IV + EV/4) × level/100 + 5, by the nature's ×1.1 or ×0.9.
func CalcStats(species speciesv1.Species, base, ivs, evs Stats, level int, nature pokemonv1.Nature) Stats {
	var out Stats
	for i := range out {
		v := (2*base[i] + ivs[i] + evs[i]/4) * level / 100
		if i == 0 {
			out[i] = v + level + 10
			continue
		}
		out[i] = byNature(nature, pokemonv1.Stat(i+1), v+5)
	}
	if species == speciesv1.Species_SPECIES_SHEDINJA {
		out[0] = 1
	}
	return out
}

// byNature is ModifyStatByNature.
func byNature(n pokemonv1.Nature, stat pokemonv1.Stat, v int) int {
	info := natureCatalog[n]
	switch stat {
	case info.GetRaised():
		return v * 110 / 100
	case info.GetLowered():
		return v * 90 / 100
	}
	return v
}
