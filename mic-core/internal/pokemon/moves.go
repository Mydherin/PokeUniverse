package pokemon

import (
	movev1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/move/v1"
	speciesv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/species/v1"
)

// MaxMoves is how many moves a Pokémon knows at most.
const MaxMoves = 4

// Move is one of a Pokémon's moves, with its PP left and the PP UPs used on it.
type Move struct {
	ID    movev1.Move
	PP    int
	PPUps int
}

// MaxPP is the move's PP with its PP UPs (CalculatePPWithBonus): +20% of the base per PP UP.
func MaxPP(m movev1.Move, ppUps int) int {
	info, _ := MoveInfo(m)
	base := int(info.GetPp())
	return base + base*20*ppUps/100
}

// DefaultMoves is what a new Pokémon knows (GiveBoxMonInitialMoveset): its species' level-up
// moves up to its level in order, each new one pushing out the oldest once it knows four.
func DefaultMoves(info *speciesv1.SpeciesInfo, level int) []Move {
	var moves []Move
	for _, lm := range info.GetLevelMoves() {
		if int(lm.GetLevel()) > level {
			break
		}
		id := movev1.Move(lm.GetMove())
		if knows(moves, id) {
			continue
		}
		if len(moves) == MaxMoves {
			moves = moves[1:]
		}
		moves = append(moves, Move{ID: id, PP: MaxPP(id, 0)})
	}
	return moves
}

// IsHM is IsHMMove2 (sHMMoves): a move that can't be forgotten.
func IsHM(id movev1.Move) bool {
	switch id {
	case movev1.Move_MOVE_CUT, movev1.Move_MOVE_FLY, movev1.Move_MOVE_SURF, movev1.Move_MOVE_STRENGTH,
		movev1.Move_MOVE_FLASH, movev1.Move_MOVE_ROCK_SMASH, movev1.Move_MOVE_WATERFALL, movev1.Move_MOVE_DIVE:
		return true
	}
	return false
}

// Replace puts a new move in a slot, with no PP UPs (SetMonMoveSlot, RemoveMonPPBonus). False when
// the slot is empty, it holds an HM or the move is already known.
func (p *Pokemon) Replace(slot int, id movev1.Move) bool {
	if slot < 0 || slot >= len(p.Moves) || IsHM(p.Moves[slot].ID) || knows(p.Moves, id) {
		return false
	}
	p.Moves[slot] = Move{ID: id, PP: MaxPP(id, 0)}
	return true
}

func knows(moves []Move, id movev1.Move) bool {
	for _, m := range moves {
		if m.ID == id {
			return true
		}
	}
	return false
}
