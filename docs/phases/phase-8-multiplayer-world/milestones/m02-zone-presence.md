# M2 Zone Presence on One Replica ✅

Part of [Phase 8](../phase-8-multiplayer-world.md). **Needs:** M1. Rules: [context.md](context.md) D1, D5, D6, D7, D9, D10, D12, D19.

**Done when:** on one `mic-core` replica, a player entering a map gets the others in its snapshot, then each tick one `ZoneEvents` with who joined, left, moved, turned, changed follower or entered/left a battle; bots print what they receive. Nothing is drawn yet (M3).

## Resume Here

**Done 2026-11-11: every Manual Test case passed** (one replica). No code bug found; nothing TEMP left. `infra/bots/run.ts` gained `--idle` (the verbose bot never walks) and `(in battle)` in `who()`. Next: [M3's Manual Test](m03-drawing-others.md#resume-here).

### How this test is played (saves re-discovery)

1. Fresh bot accounts + the tab's token: `S=$(grep '^BOTS_SECRET=' .env | cut -d= -f2-); curl -s -X POST localhost:8080/api/dev/bots -H "X-Bots-Secret: $S" -H 'Content-Type: application/json' -d '{"count":5,"map":"pallet_town_players_house_2f"}'` → take bot `n=5`'s `accessToken`; open `http://localhost:8080/play?bot=<token>` in the browser pane; `Return` ×3 then `z` ×2 (CONTINUE) to reach the world. `refreshOnly: true` renews tokens without a New Game.
2. Bots: `node infra/bots/bots.ts --count 4 --verbose [--idle] > <scratchpad>/bots.log 2>&1` in the background; `grep BOT5` the log. bot-4 = observer, BOT5 (id 50) = the tab.
3. **Tab tokens last 15 min and the tab can't renew them:** a long battle can drop the tab (the battle is then abandoned and the party restored). Get a fresh token before a long case.
4. **Input:** the pane's `key` action is too short for walking; dispatch `KeyboardEvent`s from `javascript_tool` on `document.body` and `window` (`keydown`, wait, `keyup`): ~330 ms = turn + 1 step, ~270 ms per extra step; a 60 ms tap turns. A = `z` (`KeyZ`), B = `x` (`KeyX`), Start = `Return`. Keep each script under 45 s.
5. **Stairs:** 2F's warp is (10,2), down-left: stand on it and press West again; 1F's (10,2) is up-right: press East.
6. **Room trainer** `test_trainer` (9,4): from (10,4) face West, `z`. Six Lv50s: a full battle takes ~8 min. Loop per turn: `z`,`z` (FIGHT, first move) then `x` ×5 (B advances text and answers NO to "Will you switch?"). On a faint the party screen needs `ArrowRight` then `ArrowDown` ×k to a live Pokémon, `z`,`z`.
7. **Running:** nobody can run in game until Phase 10 (`hasRunningShoes = false`, both house maps `allow_running: false`); case 2 used a TEMP `canRun = true` in `world.go` Join and `warp.go` arrive (removed).
8. Rebuild after a code change: `docker compose up -d --build mic-core` (bots and the tab reconnect by themselves).

## What Was Built

- **Contracts:** `world.v1`: `OtherPlayer` (`id` = account ID, as `Welcome.account_id`), `ZoneEvents`/`ZoneEvent` and the six deltas; `WorldSnapshot.others = 9`, `Warped.others = 7`; `ServerMessage.zone_events = 22`. `make contracts`, `make breaking` green.
- **Server (`mic-core/internal/world`):**
  - `world.go`: `ZoneKey{Map, Phase}`, `zones map[ZoneKey]*zone`, `phaseOf(p, m)` → `0`, `zoneOf(m, phase)` (Join, `warp.go`). Join fills `others` inside the zone call right after `add`.
  - `zone_presence.go` (new): `zoneEvent{p, ev}` buffer (`zone.events`), `emit`, `asOther`, `others(self)` (skips self and any older connection of the same account, dedupes by id), `joined`/`left`/`moved`/`turned`, `showChanges` (follower via `syncFollower` now returning `bool`; battle by comparing `p.battle != nil` with `Player.shownBattle`, which catches every start/end path in `battle.go` without touching it), `takeEvents` (keeps events of a player still in the zone and dirty), `encodeEvents`, `missedEvents` (a dirty player gets the tick's events queued in its own `out`).
  - `zone.go`: `add` → joined; `remove` → left (unless a newer connection of the same account is in the zone: reconnect); `save` kick (not owned) → left; `move` → moved (`run && canRun`), a bump that turns → turned; `turn` → turned; tick: save, `showChanges` for saved players, take + encode once, then per player its `out` then `sink.SendZoneEvents(encoded)`. Zone emptied → `events = nil`.
  - `warp.go` `arrive`: `placeFollower` before `add` (joined carries the follower), `Warped.others`.
  - `realtime.go`: `Sink.SendZoneEvents`; `conn.writeZoneEvents` builds `seq` + field 22 with `protowire` (field numbers read from the descriptor), shared `enqueue`.
  - D6: comment in `zone_presence.go` (CheckStep looks at the map only).
- **Bots (`infra/bots/run.ts`):** `--verbose` prints what the last bot (`bot-N`) receives (a second script run would re-spawn `bot-1` and take it over, so the "4th verbose bot" is `--count 4 --verbose`); each bot keeps `others` (reset from snapshot/`Warped`, upsert on joined), ignores its own id; stats add `zone: events/s, frames/s per bot, others known lo-hi`.
- **Docs:** tech-stack.md Movement → Zones line and `world.v1` package list.

## Setup Notes

- Step 1: `node infra/bots/bots.ts --count 4 --verbose`: bot-4 prints its snapshot's others and every event; the real player plays beside them.
- Build checks used: `make contracts`, `make breaking`; Go: `docker run --rm -v "$PWD":/repo -v pokeuniverse-go-mod:/go/pkg/mod -v pokeuniverse-go-build:/root/.cache/go-build -w /repo/mic-core golang:1.27-alpine sh -c 'go build ./... && go vet ./...'`; bots: `node infra/bots/bots.ts --count 0 --secret x` loads every module (prints the count error). `tsc` on `infra/bots` only reports the environment (no Node types, `@bufbuild/protobuf` unresolved from `infra/`), nothing in the new code.

## Tasks

### ✅ Contracts (`lib-contracts/proto/pokeuniverse/world/v1/world.proto`, `realtime/v1/realtime.proto`)

- `OtherPlayer{uint64 id, string name, trainer.v1.Gender gender, uint32 x, y, map.v1.Direction facing, Follower follower, bool in_battle}` (D5).
- `ZoneEvents{repeated ZoneEvent events}`, `ZoneEvent{oneof: PlayerJoined joined, PlayerLeft left, PlayerMoved moved, PlayerTurned turned, PlayerFollower follower, PlayerBattle battle}` (chat added in M5): `PlayerJoined{OtherPlayer player}`, `PlayerLeft{id}`, `PlayerMoved{id, x, y, facing, bool run}`, `PlayerTurned{id, facing}`, `PlayerFollower{id, Follower follower}` (unset: none), `PlayerBattle{id, in_battle}`.
- `WorldSnapshot.others` and `Warped.others` (`repeated OtherPlayer`); `ServerMessage.zone_events = 22`.
- `make contracts`, `make breaking` (additions only).

### ✅ Server (`mic-core/internal/world`)

- Zone key (D19): zones are keyed by `ZoneKey{map, phase}` instead of the map ID (zone map, enter, warp, reconnect); `phaseOf(player, map)` returns `0` for now (Phase 10 fills it). Snapshot `others` come from the same key only.
- `zone`: an `events []*worldv1.ZoneEvent` buffer for the tick; `add`/`remove` append `joined`/`left` (remove also on warp and disconnect); `move` (accepted step) appends `moved` with `run`; `turn` → `turned`; `syncFollower` when it changes → `follower`; battle start/end (`world/battle.go`, the lock already there) → `battle` (D9).
- Snapshot (`EnterWorld`, reconnect) and `Warped` fill `others` from the zone's players (excluding self), using `Player`'s name, gender, tile, facing, follower, battle. The join is appended after the new player is in, so others get it in the same tick it saves.
- `tick`: after the save, if `events` is non-empty, marshal one `ZoneEvents` once and send the same bytes to every player in the zone (D7): build each envelope by appending the pre-encoded field 22 to the envelope's own `seq` (`protowire.AppendTag`/`AppendBytes`); `sink` gets a `SendRaw` (or equivalent). Events of a player not saved this tick (dirty after a failed save) wait for the next tick with that player's answers.
- Order inside the tick: the player's own answers first, then `ZoneEvents`.
- Steps through another player stay valid (D6): check `rules.go` has no player collision (it doesn't today) and say so in a comment.

### ✅ Bots (`infra/bots`)

- Track the others from the snapshot and `zone_events`; with `--verbose` print each event; stats add events/s and others known. A bot ignores events with its own id.

### ✅ Docs

- tech-stack.md: Movement → **Zones** line (others in the zone, `ZoneEvents` per tick encoded once); `lib-contracts` packages list (`world.v1` new messages).

## Manual Test

| # | Case | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | Snapshot lists the others | 3 bots on 2F, the real tab on 2F, then `--count 4 --verbose` | bot-4's snapshot lists bots 1-3 and the real player, not itself | ✅ 2026-11-10 (BOT2 entered just after bot-4: came as `joined`) |
| 2 | Moves and turns | Walk, run and turn in the real tab | bot-4 prints `moved` (with `run` when running) and `turned` for the real player and each bot | ✅ 2026-11-10 (`run` only with a TEMP `canRun = true`: no Running Shoes and no running map until Phase 10, O1) |
| 3 | Join and leave by warp | Take the stairs down and back up | bot-4 prints `left` then `joined`; the `Warped` snapshot on 1F lists who is there | ✅ 2026-11-10 (the tab drew BOT2 and Mom on 1F) |
| 4 | Follower change | Party SWITCH of the lead in the real tab | bot-4 prints `follower` with the new species | ✅ 2026-11-10 (Charizard → Pikachu: `follower #25`) |
| 5 | Battle flag | Room trainer's battle, then a wild battle in the test grass | `battle` true at start, false at the end, each time | ✅ 2026-11-11 (room trainer: `entered`, then `left a battle` at the blackout; wild Rattata on 1F: `entered`, RUN → `left`; once each) |
| 6 | Disconnect | Close the real tab; Ctrl-C one bot | `left` for each within the session's 15 s, no duplicate | ✅ 2026-11-11 (tab left the page: `BOT5 left` in <10 s; a 2nd `--count 1` run took bot-1 over (old one closed 4004 REPLACED, no reconnect), its Ctrl-C: `BOT1 left` in ~6 s; once each, Redis zones clean) |
| 7 | Reconnect | `docker compose restart mic-core` | Every bot's new snapshot has all the others, none twice, none missing | ✅ 2026-11-11 (4 bots + tab, `reconnects 4`; bot-4 reconnected first so its snapshot was empty, then BOT2, BOT3, BOT5 each one `joined`: snapshot + joins = Redis `zone:…_1f:0`, none twice; BOT1 on 2F) |
| 8 | Take-over | Open the same bot token in a second tab | Old tab stops; others see one player (no ghost, no duplicate) | ✅ 2026-11-11 (old tab: "Playing somewhere else"; bot-4: one `BOT5 joined` (upsert), no `left` after 20 s; Redis lists 50 once) |
| 9 | Traffic | Stats with 5 bots for 1 min | At most one `zone_events` frame per tick per bot; bytes/s printed and small | ✅ 2026-11-11 (5 bots, 70 s: 7.0-10.7 frames/s per bot at a 20/s tick (`Tick` 50 ms), 33-65 events/s, 159-378 B/s per bot, 0 corrections) |
| 10 | Regression | [context.md](context.md#playing-a-milestone) regression check | Both maps, stairs, wild battle, room trainer; no `Correction` walking through bots | ✅ 2026-11-11 (the tab as a 6th account with `--count 5`: 2F ↔ 1F both ways through the crowd, 0 `Correction` in the tab (counted on its socket) and 0 in bot stats; trainer and wild battle played in case 5 with bots around; mic-core logs clean but for the expected stale saves below) |

## Gotchas

- `seq` is per connection: the shared bytes are the payload only, never the whole envelope.
- A player leaving and rejoining in one tick: `left` then `joined`, in that order.
- A snapshot can list a player whose `joined` is still buffered (not saved yet): the client must treat `joined` as an upsert (bots do; M3 too).
- `gofmt -l` flags `internal/pokemon/wild.go`: already so before M2, not touched.
- A `save trainer … stale save` ERROR in the logs right after `POST /api/dev/bots` re-creates an account that is still connected (a second bot run, or the tab's account) is the stale-save guard refusing the old session: expected, not a bug.
- Tab position: the camera crops the map, so read the tab's tile from Redis (`HGET zone:<map>:0 <id>`: `OtherPlayer` fields 4 = x, 5 = y) instead of guessing from a screenshot.
- Counting the tab's `Correction`s: wrap `WebSocket.prototype.send` before CONTINUE to grab the socket, then count server frames whose payload tag after `seq` is `0x32` (field 6).
