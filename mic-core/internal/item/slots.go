package item

import (
	"slices"

	itemv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/item/v1"
)

// The lists of items in the player's order, one slot per item, that a bag pocket and the PC
// share. Each change returns the new list and whether it was made; a refused one changes nothing.

func index(slots []Slot, id itemv1.Item) int {
	return slices.IndexFunc(slots, func(s Slot) bool { return s.Item == id })
}

func quantity(slots []Slot, id itemv1.Item) int {
	if i := index(slots, id); i >= 0 {
		return slots[i].Quantity
	}
	return 0
}

// add puts n of the item on its slot, or a new one at the end: at most `limit` on a slot and
// `capacity` slots.
func add(slots []Slot, id itemv1.Item, n, limit, capacity int) ([]Slot, bool) {
	if n <= 0 {
		return slots, false
	}
	switch i := index(slots, id); {
	case i >= 0 && slots[i].Quantity+n <= limit:
		slots[i].Quantity += n
	case i < 0 && n <= limit && len(slots) < capacity:
		slots = append(slots, Slot{id, n})
	default:
		return slots, false
	}
	return slots, true
}

// remove takes n of the item; an emptied slot leaves the list, the rest moving up.
func remove(slots []Slot, id itemv1.Item, n int) ([]Slot, bool) {
	i := index(slots, id)
	if i < 0 || n <= 0 || slots[i].Quantity < n {
		return slots, false
	}
	if slots[i].Quantity -= n; slots[i].Quantity == 0 {
		slots = slices.Delete(slots, i, i+1)
	}
	return slots, true
}

// move puts slot `from` before slot `to` (MoveItemSlotInList; `to` can be the slot count:
// last). Refused when either is out of the list or nothing would move.
func move(slots []Slot, from, to int) ([]Slot, bool) {
	if from < 0 || from >= len(slots) || to < 0 || to > len(slots) || to == from || to == from+1 {
		return slots, false
	}
	s := slots[from]
	if to > from {
		to--
	}
	slots = slices.Delete(slots, from, from+1)
	return slices.Insert(slots, to, s), true
}

func slotsProto(slots []Slot) []*itemv1.BagSlot {
	out := make([]*itemv1.BagSlot, len(slots))
	for i, s := range slots {
		out[i] = &itemv1.BagSlot{Item: s.Item, Quantity: uint32(s.Quantity)}
	}
	return out
}
