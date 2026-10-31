package world

import (
	"time"

	mapv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/map/v1"
)

// Movement rules, as FireRed moves the player on foot (field_player_avatar.c, CheckForObjectEventCollision).
// spa-pokeuniverse predicts with the same rules (src/game/world/rules.ts): keep both in step.

// Collision is what stops a step.
type Collision int

const (
	CollisionNone Collision = iota
	// A wall, the map's edge, a one-way tile or another elevation: the player bumps.
	CollisionBlocked
	// Standing on a stair warp and facing its way: the player only turns (the warp itself comes
	// with map changes).
	CollisionStairWarp
)

// CheckStep tells what stops a step from `from` in direction d, at the player's elevation.
func CheckStep(m *Map, from Point, elevation byte, d mapv1.Direction) Collision {
	if isStairWarp(m.Behavior(from), d) {
		return CollisionStairWarp
	}
	to := from.Step(d)
	if !m.Walkable(to) || leaveBlocked(m.Behavior(from), d) || enterBlocked(m.Behavior(to), d) ||
		elevationMismatch(elevation, m.Elevation(to)) {
		return CollisionBlocked
	}
	return CollisionNone
}

// ElevationAfter is the player's elevation after stepping from `from` to `to`
// (ObjectEventUpdateElevation): elevation 15 cells (bridges) keep the previous one.
func ElevationAfter(m *Map, elevation byte, from, to Point) byte {
	if cur, prev := m.Elevation(to), m.Elevation(from); cur != 15 && prev != 15 {
		return cur
	}
	return elevation
}

// elevationMismatch: elevations 0 and 15 connect to every elevation.
func elevationMismatch(current, target byte) bool {
	return current != 0 && target != 0 && target != 15 && target != current
}

// leaveBlocked: a one-way tile can't be left toward its blocked side.
func leaveBlocked(b mapv1.TileBehavior, d mapv1.Direction) bool {
	return b == impassable[d]
}

// enterBlocked: a one-way tile can't be entered through its blocked side.
func enterBlocked(b mapv1.TileBehavior, d mapv1.Direction) bool {
	return b == impassable[opposite[d]]
}

var impassable = map[mapv1.Direction]mapv1.TileBehavior{
	mapv1.Direction_DIRECTION_NORTH: mapv1.TileBehavior_TILE_BEHAVIOR_IMPASSABLE_NORTH,
	mapv1.Direction_DIRECTION_SOUTH: mapv1.TileBehavior_TILE_BEHAVIOR_IMPASSABLE_SOUTH,
	mapv1.Direction_DIRECTION_WEST:  mapv1.TileBehavior_TILE_BEHAVIOR_IMPASSABLE_WEST,
	mapv1.Direction_DIRECTION_EAST:  mapv1.TileBehavior_TILE_BEHAVIOR_IMPASSABLE_EAST,
}

var opposite = map[mapv1.Direction]mapv1.Direction{
	mapv1.Direction_DIRECTION_NORTH: mapv1.Direction_DIRECTION_SOUTH,
	mapv1.Direction_DIRECTION_SOUTH: mapv1.Direction_DIRECTION_NORTH,
	mapv1.Direction_DIRECTION_WEST:  mapv1.Direction_DIRECTION_EAST,
	mapv1.Direction_DIRECTION_EAST:  mapv1.Direction_DIRECTION_WEST,
}

func isStairWarp(b mapv1.TileBehavior, d mapv1.Direction) bool {
	switch d {
	case mapv1.Direction_DIRECTION_WEST:
		return b == mapv1.TileBehavior_TILE_BEHAVIOR_UP_LEFT_STAIR_WARP || b == mapv1.TileBehavior_TILE_BEHAVIOR_DOWN_LEFT_STAIR_WARP
	case mapv1.Direction_DIRECTION_EAST:
		return b == mapv1.TileBehavior_TILE_BEHAVIOR_UP_RIGHT_STAIR_WARP || b == mapv1.TileBehavior_TILE_BEHAVIOR_DOWN_RIGHT_STAIR_WARP
	}
	return false
}

// Step durations: FireRed moves 1 pixel per frame walking and 2 running, 16 pixels per tile.
const (
	frame     = time.Second * 10000 / 597275 // 59.7275 frames per second
	walkStep  = 16 * frame
	runStep   = 8 * frame
	maxBanked = 250 * time.Millisecond // late steps may catch up by this much (network jitter)
	maxAhead  = 300 * time.Millisecond // steps may arrive this early (bunched by the network)
)

// Pace keeps a player's steps at most as fast as the game allows, with room for network jitter:
// a speed hack gains at most maxAhead + maxBanked, once.
type Pace struct{ readyAt time.Time }

// Allow reports whether a step received at `at` may start, and books it.
func (p *Pace) Allow(at time.Time, run bool) bool {
	start := p.readyAt
	if floor := at.Add(-maxBanked); start.Before(floor) {
		start = floor
	}
	if start.After(at.Add(maxAhead)) {
		return false
	}
	d := walkStep
	if run {
		d = runStep
	}
	p.readyAt = start.Add(d)
	return true
}
