package world

import (
	"google.golang.org/protobuf/proto"

	mapv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/map/v1"
	realtimev1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/realtime/v1"
	worldv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/world/v1"
)

// Zone presence (phase-8 M2): what the players of a zone see of each other. Every change a player
// makes that the others see is buffered as a ZoneEvent; each tick the events of the players
// saved in it are encoded once and the same bytes go to every player in the zone (D7). A client
// ignores events with its own id.
//
// Players don't block each other (D6): CheckStep (rules.go) looks at the map only, never at
// other players, so a step through another player stays valid.

// zoneEvent is a buffered event and the player it is about: it waits while that player has
// changes not saved yet (saved before shown).
type zoneEvent struct {
	p  *Player
	ev *worldv1.ZoneEvent
}

func (z *zone) emit(p *Player, ev *worldv1.ZoneEvent) {
	z.events = append(z.events, zoneEvent{p, ev})
}

// asOther is the player as the others in its zone see it.
func (p *Player) asOther() *worldv1.OtherPlayer {
	return &worldv1.OtherPlayer{Id: uint64(p.accountID), Name: p.name, Gender: p.gender, X: uint32(p.pos.X), Y: uint32(p.pos.Y),
		Facing: p.facing, Follower: p.follower.proto(), InBattle: p.shownBattle}
}

// others are the zone's players as `self` sees them: never itself, nor an older connection of
// the same trainer that hasn't left yet (a reconnect).
func (z *zone) others(self *Player) []*worldv1.OtherPlayer {
	seen := map[int64]bool{self.accountID: true}
	out := make([]*worldv1.OtherPlayer, 0, len(z.players))
	for o := range z.players {
		if !seen[o.accountID] {
			seen[o.accountID] = true
			out = append(out, o.asOther())
		}
	}
	return out
}

// joined tells the zone the player came in.
func (z *zone) joined(p *Player) {
	p.shownBattle = p.battle != nil
	z.emit(p, &worldv1.ZoneEvent{Event: &worldv1.ZoneEvent_Joined{Joined: &worldv1.PlayerJoined{Player: p.asOther()}}})
}

// left tells the zone the player went away, unless a newer connection of the same trainer is
// still here (a reconnect: the old one leaves after the new one joined).
func (z *zone) left(p *Player) {
	for o := range z.players {
		if o != p && o.accountID == p.accountID {
			return
		}
	}
	z.emit(p, &worldv1.ZoneEvent{Event: &worldv1.ZoneEvent_Left{Left: &worldv1.PlayerLeft{Id: uint64(p.accountID)}}})
}

func (z *zone) moved(p *Player, run bool) {
	z.emit(p, &worldv1.ZoneEvent{Event: &worldv1.ZoneEvent_Moved{Moved: &worldv1.PlayerMoved{
		Id: uint64(p.accountID), X: uint32(p.pos.X), Y: uint32(p.pos.Y), Facing: p.facing, Run: run}}})
}

func (z *zone) turned(p *Player, facing mapv1.Direction) {
	z.emit(p, &worldv1.ZoneEvent{Event: &worldv1.ZoneEvent_Turned{Turned: &worldv1.PlayerTurned{Id: uint64(p.accountID), Facing: facing}}})
}

// showChanges, for a saved player, adds the events of what changed without an intent of its
// own: the follower (a party change) and entering or leaving a battle (D9). Battles start and
// end in many places (launch, finish, a failed start, a dropped connection); comparing here
// catches them all, once saved.
func (z *zone) showChanges(p *Player) {
	if p.syncFollower() {
		z.emit(p, &worldv1.ZoneEvent{Event: &worldv1.ZoneEvent_Follower{Follower: &worldv1.PlayerFollower{Id: uint64(p.accountID), Follower: p.follower.proto()}}})
	}
	if in := p.battle != nil; in != p.shownBattle {
		p.shownBattle = in
		z.emit(p, &worldv1.ZoneEvent{Event: &worldv1.ZoneEvent_Battle{Battle: &worldv1.PlayerBattle{Id: uint64(p.accountID), InBattle: in}}})
	}
}

// takeEvents returns the tick's events ready to show, in order, and keeps those of players still
// in the zone with unsaved changes (Redis unreachable) for the next tick.
func (z *zone) takeEvents() []*worldv1.ZoneEvent {
	if len(z.events) == 0 {
		return nil
	}
	var ready []*worldv1.ZoneEvent
	kept := z.events[:0]
	for _, e := range z.events {
		if _, in := z.players[e.p]; in && e.p.dirty {
			kept = append(kept, e)
			continue
		}
		ready = append(ready, e.ev)
	}
	clear(z.events[len(kept):])
	z.events = kept
	return ready
}

// encodeEvents marshals the tick's ZoneEvents once for the whole zone; nil when there are none.
func (z *zone) encodeEvents(events []*worldv1.ZoneEvent) []byte {
	if len(events) == 0 {
		return nil
	}
	data, err := proto.Marshal(&worldv1.ZoneEvents{Events: events})
	if err != nil {
		z.w.log.Error("marshal zone events", "map", z.m.ID, "err", err)
		return nil
	}
	return data
}

// missedEvents keeps the tick's events for a player not saved this tick: they're sent after its
// own answers once it is (rare: Redis unreachable), encoded for it alone.
func (p *Player) missedEvents(events []*worldv1.ZoneEvent) {
	p.queue(&realtimev1.ServerMessage{Payload: &realtimev1.ServerMessage_ZoneEvents{ZoneEvents: &worldv1.ZoneEvents{Events: events}}})
}
