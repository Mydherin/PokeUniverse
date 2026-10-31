// Package live keeps where online players are in Redis, saved on every change, and copies it to
// PostgreSQL (tech-stack.md#saving-state-resilience). Redis is the truth while a player is
// online; PostgreSQL afterwards.
//
// Keys:
//   - player:<id>:session — the connection that owns the player; only it may save positions, so
//     two connections (or replicas) never both write one player.
//   - player:<id>:pos     — hash: gen, map, x, y, facing.
//   - players:moved       — set of players whose position isn't copied to PostgreSQL yet.
//
// gen is the save the position belongs to (the trainer's created_at in Unix microseconds): a
// New Game starts a new save, and positions of the old one are never used or copied again.
package live

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	mapv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/map/v1"
	"pokeuniverse/mic-core/internal/db"
)

// Position is a player's location in save Gen.
type Position struct {
	Map    string
	X, Y   int
	Facing mapv1.Direction
	Gen    int64
}

// Save is one position to write for the connection that owns the player.
type Save struct {
	AccountID int64
	Conn      string
	Position
}

const movedKey = "players:moved"

func sessionKey(id int64) string { return fmt.Sprintf("player:%d:session", id) }
func posKey(id int64) string     { return fmt.Sprintf("player:%d:pos", id) }

// claimScript: KEYS session, pos; ARGV conn, gen, map, x, y, facing. Takes the session and returns
// the live position of save gen, or stores and returns the given one.
var claimScript = redis.NewScript(`
redis.call('SET', KEYS[1], ARGV[1])
local cur = redis.call('HMGET', KEYS[2], 'gen', 'map', 'x', 'y', 'facing')
if cur[1] == ARGV[2] then return {cur[2], cur[3], cur[4], cur[5]} end
redis.call('HSET', KEYS[2], 'gen', ARGV[2], 'map', ARGV[3], 'x', ARGV[4], 'y', ARGV[5], 'facing', ARGV[6])
return {ARGV[3], ARGV[4], ARGV[5], ARGV[6]}
`)

// saveScript: KEYS session, pos, moved; ARGV conn, gen, map, x, y, facing, account. 0 when the
// connection no longer owns the player.
var saveScript = redis.NewScript(`
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('HSET', KEYS[2], 'gen', ARGV[2], 'map', ARGV[3], 'x', ARGV[4], 'y', ARGV[5], 'facing', ARGV[6])
redis.call('SADD', KEYS[3], ARGV[7])
return 1
`)

// releaseScript: KEYS session, pos; ARGV conn. Ends the session if the connection owns it and
// returns the position (gen, map, x, y, facing); nil otherwise.
var releaseScript = redis.NewScript(`
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return false end
redis.call('DEL', KEYS[1])
return redis.call('HMGET', KEYS[2], 'gen', 'map', 'x', 'y', 'facing')
`)

type Store struct {
	rdb  *redis.Client
	pool *pgxpool.Pool
	log  *slog.Logger
}

func NewStore(rdb *redis.Client, pool *pgxpool.Pool, log *slog.Logger) *Store {
	return &Store{rdb: rdb, pool: pool, log: log}
}

// Claim makes conn the player's only session and returns its live position in save
// fallback.Gen, or fallback (stored as the live position) when there is none.
func (s *Store) Claim(ctx context.Context, accountID int64, conn string, fallback Position) (Position, error) {
	res, err := claimScript.Run(ctx, s.rdb, []string{sessionKey(accountID), posKey(accountID)},
		conn, fallback.Gen, fallback.Map, fallback.X, fallback.Y, int32(fallback.Facing)).StringSlice()
	if err != nil {
		return Position{}, fmt.Errorf("claim position: %w", err)
	}
	p, ok := parse(append([]string{strconv.FormatInt(fallback.Gen, 10)}, res...))
	if !ok {
		return fallback, nil
	}
	return p, nil
}

// SaveAll writes the positions in one round trip. owned[i] is false when saves[i]'s connection
// lost the player to another one (which must then be disconnected).
func (s *Store) SaveAll(ctx context.Context, saves []Save) (owned []bool, err error) {
	pipe := s.rdb.Pipeline()
	cmds := make([]*redis.Cmd, len(saves))
	for i, v := range saves {
		cmds[i] = saveScript.EvalSha(ctx, pipe, []string{sessionKey(v.AccountID), posKey(v.AccountID), movedKey},
			v.Conn, v.Gen, v.Map, v.X, v.Y, int32(v.Facing), v.AccountID)
	}
	if _, err := pipe.Exec(ctx); err != nil && !isNoScript(err) {
		return nil, fmt.Errorf("save positions: %w", err)
	} else if err != nil {
		// First save since Redis started: load the script and retry once.
		if err := saveScript.Load(ctx, s.rdb).Err(); err != nil {
			return nil, fmt.Errorf("save positions: %w", err)
		}
		return s.SaveAll(ctx, saves)
	}
	owned = make([]bool, len(saves))
	for i, c := range cmds {
		n, _ := c.Int()
		owned[i] = n == 1
	}
	return owned, nil
}

// Release ends conn's session and copies the player's position to PostgreSQL. Nothing happens
// when another connection owns the player by now.
func (s *Store) Release(ctx context.Context, accountID int64, conn string) error {
	res, err := releaseScript.Run(ctx, s.rdb, []string{sessionKey(accountID), posKey(accountID)}, conn).Slice()
	if errors.Is(err, redis.Nil) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("release position: %w", err)
	}
	fields := make([]string, len(res))
	for i, v := range res {
		fields[i], _ = v.(string)
	}
	p, ok := parse(fields)
	if !ok {
		return nil
	}
	if err := s.copy(ctx, accountID, p); err != nil {
		// The periodic copy retries it.
		s.rdb.SAdd(ctx, movedKey, accountID)
		return err
	}
	return nil
}

// Location is the player's live position in save gen, if Redis has one.
func (s *Store) Location(ctx context.Context, accountID, gen int64) (Position, bool, error) {
	res, err := s.rdb.HMGet(ctx, posKey(accountID), "gen", "map", "x", "y", "facing").Result()
	if err != nil {
		return Position{}, false, err
	}
	fields := make([]string, len(res))
	for i, v := range res {
		fields[i], _ = v.(string)
	}
	p, ok := parse(fields)
	return p, ok && p.Gen == gen, nil
}

// Clear forgets the player's live state and ends its session: New Game replaced the save.
func (s *Store) Clear(ctx context.Context, accountID int64) error {
	return s.rdb.Del(ctx, sessionKey(accountID), posKey(accountID)).Err()
}

// CopyLoop copies moved players' positions to PostgreSQL every `every` until ctx ends. Every
// replica runs it; SPOP hands each player to one of them.
func (s *Store) CopyLoop(ctx context.Context, every time.Duration) {
	t := time.NewTicker(every)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if n, err := s.copyMoved(ctx); err != nil {
				s.log.Error("copy positions", "err", err, "copied", n)
			}
		}
	}
}

func (s *Store) copyMoved(ctx context.Context) (int, error) {
	copied := 0
	for {
		ids, err := s.rdb.SPopN(ctx, movedKey, 256).Result()
		if err != nil || len(ids) == 0 {
			return copied, err
		}
		for _, raw := range ids {
			id, err := strconv.ParseInt(raw, 10, 64)
			if err != nil {
				continue
			}
			res, err := s.rdb.HMGet(ctx, posKey(id), "gen", "map", "x", "y", "facing").Result()
			if err == nil {
				fields := make([]string, len(res))
				for i, v := range res {
					fields[i], _ = v.(string)
				}
				if p, ok := parse(fields); ok {
					err = s.copy(ctx, id, p)
				}
			}
			if err != nil {
				s.rdb.SAdd(ctx, movedKey, id)
				return copied, err
			}
			copied++
		}
	}
}

// copy writes a position into its save in PostgreSQL (no-op if New Game replaced that save).
func (s *Store) copy(ctx context.Context, accountID int64, p Position) error {
	_, err := db.New(s.pool).UpdateTrainerLocation(ctx, db.UpdateTrainerLocationParams{
		AccountID: accountID,
		MapID:     p.Map,
		X:         int32(p.X),
		Y:         int32(p.Y),
		Facing:    FacingName(p.Facing),
		CreatedAt: time.UnixMicro(p.Gen),
	})
	return err
}

// parse reads gen, map, x, y, facing.
func parse(f []string) (Position, bool) {
	if len(f) != 5 || f[1] == "" {
		return Position{}, false
	}
	gen, err1 := strconv.ParseInt(f[0], 10, 64)
	x, err2 := strconv.Atoi(f[2])
	y, err3 := strconv.Atoi(f[3])
	facing, err4 := strconv.Atoi(f[4])
	if err1 != nil || err2 != nil || err3 != nil || err4 != nil {
		return Position{}, false
	}
	return Position{Map: f[1], X: x, Y: y, Facing: mapv1.Direction(facing), Gen: gen}, true
}

func isNoScript(err error) bool { return redis.HasErrorPrefix(err, "NOSCRIPT") }

var facingNames = map[mapv1.Direction]string{
	mapv1.Direction_DIRECTION_NORTH: "north",
	mapv1.Direction_DIRECTION_SOUTH: "south",
	mapv1.Direction_DIRECTION_WEST:  "west",
	mapv1.Direction_DIRECTION_EAST:  "east",
}

// FacingName is the facing as PostgreSQL stores it.
func FacingName(d mapv1.Direction) string {
	if n, ok := facingNames[d]; ok {
		return n
	}
	return "south"
}

// ParseFacing reads a stored facing.
func ParseFacing(name string) mapv1.Direction {
	for d, n := range facingNames {
		if n == name {
			return d
		}
	}
	return mapv1.Direction_DIRECTION_SOUTH
}
