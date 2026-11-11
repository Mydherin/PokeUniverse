# M4 Zones Across Replicas ✅

Part of [Phase 8](../phase-8-multiplayer-world.md). **Needs:** M2. Rules: [context.md](context.md) D2, D3, D7, D19.

**Done when:** with two `mic-core` replicas, players on the same map see each other whichever replica holds them; a snapshot lists everyone on the map; a crashed replica's players vanish from the others within the session's 15 s, with no ghost left in Redis.

## Resume Here

**Done 2026-11-11:** code 2026-11-10 (Go build, vet, `buf lint`/`breaking`, `docker compose config` green); every Manual Test case passed in game 2026-11-11, no fix needed. Next: [M5](m05-chat-server.md).

- **Test driver (2026-11-11):** headless Playwright from the npx cache, kept outside the repo (side-session notes folder `m4-headless/`: `pw.mjs <botN> <botCount> <case.mjs>`, `up.mjs`/`down.mjs` for the stairs, `c3.mjs`'s `hkeys`, one script per case); it needs a TEMP-PLAYIT hook after `this.draw()` in `overworld.ts`'s frame (`window.__self` {x, y, map}, `__others` [id, px, py, name], `__playit` frames), removed after. Which replica holds a player: the newest `player connected` by `time` across `docker logs pokeuniverse-mic-core-N` (`docker compose logs` isn't in time order). Stairs: 10,2 on both maps; stand on them and press East (1F) or West (2F).

- **Files:** new `mic-core/internal/zonebus/zonebus.go` (NATS), `mic-core/internal/world/zone_bus.go` (remote state, publish, beat, silence, Redis snapshot, prune); changed `world.proto` (`ZoneBus`, `ZonePresence`, `ZoneMember`), `internal/live/live.go`, `world/zone.go`, `world/zone_presence.go`, `world/world.go` (`ZoneBus` interface, `New(..., zoneBus, ...)`), `cmd/mic-core/main.go` (logs `replica` in `world loaded`), `compose.yaml` (`deploy.replicas: ${MIC_CORE_REPLICAS:-1}`), `.env.example`, `docs/tech-stack.md`.
- **Contracts:** one `ZoneBus{replica, oneof batch: ZoneEvents | presence: ZonePresence{ids}}` (no `tick` field: NATS keeps one publisher's order, nothing read it). Redis value `ZoneMember{replica, OtherPlayer}`, so a snapshot knows which replica holds each remote player.
- **Redis:** `zone:<map>:<phase>` (`live.ZoneKey`) written by `saveScript` (KEYS session, pos, moved, zone; ARGV 9 = member) in the same session check; `pos` gets a `zone` field naming the hash the player is listed in, and the save `HDEL`s the old hash when it differs (take-over onto another map; undeclared key, fine on standalone Redis, not cluster). `LeaveZone` (session-checked) on `zone.remove` (warp, disconnect); `Release` also removes it. `ZoneMembers` (Lua) returns entries and `HDEL`s those whose session is gone or whose `pos.zone` names another hash; each zone runs it every beat as a prune too (crashed replica's players who never come back). New Game's `Clear` leaves the entry to that prune.
- **Zone:** `add` subscribes first (`Subscribe` flushes, so the Redis read after it misses nothing); the zone-empty branch of `run` ticks once more (publishes the last `left`s) then unsubscribes. Tick: `showChanges` now runs before the save and marks the player dirty (follower/battle rewrite its Redis entry); save; `takeEvents` → (shown, local); `publish(local)` + beat every 5 s + silence check (15 s = `live.SessionTTL`); send. Remote events: `zoneEvent{remote: true}` (never held, never republished); a remote event counts only if `remote.players[id]` is its replica (`joined` sets it). A local `joined` deletes `remote.players[id]`; a local `left` of a player another replica already holds is `hidden` (published, not shown locally). Subscription `gen` drops messages queued for an old subscription.
- **Bots:** `Welcome` carries no replica, so bots print nothing new; `make logs` prefixes `mic-core-1`/`mic-core-2` on `player connected`.
- **Manual Test how-to:** `MIC_CORE_REPLICAS=2` in `.env` (or `docker compose up -d --scale mic-core=2`), then `make up`; `docker compose exec redis redis-cli -a $REDIS_PASSWORD HKEYS zone:pallet_town_players_house_2f:0`; kill one: `docker kill pokeuniverse-mic-core-2` (name per `make ps`).
- **Build checks:** `make contracts`, `make breaking`; Go: `docker run --rm -v "$PWD":/repo -v pokeuniverse-go-mod:/go/pkg/mod -v pokeuniverse-go-build:/root/.cache/go-build -w /repo/mic-core golang:1.27-alpine sh -c 'go build ./... && go vet ./...'`; `docker compose config --quiet`.

## Tasks

### Contracts

- `world/v1`: `ZoneBatch{string replica, uint64 tick, ZoneEvents events}` for NATS; `ZonePresence{string replica, repeated uint64 ids}` (the beat). Or one `ZoneBus` oneof of both. Messages over NATS only, never to the client.

### Live state (`mic-core/internal/live`)

- `zone:<map>:<phase>` hash (the zone key from M2, D19): trainer → encoded `OtherPlayer` (D3). Set on join and on every change that changes it (tile, facing, follower, battle) in the zone's existing tick pipeline, inside the same session-checking Lua; `HDEL` on leave, warp (with the new map's `HSET` in one script) and disconnect.
- `ZoneMembers(map)`: `HGETALL`, then drops entries whose `player:<id>:session` is gone (crashed replica) and `HDEL`s them.

### Zone bus (`mic-core/internal/world`, wiring in `cmd/mic-core`)

- A replica ID (random at start, or the hostname).
- Zone start: subscribe `world.zone.<map>.<phase>` (map IDs are safe subject tokens; check); stop: unsubscribe. Messages from our own replica are skipped. Received batches go into the zone inbox (`do`) and are appended to the next tick's events (D7), kept in arrival order per replica.
- Tick: publish the local events of the tick (`ZoneBatch`) after the save, before sending (saved before shown holds; others may see it one tick later).
- Snapshot on enter, warp and reconnect: `others` = local players + `ZoneMembers(map)` from other replicas (by id, no duplicates); remote ones are remembered by replica (map of id → replica).
- Presence beat: every 5 s a zone with players publishes `ZonePresence` with its local ids; a receiver drops a remote player missing from its replica's beat, or whose replica was silent 15 s (no batch, no beat), as a `left` to its local players.
- Take-over across replicas already closes the old session (`sessionbus`); the old replica's `left` and the new one's `joined` both arrive; order by arrival is fine (left of an id that the receiver last saw from another replica is ignored).

### Infra

- `compose.yaml`: `mic-core` able to run 2 replicas (`deploy.replicas: 2` or `docker compose up --scale mic-core=2`; no fixed `container_name`, no host port). nginx already re-resolves `mic-core`; check WebSocket connections spread (each `/ws` may land on either replica).
- Bots: print which replica (if `Welcome` carries none, add nothing; check via `make logs`).

### Docs

- tech-stack.md: Movement → Zones (zones of a map share events over NATS), Live positions (`zone:<map>:<phase>`), NATS subjects table (`world.zone.<map>.<phase>`).

## Manual Test

| # | Case | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | Two replicas | `MIC_CORE_REPLICAS=2`, `make up`, 10 bots on 1F | `make logs`: `player connected` on both `mic-core-1` and `mic-core-2` | ✅ 2026-11-11 (6 on `mic-core-1`, 4 on `mic-core-2`) |
| 2 | Everyone sees everyone | Real tab on 1F; a `--verbose` bot | The tab draws all 10 moving smoothly; the verbose bot's snapshot lists everyone, whichever replica | ✅ 2026-11-11 (headless tab: everyone on its floor, no jumps or frame gaps over 10 s; bots roam both floors, so not all 10 stay on 1F; bot-10's snapshot after the stairs listed 6 players from both replicas) |
| 3 | Redis members | `HKEYS zone:pallet_town_players_house_1f:0` | Exactly the players on 1F, no one else | ✅ 2026-11-11 (tab's players = `HKEYS` 1F minus itself, 10 checks over 20 s; 1F + 2F = 11, no one in both) |
| 4 | Stairs across replicas | Bots and the tab use the stairs | Leaves and joins seen on both maps; the hashes move with them | ✅ 2026-11-11 (tab up and down: its players = that floor's `HKEYS`, itself moved between hashes; bots' joins seen within 1 s) |
| 5 | NATS subscriptions | `subsz?subs=1` (README) while both maps have players, then after one empties | `world.zone.<map>.0` subscribed per replica with players there; unsubscribed when the zone empties | ✅ 2026-11-11 (both replicas on both maps; bots stopped: none, both hashes empty; one bot on 2F: only its replica on 2F) |
| 6 | Replica crash | `docker kill` the replica holding some bots | Survivors see those players vanish within 15 s, then come back on reconnect; no ghost in `HKEYS` | ✅ 2026-11-11 (killed `mic-core-1`: its 3 bots reconnected to `mic-core-2` within ~1 s, redrawn in place; a tab on it closed at the kill left the survivor's view at 15.1 s and `HKEYS`; first try ran with my wrong replica lookup, redone) |
| 7 | Graceful restart | `docker compose restart` one replica (`1012`) | Its players leave and rejoin cleanly, none twice | ✅ 2026-11-11 (restarted `mic-core-2`: its 6 bots left and rejoined once ~1 s later, on either replica; no frame drew anyone twice; `HKEYS` clean) |
| 8 | Take-over across replicas | Same bot token in a second tab (lands on the other replica) | Old one stops; others see one leave and one join, ending with one player | ✅ 2026-11-11 (old copy on `mic-core-1`, new on `mic-core-2`: old shows "Playing somewhere else" and stops; an observer on `mic-core-2` drew exactly one copy all along, since the new `joined` replaces it and the old replica's `left` is hidden by design) |
| 9 | Back to one replica | `MIC_CORE_REPLICAS=1`, `make up` | M2's cases 1-3 short: still fine | ✅ 2026-11-11 (`.env` line removed, one `mic-core`; 4 bots on 2F: bot-4 listed BOT1 in its snapshot, printed the tab's `joined`, walks, turns, then `left`/`joined` on the stairs; the tab drew 2F's and 1F's players) |
| 10 | Regression | [context.md](context.md#playing-a-milestone) regression check | Nothing broken | ✅ 2026-11-11 (one replica, 5 bots: walked 1F → stairs → 2F → stairs → 1F, 3,371 frames, never more than 1 px a frame (no `Correction`); 2F's trainer battled; a wild battle in the test grass, then walking again) |

## Gotchas

- A replica must not deliver its own batches twice (local + NATS echo).
- `zone:<map>:<phase>` writes must use the session check, or a taken-over old connection can rewrite the entry.
- Remote events must never be held as "unsaved" (nil player) nor republished: `takeEvents` checks `remote` first.
- The zone-empty path has to publish before unsubscribing, or the other replicas keep a ghost until the 5 s beat.
- `gofmt -l` still flags `internal/pokemon/wild.go` (from before M2).
