// Package battles talks to mic-battles over NATS (request/reply on battles.<action>).
package battles

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/nats-io/nats.go"
	"google.golang.org/protobuf/proto"

	battlev1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/battle/v1"
)

type Client struct {
	NATS *nats.Conn
}

// Ping makes a round trip to mic-battles and returns its reply.
func (c *Client) Ping(ctx context.Context) (*battlev1.Pong, error) {
	req, err := proto.Marshal(&battlev1.Ping{CoreTime: uint64(time.Now().UnixMilli())})
	if err != nil {
		return nil, err
	}
	msg, err := c.NATS.RequestWithContext(ctx, "battles.ping", req)
	if err != nil {
		return nil, fmt.Errorf("battles.ping: %w", err)
	}
	pong := &battlev1.Pong{}
	if err := proto.Unmarshal(msg.Data, pong); err != nil {
		return nil, fmt.Errorf("battles.ping: %w", err)
	}
	return pong, nil
}

// WaitReachable pings mic-battles until it answers, then logs the round trip.
// mic-core doesn't need mic-battles to start, so this runs in the background.
func (c *Client) WaitReachable(ctx context.Context, log *slog.Logger) {
	warned := false
	for {
		start := time.Now()
		reqCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
		pong, err := c.Ping(reqCtx)
		cancel()
		if err == nil {
			log.Info("mic-battles reachable", "rtt_ms", time.Since(start).Milliseconds(), "format", pong.GetFormat())
			return
		}
		if !warned {
			log.Warn("mic-battles not reachable yet", "err", err)
			warned = true
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(3 * time.Second):
		}
	}
}
