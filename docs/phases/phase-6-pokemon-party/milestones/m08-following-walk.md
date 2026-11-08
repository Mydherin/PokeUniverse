# M8 Following Pokémon: Art and Walking ✅

Part of [Phase 6](../phase-6-pokemon-party.md). Rules: [context.md](context.md), D8, D9.

**Done when:** the lead Pokémon, in its HGSS-style sprite, walks one tile behind the player in the room, with the position decided by `mic-core`.

**Main reference: HeartGold.** The following Pokémon is HeartGold and SoulSilver's own feature, so it must behave as the original does: before writing or changing any part of it (who follows, steps, facing, speed, warps, hiding, lead changes, animation), read how `references/pokeheartgold/` does it (`src/follow_mon.c`, `src/map_object_follow.c`, `src/field/field_follow_mon.c`, `include/field/field_follow_mon.h`) and match it. Behavior only: its code is never copied and its art never used (the sheets are pokeemerald-expansion's, drawn the FireRed way). A difference from HeartGold needs a reason (the MMO, Gen 3 art, the user) written in this file; anything else is a bug. What's been read is under What's Known: don't read it twice.

## Resume Here

Done 2026-11-08 (session 3): Play It and the regression check passed, test data restored. Next: [M9](m09-following-check.md).

## Tasks

- [x] **Build:** `make pokemon` writes `<nnn>/overworld.png`, `overworld.pal`, `overworld-shiny.pal` for 1-493 (`infra/pokemon/sources.mjs` reads each species' first block's `OVERWORLD(sPicTable_X, ...)` → `gObjectEventPic_X` in `src/data/graphics/pokemon.h`, frame side from `-mwidth`; Azurill, hidden by the expansion's `P_GEN_3_CROSS_EVOS`, falls back to its folder name). Forms and female variants left out. AGENTS.md updated. Checked: 493 sheets, all pixel indices < 16 (the 8-bit PNGs load with `gba/assets.ts`'s png + pal like the others). Sizes: 192x32 (6 frames, 460 species), **256x32 (8 frames: asymmetric species, own east frames 6/7 = face/step, `sAnimTable_Following_Asym`; 21 species e.g. 064, 083, 098)**, 384x64 (6 frames of 64x64, 12 species). Frame count = width / height.
- [x] **Contracts:** `world/v1` `Follower { species, shiny, x, y, facing, hidden }` on `Avatar` (5), `Warped` (6), `Correction` (5); `FollowerChanged { follower }` (realtime server message 21) for party changes (HGSS re-picks on party change, `FollowMon_ChangeMon`, keeping the tile). Unset = no follower. `make contracts` run.
- [x] **`mic-core`:** `world/follower.go` (new): `Player.follower` (memory only, never saved); `placeFollower` on Join (`world.go`, inside `z.call`) and `arrive` (`warp.go`): player's tile and facing, `hidden`; `followStep(p.pos)` in `zone.move` before the accepted step (to the tile left, facing towards it, shows); `syncFollower` in the tick before sending (`zone.go`): a lead change from any party change (battle, box, swap, evolution) queues `FollowerChanged`, keeping the tile. `pokemon.Party.Lead()` (first HP > 0, else first; no eggs yet). `Correction` carries the follower. Built and vetted in docker (`golang:1.27-alpine`, `go build ./... && go vet`).
- [x] **Client:** `world/follower.ts` (new, art-agnostic `FollowerModel`: `set(Follower)` from snapshot / `Correction` / `Warped` (via `place`) / `FollowerChanged`; `follow(x, y, run)` from the avatar link's `move`, i.e. every predicted step; `update()` per frame; `pixelX/Y` like `Avatar`). `firered/follower-sprite.ts` (new): loads `Assets.followerArt(species)` (new in `manifest.ts`, cached per species, fetched only when shown), sheet by `player-sprite.ts`'s new `sheetOf` (any frame size), feet on the cell (`x + 8 - size/2`, `y + 16 - size`), frames per What's Known, keeps stepping in place standing (half speed; running double). `world/scene.ts`: y-sort by the frame's bottom (feet) so a 64×64 sorts right against the 16×32 player; `CharacterView.setVisible` (hidden until the first step). Over/under tiles: the player's `overTiles` (fine in the room; outdoors may want its own elevation). `avatar.ts` exports `WALK_FRAMES`/`RUN_FRAMES`. `connection.ts` routes `followerChanged`. `tsc --noEmit` clean (`spa-pokeuniverse/node_modules/.bin/tsc`).
- **Differences / guesses to check while playing:** the idle stepping-in-place and its speed are from how HGSS plays (its animation sequence is a DS resource, not readable in the decomp); no ball-release effect on warps yet (D9).
- [x] **Play it,** then the [regression check](context.md#playing-a-milestone).

## Play It

Played 2026-11-08 (session 1, account 2 on 1F, lead Snorlax, a 64×64 sheet), after `make breaking` (clean) and `docker compose up -d --build mic-core spa-pokeuniverse`:

- ✅ Hidden on entering the world; appears on the first step, on the tile left. All four directions: one tile behind, same speed, facing the way it moved, sorted right by row (behind when north, in front when south). Walking back through its tile swaps them. Turning in place and bumping the north wall leave it put; east uses the west frames mirrored.
- ✅ Session 2: lead change by SWITCH in the POKéMON menu, hidden and shown: `FollowerChanged` (realtime 21) arrives, the new species takes the same tile and visibility. Shiny Charizard (192x32, black palette) and Lucario (32x32 frames). Fast stepping (direction changes mid-walk, 6 moves): no corrections, one tile behind, facing the way it moved (moving onto a tile beside the player faces along that move, as HGSS). A reload: same tile, hidden, appears on the first step on the tile left with the placed facing. Stairs 1F → 2F: hidden on arrival, appears on the first step. Run with B: not allowed in either room (FireRed's `allow_running: false`), so unplayed; the run speed path is only reached outdoors (Phase 7+).
- Not played: an 8-frame asymmetric sheet (own east frames 6/7, e.g. 083); a 64x64 one was (Snorlax).
- Regression (session 2): SWITCH ✅, GIVE ✅, TAKE ✅. **Bug fixed (from M7):** SUMMARY from the party menu before opening BILL'S PC crashed (`reading 'tiles'`): M7's markings in the summary use `markingCombo`, which was in `STORAGE_GRAPHICS` (loaded only by the box screen); moved to `PARTY_GRAPHICS` in `firered/manifest.ts` (the box screen loads the party set too).
- Regression (session 2, cont.): SUMMARY + move SWITCH ✅ (saved), BAG USE (Potion on a hurt Lucario; Antidote: "It won't have any effect.") ✅, TOSS ✅, PC WITHDRAW/DEPOSIT item ✅. Box DEPOSIT of the lead → follower becomes Garchomp (`FollowerChanged` from a box change) ✅; WITHDRAW back ✅.
- Regression (session 3): trainer battle at (9,4) (six Lv 50s): Potion in battle ✅, `docker compose restart mic-core` mid-battle resumes ✅, lead Garchomp fainted, Revive in battle, won, exp shown (1146) ✅; "Player defeated COOLTRAINER…" is FireRed's own text (`battle_message.c:373`). Back on the field the follower was hidden until the first step: the restart made the client rejoin, and entering the world places it hidden (HGSS `FollowMon_RecreateForMap`), so not a bug. Same lead after (revived Garchomp, first with HP) ✅. Walk, stairs 2F → 1F (hidden, appears on the first step) ✅, SAVE dialog on 1F ✅, reload: same tile and facing, hidden, appears on the tile left on the first step ✅.
- Test data restored from the session 2 backup (account 2 only, temp tables); a new dump diffed equal to it, sorted.
- Seen, not M8 (check in M9 or ask): Lucario came back from the box at full HP (FireRed doesn't heal in boxes; Gen 4 does on deposit? decide); "an item that isn't for now" not tried yet.

## What's Known

- Art: `references/pokeemerald-expansion/graphics/pokemon/<name>/overworld.png`, 1324 files with forms. Bulbasaur and Venusaur are 192x32 (4-bit), Steelix 384x64 (8-bit: **palette needs handling**, may need reducing). Tables: `src/data/object_events/object_event_pic_tables_followers.h` (`overworld_ascending_frames(pic, 4, 4)`: frames ascending, 4 by 4 tiles for Bulbasaur), and `object_event_graphics_info_followers.h`. Frame order to check there.
- `make pokemon` at `Makefile:97`; `infra/pokemon/build.mjs`, `sources.mjs`.
- Client: `firered/overworld.ts` (937 lines), `player-sprite.ts`, `npc-sprite.ts`, `world/avatar.ts`, `world/rules.ts`. Server: `world/player.go`, `world/warp.go`, `world/zone.go`. Contracts in `world/v1`: `Avatar` (`Move`, `Warped`, `Correction`, `WorldSnapshot`).
- Sprite palettes are limited to 16 slots with `loadSpritePalette(tag, colors)`: one more for the follower; Phase 8 will need more, with many players on screen.

**How HGSS does it** (`references/pokeheartgold/`, read in full for M8; behavior only, art stays the expansion's):

- **Who follows** (`src/follow_mon.c:1508` `FollowMon_InitMapObject`, `:1563` `FollowMon_ChangeMon`): the first alive non-egg Pokémon (`GetFirstAliveMonInParty`); if all have fainted, the first non-egg. Re-chosen when the party changes. Shiny picks its palette.
- **Step** (`src/map_object_follow.c:344` `FollowPlayerMovement_StartFollowMonStep`): on each player step (`FollowMon_QueuePlayerStep`, `src/field/field_follow_mon.c:410`), it moves to the **player's previous tile**, facing the direction towards it (`GetDirectionTowards`), with **the player's movement** (walk or run, `GetMovementForDirection(direction, playerMovement)`). Already on that tile: it stays. Turning in place or bumping a wall moves nothing (the player's tile didn't change).
- **Warp / entering a map** (`field/field_follow_mon.c:422` `FollowMon_RecreateForMap`, `field_warp_tasks.c:288`): created **on the player's own tile with the player's facing**, hidden (`FollowMon_HideUntilStep`) until the player's first step, when it appears and steps onto the tile the player left (some warps add a ball-release effect, `FollowMon_SetReleaseBallPending`: later, D9). Our server: follower tile = player tile, `hidden` until the first move.
- `src/follow_mon.c:1804` `FollowMon_GetPermissionBySpeciesAndMap`: maps allow, forbid or limit by size (big species stay in the ball indoors). Not in M8.
- Later, if asked (D9): recall into the ball (`FollowMon_StartRecall`), mood (`FollowMonMood_*`), hops over ledges (`FollowMon_SetPendingHop`), cycling/surfing (it hides).

**Expansion sheet frame order** (`object_event_anims.h:1246` `sAnimTable_Following`, `overworld_ascending_frames`): frames left to right, each `w`x`h` tiles (`object_event_pic_tables_followers.h`: 4x4 = 32x32 for most, 8x8 = 64x64 for big ones; sheet height = frame size). **6 frames** (192 = 6x32): south 0 (face) / 1 (step), north 2/3, west 4/5, east = west mirrored (`sAnimTable_Following`, the `2F` anims). Walk anim per step: face, step, step, face, 6 frames each (`sAnim_GoSouth2F`); run uses the same at a faster rate.

## Files

`infra/pokemon/build.mjs`, `Makefile`, `lib-contracts/proto/pokeuniverse/world/v1/`, `mic-core/internal/world/`, `spa-pokeuniverse/src/game/firered/overworld.ts`, `firered/follower-sprite.ts` (new), `firered/manifest.ts`, `AGENTS.md`.
