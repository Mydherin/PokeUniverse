# M11 Experience, Level Up, Moves and Evolution ✅

Part of [Phase 5](../phase-5-battle-system.md). **Needs:** M6, M7. Shared rules and context: [context.md](context.md). Design: [D24](context.md#decisions).

**Done when:** the test team can level up, learn moves and evolve (test with a lower-level variant of the test NPC: the team is Lv 50, `pokemon/testteam.go` `testLevel`).

## Tasks

- [x] **Contracts:** `Exp`, `LevelUp`, `MoveLearned`, `REQUEST_KIND_LEARN_MOVE`, `BattleAction.learn`, `PartyMember` growth fields, `BattleMon.exp`, `MonOutcome.moves`, `SideOutcome.seen`, `BattleEnded.evolutions`, `party.v1` (`PendingEvolution`, `EvolvePokemon`, `PokemonEvolved` with `failed`, `LearnMove`), `PokedexChanged`.
- [x] **Evolution catalog:** `SpeciesInfo.evolutions` for 216 species (`infra/pokemon/evolutions.mjs`, once; the catalog is the source now).
- [x] **`mic-battles`:** exp and level-ups in Showdown's Faint event, stats/HP/moves changed live, learn step, outcome holds until answered.
- [x] **`mic-core`:** outcome (HP, moves, friendship), learn choice, `pokemon/evolution.go`, `EvolvePokemon`, `LearnMove`, Pokédex saved (`UpdateTrainerPokedex`).
- [x] **Client, battle:** exp bar, level up (`battle/level-up.ts`), learn flow (`battle/learn.ts`), summary forget mode (`ForgetMode`), `Sound.playFanfare`, `{PLAY_SE}` in the text printer (`TEXT_SONGS` in `boot.ts`).
- [x] **Client, evolution scene** (`battle/evolution.ts`) and assets.
- [ ] **Play it:** not done; the user closed M11 without it (2026-11-03). It goes with [M14](m14-battle-check.md), or whenever the user asks.

## Progress

**State (2026-11-03):** committed; all builds pass. **The game wasn't run:** nothing on screen or in the speakers is checked.

**Checked** with one-offs (deleted):
- `mic-battles`: Bulbasaur Lv 12 KOs two Lv 5 foes: order of events, HP, LEARN_MOVE, forget, skip, resume view, outcome.
- `mic-core`: Gain (level, friendship, EVs), Bulbasaur → Ivysaur with HP rising, Everstone, Eevee day/night, Wurmple's personality, Nincada → Ninjask + Shedinja (HP 1), National Pokédex gate, an illegal outcome move refused.
- The background's palette table against the C (one stray 0 differs, on purpose).

**Not checked:** everything visual and audible below; a move waiting when the last foe faints; a bench participant levelling up; Transform; Choice lock; the Redis store.

**To watch when playing:** healthbox flash and stripes (blend, position), level up box and YES/NO frames on BG0, the forget screen's layers (`bg1`/`bg2` priorities, BG3 map), scene BG scroll (`scrollX = 256`), sparkle sizes, sprite cycle (`affineNormal`, paused affine anims), moving background colors and sway, fanfare muting the BGM, `sText_123Poof`'s sound.

**How to test:** a test trainer or team variant low enough to level, learn and evolve (Bulbasaur Lv 15 near 16; `pokemon/testteam.go` `testLevel`; the team is Lv 50). D13 applies: revert it afterward. `make graphics text audio` and a Docker rebuild first.

### How it works

- **`mic-battles`:** `ExpTracker` (`exp.ts`), one per loaded battle, listens to Showdown's `Faint`; `translate.ts` puts its events after the faint's line. Per level: `Exp{amount, exp = next level's start}` → `LevelUp` → `MoveLearned` for free slots → `Exp{amount: 0}` for the rest. While `pending` isn't empty: no `advance`, request is LEARN_MOVE, no outcome.
- **`mic-core`:** `battle.Apply` gains, then HP from the outcome, moves by position (guarded by the species' level moves). `finish` fills `BattleEnded.evolutions` for those that gained a level (`Player.evolving`, memory only, cleared by `ScriptDone` and the next battle). `party.go`: `evolve` saves party, Poké Ball, Pokédex in one `transact`; a refusal answers `PokemonEvolved{failed}`, since the scene waits for it.
- **Client:** `BattleState.party` keeps the last request's party, updated by `exp` and `levelUp`, so healthboxes and the party menu follow mid-batch. `endJob` runs `evolutionScene` per evolution after the fade, on a clean `gba.reset()`, with mic-core's party. `openScreen` takes a `redraw`, so the forget screen comes back to the battle or the scene.

### Differences from FireRed

- The learn prompt comes at the end of the step, after that turn's residual damage (FireRed asks right at the exp).
- A level-up on the bench shows no banner (`level_up_banner.png` unused): only its message and stats box.
- Shedinja copies the moves known at the evolution, before any `to_learn` answer (FireRed copies after).
- BG0 holds the level up box (BG1 in FireRed). The scene uses the building terrain's palette, not `Plain`'s (black within seconds, same tiles).
- Server rule: no evolution past species 151 without the National Pokédex (the scene stops by itself, "……?"), so the test team's later species won't evolve until Phase 10 sets it.
- Item and trade evolutions are in the catalog, unused until their phases.

## Left Out of the Catalog

Printed by the script; add an entry when its item or place exists. **Items not in the catalog:** Protector (Rhyperior), Oval Stone (Chansey), Electirizer (Electivire), Magmarizer (Magmortar), Dubious Disc (Porygon-Z), Shiny Stone (Togekiss, Roserade), Dusk Stone (Honchkrow, Mismagius), Razor Fang (Gliscor), Razor Claw (Weavile), Dawn Stone (Gallade, Froslass), Reaper Cloth (Dusknoir). **Places:** Magnezone, Probopass, Leafeon, Glaceon. **Contest Beauty:** Milotic. Item and trade evolutions are in the catalog, unused until their phases.
