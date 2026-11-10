package world

import (
	"time"

	mapv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/map/v1"
	realtimev1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/realtime/v1"
	worldv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/world/v1"

	"pokeuniverse/mic-core/internal/item"
)

// UseWarp takes the player through the warp they stand on: out of this map's zone, then into
// the destination's. It runs in the connection's goroutine, which sends every intent one at a
// time: all of this player's earlier intents have run, no zone has the player while `zone`
// changes, and waiting here can't block a zone on another (no deadlock between full inboxes).
func (p *Player) UseWarp(m *worldv1.UseWarp, at time.Time) {
	from := p.zone
	var to *Map
	var spot Point
	from.call(func() { to, spot = from.leaveByWarp(p, m, at) })
	if to == nil {
		return
	}
	w := from.w
	w.mu.Lock()
	if w.closed {
		w.mu.Unlock()
		return // Shutting down: the last saved position is still the warp's tile.
	}
	z := w.zoneOf(to, phaseOf(p, to))
	w.mu.Unlock()
	p.zone = z
	z.call(func() { z.arrive(p, spot) })
}

// leaveByWarp checks the warp as FireRed does (TryArrowWarp: a stair warp's tile, going its way,
// with a warp event) and takes the player out of the zone, its last changes saved. The
// destination map and tile; nil when refused, answered with a Correction like a refused step.
func (z *zone) leaveByWarp(p *Player, m *worldv1.UseWarp, at time.Time) (*Map, Point) {
	if _, ok := z.players[p]; !ok {
		return nil, Point{}
	}
	if from := (Point{int(m.X), int(m.Y)}); from != p.pos {
		if !p.corrected {
			z.correct(p, 0)
		}
		return nil, Point{}
	}
	if p.busy() {
		z.correct(p, 0)
		return nil, Point{}
	}
	if p.facing != m.Direction {
		p.facing, p.dirty = m.Direction, true
	}
	to, spot := z.warpDestination(p.pos)
	// Paced like a step: warping back and forth is no faster than walking.
	if to == nil || CheckStep(z.m, p.pos, p.elevation, m.Direction) != CollisionStairWarp || !p.pace.Allow(at, false) {
		z.correct(p, 0)
		return nil, Point{}
	}
	z.remove(p)
	return to, spot
}

// warpDestination is where the warp on a tile leads; nil when there is none, it's dynamic or it
// leads to a map that isn't written yet.
func (z *zone) warpDestination(at Point) (*Map, Point) {
	warp := z.m.WarpAt(at)
	if warp == nil {
		return nil, Point{}
	}
	to := z.w.maps[warp.ToMap]
	if to == nil {
		return nil, Point{}
	}
	spot := to.warpNamed(warp.ToWarp)
	if spot == nil {
		return nil, Point{}
	}
	return to, Point{int(spot.X), int(spot.Y)}
}

// arrive puts the player on the destination's tile; Warped is sent once that's saved.
func (z *zone) arrive(p *Player, at Point) {
	p.pos, p.facing, p.elevation = at, arrivalFacing(z.m.Behavior(at)), z.m.Elevation(at)
	p.canRun = z.m.AllowRunning && hasRunningShoes
	p.dirty, p.corrected = true, false
	// A map change (LoadMapFromWarp): the encounter state restarts and the flutes stop.
	p.encounter.Reset()
	if p.clearFlute() {
		z.saveTrainer(p, item.Changed{State: true}, false)
	}
	p.placeFollower()
	z.add(p)
	p.queue(&realtimev1.ServerMessage{Payload: &realtimev1.ServerMessage_Warped{Warped: &worldv1.Warped{
		Map: z.m.ID, X: uint32(at.X), Y: uint32(at.Y), Facing: p.facing, CanRun: p.canRun, Follower: p.follower.proto(), Others: z.others(p),
	}}})
}

// arrivalFacing is where the player faces on arriving (GetAdjustedInitialDirection): away from
// the stairs they came up or down; otherwise south.
func arrivalFacing(b mapv1.TileBehavior) mapv1.Direction {
	switch b {
	case mapv1.TileBehavior_TILE_BEHAVIOR_UP_RIGHT_STAIR_WARP, mapv1.TileBehavior_TILE_BEHAVIOR_DOWN_RIGHT_STAIR_WARP:
		return mapv1.Direction_DIRECTION_WEST
	case mapv1.TileBehavior_TILE_BEHAVIOR_UP_LEFT_STAIR_WARP, mapv1.TileBehavior_TILE_BEHAVIOR_DOWN_LEFT_STAIR_WARP:
		return mapv1.Direction_DIRECTION_EAST
	}
	return mapv1.Direction_DIRECTION_SOUTH
}
