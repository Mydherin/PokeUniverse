# AGENTS.md

Instructions for AI agents working on PokeUniverse.

## Documentation

| Topic | File | Check when |
|---|---|---|
| Vision: purpose, game scope, art direction, non-functional requirements | [docs/vision.md](docs/vision.md) | Any feature, gameplay, art or scope decision |
| UI / UX: design, responsive, input, mobile keyboard, platforms, PWA | [docs/ui.md](docs/ui.md) | Any UI, screen, layout or interaction work |
| Maps: text format, tile catalog, tools, workflow | [docs/maps.md](docs/maps.md) | Any map creation, edit or map tooling work |
| Audio: rendering FireRed's music, sound effects and cries; web formats, loops, playback | [docs/audio.md](docs/audio.md) | Any music, sound or audio tooling work |
| Phases: MVP plan, scope and "done when" per phase | [docs/phases/](docs/phases/README.md) | Planning work, or starting/finishing a phase |
| Plans: self-contained plans for large features, with decisions and progress across chats ([battles](docs/plans/battles.md)) | [docs/plans/](docs/plans/) | Working on that feature: read its plan first, update it at the end of each session |
| Tech stack: structure, naming, languages, libraries, communication, auth, infrastructure, containers | [docs/tech-stack.md](docs/tech-stack.md) | Any technical decision or change |

- Check the relevant doc **before** making any decision or change.
- Follow what the docs say; don't introduce technologies or patterns that contradict them.

## Reference Repositories

Git submodules in `references/`, read only. Empty? Run `git submodule update --init`.

| Path | Repository | What's inside | Check when |
|---|---|---|---|
| `references/pokefirered/` | [pret/pokefirered](https://github.com/pret/pokefirered) | FireRed decompilation (C). `src/`: game logic (movement, overworld, menus, battle). `data/maps/`, `data/layouts/`: maps, events, warps, connections. `data/tilesets/`, `graphics/`: art. `data/scripts/`, `data/text/`: events and dialogue. `src/data/`: species, trainers, wild encounters. `include/constants/`: IDs and flags | How a FireRed behavior, map, event or formula works |
| `references/pokeemerald-expansion/` | [rh-hideout/pokeemerald-expansion](https://github.com/rh-hideout/pokeemerald-expansion) (tag `expansion/1.17.2`) | Emerald decompilation with every later species in Gen 3 style. `graphics/pokemon/<name>/`: front pics, icons, footprints, overworld sprites. `src/data/pokemon/species_info/gen_4_families.h`: Gen 4 species' Pokédex data and types. `sound/direct_sound_samples/cries/`: cries | Species 387-493 (art, Pokédex text, cries) |
| `references/pokemon-showdown/` | [smogon/pokemon-showdown](https://github.com/smogon/pokemon-showdown) | Battle engine (TypeScript). `sim/`: battle flow, actions, Pokémon state. `data/`: moves, abilities, items, species, learnsets, conditions. `data/mods/gen4/`: Gen 4 overrides | How a Gen 4 battle rule or edge case works |

Rules:

- **Read only.** Never modify, build or commit anything inside `references/`. Only update a submodule's pinned commit when the user asks.
- **Never copy code.** Understand the behavior, then write it from zero with our design ([tech-stack.md](docs/tech-stack.md#code-principles)).
- **Our docs win** when they disagree with a reference.
- Only exception: the build copies FireRed's graphics as they are (`make graphics`, plus the fonts' glyph widths read from `src/text.c` and the item icon table), `make text` encodes its strings (and item, move, ability and nature names and descriptions, Gen 4's from `pokeemerald-expansion`) with its charmap, `make audio` renders its sound (and every species' cry), `make pokemon` builds every species' art (front, back, shiny palette, icon, footprint) and Pokédex text from `pokefirered` (1-386) and `pokeemerald-expansion` (387-493), and `tool-maps` renders its tilesets (`make maps`); all write to gitignored folders, never committed. `tool-maps convert` also reads `pokefirered` maps as **input** once per map: the text maps it writes to `lib-maps/` are our source code and are committed. The item catalog (`lib-contracts/proto/pokeuniverse/item/v1/catalog.proto`) was converted once from `src/data/items.json` the same way and is now our source, like the species catalog (`species/v1/catalog.proto`) and the Pokédex habitats (`spa-pokeuniverse/src/game/firered/pokedex-habitats.json`), converted once by `infra/pokemon/catalog.mjs`, and the battle catalogs (moves, abilities, natures, species battle facts and learnsets), converted once by `infra/battle/catalog.mjs` from `@pkmn/sim`'s Gen 4 data and both references ([maps.md](docs/maps.md), [audio.md](docs/audio.md), [tech-stack.md](docs/tech-stack.md#firered-as-reference)).

## Guidelines

### Living Documentation

Documentation must always reflect the current state of the project.

- **The user's requests are the source of truth.** Docs follow the user, not the other way around.
- **After every user request**, quickly check which docs the request affects and update **only those**, in the same iteration.
- **On conflict** (the request contradicts a doc):
  1. Point out the conflict briefly and ask the user to confirm.
  2. If confirmed, update the doc to match the new decision.
  3. Never silently ignore the request or leave the doc outdated.
- Keep docs **concise and consistent**: bullets, tables, short "Why" lines. Full coverage, minimal words.
- Don't create new docs unless the user asks.

### Testing

- **No automated tests in the repository:** no unit, integration or end-to-end test suites.
- **Manual tests only when the user explicitly asks** (e.g. run the app and check a behavior). Don't commit anything they leave behind.
