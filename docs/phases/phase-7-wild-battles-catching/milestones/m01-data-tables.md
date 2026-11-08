# M1 Data: Tables, Wild Items, Test Grass ⬜

Part of [Phase 7](../phase-7-wild-battles-catching.md). **Needs:** nothing. Rules: [context.md](context.md) D2, D4, D5, D7.

**Done when:** a map's text file holds its encounter tables, `tool-maps` compiles them into `ServerMap`, every species has its wild held items, Iron Ball is a held item, and 1F of the player's house has a test grass patch with a test table that `mic-core` loads.

## Resume Here

**Not started.** First step: read the `encounter` lines of `lib-contracts` `map.proto` and the `tool-maps` compile step for `ServerMap` (grep `encounter` in `tool-maps/`), then write the contract.

## Tasks

### Contracts (`lib-contracts`)

- [ ] `map/v1` `ServerMap.wild` (`WildEncounters`): `land` (12 slots), `water` (5), `rock_smash` (5), `fishing` (10: old 0-1, good 2-4, super 5-9), each a `WildTable { rate, repeated WildSlot }`, `WildSlot { species, min_level, max_level }`. Slot chances are FireRed's constants, in code, not data: land 20/20/10/10/10/10/5/5/4/4/1/1; water and Rock Smash 60/30/5/4/1; old rod 70/30; good rod 60/20/20; super rod 40/40/15/4/1 (check them against `src/data/wild_encounters.json`'s `fields`).
- [ ] `species/v1` `SpeciesInfo`: `item_common` (17), `item_rare` (18), item enums. FireRed's 50% / 5% chances (`GenerateWildMon` → `CreateMonWithNature`, check where the held item is set: grep `itemCommon` in `src/`).
- [ ] **Iron Ball fix:** `ITEM_IRON_BALL` (440) to `POCKET_ITEMS`, no `battle_use`, holdable. Then scan `infra/battle/items.mjs`'s pocket rule for any other Gen 4 name it filed by its suffix (`*_BALL`, `*_BERRY`), fix them by hand in the catalog (it's our source now). `make contracts`, `make breaking` (renumbering nothing: same value, other options).

### Catalog data

- [ ] Wild held items for 1-386 from `pokefirered` `src/data/pokemon/species_info.h` (`.itemCommon`, `.itemRare`), for 387-493 from `pokeemerald-expansion` `src/data/pokemon/species_info/gen_4_families.h` (`.itemCommon`, `.itemRare`; Gen 4's wild items). A one-off script under `infra/pokemon/` (like `evolutions.mjs`): writes the two fields into `species/v1/catalog.proto`, run once, kept for the record. Items not in our catalog: list them and ask before adding.

### Maps (`tool-maps`, `lib-maps`, [maps.md](../../../maps.md))

- [ ] Text format: `encounters:` per map (D2), validated by `tool-maps` (slot counts, levels 1-100, species exist, a table only if a cell has that encounter type).
- [ ] `tool-maps convert` reads FireRed's `wild_encounters.json` for the map it converts (Phase 12 uses it; no Kanto map is converted here).
- [ ] Compile into `ServerMap.wild`; `mic-core` loads it with the map (`world/maps.go`).
- [ ] **Test grass patch on 1F** (D7): FireRed's tall grass tile (`tall_grass` behavior, `encounter: land`) is in the outdoor primary tileset; 1F uses `building` + `generic_building_1`. First check whether `tool-maps` can draw a cell from another tileset. If not, mark a 3×2 floor patch with `behavior: tall_grass, encounter: land` overrides (no grass art on the floor; the rustle in M3 still draws over the player) and note it as test content. Put it where it doesn't block the stairs, the door or the TV.
- [ ] Test table: a few species at levels that make every test possible: a low-level one (Repel, Intimidate), one with a held item, a Water/Bug one (Net Ball), a Steel and an Electric one (Magnet Pull, Static), a slot at level 40+ (Nest Ball), Shedinja-like edge cases not needed. Write the choice here.
- [ ] maps.md: the `encounters:` section, the slot counts, that slot chances are FireRed's; remove "encounter tables" from **Planned**.

## Play It

- `make maps`; `mic-core` starts and logs the 1F table; the bag shows Iron Ball in ITEMS (if the test bag has none, give one by SQL with the game closed); a Pokémon holding Iron Ball in the room trainer's battle is slowed (Showdown).

## Gotchas

- `make breaking` flags a pocket change only if it's a field number change: options aren't wire data.
- The species catalog is huge: edit it with the script, never by hand.
