# M3 Drawing Other Players ✅

Part of [Phase 8](../phase-8-multiplayer-world.md). **Needs:** M2. Rules: [context.md](context.md) D6, D8, D9, D10, D11, D12; [references](context.md#firered-and-heartgold-references).

**Done when:** the real player sees every other player on their map walk, run and turn with FireRed's frames and speed, with their following Pokémon, under tall grass and by elevation like their own; they appear and vanish on join, leave and warp, and are drawn again from a fresh snapshot after a reconnect. Closes O7.

## Resume Here

**Done 2026-11-10** (code, `tsc` green; Play It not run in the building session, no manual test asked). Next: [M4 Zones across replicas](m04-zones-across-replicas.md).

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

- Nothing new unless Play It finds a bug.

## Play It

1. 5 bots on 1F with the real player: they walk and run at FireRed's speed, turn, step with their followers; the one lower on screen is drawn in front; the real player walks through them with no `Correction`.
2. A bot goes upstairs: it vanishes from 1F and appears on 2F (the real player follows) with its follower hidden until its next step.
3. Bots in the test grass show the grass over their feet and their followers' (start one bot on it with `--map` tile or walk the real player's second tab there).
4. A second real tab (`?bot=`) swaps its lead: the first tab sees the new follower; it battles: drawn standing, nothing over it.
5. Restart `mic-core`: everyone disappears with the disconnect and is drawn again from the snapshot, none twice. Kill a bot (Ctrl-C): it vanishes.
6. Phone size in the pane (mobile preset): frame rate stays smooth with 10 bots.
7. Regression check.

## Gotchas

- The own player's predicted steps must not wait for others: their update is separate from `Avatar`.
- A queue for a player who left must be dropped with its sprites (no stray follower).
