package world

import (
	"context"
	"time"

	"google.golang.org/protobuf/proto"

	mapv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/map/v1"
	realtimev1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/realtime/v1"
	trainerv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/trainer/v1"
	worldv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/world/v1"
	"pokeuniverse/mic-core/internal/item"
	"pokeuniverse/mic-core/internal/live"
	"pokeuniverse/mic-core/internal/pokemon"
)

// Tick is how often a zone saves what changed and sends it (tech-stack.md#efficient-event-model).
const Tick = 50 * time.Millisecond

// zone runs one map in one phase (ZoneKey): its players' intents, one at a time in its own goroutine (no locks), and a
// tick that saves the changes to Redis in one round trip before sending them
// (saved before shown). It ticks only while it has players.
type zone struct {
	m       *Map
	key     ZoneKey
	w       *World
	inbox   chan func()
	done    chan struct{}
	players map[*Player]struct{}
	ticker  *time.Ticker
	// What the players did this tick that the others see (zone_presence.go).
	events []zoneEvent
	// The zone's Redis hash, and the same zone on the other replicas (zone_bus.go).
	hash   string
	remote remoteState
	stats  zoneStats // zone_stats.go
}

func newZone(w *World, m *Map, key ZoneKey) *zone {
	z := &zone{m: m, key: key, w: w, hash: live.ZoneKey(key.Map, key.Phase), inbox: make(chan func(), 256), done: make(chan struct{}), players: map[*Player]struct{}{}}
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
			z.unsubscribe()
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
			z.tick() // The other replicas hear who left.
			z.unsubscribe()
			z.events = nil // No one left to tell.
			z.emptied()
		}
	}
}

// add puts the player in the zone and tells the others, once it's saved.
func (z *zone) add(p *Player) {
	z.subscribe() // Before the snapshot reads Redis, so nothing published after it is missed.
	z.players[p] = struct{}{}
	z.joined(p)
}

// remove saves the player's last changes, then forgets it and tells the others.
func (z *zone) remove(p *Player) {
	if _, ok := z.players[p]; !ok {
		return
	}
	if p.dirty {
		z.save([]*Player{p})
	}
	if _, ok := z.players[p]; ok { // Not taken over during the save (save already told the others).
		delete(z.players, p)
		z.left(p)
		z.leaveHash(p)
	}
}

// tick saves every player who changed, publishes their events to the other replicas, then sends
// what the local players are waiting for: each player's own answers, then the zone's events
// (local and received) encoded once (phase-8 D7).
func (z *zone) tick() {
	start := time.Now()
	var changed []*Player
	for p := range z.players {
		if z.showChanges(p) {
			p.dirty = true // Its zone entry in Redis changes too.
		}
		if p.dirty {
			changed = append(changed, p)
		}
	}
	z.save(changed)
	events, local := z.takeEvents()
	z.publish(local, time.Now())
	encoded := z.encodeEvents(events)
	for p := range z.players {
		if p.dirty {
			// Not saved (Redis unreachable): retried next tick, nothing shown before.
			if len(events) > 0 {
				p.missedEvents(events)
			}
			continue
		}
		for _, msg := range p.out {
			z.stats.bytes += proto.Size(msg)
			p.sink.Send(msg)
		}
		p.out = p.out[:0]
		if encoded != nil {
			z.stats.bytes += len(encoded)
			p.sink.SendZoneEvents(encoded)
		}
	}
	if len(z.players) > 0 {
		z.ticked(start, len(events))
	}
}

func (z *zone) save(players []*Player) {
	if len(players) == 0 {
		return
	}
	saves := make([]live.Save, len(players))
	for i, p := range players {
		saves[i] = p.save()
		saves[i].Zone, saves[i].Member = z.hash, z.member(p)
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
			z.left(p)
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
	if p.busy() {
		z.correct(p, m.Step)
		return
	}
	turned := p.facing != m.Direction
	if turned {
		p.facing, p.dirty = m.Direction, true
	}
	if CheckStep(z.m, p.pos, p.elevation, m.Direction) != CollisionNone || !p.pace.Allow(at, m.Run && p.canRun) {
		if turned {
			z.turned(p, p.facing) // Bumped: the others see it turn.
		}
		z.correct(p, m.Step)
		return
	}
	to := p.pos.Step(m.Direction)
	p.elevation = ElevationAfter(z.m, p.elevation, p.pos, to)
	p.followStep(p.pos)
	p.pos, p.dirty, p.corrected = to, true, false
	z.moved(p, m.Run && p.canRun)
	z.countFriendshipStep(p)
	z.stepped(p)
}

// countFriendshipStep is UpdateFriendshipStepCounter. A failed save undoes the change.
func (z *zone) countFriendshipStep(p *Player) {
	p.friendshipSteps = (p.friendshipSteps + 1) % pokemon.WalkingFriendshipSteps
	if p.friendshipSteps != 0 {
		return
	}
	party := p.party.Clone()
	if p.party.WalkingFriendship(z.m.ID) && !z.saveTrainer(p, item.Changed{}, true) {
		p.party = party
	}
}

func (z *zone) turn(p *Player, d mapv1.Direction) {
	if _, ok := z.players[p]; !ok || !ValidDirection(d) || p.busy() || p.facing == d {
		return
	}
	p.facing, p.dirty = d, true
	z.turned(p, d)
}

func (z *zone) interact(p *Player, walkInto bool) {
	if _, ok := z.players[p]; !ok {
		return
	}
	reply := &worldv1.Script{}
	if !p.busy() {
		if steps, npc := Interaction(z.m, p.pos, p.facing, walkInto); len(steps) > 0 {
			p.lastScript++
			p.script = p.lastScript
			reply.Id, reply.Steps, reply.Npc = p.script, z.withPlayer(p, steps), npc
		}
	}
	p.queue(&realtimev1.ServerMessage{Payload: &realtimev1.ServerMessage_Script{Script: reply}})
}

// withPlayer fills in what a script's steps show of the player: what their PC stores (which
// also allows its item actions while the script runs) and the messages for a girl. It notes the trainer battle the script
// may start. The scripts' tables stay untouched.
func (z *zone) withPlayer(p *Player, steps Script) Script {
	out := make(Script, len(steps))
	for i, step := range steps {
		if b := step.GetTrainerBattle(); b != nil {
			p.scriptTrainer = b.GetTrainer()
		}
		if step.GetPlayersPc() != nil {
			p.pcScript = p.script
			step = &worldv1.ScriptStep{Action: &worldv1.ScriptStep_PlayersPc{PlayersPc: &worldv1.PlayersPc{Items: p.items.PC.Proto()}}}
		}
		if msg := step.GetMessage(); msg != nil && p.gender == trainerv1.Gender_GENDER_GIRL && girlTexts[msg.Text] != "" {
			step = &worldv1.ScriptStep{Action: &worldv1.ScriptStep_Message{Message: &worldv1.Message{Text: girlTexts[msg.Text], Sign: msg.Sign}}}
		}
		out[i] = step
	}
	return out
}

// correct tells the client where the player really is.
func (z *zone) correct(p *Player, step uint32) {
	z.stats.corrections++
	p.corrected = true
	p.queue(&realtimev1.ServerMessage{Payload: &realtimev1.ServerMessage_Correction{Correction: &worldv1.Correction{
		Step: step, X: uint32(p.pos.X), Y: uint32(p.pos.Y), Facing: p.facing, Follower: p.follower.proto(),
	}}})
}
