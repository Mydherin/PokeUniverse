package pokemon

import (
	itemv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/item/v1"
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
		p.growFriendship(mapID)
	}
}

// growFriendship is FRIENDSHIP_EVENT_GROW_LEVEL: +5 below 100, +3 below 200, +2 from there, half
// as much again with a SOOTHE BELL, +1 from a LUXURY BALL first, +1 on the map where it was met.
func (p *Pokemon) growFriendship(mapID string) {
	delta := 5
	if p.Friendship >= 200 {
		delta = 2
	} else if p.Friendship >= 100 {
		delta = 3
	}
	if p.Ball == itemv1.Item_ITEM_LUXURY_BALL {
		delta++
	}
	if p.HeldItem == itemv1.Item_ITEM_SOOTHE_BELL {
		delta = delta * 150 / 100
	}
	if p.metOn(mapID) {
		delta++
	}
	p.Friendship = min(p.Friendship+delta, MaxFriendship)
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
