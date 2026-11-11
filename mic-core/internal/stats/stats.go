// Package stats counts what realtime drops, for the zone stats (phase-8 M8).
package stats

import (
	"sync/atomic"

	devv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/dev/v1"
)

// Drop is why realtime dropped a message.
type Drop int

const (
	IntentRate Drop = iota
	IntentSize
	IntentInvalid
	ChatRate
	ChatInvalid
	SlowConsumer
	drops
)

var counts [drops]atomic.Uint64

// Count notes one dropped message.
func Count(d Drop) { counts[d].Add(1) }

// Drops are the counts since the replica started.
func Drops() *devv1.Drops {
	return &devv1.Drops{
		IntentRate: counts[IntentRate].Load(), IntentSize: counts[IntentSize].Load(), IntentInvalid: counts[IntentInvalid].Load(),
		ChatRate: counts[ChatRate].Load(), ChatInvalid: counts[ChatInvalid].Load(), SlowConsumers: counts[SlowConsumer].Load(),
	}
}
