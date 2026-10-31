package item

import (
	"slices"

	itemv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/item/v1"
)

// PCCapacity is how many different items the PC stores (PC_ITEMS_COUNT).
const PCCapacity = 30

// PC is what the player's PC stores (pcItems): items in the player's order, 999 of each at most.
type PC struct{ slots []Slot }

// StartingPC is a new trainer's PC (NewGameInitPCItems): one POTION.
func StartingPC() *PC {
	pc := &PC{}
	pc.Add(itemv1.Item_ITEM_POTION, 1)
	return pc
}

// Slots is what the PC stores, in order; the caller must not change them.
func (pc *PC) Slots() []Slot { return pc.slots }

func (pc *PC) Clone() *PC { return &PC{slots: slices.Clone(pc.slots)} }

func (pc *PC) Quantity(id itemv1.Item) int { return quantity(pc.slots, id) }

// Add stores n of the item (AddPCItem). False, changing nothing, when it doesn't fit.
func (pc *PC) Add(id itemv1.Item, n int) bool {
	if _, ok := Info(id); !ok {
		return false
	}
	var ok bool
	pc.slots, ok = add(pc.slots, id, n, MaxQuantity, PCCapacity)
	return ok
}

// Remove takes n of the item out (RemovePCItem, ItemPcCompaction). False when it stores fewer.
func (pc *PC) Remove(id itemv1.Item, n int) bool {
	var ok bool
	pc.slots, ok = remove(pc.slots, id, n)
	return ok
}

// Move puts slot `from` before slot `to`, as SELECT does on the WITHDRAW screen.
func (pc *PC) Move(from, to int) bool {
	var ok bool
	pc.slots, ok = move(pc.slots, from, to)
	return ok
}

func (pc *PC) Proto() []*itemv1.BagSlot { return slotsProto(pc.slots) }

// Withdraw takes n of a stored item into the bag (ItemPc_DoWithdraw): nothing moves when the
// bag has no room for them.
func Withdraw(s *State, id itemv1.Item, n int) Result {
	info, ok := Info(id)
	if !ok || n <= 0 || s.PC.Quantity(id) < n {
		return Result{}
	}
	if !s.Bag.Add(id, n) {
		return outcome(itemv1.ItemOutcome_ITEM_OUTCOME_BAG_FULL)
	}
	s.PC.Remove(id, n)
	return Result{Outcome: itemv1.ItemOutcome_ITEM_OUTCOME_WITHDRAWN, Value: n, Changed: Changed{Pockets: []itemv1.Pocket{info.Pocket}, PC: true}}
}

// Deposit stores n of an item from the bag (Task_TryDoItemDeposit). Only the ITEMS pocket can
// be deposited from: DEPOSIT ITEM opens the bag there and doesn't switch pockets.
func Deposit(s *State, id itemv1.Item, n int) Result {
	info, ok := Info(id)
	if !ok || info.Pocket != itemv1.Pocket_POCKET_ITEMS || n <= 0 || s.Bag.Quantity(id) < n {
		return Result{}
	}
	if !s.PC.Add(id, n) {
		return outcome(itemv1.ItemOutcome_ITEM_OUTCOME_PC_FULL)
	}
	s.Bag.Remove(id, n)
	return Result{Outcome: itemv1.ItemOutcome_ITEM_OUTCOME_DEPOSITED, Value: n, Changed: Changed{Pockets: []itemv1.Pocket{info.Pocket}, PC: true}}
}

// GiveFromPC is GIVE on the WITHDRAW screen (Task_ItemPcGive): it needs a party Pokémon.
func GiveFromPC(s *State, id itemv1.Item, f Field) Result {
	if s.PC.Quantity(id) == 0 {
		return Result{}
	}
	if f.PartySize == 0 {
		return outcome(itemv1.ItemOutcome_ITEM_OUTCOME_NO_POKEMON)
	}
	return outcome(itemv1.ItemOutcome_ITEM_OUTCOME_PARTY_MENU)
}
