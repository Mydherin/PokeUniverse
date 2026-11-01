package pokemon

import (
	partyv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/party/v1"
)

// PartySize is how many Pokémon a party holds at most.
const PartySize = 6

// Party is the trainer's Pokémon, in the player's order.
type Party []*Pokemon

// Clone copies the party, so a change can be undone when it can't be saved.
func (pt Party) Clone() Party {
	c := make(Party, len(pt))
	for i, p := range pt {
		c[i] = p.Clone()
	}
	return c
}

// At is the Pokémon in the slot; nil when the slot is empty.
func (pt Party) At(slot int) *Pokemon {
	if slot < 0 || slot >= len(pt) {
		return nil
	}
	return pt[slot]
}

// Swap is SWITCH: two Pokémon trade places. False when either slot is empty or they're the same.
func (pt Party) Swap(a, b int) bool {
	if a == b || pt.At(a) == nil || pt.At(b) == nil {
		return false
	}
	pt[a], pt[b] = pt[b], pt[a]
	return true
}

// Proto is the party as its trainer sees it.
func (pt Party) Proto() *partyv1.Party {
	out := &partyv1.Party{Pokemon: make([]*partyv1.Pokemon, len(pt))}
	for i, p := range pt {
		out.Pokemon[i] = p.Proto()
	}
	return out
}
