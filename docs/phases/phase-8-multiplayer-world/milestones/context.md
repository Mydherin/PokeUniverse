# Multiplayer World: Shared Context

Part of [Phase 8](../phase-8-multiplayer-world.md). Open only the section a step needs. Commands and the client engine: [Phase 5's context](../../phase-5-battle-system/milestones/context.md); how to play and back up a save: [Phase 6's context](../../phase-6-pokemon-party/milestones/context.md#playing-a-milestone). Open them by section, don't repeat them here.

## Playing a Milestone

Same steps as Phase 6 and 7 (build, play the milestone's **Play It**, regression check, fix, cut the file down). Differences:

- **Other players are bots** (M1 on): `node infra/bots/bots.ts --count N --map <id>` beside the real player in the browser pane. A second real player, if needed, is a second browser tab after the bots exist: one Google account can only play one copy (take-over), so the second tab logs in a bot by token (M1's `?bot=` dev login, D16).
- **Regression check** adds, from M2 on: the real player walks both maps and the stairs with 5 bots around; a wild battle in the test grass and the room trainer still work; no `Correction` while walking through bots (D6).
- Bots' accounts are dev data: `make bots-clean` (M1) removes them; nothing they leave is committed.

## Decisions

| # | Decision |
|---|---|
| D1 | **A zone is a map**, as tech-stack.md says: everyone on a map gets every other player's events there, nothing from other maps. No viewport culling now; M7 adds it only if the measured budget (D18) needs it. |
| D2 | **Each replica runs its own zone per map** for its own connections (zone.go as now) and the zones of one map share their events over NATS `world.zone.<map>`: each tick a zone publishes its local players' `ZoneEvents` (only when non-empty), and subscribes only while it has players there. *Why:* `mic-core` stays stateless (no zone ownership, no routing, any replica takes any player); NATS keeps one publisher's order, and a player's events always come from the replica that owns its session. |
| D3 | **Snapshot of the others from Redis:** `zone:<map>` hash, trainer → encoded `OtherPlayer`, written in the zone's tick pipeline with the positions (saved before shown) and removed on leave, warp and disconnect, all in the same Lua session check as `live`. A player entering reads it once; deltas follow. Local players also come from memory, never twice. |
| D4 | **No map connections yet:** players across a map border (FireRed's connected maps drawn together) come with the maps that have them (Phase 12). Warps already change zone. |
| D5 | **Payloads (minimal, numeric):** `OtherPlayer{id, name, gender, x, y, facing, follower, in_battle}`; `id` is the trainer's account ID; `name` is sent once on join (chat needs it, D13), never per event. Deltas: `PlayerJoined{player}`, `PlayerLeft{id}`, `PlayerMoved{id, x, y, facing, run}` (the tile reached; the client animates from the last one), `PlayerTurned{id, facing}`, `PlayerFollower{id, follower}`, `PlayerBattle{id, in_battle}`, `ChatMessage{id, text}` (M5). |
| D6 | **Players don't block each other**, nor their followers: steps through another player are valid and predicted as now. *Why (MMO):* blocking doors, stairs and narrow paths is griefing, and a step can't be predicted against a player on another replica. FireRed's link players do collide (`LinkPlayerDetectCollision`, Cable Club only). Drawn by feet as any object event, so the one lower on screen is in front. |
| D7 | **One `ZoneEvents` per zone tick, encoded once:** the zone marshals the tick's events (local and those received over NATS since the last tick) once and every local player gets the same bytes, wrapped in its own envelope (the envelope's `seq` field plus the pre-encoded field 22). A client ignores events with its own `id`. The player's own answers (`Correction`, `Script`, …) stay as they are. |
| D8 | **Others' steps on the client:** a queue per player; each step plays FireRed's walk (16 frames) or run (8 frames) from the tile it stands on. With more than 2 queued it plays them at running speed; a step that isn't to a neighboring tile (a correction, a long gap) places them there. Turns change the frame at once (`PlayerTurned`). No prediction, no interpolation beyond the step. |
| D9 | **A player in a battle, a script or a menu** is drawn standing where they are, facing their way, with nothing over them: FireRed has no such sign. `in_battle` is kept in `OtherPlayer` for Phase 9's social menu (busy). |
| D10 | **Others' followers follow the same rules as one's own** ([Phase 6](../../phase-6-pokemon-party/phase-6-pokemon-party.md), `world/follower.go`): the server sends the follower (species, shiny, tile, facing, hidden) on join and `PlayerFollower` when the party's lead changes; the client steps it onto the tile its trainer left with the same `FollowerModel`. Hidden on join and after a warp until the trainer's next step (`FollowMon_HideUntilStep`). Closes O7. |
| D11 | **Drawn as FireRed's object events:** the trainer's walking and running sheets by gender (as the own player's: Red's or Leaf's), the tall-grass effect over their feet, the same elevation rule as the own player ([Movement](../../../tech-stack.md#movement)). No names over them (FireRed shows none). |
| D12 | **Appear and leave at once:** FireRed's link players have no spawn animation (`SpawnLinkPlayerObjectEvent`). A player warping out vanishes from the old map; on the new one they appear on the warp's tile, follower hidden. |
| D13 | **Chat goes to the map (zone)** the sender is on, through the zone like any event. Not saved, not replayed on enter or reconnect (FireRed's Union Room chat keeps nothing). A line shows `NAME: text`. Text: FireRed's charset only (the font has no other glyphs; the same check as the naming screen's, with the charmap's printable characters), trimmed, 1-64 characters (ours: Union Room chat's 15 is too short for a typed message). *Provisional until Q1.* |
| D14 | **Moderation now:** length, charset and rate (D17) only; every message is logged by `mic-core` (`slog`, trainer ID, map) for later moderation. A word filter, muting and reporting wait for Q2. |
| D15 | **Chat keys:** `T` or `/` opens the input; `Enter` sends, `Esc` closes. `Enter` stays START, as the GBA buttons table says. Touch: a chat button in the top bar. *Provisional until Q4* (ui.md also says "`Enter` to chat"). |
| D16 | **Bots are dev only:** `POST /api/dev/bots` exists only when `BOTS_SECRET` is set (empty in `.env.example`, never set in production), checked from the `X-Bots-Secret` header; it creates or reuses accounts `bot-<n>` (no Google subject, roles `user` and `bot`), each with a trainer `BOT<n>` (FireRed charset, ≤7) on the given map at a walkable tile, and returns their access tokens. The SPA accepts `/play?bot=<token>` only in dev builds: `vite` dev, or an image built with `BOTS_SECRET` set (`VITE_BOT_LOGIN`). Bots are tokens only: `infra/bots` needs no install (Node's own `WebSocket`). |
| D17 | **Rate limits:** intents stay at 20/s, burst 40 (realtime.go). Chat: 1 message per 2 s, burst 4, per connection; the client applies the same rule to its input (FireRed has no refusal message, so nothing is said); messages over it are dropped. Tuned in M7. |
| D18 | **Load budget (target, measured in M7):** 200 players on one map; zone tick ≤ 10 ms p99; downstream ≤ 8 KB/s per client with 50 others moving; the client keeps 60 fps with 50 others drawn on a desktop and 30 on a phone. M7 writes what was measured into tech-stack.md. |

## Questions for the User

The plan uses the provisional answer; a different answer changes only M5 and M6.

| # | Question | Provisional |
|---|---|---|
| Q1 | Chat scope: only the players on the same map, or also a global or region channel? | Same map only (D13) |
| Q2 | Moderation at launch: word filter, mute a player, report? | None now; logs kept (D14); decided by Phase 13 |
| Q3 | Show a player's name over their sprite (FireRed shows none)? | No names (D11) |
| Q4 | Chat key: ui.md says `Enter` to chat, but `Enter` is START. | `T` or `/` opens chat (D15); ui.md fixed in M6 |

## FireRed and HeartGold References

| What | Where |
|---|---|
| Other players as object events: spawn, sprite by gender, position, facing, collision | `pokefirered/src/overworld.c`: `SpawnLinkPlayerObjectEvent`, `CreateLinkPlayerSprite`, `GetLinkPlayerCoords`, `LinkPlayerDetectCollision`, `MovementEventModeCB_*` |
| Trainer sheets (Red, Leaf; walk, run) | `pokefirered/src/data/object_events/object_event_graphics_info.h` (`OBJ_EVENT_GFX_RED_NORMAL`, `_RUN`, `GREEN_*`); the own player's sheets already built (Phase 4) |
| Draw order by feet, elevation priority | `pokefirered/src/event_object_movement.c`: `SetObjectSubpriorityByElevation`, `UpdateObjectEventSpriteVisibility` |
| Tall grass over any character | `pokefirered/src/field_effect_helpers.c`: `FldEff_TallGrass` (already used for the player and follower: `firered/tall-grass.ts`) |
| Chat window look: panel, message colors per player, strings | `pokefirered/src/union_room_chat.c`, `union_room_chat_display.c`, `graphics/union_room_chat/` (`messages.pal`, `panel.png`), `gText_UnionRoomChat*` in `src/strings.c` |
| A follower of any map object | `pokeheartgold/src/map_object_follow.c`, `src/follow_mon.c` (behavior only; already mirrored by `world/follower.go`) |

## Already Built (don't rebuild)

- **Zones** (`mic-core/internal/world/zone.go`): one goroutine per map per replica, `do`/`call` inbox, 50 ms tick only while it has players, saves dirty players to Redis in one pipeline then flushes each player's `p.out` (saved before shown); `syncFollower` on tick.
- **Realtime** (`internal/realtime/realtime.go`): per-player `rate.NewLimiter(20, 40)`, read limit `maxMessage`, envelopes in `realtime/v1/realtime.proto` (`ClientMessage` 2-37, `ServerMessage` 2-21).
- **Contracts** (`world/v1/world.proto`): `WorldSnapshot` (own player only), `Avatar{x, y, facing, gender, follower}`, `Follower{species, shiny, x, y, facing, hidden}`, `FollowerChanged`, `Warped{…, follower}`.
- **Follower:** server `world/follower.go` (memory only: `placeFollower`, `followStep`, `syncFollower`); client `world/follower.ts` (`FollowerModel`), `firered/follower-sprite.ts`, used in `firered/overworld.ts` (`place`, `followerChanged`).
- **Renderer:** `world/view.ts` `WorldView.addCharacter(sheet)` → `CharacterView` (position, frame, over tiles, visible).
- **Live state** (`internal/live`): `player:<id>:pos`, `player:<id>:session` (15 s TTL, renewed every 5 s), Lua scripts checking the session. **Take-over across replicas:** `internal/sessionbus`, NATS `world.sessions.taken`.
- **Infra:** nginx re-resolves `mic-core` (`spa-pokeuniverse/nginx/default.conf`), so Compose replicas are reached; NATS users in `infra/nats/nats.conf` (`mic-core` has no subject limits; `mic-battles` only `battles.>`). Own player's overworld sheets in `firered/manifest.ts` (`owRed`, …).
- **Maps:** `lib-maps/maps/pallet_town_players_house_1f.yaml`, `_2f.yaml`.
