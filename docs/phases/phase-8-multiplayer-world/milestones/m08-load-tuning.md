# M8 Load and Tuning 🔨

Part of [Phase 8](../phase-8-multiplayer-world.md). **Needs:** M4, M5 (M3 for the client part). Rules: [context.md](context.md) D1, D7, D17, D18.

**Done when:** the budget in D18 is measured with bots on two replicas and holds (or the fix that makes it hold is in), and the numbers are written in tech-stack.md.

## Resume Here

**In progress (2026-11-11):** code done (Go build/vet, `make contracts`, SPA `tsc` green; nothing needed tuning). Manual Test 1-7 ✅; **next: case 8**, then the Docs task, then close M8.

- **Next steps, in order:**
  1. **Case 8 (regression):** already seen with 5 bots on two replicas, 0 corrections and no own jumps: stairs both ways, a 1F wild battle won, walking after it. **Left:** the 2F room trainer. Talking at 9,5 facing up started nothing (`c8_trainer_start.png`): find the trainer's tile in `lib-maps` (grep the 2F map's objects) or in M4's notes, stand facing it, then mash A. Driver: `m8-headless/c8mine.mjs` (below); a fresh bot each run (`FIRST=305…`, `MAP=pallet_town_players_house_2f`). The route to the stairs is `toStairs` (go to y ≥ 4, then x = 10, then up), because the rail blocks a straight walk at 8,2.
  2. **Remove the `TEMP-PLAYIT` hooks** (grep `TEMP-PLAYIT`): `spa-pokeuniverse/src/game/game.ts` (`__dt`, `__ft` in `update`) and `src/game/firered/overworld.ts` (`__self`, `__othersN`, `__playit` after `this.draw()`, `__corrections` in `correct`). Rebuild with `docker compose up -d --build --no-deps spa-pokeuniverse`.
  3. **Docs task:** `tech-stack.md` → Efficient Event Model → Batching and rate: the measured budget (cases 2-3, 5-7 below). `context.md` D18: the measured values. Mark the Docs task ✅.
  4. **Close:** M8 ✅. Move the phase file's Resume Here and status, `docs/phases/index.md` (7/9 ✅) and the AGENTS.md Now line to M9, still noting M7's phone cases 9-10. Run `make bots-clean`; the stack can stay up.
- **Stack now:** two replicas (`pokeuniverse-mic-core-3`, `-4`), started with `--scale mic-core=2`; `.env` is unchanged (no `MIC_CORE_REPLICAS`). **Gotcha:** `docker compose up -d --build spa-pokeuniverse` *without* `--no-deps` resets mic-core to one replica. Restore with `docker compose up -d --no-recreate --scale mic-core=2 mic-core`. No bots running.
- **Test driver:** shared notes folder `m8-headless/` (`pw.mjs`, `lib.mjs`, `up.mjs`, `down.mjs`, `c4load.mjs`, `c7slow.mjs`, `c8mine.mjs`, `stall.py`, `frames.ts`). Copy it into your scratchpad and run `node pw.mjs 1 1 ./case.mjs`. `FIRST=n [MAP=…]` spawns bot-n alone, so it doesn't take over a running bot. `MOBILE=1 VW=375 VH=812` is the phone layout; `STILL=1` keeps `c4load` standing. Bot numbers used so far: 1-250 and 501-750 (ramp), 300-304 (pane), 400-404 (regression bots).
- **Slow client (case 7) how-to:** `F=$(node --import ./infra/bots/hooks.mjs frames.ts 301 2>/dev/null)`, then `docker run --rm --network pokeuniverse_default -v <dir>:/s python:3-alpine python /s/stall.py mic-core 20 ${=F}` (zsh needs `${=F}`). Inside the network mic-core listens on `:8081`.
- **Stats:** `curl -s localhost:8080/api/dev/stats -H "X-Bots-Secret: $S"` answers one replica per request. A zone that has emptied is gone from it, so read `docker logs pokeuniverse-mic-core-N | grep '"zone stats"'` after a run. Ramp: `node infra/bots/bots.ts --ramp --map pallet_town_players_house_1f [--hold 30]` (about 4 min, then the bots keep walking). `--stay` keeps bots off the stairs.
- **Code files:** new `mic-core/internal/stats/stats.go` (realtime drop counters), `internal/world/zone_stats.go` (10 s window, `zone stats` line, `World.Stats`, `Player.Dropped`). Changed: `zone.go` (tick timing; bytes = `proto.Size` of each answer + the encoded events per player; corrections; `emptied`), `zone_bus.go` (batches in/out), `world.go` (`zoneStats`), `realtime.go` (`c.dropped` by reason; the slow-consumer close now logs a warning and counts), `bots.go` (`GET /api/dev/stats`; `first` up to 1000), `main.go`, `dev/v1/bots.proto` (`ReplicaStats`, `ZoneStats`, `Drops`), `infra/bots/run.ts` (`--ramp`, `--stay`, `--map2`, `--hold`; spawns in calls of 100; `--count` up to 500).
- **Tuning decision:** nothing missed D18, so there is no marshal buffer reuse, no queue or NATS change, no client pooling or culling, and the limits stay as they are. The slow-consumer drop (queue of 64 → close 1013 → the client reconnects with a snapshot) already existed and is verified in case 7.

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

- tech-stack.md: measured budget (players per zone, tick p99, bytes/s per client, replicas) under Efficient Event Model → Batching and rate; context.md D18 updated to the measured values.

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
| 8 | Regression | [context.md](context.md#playing-a-milestone) regression check | Nothing broken | ⬜ |
