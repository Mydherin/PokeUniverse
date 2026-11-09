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

	itemv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/item/v1"
	mapv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/map/v1"
	trainerv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/trainer/v1"
	worldv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/world/v1"
	"pokeuniverse/mic-core/internal/battle"
	"pokeuniverse/mic-core/internal/battles"
	"pokeuniverse/mic-core/internal/db"
	"pokeuniverse/mic-core/internal/item"
	"pokeuniverse/mic-core/internal/live"
	"pokeuniverse/mic-core/internal/pokedex"
	"pokeuniverse/mic-core/internal/pokemon"
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

// ErrSessionActive: another copy of the game plays the trainer (this one, reconnecting, was replaced).
var ErrSessionActive = live.ErrSessionActive

// Bus reaches the other replicas: a connection there lost its player to a take-over here.
type Bus interface {
	SessionTaken(accountID int64, conn string)
}

// keepAliveEvery renews this replica's sessions well within live.SessionTTL.
const keepAliveEvery = live.SessionTTL / 3

// hasRunningShoes: FireRed gives the Running Shoes in Pewter City; story flags come in Phase 10.
const hasRunningShoes = false

type World struct {
	maps    Maps
	live    *live.Store
	bus     Bus
	pool    *pgxpool.Pool
	battles *battles.Client
	active  *battle.Store
	log     *slog.Logger
	stop    chan struct{}

	mu       sync.Mutex
	zones    map[string]*zone
	players  map[int64]*Player // Online on this replica, by account.
	openPCs  map[int64]openPC  // PCs left open by dropped connections, by account (reopenPC).
	closed   bool
	draining bool // The server is stopping: players leaving keep their battles.
}

func New(maps Maps, store *live.Store, bus Bus, pool *pgxpool.Pool, b *battles.Client, active *battle.Store, log *slog.Logger) (*World, error) {
	if maps[Start.Map] == nil {
		return nil, fmt.Errorf("world: start map %s is missing: run make maps", Start.Map)
	}
	w := &World{maps: maps, live: store, bus: bus, pool: pool, battles: b, active: active, log: log, stop: make(chan struct{}),
		zones: map[string]*zone{}, players: map[int64]*Player{}, openPCs: map[int64]openPC{}}
	go w.keepAlive()
	return w, nil
}

// Join puts the account's trainer in the world for session s and returns the player and the
// snapshot for the client. When another copy of the game plays it, Join fails with
// ErrSessionActive unless takeOver, which disconnects that copy wherever it is.
func (w *World) Join(ctx context.Context, accountID int64, s live.Session, takeOver bool, sink Sink) (*Player, *worldv1.WorldSnapshot, error) {
	row, err := db.New(w.pool).GetTrainer(ctx, accountID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil, ErrNoTrainer
	}
	if err != nil {
		return nil, nil, fmt.Errorf("join: %w", err)
	}
	saved := live.Position{Map: row.MapID, X: int(row.X), Y: int(row.Y), Facing: live.ParseFacing(row.Facing), Gen: row.CreatedAt.UnixMicro(),
		Played: time.Duration(row.PlayTimeSeconds) * time.Second}
	items, err := item.Load(ctx, db.New(w.pool), accountID, row)
	if err != nil {
		return nil, nil, fmt.Errorf("join: %w", err)
	}
	gender := trainerv1.Gender_GENDER_BOY
	if row.Gender == "girl" {
		gender = trainerv1.Gender_GENDER_GIRL
	}
	party, err := w.loadParty(ctx, accountID, row, gender, items)
	if err != nil {
		return nil, nil, fmt.Errorf("join: %w", err)
	}
	inBattle, battleView, err := w.joinBattle(ctx, accountID, saved.Gen, takeOver)
	if err != nil {
		return nil, nil, fmt.Errorf("join: %w", err)
	}
	if inBattle != nil {
		// Items used before a restart stay spent (they're saved with the outcome).
		for _, id := range inBattle.Spent {
			items.Bag.Remove(itemv1.Item(id), 1)
		}
	}
	pos, previous, err := w.live.Claim(ctx, accountID, s, takeOver, saved)
	if err != nil {
		return nil, nil, err
	}
	m, at, facing := w.place(pos)

	p := &Player{accountID: accountID, conn: s.Conn, instance: s.Instance, gen: saved.Gen, sink: sink,
		pos: at, facing: facing, elevation: m.Elevation(at), canRun: m.AllowRunning && hasRunningShoes, items: items, party: party, pokedex: pokedex.Load(row),
		gender: gender, trainerID: uint32(row.TrainerID), money: int(row.Money), battle: inBattle, friendshipSteps: int(row.FriendshipSteps),
		// Saved on the first tick, which also fixes a location that no longer exists.
		dirty: true}
	p.counted.Store(time.Now().UnixNano())

	w.mu.Lock()
	if w.closed {
		w.mu.Unlock()
		return nil, nil, errors.New("join: shutting down")
	}
	old := w.players[accountID]
	w.players[accountID] = p
	w.reopenPC(p, m.ID, time.Now())
	z := w.zoneOf(m)
	p.zone = z
	w.mu.Unlock()
	if old != nil {
		old.sink.Kick()
	}
	if previous != "" && (old == nil || old.conn != previous) {
		w.bus.SessionTaken(accountID, previous) // Played from another replica.
	}
	var follower *worldv1.Follower
	z.call(func() {
		p.placeFollower()
		follower = p.follower.proto()
		z.add(p)
		if p.battle != nil && p.battle.request == nil {
			z.resumeBattle(p) // mic-battles didn't answer in time, or the battle was over.
		}
	})

	return p, &worldv1.WorldSnapshot{
		Map:    m.ID,
		Player: &worldv1.Avatar{X: uint32(at.X), Y: uint32(at.Y), Facing: facing, Gender: gender, Follower: follower},
		CanRun: p.canRun,
		// The client counts on from here; each Join sends the server's count again.
		PlayTimeSeconds: uint32(pos.Played / time.Second),
		Bag:             items.Bag.Proto(),
		Pokedex:         p.pokedex.Proto(),
		Party:           party.Proto(),
		Battle:          battleView,
	}, nil
}

// zoneOf is the map's zone, started the first time someone goes there. Call it with w.mu held.
func (w *World) zoneOf(m *Map) *zone {
	z := w.zones[m.ID]
	if z == nil {
		z = newZone(w, m)
		w.zones[m.ID] = z
	}
	return z
}

// loadParty reads the trainer's Pokémon. Test content (phase-5): until the starter
// (Phase 10), a trainer with none gets the test team and the test bag.
func (w *World) loadParty(ctx context.Context, accountID int64, row db.GetTrainerRow, gender trainerv1.Gender, items *item.State) (pokemon.Party, error) {
	party, err := pokemon.Load(ctx, db.New(w.pool), accountID)
	if err != nil || len(party) > 0 {
		return party, err
	}
	party, err = pokemon.GiveTestTeam(ctx, w.pool, accountID, row.CreatedAt, pokemon.Trainer{Name: row.Name, ID: uint32(row.TrainerID), Gender: gender})
	if err != nil {
		return nil, err
	}
	return party, item.Write(ctx, db.New(w.pool), accountID, row.CreatedAt, items, giveTestBag(items))
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
// its session ends and its position is copied to PostgreSQL. A battle it was in is dropped
// (rollback), unless the server is shutting down (it resumes after the restart).
func (w *World) Leave(p *Player) {
	w.mu.Lock()
	draining := w.draining
	w.mu.Unlock()
	var pc openPC
	keptPC := false
	p.zone.call(func() {
		if !draining {
			p.zone.abandonBattle(p)
		}
		pc, keptPC = p.leftPC(time.Now())
		p.zone.remove(p)
		p.zone.saveFriendshipSteps(p)
	})
	w.mu.Lock()
	if w.players[p.accountID] == p {
		delete(w.players, p.accountID)
		if keptPC {
			w.openPCs[p.accountID] = pc
		}
	}
	w.mu.Unlock()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := w.live.Release(ctx, p.owner(time.Now())); err != nil {
		w.log.Error("release player", "account_id", p.accountID, "err", err)
	}
}

// SessionTaken disconnects connection `conn` if it plays the account's trainer here.
func (w *World) SessionTaken(accountID int64, conn string) {
	w.mu.Lock()
	p := w.players[accountID]
	w.mu.Unlock()
	if p != nil && p.conn == conn {
		p.sink.Kick()
	}
}

// keepAlive renews this replica's sessions; one that was lost (taken over, New Game) is
// disconnected even if its player stays still.
func (w *World) keepAlive() {
	t := time.NewTicker(keepAliveEvery)
	defer t.Stop()
	for {
		select {
		case <-w.stop:
			return
		case <-t.C:
		}
		w.mu.Lock()
		players := make([]*Player, 0, len(w.players))
		owners := make([]live.Owner, 0, len(w.players))
		now := time.Now()
		for _, p := range w.players {
			players = append(players, p)
			owners = append(owners, p.owner(now))
		}
		w.mu.Unlock()
		ctx, cancel := context.WithTimeout(context.Background(), keepAliveEvery)
		owned, err := w.live.KeepAlive(ctx, owners)
		cancel()
		if err != nil {
			w.log.Error("keep sessions alive", "err", err)
			continue
		}
		for i, ok := range owned {
			if !ok {
				players[i].sink.Kick()
			}
		}
	}
}

// owner is the player's connection with the play time since it was last counted, now counted.
func (p *Player) owner(now time.Time) live.Owner {
	last := p.counted.Swap(now.UnixNano())
	return live.Owner{AccountID: p.accountID, Conn: p.conn, Played: max(0, time.Duration(now.UnixNano()-last))}
}

// Drain says the server is stopping, before its connections close: the players about to leave
// keep their battles, which resume after the restart (D22).
func (w *World) Drain() {
	w.mu.Lock()
	w.draining = true
	w.mu.Unlock()
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
