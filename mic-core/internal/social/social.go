// Package social keeps friends and presence (phase-9 M1) and delivers live social changes to
// online players across replicas: one NATS inbox per online player, social.player.<id>,
// subscribed by the replica holding that player's session (phase-9 D9).
//
// Redis keys, beside package live's:
//   - player:<id>:busy — what an online player is busy with (battle, trade, link), absent when
//     free (phase-9 D7). Shown only while player:<id>:session exists.
package social

import (
	"context"
	"fmt"
	"log/slog"
	"strconv"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nats-io/nats.go"
	"github.com/redis/go-redis/v9"
	"google.golang.org/protobuf/proto"

	socialv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/social/v1"
	"pokeuniverse/mic-core/internal/db"
	"pokeuniverse/mic-core/internal/live"
)

// presenceEvery: a player's presence is pushed at most this often (phase-9 D7); the latest wins.
const presenceEvery = 2 * time.Second

func inboxSubject(id int64) string { return "social.player." + strconv.FormatInt(id, 10) }
func busyKey(id int64) string      { return fmt.Sprintf("player:%d:busy", id) }

type Service struct {
	pool *pgxpool.Pool
	rdb  *redis.Client
	nc   *nats.Conn
	log  *slog.Logger

	mu       sync.Mutex
	inboxes  map[int64]*inbox   // Online players of this replica, by account.
	presence map[int64]*pushing // Presence changes waiting for their throttle, by account.
}

type inbox struct {
	sub     *nats.Subscription
	gen     uint64
	deliver func(*socialv1.SocialEvent)
}

type pushing struct {
	last  time.Time
	want  socialv1.Presence
	timer *time.Timer
}

func New(pool *pgxpool.Pool, rdb *redis.Client, nc *nats.Conn, log *slog.Logger) *Service {
	return &Service{pool: pool, rdb: rdb, nc: nc, log: log, inboxes: map[int64]*inbox{}, presence: map[int64]*pushing{}}
}

var inboxGen uint64

// Open subscribes the player's inbox on this replica, delivering to deliver, and returns the
// function that closes it. Call it before the player's session is claimed, so nothing sent once
// it's online is lost. A second Open on the same replica (a take-over here) keeps the one
// subscription and only changes where it delivers, so no event is doubled; the old close then
// does nothing.
func (s *Service) Open(accountID int64, deliver func(*socialv1.SocialEvent)) (func(), error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	inboxGen++
	gen := inboxGen
	if in := s.inboxes[accountID]; in != nil {
		in.gen, in.deliver = gen, deliver
	} else {
		in = &inbox{gen: gen, deliver: deliver}
		sub, err := s.nc.Subscribe(inboxSubject(accountID), func(m *nats.Msg) {
			var ev socialv1.SocialEvent
			if proto.Unmarshal(m.Data, &ev) != nil {
				return
			}
			s.mu.Lock()
			d := in.deliver
			s.mu.Unlock()
			d(&ev)
		})
		if err != nil {
			return nil, fmt.Errorf("social inbox: %w", err)
		}
		in.sub = sub
		s.inboxes[accountID] = in
		// The subscription reaches the server before the session is claimed.
		if err := s.nc.FlushTimeout(time.Second); err != nil {
			s.log.Warn("flush social inbox", "account_id", accountID, "err", err)
		}
	}
	return func() {
		s.mu.Lock()
		defer s.mu.Unlock()
		if in := s.inboxes[accountID]; in != nil && in.gen == gen {
			delete(s.inboxes, accountID)
			_ = in.sub.Unsubscribe()
		}
	}, nil
}

// publish sends ev to the player's inbox, wherever they're online (nobody gets it if offline).
func (s *Service) publish(to int64, ev *socialv1.SocialEvent) {
	data, _ := proto.Marshal(ev)
	if err := s.nc.Publish(inboxSubject(to), data); err != nil {
		s.log.Error("publish social event", "to", to, "err", err)
	}
}

// SetPresence records what the player is doing now and pushes it to their online friends, at
// most once per presenceEvery: a change inside that time is pushed when it ends, and only the
// latest one. ONLINE also clears busy, OFFLINE saves the last seen time. It never blocks.
func (s *Service) SetPresence(accountID int64, p socialv1.Presence) {
	s.mu.Lock()
	defer s.mu.Unlock()
	st := s.presence[accountID]
	if st == nil {
		st = &pushing{}
		s.presence[accountID] = st
	}
	st.want = p
	if st.timer != nil {
		return // Already waiting: it pushes the latest.
	}
	wait := max(0, time.Until(st.last.Add(presenceEvery)))
	st.timer = time.AfterFunc(wait, func() { s.flushPresence(accountID) })
}

func (s *Service) flushPresence(accountID int64) {
	s.mu.Lock()
	st := s.presence[accountID]
	p := st.want
	st.timer = nil
	st.last = time.Now()
	s.mu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var lastSeen int64
	switch p {
	case socialv1.Presence_PRESENCE_ONLINE, socialv1.Presence_PRESENCE_OFFLINE:
		if err := s.rdb.Del(ctx, busyKey(accountID)).Err(); err != nil {
			s.log.Error("clear busy", "account_id", accountID, "err", err)
		}
		if p == socialv1.Presence_PRESENCE_OFFLINE {
			if err := db.New(s.pool).SetLastSeen(ctx, accountID); err != nil {
				s.log.Error("save last seen", "account_id", accountID, "err", err)
			}
			lastSeen = time.Now().Unix()
		}
	default:
		if err := s.rdb.Set(ctx, busyKey(accountID), int32(p), 0).Err(); err != nil {
			s.log.Error("set busy", "account_id", accountID, "err", err)
		}
	}
	if p == socialv1.Presence_PRESENCE_OFFLINE {
		s.mu.Lock()
		if s.presence[accountID] == st && st.timer == nil {
			delete(s.presence, accountID) // Gone from this replica.
		}
		s.mu.Unlock()
	}

	friends, err := db.New(s.pool).ListFriendIDs(ctx, accountID)
	if err != nil {
		s.log.Error("list friends for presence", "account_id", accountID, "err", err)
		return
	}
	online, err := s.presences(ctx, friends)
	if err != nil {
		s.log.Error("friends presence", "account_id", accountID, "err", err)
		return
	}
	ev := &socialv1.SocialEvent{Event: &socialv1.SocialEvent_Presence{Presence: &socialv1.PresenceChanged{
		Id: uint64(accountID), Presence: p, LastSeen: lastSeen}}}
	for i, id := range friends {
		if online[i] != socialv1.Presence_PRESENCE_OFFLINE {
			s.publish(id, ev)
		}
	}
}

// presences is each player's presence, read in one Redis round trip (phase-9 D7): the session
// key says online, the busy key what they're busy with. (A pipeline, not one MGET: the session
// is a hash, which MGET can't read.)
func (s *Service) presences(ctx context.Context, ids []int64) ([]socialv1.Presence, error) {
	out := make([]socialv1.Presence, len(ids))
	if len(ids) == 0 {
		return out, nil
	}
	pipe := s.rdb.Pipeline()
	online := make([]*redis.IntCmd, len(ids))
	busy := make([]*redis.StringCmd, len(ids))
	for i, id := range ids {
		online[i] = pipe.Exists(ctx, live.SessionKey(id))
		busy[i] = pipe.Get(ctx, busyKey(id))
	}
	if _, err := pipe.Exec(ctx); err != nil && err != redis.Nil {
		return nil, err
	}
	for i := range ids {
		out[i] = socialv1.Presence_PRESENCE_OFFLINE
		if online[i].Val() == 0 {
			continue
		}
		out[i] = socialv1.Presence_PRESENCE_ONLINE
		if v, err := strconv.Atoi(busy[i].Val()); err == nil && v > int(socialv1.Presence_PRESENCE_ONLINE) {
			out[i] = socialv1.Presence(v)
		}
	}
	return out, nil
}
