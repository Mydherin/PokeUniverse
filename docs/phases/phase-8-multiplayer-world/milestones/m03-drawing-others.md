# M3 Drawing Other Players ✅

Part of [Phase 8](../phase-8-multiplayer-world.md). **Needs:** M2. Rules: [context.md](context.md) D6, D8, D9, D10, D11, D12; [references](context.md#firered-and-heartgold-references).

**Done when:** the real player sees every other player on their map walk, run and turn with FireRed's frames and speed, with their following Pokémon, under tall grass and by elevation like their own; they appear and vanish on join, leave and warp, and are drawn again from a fresh snapshot after a reconnect. Closes O7.

## Resume Here

**Done 2026-11-11: every Manual Test case passed.** No bug found, no code changed by the test; nothing TEMP left. Next: [M4's Manual Test](m04-zones-across-replicas.md#resume-here).

- **How it was played:** the browser pane runs at ~1 fps when the session isn't on screen, so cases ran in headless Chromium (Playwright from the npx cache `~/.npm/_npx/e41f203b7505f1fb`). Driver outside the repo, in the orchestrator's session notes folder `m3-headless/`: `node pw.mjs <botN> <count> ./case.mjs` logs in bot N by token; `h.second(m)` opens a second tab as bot m; `c10.mjs` is standalone (touch-emulated mobile contexts). The case scripts need a temporary per-frame log in `overworld.ts` `runOthers()` (removed; re-add it to reuse them): `window.__self = {x, y}` own pixel, `window.__playit` gets `[now, [[id, pixelX, pixelY, facing, action.kind, action.frames, follower.hidden, follower.pixelX, follower.pixelY, overTiles]], [ownX, ownY]]`.
- **Map facts:** 1F stairs: Right on (10,2); 2F stairs: Left on (10,2). Free routes on 1F: row 8 x 2-11, column 2 y 2-8, row 2 x 2-10. Test grass (10-12, 5-6). 2F test trainer at (9,4): stand on (9,5), hold Up ~60 ms (a Playwright `press` is too short to turn), then A. Battle menu: wait for FIGHT/BAG/POKéMON/RUN, then Right, Down, A. Logging a tab in again ends its battle.
- **Facts:** running isn't reachable (`hasRunningShoes = false`, houses forbid it), so #8 (catch-up) was the run-speed check. Stopping `bots.ts` with Ctrl-C exits with code 1 (harmless).

- **Files:** new `spa-pokeuniverse/src/game/world/others.ts`, `firered/other-player-sprite.ts`; changed `firered/overworld.ts`, `firered/player-sprite.ts`, `firered/tall-grass.ts`, `src/realtime/connection.ts` (`zoneEvents` in `WorldEvents`, routed from `ServerMessage.zoneEvents`).
- **Model:** `OtherPlayerModel` queues `move`/`turn`/`follower` in arrival order (a follower change waits for the steps before it, so it isn't placed ahead of its trainer); `battle` sets `inBattle` at once. Catch-up: more than 2 moves queued → run frames (8), shown with the walk sheet unless the step itself ran. Elevation tracked per step with `elevationAfter`, `overTiles` as `Avatar`'s; its follower draws by its trainer's `overTiles`. `joined` is an upsert (M2 gotcha). Own id: `getSession()?.account.id` (bot tabs too), skipped in snapshots and events.
- **View:** `OtherPlayerSprite` = `PlayerSprite` (now takes any `Walking`: `pixelX/Y`, `facing`, `action`, `overTiles`) + `FollowerSprite`. Player sheets are built once per gender (cache in `player-sprite.ts`). `frameOf` walk: foot for the first half of `frames` (same 8 of 16 for the own player). `TallGrass` walkers are now any string (`other:<id>`, `other-follower:<id>`), kept in a `Map`.
- **Overworld:** `place(…, others)` builds `Others` (constructor snapshot, `travel`'s `Warped.others`); `resume` (reconnect snapshot) → `fromSnapshot`; `destroySprites` clears them. `runOthers()` runs each frame right after the warp checks, before menus/scripts/`away`, separate from `Avatar` (gotcha 1); offline it clears everyone (the reconnect snapshot draws them again). Zone events that come after a `Warped` (`warp.arrival` set) are buffered in `nextZone` and applied once the next map is placed; dropped on `cancelWarp` and `resume`.

## Tasks

### Model (`spa-pokeuniverse/src/game/world/`, the same for every art style)

- `others.ts`: `OtherPlayerModel` per id: tile, facing, gender, `in_battle`, a step queue (D8: one step at a time at walk 16 / run 8 frames from where it stands; more than 2 queued → run speed; not a neighbor tile → placed) and its `FollowerModel` (`follower.ts`, reused: each step it moves onto the tile its trainer left; hidden until the first step after join or warp, D10).
- `Others` collection: `fromSnapshot(others)` replaces everyone; `apply(ZoneEvents)` skips own id; `update(frame)` advances every queue. Frame-based like `avatar.ts` (its walking frames and step timing are the reference, reuse its constants).

### FireRed view (`spa-pokeuniverse/src/game/firered/`)

- `other-player-sprite.ts`: a `CharacterView` per player from the same walk and run sheets the own player uses (by gender, `manifest.ts`), the same frame table as the own player's (`overworld.ts`'s walking frames), feet-ordered (D6), over tiles by the elevation rule (`setOverTiles`); its follower with `FollowerSprite` (`follower-sprite.ts`).
- Tall grass for them and their followers: `tall-grass.ts` keyed by `other:<id>` and `other-follower:<id>`, as the own player's `enter`/`forget`.
- `overworld.ts`: create `Others` in `place` (snapshot and `Warped`, from their `others`), route `zone_events` (`connection.ts` handler like `followerChanged`), update and draw each frame, destroy all on map change and on disconnect (the reconnect snapshot draws them again).
- Nothing over a player in a battle or menu (D9); no names (D11).

### Server

- Nothing new unless the Manual Test finds a bug.

## Manual Test

| # | Case | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | Others drawn | 5 bots on 1F with the real tab there | Each drawn with its gender's sheet, walking and running at FireRed's speed and frames, turning in place | ✅ 2026-11-11: Red/Leaf by gender, walk 16 frames at 1 px/frame, turns in place. Running isn't reachable yet (`hasRunningShoes = false`, houses forbid it): run speed checked by catch-up (#8) |
| 2 | Followers | Same | Each bot's follower steps onto the tile its trainer left, as the own follower does | ✅ 2026-11-11: every step ends with the follower on the trainer's left tile, one tile behind when standing |
| 3 | Draw order and walk-through | Walk the real player around and through bots | The one lower on screen is in front; no `Correction`, own steps never wait | ✅ 2026-11-11: lower sprite in front (followers too); own walk 1 px every frame through bots, no correction |
| 4 | Warp out and in | Watch a bot take the stairs; follow it | It vanishes on 1F at once and appears on 2F on the warp tile, follower hidden until its next step | ✅ 2026-11-11: gone from 1F in one frame (its last step's final pixels cut, fine); on 2F at (10,2), follower shown on (10,2) at its first step; own warp draws 2F's players at once |
| 5 | Tall grass | A bot or a second `?bot=` tab in the test grass | Grass over its feet and its follower's, as the own player's | ✅ 2026-11-11: second tab in the 1F test grass: blades over its feet and its follower's, the same in that tab's own view (a blade stays until the walker left both cells, FireRed's rule) |
| 6 | Elevation | A bot on and by the stairs | Drawn over/under tiles like the own player | ✅ 2026-11-11: a bot on and beside the 1F stairs looks pixel-identical in the other tab and in its own view; 2F stairs arrival drawn the same |
| 7 | Lead swap and battle (second tab) | Second `?bot=` tab swaps its lead, then battles | First tab: new follower after its queued steps; the battler stands still with nothing over it, walks after | ✅ 2026-11-11: Pikachu follows after the swap; in its battle it stands in the grass with its follower, nothing over it, no action; after RUN its 3 steps play in the first tab with the follower |
| 8 | Catch-up | Throttle the tab briefly (DevTools) with bots walking | Queued steps play at run speed, then normal; no teleport except a non-neighbor step | ✅ 2026-11-11: headless, main thread blocked 2 s with bots walking: the backlog plays at 8 frames a step (6 and 12 steps, walk sheet), then 16 again; at most 2 px a frame, no jump |
| 9 | Reconnect and leave | `docker compose restart mic-core`; then Ctrl-C a bot | All vanish and are redrawn from the snapshot, none twice; the killed bot and its follower vanish (no stray follower) | ✅ 2026-11-11: after the restart the list is replaced by the reconnect snapshot, the others join as their bots reconnect, never an id twice; stopping the bot script empties the list within a second, no sprite or follower left |
| 10 | Mobile, many players | Mobile preset portrait and landscape, 10 bots | Smooth frame rate, touch controls work | ✅ 2026-11-11: headless touch emulation (390x844 and 844x390, coarse pointer), 10 bots: 60 fps (p95 18.5 ms) also at 4x CPU throttle; D-pad holds walk, START opens the menu, B closes it, A advances |
| 11 | Regression | [context.md](context.md#playing-a-milestone) regression check | Nothing broken | ✅ 2026-11-11: with 10 bots, walked 1F → stairs → 2F → stairs → 1F: never more than 1 px a frame in 3,675 frames (no `Correction`); 2F's test trainer asks its question and battles; a wild battle in the test grass |

## Gotchas

- The own player's predicted steps must not wait for others: their update is separate from `Avatar`.
- A queue for a player who left must be dropped with its sprites (no stray follower).
