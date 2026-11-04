# M6 Boxes: Storage and Viewing ⬜

Part of [Phase 6](../phase-6-pokemon-party.md). Rules: [context.md](context.md), D6, D7.

**Done when:** the PC opens BILL'S PC, and the box screen shows the player's saved boxes like FireRed: icons, names, wallpapers, moving between boxes, and the summary of a Pokémon in a box.

## Resume Here

Not started. First step: the migration (below); check every query in `mic-core/queries/pokemon.sql` filters the party.

## Tasks

- [ ] **Migration** `00014`: `trainer_pokemon.box` (0 = party, 1-14), `PRIMARY KEY (account_id, box, slot)`, slot limit 5 in the party and 29 in a box. A table for box names and wallpapers. Existing rows become party.
- [ ] **`mic-core`:** every party query filters `box = 0` (no regression: party, battles, New Game's reset). Boxes in `pokemon/store.go`, loaded when the screen opens. One function adding a caught Pokémon to party or box, for [Phase 7](../../phase-7-wild-battles-catching.md).
- [ ] **Contracts:** a `storage.v1` or `party.v1` box view (one box at a time, plus every box's count), and names and wallpapers.
- [ ] **Client, PC menu:** a new top entry in `players-pc.ts` (`TOP_ENTRIES`, line 65), then BILL'S menu: WITHDRAW POKéMON, DEPOSIT POKéMON, MOVE POKéMON, SEE YA!.
- [ ] **Client, box screen:** `firered/storage/`, split by concern as FireRed's files are: wallpaper and box change with scrolling, icons, cursor, side Pokémon pic and text, party panel, SUMMARY from a box. Read-only for now.
- [ ] **Assets:** `make graphics` covers what the screen needs.
- [ ] **Play it,** then the [regression check](context.md#playing-a-milestone).

## Play It

Add a few test Pokémon to boxes 1 and 2 (test content).

- The PC menu shows the new entry; all earlier entries work the same. SEE YA! returns.
- Cursor over every position; side panel shows the right Pokémon. Change box with L/R and the arrows; wallpaper slides.
- SUMMARY of a boxed Pokémon pages through. Party panel lists the team. Mobile layout too ([ui.md](../../../ui.md)).
- New Game empties boxes too. Party is untouched by all of it.

## What's Known

- `mic-core/migrations/00012_create_trainer_pokemon.sql`: `PRIMARY KEY (account_id, slot)`, `slot` check 0-5. Last migration is `00013`. Queries in `mic-core/queries/pokemon.sql`.
- FireRed: 14 boxes of 30 (`TOTAL_BOXES_COUNT`, `IN_BOX_COUNT`). `src/pokemon_storage_system*.c` (8742 lines): `_data` (storage rules), `_graphics` (screen), `_menu` (menus), `_misc`, `_tasks` (flow). Read by section, by task at hand.
- `firered/players-pc.ts`: `TOP_ENTRIES`, `TopEntry`, `say`, `returnToTop`. `party-menu.ts` and `summary.ts` are the shapes to copy.

## Files

`mic-core/migrations/`, `mic-core/queries/pokemon.sql`, `mic-core/internal/pokemon/store.go`, `lib-contracts/proto/pokeuniverse/`, `spa-pokeuniverse/src/game/firered/players-pc.ts`, `firered/storage/` (new), `firered/manifest.ts`.
