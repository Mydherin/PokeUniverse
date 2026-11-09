package pokemon

import speciesv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/species/v1"

// MaxLevel is the highest level.
const MaxLevel = 100

// expTables is the experience each level starts at, per growth rate (gExperienceTables), with
// Gen 4's 0 at level 1 (FireRed's tables say 1).
var expTables = func() map[speciesv1.GrowthRate][MaxLevel + 1]int {
	formulas := map[speciesv1.GrowthRate]func(n int) int{
		speciesv1.GrowthRate_GROWTH_RATE_MEDIUM_FAST: func(n int) int { return n * n * n },
		speciesv1.GrowthRate_GROWTH_RATE_ERRATIC: func(n int) int {
			switch {
			case n <= 50:
				return (100 - n) * n * n * n / 50
			case n <= 68:
				return (150 - n) * n * n * n / 100
			case n <= 98:
				return (1911 - 10*n) / 3 * n * n * n / 500
			}
			return (160 - n) * n * n * n / 100
		},
		speciesv1.GrowthRate_GROWTH_RATE_FLUCTUATING: func(n int) int {
			switch {
			case n <= 15:
				return ((n+1)/3 + 24) * n * n * n / 50
			case n <= 36:
				return (n + 14) * n * n * n / 50
			}
			return (n/2 + 32) * n * n * n / 50
		},
		speciesv1.GrowthRate_GROWTH_RATE_MEDIUM_SLOW: func(n int) int { return 6*n*n*n/5 - 15*n*n + 100*n - 140 },
		speciesv1.GrowthRate_GROWTH_RATE_FAST:        func(n int) int { return 4 * n * n * n / 5 },
		speciesv1.GrowthRate_GROWTH_RATE_SLOW:        func(n int) int { return 5 * n * n * n / 4 },
	}
	out := make(map[speciesv1.GrowthRate][MaxLevel + 1]int, len(formulas))
	for rate, exp := range formulas {
		var t [MaxLevel + 1]int
		for n := 2; n <= MaxLevel; n++ {
			t[n] = exp(n)
		}
		out[rate] = t
	}
	return out
}()

// ExpAt is the experience the level starts at.
func ExpAt(rate speciesv1.GrowthRate, level int) int {
	return expTables[rate][min(max(level, 1), MaxLevel)]
}

// LevelAt is the level the experience reaches (GetLevelFromMonExp).
func LevelAt(rate speciesv1.GrowthRate, exp int) int {
	t := expTables[rate]
	level := 1
	for level < MaxLevel && t[level+1] <= exp {
		level++
	}
	return level
}
