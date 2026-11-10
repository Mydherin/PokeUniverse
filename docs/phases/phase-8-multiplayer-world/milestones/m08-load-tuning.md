# M8 Load and Tuning ⬜

Part of [Phase 8](../phase-8-multiplayer-world.md). **Needs:** M4, M5 (M3 for the client part). Rules: [context.md](context.md) D1, D7, D17, D18.

**Done when:** the budget in D18 is measured with bots on two replicas and holds (or the fix that makes it hold is in), and the numbers are written in tech-stack.md.

## Resume Here

**Not started.** First step: the zone metrics in `mic-core`.

## Tasks

### Metrics (`mic-core`)

- Per zone, logged every 10 s while it has players (`slog`, no new library): local and remote players, events/tick, tick time p50/p99 (save + marshal + send), bytes sent/s, NATS batches in/out, dropped intents and chats. A dev-only `GET /api/dev/stats` (same `BOTS_SECRET` guard) may return the same as JSON for the bot script.
- `realtime`: count dropped messages per reason (rate, size, invalid).

### Load runs (`infra/bots`)

- `--ramp`: adds bots in steps (25, 50, 100, 200) on one map, then 500 over both maps; at each step prints the server stats beside the bots' (latency p99, bytes/s per bot, corrections).
- Run on 2 replicas; record CPU and memory (`docker stats`) at each step.
- Client: the real player in the pane with 50 bots drawn (desktop) and 30 (mobile preset): frame time from the engine's existing frame counter or `performance` marks.

### Tuning (only where a number misses D18)

- Server: buffer reuse in marshal, per-player send queue length and slow-consumer drop (close a client whose queue stays full, it reconnects with a snapshot), NATS batch size.
- Client: sprite pooling for others, skip drawing players off screen (the map is small now; keep it general).
- Interest: if one map's traffic is too big, viewport culling of `moved` events (D1) is the last resort; write it as a decision if added.
- Limits: confirm 20/s burst 40 for intents and 0.5/s burst 4 for chat don't trip a normal player (bots walking and running at FireRed's pace must see zero drops).

### Docs

- tech-stack.md: measured budget (players per zone, tick p99, bytes/s per client, replicas) under Efficient Event Model → Batching and rate; context.md D18 updated to the measured values.

## Manual Test

| # | Case | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | Zone metrics | 25 bots, `make logs` | A zone line every 10 s: players, events/tick, tick p50/p99, bytes/s, NATS in/out, drops | ⬜ |
| 2 | Ramp, one map | `--ramp` to 200 on 1F, two replicas | Per step: server and bot stats, `docker stats` CPU/memory written here; within D18 | ⬜ |
| 3 | Ramp, both maps | 500 over 1F and 2F | Within D18; numbers written here | ⬜ |
| 4 | Real player among them | Pane tab walking during the ramp | Own steps smooth, no `Correction` | ⬜ |
| 5 | Client frame time | 50 bots drawn on desktop, 30 on the mobile preset | Frame time within one 60 Hz frame; recorded | ⬜ |
| 6 | No drops at FireRed's pace | Walking/running bots, normal chat | Zero intent and chat drops | ⬜ |
| 7 | Slow client | DevTools throttling, or a bot that stops reading | It's dropped and reconnects with a snapshot; the zone's tick p99 holds | ⬜ |
| 8 | Regression | [context.md](context.md#playing-a-milestone) regression check | Nothing broken | ⬜ |
