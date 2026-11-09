# M1 Data: Tables, Wild Items, Test Grass ✅

Part of [Phase 7](../phase-7-wild-battles-catching.md). **Needs:** nothing. Rules: [context.md](context.md) D2, D4, D5, D7.

**Done when:** a map's text file holds its encounter tables, `tool-maps` compiles them into `ServerMap`, every species has its wild held items, Iron Ball is a held item, and 1F of the player's house has a test grass patch with a test table that `mic-core` loads.

## Resume Here

**Done** (2026-11-09). Next: [M2](m02-wild-pokemon.md). One question left for the user, tracked as O11 in the [phase index](../../index.md#open-items): Combee's wild item is Honey (100%), which the item catalog doesn't have, so Combee holds nothing until they say whether to add it. If yes: add `ITEM_HONEY` to `item/v1/catalog.proto` (number it as the other Gen 4 items in the catalog are numbered; check before choosing), then put `item_common: N, item_rare: N` into Combee (415) with a one-line edit, and run `make contracts`.

## Tasks

### Contracts (`lib-contracts`)

- [x] `map/v1` `ServerMap.wild = 17` (`WildEncounters { land, water, rock_smash, fishing }`, each a `WildTable { rate, repeated WildSlot slots }`, `WildSlot { species, min_level, max_level }`). Fishing is one table of 10 slots (old 0-1, good 2-4, super 5-9). Slot chances checked against `wild_encounters.json`'s `fields`: land 20/20/10/10/10/10/5/5/4/4/1/1; water and Rock Smash 60/30/5/4/1; fishing 70/30, 60/20/20, 40/40/15/4/1. They go in `mic-core`'s code (M2), not in data.
- [x] `species/v1` `SpeciesInfo.item_common = 17`, `item_rare = 18`: `uint32` item numbers, as `Evolution.item` (the species catalog can't import the item catalog). Chances from FireRed's `SetWildMonHeldItem` (`src/pokemon.c` ~6032, called from `battle_main.c:708`): `rnd = Random() % 100`; both items the same → always held; else 45-94 common (50%), 95-99 rare (5%). Not for trainer, legendary-flagged or Pokédude battles there.
- [x] **Iron Ball fix:** `ITEM_IRON_BALL` (440) now `{pocket: POCKET_ITEMS, price: 200, field_use: FIELD_USE_NOT_NOW}` like its neighbors. Scan of `items.mjs`'s suffix rule: every other Gen 4 `*_BALL` (Heal, Dusk, Quick, ...) is a real ball, every Gen 4 `*_BERRY` (450-470) a real berry, Armor/Skull Fossil key items as FireRed's; only Iron Ball was wrong. `make contracts` and `make breaking` pass.

### Catalog data

- [x] Wild held items, Gen 4's table for 1-493 (user, 2026-11-09, option A): `infra/pokemon/wild-items.mjs` reads `references/pokeheartgold/files/poketool/personal/personal.json` (`baseStats[n].items` = [common, rare]; index = National number), maps Gen 4's old spellings (`SILVERPOWDER`, `TINYMUSHROOM`, `DEEPSEASCALE`, ...) to our names, writes `item_common: N, item_rare: N` before each species' `}];`. Run once: 199 species got items; left out only Combee's `HONEY` (O11). Spot-checked: Snorlax Leftovers/Leftovers, Chansey Oval Stone/Lucky Egg, Pikachu Oran Berry/Light Ball, Mothim rare Silver Powder, Starly rare Yache Berry. **Why not FireRed + the expansion:** they're Gen 3's and later gens' items (157 species differ); wild items are a Gen 4 rule (D5). AGENTS.md, tech-stack.md and D5 allow this one pokeheartgold data conversion. `DRY=1` prints without writing; never run it again (it appends).

### Maps (`tool-maps`, `lib-maps`, [maps.md](../../../maps.md))

- [x] Text format: `encounters:` (`format.Encounters`, `WildTable`, `Fishing { rate, old, good, super }`, `WildSlot { species, min, max }`; species by lowercase catalog name). `validate` (`encounters()` in `validate.go`): slot counts (`format.LandSlots` etc.), species exist (`validate.Species`, from `speciesv1.Species_value`), levels 1-100 and min ≤ max, rate 1-255, `land` needs land cells, `water`/`fishing` water cells, `rock_smash` none. Checked with a bad species and 11 slots: both errors reported.
- [x] Overrides gained `behavior` and `encounter` (`format.Override`, applied in `world/resolve.go`, validated in `validate.mapFile`, written by `format/write.go`).
- [x] `tool-maps convert` reads `wild_encounters.json` (`firered.Decomp.WildEncounters()`, FireRed's labels only, skips `_LeafGreen`) and writes `encounters:` (`convert/map.go` `encounters()`, splits fishing 2/3/5). Built, not run: no Kanto map is converted until Phase 12.
- [x] Compile: `compile.go` `wild()` → `ServerMap.wild` (fishing old, good, super in one table). `mic-core` `internal/world/maps.go` (not `world/maps.go`): `Map.Wild`, per-cell `encounters` with `Map.Encounter(p)`, a load check that `Encounters` has one entry per cell; `cmd/mic-core/main.go` logs each map's tables (`"wild encounters"`).
- [x] **Test grass patch on 1F** (D7): a grid draws only its tileset and its bases (`building` + `generic_building_1`), FireRed's grass is in the outdoor primary, so it's six overrides `behavior: tall_grass, encounter: land` at x 10-12, y 5-6 (no grass art; marked as test content in the file). Clear of the stairs (10,2), the door (3-5, 8-9), the TV (6,1) and Mom (8,4); column 9 and row 4 stay open.
- [x] Test table (land, rate 30), slots in order: rattata 2-3 (low: Repel, Intimidate) · caterpie 2-3 (Bug: Net Ball) · surskit 4-6 (Bug/Water: Net Ball) · magnemite 8-10 (Steel and Electric: Magnet Pull, Static) · pikachu 5-7 (Electric) · snorlax 40-42 (40+: Nest Ball; holds its item 100% with either source) · pidgey 3-5 · skarmory 20 (Steel) · elekid 12 (Electric) · wooper 6 (Water) · dratini 10 · chansey 15 (rare item: Lucky Egg 5%).
- [x] maps.md: `encounters:` in the format example, an **Encounters** rule (slot counts, FireRed's chances in code, cell rules, `convert`), overrides' new fields, `validate` and `ServerMap` rows; "encounter tables" removed from **Planned**.

## Build State

- After the script: `make contracts` and `make breaking` pass again (species `catalog.pb.go` / `catalog_pb.ts` regenerated).
- `make contracts`, `make breaking`, `make maps` (2 maps, 0 errors, the 3 old `pallet_town` warnings), `go build` + `go vet` of `tool-maps` and `mic-core` pass. `mic-core` rebuilt in the running stack (`docker compose up --build -d mic-core`) logs the 1F table with 12 slots, rate 30.
- Not played (Play It, left for M8's phase check unless the user asks sooner): Iron Ball in the bag's ITEMS pocket, Iron Ball slowing in the room trainer's battle.
- Go isn't on the host: run it in Docker as the Makefile does (`docker run --rm -v "$PWD":/repo -v pokeuniverse-go-mod:/go/pkg/mod -v pokeuniverse-go-build:/root/.cache/go-build -w /repo/<module> golang:1.27-alpine go build ./...`).

## Play It

- `make maps`; `mic-core` starts and logs the 1F table; the bag shows Iron Ball in ITEMS (if the test bag has none, give one by SQL with the game closed); a Pokémon holding Iron Ball in the room trainer's battle is slowed (Showdown).

## Gotchas

- `make breaking` flags a pocket change only if it's a field number change: options aren't wire data.
- The species catalog is huge: edit it with the script, never by hand.
- `tool-maps` commands that rewrite map files drop comments (maps.md **Canonical files**): the 1F test-content comments survive only because `convert` keeps existing files.
- `gofmt -l` in `mic-core` also lists `internal/world/player.go`, which was already unformatted before M1 (left alone).
