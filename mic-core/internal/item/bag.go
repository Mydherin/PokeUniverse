package item

import (
	"slices"

	itemv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/item/v1"
)

// MaxQuantity is the most of one item a slot holds (FireRed's bag).
const MaxQuantity = 999

// Slot is one item in a pocket and how many.
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

// Starting is a new trainer's bag. Phase 4 testing: every item, 5 of each (1 of important ones),
// so every item can be seen and tried; FireRed starts empty (with a POTION in the PC).
func Starting() *Bag {
	b := NewBag()
	values := itemv1.Item(0).Descriptor().Values()
	for i := range values.Len() {
		id := itemv1.Item(values.Get(i).Number())
		if info, ok := Info(id); ok {
			n := 5
			if info.Important {
				n = 1
			}
			b.Add(id, n)
		}
	}
	return b
}

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

// find is the item's pocket and slot; ok is false when the bag doesn't hold it.
func (b *Bag) find(id itemv1.Item) (itemv1.Pocket, int, bool) {
	info, ok := Info(id)
	if !ok {
		return 0, 0, false
	}
	i := slices.IndexFunc(b.pockets[info.Pocket], func(s Slot) bool { return s.Item == id })
	return info.Pocket, i, i >= 0
}

// Quantity is how many of the item the bag holds.
func (b *Bag) Quantity(id itemv1.Item) int {
	p, i, ok := b.find(id)
	if !ok {
		return 0
	}
	return b.pockets[p][i].Quantity
}

// Add puts n of the item in its pocket (AddBagItem): on its slot, or a new one at the end.
// False, changing nothing, when it doesn't fit (999 at most, 1 of an important item).
func (b *Bag) Add(id itemv1.Item, n int) bool {
	info, ok := Info(id)
	if !ok || n <= 0 {
		return false
	}
	limit := MaxQuantity
	if info.Important {
		limit = 1
	}
	p, i, held := b.find(id)
	switch {
	case held && b.pockets[p][i].Quantity+n <= limit:
		b.pockets[p][i].Quantity += n
	case !held && n <= limit && len(b.pockets[p]) < capacity[p]:
		b.pockets[p] = append(b.pockets[p], Slot{id, n})
	default:
		return false
	}
	return true
}

// Remove takes n of the item (RemoveBagItem); an emptied slot leaves its pocket, the rest
// moving up. False, changing nothing, when the bag holds fewer.
func (b *Bag) Remove(id itemv1.Item, n int) bool {
	p, i, held := b.find(id)
	if !held || n <= 0 || b.pockets[p][i].Quantity < n {
		return false
	}
	if b.pockets[p][i].Quantity -= n; b.pockets[p][i].Quantity == 0 {
		b.pockets[p] = slices.Delete(b.pockets[p], i, i+1)
		if b.Registered == id {
			b.Registered = itemv1.Item_ITEM_UNSPECIFIED
		}
	}
	return true
}

// Move puts the pocket's slot `from` before slot `to` (MoveItemSlotInList; `to` can be the
// slot count: last). False when either is out of the pocket or nothing would move.
func (b *Bag) Move(p itemv1.Pocket, from, to int) bool {
	slots := b.pockets[p]
	if from < 0 || from >= len(slots) || to < 0 || to > len(slots) || to == from || to == from+1 {
		return false
	}
	s := slots[from]
	if to > from {
		to--
	}
	slots = slices.Delete(slots, from, from+1)
	b.pockets[p] = slices.Insert(slots, to, s)
	return true
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
	out := &itemv1.BagPocket{Pocket: p, Slots: make([]*itemv1.BagSlot, len(b.pockets[p]))}
	for i, s := range b.pockets[p] {
		out.Slots[i] = &itemv1.BagSlot{Item: s.Item, Quantity: uint32(s.Quantity)}
	}
	return out
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
