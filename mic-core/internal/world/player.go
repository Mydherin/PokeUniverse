package world

import (
	"sync/atomic"
	"time"

	mapv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/map/v1"
	realtimev1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/realtime/v1"
	trainerv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/trainer/v1"
	worldv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/world/v1"
	"pokeuniverse/mic-core/internal/item"
	"pokeuniverse/mic-core/internal/live"
	"pokeuniverse/mic-core/internal/pokedex"
	"pokeuniverse/mic-core/internal/pokemon"
)

// Sink is a player's connection: Send queues a message without blocking; Kick closes the
// connection because the player is now played from another one.
type Sink interface {
	Send(msg *realtimev1.ServerMessage)
	Kick()
}

// Player is one online trainer. Its methods are called by the connection's goroutine and run
// in its zone's goroutine, which alone owns the fields below `zone`. Only the connection's
// goroutine changes `zone`, while no zone has the player (UseWarp).
type Player struct {
	accountID int64
	conn      string
	gen       int64
	sink      Sink
	zone      *zone
	// When its play time was last counted (Unix nanoseconds); swapped by keep-alive and Leave.
	counted atomic.Int64

	pos       Point
	facing    mapv1.Direction
	elevation byte
	canRun    bool
	pace      Pace
	// Moved or turned since the last save.
	dirty bool
	// A Correction is on its way: steps from elsewhere are ignored silently until the client
	// steps from where the server says it is.
	corrected bool
	// The script the client is showing (0: none); the player can't act until it ends.
	script     uint32
	lastScript uint32
	// The script running the player's PC menu (0: none): its item actions are allowed while it runs.
	pcScript uint32
	// The bag and what items keep; saved to PostgreSQL on every change.
	items *item.State
	// The trainer's Pokémon; saved to PostgreSQL on every change.
	party pokemon.Party
	// Steps toward the next walking friendship; saved on leaving, not every step.
	friendshipSteps int
	// What a won battle left to do while its script goes on (memory only: leaving loses it, as a
	// reset does).
	evolving evolving
	// Species seen and caught; saved with the battle or the evolution that changed it.
	pokedex pokedex.Pokedex
	gender  trainerv1.Gender
	// The trainer's ID (traded Pokémon) and money.
	trainerID uint32
	money     int
	// The trainer battle the running script may start (its TrainerBattle step); "" when none.
	scriptTrainer string
	// The battle the player is in; nil when none. It blocks moves and every other action.
	battle *inBattle
	// Messages waiting for the next tick, sent once the state they show is saved.
	out []*realtimev1.ServerMessage
}

// Move is a predicted step, received at `at`.
func (p *Player) Move(m *worldv1.Move, at time.Time) { p.zone.do(func() { p.zone.move(p, m, at) }) }

// Turn faces a direction without moving.
func (p *Player) Turn(t *worldv1.Turn) { p.zone.do(func() { p.zone.turn(p, t.Direction) }) }

// Interact checks what the player faces; always answered with a Script, empty when nothing answers.
func (p *Player) Interact(i *worldv1.Interact) { p.zone.do(func() { p.zone.interact(p, i.WalkInto) }) }

// ScriptDone ends the script the client was showing.
func (p *Player) ScriptDone(d *worldv1.ScriptDone) {
	p.zone.do(func() {
		if d.Script == p.script {
			p.script, p.pcScript, p.scriptTrainer = 0, 0, ""
			p.evolving = evolving{}
		}
	})
}

func (p *Player) save() live.Save {
	return live.Save{Owner: live.Owner{AccountID: p.accountID, Conn: p.conn}, Position: live.Position{
		Map: p.zone.m.ID, X: p.pos.X, Y: p.pos.Y, Facing: p.facing, Gen: p.gen,
	}}
}

// busy is whether a script or a battle runs: the player can't move or act.
func (p *Player) busy() bool { return p.script != 0 || p.battle != nil }

// atPC is whether the player uses their PC now.
func (p *Player) atPC() bool { return p.script != 0 && p.script == p.pcScript }

func (p *Player) queue(msg *realtimev1.ServerMessage) { p.out = append(p.out, msg) }
