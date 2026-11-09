package world

import (
	mapv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/map/v1"
	realtimev1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/realtime/v1"
	worldv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/world/v1"
)

// follower is the party's lead walking behind the player, as in HeartGold and SoulSilver
// (src/map_object_follow.c, src/follow_mon.c): memory only, never saved.
type follower struct {
	// National Pokédex number; 0: no follower (empty party).
	species uint32
	shiny   bool
	pos     Point
	facing  mapv1.Direction
	// On the player's own tile, not drawn until the player's next step (FollowMon_HideUntilStep).
	hidden bool
}

// placeFollower puts the lead on the player's tile, facing their way, hidden: entering the world
// and arriving from a warp (FollowMon_RecreateForMap).
func (p *Player) placeFollower() {
	p.follower = follower{pos: p.pos, facing: p.facing, hidden: true}
	if lead := p.party.Lead(); lead != nil {
		p.follower.species, p.follower.shiny = uint32(lead.Species), lead.Shiny()
	}
}

// followStep moves the follower after the player stepped off `from`
// (FollowPlayerMovement_StartFollowMonStep): onto that tile, facing the way it went; already there
// (just placed), it stays and shows.
func (p *Player) followStep(from Point) {
	f := &p.follower
	if f.pos != from {
		f.facing = directionTowards(f.pos, from, f.facing)
		f.pos = from
	}
	f.hidden = false
}

// directionTowards is GetDirectionTowards for neighboring tiles; `same` when they're the same.
func directionTowards(from, to Point, same mapv1.Direction) mapv1.Direction {
	switch {
	case to.Y < from.Y:
		return mapv1.Direction_DIRECTION_NORTH
	case to.Y > from.Y:
		return mapv1.Direction_DIRECTION_SOUTH
	case to.X < from.X:
		return mapv1.Direction_DIRECTION_WEST
	case to.X > from.X:
		return mapv1.Direction_DIRECTION_EAST
	}
	return same
}

// syncFollower follows a party change (FollowMon_ChangeMon): another lead keeps the tile; from no
// follower it starts hidden on the player's tile. Sent with the tick's other messages.
func (p *Player) syncFollower() {
	var species uint32
	var shiny bool
	if lead := p.party.Lead(); lead != nil {
		species, shiny = uint32(lead.Species), lead.Shiny()
	}
	if species == p.follower.species && shiny == p.follower.shiny {
		return
	}
	if p.follower.species == 0 {
		p.placeFollower()
	}
	p.follower.species, p.follower.shiny = species, shiny
	p.queue(&realtimev1.ServerMessage{Payload: &realtimev1.ServerMessage_FollowerChanged{FollowerChanged: &worldv1.FollowerChanged{Follower: p.follower.proto()}}})
}

// proto is the follower for the client; nil when there is none.
func (f follower) proto() *worldv1.Follower {
	if f.species == 0 {
		return nil
	}
	return &worldv1.Follower{Species: f.species, Shiny: f.shiny, X: uint32(f.pos.X), Y: uint32(f.pos.Y), Facing: f.facing, Hidden: f.hidden}
}
