package world

import (
	"cmp"
	"slices"
	"time"

	devv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/dev/v1"
	"pokeuniverse/mic-core/internal/stats"
)

// Zone stats (phase-8 M8): each zone measures its ticks over a 10 s window and logs one line per
// window while it has players; the replica's last lines are GET /api/dev/stats (Stats).

const statsEvery = 10 * time.Second

type zoneStats struct {
	since                              time.Time
	ticks, events                      int
	tickTimes                          []time.Duration
	bytes                              int
	batchesIn, batchesOut, corrections int
	droppedIntents, droppedChats       int
}

// ticked notes one tick that took `took` and sent `events` events, and reports when the window ends.
func (z *zone) ticked(start time.Time, events int) {
	now := time.Now()
	s := &z.stats
	if s.since.IsZero() {
		s.since = start
	}
	s.ticks++
	s.events += events
	s.tickTimes = append(s.tickTimes, now.Sub(start))
	if now.Sub(s.since) < statsEvery {
		return
	}
	window := now.Sub(s.since).Seconds()
	slices.Sort(s.tickTimes)
	r := &devv1.ZoneStats{
		Map: z.key.Map, Phase: uint32(z.key.Phase), LocalPlayers: uint32(len(z.players)), RemotePlayers: uint32(len(z.remote.players)),
		Ticks: uint32(s.ticks), EventsPerTick: float64(s.events) / float64(s.ticks),
		TickP50Us: uint32(percentile(s.tickTimes, 50).Microseconds()), TickP99Us: uint32(percentile(s.tickTimes, 99).Microseconds()),
		BytesPerSecond: uint64(float64(s.bytes) / window), BatchesIn: uint32(s.batchesIn), BatchesOut: uint32(s.batchesOut),
		Corrections: uint32(s.corrections), DroppedIntents: uint32(s.droppedIntents), DroppedChats: uint32(s.droppedChats), At: now.UnixMilli(),
	}
	z.w.log.Info("zone stats", "map", r.Map, "phase", r.Phase, "local", r.LocalPlayers, "remote", r.RemotePlayers,
		"events_per_tick", float64(int(r.EventsPerTick*10))/10, "tick_p50_us", r.TickP50Us, "tick_p99_us", r.TickP99Us,
		"bytes_per_s", r.BytesPerSecond, "nats_in", r.BatchesIn, "nats_out", r.BatchesOut,
		"corrections", r.Corrections, "dropped_intents", r.DroppedIntents, "dropped_chats", r.DroppedChats)
	z.w.statsMu.Lock()
	z.w.zoneStats[z.key] = r
	z.w.statsMu.Unlock()
	z.stats = zoneStats{since: now, tickTimes: s.tickTimes[:0]}
}

// emptied forgets the zone's window once its last player left.
func (z *zone) emptied() {
	z.stats = zoneStats{tickTimes: z.stats.tickTimes[:0]}
	z.w.statsMu.Lock()
	delete(z.w.zoneStats, z.key)
	z.w.statsMu.Unlock()
}

func percentile(sorted []time.Duration, p int) time.Duration {
	if len(sorted) == 0 {
		return 0
	}
	return sorted[(len(sorted)-1)*p/100]
}

// Dropped notes an intent or chat of the player that realtime dropped (stats.Drop).
func (p *Player) Dropped(d stats.Drop) {
	p.zone.do(func() {
		if d == stats.ChatRate || d == stats.ChatInvalid {
			p.zone.stats.droppedChats++
		} else {
			p.zone.stats.droppedIntents++
		}
	})
}

// Stats is the replica's last zone windows and realtime's drops (GET /api/dev/stats).
func (w *World) Stats() *devv1.ReplicaStats {
	w.statsMu.Lock()
	defer w.statsMu.Unlock()
	out := &devv1.ReplicaStats{Replica: w.zoneBus.Replica(), Drops: stats.Drops()}
	for _, s := range w.zoneStats {
		out.Zones = append(out.Zones, s)
	}
	slices.SortFunc(out.Zones, func(a, b *devv1.ZoneStats) int { return cmp.Compare(a.Map, b.Map) })
	return out
}
