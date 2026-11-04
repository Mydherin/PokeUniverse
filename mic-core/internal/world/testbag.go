// Test content (phase-5): removed in Phase 10, when the starter replaces the test team.

package world

import (
	"slices"

	itemv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/item/v1"
	"pokeuniverse/mic-core/internal/item"
)

// testBag: every kind of item BAG uses in battle.
var testBag = []item.Slot{
	{Item: itemv1.Item_ITEM_POTION, Quantity: 5},
	{Item: itemv1.Item_ITEM_SUPER_POTION, Quantity: 5},
	{Item: itemv1.Item_ITEM_HYPER_POTION, Quantity: 5},
	{Item: itemv1.Item_ITEM_MAX_POTION, Quantity: 2},
	{Item: itemv1.Item_ITEM_FULL_RESTORE, Quantity: 2},
	{Item: itemv1.Item_ITEM_MOOMOO_MILK, Quantity: 2},
	{Item: itemv1.Item_ITEM_ANTIDOTE, Quantity: 3},
	{Item: itemv1.Item_ITEM_AWAKENING, Quantity: 3},
	{Item: itemv1.Item_ITEM_FULL_HEAL, Quantity: 3},
	{Item: itemv1.Item_ITEM_OLD_GATEAU, Quantity: 2},
	{Item: itemv1.Item_ITEM_YELLOW_FLUTE, Quantity: 1},
	{Item: itemv1.Item_ITEM_RED_FLUTE, Quantity: 1},
	{Item: itemv1.Item_ITEM_REVIVE, Quantity: 3},
	{Item: itemv1.Item_ITEM_MAX_REVIVE, Quantity: 1},
	{Item: itemv1.Item_ITEM_ETHER, Quantity: 3},
	{Item: itemv1.Item_ITEM_MAX_ETHER, Quantity: 1},
	{Item: itemv1.Item_ITEM_ELIXIR, Quantity: 1},
	{Item: itemv1.Item_ITEM_MAX_ELIXIR, Quantity: 1},
	{Item: itemv1.Item_ITEM_X_ATTACK, Quantity: 2},
	{Item: itemv1.Item_ITEM_X_SPEED, Quantity: 2},
	{Item: itemv1.Item_ITEM_DIRE_HIT, Quantity: 1},
	{Item: itemv1.Item_ITEM_GUARD_SPEC, Quantity: 1},
	{Item: itemv1.Item_ITEM_POKE_BALL, Quantity: 5},
	{Item: itemv1.Item_ITEM_POKE_FLUTE, Quantity: 1},
	{Item: itemv1.Item_ITEM_BERRY_POUCH, Quantity: 1},
	{Item: itemv1.Item_ITEM_ORAN_BERRY, Quantity: 3},
	{Item: itemv1.Item_ITEM_SITRUS_BERRY, Quantity: 3},
	{Item: itemv1.Item_ITEM_LUM_BERRY, Quantity: 3},
	{Item: itemv1.Item_ITEM_LEPPA_BERRY, Quantity: 3},
	{Item: itemv1.Item_ITEM_PERSIM_BERRY, Quantity: 3},
	// Test content (phase-6): removed in Phase 10. Items used on a Pokémon outside battle (M1).
	{Item: itemv1.Item_ITEM_BLUE_FLUTE, Quantity: 1},
	{Item: itemv1.Item_ITEM_ENERGY_POWDER, Quantity: 3},
	{Item: itemv1.Item_ITEM_SACRED_ASH, Quantity: 2},
	{Item: itemv1.Item_ITEM_HP_UP, Quantity: 3},
	{Item: itemv1.Item_ITEM_PROTEIN, Quantity: 12},
	{Item: itemv1.Item_ITEM_PP_UP, Quantity: 4},
	{Item: itemv1.Item_ITEM_PP_MAX, Quantity: 1},
}

// giveTestBag adds the test bag to the items, and says which pockets changed.
func giveTestBag(items *item.State) item.Changed {
	var changed item.Changed
	for _, slot := range testBag {
		info, ok := item.Info(slot.Item)
		if ok && items.Bag.Add(slot.Item, slot.Quantity) && !slices.Contains(changed.Pockets, info.GetPocket()) {
			changed.Pockets = append(changed.Pockets, info.GetPocket())
		}
	}
	return changed
}
