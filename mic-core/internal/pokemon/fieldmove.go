package pokemon

import (
	movev1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/move/v1"
	partyv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/party/v1"
)

// fieldMoveRule answers whether the Pokémon can use the move now (sFieldMoveCursorCallbacks).
type fieldMoveRule func(user *Pokemon) partyv1.FieldMoveOutcome

// refuses is a move with nothing to act on yet: Phase 12's maps fill these entries in.
func refuses(outcome partyv1.FieldMoveOutcome) fieldMoveRule {
	return func(*Pokemon) partyv1.FieldMoveOutcome { return outcome }
}

// sharesHP is Milk Drink and Softboiled (SetUpFieldMove_SoftBoiled): more than 1/5 of its HP left.
func sharesHP(user *Pokemon) partyv1.FieldMoveOutcome {
	if user.HP > user.Stats()[0]/5 {
		return partyv1.FieldMoveOutcome_FIELD_MOVE_OUTCOME_CHOOSE_TARGET
	}
	return partyv1.FieldMoveOutcome_FIELD_MOVE_OUTCOME_NOT_ENOUGH_HP
}

// fieldMoves is sFieldMoves, with each move's own refusal.
var fieldMoves = map[movev1.Move]fieldMoveRule{
	movev1.Move_MOVE_FLASH:       refuses(partyv1.FieldMoveOutcome_FIELD_MOVE_OUTCOME_CANT_USE_HERE),
	movev1.Move_MOVE_CUT:         refuses(partyv1.FieldMoveOutcome_FIELD_MOVE_OUTCOME_NOTHING_TO_CUT),
	movev1.Move_MOVE_FLY:         refuses(partyv1.FieldMoveOutcome_FIELD_MOVE_OUTCOME_CANT_USE_HERE),
	movev1.Move_MOVE_STRENGTH:    refuses(partyv1.FieldMoveOutcome_FIELD_MOVE_OUTCOME_CANT_USE_HERE),
	movev1.Move_MOVE_SURF:        refuses(partyv1.FieldMoveOutcome_FIELD_MOVE_OUTCOME_CANT_SURF_HERE),
	movev1.Move_MOVE_ROCK_SMASH:  refuses(partyv1.FieldMoveOutcome_FIELD_MOVE_OUTCOME_CANT_USE_HERE),
	movev1.Move_MOVE_WATERFALL:   refuses(partyv1.FieldMoveOutcome_FIELD_MOVE_OUTCOME_CANT_USE_HERE),
	movev1.Move_MOVE_TELEPORT:    refuses(partyv1.FieldMoveOutcome_FIELD_MOVE_OUTCOME_CANT_USE_HERE),
	movev1.Move_MOVE_DIG:         refuses(partyv1.FieldMoveOutcome_FIELD_MOVE_OUTCOME_CANT_USE_HERE),
	movev1.Move_MOVE_MILK_DRINK:  sharesHP,
	movev1.Move_MOVE_SOFT_BOILED: sharesHP,
	movev1.Move_MOVE_SWEET_SCENT: refuses(partyv1.FieldMoveOutcome_FIELD_MOVE_OUTCOME_CANT_USE_HERE),
}

// UseFieldMove answers the move's rule; with a target, a move that asks for one acts on it. The
// caller saves the party when HP moved.
func (pt Party) UseFieldMove(slot int, move movev1.Move, target *uint32) partyv1.FieldMoveOutcome {
	user := pt.At(slot)
	rule, ok := fieldMoves[move]
	if user == nil || !ok || !user.knows(move) {
		return partyv1.FieldMoveOutcome_FIELD_MOVE_OUTCOME_CANT_USE_HERE
	}
	outcome := rule(user)
	if outcome != partyv1.FieldMoveOutcome_FIELD_MOVE_OUTCOME_CHOOSE_TARGET || target == nil {
		return outcome
	}
	return pt.shareHP(slot, int(*target))
}

// shareHP is Task_TryUseSoftboiledOnPartyMon: the user always pays 1/5 of its maximum HP, even when
// the target needs less.
func (pt Party) shareHP(slot, target int) partyv1.FieldMoveOutcome {
	user, to := pt.At(slot), pt.At(target)
	if to == nil || slot == target || to.HP == 0 || to.HP == to.Stats()[0] {
		return partyv1.FieldMoveOutcome_FIELD_MOVE_OUTCOME_CANT_BE_USED_ON_POKEMON
	}
	amount := user.Stats()[0] / 5
	user.HP -= amount
	to.HP = min(to.HP+amount, to.Stats()[0])
	return partyv1.FieldMoveOutcome_FIELD_MOVE_OUTCOME_HP_SHARED
}

func (p *Pokemon) knows(move movev1.Move) bool {
	for _, m := range p.Moves {
		if m.ID == move {
			return true
		}
	}
	return false
}
