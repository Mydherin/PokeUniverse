package item

import itemv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/item/v1"

// Held items: what giving a party Pokémon an item to hold, or taking it, does to the bag and the
// PC (party_menu.c). The Pokémon's side is the caller's: each takes what it holds now and returns
// what it holds afterwards.

const none = itemv1.Item_ITEM_UNSPECIFIED

// Hold gives a Pokémon holding `held` one of the item, from the bag or the PC (CB2_GiveHoldItem;
// after YES when it already holds one, the two are switched: its item back into the bag).
func Hold(s *State, id itemv1.Item, fromPC bool, held itemv1.Item) (Result, itemv1.Item) {
	info, ok := Info(id)
	switch {
	case !ok || (fromPC && s.PC.Quantity(id) == 0) || (!fromPC && s.Bag.Quantity(id) == 0):
		return Result{}, held
	case info.Important:
		return outcome(itemv1.ItemOutcome_ITEM_OUTCOME_CANT_BE_HELD), held
	case IsMail(held):
		return outcome(itemv1.ItemOutcome_ITEM_OUTCOME_REMOVE_MAIL), held
	}
	// Changed on a copy: a held item the bag can't take back changes nothing.
	work := s.Clone()
	res := Result{Outcome: itemv1.ItemOutcome_ITEM_OUTCOME_GIVEN}
	if fromPC {
		work.PC.Remove(id, 1)
		res.PC = true
	} else {
		work.Bag.Remove(id, 1)
		res.Pockets, res.State = []itemv1.Pocket{info.Pocket}, true
	}
	if held != none {
		if !work.Bag.Add(held, 1) {
			return outcome(itemv1.ItemOutcome_ITEM_OUTCOME_BAG_FULL), held
		}
		heldInfo, _ := Info(held)
		res.Outcome, res.Value = itemv1.ItemOutcome_ITEM_OUTCOME_SWAPPED, int(held)
		if fromPC || heldInfo.Pocket != info.Pocket {
			res.Pockets = append(res.Pockets, heldInfo.Pocket)
		}
	}
	*s = *work
	return res, id
}

// TakeHeld is TAKE (TryTakeMonItem): the Pokémon's item into the bag, when it fits.
func TakeHeld(s *State, held itemv1.Item) (Result, itemv1.Item) {
	info, ok := Info(held)
	switch {
	case held == none || !ok:
		return outcome(itemv1.ItemOutcome_ITEM_OUTCOME_NOT_HOLDING), held
	case !s.Bag.Add(held, 1):
		return outcome(itemv1.ItemOutcome_ITEM_OUTCOME_BAG_FULL), held
	}
	return Result{Outcome: itemv1.ItemOutcome_ITEM_OUTCOME_TAKEN, Changed: Changed{Pockets: []itemv1.Pocket{info.Pocket}}}, none
}

// IsMail is ItemIsMail. Writing and reading mail come with the mail screens; until then MAIL is
// held like any item, but must be taken before another is given.
func IsMail(id itemv1.Item) bool {
	info, ok := Info(id)
	return ok && info.FieldUse == itemv1.FieldUse_FIELD_USE_MAIL
}
