# Battles: Shared Context

Part of the [battles plan](README.md): read with it at every session start. Decisions, architecture, contracts and commands every milestone shares. **Trust it:** don't re-verify it in the code.

## Commands

Run from the repository root. The host has no Go, and its `node_modules` are Linux's (installed by Docker).

| What | Command |
|---|---|
| Contracts (buf) | `make contracts`, then `make breaking` |
| `mic-core` build + vet | `docker run --rm -v "$PWD":/repo -w /repo/mic-core -v pokeuniverse-go-mod:/go/pkg/mod -v pokeuniverse-go-build:/root/.cache/go-build golang:1.27-alpine sh -c "go build ./... && go vet ./..."` |
| SPA typecheck (works on the host) | `cd spa-pokeuniverse && npx tsc --noEmit -p .` |
| SPA bundle (Docker only) | `cd spa-pokeuniverse && docker run --rm -v "$PWD/..":/repo -w /repo/spa-pokeuniverse node:26-alpine sh -c "npx vite build --outDir /tmp/dist"` |
| Assets | `make graphics`, `make text`, `make pokemon`, `make audio` (all in Docker, gitignored output) |

## Client Engine Cheat Sheet

What FireRed screens use (`spa-pokeuniverse/src/game/`), so a screen can be written without re-reading `gba/`. A screen is a class whose `step` runs once a frame as a task; it never decides anything (mic-core does).

- **`Flow`** (`firered/flow.ts`): `gba`, `assets`, `link` (intents to mic-core), `fonts[FontId]`, `text` (printers: `add(win, style, delay, text)`, `isActive(win)`, `ctx.canABSpeedUpPrint`), `options`, `trainer`, `play(se)`, `playCry(species)`, `encode(string)`, `runFrame()`.
- **`gba`:** `reset()`, `setMain(fn)`, `setVBlank(fn | null)`, `standardVBlank`, `input` (`pressed`, `repeated`, `isPressed(Button.X)`), `tasks` (`create(fn, priority)`, `destroy`, `reset`), `sound.stop(player)`.
- **`gba.video`:** `bgs[0-3]` (`Background`: `map`, `tiles` (shared arrays must be preallocated: `copyToVram` grows them), `priority`, `x` in 8.8, `visible`, `entry/setEntry(x, y)`), `win1` + `win1On`, `winIn1`, `winOut` (`Layer` masks).
- **`gba.palettes`:** `load(colors, offset, count)`, `loadSpritePalette(tag, colors)` (returns the existing slot without reloading), `freeSpritePalette(tag)`, `spritePaletteSlot(tag)`, `blendPalettes(mask, amount, color)`, `beginFade(mask, delay, from, to, color)`, `fadeActive`.
- **`gba.sprites`:** `loadSheet(tag, tiles)`, `create(template, x, y, subpriority)`, `destroy(sprite)`. `Sprite`: `x, y, x2, y2, invisible, priority, subpriority, tileNum, hFlip, paletteNum, callback, data[], startAnim(n), animPaused`. `SpriteTemplate {sheet, palette, width, height, priority, anims}`.
- **`Window`** (`gba/text.ts`, `new Window(bg, {left, top, width, height, palette, baseBlock})`): `fill`, `fillRect`, `print(font, x, y, colors, text, letterSpacing?, lineSpacing?)`, `copyTile`, `blitRect`, `putTilemap`, `clearTilemap`, `copyToVram`. Text helpers: `decimalText`, `joinText`, `expandPlaceholders`, `expandDynamic`.
- **`firered/menu.ts`:** `CursorMenu`, `YesNoMenu`, `drawStdFrame`, `clearStdWindowAndFrameToTransparent`, `printDefault`, `copyTiles`, `MENU_NOTHING_CHOSEN`, `MENU_B_PRESSED`. **`firered/common.ts`:** `initBg(bg, size, priority)`, `fillBgRect`, `loadBg`.
- **`Assets`** (`firered/manifest.ts`): `get(graphicId)` → `{tiles, palette, map?, bytes?}`, `text(textId)`, `itemName`, `moveName`, `species(n)`, `pokemonArt(n)` / `loadedPokemonArt(n)`, load sets (`loadParty()`…). New graphics go in a set there and in the `Makefile`; new strings in `texts.json` (`make text`).
- **Screens to copy the shape from:** `firered/party-menu.ts` (boxes, messages, YES/NO, fades), `firered/summary.ts` (page flips, sprite bars), `firered/bag.ts` (modes and hosts).

## Where the Project Stands (2026-11-01, after M7's code)

What exists that battles build on. Trust it; open these only when a step needs their details.

| Area | State | Where |
|---|---|---|
| `mic-battles` (M4, M5) | `battles.{ping,start,turn,forfeit,view}`; Redis `battle:<id>` with a step check; Showdown wrapper, log → events per side, requests, views, outcome, Gen 4 exp/EVs; NPC AI (FireRed flags, switching, trainer items; wild random); `redis` 6.3.0 | `mic-battles/src/` ([M4](m04-battle-engine.md), [M5](m05-npc-ai.md)) |
| Battle contracts (M4) | NATS (`battle.proto`), `BattleEvent` (`event.proto`), view/request/actions/client messages (`view.proto`) | `lib-contracts/proto/pokeuniverse/battle/v1/` |
| `mic-core` battles (M6) | `internal/battles` (NATS: `Start`, `Turn` retried until answered; `View`); `internal/battle` (trainer table + test trainer, `NewStart`, outcome rules, whiteout money, `player:<id>:battle`, `battle_outcomes`); `internal/world/battle.go` (zone: start, choices, outcome transaction, whiteout, resume) | [M6](m06-mic-core-battles.md) |
| Battle screen (M7) | `game/battle/state.ts` (art-free state); `firered/battle/`: `screen.ts` (job queue of frame generators: transition, intro, turns, choices, ending; `BattleHost` from the overworld), `scene.ts` (BGs, textbox pages, sprites, redraw from state), `playback.ts` (events → visuals), `messages.ts` (events → FireRed strings), `text.ts` (`{B_...}` placeholders), `menus.ts`, `healthbox.ts`, `transition.ts`; party menu `battle` mode, `BagLocation.Battle` | [M7](m07-battle-screen.md) |
| World | One zone goroutine per map, 50 ms tick, saved before shown (Redis `live`), scripts as Go tables (`internal/world/interact.go`: `npcScripts`, `signScripts`), `Player.busy()` (a script or a battle) blocks movement and actions | `mic-core/internal/world/*.go` |
| Realtime envelope | `ClientMessage` / `ServerMessage` oneofs (last field numbers: client 22 `script_battle`, server 14 `battle_ended`); `WorldSnapshot.battle` (8); `BattleView.trainer` (6, filled in by mic-core) | `lib-contracts/proto/pokeuniverse/realtime/v1/realtime.proto` |
| Species | `species/v1/catalog.proto`: 493 species, `SpeciesInfo{type1, type2, height, weight}` as enum value options; `Type` = FireRed's `TYPE_*` + 1 | |
| Items | `item/v1/catalog.proto`: FireRed's 307 items and Gen 4's 96 (375-470) with `ItemInfo` rules; bag, PC, use/give/toss in `mic-core/internal/item` | |
| Pokédex | Seen/caught bitsets per trainer; `internal/pokedex`; the client screen exists | |
| Trainer | `trainers` table: options include `battle_scene` and `battle_style` (saved, not used yet), money, trainer ID | `mic-core/internal/trainer` |
| Party (M2, M3) | `trainer_pokemon` table; `internal/pokemon` (Gen 4 stats, growth rates, personality, default moves, `Party`, store, test team); `party/v1` contracts; `Party` in the snapshot; SWITCH and held items saved with the bag in one transaction (`world/save.go`) | `mic-core/internal/{pokemon,world}`, `spa-pokeuniverse/src/game/world/party.ts` |
| Maps | NPCs: `ServerMap.objects`, `ClientMap.npcs` (`ClientNpc`: id, cell, sprite, facing from `face_*`); they block steps (both `rules`), A talks to them before signs, they face the player; client art in `firered/npc-sprite.ts` (`SPRITES`: only `cooltrainer_m`) | `lib-maps/maps/pallet_town_players_house_2f.yaml` (12×9 room, player starts at 6,6; test trainer at 9,4) |
| Client engine | `gba/`: 240×160 compositor, tile and affine backgrounds, affine sprites, 512-color palette, windows, blending, per-scanline brightness, fades, tasks, text printer, sound players | `spa-pokeuniverse/src/game/gba/` |
| Client screens | FireRed screens as frame-driven state machines (`firered/`), START menu (`start-menu.ts`: POKéMON gated by `hasPokemon`), BAG (with `BagLocation.Party` to pick an item to give), OPTION, Trainer Card, Pokédex, party menu (`party-menu.ts`: field and give modes; battle mode in M7) and summary (`summary.ts`) | `spa-pokeuniverse/src/game/firered/` |
| Assets | `make graphics` copies listed FireRed folders/files (`FIRERED_GFX`, `FIRERED_GFX_FILES` in `Makefile`) and the expansion's (`EXPANSION_GFX_FILES`: category icons); `make pokemon` builds per-species front/back/shiny/footprint/icon + `species.json` (with `noFlip`) + `cries.json`; `make text` encodes `texts.json`; `make audio` renders `sounds.json` + all cries | `Makefile`, `infra/` |
| References | All three checked out (`pokemon-showdown` since M0; empty after a fresh clone? `git submodule update --init`) | `references/` |

## Decisions

| # | Decision | Why |
|---|---|---|
| D1 | **Showdown (`@pkmn/sim`, `gen4customgame`) resolves every turn** in `mic-battles`; we never reimplement damage, abilities or move effects. | Exact Gen 4 rules, already tested ([tech-stack.md](../../tech-stack.md#mic-battles-node--showdown)). |
| D2 | **Stateless steps:** each battle is a Redis hash `battle:<id>` (`step`, `start`, `state`: Showdown's serialized battle with its PRNG, `meta`: ours, `reply`: the last reply). Load → play → save with an atomic step check (Lua) → reply. A step already played returns the saved `reply`. A **step** is one choice played (forced switches too), not Showdown's turn. | Any replica plays any step; crashes resume; retries are safe. |
| D3 | **`mic-core` decides, `mic-battles` resolves.** `mic-core` builds both teams from its own data (party from PostgreSQL, NPC teams from its trainer table), validates choices it can (owns the bag), forwards them, and saves the outcome. `mic-battles` never touches PostgreSQL. | Same split as the rest of the game; one owner per piece of data. |
| D4 | **Compact events, not Showdown's text protocol, reach the client.** `mic-battles` translates the battle log into `BattleEvent`s (enums and numbers only). The client turns each event into FireRed's text, animation and sound. | Small payloads; the presentation stays replaceable ([Decoupled Presentation](../../tech-stack.md#decoupled-presentation)). |
| D5 | **Hidden information stays hidden:** each side gets its own event stream. The player sees exact HP for their own Pokémon and the foe's HP only as FireRed's 48-pixel bar (`hp_bar`: 0-48). The foe's moves, item and ability show only when they're revealed. | Anti-cheat; PvP later needs it anyway. |
| D6 | **The AI lives in `mic-battles`** (`src/ai/`) as our own TypeScript. It scores moves by **FireRed's AI flags** (`data/battle_ai_scripts.s`: CHECK_BAD_MOVE, TRY_TO_FAINT, CHECK_VIABILITY, SETUP_FIRST_TURN, RISKY, PREFER_STRONGEST_MOVE, PREFER_BATON_PASS, HP_AWARE), plus FireRed's switching and item use (`src/battle_ai_switch_items.c`). The Gen 4 knowledge (abilities, physical/special split, Gen 4 move effects) is modelled on `pokeemerald-expansion`'s `src/battle_ai_*.c`. The AI reads Showdown's live battle objects and uses the battle's seeded PRNG. | "Original" behavior, adapted to Gen 4; deterministic, so replays and retries give the same choice. |
| D7 | **Data catalogs are converted once and committed** (moves, abilities, natures, stats, species battle facts and learnsets, TM moves), then edited by hand. Rules from Showdown's Gen 4 data in `@pkmn/sim` (the version `mic-battles` plays), constant names and FireRed-only data from the decompilations; official numbers. `Type` stays in `species/v1`, `LevelMove.move` is a number (buf forbids package cycles). Details: [M1](m01-data-catalogs.md). | One source of truth for Go and TypeScript; mic-core needs stats, PP and learnsets without asking `mic-battles`. |
| D8 | **Names and descriptions belong to the art style:** `make text` writes `moves.json`, `abilities.json`, `natures.json` and later the battle messages: FireRed's text for what it has, the expansion's for Gen 4, uppercased and reflowed to FireRed's widths (`infra/text/reflow.mjs`), never committed. | Same rule as species text ([tech-stack.md](../../tech-stack.md#firered-as-reference)). |
| D9 | **Battle animations are data plus our own behaviors.** Each move's animation script is converted once into JSON: commands, delays, sounds, which sprite templates, and arguments. Moves 1-354 come from FireRed's `data/battle_anim_scripts.s`, moves 355-467 from the expansion's `gBattleAnimMove_*`. The JSON is committed under `spa-pokeuniverse/src/game/firered/battle/anims/` and becomes our source. The sprite callbacks and tasks the scripts name are **written from zero** in TypeScript, as a library of behaviors. A move whose behaviors aren't written yet plays a **generic animation by type and category**, so every move animates from day one. | Scripts are data, like maps and the item table. The C behind them is code, so it's rebuilt. The fallback keeps the game complete while fidelity grows. Confirmed by the user (2026-11-02); listed in AGENTS.md's exception. |
| D10 | **FireRed's battle look (Gen 3 style), with Gen 4 info where FireRed has no slot for it:** the physical/special/status category icon (the expansion's `graphics/interface/category_icons.png`) on the move menu's info and the summary's move page. Abilities show in the summary as in FireRed. Gen 4 abilities announce themselves with Gen 3-style messages. | Vision: Gen 3 graphics, Gen 4 mechanics. |
| D11 | **Singles first.** Doubles (FireRed's double trainer battles, Gen 4 double rules) come after the core is done (M13). | Smallest working battle first; the contracts already carry a slot per position. |
| D12 | **Bag items in battle** are a queued Showdown `event` action (`BagItem`, order 102: before switches and moves, as in Gen 4), pushed into the side's choice; the item waits in the user's `m.bagItem` (saved with the battle), and a listener registered on every created or restored battle applies it (`engine/bag.ts`). `mic-core` checks and spends the item first. | Showdown has no player bag. Its own queue keeps the order and the log correct, with no fake moves. |
| D13 | **Test content is marked as such:** the starting test team and the room's test trainer are data in `mic-core` (`internal/battle/testdata.go` or similar) and the map, each with a `// Test content (plans/battles/README.md): removed in Phase 5` comment. In Phase 5 the starter replaces the team and the NPC leaves the room. | The user asked for them to test battles now. They must not leak into the real game. |
| D14 | **The party is permanent data in PostgreSQL** (`trainer_pokemon`), saved in one transaction per change. Battle damage, PP and status stay after a battle (FireRed), saved with the outcome. During a battle, its live state is Redis only. | [Saving State](../../tech-stack.md#saving-state-resilience). |
| D15 | **Faint cries are rendered** with FireRed's faint cry mode, once per species, as `cry_<nnn>_faint`, like the cries. Not a Web Audio pitch trick. | Sounds exactly like the game. |
| D16 | **The party's contracts are their own package, `pokeuniverse.party.v1`**; `pokemon/v1` keeps what needs no catalog (`Gender`, `Status`, stats, natures). The client's `Pokemon` never carries IVs, EVs or friendship. Held-item rules live in `internal/item` (`Hold`, `TakeHeld`) and answer with `ItemResult`. Details: [M2](m02-party.md). | `party.v1` uses the catalogs and `species/v1` imports `pokemon/v1`: buf forbids the cycle. `item` never depends on `pokemon`. |
| D17 | **The AI's move effects come from Showdown's move data** (`ai/effects.ts`: boosts, status, side conditions, healing… plus a table by ID), named as FireRed's `EFFECT_*`, not converted from the decompilations. | Gen 4 moves get an effect for free; no new converted file. |
| D18 | **AI fidelity:** FireRed's scripts and switching, with the bugs its scripts mark fixed (Facade, Psych Up, the swapped weather checks…), Emerald's Safeguard checks, and Gen 4 knowledge (abilities, the physical/special split for "physical attacker", hazards, Trick Room, Tailwind, U-turn, Taunt). FireRed's switch-in choice keeps the type the foe's types hit **hardest** (a bug); ours keeps the one they hit least. | "Original" behavior without its known mistakes. |
| D19 | **Trainer battles start from scripts:** `YesNo{no}` branches on the client (the answer is the player's own choice), `TrainerBattle{trainer}` makes the client send `ScriptBattle{script}`; the zone only accepts it while that script runs, once. After a win the script goes on; a loss or a failed start ends it. `BattleView.trainer` (class, name, pic, defeat text) comes from mic-core's table. | No server round trip per answer; the server still decides what starts. Phase 5's interpreter replaces the tables. |
| D20 | **Outcome rules (Gen 4):** HP, PP and status stay; Toxic becomes poison; a used-up held item (berries, herbs) is gone, any other change (Knock Off, Thief, Trick) is undone; exp and EVs (255/510 caps) applied, HP rises with max HP. Won: 4 × last level × class rate. Lost or tie: whiteout (highest level × 4 × badge multiplier, ×2 with no badges), party healed, back to `world.Start`. | FireRed/Gen 4 behavior. |
| D21 | **Battle screen adaptations:** the move menu shows the category icon (D10) where FireRed prints "TYPE/", then the type's name (no room for both). Trainer encounter music is a script step (`ScriptStep.music`), the map's music returns when the script ends. Gen 4-only effects print a FireRed string with the effect's name ("<MON> is hurt by STEALTH ROCK!") or nothing. Indoors uses FireRed's building terrain and the angled wipes transition. | Gen 3 look with Gen 4 info; no invented strings. |
| D22 | **Leaving mid-battle rolls back:** the battle is dropped and nothing it changed is saved (party, money, bag items used in it); only a server crash or restart resumes it. Items used are taken from the bag in memory and kept in `player:<id>:battle` (`spent`), then saved in the outcome's transaction. | The user's call (2026-11-02): leaving must not keep a half-played battle. |
| D23 | **Animations aren't compared move by move with the original ROM.** A sweep in our game is enough to close a milestone; what looks off gets fixed when it shows up in play. | The user's call (2026-11-03): a manual comparison of every move isn't worth the time. |
| D24 | **`mic-battles` plays level-ups and learned moves; `mic-core` checks and saves them, and decides evolution.** Exp is awarded inside Showdown's `Faint` event, so the Pokémon's level, stats, HP and moves change there and then. A move with no free slot is a `REQUEST_KIND_LEARN_MOVE` step: the battle neither goes on nor ends until it's answered. The outcome carries the final moves. After a win `mic-core` picks the evolutions (`BattleEnded.evolutions`); the client plays the scene and sends `EvolvePokemon` unless B stops it, and only shows the result once saved. | The user's call (2026-11-03), replacing M11's "decided by `mic-core`": FireRed levels up mid-battle, so Showdown's Pokémon must change at once. A single owner keeps retries, resume and rollback (D2, D22) working as they are. |
| D25 | **What a bag item does in battle is catalog data:** `ItemInfo.battle_use` (PARTY, MOVE, SELF, BALL) and `effect` (HP, cures, revive, PP). `mic-battles` plays it and refuses an item that would do nothing, `mic-core` only checks there's a use and spends it (important items aren't spent), the client builds the flow and "It won't have any effect." from it. X items, Dire Hit, Guard Spec. and POKé FLUTE stay in `engine/bag.ts`. A ball in a trainer battle costs the ball and the turn, as in FireRed. | One table for three programs; a new item is one catalog line. |

### Open Questions (ask the user when the milestone comes)

- Battle style SHIFT: Showdown has no "Will you switch?" prompt after a foe faints. Proposed: emulate it in `mic-battles` (M13); until then the game behaves like SET.

## Architecture

```
spa-pokeuniverse                         mic-core (Go)                          mic-battles (Node + @pkmn/sim)
────────────────                         ─────────────                          ──────────────────────────────
firered/battle/* (screen, anims)         internal/battle (orchestration)        src/engine (Showdown wrapper)
game/battle/* (state from events)  WS    internal/pokemon (stats, party)  NATS  src/protocol (log → BattleEvent)
  BattleChoice ───────────────────────►  validate, spend items ─────────────►  src/ai (FireRed flags, Gen 4)
  ◄─────────────── BattleTurn            forward per side  ◄───────────────   src/store (Redis battle:<id>)
                                         outcome → PostgreSQL (1 tx)
```

### Battle Flow

1. **Start:** the player talks to the test trainer → the script shows the intro text → YES → `mic-core` builds `StartBattle` (battle ID, kind TRAINER, both teams, NPC AI flags, seed) → `battles.start` → `mic-battles` creates the Showdown battle, plays team preview/lead, saves `battle:<id>`, replies with each side's first events and requests. `mic-core` saves `player:<id>:battle` in Redis, sends `BattleStarted` to the client, and the zone blocks the player's movement.
2. **Turn:** the client shows the request (FIGHT/BAG/POKéMON/RUN) → `BattleChoice{battle, turn, action}` → `mic-core` checks it (turn number, item ownership, RUN not allowed in trainer battles) → `battles.turn{battle, turn, choices}` → `mic-battles` adds the AI's choice, plays, translates, saves, replies → `mic-core` forwards `BattleTurn{events, request}` to the player.
3. **Forced choices:** after a faint, Showdown asks for a switch. It reaches the client as a request with `force_switch`, answered with a `BattleChoice` like any other.
4. **End:** the reply carries `BattleOutcome` (winner; for each player Pokémon its HP, PP, status, experience and levels gained; money). `mic-core` applies it in **one transaction keyed by battle ID** (a `battle_outcomes` row makes it applied once), deletes `player:<id>:battle`, sends `BattleEnded`. The client plays the ending: victory music, money text, whiteout. Then `mic-battles` deletes `battle:<id>`.
5. **Leaving and resume (D22):** a player who leaves mid-battle (tab closed, Home, connection lost, or entering the world anew: a page load or CONTINUE sends `take_over`) drops it: `player:<id>:battle` is deleted (only if it is still that battle) and nothing it changed was saved, so they come back as before the battle (bag items used in battle are only saved with the outcome). After a crash or a restart of `mic-core` (or `mic-battles`), `EnterWorld`'s snapshot carries `battle` (a `BattleView`: both sides' active Pokémon and party summaries, field state and the pending request) and the client redraws the battle screen; if `mic-battles` restarted, the next `battles.turn` loads from Redis.

### Contracts

`lib-contracts/proto/pokeuniverse/battle/v1/` is the source; conventions (sides, `party_slot`, HP, `step`, `silent`) in [M4](m04-battle-engine.md#conventions-for-m5-m7).

### Code Layout (new)

| Path | Owns |
|---|---|
| `mic-battles/src/engine/` | Create a battle from `StartBattle`, serialize/deserialize, apply choices, play on (`advance`), bag items (D12) |
| `mic-battles/src/protocol/` | Showdown log lines → `BattleEvent` per side (D4, D5); requests, views, outcome |
| `mic-battles/src/battles.ts` | The subjects: load → play → translate → save → reply |
| `mic-battles/src/ai/` | `index.ts` (decide), `view.ts` (what the AI reads), `effects.ts`, `score.ts`, `flags/` (one file per flag), `switch.ts`, `items.ts`, `random.ts` (wild) (D6, D17, D18) |
| `mic-battles/src/store.ts` | Redis `battle:<id>` with the turn check (Lua) |
| `mic-battles/src/exp.ts`, `growth.ts` | Gen 4 experience, levels, EVs and new moves (not in Showdown), applied live (D24) |
| `mic-core/internal/pokemon/` | Stats (Gen 4 formula), natures, IVs/EVs, gender, shiny, growth rates, default moves, evolution rules, the party and its store (sqlc), the test team; party intents run in `internal/world/party.go` |
| `mic-core/internal/battle/` | Starting battles, a player's active battle (Redis `player:<id>:battle`), choices, outcome transaction, NPC trainer table, whiteout |
| `spa-pokeuniverse/src/game/battle/` | Battle state for any art style: applies events, holds the request (like `world/`) |
| `spa-pokeuniverse/src/game/firered/battle/` | The FireRed battle screen: transition, terrain, intro, healthboxes, menus, messages, sprites, level up, learning moves, the evolution scene, `anims/` (engine, `behaviors/` by family and `gen4.ts` for the expansion's moves, converted scripts, `art.json`) |
| `spa-pokeuniverse/src/game/firered/party-menu.ts`, `summary.ts` | POKéMON from the START menu and in battle |
| `infra/battle/` | `catalog.mjs` (moves, abilities, species battle facts, learnsets; once), `anims.mjs` (animation scripts → JSON; once), `anim-art.mjs` (tag/background art table → `art.json`; once) |

## Reference Map

Which reference file explains each behavior: [references.md](references.md) (open it only when a step needs a reference the milestone's **Read** line doesn't name).
