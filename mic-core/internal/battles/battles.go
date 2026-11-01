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

// callTimeout bounds one request; a step plays in milliseconds, a cold Showdown in a second.
const callTimeout = 5 * time.Second

// Start creates a battle (battles.start); a repeated start answers the saved reply.
func (c *Client) Start(ctx context.Context, req *battlev1.StartBattle) (*battlev1.BattleUpdate, error) {
	return retry(ctx, func(ctx context.Context) (*battlev1.BattleUpdate, error) {
		return call(ctx, c.NATS, "battles.start", req, &battlev1.BattleUpdate{})
	})
}

// Turn plays a step (battles.turn); a repeated step answers the saved reply.
func (c *Client) Turn(ctx context.Context, req *battlev1.TurnRequest) (*battlev1.BattleUpdate, error) {
	return retry(ctx, func(ctx context.Context) (*battlev1.BattleUpdate, error) {
		return call(ctx, c.NATS, "battles.turn", req, &battlev1.BattleUpdate{})
	})
}

// View is one side's view of a battle (battles.view), tried once.
func (c *Client) View(ctx context.Context, req *battlev1.ViewRequest) (*battlev1.BattleView, error) {
	ctx, cancel := context.WithTimeout(ctx, callTimeout)
	defer cancel()
	return call(ctx, c.NATS, "battles.view", req, &battlev1.BattleView{})
}

func call[T proto.Message](ctx context.Context, nc *nats.Conn, subject string, req proto.Message, out T) (T, error) {
	data, err := proto.Marshal(req)
	if err != nil {
		return out, err
	}
	msg, err := nc.RequestWithContext(ctx, subject, data)
	if err != nil {
		return out, fmt.Errorf("%s: %w", subject, err)
	}
	if err := proto.Unmarshal(msg.Data, out); err != nil {
		return out, fmt.Errorf("%s: %w", subject, err)
	}
	return out, nil
}

// retry repeats a request until it's answered or ctx ends, waiting longer each time (up to 3
// seconds): mic-battles may be restarting (plans/battles D2 makes repeats safe). mic-battles
// answers nothing to a request it refuses, so a refused one also ends with ctx.
func retry[T any](ctx context.Context, try func(context.Context) (T, error)) (T, error) {
	wait := 250 * time.Millisecond
	for {
		attempt, cancel := context.WithTimeout(ctx, callTimeout)
		out, err := try(attempt)
		cancel()
		if err == nil {
			return out, nil
		}
		select {
		case <-ctx.Done():
			return out, err
		case <-time.After(wait):
		}
		wait = min(2*wait, 3*time.Second)
	}
}

// WaitReachable pings mic-battles until it answers, then logs the round trip.
// mic-core doesn't need mic-battles to start, so this runs in the background.
// Both start together, so it only warns if mic-battles is still missing after 30 seconds.
func (c *Client) WaitReachable(ctx context.Context, log *slog.Logger) {
	warnAt := time.Now().Add(30 * time.Second)
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
		if !warned && time.Now().After(warnAt) {
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
