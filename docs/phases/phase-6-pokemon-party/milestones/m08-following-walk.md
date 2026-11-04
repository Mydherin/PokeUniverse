# M8 Following Pokémon: Art and Walking ⬜

Part of [Phase 6](../phase-6-pokemon-party.md). Rules: [context.md](context.md), D8, D9.

**Done when:** the lead Pokémon, in its HGSS-style sprite, walks one tile behind the player in the room, with the position decided by `mic-core`.

## Resume Here

Not started. First step: the art in `make pokemon`, and a check of the sheet's frame order.

## Tasks

- [ ] **Build:** `infra/pokemon/build.mjs` copies each species' (1-493) `overworld.png` and palettes (`overworld_normal.pal`, `overworld_shiny.pal`) to the gitignored output; `make pokemon` keeps working. Forms and female variants stay out for now. AGENTS.md's exception list says so.
- [ ] **Contracts:** `Avatar` gets the follower (species, shiny, or none), and its tile and facing for the snapshot, `Warped` and `Correction`.
- [ ] **`mic-core`:** the first Pokémon in the party with HP > 0 follows; its tile is the one the player left. Sent on entering the world, and reset next to the player on a warp.
- [ ] **Client:** `firered/follower-sprite.ts`, on `player-sprite.ts`'s shape, with sprite sizes from the sheet (some are 32x32, some 64x64); drawn behind or in front of the player by its row; loaded by species on the map (not every species up front); predicted with the player's step.
- [ ] **Play it,** then the [regression check](context.md#playing-a-milestone).

## Play It

- Walk in the room in all four directions, turn in place, run if allowed: the follower stays one tile behind, same speed, right facing, no flicker.
- Walk into a wall, walk back through the follower's tile.
- A small and a big species (Bulbasaur, Steelix) line up on the tile; a shiny uses its palette.
- Fast tapping and a slow network: no drift after a `Correction`.

## What's Known

- Art: `references/pokeemerald-expansion/graphics/pokemon/<name>/overworld.png`, 1324 files with forms. Bulbasaur and Venusaur are 192x32 (4-bit), Steelix 384x64 (8-bit: **palette needs handling**, may need reducing). Tables: `src/data/object_events/object_event_pic_tables_followers.h` (`overworld_ascending_frames(pic, 4, 4)`: frames ascending, 4 by 4 tiles for Bulbasaur), and `object_event_graphics_info_followers.h`. Frame order to check there.
- `make pokemon` at `Makefile:97`; `infra/pokemon/build.mjs`, `sources.mjs`.
- Client: `firered/overworld.ts` (937 lines), `player-sprite.ts`, `npc-sprite.ts`, `world/avatar.ts`, `world/rules.ts`. Server: `world/player.go`, `world/warp.go`, `world/zone.go`. Contracts in `world/v1`: `Avatar` (`Move`, `Warped`, `Correction`, `WorldSnapshot`).
- Sprite palettes are limited to 16 slots with `loadSpritePalette(tag, colors)`: one more for the follower; Phase 8 will need more, with many players on screen.

## Files

`infra/pokemon/build.mjs`, `Makefile`, `lib-contracts/proto/pokeuniverse/world/v1/`, `mic-core/internal/world/`, `spa-pokeuniverse/src/game/firered/overworld.ts`, `firered/follower-sprite.ts` (new), `firered/manifest.ts`, `AGENTS.md`.
