package live

import (
	"context"
	"fmt"
	"strconv"

	"github.com/redis/go-redis/v9"
)

// Link rooms (phase-9 D19): linkrooms:<map>:<phase> is a hash of the leaders' open rooms in one
// Pokémon Center 2F zone, leader account → the encoded room (socialv1.LinkRoom). linkroom:next
// counts the rooms' IDs, the private phases of the room maps (D20).

func linkRoomsKey(mapID string, phase uint32) string { return fmt.Sprintf("linkrooms:%s:%d", mapID, phase) }

const linkRoomNextKey = "linkroom:next"

// openLinkRoomScript: KEYS session, rooms; ARGV conn, account, room. 0 when the connection no
// longer owns the player.
var openLinkRoomScript = redis.NewScript(`
if redis.call('HGET', KEYS[1], 'conn') ~= ARGV[1] then return 0 end
redis.call('HSET', KEYS[2], ARGV[2], ARGV[3])
return 1
`)

// linkRoomsScript: KEYS rooms; returns {leader, room, ...} of the leaders still online, dropping
// the rooms whose leader's session is gone (a replica that crashed never closed them).
var linkRoomsScript = redis.NewScript(`
local all = redis.call('HGETALL', KEYS[1])
local out = {}
for i = 1, #all, 2 do
  if redis.call('EXISTS', 'player:' .. all[i] .. ':session') == 1 then
    out[#out + 1] = all[i]
    out[#out + 1] = all[i + 1]
  else
    redis.call('HDEL', KEYS[1], all[i])
  end
end
return out
`)

// OpenLinkRoom lists the leader's room in the zone, if conn still plays them.
func (s *Store) OpenLinkRoom(ctx context.Context, o Owner, mapID string, phase uint32, room []byte) (bool, error) {
	n, err := openLinkRoomScript.Run(ctx, s.rdb, []string{sessionKey(o.AccountID), linkRoomsKey(mapID, phase)},
		o.Conn, o.AccountID, room).Int()
	return n == 1, err
}

// CloseLinkRoom takes the leader's room off the zone's list; false when it wasn't there (closed
// already, or taken by an accept on another replica).
func (s *Store) CloseLinkRoom(ctx context.Context, leader int64, mapID string, phase uint32) (bool, error) {
	n, err := s.rdb.HDel(ctx, linkRoomsKey(mapID, phase), strconv.FormatInt(leader, 10)).Result()
	return n == 1, err
}

// LinkRoom is the leader's open room in the zone; nil when there is none.
func (s *Store) LinkRoom(ctx context.Context, leader int64, mapID string, phase uint32) ([]byte, error) {
	b, err := s.rdb.HGet(ctx, linkRoomsKey(mapID, phase), strconv.FormatInt(leader, 10)).Bytes()
	if err == redis.Nil {
		return nil, nil
	}
	return b, err
}

// LinkRooms are the zone's open rooms whose leaders are online.
func (s *Store) LinkRooms(ctx context.Context, mapID string, phase uint32) ([][]byte, error) {
	res, err := linkRoomsScript.Run(ctx, s.rdb, []string{linkRoomsKey(mapID, phase)}).StringSlice()
	if err != nil {
		return nil, err
	}
	rooms := make([][]byte, 0, len(res)/2)
	for i := 1; i < len(res); i += 2 {
		rooms = append(rooms, []byte(res[i]))
	}
	return rooms, nil
}

// NextLinkRoom is a new room's ID, never 0 (phase 0 is the world everyone shares).
func (s *Store) NextLinkRoom(ctx context.Context) (uint32, error) {
	n, err := s.rdb.Incr(ctx, linkRoomNextKey).Result()
	if err != nil {
		return 0, err
	}
	return uint32(n%0xFFFFFFFE) + 1, nil
}
