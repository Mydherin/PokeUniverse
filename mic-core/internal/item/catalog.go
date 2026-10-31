// Package item plays the trainer's items: the catalog's rules, the bag and its pockets, what
// using, giving and tossing an item does, and saving it all to PostgreSQL.
package item

import (
	"google.golang.org/protobuf/proto"

	itemv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/item/v1"
)

// catalog is every item's rules, read once from the options on lib-contracts' Item enum.
var catalog = func() map[itemv1.Item]*itemv1.ItemInfo {
	values := itemv1.Item(0).Descriptor().Values()
	out := make(map[itemv1.Item]*itemv1.ItemInfo, values.Len())
	for i := range values.Len() {
		v := values.Get(i)
		if info, ok := proto.GetExtension(v.Options(), itemv1.E_Info).(*itemv1.ItemInfo); ok && info != nil && v.Number() != 0 {
			out[itemv1.Item(v.Number())] = info
		}
	}
	return out
}()

// Info is the item's rules; false for an ID that isn't an item.
func Info(id itemv1.Item) (*itemv1.ItemInfo, bool) {
	info, ok := catalog[id]
	return info, ok
}

// pockets is every pocket, in the order they're saved and sent.
var pockets = []itemv1.Pocket{
	itemv1.Pocket_POCKET_ITEMS, itemv1.Pocket_POCKET_KEY_ITEMS, itemv1.Pocket_POCKET_POKE_BALLS,
	itemv1.Pocket_POCKET_TM_CASE, itemv1.Pocket_POCKET_BERRY_POUCH,
}

// capacity is how many slots each pocket has: one for every item that goes in it, so a pocket
// never runs out of room (FireRed's pockets are smaller; one of each item must fit).
var capacity = func() map[itemv1.Pocket]int {
	out := map[itemv1.Pocket]int{}
	for _, info := range catalog {
		out[info.Pocket]++
	}
	return out
}()
