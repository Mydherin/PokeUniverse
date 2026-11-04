# AGENTS.md

Instructions for AI agents working on PokeUniverse.

## Documentation

| Topic | File | Check when |
|---|---|---|
| Vision: purpose, game scope, art direction, non-functional requirements | [docs/vision.md](docs/vision.md) | Any feature, gameplay, art or scope decision |
| UI / UX: design, responsive, input, mobile keyboard, platforms, PWA | [docs/ui.md](docs/ui.md) | Any UI, screen, layout or interaction work |
| Maps: text format, tile catalog, tools, workflow | [docs/maps.md](docs/maps.md) | Any map creation, edit or map tooling work |
| Audio: rendering FireRed's music, sound effects and cries; web formats, loops, playback | [docs/audio.md](docs/audio.md) | Any music, sound or audio tooling work |
| Phases: MVP plan, order, scope, "done when", progress and milestones per phase | [docs/phases/](docs/phases/README.md) | Planning work, or starting/finishing a phase; to resume, follow [Current Work](#current-work) |
| Tech stack: structure, naming, languages, libraries, communication, auth, infrastructure, containers | [docs/tech-stack.md](docs/tech-stack.md) | Any technical decision or change |

- Check the relevant doc **before** making any decision or change.
- Follow what the docs say; don't introduce technologies or patterns that contradict them.

## Current Work

**Now:** [Phase 6: Pokémon and Party](docs/phases/phase-6-pokemon-party/phase-6-pokemon-party.md): [M1b: FireRed's item-use scene](docs/phases/phase-6-pokemon-party/milestones/m01b-item-use-scene.md#resume-here) is played except a whole battle won, PC, walk and SAVE; finish those, then M2. Keep this one line pointing at the phase or milestone file to resume.

Re-reading files wastes most of a new session, so the phase and milestone files carry the details ([how they're organized](docs/phases/README.md#how-a-phase-is-tracked)):

- **Start:** read only the file named above, down to what its **Resume Here** names. Nothing else up front: no other doc, no code.
- **Trust the file:** never re-check ✅ items, the status or its technical details in the code. Read another file only when the step at hand edits it or needs something the file doesn't have, and grep before reading a big one.
- **Save progress:** at the end of a session, and whenever the user is about to compact the context, write into the milestone file, or the phase file if it has no milestones: tasks done, exact next step, files touched, build state, gotchas, the commands and decisions the next steps use, and whatever you looked up so nobody reads it twice. Then update the phase file (**Resume Here**, milestone status) and the **Now** line above. Replace stale text, don't pile it up.
- **Context guard:** the project mod [`context-wrap-up`](.claude/mods/context-wrap-up/hooks/register.ts) sends this request once the context passes 20%. Delete it when the user lifts this limit.

## Reference Repositories

Git submodules in `references/`, read only. Empty? Run `git submodule update --init`.

| Path | Repository | What's inside | Check when |
|---|---|---|---|
| `references/pokefirered/` | [pret/pokefirered](https://github.com/pret/pokefirered) | FireRed decompilation (C). `src/`: game logic (movement, overworld, menus, battle). `data/maps/`, `data/layouts/`: maps, events, warps, connections. `data/tilesets/`, `graphics/`: art. `data/scripts/`, `data/text/`: events and dialogue. `src/data/`: species, trainers, wild encounters. `include/constants/`: IDs and flags | How a FireRed behavior, map, event or formula works |
| `references/pokeemerald-expansion/` | [rh-hideout/pokeemerald-expansion](https://github.com/rh-hideout/pokeemerald-expansion) (tag `expansion/1.17.2`) | Emerald decompilation with every later species in Gen 3 style. `graphics/pokemon/<name>/`: front pics, icons, footprints, overworld sprites. `src/data/pokemon/species_info/gen_4_families.h`: Gen 4 species' Pokédex data and types. `sound/direct_sound_samples/cries/`: cries | Species 387-493 (art, Pokédex text, cries) |
| `references/pokeheartgold/` | [ctrl-cheeb-del/pokeheartgold](https://github.com/ctrl-cheeb-del/pokeheartgold) | HeartGold and SoulSilver decompilation (C and asm, DS). `src/follow_mon.c`, `src/map_object_follow.c`, `include/field/field_follow_mon.h`: the Pokémon that follows you. `src/`: Gen 4 field and menu logic | How the following Pokémon or a Gen 4 feature FireRed doesn't have behaves. Behavior only: its art and code are never used |
| `references/pokemon-showdown/` | [smogon/pokemon-showdown](https://github.com/smogon/pokemon-showdown) | Battle engine (TypeScript). `sim/`: battle flow, actions, Pokémon state. `data/`: moves, abilities, items, species, learnsets, conditions. `data/mods/gen4/`: Gen 4 overrides | How a Gen 4 battle rule or edge case works |

Rules:

- **Read only.** Never modify, build or commit anything inside `references/`. Only update a submodule's pinned commit when the user asks.
- **Never copy code.** Understand the behavior, then write it from zero with our design ([tech-stack.md](docs/tech-stack.md#code-principles)).
- **Our docs win** when they disagree with a reference; behavior still follows [FireRed System, Gen 4 Rules](#firered-system-gen-4-rules).
- Only exception: the build copies FireRed's graphics as they are (`make graphics`, plus `pokeemerald-expansion`'s Gen 4 move category icons and battle animation art, plus the fonts' glyph widths read from `src/text.c` and the item icon table), `make text` encodes its strings (and item, move, ability and nature names and descriptions, Gen 4's and a few Gen 4 battle strings from `pokeemerald-expansion`) with its charmap, `make audio` renders its sound (and every species' cry), `make pokemon` builds every species' art (front, back, shiny palette, icon, footprint) and Pokédex text from `pokefirered` (1-386) and `pokeemerald-expansion` (387-493), and `tool-maps` renders its tilesets (`make maps`); all write to gitignored folders, never committed. `tool-maps convert` also reads `pokefirered` maps as **input** once per map: the text maps it writes to `lib-maps/` are our source code and are committed. The item catalog (`lib-contracts/proto/pokeuniverse/item/v1/catalog.proto`) was converted once from `src/data/items.json` the same way (Gen 4's items by `infra/battle/items.mjs`, whose icons `make graphics` copies from `pokeemerald-expansion`) and is now our source, like the species catalog (`species/v1/catalog.proto`) and the Pokédex habitats (`spa-pokeuniverse/src/game/firered/pokedex-habitats.json`), converted once by `infra/pokemon/catalog.mjs` (and the species' evolutions by `infra/pokemon/evolutions.mjs`), and the battle catalogs (moves, abilities, natures, species battle facts and learnsets), converted once by `infra/battle/catalog.mjs` from `@pkmn/sim`'s Gen 4 data and both references, and the move animation scripts and their art table (`spa-pokeuniverse/src/game/firered/battle/anims/`, converted once from FireRed's and the expansion's battle animation scripts and tables as data; the behaviors that run them are our own code, phase-5 D9) ([maps.md](docs/maps.md), [audio.md](docs/audio.md), [tech-stack.md](docs/tech-stack.md#firered-as-reference)).

## Guidelines

### FireRed System, Gen 4 Rules

- **Match FireRed whenever possible:** screens, menus, flows, input, messages, sounds, animations and how the world behaves. Check `references/pokefirered/` first; don't simplify or invent.
- **Battle and Pokémon rules are Gen 4:** battle mechanics, moves, abilities, what items do in battle, stats, natures, growth, learning and evolution, from `references/pokemon-showdown/` and `@pkmn/sim`'s Gen 4 data.
- **Where they meet:** the rule is Gen 4, FireRed's way of showing it stays. A Gen 4 feature FireRed doesn't have is presented as FireRed would; how it behaves comes from `references/pokeheartgold/` (the following Pokémon, for one).
- **Unless it conflicts with the MMO:** keep FireRed's behavior wherever the MMO approach (server authority, many players, always saved) allows it. Where it can't work, keep as much of it as possible: SAVE behaves exactly like FireRed's dialog, though the MMO saves everything all the time.
- **A difference needs a reason:** a Gen 4 rule, the MMO or the user's request. Write it in the milestone file; anything else is a bug to fix.

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
