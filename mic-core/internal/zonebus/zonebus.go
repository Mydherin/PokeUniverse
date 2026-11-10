// Package zonebus carries what the zones of one map's phase tell each other across mic-core
// replicas (phase-8 D2), over NATS subject world.zone.<map>.<phase>: each replica runs its own
// zone for its own players, publishes their events and a presence beat, and subscribes only while
// it has players there. Map IDs are lowercase letters, digits and underscores: safe subject tokens.
package zonebus

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/nats-io/nats.go"
	"google.golang.org/protobuf/proto"

	worldv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/world/v1"
)

type Bus struct {
	nc      *nats.Conn
	log     *slog.Logger
	replica string
}

// New names this replica: its hostname (the container's, in Compose) and a random suffix, so a
// restarted replica is a new one.
func New(nc *nats.Conn, log *slog.Logger) *Bus {
	host, _ := os.Hostname()
	suffix := make([]byte, 3)
	_, _ = rand.Read(suffix)
	return &Bus{nc: nc, log: log, replica: host + "-" + hex.EncodeToString(suffix)}
}

// Replica is this replica's ID, carried by everything it publishes.
func (b *Bus) Replica() string { return b.replica }

func subject(mapID string, phase uint32) string { return fmt.Sprintf("world.zone.%s.%d", mapID, phase) }

// Publish sends msg to the zone's other replicas, stamped with this replica's ID.
func (b *Bus) Publish(mapID string, phase uint32, msg *worldv1.ZoneBus) {
	msg.Replica = b.replica
	data, err := proto.Marshal(msg)
	if err == nil {
		err = b.nc.Publish(subject(mapID, phase), data)
	}
	if err != nil {
		// The others see the player again with its next event, or drop it after the silence.
		b.log.Error("publish zone", "map", mapID, "err", err)
	}
}

// Subscribe calls handle, in order, for every message the zone's other replicas publish (this
// replica's own are skipped). It returns once NATS has the subscription, so nothing published
// after it is missed (a player entering reads Redis next).
func (b *Bus) Subscribe(mapID string, phase uint32, handle func(*worldv1.ZoneBus)) (unsubscribe func(), err error) {
	sub, err := b.nc.Subscribe(subject(mapID, phase), func(m *nats.Msg) {
		var msg worldv1.ZoneBus
		if proto.Unmarshal(m.Data, &msg) == nil && msg.Replica != b.replica {
			handle(&msg)
		}
	})
	if err != nil {
		return nil, err
	}
	if err := b.nc.FlushTimeout(time.Second); err != nil {
		b.log.Error("subscribe zone", "map", mapID, "err", err)
	}
	return func() { _ = sub.Unsubscribe() }, nil
}
