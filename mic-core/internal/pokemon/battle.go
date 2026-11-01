package pokemon

import (
	pokemonv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/pokemon/v1"
)

// Gen 4's EV caps: per stat and in all.
const (
	MaxStatEV  = 255
	MaxTotalEV = 510
)

// Heal is HealPlayerParty for one Pokémon: full HP and PP, no status.
func (p *Pokemon) Heal() {
	p.HP = p.Stats()[0]
	p.Status = pokemonv1.Status_STATUS_UNSPECIFIED
	for i := range p.Moves {
		p.Moves[i].PP = MaxPP(p.Moves[i].ID, p.Moves[i].PPUps)
	}
}

// Heal heals every Pokémon of the party.
func (pt Party) Heal() {
	for _, p := range pt {
		p.Heal()
	}
}

// CanBattle is whether one of the party can fight (not fainted).
func (pt Party) CanBattle() bool {
	for _, p := range pt {
		if p.HP > 0 {
			return true
		}
	}
	return false
}

// HighestLevel is GetPlayerPartyHighestLevel.
func (pt Party) HighestLevel() int {
	top := 0
	for _, p := range pt {
		top = max(top, p.Level)
	}
	return top
}

// Gain adds what a battle earned: EVs within Gen 4's caps, then experience up to level 100's,
// levelling up as it goes. A level up raises HP by what max HP gained (FireRed's level up); a
// fainted Pokémon stays at 0. Moves learned and evolution come with plans/battles M11.
func (p *Pokemon) Gain(exp int, evs Stats) {
	before := p.Stats()[0]
	total := 0
	for _, v := range p.EVs {
		total += v
	}
	for i, v := range evs {
		add := min(v, MaxStatEV-p.EVs[i], MaxTotalEV-total)
		if add > 0 {
			p.EVs[i] += add
			total += add
		}
	}
	rate := p.info().GetGrowthRate()
	p.Exp = min(p.Exp+exp, ExpAt(rate, MaxLevel))
	p.Level = max(p.Level, LevelAt(rate, p.Exp))
	after := p.Stats()[0]
	if p.HP > 0 {
		p.HP = max(1, min(p.HP+after-before, after))
	}
}
