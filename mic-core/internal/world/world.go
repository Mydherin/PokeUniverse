// Package world runs the overworld: maps, movement rules, interactions, and one zone per map
// where its players play (tech-stack.md#movement). Every change is saved to Redis (package live)
// before it's shown, so a crash or restart puts players back where they were.
package world

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	mapv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/map/v1"
	trainerv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/trainer/v1"
	worldv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/world/v1"
	"pokeuniverse/mic-core/internal/db"
	"pokeuniverse/mic-core/internal/live"
)

// Start is where New Game puts the trainer: their room, facing north, as FireRed's new game
// warp and the room's first-warp-in script do. Also the fallback for a location that no longer exists.
var Start = struct {
	Map    string
	X, Y   int
	Facing mapv1.Direction
}{"pallet_town_players_house_2f", 6, 6, mapv1.Direction_DIRECTION_NORTH}

// ErrNoTrainer: the account has no trainer yet (New Game creates it).
var ErrNoTrainer = errors.New("no trainer")

// hasRunningShoes: FireRed gives the Running Shoes in Pewter City; story flags come in Phase 5.
const hasRunningShoes = false

type World struct {
	maps Maps
	live *live.Store
	pool *pgxpool.Pool
	log  *slog.Logger
	stop chan struct{}

	mu      sync.Mutex
	zones   map[string]*zone
	players map[int64]*Player // Online on this replica, by account.
	closed  bool
}

func New(maps Maps, store *live.Store, pool *pgxpool.Pool, log *slog.Logger) (*World, error) {
	if maps[Start.Map] == nil {
		return nil, fmt.Errorf("world: start map %s is missing: run make maps", Start.Map)
	}
	return &World{maps: maps, live: store, pool: pool, log: log, stop: make(chan struct{}),
		zones: map[string]*zone{}, players: map[int64]*Player{}}, nil
}

// Join puts the account's trainer in the world for connection `conn`, taking it over from any
// other connection, and returns the player and the snapshot for the client.
func (w *World) Join(ctx context.Context, accountID int64, conn string, sink Sink) (*Player, *worldv1.WorldSnapshot, error) {
	row, err := db.New(w.pool).GetTrainer(ctx, accountID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil, ErrNoTrainer
	}
	if err != nil {
		return nil, nil, fmt.Errorf("join: %w", err)
	}
	saved := live.Position{Map: row.MapID, X: int(row.X), Y: int(row.Y), Facing: live.ParseFacing(row.Facing), Gen: row.CreatedAt.UnixMicro()}
	pos, err := w.live.Claim(ctx, accountID, conn, saved)
	if err != nil {
		return nil, nil, err
	}
	m, at, facing := w.place(pos)

	p := &Player{accountID: accountID, conn: conn, gen: saved.Gen, sink: sink,
		pos: at, facing: facing, elevation: m.Elevation(at), canRun: m.AllowRunning && hasRunningShoes,
		// Saved on the first tick, which also fixes a location that no longer exists.
		dirty: true}

	w.mu.Lock()
	if w.closed {
		w.mu.Unlock()
		return nil, nil, errors.New("join: shutting down")
	}
	old := w.players[accountID]
	w.players[accountID] = p
	z := w.zones[m.ID]
	if z == nil {
		z = newZone(w, m)
		w.zones[m.ID] = z
	}
	p.zone = z
	w.mu.Unlock()
	if old != nil {
		old.sink.Kick()
	}
	z.call(func() { z.add(p) })

	gender := trainerv1.Gender_GENDER_BOY
	if row.Gender == "girl" {
		gender = trainerv1.Gender_GENDER_GIRL
	}
	return p, &worldv1.WorldSnapshot{
		Map:    m.ID,
		Player: &worldv1.Avatar{X: uint32(at.X), Y: uint32(at.Y), Facing: facing, Gender: gender},
		CanRun: p.canRun,
	}, nil
}

// place checks a saved position against the maps: an unknown map or a tile outside it means Start.
func (w *World) place(pos live.Position) (*Map, Point, mapv1.Direction) {
	at := Point{pos.X, pos.Y}
	if m := w.maps[pos.Map]; m != nil && m.In(at) && ValidDirection(pos.Facing) {
		return m, at, pos.Facing
	}
	return w.maps[Start.Map], Point{Start.X, Start.Y}, Start.Facing
}

// Leave takes the player out of the world (its connection closed): its last changes are saved,
// its session ends and its position is copied to PostgreSQL.
func (w *World) Leave(p *Player) {
	p.zone.call(func() { p.zone.remove(p) })
	w.mu.Lock()
	if w.players[p.accountID] == p {
		delete(w.players, p.accountID)
	}
	w.mu.Unlock()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := w.live.Release(ctx, p.accountID, p.conn); err != nil {
		w.log.Error("release player", "account_id", p.accountID, "err", err)
	}
}

// Close saves every zone's last changes and stops them. Call it once connections have left.
func (w *World) Close() {
	w.mu.Lock()
	if w.closed {
		w.mu.Unlock()
		return
	}
	w.closed = true
	zones := make([]*zone, 0, len(w.zones))
	for _, z := range w.zones {
		zones = append(zones, z)
	}
	w.mu.Unlock()
	close(w.stop)
	for _, z := range zones {
		<-z.done
	}
}
