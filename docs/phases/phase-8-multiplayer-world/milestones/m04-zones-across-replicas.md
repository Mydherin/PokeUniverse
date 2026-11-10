# M4 Zones Across Replicas ⬜

Part of [Phase 8](../phase-8-multiplayer-world.md). **Needs:** M2. Rules: [context.md](context.md) D2, D3, D7.

**Done when:** with two `mic-core` replicas, players on the same map see each other whichever replica holds them; a snapshot lists everyone on the map; a crashed replica's players vanish from the others within the session's 15 s, with no ghost left in Redis.

## Resume Here

**Not started.** First step: the Redis zone members (`internal/live`).

## Tasks

### Contracts

- `world/v1`: `ZoneBatch{string replica, uint64 tick, ZoneEvents events}` for NATS; `ZonePresence{string replica, repeated uint64 ids}` (the beat). Or one `ZoneBus` oneof of both. Messages over NATS only, never to the client.

### Live state (`mic-core/internal/live`)

- `zone:<map>` hash: trainer → encoded `OtherPlayer` (D3). Set on join and on every change that changes it (tile, facing, follower, battle) in the zone's existing tick pipeline, inside the same session-checking Lua; `HDEL` on leave, warp (with the new map's `HSET` in one script) and disconnect.
- `ZoneMembers(map)`: `HGETALL`, then drops entries whose `player:<id>:session` is gone (crashed replica) and `HDEL`s them.

### Zone bus (`mic-core/internal/world`, wiring in `cmd/mic-core`)

- A replica ID (random at start, or the hostname).
- Zone start: subscribe `world.zone.<map>` (map IDs are safe subject tokens; check); stop: unsubscribe. Messages from our own replica are skipped. Received batches go into the zone inbox (`do`) and are appended to the next tick's events (D7), kept in arrival order per replica.
- Tick: publish the local events of the tick (`ZoneBatch`) after the save, before sending (saved before shown holds; others may see it one tick later).
- Snapshot on enter, warp and reconnect: `others` = local players + `ZoneMembers(map)` from other replicas (by id, no duplicates); remote ones are remembered by replica (map of id → replica).
- Presence beat: every 5 s a zone with players publishes `ZonePresence` with its local ids; a receiver drops a remote player missing from its replica's beat, or whose replica was silent 15 s (no batch, no beat), as a `left` to its local players.
- Take-over across replicas already closes the old session (`sessionbus`); the old replica's `left` and the new one's `joined` both arrive; order by arrival is fine (left of an id that the receiver last saw from another replica is ignored).

### Infra

- `compose.yaml`: `mic-core` able to run 2 replicas (`deploy.replicas: 2` or `docker compose up --scale mic-core=2`; no fixed `container_name`, no host port). nginx already re-resolves `mic-core`; check WebSocket connections spread (each `/ws` may land on either replica).
- Bots: print which replica (if `Welcome` carries none, add nothing; check via `make logs`).

### Docs

- tech-stack.md: Movement → Zones (zones of a map share events over NATS), Live positions (`zone:<map>`), NATS subjects table (`world.zone.<map>`).

## Play It

1. Two replicas; 10 bots spread over both (check logs); the real player sees all of them move smoothly, and bots on either replica list everyone in their snapshots.
2. Stairs between maps across replicas: leaves and joins seen on both maps.
3. `docker kill` one replica: its bots and maybe the real player reconnect to the other; the survivors see the dead replica's players vanish within 15 s and then come back once reconnected; `zone:<map>` holds no ghost (`redis-cli HKEYS`).
4. Graceful restart of one replica (`1012`): players leave and rejoin cleanly.
5. Back to one replica: everything still works (M2's Play It, short).
6. Regression check.

## Gotchas

- A replica must not deliver its own batches twice (local + NATS echo).
- `zone:<map>` writes must use the session check, or a taken-over old connection can rewrite the entry.
