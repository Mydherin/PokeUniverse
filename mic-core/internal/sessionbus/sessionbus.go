// Package sessionbus tells every mic-core replica, over NATS, that a trainer was taken over by
// another copy of the game, so the replica holding the old connection disconnects it at once.
package sessionbus

import (
	"log/slog"

	"github.com/nats-io/nats.go"
	"google.golang.org/protobuf/proto"

	worldv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/world/v1"
)

const subject = "world.sessions.taken"

type Bus struct {
	nc  *nats.Conn
	log *slog.Logger
}

func New(nc *nats.Conn, log *slog.Logger) *Bus { return &Bus{nc: nc, log: log} }

// SessionTaken publishes that connection `conn` lost the account's trainer.
func (b *Bus) SessionTaken(accountID int64, conn string) {
	data, _ := proto.Marshal(&worldv1.SessionTaken{AccountId: uint64(accountID), Conn: conn})
	if err := b.nc.Publish(subject, data); err != nil {
		// The old connection still loses the player at its next save or keep-alive.
		b.log.Error("publish session taken", "err", err)
	}
}

// Subscribe calls handle for every take-over published by any replica.
func (b *Bus) Subscribe(handle func(accountID int64, conn string)) (*nats.Subscription, error) {
	return b.nc.Subscribe(subject, func(m *nats.Msg) {
		var e worldv1.SessionTaken
		if proto.Unmarshal(m.Data, &e) == nil {
			handle(int64(e.AccountId), e.Conn)
		}
	})
}
