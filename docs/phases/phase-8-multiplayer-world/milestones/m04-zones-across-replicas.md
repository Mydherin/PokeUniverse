# M4 Zones Across Replicas 🧪

Part of [Phase 8](../phase-8-multiplayer-world.md). **Needs:** M2. Rules: [context.md](context.md) D2, D3, D7, D19.

**Done when:** with two `mic-core` replicas, players on the same map see each other whichever replica holds them; a snapshot lists everyone on the map; a crashed replica's players vanish from the others within the session's 15 s, with no ghost left in Redis.

## Resume Here

**Code done 2026-11-10** (Go build, vet, `buf lint`/`breaking`, `docker compose config` green); **Manual Test pending, first case #1.** Then [M5](m05-chat-server.md).

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
| 1 | Two replicas | `MIC_CORE_REPLICAS=2`, `make up`, 10 bots on 1F | `make logs`: `player connected` on both `mic-core-1` and `mic-core-2` | ⬜ |
| 2 | Everyone sees everyone | Real tab on 1F; a `--verbose` bot | The tab draws all 10 moving smoothly; the verbose bot's snapshot lists everyone, whichever replica | ⬜ |
| 3 | Redis members | `HKEYS zone:pallet_town_players_house_1f:0` | Exactly the players on 1F, no one else | ⬜ |
| 4 | Stairs across replicas | Bots and the tab use the stairs | Leaves and joins seen on both maps; the hashes move with them | ⬜ |
| 5 | NATS subscriptions | `subsz?subs=1` (README) while both maps have players, then after one empties | `world.zone.<map>.0` subscribed per replica with players there; unsubscribed when the zone empties | ⬜ |
| 6 | Replica crash | `docker kill` the replica holding some bots | Survivors see those players vanish within 15 s, then come back on reconnect; no ghost in `HKEYS` | ⬜ |
| 7 | Graceful restart | `docker compose restart` one replica (`1012`) | Its players leave and rejoin cleanly, none twice | ⬜ |
| 8 | Take-over across replicas | Same bot token in a second tab (lands on the other replica) | Old one stops; others see one leave and one join, ending with one player | ⬜ |
| 9 | Back to one replica | `MIC_CORE_REPLICAS=1`, `make up` | M2's cases 1-3 short: still fine | ⬜ |
| 10 | Regression | [context.md](context.md#playing-a-milestone) regression check | Nothing broken | ⬜ |

## Gotchas

- A replica must not deliver its own batches twice (local + NATS echo).
- `zone:<map>:<phase>` writes must use the session check, or a taken-over old connection can rewrite the entry.
- Remote events must never be held as "unsaved" (nil player) nor republished: `takeEvents` checks `remote` first.
- The zone-empty path has to publish before unsubscribing, or the other replicas keep a ghost until the 5 s beat.
- `gofmt -l` still flags `internal/pokemon/wild.go` (from before M2).
