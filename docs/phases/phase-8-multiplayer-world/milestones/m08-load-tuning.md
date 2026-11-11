# M8 Load and Tuning ✅

Part of [Phase 8](../phase-8-multiplayer-world.md). **Needs:** M4, M5 (M3 for the client part). Rules: [context.md](context.md) D1, D7, D17, D18.

**Done when:** the budget in D18 is measured with bots on two replicas and holds (or the fix that makes it hold is in), and the numbers are written in tech-stack.md.

## Resume Here

**Done 2026-11-11:** Manual Test 1-8 ✅, the measured budget is in [tech-stack.md](../../../tech-stack.md#efficient-event-model) and D18; nothing needed tuning (no marshal buffer reuse, queue, NATS, pooling or culling change; limits unchanged; the slow-consumer drop already existed, case 7). The `TEMP-PLAYIT` hooks are removed and the SPA rebuilt (`--no-deps`).

- **For M9:** the stack runs two replicas (`--scale mic-core=2`, `.env` unchanged). `docker compose up -d --build spa-pokeuniverse` *without* `--no-deps` resets mic-core to one replica; restore with `docker compose up -d --no-recreate --scale mic-core=2 mic-core`.
- **Test driver:** shared notes folder `m8-headless/` (copy into the scratchpad; `node pw.mjs 1 1 ./case.mjs`, `FIRST=n [MAP=…]` spawns bot-n alone). It reads `window.__self`, `__playit`, `__corrections`, which only the `TEMP-PLAYIT` hooks set (code in `m8-headless/hooks.md`): add them back for a headless run, remove them after. `t3.mjs` (with `t2.mjs`) plays the room trainer. **Hold keys ≥ 60 ms** (`keyboard.down`, sleep, `up`): a `keyboard.press` tap falls between game frames and is lost. Room trainer: reach 8,5 (row 3 to x=7, down to 4, right to 8, down to 5), step right to 9,5, face up, A. Leaving mid-battle rolls it back (no resume after a reload).
- **Stats:** `curl -s localhost:8080/api/dev/stats -H "X-Bots-Secret: $S"` (one replica per request); `docker logs pokeuniverse-mic-core-N | grep '"zone stats"'`. Ramp: `node --import ./infra/bots/hooks.mjs infra/bots/bots.ts --ramp --map pallet_town_players_house_1f [--hold 30]`.
- **Code files:** new `mic-core/internal/stats/stats.go`, `internal/world/zone_stats.go`; changed `zone.go`, `zone_bus.go`, `world.go`, `realtime.go`, `bots.go`, `main.go`, `dev/v1/bots.proto`, `infra/bots/run.ts` (committed in 26834e8). This session changed docs only.

## Tasks

### Metrics (`mic-core`)

- ✅ Per zone, logged every 10 s while it has players (`slog`, no new library): local and remote players, events/tick, tick time p50/p99 (save + marshal + send), bytes sent/s, NATS batches in/out, dropped intents and chats. A dev-only `GET /api/dev/stats` (same `BOTS_SECRET` guard) may return the same as JSON for the bot script.
- ✅ `realtime`: count dropped messages per reason (rate, size, invalid).

### Load runs (`infra/bots`)

- ✅ `--ramp`: adds bots in steps (25, 50, 100, 200) on one map, then 500 over both maps; at each step prints the server stats beside the bots' (latency p99, bytes/s per bot, corrections).
- ✅ Run on 2 replicas; record CPU and memory (`docker stats`) at each step.
- ✅ Client: the real player in the pane with 50 bots drawn (desktop) and 30 (mobile preset): frame time from the engine's existing frame counter or `performance` marks.

### Tuning (only where a number misses D18)

✅ Not needed: every number stayed within D18 (see Resume Here, Tuning decision).


- Server: buffer reuse in marshal, per-player send queue length and slow-consumer drop (close a client whose queue stays full, it reconnects with a snapshot), NATS batch size.
- Client: sprite pooling for others, skip drawing players off screen (the map is small now; keep it general).
- Interest: if one map's traffic is too big, viewport culling of `moved` events (D1) is the last resort; write it as a decision if added.
- Limits: confirm 20/s burst 40 for intents and 0.5/s burst 4 for chat don't trip a normal player (bots walking and running at FireRed's pace must see zero drops).

### Docs

- ✅ tech-stack.md: measured budget (players per zone, tick p99, bytes/s per client, replicas) under Efficient Event Model → Batching and rate; context.md D18 updated to the measured values.

## Manual Test

| # | Case | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | Zone metrics | 25 bots, `make logs` | A zone line every 10 s: players, events/tick, tick p50/p99, bytes/s, NATS in/out, drops | ✅ 2026-11-11: `zone stats` every 10 s on both replicas (12 local + 13 remote, 3.8 events/tick, tick p50 1.6-2.2 ms p99 3.4-5.3 ms, ~12 KB/s for the zone, NATS ~175/175, 0 drops) |
| 2 | Ramp, one map | `--ramp` to 200 on 1F, two replicas | Per step: server and bot stats, `docker stats` CPU/memory written here; within D18 | ✅ 2026-11-11 (hold 30 s, both replicas ~half each). 25: tick p99 3.8-4.9 ms, 0.89 KB/s per client, bot ping p99 2 ms; 50: p99 3.8-4.8 ms, 1.8 KB/s, ping p99 3 ms; 100: p99 2.8-3.8 ms, 3.9 KB/s, ping p99 6 ms; 200: p99 1.8-1.9 ms, 7.9 KB/s, ping p99 9 ms. 0 corrections, 0 drops, ~20 frames/s per bot. `docker stats` mic-core 0.3-2.3% CPU, 22 → 35 MiB each; Redis 42 MiB, NATS 27 MiB (one-shot samples). Bot process CPU 6-31%. |
| 3 | Ramp, both maps | 500 over 1F and 2F | Within D18; numbers written here | ✅ 2026-11-11: 250 + 250, each zone ~125 local + 125 remote per replica, 38-39 events/tick, tick p50 0.8-0.9 ms p99 1.3-1.9 ms, 9.6-9.8 KB/s per client (249 others; D18's 8 KB/s is for 50 others: 1.8 KB/s), NATS ~200/200 per 10 s, bot ping p99 5 ms, 0 corrections or drops; mic-core ~3% CPU, 51 MiB each; bot process 34% CPU |
| 4 | Real player among them | Pane tab walking during the ramp | Own steps smooth, no `Correction` | ✅ 2026-11-11: bot-300 headless on 1F, 40 s each: among the 500 (250 others known; that run lost a replica midway, see Gotchas) and again with 200 bots on two replicas (200 known, zone tick p99 ≤ 8 ms): 0 corrections, steps taken where the room allowed, frame work p99 1.1-1.6 ms |
| 5 | Client frame time | 50 bots drawn on desktop, 30 on the mobile preset | Frame time within one 60 Hz frame; recorded | ✅ 2026-11-11 (TEMP-PLAYIT `performance.now()` around `game.ts` `update`, headless Chromium): desktop 1280×720, 50 others drawn: work p50 0.4 ms p99 0.6 ms max 0.8 ms, rAF interval p99 16.9 ms, 0 frames over 16.7 ms; mobile 375×812 @3x, 30 others: p50 0.8 p99 1.2 max 1.4 ms, 0 over; 250 others (case 4): p99 1.1 ms. No client tuning needed |
| 6 | No drops at FireRed's pace | Walking/running bots, normal chat | Zero intent and chat drops | ✅ 2026-11-11: 100 bots (25% running, stairs, `--chat`) 80 s on two replicas: every `zone stats` line 0 corrections, 0 dropped intents, 0 dropped chats; tick p99 2.4-4.8 ms; ~250 chat lines sent |
| 7 | Slow client | DevTools throttling, or a bot that stops reading | It's dropped and reconnects with a snapshot; the zone's tick p99 holds | ✅ 2026-11-11 with 200 bots on 1F: a raw client in the Docker network (`SO_RCVBUF` 2 KB, straight to `mic-core:8081`) entered, then stopped reading: `slow consumer dropped` 6 s later (queue of 64 full, close 1013); reconnecting got the snapshot and events again (32 KB in 3 s, as on first entry); tick p99 2.0-2.8 ms throughout. (Pausing the page's JS doesn't stall the socket, and through the host port Docker buffers > 60 s of frames.) |
| 8 | Regression | [context.md](context.md#playing-a-milestone) regression check | Nothing broken | ✅ 2026-11-11, 5 bots on two replicas: stairs both ways, a 1F wild battle won and walking after it (0 corrections, no own jumps); the 2F room trainer (stand at 9,5 from 8,5, face up, A): question, YES, intro, battle played 10 min to the end (lost by random input) → whiteout to 6,6 with its one server correction, walking after it with no own jumps; no ERROR/WARN in mic-core or mic-battles. (The earlier "nothing happens" was the driver: a `keyboard.press` tap is shorter than a game frame; hold keys ≥ 60 ms.) |
