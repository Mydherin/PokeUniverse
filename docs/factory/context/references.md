# Reference Repositories

Read when a task needs how FireRed, a Gen 4 feature or a battle rule behaves, or touches the asset build. Git submodules in `references/`, read only. Empty? Run `git submodule update --init`.

## Paths

| Path | Repository | What's inside | Check when |
|---|---|---|---|
| `references/pokefirered/` | [pret/pokefirered](https://github.com/pret/pokefirered) | FireRed decompilation (C). `src/`: game logic (movement, overworld, menus, battle). `data/maps/`, `data/layouts/`: maps, events, warps, connections. `data/tilesets/`, `graphics/`: art. `data/scripts/`, `data/text/`: events and dialogue. `src/data/`: species, trainers, wild encounters. `include/constants/`: IDs and flags | How a FireRed behavior, map, event or formula works |
| `references/pokeemerald-expansion/` | [rh-hideout/pokeemerald-expansion](https://github.com/rh-hideout/pokeemerald-expansion) (tag `expansion/1.17.2`) | Emerald decompilation with every later species in Gen 3 style. `graphics/pokemon/<name>/`: front pics, icons, footprints, overworld sprites. `src/data/pokemon/species_info/gen_4_families.h`: Gen 4 species' Pokédex data and types. `sound/direct_sound_samples/cries/`: cries | Species 387-493 (art, Pokédex text, cries) |
| `references/pokeheartgold/` | [ctrl-cheeb-del/pokeheartgold](https://github.com/ctrl-cheeb-del/pokeheartgold) | HeartGold and SoulSilver decompilation (C and asm, DS). `src/follow_mon.c`, `src/map_object_follow.c`, `include/field/field_follow_mon.h`: the Pokémon that follows you. `src/`: Gen 4 field and menu logic | How the following Pokémon or a Gen 4 feature FireRed doesn't have behaves. Behavior only: its art and code are never used; its data only where an exception below names it (`files/poketool/personal/personal.json`: the species' wild held items) |
| `references/pokemon-showdown/` | [smogon/pokemon-showdown](https://github.com/smogon/pokemon-showdown) | Battle engine (TypeScript). `sim/`: battle flow, actions, Pokémon state. `data/`: moves, abilities, items, species, learnsets, conditions. `data/mods/gen4/`: Gen 4 overrides | How a Gen 4 battle rule or edge case works |

### Rules

- **Read only.** Never modify, build or commit anything inside `references/`. Only update a submodule's pinned commit when the user asks.
- **Never copy code.** Understand the behavior, then write it from zero with our design ([ARCHITECTURE.md](../ARCHITECTURE.md#code-principles)).
- **Our docs win** when they disagree with a reference; behavior still follows [FireRed System, Gen 4 Rules](../../../AGENTS.md#firered-system-gen-4-rules).
- Only exception: the build copies FireRed's graphics as they are (`make graphics`, plus `pokeemerald-expansion`'s Gen 4 move category icons, battle animation art and the Heal, Dusk and Quick Ball art, plus the fonts' glyph widths read from `src/text.c` and the item icon table), `make text` encodes its strings (and item, move, ability and nature names and descriptions, Gen 4's and a few Gen 4 battle strings from `pokeemerald-expansion`) with its charmap, `make audio` renders its sound (and every species' cry), `make pokemon` builds every species' art (front, back, shiny palette, icon, footprint) and Pokédex text from `pokefirered` (1-386) and `pokeemerald-expansion` (387-493) (plus every species' following-Pokémon sheet and palettes from `pokeemerald-expansion`, base forms only), and `tool-maps` renders its tilesets (`make maps`); all write to gitignored folders, never committed. `tool-maps convert` also reads `pokefirered` maps as **input** once per map: the text maps it writes to `lib-maps/` are our source code and are committed. The item catalog (`lib-contracts/proto/pokeuniverse/item/v1/catalog.proto`) was converted once from `src/data/items.json` the same way (Gen 4's items by `infra/battle/items.mjs`, whose icons `make graphics` copies from `pokeemerald-expansion`) and is now our source, like the species catalog (`species/v1/catalog.proto`) and the Pokédex habitats (`spa-pokeuniverse/src/game/firered/pokedex-habitats.json`), converted once by `infra/pokemon/catalog.mjs` (and the species' evolutions by `infra/pokemon/evolutions.mjs`, their wild held items by `infra/pokemon/wild-items.mjs` from `pokeheartgold`'s `personal.json` (Gen 4's table, user 2026-11-09), their TM and tutor moves by `infra/pokemon/learnsets.mjs` from `@pkmn/sim`), and the battle catalogs (moves, abilities, natures, species battle facts and learnsets), converted once by `infra/battle/catalog.mjs` from `@pkmn/sim`'s Gen 4 data and both references, and the move animation scripts and their art table (`spa-pokeuniverse/src/game/firered/battle/anims/`, converted once from FireRed's and the expansion's battle animation scripts and tables as data; the behaviors that run them are our own code, phase-5 D9) ([maps.md](maps.md), [audio.md](audio.md), [ARCHITECTURE.md](../ARCHITECTURE.md#firered-as-reference)).

## What Each One Is For

| Repository | Role |
|---|---|
| [pret/pokefirered](https://github.com/pret/pokefirered) | FireRed decompilation: **reference only** for game behavior; source for the one-time map conversion |
| [rh-hideout/pokeemerald-expansion](https://github.com/rh-hideout/pokeemerald-expansion) | Gen 3-style art (pictures, icons, footprints, cries) and Gen 4 Pokédex data for species **387-493**, in the decompilation's formats; pinned at tag `expansion/1.17.2` |
| [ctrl-cheeb-del/pokeheartgold](https://github.com/ctrl-cheeb-del/pokeheartgold) | HeartGold and SoulSilver decompilation: **reference only** for how the following Pokémon and other Gen 4 features FireRed lacks behave. Nothing from it is built or copied, except one data conversion: the species' wild held items (Gen 4's table, `infra/pokemon/wild-items.mjs`, run once) |
| [smogon/pokemon-showdown](https://github.com/smogon/pokemon-showdown) | Showdown battle engine: reference for battle rules |
| [pkmn/ps](https://github.com/pkmn/ps) | Source of `@pkmn/sim`, `@pkmn/data`, `@pkmn/dex`: **used as dependencies** in `mic-battles` (installed via npm, not cloned) |

### How References Are Kept

- **Git submodules:** one per repo in `references/<name>/`, declared in `.gitmodules` with `shallow = true`.
- **Pinned:** each submodule points to an exact commit; updating it is a one-line, reviewable change (`git submodule update --remote <path>`).
- **Fetch:** `git clone --recursive`, or `git submodule update --init` after cloning.
- **Excluded from builds:** `references/` is in `.dockerignore` and skipped by CI.
- **Why:** no third-party code or Nintendo assets in our history, native Git pinning with no custom scripts, reproducible map conversion, small and fast to fetch.
