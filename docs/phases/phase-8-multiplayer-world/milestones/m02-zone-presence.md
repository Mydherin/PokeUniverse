# M2 Zone Presence on One Replica ⬜

Part of [Phase 8](../phase-8-multiplayer-world.md). **Needs:** M1. Rules: [context.md](context.md) D1, D5, D6, D7, D9, D10, D12.

**Done when:** on one `mic-core` replica, a player entering a map gets the others in its snapshot, then each tick one `ZoneEvents` with who joined, left, moved, turned, changed follower or entered/left a battle; bots print what they receive. Nothing is drawn yet (M3).

## Resume Here

**Not started.** First step: the contracts.

## Tasks

### Contracts (`lib-contracts/proto/pokeuniverse/world/v1/world.proto`, `realtime/v1/realtime.proto`)

- `OtherPlayer{uint64 id, string name, trainer.v1.Gender gender, uint32 x, y, map.v1.Direction facing, Follower follower, bool in_battle}` (D5).
- `ZoneEvents{repeated ZoneEvent events}`, `ZoneEvent{oneof: PlayerJoined joined, PlayerLeft left, PlayerMoved moved, PlayerTurned turned, PlayerFollower follower, PlayerBattle battle}` (chat added in M5): `PlayerJoined{OtherPlayer player}`, `PlayerLeft{id}`, `PlayerMoved{id, x, y, facing, bool run}`, `PlayerTurned{id, facing}`, `PlayerFollower{id, Follower follower}` (unset: none), `PlayerBattle{id, in_battle}`.
- `WorldSnapshot.others` and `Warped.others` (`repeated OtherPlayer`); `ServerMessage.zone_events = 22`.
- `make contracts`, `make breaking` (additions only).

### Server (`mic-core/internal/world`)

- `zone`: an `events []*worldv1.ZoneEvent` buffer for the tick; `add`/`remove` append `joined`/`left` (remove also on warp and disconnect); `move` (accepted step) appends `moved` with `run`; `turn` → `turned`; `syncFollower` when it changes → `follower`; battle start/end (`world/battle.go`, the lock already there) → `battle` (D9).
- Snapshot (`EnterWorld`, reconnect) and `Warped` fill `others` from the zone's players (excluding self), using `Player`'s name, gender, tile, facing, follower, battle. The join is appended after the new player is in, so others get it in the same tick it saves.
- `tick`: after the save, if `events` is non-empty, marshal one `ZoneEvents` once and send the same bytes to every player in the zone (D7): build each envelope by appending the pre-encoded field 22 to the envelope's own `seq` (`protowire.AppendTag`/`AppendBytes`); `sink` gets a `SendRaw` (or equivalent). Events of a player not saved this tick (dirty after a failed save) wait for the next tick with that player's answers.
- Order inside the tick: the player's own answers first, then `ZoneEvents`.
- Steps through another player stay valid (D6): check `rules.go` has no player collision (it doesn't today) and say so in a comment.

### Bots (`infra/bots`)

- Track the others from the snapshot and `zone_events`; with `--verbose` print each event; stats add events/s and others known. A bot ignores events with its own id.

### Docs

- tech-stack.md: Movement → **Zones** line (others in the zone, `ZoneEvents` per tick encoded once); `lib-contracts` packages list (`world.v1` new messages).

## Play It

1. 3 bots on 2F; a 4th with `--verbose`: its snapshot lists the other 3 and the real player; it prints their steps, turns and joins/leaves as they move and use the stairs.
2. The real player swaps the lead (party SWITCH): the verbose bot gets `follower`; the real player starts the room trainer's battle: `battle` true, then false.
3. Reconnect (restart `mic-core`): each bot's new snapshot has the others, no duplicates, no one missing.
4. Traffic: one `zone_events` frame per tick at most per bot; bytes/s printed.
5. Regression check.

## Gotchas

- `seq` is per connection: the shared bytes are the payload only, never the whole envelope.
- A player leaving and rejoining in one tick: `left` then `joined`, in that order.
