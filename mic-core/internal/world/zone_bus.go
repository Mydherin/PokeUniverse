package world

import (
	"context"
	"time"

	"google.golang.org/protobuf/proto"

	worldv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/world/v1"
	"pokeuniverse/mic-core/internal/live"
)

// Zones across replicas (phase-8 M4): every replica runs its own zone of a map's phase for its
// own players, and the zones of one key share their events over NATS (D2, ZoneBus). A remote
// player's events come only from the replica holding it (`remote`), in that replica's order; a
// player entering reads everyone from Redis (D3, ZoneMembers). A replica that goes silent (no
// batch, no beat) for a session's lifetime crashed: its players leave.

// presenceEvery is how often a zone with players says who they are; a replica not heard from for
// live.SessionTTL (three beats) is gone.
const presenceEvery = 5 * time.Second

// remoteState is what a zone knows of the same zone on the other replicas.
type remoteState struct {
	unsubscribe func()
	// Bumped on every subscription, so messages of an old one that are still queued are dropped.
	gen uint64
	// Remote players by trainer ID → the replica holding them.
	players map[uint64]string
	// When each replica was last heard from.
	heard map[string]time.Time
	// When this zone last sent its beat.
	beat time.Time
}

// subscribe starts listening to the zone's other replicas, when the first player comes in.
func (z *zone) subscribe() {
	if z.remote.unsubscribe != nil {
		return
	}
	z.remote.gen++
	gen := z.remote.gen
	unsubscribe, err := z.w.zoneBus.Subscribe(z.key.Map, z.key.Phase, func(msg *worldv1.ZoneBus) {
		z.do(func() {
			if z.remote.gen == gen {
				z.received(msg)
			}
		})
	})
	if err != nil {
		z.w.log.Error("subscribe zone", "map", z.m.ID, "err", err)
		return
	}
	z.remote.unsubscribe = unsubscribe
	z.remote.players, z.remote.heard, z.remote.beat = map[uint64]string{}, map[string]time.Time{}, time.Time{}
}

// unsubscribe stops listening once the last player left; the remote players are forgotten.
func (z *zone) unsubscribe() {
	if z.remote.unsubscribe == nil {
		return
	}
	z.remote.unsubscribe()
	z.remote.gen++
	z.remote = remoteState{gen: z.remote.gen}
}

// received takes a message of another replica: a batch's events join the next tick's (D7),
// a beat drops the players that replica no longer has.
func (z *zone) received(msg *worldv1.ZoneBus) {
	from := msg.Replica
	z.remote.heard[from] = time.Now()
	switch m := msg.Message.(type) {
	case *worldv1.ZoneBus_Batch:
		for _, ev := range m.Batch.GetEvents() {
			id := zoneEventID(ev)
			switch {
			case ev.GetJoined() != nil:
				z.remote.players[id] = from
			case z.remote.players[id] != from:
				// Not held there (any more): a take-over moved the player to another replica,
				// whose events win.
				continue
			case ev.GetLeft() != nil:
				delete(z.remote.players, id)
			}
			z.events = append(z.events, zoneEvent{ev: ev, remote: true})
		}
	case *worldv1.ZoneBus_Presence:
		has := make(map[uint64]bool, len(m.Presence.GetIds()))
		for _, id := range m.Presence.GetIds() {
			has[id] = true
		}
		for id, r := range z.remote.players {
			if r == from && !has[id] {
				z.remoteLeft(id)
			}
		}
	}
}

// remoteLeft tells the local players a remote player is gone (its replica dropped it, or crashed).
func (z *zone) remoteLeft(id uint64) {
	delete(z.remote.players, id)
	z.events = append(z.events, zoneEvent{ev: &worldv1.ZoneEvent{Event: &worldv1.ZoneEvent_Left{Left: &worldv1.PlayerLeft{Id: id}}}, remote: true})
}

// publish sends the tick's events of this replica's players to the other replicas, then the beat
// when it's due, and drops the players of replicas silent for too long.
func (z *zone) publish(local []*worldv1.ZoneEvent, now time.Time) {
	if z.remote.unsubscribe == nil {
		return
	}
	if len(local) > 0 {
		z.w.zoneBus.Publish(z.key.Map, z.key.Phase, &worldv1.ZoneBus{Message: &worldv1.ZoneBus_Batch{Batch: &worldv1.ZoneEvents{Events: local}}})
	}
	if now.Sub(z.remote.beat) >= presenceEvery && len(z.players) > 0 {
		z.remote.beat = now
		ids := make([]uint64, 0, len(z.players))
		for p := range z.players {
			ids = append(ids, uint64(p.accountID))
		}
		z.w.zoneBus.Publish(z.key.Map, z.key.Phase, &worldv1.ZoneBus{Message: &worldv1.ZoneBus_Presence{Presence: &worldv1.ZonePresence{Ids: ids}}})
		z.prune()
	}
	for r, heard := range z.remote.heard {
		if now.Sub(heard) < live.SessionTTL {
			continue
		}
		delete(z.remote.heard, r)
		for id, held := range z.remote.players {
			if held == r {
				z.remoteLeft(id)
			}
		}
	}
}

// remoteOthers are the zone's players on the other replicas, read from Redis (D3), except the
// IDs in `seen` (the local ones); each is remembered with the replica holding it.
func (z *zone) remoteOthers(seen map[int64]bool) []*worldv1.OtherPlayer {
	if z.remote.unsubscribe == nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	members, err := z.w.live.ZoneMembers(ctx, z.hash)
	if err != nil {
		z.w.log.Error("read zone members", "map", z.m.ID, "err", err)
		return nil
	}
	own := z.w.zoneBus.Replica()
	var out []*worldv1.OtherPlayer
	for _, data := range members {
		var m worldv1.ZoneMember
		if proto.Unmarshal(data, &m) != nil || m.Player == nil || m.Replica == own || seen[int64(m.Player.Id)] {
			continue
		}
		seen[int64(m.Player.Id)] = true
		z.remote.players[m.Player.Id] = m.Replica
		if _, ok := z.remote.heard[m.Replica]; !ok {
			// Never heard from: it has a session's lifetime to speak up.
			z.remote.heard[m.Replica] = time.Now()
		}
		out = append(out, m.Player)
	}
	return out
}

// prune drops the zone's Redis entries whose session is gone (a crashed replica's players who
// didn't come back), even if no one enters to read them.
func (z *zone) prune() {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if _, err := z.w.live.ZoneMembers(ctx, z.hash); err != nil {
		z.w.log.Error("prune zone members", "map", z.m.ID, "err", err)
	}
}

// member is the player's entry in the zone's Redis hash.
func (z *zone) member(p *Player) []byte {
	data, err := proto.Marshal(&worldv1.ZoneMember{Replica: z.w.zoneBus.Replica(), Player: p.asOther()})
	if err != nil {
		z.w.log.Error("marshal zone member", "map", z.m.ID, "err", err)
	}
	return data
}

// leaveHash takes the player out of the zone's Redis hash (warped out, disconnected).
func (z *zone) leaveHash(p *Player) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := z.w.live.LeaveZone(ctx, live.Owner{AccountID: p.accountID, Conn: p.conn}); err != nil {
		// Its next save elsewhere moves the entry, or ZoneMembers drops it once the session ends.
		z.w.log.Error("leave zone hash", "map", z.m.ID, "err", err)
	}
}

// zoneEventID is the player an event is about.
func zoneEventID(ev *worldv1.ZoneEvent) uint64 {
	switch e := ev.Event.(type) {
	case *worldv1.ZoneEvent_Joined:
		return e.Joined.GetPlayer().GetId()
	case *worldv1.ZoneEvent_Left:
		return e.Left.GetId()
	case *worldv1.ZoneEvent_Moved:
		return e.Moved.GetId()
	case *worldv1.ZoneEvent_Turned:
		return e.Turned.GetId()
	case *worldv1.ZoneEvent_Follower:
		return e.Follower.GetId()
	case *worldv1.ZoneEvent_Battle:
		return e.Battle.GetId()
	case *worldv1.ZoneEvent_Chat:
		return e.Chat.GetId()
	}
	return 0
}
