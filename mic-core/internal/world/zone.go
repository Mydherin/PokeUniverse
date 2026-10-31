package world

import (
	"context"
	"time"

	mapv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/map/v1"
	realtimev1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/realtime/v1"
	worldv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/world/v1"
	"pokeuniverse/mic-core/internal/live"
)

// Tick is how often a zone saves what changed and sends it (tech-stack.md#efficient-event-model).
const Tick = 50 * time.Millisecond

// zone runs one map: its players' intents, one at a time in its own goroutine (no locks), and a
// tick that saves the changes to Redis in one round trip before sending them
// (saved before shown). It ticks only while it has players.
type zone struct {
	m       *Map
	w       *World
	inbox   chan func()
	done    chan struct{}
	players map[*Player]struct{}
	ticker  *time.Ticker
}

func newZone(w *World, m *Map) *zone {
	z := &zone{m: m, w: w, inbox: make(chan func(), 256), done: make(chan struct{}), players: map[*Player]struct{}{}}
	go z.run()
	return z
}

// do runs fn in the zone's goroutine; dropped once the zone stopped.
func (z *zone) do(fn func()) {
	select {
	case z.inbox <- fn:
	case <-z.done:
	}
}

// call runs fn in the zone's goroutine and waits for it.
func (z *zone) call(fn func()) {
	ran := make(chan struct{})
	z.do(func() { fn(); close(ran) })
	select {
	case <-ran:
	case <-z.done:
	}
}

func (z *zone) run() {
	var tick <-chan time.Time
	for {
		select {
		case fn := <-z.inbox:
			fn()
		case <-tick:
			z.tick()
		case <-z.w.stop:
			z.tick()
			close(z.done)
			return
		}
		// Tick only while someone is here.
		switch {
		case len(z.players) > 0 && z.ticker == nil:
			z.ticker = time.NewTicker(Tick)
			tick = z.ticker.C
		case len(z.players) == 0 && z.ticker != nil:
			z.ticker.Stop()
			z.ticker, tick = nil, nil
		}
	}
}

func (z *zone) add(p *Player) { z.players[p] = struct{}{} }

// remove saves the player's last changes, then forgets it.
func (z *zone) remove(p *Player) {
	if _, ok := z.players[p]; !ok {
		return
	}
	if p.dirty {
		z.save([]*Player{p})
	}
	delete(z.players, p)
}

// tick saves every player who changed, then sends what they're waiting for.
func (z *zone) tick() {
	var changed []*Player
	for p := range z.players {
		if p.dirty {
			changed = append(changed, p)
		}
	}
	z.save(changed)
	for p := range z.players {
		if p.dirty {
			continue // Not saved (Redis unreachable): retried next tick, nothing shown before.
		}
		for _, msg := range p.out {
			p.sink.Send(msg)
		}
		p.out = p.out[:0]
	}
}

func (z *zone) save(players []*Player) {
	if len(players) == 0 {
		return
	}
	saves := make([]live.Save, len(players))
	for i, p := range players {
		saves[i] = p.save()
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	owned, err := z.w.live.SaveAll(ctx, saves)
	if err != nil {
		z.w.log.Error("save positions", "map", z.m.ID, "err", err)
		return
	}
	for i, p := range players {
		p.dirty = false
		if !owned[i] {
			// Another connection took the player over: this one stops playing it.
			delete(z.players, p)
			p.sink.Kick()
		}
	}
}

func (z *zone) move(p *Player, m *worldv1.Move, at time.Time) {
	if _, ok := z.players[p]; !ok || !ValidDirection(m.Direction) {
		return
	}
	if from := (Point{int(m.X), int(m.Y)}); from != p.pos {
		// A step predicted from where the client wrongly thought it was.
		if !p.corrected {
			z.correct(p, m.Step)
		}
		return
	}
	if p.script != 0 {
		z.correct(p, m.Step)
		return
	}
	if p.facing != m.Direction {
		p.facing, p.dirty = m.Direction, true
	}
	if CheckStep(z.m, p.pos, p.elevation, m.Direction) != CollisionNone || !p.pace.Allow(at, m.Run && p.canRun) {
		z.correct(p, m.Step)
		return
	}
	to := p.pos.Step(m.Direction)
	p.elevation = ElevationAfter(z.m, p.elevation, p.pos, to)
	p.pos, p.dirty, p.corrected = to, true, false
}

func (z *zone) turn(p *Player, d mapv1.Direction) {
	if _, ok := z.players[p]; !ok || !ValidDirection(d) || p.script != 0 || p.facing == d {
		return
	}
	p.facing, p.dirty = d, true
}

func (z *zone) interact(p *Player, walkInto bool) {
	if _, ok := z.players[p]; !ok {
		return
	}
	reply := &worldv1.Script{}
	if p.script == 0 {
		if steps := Interaction(z.m, p.pos, p.facing, walkInto); len(steps) > 0 {
			p.lastScript++
			p.script = p.lastScript
			reply.Id, reply.Steps = p.script, steps
		}
	}
	p.queue(&realtimev1.ServerMessage{Payload: &realtimev1.ServerMessage_Script{Script: reply}})
}

// correct tells the client where the player really is.
func (z *zone) correct(p *Player, step uint32) {
	p.corrected = true
	p.queue(&realtimev1.ServerMessage{Payload: &realtimev1.ServerMessage_Correction{Correction: &worldv1.Correction{
		Step: step, X: uint32(p.pos.X), Y: uint32(p.pos.Y), Facing: p.facing,
	}}})
}
