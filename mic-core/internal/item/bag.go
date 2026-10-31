package item

import (
	"slices"

	itemv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/item/v1"
)

// MaxQuantity is the most of one item a slot holds (FireRed's bag).
const MaxQuantity = 999

// Slot is one item in a pocket or the PC, and how many.
type Slot struct {
	Item     itemv1.Item
	Quantity int
}

// Bag is what the trainer carries: each pocket's items in the player's order, one slot per item.
type Bag struct {
	pockets map[itemv1.Pocket][]Slot
	// The item SELECT uses on the field; unspecified: none.
	Registered itemv1.Item
}

func NewBag() *Bag { return &Bag{pockets: map[itemv1.Pocket][]Slot{}} }

// Pocket is a pocket's slots, in order; the caller must not change them.
func (b *Bag) Pocket(p itemv1.Pocket) []Slot { return b.pockets[p] }

// Clone copies the bag, so a change can be undone when it can't be saved.
func (b *Bag) Clone() *Bag {
	c := &Bag{pockets: make(map[itemv1.Pocket][]Slot, len(b.pockets)), Registered: b.Registered}
	for p, slots := range b.pockets {
		c.pockets[p] = slices.Clone(slots)
	}
	return c
}

// Quantity is how many of the item the bag holds.
func (b *Bag) Quantity(id itemv1.Item) int {
	info, ok := Info(id)
	if !ok {
		return 0
	}
	return quantity(b.pockets[info.Pocket], id)
}

// Add puts n of the item in its pocket (AddBagItem): on its slot, or a new one at the end.
// False, changing nothing, when it doesn't fit (999 at most, 1 of an important item).
func (b *Bag) Add(id itemv1.Item, n int) bool {
	info, ok := Info(id)
	if !ok {
		return false
	}
	limit := MaxQuantity
	if info.Important {
		limit = 1
	}
	slots, ok := add(b.pockets[info.Pocket], id, n, limit, capacity[info.Pocket])
	if ok {
		b.pockets[info.Pocket] = slots
	}
	return ok
}

// Remove takes n of the item (RemoveBagItem); an emptied slot leaves its pocket, the rest
// moving up. False, changing nothing, when the bag holds fewer.
func (b *Bag) Remove(id itemv1.Item, n int) bool {
	info, ok := Info(id)
	if !ok {
		return false
	}
	slots, ok := remove(b.pockets[info.Pocket], id, n)
	if !ok {
		return false
	}
	b.pockets[info.Pocket] = slots
	if b.Registered == id && quantity(slots, id) == 0 {
		b.Registered = itemv1.Item_ITEM_UNSPECIFIED
	}
	return true
}

// Move puts the pocket's slot `from` before slot `to` (MoveItemSlotInList; `to` can be the
// slot count: last). False when either is out of the pocket or nothing would move.
func (b *Bag) Move(p itemv1.Pocket, from, to int) bool {
	slots, ok := move(b.pockets[p], from, to)
	if ok {
		b.pockets[p] = slots
	}
	return ok
}

// Register makes the item SELECT's, or none when it already is (REGISTER, DESELECT). False
// when the bag doesn't hold it or it can't be registered.
func (b *Bag) Register(id itemv1.Item) bool {
	info, ok := Info(id)
	if !ok || !info.Registrable || b.Quantity(id) == 0 {
		return false
	}
	if b.Registered == id {
		b.Registered = itemv1.Item_ITEM_UNSPECIFIED
	} else {
		b.Registered = id
	}
	return true
}

// PocketProto is the pocket as sent to the client.
func (b *Bag) PocketProto(p itemv1.Pocket) *itemv1.BagPocket {
	return &itemv1.BagPocket{Pocket: p, Slots: slotsProto(b.pockets[p])}
}

// Proto is the whole bag, for the world snapshot.
func (b *Bag) Proto() *itemv1.Bag {
	out := &itemv1.Bag{Registered: b.Registered}
	for _, p := range pockets {
		if len(b.pockets[p]) > 0 {
			out.Pockets = append(out.Pockets, b.PocketProto(p))
		}
	}
	return out
}
