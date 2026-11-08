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

// SwapMoves is SWITCH on the summary's move page: two of a Pokémon's moves trade places, each
// with its PP and PP UPs. False when either move or the Pokémon is missing, or they're the same.
func (pt Party) SwapMoves(slot, a, b int) bool {
	p := pt.At(slot)
	if p == nil || a == b || a < 0 || b < 0 || a >= len(p.Moves) || b >= len(p.Moves) {
		return false
	}
	p.Moves[a], p.Moves[b] = p.Moves[b], p.Moves[a]
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

// Lead is the Pokémon that walks behind the trainer (HeartGold's FollowMon_InitMapObject): the first
// that isn't fainted; nil when none can fight (FollowMon_IsActive) or the party is empty.
func (pt Party) Lead() *Pokemon {
	for _, p := range pt {
		if p.HP > 0 {
			return p
		}
	}
	return nil
}
