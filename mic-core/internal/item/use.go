package item

import (
	itemv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/item/v1"
	mapv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/map/v1"
)

// Flute is the WHITE or BLACK FLUTE in effect (FLAG_SYS_WHITE/BLACK_FLUTE_ACTIVE).
type Flute string

const (
	FluteNone  Flute = "none"
	FluteWhite Flute = "white"
	FluteBlack Flute = "black"
)

// State is everything items change: the bag and what items keep besides it.
type State struct {
	Bag         *Bag
	RepelSteps  int
	Flute       Flute
	Coins       int
	BerryPowder int
}

// Clone copies the state, so a change can be undone when it can't be saved.
func (s *State) Clone() *State {
	c := *s
	c.Bag = s.Bag.Clone()
	return &c
}

// Field is what an item's use depends on around the player, filled in by the world.
type Field struct {
	PartySize     int
	MapType       mapv1.MapType
	AllowCycling  bool
	AllowEscaping bool
	// The player faces water they could fish in.
	FacingWater bool
	// A hidden item is within the ITEMFINDER's range.
	HiddenItemNear bool
	// Used with SELECT on the field rather than from the bag.
	FromField bool
}

// Result is what an action did: the outcome the client shows, and what changed (to save and send).
type Result struct {
	Outcome itemv1.ItemOutcome
	// TOSSED: the quantity; COINS, BERRY_POWDER: the amount.
	Value int
	// Pockets whose slots changed.
	Pockets []itemv1.Pocket
	// The state besides the pockets changed (registered item, repel, flute).
	StateChanged bool
}

func outcome(o itemv1.ItemOutcome) Result { return Result{Outcome: o} }

// use is one FieldUse's effect, the item already known to be in the bag (the strategy per use).
type use func(s *State, id itemv1.Item, info *itemv1.ItemInfo, f Field) Result

func notNow(*State, itemv1.Item, *itemv1.ItemInfo, Field) Result {
	return outcome(itemv1.ItemOutcome_ITEM_OUTCOME_NOT_NOW)
}

func partyMenu(*State, itemv1.Item, *itemv1.ItemInfo, Field) Result {
	return outcome(itemv1.ItemOutcome_ITEM_OUTCOME_PARTY_MENU)
}

func open(*State, itemv1.Item, *itemv1.ItemInfo, Field) Result {
	return outcome(itemv1.ItemOutcome_ITEM_OUTCOME_OPEN)
}

// onFieldIf works on the field when `can` holds, otherwise isn't for now.
func onFieldIf(can func(Field) bool) use {
	return func(_ *State, _ itemv1.Item, _ *itemv1.ItemInfo, f Field) Result {
		if can(f) {
			return outcome(itemv1.ItemOutcome_ITEM_OUTCOME_ON_FIELD)
		}
		return outcome(itemv1.ItemOutcome_ITEM_OUTCOME_NOT_NOW)
	}
}

// uses is FireRed's field use functions (item_use.c), by FieldUse.
var uses = map[itemv1.FieldUse]use{
	itemv1.FieldUse_FIELD_USE_NOT_NOW:        notNow,
	itemv1.FieldUse_FIELD_USE_MEDICINE:       partyMenu,
	itemv1.FieldUse_FIELD_USE_ETHER:          partyMenu,
	itemv1.FieldUse_FIELD_USE_PP_UP:          partyMenu,
	itemv1.FieldUse_FIELD_USE_RARE_CANDY:     partyMenu,
	itemv1.FieldUse_FIELD_USE_EVOLUTION_ITEM: partyMenu,
	itemv1.FieldUse_FIELD_USE_SACRED_ASH:     partyMenu,
	itemv1.FieldUse_FIELD_USE_ENIGMA_BERRY:   partyMenu,
	itemv1.FieldUse_FIELD_USE_MAIL:           open,
	itemv1.FieldUse_FIELD_USE_TOWN_MAP:       open,
	itemv1.FieldUse_FIELD_USE_FAME_CHECKER:   open,
	itemv1.FieldUse_FIELD_USE_TM_CASE:        open,
	itemv1.FieldUse_FIELD_USE_BERRY_POUCH:    open,
	itemv1.FieldUse_FIELD_USE_TEACHY_TV:      open,
	// The field effects (riding, fishing, escaping, rebattling) come with the outdoor maps.
	itemv1.FieldUse_FIELD_USE_BIKE:        onFieldIf(func(f Field) bool { return f.AllowCycling }),
	itemv1.FieldUse_FIELD_USE_ROD:         onFieldIf(func(f Field) bool { return f.FacingWater }),
	itemv1.FieldUse_FIELD_USE_ESCAPE_ROPE: onFieldIf(func(f Field) bool { return f.AllowEscaping }),
	itemv1.FieldUse_FIELD_USE_VS_SEEKER: onFieldIf(func(f Field) bool {
		return f.MapType == mapv1.MapType_MAP_TYPE_ROUTE || f.MapType == mapv1.MapType_MAP_TYPE_TOWN
	}),
	itemv1.FieldUse_FIELD_USE_ITEMFINDER: func(_ *State, _ itemv1.Item, _ *itemv1.ItemInfo, f Field) Result {
		if f.HiddenItemNear {
			return outcome(itemv1.ItemOutcome_ITEM_OUTCOME_ON_FIELD)
		}
		return outcome(itemv1.ItemOutcome_ITEM_OUTCOME_NO_RESPONSE)
	},
	itemv1.FieldUse_FIELD_USE_COIN_CASE: func(s *State, _ itemv1.Item, _ *itemv1.ItemInfo, _ Field) Result {
		return Result{Outcome: itemv1.ItemOutcome_ITEM_OUTCOME_COINS, Value: s.Coins}
	},
	itemv1.FieldUse_FIELD_USE_POWDER_JAR: func(s *State, _ itemv1.Item, _ *itemv1.ItemInfo, _ Field) Result {
		return Result{Outcome: itemv1.ItemOutcome_ITEM_OUTCOME_BERRY_POWDER, Value: s.BerryPowder}
	},
	// Wakes sleeping party Pokémon (none sleep without a party): otherwise a catchy tune.
	itemv1.FieldUse_FIELD_USE_POKE_FLUTE: func(*State, itemv1.Item, *itemv1.ItemInfo, Field) Result {
		return outcome(itemv1.ItemOutcome_ITEM_OUTCOME_CATCHY_TUNE)
	},
	itemv1.FieldUse_FIELD_USE_REPEL: func(s *State, id itemv1.Item, info *itemv1.ItemInfo, _ Field) Result {
		if s.RepelSteps > 0 {
			return outcome(itemv1.ItemOutcome_ITEM_OUTCOME_REPEL_LINGERS)
		}
		s.Bag.Remove(id, 1)
		s.RepelSteps = int(info.Param)
		return Result{Outcome: itemv1.ItemOutcome_ITEM_OUTCOME_USED, Pockets: []itemv1.Pocket{info.Pocket}, StateChanged: true}
	},
	itemv1.FieldUse_FIELD_USE_BLACK_WHITE_FLUTE: func(s *State, id itemv1.Item, _ *itemv1.ItemInfo, _ Field) Result {
		if id == itemv1.Item_ITEM_WHITE_FLUTE {
			s.Flute = FluteWhite
			return Result{Outcome: itemv1.ItemOutcome_ITEM_OUTCOME_WILD_LURED, StateChanged: true}
		}
		s.Flute = FluteBlack
		return Result{Outcome: itemv1.ItemOutcome_ITEM_OUTCOME_WILD_REPELLED, StateChanged: true}
	},
}

// Use is USE (CHECK, OPEN) from the bag, or SELECT on the field (Task_ItemMenuAction_Use):
// items used on a party Pokémon need one; then the item's own effect.
func Use(s *State, id itemv1.Item, f Field) Result {
	info, ok := Info(id)
	if !ok || s.Bag.Quantity(id) == 0 || (f.FromField && s.Bag.Registered != id) {
		return Result{}
	}
	effect := uses[info.FieldUse]
	if effect == nil {
		return Result{}
	}
	if info.Party && f.PartySize == 0 {
		return outcome(itemv1.ItemOutcome_ITEM_OUTCOME_NO_POKEMON)
	}
	return effect(s, id, info, f)
}

// Give is GIVE (Task_ItemMenuAction_Give): important items can't be held; others need a Pokémon.
func Give(s *State, id itemv1.Item, f Field) Result {
	info, ok := Info(id)
	switch {
	case !ok || s.Bag.Quantity(id) == 0:
		return Result{}
	case info.Important:
		return outcome(itemv1.ItemOutcome_ITEM_OUTCOME_CANT_BE_HELD)
	case f.PartySize == 0:
		return outcome(itemv1.ItemOutcome_ITEM_OUTCOME_NO_POKEMON)
	}
	return outcome(itemv1.ItemOutcome_ITEM_OUTCOME_PARTY_MENU)
}

// Toss throws n of the item away; important items can't be tossed.
func Toss(s *State, id itemv1.Item, n int) Result {
	info, ok := Info(id)
	if !ok || info.Important || !s.Bag.Remove(id, n) {
		return Result{}
	}
	return Result{Outcome: itemv1.ItemOutcome_ITEM_OUTCOME_TOSSED, Value: n, Pockets: []itemv1.Pocket{info.Pocket}, StateChanged: true}
}
