# Plan: Gen 4 Battles

Self-contained plan for the whole battle system: Pokémon data, party, battle engine, NPC AI, battle screen, sprites, animations and sounds. It tracks progress across chats: **read this file first, then only the files a milestone lists.** Update it at the end of every work session ([How to Use](#how-to-use-this-file)).

- **Status:** 🚧 In progress, part of [Phase 4](../phases/phase-4-players-room.md) (moved there from Phases 8 and 9 by the user, 2026-11-01).
- **Goal:** in the player's room, the trainer has a team of six (POKéMON in the START menu, party screen and summary). A trainer NPC stands in the room, and talking to them starts a **FireRed-style trainer battle with Gen 4 rules**. The battle uses FireRed's screen, sprites, animations, sounds and texts, resolved by Showdown in `mic-battles`, with a FireRed-style AI adapted to Gen 4.
- **Stays in later phases:** wild encounters and catching ([Phase 9](../phases/phase-9-battles.md)), the rival battle in Oak's lab (Phase 9), following Pokémon and Bill's PC boxes ([Phase 8](../phases/phase-8-pokemon-party.md)), PvP ([Phase 11](../phases/phase-11-social.md)).

---

## How to Use This File

1. **New chat:** read [AGENTS.md](../../AGENTS.md), then this file. Pick the first milestone not ✅ whose dependencies are ✅. Read only the files its **Read** line lists.
2. **While working:** follow the [Decisions](#decisions). Don't reopen one without the user. A new decision goes into the table with a short "Why".
3. **End of a work session:** tick the finished tasks, set the milestone's status, add a line to the [Log](#log) (date, what's done, what's next, gotchas), and update the docs the work changed ([tech-stack.md](../tech-stack.md), [phase-4](../phases/phase-4-players-room.md), [audio.md](../audio.md)…). Keep this file **concise**: replace stale text, don't pile it up.
4. **Testing:** the repository has no automated tests ([AGENTS.md](../../AGENTS.md#testing)). Run the game and check behaviors manually only when the user asks.

Status marks: ⬜ not started · 🚧 in progress · ✅ done · ⏸ deferred.

---

## Where the Project Stands (2026-11-01)

What exists that battles build on. You don't need to re-read these unless a milestone says so.

| Area | State | Where |
|---|---|---|
| `mic-battles` | Skeleton: NATS queue group `mic-battles`, only `battles.ping`; format `gen4customgame` checked at startup; `@pkmn/sim` 0.10.11; esbuild bundle; `/healthz` `/readyz` | `mic-battles/src/{main,handlers,rules,config,log}.ts` |
| Battle contracts | Only `Ping` / `Pong` | `lib-contracts/proto/pokeuniverse/battle/v1/battle.proto` |
| `mic-core` ↔ battles | `internal/battles/battles.go`: `Ping`, `WaitReachable` | |
| World | One zone goroutine per map, 50 ms tick, saved before shown (Redis `live`), scripts as Go tables (`internal/world/interact.go`), `Player.script` blocks movement until `ScriptDone` | `mic-core/internal/world/*.go` |
| Realtime envelope | `ClientMessage` / `ServerMessage` oneofs (last field numbers: client 20, server 11) | `lib-contracts/proto/pokeuniverse/realtime/v1/realtime.proto` |
| Species | `species/v1/catalog.proto`: 493 species, `SpeciesInfo{type1, type2, height, weight}` as enum value options; `Type` = FireRed's `TYPE_*` + 1 | |
| Items | `item/v1/catalog.proto`: FireRed's 307 items with `ItemInfo` rules; bag, PC, use/give/toss in `mic-core/internal/item` | |
| Pokédex | Seen/caught bitsets per trainer; `internal/pokedex`; the client screen exists | |
| Trainer | `trainers` table: options include `battle_scene` and `battle_style` (saved, not used yet), money, trainer ID | `mic-core/internal/trainer` |
| Party (M2) | `trainer_pokemon` table; `internal/pokemon` (Gen 4 stats, growth rates, personality, default moves, `Party`, store, test team); `party/v1` contracts; `Party` in the snapshot; SWITCH and held items saved with the bag in one transaction (`world/save.go`) | `mic-core/internal/{pokemon,world}`, `spa-pokeuniverse/src/game/world/party.ts` |
| Maps | `MapObject.npc` (sprite, movement, script, flag, trainer_type, trainer_sight) exists in `map/v1/map.proto` and the text format, but **no NPC is compiled, drawn or blocks movement yet** | `lib-maps/maps/pallet_town_players_house_2f.yaml` (12×9 room, player starts at 6,6) |
| Client engine | `gba/`: 240×160 compositor, tile and affine backgrounds, affine sprites, 512-color palette, windows, blending, per-scanline brightness, fades, tasks, text printer, sound players | `spa-pokeuniverse/src/game/gba/` |
| Client screens | FireRed screens as frame-driven state machines (`firered/`), START menu (`start-menu.ts`: POKéMON gated by `hasPokemon`), BAG (with `BagLocation.Party` to pick an item to give), OPTION, Trainer Card, Pokédex, party menu (`party-menu.ts`: field and give modes; battle mode in M7) and summary (`summary.ts`) | `spa-pokeuniverse/src/game/firered/` |
| Assets | `make graphics` copies listed FireRed folders/files (`FIRERED_GFX`, `FIRERED_GFX_FILES` in `Makefile`) and the expansion's (`EXPANSION_GFX_FILES`: category icons); `make pokemon` builds per-species front/back/shiny/footprint/icon + `species.json` (with `noFlip`) + `cries.json`; `make text` encodes `texts.json`; `make audio` renders `sounds.json` + all cries | `Makefile`, `infra/` |
| References | All three checked out (`pokemon-showdown` since M0; empty after a fresh clone? `git submodule update --init`) | `references/` |

---

## Decisions

| # | Decision | Why |
|---|---|---|
| D1 | **Showdown (`@pkmn/sim`, `gen4customgame`) resolves every turn** in `mic-battles`; we never reimplement damage, abilities or move effects. | Exact Gen 4 rules, already tested ([tech-stack.md](../tech-stack.md#mic-battles-node--showdown)). |
| D2 | **Stateless turns:** each battle is a Redis hash `battle:<id>` (`state`: Showdown's serialized battle with its PRNG, `turn`, `reply`: the last reply). Load → play → save with an atomic turn check (Lua) → reply. A turn already played returns the saved `reply`. | Any replica plays any turn; crashes resume; retries are safe. |
| D3 | **`mic-core` decides, `mic-battles` resolves.** `mic-core` builds both teams from its own data (party from PostgreSQL, NPC teams from its trainer table), validates choices it can (owns the bag), forwards them, and saves the outcome. `mic-battles` never touches PostgreSQL. | Same split as the rest of the game; one owner per piece of data. |
| D4 | **Compact events, not Showdown's text protocol, reach the client.** `mic-battles` translates the battle log into `BattleEvent`s (enums and numbers only). The client turns each event into FireRed's text, animation and sound. | Small payloads; the presentation stays replaceable ([Decoupled Presentation](../tech-stack.md#decoupled-presentation)). |
| D5 | **Hidden information stays hidden:** each side gets its own event stream. The player sees exact HP for their own Pokémon and the foe's HP only as FireRed's 48-pixel bar (`hp_bar`: 0-48). The foe's moves, item and ability show only when they're revealed. | Anti-cheat; PvP later needs it anyway. |
| D6 | **The AI lives in `mic-battles`** (`src/ai/`) as our own TypeScript. It scores moves by **FireRed's AI flags** (`data/battle_ai_scripts.s`: CHECK_BAD_MOVE, TRY_TO_FAINT, CHECK_VIABILITY, SETUP_FIRST_TURN, RISKY, PREFER_STRONGEST_MOVE, PREFER_BATON_PASS, HP_AWARE), plus FireRed's switching and item use (`src/battle_ai_switch_items.c`). The Gen 4 knowledge (abilities, physical/special split, Gen 4 move effects) is modelled on `pokeemerald-expansion`'s `src/battle_ai_*.c`. The AI reads Showdown's live battle objects and uses the battle's seeded PRNG. | "Original" behavior, adapted to Gen 4; deterministic, so replays and retries give the same choice. |
| D7 | **Data catalogs are converted once and committed**, like items and species: `move/v1/catalog.proto` (467 moves), `ability/v1/catalog.proto` (123 abilities), `pokemon/v1/nature.proto` + `stats.proto`, species battle facts and Gen 4 level-up learnsets in `species/v1/catalog.proto`, the move each TM/HM teaches in `item/v1/catalog.proto`. Rules from **Showdown's Gen 4 data in `@pkmn/sim`** (the version `mic-battles` plays with); constant names from FireRed (moves 1-354) and the expansion (moves 355-467, abilities); catch rate, base exp, EV yield, growth rate, gender ratio and friendship from both decompilations. Converted by `infra/battle/catalog.mjs` (also writes `mic-battles/src/engine/ids.ts`: Showdown IDs by our numbers). Numbers are the official games' (abilities too: FireRed's own numbering differs from Cacophony on). `Type` stays in `species/v1`; `LevelMove.move` is a move **number** (the move catalog imports species for `Type`, and buf forbids package cycles). | One source of truth for Go and TypeScript; mic-core needs stats, PP and learnsets without asking `mic-battles`. |
| D8 | **Names and descriptions belong to the art style:** `make text` writes `moves.json`, `abilities.json` (name + description) and `natures.json` by catalog number, and later the battle messages. FireRed's text for what it has (moves 1-354, its 76 abilities by constant, natures, its `battle_message.c` strings); `pokeemerald-expansion`'s for Gen 4 (moves 355-467, abilities from Tangled Feet on, Gen 4 messages), uppercased (≤12 characters), POKéMON and stats in capitals, reflowed to FireRed's widths (moves: 4 lines; abilities: 1 line; `infra/text/reflow.mjs`). Encoded with FireRed's charmap, never committed. | Same rule as species text ([tech-stack.md](../tech-stack.md#firered-as-reference)). |
| D9 | **Battle animations are data plus our own behaviors.** Each move's animation script is converted once into JSON: commands, delays, sounds, which sprite templates, and arguments. Moves 1-354 come from FireRed's `data/battle_anim_scripts.s`, moves 355-467 from the expansion's `gBattleAnimMove_*`. The JSON is committed under `spa-pokeuniverse/src/game/firered/battle/anims/` and becomes our source. The sprite callbacks and tasks the scripts name are **written from zero** in TypeScript, as a library of behaviors. A move whose behaviors aren't written yet plays a **generic animation by type and category**, so every move animates from day one. | Scripts are data, like maps and the item table. The C behind them is code, so it's rebuilt. The fallback keeps the game complete while fidelity grows. **⚠ Confirm with the user before M8** (it extends the "converted once" exception in AGENTS.md). |
| D10 | **FireRed's battle look (Gen 3 style), with Gen 4 info where FireRed has no slot for it:** the physical/special/status category icon (the expansion's `graphics/interface/category_icons.png`) on the move menu's info and the summary's move page. Abilities show in the summary as in FireRed. Gen 4 abilities announce themselves with Gen 3-style messages. | Vision: Gen 3 graphics, Gen 4 mechanics. |
| D11 | **Singles first.** Doubles (FireRed's double trainer battles, Gen 4 double rules) come after the core is done (M13). | Smallest working battle first; the contracts already carry a slot per position. |
| D12 | **Bag items in battle** are applied by `mic-battles` through a custom Showdown action: a hidden internal move or a queued action in our own mod of `gen4customgame`, acting before moves as in Gen 4. `mic-core` checks and spends the item first. Pick the exact hook in M4 and write it here. | Showdown has no player bag. Keeping the effect inside the battle keeps its order and log correct. |
| D13 | **Test content is marked as such:** the starting test team and the room's test trainer are data in `mic-core` (`internal/battle/testdata.go` or similar) and the map, each with a `// Test content (plans/battles.md): removed in Phase 5` comment. In Phase 5 the starter replaces the team and the NPC leaves the room. | The user asked for them to test battles now. They must not leak into the real game. |
| D14 | **The party is permanent data in PostgreSQL** (`trainer_pokemon`), saved in one transaction per change. Battle damage, PP and status stay after a battle (FireRed), saved with the outcome. During a battle, its live state is Redis only. | [Saving State](../tech-stack.md#saving-state-resilience). |
| D15 | **Faint cries are rendered** with FireRed's faint cry mode, once per species, as `cry_<nnn>_faint`, like the cries. Not a Web Audio pitch trick. | Sounds exactly like the game. |
| D16 | **The party's contracts are their own package, `pokeuniverse.party.v1`** (`Pokemon`, `Party`, intents, `PartyChanged`); `pokemon/v1` keeps what needs no catalog (`Gender`, `Status`, stats, natures). The client's `Pokemon` carries what the summary shows (stats, exp bounds, ability, nature, gender, shiny, ID No.), never IVs, EVs or friendship. Held-item rules live in `internal/item` (`Hold`, `TakeHeld`: given what the Pokémon holds, they return what it holds after) and answer with `ItemResult`. | `party.v1` uses the species, move and item catalogs, and `species/v1` imports `pokemon/v1`: buf forbids the package cycle. Item rules stay with items; `item` never depends on `pokemon`. |

### Open Questions (ask the user when the milestone comes)

- D9 conversion of animation scripts as data (before M8).
- Should the test NPC heal both teams before each battle? Proposed: **yes**, it asks "Want to battle?" (YES/NO), heals everyone, and the battle starts. Losing whites out as FireRed does: "<PLAYER> is out of usable POKéMON!", money lost, back to the room with a healed team (Mom's spot comes in Phase 5).
- Battle style SHIFT: Showdown has no "Will you switch?" prompt after a foe faints. Proposed: emulate it in `mic-battles` (M13); until then the game behaves like SET.

---

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
5. **Resume:** on reconnect or after a crash, `EnterWorld`'s snapshot carries `battle` (a `BattleView`: both sides' active Pokémon and party summaries, field state and the pending request), and the client redraws the battle screen. If `mic-battles` restarted, the next `battles.turn` loads from Redis.

### Contracts (to write in M4; field lists are the minimum)

- ✅ (M2, D16) `pokeuniverse.party.v1` (`party.proto`): `Pokemon`, `Party` (in `WorldSnapshot`), `SwapPartySlots`, `GivePartyItem`, `TakePartyItem`, `PartyChanged`; `pokemon/v1/pokemon.proto`: `Gender`, `Status`; `ItemOutcome` GIVEN, SWAPPED, TAKEN, NOT_HOLDING, REMOVE_MAIL.
- `pokeuniverse.battle.v1`:
  - NATS: `StartBattle{battle_id, kind, sides[{side, trainer (class, name text id), team[BattleMon full: species, level, nature, ability, item, ivs, evs, moves+pp, hp, status, gender, shiny, personality]}, ai_flags], seed}`; `StartReply`; `TurnRequest{battle_id, turn, choices[{side, action}]}`; `TurnReply{battle_id, turn, per_side[{events, request}], outcome?}`; `Forfeit{battle_id, side}`.
  - Client (in the realtime envelope): `BattleStarted{view, events, request}`, `BattleTurn{turn, events, request}`, `BattleEnded{outcome view}`; intent `BattleChoice{battle_id, turn, oneof action{move{slot (1-4), target}, switch{party_slot}, item{item, party_slot, move_slot}, run}}`.
  - `BattleEvent` oneof (singles first; every event has `side` and `slot` where relevant): `SendOut`, `Withdraw`, `MoveUsed{move, target, miss?}`, `Damage{hp | hp_bar, from (move, status, weather, item, ability, recoil, hazard…)}`, `Heal`, `Faint`, `Effectiveness{super, not_very, immune}`, `Critical`, `Status{status}`, `CureStatus`, `StatChange{stat, stages}`, `Volatile{kind, start/end}` (confusion, substitute, leech seed, …), `Weather{kind, start/upkeep/end}`, `SideCondition{kind, start/end}` (Stealth Rock, Spikes, Toxic Spikes, Reflect, Light Screen, Tailwind, Safeguard, Mist, Lucky Chant), `FieldCondition` (Trick Room, Gravity), `AbilityShown{ability}`, `ItemShown{item, consumed?}`, `Cant{reason}`, `Fail`, `Message{id, args}` (rare one-off texts by ID), `Exp{party_slot, gained}`, `LevelUp{party_slot, level, stats}`, `Money{amount}`, `TurnStart{turn}`.
- Every event maps to one **text template** (FireRed's `gBattleStringsTable` / expansion's Gen 4 strings), one **animation** (move, general or status anim) and **sounds**. The table lives in the client (`firered/battle/event-presentation.ts`), keyed by enums, never sent.

### Code Layout (new)

| Path | Owns |
|---|---|
| `mic-battles/src/engine/` | Create a battle from `StartBattle`, serialize/deserialize, apply choices, our `gen4customgame` mod (D12) |
| `mic-battles/src/protocol/` | Showdown log lines → `BattleEvent` per side (D4, D5); requests → `BattleRequest` |
| `mic-battles/src/ai/` | Move scoring per flag, switching, item use (D6); one file per flag |
| `mic-battles/src/store.ts` | Redis `battle:<id>` with the turn check (Lua) |
| `mic-battles/src/exp.ts` | Gen 4 experience (not in Showdown) |
| `mic-core/internal/pokemon/` | Stats (Gen 4 formula), natures, IVs/EVs, gender, shiny, growth rates, default moves, the party and its store (sqlc), the test team; party intents run in `internal/world/party.go` |
| `mic-core/internal/battle/` | Starting battles, a player's active battle (Redis `player:<id>:battle`), choices, outcome transaction, NPC trainer table, whiteout |
| `spa-pokeuniverse/src/game/battle/` | Battle state for any art style: applies events, holds the request (like `world/`) |
| `spa-pokeuniverse/src/game/firered/battle/` | The FireRed battle screen: transition, terrain, intro, healthboxes, menus, messages, sprites, `anims/` (engine, behaviors, converted scripts) |
| `spa-pokeuniverse/src/game/firered/party-menu.ts`, `summary.ts` | POKéMON from the START menu and in battle |
| `infra/battle/` | `catalog.mjs` (moves, abilities, species battle facts, learnsets; once), `anims.mjs` (animation scripts → JSON; once) |

---

## Milestones

Order = dependencies. M7 can start once M4's contracts exist (with fake events), in parallel with M5/M6.

### M0 Prerequisites ✅

- [x] `git submodule update --init references/pokemon-showdown` (read-only reference for edge cases).
- [x] No open question blocks M1-M7 (D9 is asked before M8).
- **Done when:** the Showdown reference reads.

### M1 Data Catalogs ✅

**Read (only to change them):** `infra/battle/catalog.mjs` (run once, kept for reference), `infra/text/extract.mjs`, `infra/pokemon/{sources,build}.mjs`.

- [x] `infra/battle/catalog.mjs` (Node in Docker with `@pkmn/sim` 0.10.11, command in its header): wrote the catalogs below and `ids.ts`. Re-running it needs the species catalog as it was before (it reads `type1…weight` lines); edit the catalogs by hand from now on.
- [x] `move/v1/catalog.proto`: `Move` 1-467 (FireRed's names: `MOVE_VICE_GRIP`, `MOVE_FAINT_ATTACK`, `MOVE_HI_JUMP_KICK`, `MOVE_SMELLING_SALT`), `MoveInfo{type, category, power (0 = varies or none), accuracy (0 = never misses), pp, priority, target, flags (36 `MoveFlag`s), effect_chance, crit_stage}`; extension number 50002.
- [x] `ability/v1/catalog.proto`: `Ability` 1-123, no options.
- [x] `pokemon/v1/stats.proto` (`Stat`, `Stats` in FireRed's order HP, ATK, DEF, SPEED, SPATK, SPDEF) and `nature.proto` (`Nature` = FireRed's `NATURE_` + 1, `NatureInfo{raised, lowered}` option `info` 50003; neutral natures have none).
- [x] `SpeciesInfo` 5-13: `base_stats`, `abilities`, `gender_ratio` (FireRed's byte), `growth_rate` (`GrowthRate` = FireRed's `GROWTH_` + 1), `catch_rate`, `base_exp`, `ev_yield`, `base_friendship`, `level_moves[{level, move number}]` (Showdown's `4L` entries; a move at two levels keeps both; sorted by level then move).
- [x] `ItemInfo.move` (8): the move each TM/HM teaches. The TM CASE and the item PC now read type, power, accuracy and PP from the move catalog (Gen 4 values) and the name from `moves.json`; `tm-moves.json` is gone.
- [x] `mic-battles/src/engine/ids.ts`: `SPECIES`, `MOVES`, `ABILITIES`, `NATURES` (index = our number) and `ITEMS` (our item ID → Showdown ID, 106 of FireRed's items; the rest have no battle effect).
- [x] `make text`: `moves.json`, `abilities.json`, `natures.json` (D8); `make text` now also needs the expansion and reads the protos.
- [x] `make pokemon`: `<nnn>/back.png`, `<nnn>/shiny.pal`, and `coords: [front y offset, back y offset, enemy elevation]` per species in `species.json` (FireRed's tables for 1-386, the expansion's fields for 387-493). The Pokédex text is byte-for-byte unchanged.
- [x] Client readers: `world/moves.ts` (`moveInfo`, `tmMove`); `Assets.moveName/moveDescription` (moves.json loads with the New Game set). Abilities and natures text load with M3's screens.
- [x] `make contracts` and `make breaking` pass; `mic-core`, `tool-maps` and the SPA build.
- **Done when:** Go and TypeScript read any move, ability and species battle fact by enum; all names and descriptions encode. ✅

### M2 Pokémon and the Party in `mic-core` ✅

**Read (only to change them):** `mic-core/internal/pokemon/*`, `internal/item/held.go`, `internal/world/{party,save}.go`, `migrations/00012_create_trainer_pokemon.sql`, `lib-contracts/proto/pokeuniverse/party/v1/party.proto`, `spa-pokeuniverse/src/game/world/party.ts`.

- [x] `internal/pokemon`: Gen 4 stat formula (SHEDINJA's 1 HP), natures, IVs/EVs, personality → gender, nature (`personality % 25`), shiny (with the OT's ID) and ability slot (lowest bit), the six growth rates (level ↔ exp; Gen 4's 0 exp at Lv 1, FireRed's table says 1), default moves (the level-up moves in order, the oldest pushed out past four), max PP with PP UPs.
- [x] Migration `00012` `trainer_pokemon` (slot 0-5, species, nickname (empty: the species' name), level, exp, personality, IVs/EVs as 6-element arrays, ability slot, held item, moves + PP + PP UPs as parallel arrays, HP, status, friendship, ball, OT name/ID/gender, met level/map (empty: fateful encounter)). New Game empties it in its transaction. Every party change rewrites the party (≤6 rows) after `LockTrainerSave` (the trainer's row, only for the current save).
- [x] **Test team (D13, `internal/pokemon/testteam.go`):** given by `Join` in one transaction when the trainer has none; Lv 50, natures and EV spreads per set, IVs and personalities from the trainer ID (the same team for two joins at once), OT = the trainer, POKé BALL, fateful encounter. CHARIZARD (Flamethrower, Air Slash, Dragon Pulse, Roost), PIKACHU @ LIGHT BALL (Thunderbolt, Quick Attack, Iron Tail, Thunder Wave), GARCHOMP (Earthquake, Dragon Claw, Stealth Rock, Swords Dance), LUCARIO (Aura Sphere, Close Combat, **Bullet Punch** (Riolu egg move; Extreme Speed is Lv 51), Swords Dance), GARDEVOIR (Psychic, Shadow Ball, Calm Mind, Thunderbolt), SNORLAX @ LEFTOVERS (Body Slam, Earthquake, Rest, Curse (egg)). All checked against Showdown's Gen 4 learnsets.
- [x] `Party` in `WorldSnapshot`. Intents `SwapPartySlots` (predicted; refused → `PartyChanged`), `GivePartyItem` (bag or PC; switching sends the held one to the bag; MAIL must be taken first; a full bag changes nothing) and `TakePartyItem`, answered with `PartyChanged`/`BagChanged`/`PcChanged` then `ItemResult`, saved with the bag in one transaction before answering. Bag and PC GIVE now answer PARTY_MENU when there's a party.
- [x] The START menu's POKéMON entry shows when the snapshot's party isn't empty (until story flags, Phase 5); choosing it does nothing until M3.
- **Done when:** a reload shows the same team with the same stats; swapping and held items persist. Server and client build; not run in the game yet (swapping and GIVE/TAKE have no screen until M3).

### M3 Party Screen and Summary ✅

**Read:** `firered/start-menu.ts`, `firered/bag.ts` (structure only), `firered/overworld.ts` (`runMenu`, `openScreen`), `references/pokefirered/src/party_menu.c`, `src/pokemon_summary_screen.c` (behavior only).

Done (2026-11-01, not run in the game):
- [x] `make graphics`: `party_menu/`, `summary_screen/` (FIRERED_GFX), `interface/status_icons.png`, the 12 `interface/ball/*.png`; new `EXPANSION_GFX_FILES` copies the expansion's `interface/category_icons.png` to `graphics/expansion/` (`graphics` now needs the expansion).
- [x] `make pokemon`: `noFlip: true` in `species.json` for species whose summary picture isn't mirrored (`infra/pokemon/sources.mjs` + `build.mjs`).
- [x] `make text`: 42 party/summary strings added to `texts.json` (ChoosePokemon…, PokeSum_*, DexNoUnknown).
- [x] Contracts: `party.v1.SwapPokemonMoves{slot, from, to}` (realtime client field 20) for the summary's move SWITCH; `mic-core`: `pokemon.Party.SwapMoves`, `world.Player.SwapPokemonMoves` (via `partyChange`), `realtime.go` case; `link.swapPokemonMoves`; `PartyState.swapMoves`. `go build`, `make contracts`, `make breaking` pass.
- [x] Client shared: `manifest.ts` (PARTY_GRAPHICS set, `loadParty()` with species/abilities/natures text, species text shared with the Pokédex, `abilityName/Description`, `natureName`, `BALL_ICONS`, `bytes` graphics, `PokemonArt.shinyPalette`); `gba/text.ts` `expandDynamic` ({DYNAMIC n}); `gba/sound.ts` `stop(player)`; `gba/assets.ts` exports `fetchBytes`; `firered/hp-bar.ts` (GetHPBarLevel), `firered/menu-info.ts` (type icons; TM CASE and Pokédex pages now use it), `firered/mon-icon.ts` (icon frames by HP, UpdateMonIconFrame timing).
- [x] `firered/party-menu.ts`: single layout, boxes (palettes per selection/faint/switch, HP bar, gender, level, held item/status/ball sprites, bouncing icon), cursor (incl. LEFT/RIGHT memory, L/R in LR mode), CANCEL, std messages; field mode: SUMMARY, SWITCH (slide out/in, sprites swapped, `host.swap`), ITEM → GIVE (bag in `BagLocation.Party`, back with item: give or "already holding… switch?" YES/NO) / TAKE / CANCEL; give mode (`{kind:"give", item, pc}`) from BAG, TM CASE, BERRY POUCH, PC WITHDRAW; FireRed messages for GIVEN/SWAPPED/TAKEN/NOT_HOLDING/BAG_FULL/REMOVE_MAIL. `PartyHost` (party, playerName, gender, nationalDex, bag, give, take, swap, swapMoves).
- [x] `firered/summary.ts`: INFO, SKILLS, KNOWN MOVES and move details, page flips replicating FireRed's BG1/BG2 slide + priority swaps + HP/EXP bar sprites, WIN1 sprite clipping, picture bounce by HP (mirrored unless `noFlip`, shiny palette), ball, shiny star, status icon, trainer memo (nature, fateful encounter / met / apparently met; met map names use "Somewhere" until Phase 9), UP/DOWN other Pokémon with cry, move details: power, accuracy, description, cursors, SWITCH moves, Gen 4 category icon sprite at (104, 70) (D10).
- [x] `bag.ts`: `BagLocation.Party` (pockets switch, A chooses; TM CASE/BERRY POUCH open in pick mode; important/key items "can't be held"); GIVE answered PARTY_MENU → party menu → bag again; `BagExit` adds `{chosen}`. `tm-case.ts`, `berry-pouch.ts`: `pick` mode and GIVE → party menu → reopen. `item-pc.ts`: GIVE fades out to the party menu (pc: true) and back at the same position (fade, no turn-on). `overworld.ts`: START POKéMON opens the party menu; `partyHost()`; bag/PC hosts carry `party`.
- [x] `tsc --noEmit` passes; `vite build` passes (run in Docker: host `node_modules` are Linux's).

- [x] Docs: `tech-stack.md`, `phase-4-players-room.md` (POKéMON ✅), `AGENTS.md`, this file's "Where the Project Stands".
- [x] Review pass of `party-menu.ts` and `summary.ts`: behavior checked against the references; the HP/EXP bars can't loop on a 0 max; `shownGender` shared by both screens.
- Not checked in the game (manual tests only when the user asks): the category icon's spot, the page-flip layering, the switch slide.
- Out of M3 scope (kept as-is): USE of items on Pokémon (PARTY_MENU from USE still returns to the list), TM teaching, field moves, MAIL (READ/TAKE; mail is held like an item), eggs, Pokérus, markings, battle mode (M7).
- **Done when:** POKéMON in the START menu works like FireRed for the test team, on desktop and mobile.

### M4 Battle Engine in `mic-battles` ⬜

**Read:** `mic-battles/src/*`, `lib-contracts/proto/pokeuniverse/battle/v1/battle.proto`, `compose.yaml` (redis, mic-battles), `infra/` Redis ACL setup, `@pkmn/sim`'s `Battle` / `State` (serialize) and the request JSON.

- [ ] Contracts from [Contracts](#contracts-to-write-in-m4-field-lists-are-the-minimum) (NATS and realtime); `make generate`.
- [ ] Redis user `mic-battles` limited to `battle:*` (compose, `.env.example`), and a Redis client in `mic-battles` (`redis` npm).
- [ ] `engine/`: create from `StartBattle` (teams from our enums via `ids.ts`, the seed), serialize with Showdown's own state serializer, play a turn from choices, and our `gen4customgame` mod for bag items (D12, write the chosen hook here).
- [ ] `protocol/`: Showdown log (with `|split|` per side) → `BattleEvent`s per side (D5); `|request|` → `BattleRequest` (moves with PP and disabled flags, trapped, force switch, can't-run).
- [ ] `store.ts`: Lua compare-and-set on `turn`; return the saved reply for a repeated turn.
- [ ] Handlers `battles.start`, `battles.turn`, `battles.forfeit`; the outcome when the battle ends; `exp.ts` (Gen 4: `floor(base_exp × level_fainted / 7)` × 1.5 trainer, split between participants; Exp. Share later).
- [ ] Temporary: a random AI for the NPC side until M5.
- **Done when:** a scripted NATS client (one-off, not committed) plays a whole battle, and replaying a turn returns the same reply.

### M5 NPC Battle AI ⬜

**Read:** `references/pokefirered/data/battle_ai_scripts.s` (per flag), `src/battle_ai_script_commands.c` (scoring rules), `src/battle_ai_switch_items.c` (switch and items), `references/pokeemerald-expansion/src/battle_ai_main.c`, `battle_ai_util.c`, `battle_ai_switch.c` (Gen 4 knowledge). Behavior only, never code.

- [ ] `ai/score.ts`: every usable move starts at 100. Each flag in order adjusts it, and the best score wins; ties are picked at random with the battle's PRNG.
- [ ] Flags: `check-bad-move.ts` (immunities including Gen 4 abilities: Levitate, Flash Fire, Water/Volt Absorb, Motor Drive, Dry Skin, Wonder Guard, Soundproof; useless status and stat moves; already-set hazards and screens), `try-to-faint.ts` (KO with Showdown's damage calc, priority to finish), `check-viability.ts` (effect-by-effect, Gen 4 effects: Stealth Rock, Toxic Spikes, Trick Room, Tailwind, U-turn, Roost, …), `setup-first-turn.ts`, `risky.ts`, `prefer-strongest-move.ts`, `prefer-baton-pass.ts`, `hp-aware.ts`.
- [ ] `ai/switch.ts`: FireRed's ShouldSwitch reasons (Perish Song, Wonder Guard, an absorbing ability on the bench, Natural Cure, super-effective threat, nothing useful left), plus FireRed's choice of the replacement after a faint.
- [ ] `ai/items.ts`: trainer items (up to 4, FireRed rules: Full Restore / potions at low HP, status heals, X items, Guard Spec.), shown as "<TRAINER> used <ITEM>!".
- [ ] Wild Pokémon: random usable move (FireRed's wild battles have no flags); Phase 9 uses it.
- [ ] AI flags per trainer come from `mic-core`'s trainer table (D3).
- **Done when:** the test trainer avoids immune targets, takes KOs, sets up sensibly and switches out of bad matchups.

### M6 Battles in `mic-core` and the Room Trainer ⬜

**Read:** `internal/world/{zone,player,interact}.go`, `internal/realtime/realtime.go`, `internal/battles/battles.go`, `internal/live/live.go`, `lib-maps/maps/pallet_town_players_house_2f.yaml`, `docs/maps.md` (objects), `tool-maps` compile for objects.

- [ ] NPCs in maps: compile `npc` objects into `ClientMap`/`ServerMap`; NPCs block movement (server `rules.go` and client `rules.ts`); A on an NPC runs its script (before signs, as FireRed); the NPC turns to face the player.
- [ ] Client: NPC sprites in the overworld (`world/scene.ts`, `firered/` object event art: `cooltrainer_m.png` + palette), standing and facing.
- [ ] Room: `- { type: npc, id: test_trainer, at: [9, 4], sprite: cooltrainer_m, movement: face_down, script: test_trainer }` (D13). Validate, compile and preview it.
- [ ] Script steps: `YesNo` and `StartBattle{trainer}` (the zone asks `internal/battle` to start one, and the script continues after the battle).
- [ ] `internal/battle`: the trainer table (`test_trainer`: COOLTRAINER class, name, intro, defeat and victory texts, money ×, AI flags = gym-leader set, team Lv 50: GENGAR (Shadow Ball, Sludge Bomb, Hypnosis, Destiny Bond), GYARADOS (Waterfall, Dragon Dance, Ice Fang, Earthquake), SCIZOR (Bullet Punch, X-Scissor, Swords Dance, Roost), TYRANITAR (Stone Edge, Crunch, Earthquake, Fire Blast), TOGEKISS (Air Slash, Aura Sphere, Thunder Wave, Roost), INFERNAPE (Close Combat, Fire Punch, Mach Punch, U-turn; Flare Blitz is Lv 57), checked against learnsets, items: 2 HYPER POTION).
- [ ] Active battle per player in Redis (`player:<id>:battle`); `BattleChoice` handling (turn check, item ownership; a bag item is spent in PostgreSQL once `mic-battles` confirms the turn, before the turn is shown); retries to `mic-battles` with the same turn.
- [ ] Outcome transaction keyed by battle ID: party HP/PP/status/exp/level/stats, money won or lost (FireRed's whiteout amount), `battle_outcomes` row. Whiteout: healed party, back in the room.
- [ ] The snapshot's `battle` for resume; the zone blocks moves and interactions while in battle.
- **Done when:** talking to the test trainer starts a battle that plays to the end, and killing `mic-core` or `mic-battles` mid-battle resumes at the last turn.

### M7 The Battle Screen (FireRed, without move animations) ⬜

**Read:** `game/gba/{video,sprites,palette,tasks,text}.ts` (APIs), `firered/overworld.ts` (`openScreen`), `firered/bag.ts` (modes), `firered/manifest.ts` (sets), and FireRed's `src/battle_transition.c`, `battle_intro.c`, `battle_bg.c`, `battle_interface.c`, `battle_controller_player.c`, `battle_controller_opponent.c`, `battle_message.c`, `battle_gfx_sfx_util.c` (behavior only).

- [ ] Battle asset set in the manifest, loaded when the first battle starts: `battle_interface/`, `battle_terrain/` (building for the house), `battle_transitions/`, `trainers/front_pics` (cool_trainer_m) and `back_pics` (red/leaf with throw frames), balls, `battle_anims/` (for M8). Species front/back loaded per battle.
- [ ] `game/battle/state.ts`: the art-free model; applies `BattleEvent`s, holds the request, replays a `BattleView` on resume.
- [ ] Transition (the trainer's), terrain and intro: the bases slide in, trainer pics, "<CLASS> <NAME> would like to battle!", the trainer slides out, the ball throw and send-out (`se_ball_open`, cry), the player's back pic throwing, healthboxes sliding in.
- [ ] Healthboxes: name, gender, level, status icon, HP bar draining by pixel with colors, exact HP numbers for the player, exp bar; the foe's party balls (`party_summary_bar`) at the start.
- [ ] Action menu FIGHT / BAG / POKéMON / RUN ("What will <MON> do?"); move menu with PP, TYPE and the category icon (D10); disabled or 0-PP moves refused with FireRed's text.
- [ ] Event playback queue: each event → text (text speed option) + sound + general animation (hit flash or shake, faint slide with the faint cry, stat arrows, status), effectiveness sounds (`se_effective`, `se_super_effective`, `se_not_effective`).
- [ ] Battle party screen (M3 in battle mode: SHIFT, SUMMARY, CANCEL; forced switch); BAG in battle mode (BATTLE-usable items, `UseItem` → `BattleChoice.item`); RUN: "No! There's no running from a TRAINER battle!".
- [ ] End: the foe trainer slides back in with the defeat text, `mus_victory_trainer`, "<PLAYER> got ¥X for winning!", fade to the room. Whiteout text and fade.
- [ ] Music: `mus_encounter_*` when the trainer talks, `mus_vs_trainer`, `mus_victory_trainer`; new entries in `sounds.json` (+ `make audio`), faint cries (D15).
- [ ] Mobile: same GBA screen, touch controls (existing A/B/D-pad).
- **Done when:** the whole test battle is playable and readable, with placeholder hits instead of move animations.

### M8 Animation Engine and Generic Animations ⬜

**Needs:** D9 confirmed. **Read:** FireRed's `src/battle_anim.c` (script commands), `battle_anim_mons.c`, `battle_anim_utility_funcs.c`, `battle_anim_mon_movement.c`, `battle_anim_status_effects.c`, `battle_anim_effects_*.c`, `data/battle_anim_scripts.s` (the general and status anims).

- [ ] `infra/battle/anims.mjs`: converts each move's and each general, status and special animation's script into JSON (commands, args, sprite templates by name, sounds, pans). Moves 1-354 from FireRed, 355-467 from the expansion. Committed to `firered/battle/anims/`. The art they use goes into `make graphics` (FireRed's and the expansion's `battle_anims/` sprites and backgrounds, gitignored).
- [ ] `firered/battle/anims/engine.ts`: the script interpreter: createsprite, createvisualtask, delay, waitforvisualfinish, playsewithpan and pan helpers, monbg/clearmonbg, setalpha/blendoff, fadetobg/restorebg, loopsewithpan, jumps, calls and returns.
- [ ] Behaviors library (`anims/behaviors/*.ts`, by family): mon movement (shake, slide, jump), blend and flash, sprite travel (linear, arc, orbit, homing), particles, background scroll.
- [ ] Generic fallback per type × category (D9); general animations: status (poison, burn, paralysis, sleep, confusion, infatuation), stat up/down, weather, substitute, ball throw, held items, Leftovers, hazards.
- [ ] BATTLE SCENE OFF skips move animations (the trainer's option).
- **Done when:** every move animates (exact or fallback), and status and weather show.

### M9 FireRed Move Animations (1-354) ⬜

- [ ] Write the behaviors the converted scripts need, family by family: Normal, Fighting, Flying, Poison, Ground, Rock, Bug, Ghost, Steel, Fire, Water, Grass, Electric, Psychic, Ice, Dragon, Dark. Tick each family. Track the moves still on the fallback here: _list_.
- **Done when:** moves 1-354 match FireRed side by side (`make emulator`, spot checks).

### M10 Gen 4 Move Animations (355-467) ⬜

- [ ] The expansion's behaviors for Gen 4 moves (from `src/battle_anim_new.c` and related, behavior only), plus their art and any sounds FireRed lacks (render from the expansion's sound or map them to the closest FireRed one; record which).
- [ ] The test teams' Gen 4 moves first: Air Slash, Dragon Pulse, Roost, Stealth Rock, Aura Sphere, Close Combat, Bullet Punch, X-Scissor, Stone Edge, Ice Fang, U-turn.
- **Done when:** moves 355-467 animate in Gen 3 style.

### M11 Experience, Level Up, Moves and Evolution ⬜

**Read:** FireRed's `src/battle_script_commands.c` (exp, level up), `evolution_scene.c` (behavior).

- [ ] The exp bar filling, `mus_level_up` / level-up fanfare, the level-up stats window (deltas, then totals), "<MON> grew to Lv. X!".
- [ ] Learning a level-up move (FireRed's "wants to learn" flow, forgetting a move with the summary's move page); decided by `mic-core`.
- [ ] Evolution after battle by level (FireRed's evolution scene, `mus_evolution`, B cancels), saved by `mic-core`.
- [ ] Pokédex: the foe's Pokémon are registered as seen when sent out (`mic-core` with the outcome or per event, saved before shown).
- **Done when:** the test team can level up, learn moves and evolve. Test with a lower-level variant of the test NPC if needed.

### M12 Gen 4 Held Items and Bag Items in Battle ⬜

- [ ] Add the Gen 4 battle items FireRed lacks to `item/v1/catalog.proto` (Life Orb, Choice Scarf/Specs, Focus Sash, Expert Belt, Muscle Band, Wise Glasses, Black Sludge, Toxic/Flame Orb, Razor Claw/Fang, Gen 4 type plates, the Gen 4 berries, …), with icons from the expansion (`make graphics`) and names and descriptions (`make text`).
- [ ] Bag use in battle (D12): potions, status heals, X items, Guard Spec.; Poké Balls refused in trainer battles ("The TRAINER blocked the BALL!").
- [ ] Item messages and animations (held-item activation, berries, Leftovers).
- **Done when:** the test teams can hold Gen 4 items, and bag items work in battle.

### M13 Options, Doubles and Polish ⏸ (after M12)

- [ ] Battle style SHIFT (open question), Gen 4 double battles (FireRed's double healthboxes and target selection), multi-hit and two-turn move presentation, every Gen 4 field condition's text.
- [ ] Performance: battle asset sets cached by the service worker, art loaded per battle, no frame drops on mobile.

### M14 Phase 4 Battle Check ⬜

Manual, only when the user asks: start a battle on desktop and mobile; play to win and to lose; use a potion; switch; let a Pokémon faint; reload mid-battle; restart `mic-core` and `mic-battles` mid-battle; check the party after the battle.

---

## Reference Map (behavior only, never copy code)

| Need | Where |
|---|---|
| Battle flow, turn order, scripts | `pokefirered/src/battle_main.c`, `battle_script_commands.c`, `data/battle_scripts_1.s` |
| Player and foe controllers (what the screen does per event) | `pokefirered/src/battle_controller_player.c`, `battle_controller_opponent.c` |
| Healthboxes, HP/exp bars | `pokefirered/src/battle_interface.c`, `graphics/battle_interface/` |
| Intro, terrain, transitions | `pokefirered/src/battle_intro.c`, `battle_bg.c`, `battle_transition.c`, `graphics/battle_terrain/`, `graphics/battle_transitions/` |
| Messages | `pokefirered/src/battle_message.c`; Gen 4: `pokeemerald-expansion/src/battle_message.c` |
| Animations | `pokefirered/data/battle_anim_scripts.s`, `src/battle_anim*.c`, `graphics/battle_anims/`; Gen 4: `pokeemerald-expansion/data/battle_anim_scripts.s` (`gBattleAnimMove_*`), `src/battle_anim_new.c` |
| AI | `pokefirered/data/battle_ai_scripts.s`, `src/battle_ai_script_commands.c`, `src/battle_ai_switch_items.c`; Gen 4: `pokeemerald-expansion/src/battle_ai_*.c`, `include/constants/battle_ai.h` |
| Party, summary | `pokefirered/src/party_menu.c`, `pokemon_summary_screen.c`, `graphics/party_menu/`, `graphics/summary_screen/` |
| Exp, level up, evolution | `pokefirered/src/battle_script_commands.c` (getexp), `pokemon.c`, `evolution_scene.c` |
| Trainers (classes, pics, AI flags, money) | `pokefirered/src/data/trainers.h`, `trainer_parties.h`, `graphics/trainers/` |
| Gen 4 rules and edge cases | `pokemon-showdown/data/mods/gen4/`, `sim/` (init the submodule first) |
| Gen 4 art for 387-493 | `pokeemerald-expansion/graphics/pokemon/<name>/` (`anim_front.png`, `back.png`, `normal.pal`, `shiny.pal`) |

---

## Log

| Date | Session | Done | Next | Notes |
|---|---|---|---|---|
| 2026-11-01 | Plan | This plan; battles moved into Phase 4 | M0, then M1 | |
| 2026-11-01 | M0 + M1 | Showdown reference; move, ability, nature, stats catalogs; species battle facts and learnsets; TM moves in the item catalog; `ids.ts`; move/ability/nature text; back pics, shiny palettes, battle coords | M2 (Pokémon in `mic-core`), M3 can follow | `@pkmn/sim` isn't in the host's `node_modules` (mic-battles installs it in Docker); TM CASE now shows Gen 4 move data; nothing committed |
| 2026-11-01 | M2 | Party in `mic-core` (stats, growth, personality, store, test team), `party/v1` contracts, SWITCH and held items, snapshot party, POKéMON in the START menu | M3 (party screen and summary) | Party contracts moved to `party.v1` (D16); Lucario's Extreme Speed → Bullet Punch, the M6 Infernape's Flare Blitz → Fire Punch (both illegal at Lv 50); with the test team, USE of party items and GIVE now answer PARTY_MENU and the client goes back to the list until M3; nothing run in the game |
| 2026-11-01 | M3 | Party menu, summary, bag/TM CASE/BERRY POUCH/PC GIVE → party menu, `SwapPokemonMoves`, assets (party/summary graphics, category icons, `noFlip`, texts) | M4 (battle engine in `mic-battles`) | Builds pass (tsc, vite in Docker, go, buf breaking); not run in the game (category icon spot, page-flip layering, switch slide unchecked) |
