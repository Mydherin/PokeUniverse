package pokemon

import (
	"math/rand/v2"

	movev1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/move/v1"
	pokemonv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/pokemon/v1"
)

// Gen 4's EV caps: per stat and in all.
const (
	MaxStatEV  = 255
	MaxTotalEV = 510
)

// MaxFriendship is FireRed's most friendship.
const MaxFriendship = 255

// WalkingFriendshipSteps is how often walking can raise friendship (VAR_HAPPINESS_STEP_COUNTER).
const WalkingFriendshipSteps = 128

// FRIENDSHIP_EVENT_GROW_LEVEL and _WALKING, by how friendly it is now.
var (
	growLevelFriendship  = []int32{5, 3, 2}
	walkingFriendship    = []int32{1, 1, 1}
	leagueFriendship     = []int32{3, 2, 1}
	faintFriendship      = []int32{-1, -1, -1}
	heavyFaintFriendship = []int32{-5, -5, -10}
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

// Able counts the party's Pokémon that can fight (not fainted).
func (pt Party) Able() int {
	n := 0
	for _, p := range pt {
		if p.HP > 0 {
			n++
		}
	}
	return n
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
// levelling up as it goes, with friendship per level (AdjustFriendship). HP is the caller's: the
// battle already raised it.
func (p *Pokemon) Gain(exp int, evs Stats, mapID string) {
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
	for level := LevelAt(rate, p.Exp); p.Level < level; p.Level++ {
		p.changeFriendship(growLevelFriendship, mapID)
	}
}

// ApplyMoves sets its moves as a battle left them, by position: a different one is a new move
// with no PP UPs, accepted only when its species learns it by now (mic-battles decides the rules,
// this guards the save). False when one wasn't accepted. PP stay within each move's maximum.
func (p *Pokemon) ApplyMoves(moves []movev1.Move, pp []uint32) bool {
	ok := true
	for i, id := range moves {
		if i >= MaxMoves {
			break
		}
		if i >= len(p.Moves) || p.Moves[i].ID != id {
			if !p.learnsByLevel(id) {
				ok = false
				continue
			}
			if i >= len(p.Moves) {
				p.Moves = append(p.Moves, Move{})
			}
			p.Moves[i] = Move{ID: id, PP: MaxPP(id, 0)}
		}
	}
	for i, left := range pp {
		if i < len(p.Moves) {
			p.Moves[i].PP = min(int(left), MaxPP(p.Moves[i].ID, p.Moves[i].PPUps))
		}
	}
	return ok
}

func (p *Pokemon) learnsByLevel(id movev1.Move) bool {
	for _, lm := range p.info().GetLevelMoves() {
		if movev1.Move(lm.GetMove()) == id && int(lm.GetLevel()) <= p.Level {
			return true
		}
	}
	return false
}

// metOn: it was met on this map (a fateful encounter has none). FireRed compares region map
// sections, which our maps don't have yet.
func (p *Pokemon) metOn(mapID string) bool {
	return p.MetMap != "" && p.MetMap == mapID
}

// WalkingFriendship is FRIENDSHIP_EVENT_WALKING, every WalkingFriendshipSteps steps: each Pokémon
// has a 50% chance. False when none changed, so there's nothing to save.
func (pt Party) WalkingFriendship(mapID string) bool {
	changed := false
	for _, p := range pt {
		if rand.IntN(2) == 0 {
			continue
		}
		was := p.Friendship
		p.changeFriendship(walkingFriendship, mapID)
		changed = changed || p.Friendship != was
	}
	return changed
}

// LeagueFriendship is FRIENDSHIP_EVENT_LEAGUE_BATTLE: the whole party, facing a gym leader, one of
// the Elite Four or the Champion.
func (pt Party) LeagueFriendship(mapID string) {
	for _, p := range pt {
		p.changeFriendship(leagueFriendship, mapID)
	}
}

// FaintFriendship is UpdateFriendshipFainted for each time it fainted in a battle; heavy against a
// foe far above it.
func (p *Pokemon) FaintFriendship(faints []bool, mapID string) {
	for _, heavy := range faints {
		if heavy {
			p.changeFriendship(heavyFaintFriendship, mapID)
		} else {
			p.changeFriendship(faintFriendship, mapID)
		}
	}
}
