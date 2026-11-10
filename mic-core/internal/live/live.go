// Package live keeps where online players are and how long they have played in Redis, saved on
// every change, and copies it to PostgreSQL (tech-stack.md#saving-state-resilience). Redis is
// the truth while a player is online; PostgreSQL afterwards.
//
// Keys:
//   - player:<id>:session — hash: the copy of the game (instance) and the connection that play
//     the player; only that connection may save positions, so two connections (or replicas)
//     never both write one player. It expires unless its replica keeps it alive (KeepAlive), so a
//     crashed replica leaves no session behind.
//   - player:<id>:pos     — hash: gen, map, x, y, facing, played_ms (play time), zone (the zone
//     hash the player is listed in while online).
//   - zone:<map>:<phase>  — hash: trainer → encoded ZoneMember (phase-8 D3), the players of a zone
//     on every replica, written with their positions in the same session check; a player entering
//     the zone reads it once (ZoneMembers).
//   - players:moved       — set of players whose position or play time isn't copied to PostgreSQL yet.
//
// Play time counts while a connection plays the trainer (FireRed counts it every frame in the
// world), up to FireRed's 999:59:59; its replica adds the time played at each keep-alive.
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

// Position is a player's location and play time in save Gen.
type Position struct {
	Map    string
	X, Y   int
	Facing mapv1.Direction
	Gen    int64
	Played time.Duration
}

// MaxPlayed is FireRed's longest play time, 999:59:59.
const MaxPlayed = 999*time.Hour + 59*time.Minute + 59*time.Second

// Owner is a connection that plays an account's trainer, and the time played since it last
// counted.
type Owner struct {
	AccountID int64
	Conn      string
	Played    time.Duration
}

// Session is who plays a trainer: a copy of the game (random per page load) and its connection.
type Session struct {
	Instance string
	Conn     string
}

// Save is one position to write for the connection that owns the player, and how the others in
// its zone see the player (ZoneKey, an encoded ZoneMember).
type Save struct {
	Owner
	Position
	Zone   string
	Member []byte
}

// ZoneKey is the Redis hash of the players in a map's phase (phase-8 D19).
func ZoneKey(mapID string, phase uint32) string { return fmt.Sprintf("zone:%s:%d", mapID, phase) }

// ErrSessionActive: another copy of the game plays the trainer (and taking it over wasn't asked).
var ErrSessionActive = errors.New("session active elsewhere")

const (
	movedKey = "players:moved"
	// SessionTTL: a session not kept alive for this long is gone (its replica crashed).
	SessionTTL = 15 * time.Second
)

func sessionKey(id int64) string { return fmt.Sprintf("player:%d:session", id) }
func posKey(id int64) string     { return fmt.Sprintf("player:%d:pos", id) }

// claimScript: KEYS session, pos; ARGV instance, conn, takeOver, ttl ms, gen, map, x, y, facing,
// played ms. {"active"} when another instance plays and takeOver isn't "1"; otherwise takes the
// session and returns {"ok", previous conn, map, x, y, facing, played ms}: the live state of save
// gen, or the given one (then stored).
var claimScript = redis.NewScript(`
local cur = redis.call('HMGET', KEYS[1], 'instance', 'conn')
if cur[1] and cur[1] ~= ARGV[1] and ARGV[3] ~= '1' then return {'active'} end
redis.call('HSET', KEYS[1], 'instance', ARGV[1], 'conn', ARGV[2])
redis.call('PEXPIRE', KEYS[1], ARGV[4])
local prev = cur[2] or ''
local p = redis.call('HMGET', KEYS[2], 'gen', 'map', 'x', 'y', 'facing', 'played_ms')
if p[1] == ARGV[5] then
  if not p[6] then
    p[6] = ARGV[10]
    redis.call('HSET', KEYS[2], 'played_ms', p[6])
  end
  return {'ok', prev, p[2], p[3], p[4], p[5], p[6]}
end
redis.call('HSET', KEYS[2], 'gen', ARGV[5], 'map', ARGV[6], 'x', ARGV[7], 'y', ARGV[8], 'facing', ARGV[9], 'played_ms', ARGV[10])
return {'ok', prev, ARGV[6], ARGV[7], ARGV[8], ARGV[9], ARGV[10]}
`)

// leaveZone (Lua): takes player ARGV[n] out of the zone hash its pos (KEYS[2]) lists.
const leaveZone = `
local function leaveZone(n)
  local z = redis.call('HGET', KEYS[2], 'zone')
  if z then
    redis.call('HDEL', z, ARGV[n])
    redis.call('HDEL', KEYS[2], 'zone')
  end
end
`

// saveScript: KEYS session, pos, moved, zone; ARGV conn, gen, map, x, y, facing, account, ttl ms,
// member. 0 when the connection no longer owns the player. Moves the player's zone entry out of
// the zone it was listed in (a take-over from another map) into KEYS[4]. The zone hashes are
// standalone Redis keys (no cluster), so the previous one needn't be declared.
var saveScript = redis.NewScript(`
if redis.call('HGET', KEYS[1], 'conn') ~= ARGV[1] then return 0 end
redis.call('PEXPIRE', KEYS[1], ARGV[8])
local prev = redis.call('HGET', KEYS[2], 'zone')
if prev and prev ~= KEYS[4] then redis.call('HDEL', prev, ARGV[7]) end
redis.call('HSET', KEYS[2], 'gen', ARGV[2], 'map', ARGV[3], 'x', ARGV[4], 'y', ARGV[5], 'facing', ARGV[6], 'zone', KEYS[4])
redis.call('HSET', KEYS[4], ARGV[7], ARGV[9])
redis.call('SADD', KEYS[3], ARGV[7])
return 1
`)

// leaveZoneScript: KEYS session, pos; ARGV conn, account. Takes the player out of its zone hash if
// the connection still owns it (a taken-over connection never rewrites the entry).
var leaveZoneScript = redis.NewScript(leaveZone + `
if redis.call('HGET', KEYS[1], 'conn') ~= ARGV[1] then return 0 end
leaveZone(2)
return 1
`)

// membersScript: KEYS zone. The zone's entries, dropping (HDEL) those whose player has no session
// (its replica crashed, or New Game) or is listed in another zone by now.
var membersScript = redis.NewScript(`
local all = redis.call('HGETALL', KEYS[1])
local out = {}
for i = 1, #all, 2 do
  local id = all[i]
  if redis.call('EXISTS', 'player:' .. id .. ':session') == 1 and redis.call('HGET', 'player:' .. id .. ':pos', 'zone') == KEYS[1] then
    out[#out + 1] = all[i + 1]
  else
    redis.call('HDEL', KEYS[1], id)
  end
end
return out
`)

// addPlayed (Lua): adds ARGV[n] ms of play time to KEYS[2] up to ARGV[n+1] ms, and marks the
// player (ARGV[n+2]) in KEYS[3] for the copy to PostgreSQL.
const addPlayed = `
local function addPlayed(n)
  local add = tonumber(ARGV[n])
  if add <= 0 then return end
  local played = math.min(redis.call('HINCRBY', KEYS[2], 'played_ms', add), tonumber(ARGV[n + 1]))
  redis.call('HSET', KEYS[2], 'played_ms', played)
  redis.call('SADD', KEYS[3], ARGV[n + 2])
end
`

// keepAliveScript: KEYS session, pos, moved; ARGV conn, ttl ms, played ms, max ms, account. 0 when
// the connection no longer owns the player.
var keepAliveScript = redis.NewScript(addPlayed + `
if redis.call('HGET', KEYS[1], 'conn') ~= ARGV[1] then return 0 end
redis.call('PEXPIRE', KEYS[1], ARGV[2])
addPlayed(3)
return 1
`)

// releaseScript: KEYS session, pos, moved; ARGV played ms, max ms, account, conn. Ends the
// session if the connection owns it, takes the player out of its zone hash, counts its last play time and returns the player's state
// (gen, map, x, y, facing, played ms); nil otherwise.
var releaseScript = redis.NewScript(addPlayed + leaveZone + `
if redis.call('HGET', KEYS[1], 'conn') ~= ARGV[4] then return false end
redis.call('DEL', KEYS[1])
leaveZone(3)
addPlayed(1)
return redis.call('HMGET', KEYS[2], 'gen', 'map', 'x', 'y', 'facing', 'played_ms')
`)

// stateFields are the hash fields parse reads, in order.
var stateFields = []string{"gen", "map", "x", "y", "facing", "played_ms"}

type Store struct {
	rdb  *redis.Client
	pool *pgxpool.Pool
	log  *slog.Logger
}

func NewStore(rdb *redis.Client, pool *pgxpool.Pool, log *slog.Logger) *Store {
	return &Store{rdb: rdb, pool: pool, log: log}
}

// Claim makes s the player's session and returns its live position in save fallback.Gen (or
// fallback, stored as the live position), and the connection it took the player from, if any.
// ErrSessionActive when another instance plays the player and takeOver is false.
func (s *Store) Claim(ctx context.Context, accountID int64, sess Session, takeOver bool, fallback Position) (Position, string, error) {
	res, err := claimScript.Run(ctx, s.rdb, []string{sessionKey(accountID), posKey(accountID)},
		sess.Instance, sess.Conn, takeOver, SessionTTL.Milliseconds(),
		fallback.Gen, fallback.Map, fallback.X, fallback.Y, int32(fallback.Facing), fallback.Played.Milliseconds()).StringSlice()
	if err != nil {
		return Position{}, "", fmt.Errorf("claim position: %w", err)
	}
	if len(res) == 1 && res[0] == "active" {
		return Position{}, "", ErrSessionActive
	}
	if len(res) != 7 {
		return Position{}, "", fmt.Errorf("claim position: unexpected reply")
	}
	previous := res[1]
	if previous == sess.Conn {
		previous = ""
	}
	p, ok := parse(append([]string{strconv.FormatInt(fallback.Gen, 10)}, res[2:]...))
	if !ok {
		return fallback, previous, nil
	}
	return p, previous, nil
}

// KeepAlive renews the sessions and adds their play time in one round trip; owned[i] is false
// when owners[i] lost its player (taken over, or New Game).
func (s *Store) KeepAlive(ctx context.Context, owners []Owner) ([]bool, error) {
	return s.pipelined(ctx, keepAliveScript, len(owners), func(i int) ([]string, []any) {
		o := owners[i]
		return []string{sessionKey(o.AccountID), posKey(o.AccountID), movedKey},
			[]any{o.Conn, SessionTTL.Milliseconds(), o.Played.Milliseconds(), MaxPlayed.Milliseconds(), o.AccountID}
	})
}

// SaveAll writes the positions in one round trip. owned[i] is false when saves[i]'s connection
// lost the player to another one (which must then be disconnected).
func (s *Store) SaveAll(ctx context.Context, saves []Save) ([]bool, error) {
	return s.pipelined(ctx, saveScript, len(saves), func(i int) ([]string, []any) {
		v := saves[i]
		return []string{sessionKey(v.AccountID), posKey(v.AccountID), movedKey, v.Zone},
			[]any{v.Conn, v.Gen, v.Map, v.X, v.Y, int32(v.Facing), v.AccountID, SessionTTL.Milliseconds(), v.Member}
	})
}

// pipelined runs a script n times in one round trip; ok[i] is whether run i returned 1.
func (s *Store) pipelined(ctx context.Context, script *redis.Script, n int, args func(i int) ([]string, []any)) ([]bool, error) {
	if n == 0 {
		return nil, nil
	}
	for attempt := 0; ; attempt++ {
		pipe := s.rdb.Pipeline()
		cmds := make([]*redis.Cmd, n)
		for i := range n {
			keys, argv := args(i)
			cmds[i] = script.EvalSha(ctx, pipe, keys, argv...)
		}
		_, err := pipe.Exec(ctx)
		if isNoScript(err) && attempt == 0 {
			// First run since Redis started: load the script and retry once.
			if err := script.Load(ctx, s.rdb).Err(); err != nil {
				return nil, err
			}
			continue
		}
		if err != nil {
			return nil, err
		}
		ok := make([]bool, n)
		for i, c := range cmds {
			v, _ := c.Int()
			ok[i] = v == 1
		}
		return ok, nil
	}
}

// LeaveZone takes the player out of its zone hash (left the zone: a warp, a disconnect), unless
// another connection owns it by now.
func (s *Store) LeaveZone(ctx context.Context, o Owner) error {
	return leaveZoneScript.Run(ctx, s.rdb, []string{sessionKey(o.AccountID), posKey(o.AccountID)}, o.Conn, o.AccountID).Err()
}

// ZoneMembers is the encoded ZoneMembers of zone hash `zone` whose players are online there; the
// others (a crashed replica's, once their session expired) are removed.
func (s *Store) ZoneMembers(ctx context.Context, zone string) ([][]byte, error) {
	res, err := membersScript.Run(ctx, s.rdb, []string{zone}).StringSlice()
	if err != nil {
		return nil, fmt.Errorf("zone members: %w", err)
	}
	out := make([][]byte, len(res))
	for i, v := range res {
		out[i] = []byte(v)
	}
	return out, nil
}

// Release ends o's session, adds its last play time and copies the player's state to
// PostgreSQL. Nothing happens when another connection owns the player by now.
func (s *Store) Release(ctx context.Context, o Owner) error {
	accountID := o.AccountID
	res, err := releaseScript.Run(ctx, s.rdb, []string{sessionKey(accountID), posKey(accountID), movedKey},
		o.Played.Milliseconds(), MaxPlayed.Milliseconds(), accountID, o.Conn).Slice()
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

// Location is the player's live position and play time in save gen, if Redis has them.
func (s *Store) Location(ctx context.Context, accountID, gen int64) (Position, bool, error) {
	res, err := s.rdb.HMGet(ctx, posKey(accountID), stateFields...).Result()
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
			res, err := s.rdb.HMGet(ctx, posKey(id), stateFields...).Result()
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

// copy writes a position and play time into its save in PostgreSQL (no-op if New Game replaced that save).
func (s *Store) copy(ctx context.Context, accountID int64, p Position) error {
	_, err := db.New(s.pool).UpdateTrainerLive(ctx, db.UpdateTrainerLiveParams{
		AccountID:       accountID,
		MapID:           p.Map,
		X:               int32(p.X),
		Y:               int32(p.Y),
		Facing:          FacingName(p.Facing),
		PlayTimeSeconds: int64(p.Played / time.Second),
		CreatedAt:       time.UnixMicro(p.Gen),
	})
	return err
}

// parse reads stateFields; a missing play time is 0.
func parse(f []string) (Position, bool) {
	if len(f) != len(stateFields) || f[1] == "" {
		return Position{}, false
	}
	gen, err1 := strconv.ParseInt(f[0], 10, 64)
	x, err2 := strconv.Atoi(f[2])
	y, err3 := strconv.Atoi(f[3])
	facing, err4 := strconv.Atoi(f[4])
	if err1 != nil || err2 != nil || err3 != nil || err4 != nil {
		return Position{}, false
	}
	played, _ := strconv.ParseInt(f[5], 10, 64)
	return Position{Map: f[1], X: x, Y: y, Facing: mapv1.Direction(facing), Gen: gen, Played: time.Duration(played) * time.Millisecond}, true
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
