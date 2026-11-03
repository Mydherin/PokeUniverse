# Plan: Gen 4 Battles

The whole battle system: Pokémon data, party, battle engine, NPC AI, battle screen, sprites, animations and sounds, tracked across chats.

- **Status:** 🚧 In progress, part of [Phase 4](../../phases/phase-4-players-room.md) (moved there from Phases 8 and 9 by the user, 2026-11-01).
- **Goal:** in the player's room, the trainer has a team of six (POKéMON in the START menu, party screen and summary). A trainer NPC stands in the room, and talking to them starts a **FireRed-style trainer battle with Gen 4 rules**: FireRed's screen, sprites, animations, sounds and texts, resolved by Showdown in `mic-battles`, with a FireRed-style AI adapted to Gen 4.
- **Stays in later phases:** wild encounters and catching ([Phase 9](../../phases/phase-9-battles.md)), the rival battle in Oak's lab (Phase 9), following Pokémon and Bill's PC boxes ([Phase 8](../../phases/phase-8-pokemon-party.md)), PvP ([Phase 11](../../phases/phase-11-social.md)).

## Resume Here

- **Next:** commit M10 when the user asks, then [M11](m11-exp-level-up-evolution.md).
- **Last state:** M10 ✅, swept in the game (still frames, no sound or real turns), uncommitted. M6 still lacks the restart-resume check.

## Cold Start (every new session)

1. Read [AGENTS.md](../../../AGENTS.md), this file, [context.md](context.md) and the current milestone's file (**Resume Here**). Nothing else up front.
2. **Trust them.** Don't re-check ✅ items, the status or the context in the code. Open another file only when the milestone file doesn't give enough to do the step at hand, and then only that file (the milestone's **Read** line first; [references.md](references.md) for the decompilations; a finished milestone's file for what it built).
3. Follow the [Decisions](context.md#decisions); don't reopen one without the user. A new decision goes into that table with a short "Why".
4. **At the end of a session, and before the user compacts the context:** in the milestone file, tick the tasks and fill **Progress** (exact next step, files touched, build state, gotchas); then update **Resume Here**, the milestone's status below and the [Log](#log); then the docs the work changed (tech-stack.md, the phase-4 doc, audio.md…). Keep every file **concise**: replace stale text, don't pile it up. When a milestone is ✅, cut its file down to what later milestones use.
5. **Testing:** no automated tests ([AGENTS.md](../../../AGENTS.md#testing)); run the game only when the user asks.

## Milestones

Order = dependencies. M7 can start once M4's contracts exist (with fake events), in parallel with M5/M6. Marks: ⬜ not started · 🚧 in progress · ✅ done · ⏸ deferred.

| # | Milestone | Status | In short |
|---|---|---|---|
| M0 + M1 | [Data catalogs](m01-data-catalogs.md) | ✅ | Showdown reference; move, ability, nature, stats catalogs; species battle data and learnsets; TM moves; `ids.ts`; texts; back/shiny art |
| M2 | [Pokémon and the party in `mic-core`](m02-party.md) | ✅ | Gen 4 stats, growth, personality, `trainer_pokemon`, test team, SWITCH and held items, `party.v1` |
| M3 | [Party screen and summary](m03-party-screen.md) | ✅ | FireRed's party menu and summary, GIVE from bag/TM CASE/BERRY POUCH/PC, move SWITCH |
| M4 | [Battle engine in `mic-battles`](m04-battle-engine.md) | ✅ | Contracts, Redis store with step check, Showdown wrapper, log → events per side, handlers, Gen 4 exp, random AI |
| M5 | [NPC battle AI](m05-npc-ai.md) | ✅ | FireRed's AI flags with Gen 4 knowledge, switching, trainer items |
| M6 | [Battles in `mic-core` and the room trainer](m06-mic-core-battles.md) | 🚧 | NPCs in maps, the test trainer, battle script steps, active battle, outcome transaction, whiteout, resume |
| M7 | [The battle screen](m07-battle-screen.md) | ✅ | Transition, intro, healthboxes, menus, event playback, party/bag in battle, ending, music |
| M8 | [Animation engine](m08-animation-engine.md) | ✅ | Scripts → JSON, interpreter, behaviors, generic fallbacks, status/weather, two-turn moves |
| M9 | [FireRed move animations](m09-firered-move-animations.md) | ✅ | Moves 1-354, general animations, full sweep in the game |
| M10 | [Gen 4 move animations](m10-gen4-move-animations.md) | ✅ | Moves 355-467 from the expansion |
| M11 | [Exp, level up, moves, evolution](m11-exp-level-up-evolution.md) | ⬜ | Exp bar, level up window, learning moves, evolution, Pokédex seen |
| M12 | [Held and bag items](m12-held-and-bag-items.md) | ⬜ | Gen 4 battle items, bag items in battle, item messages |
| M13 | [Options, doubles, polish](m13-options-doubles-polish.md) | ⏸ | SHIFT, doubles, performance (after M12) |
| M14 | [Phase 4 battle check](m14-phase-4-battle-check.md) | ⬜ | Manual full check, only when the user asks |

## Log

| Date | Session | Done | Next | Notes |
|---|---|---|---|---|
| 2026-11-01 | Plan | This plan; battles moved into Phase 4 | M0, then M1 | |
| 2026-11-01 | M0 + M1 | Showdown reference; move, ability, nature, stats catalogs; species battle facts and learnsets; TM moves in the item catalog; `ids.ts`; move/ability/nature text; back pics, shiny palettes, battle coords | M2 (Pokémon in `mic-core`), M3 can follow | `@pkmn/sim` isn't in the host's `node_modules` (mic-battles installs it in Docker); TM CASE now shows Gen 4 move data; nothing committed |
| 2026-11-01 | M2 | Party in `mic-core` (stats, growth, personality, store, test team), `party/v1` contracts, SWITCH and held items, snapshot party, POKéMON in the START menu | M3 (party screen and summary) | Party contracts moved to `party.v1` (D16); Lucario's Extreme Speed → Bullet Punch, the M6 Infernape's Flare Blitz → Fire Punch (both illegal at Lv 50); with the test team, USE of party items and GIVE now answer PARTY_MENU and the client goes back to the list until M3; nothing run in the game |
| 2026-11-01 | M3 | Party menu, summary, bag/TM CASE/BERRY POUCH/PC GIVE → party menu, `SwapPokemonMoves`, assets (party/summary graphics, category icons, `noFlip`, texts) | M4 (battle engine in `mic-battles`) | Builds pass (tsc, vite in Docker, go, buf breaking); not run in the game (category icon spot, page-flip layering, switch slide unchecked) |
| 2026-11-01 | Plan split | `battles.md` split into this folder (overview, context, references, a file per milestone); cold-start rule in AGENTS.md | M4 | Committed M3 as `4169be9` first; the user then played M3, and the main features work |
| 2026-11-01 | M4 | Battle contracts (NATS, events, views, realtime, snapshot); Redis user; Showdown wrapper with carried-over HP/PP/status; log → events per side; requests, views, outcome; Gen 4 exp/EVs; random AI; D12 hook | M5 | Checked with a one-off in-process script and a throwaway Redis; NATS round trip not run; committed |
| 2026-11-01 | M5 | NPC AI: move effects from Showdown's data, the 8 flags, switching, trainer items (`BattleTeam.items`, `ItemUsed` event, item effects in `engine/bag.ts`), wild random | M6 | Checked with a one-off in-process script (deleted); FireRed's marked bugs fixed, and its switch-in choice (D18); committed |
| 2026-11-01 | M6 | NPCs in maps (compiled, drawn, blocking, facing); test trainer ROLANDO (heals, YES/NO, battle); `internal/battle` (trainers, teams, outcome rules, whiteout, `player:<id>:battle`, `battle_outcomes`); zone start/choices/outcome/resume; D19, D20 | M7 | Builds pass; not run (needs M7's screen); the user chose heal + whiteout for the test trainer |
| 2026-11-01 | M7 | Battle screen: state model, transition, intro, healthboxes, menus, event playback with FireRed's strings, party/bag in battle, ending, music; `ScriptStep.music`; battle strings, trainer classes and type names in `make text`; faint cries in `make audio` | Play it (with M6's check), then M8 | Category icon replaces "TYPE/" (D21); placeholder hits; not run in the game |
| 2026-11-02 | M7 play test | Played the test battle in the game; fixed the player's healthbox offset, the cursor palette, Pokémon showing before their ball opened, the foe's party balls, overworld character order; leaving mid-battle rolls back (D22) | M8 (D9 first) | Win ending and restart-resume not run; not committed |
| 2026-11-02 | M8 start | D9 confirmed (AGENTS.md); M7 committed (`1b57ea1`); animation runner, first behaviors, generic animations by type and category, played after "used <MOVE>!" | M8: watch them in the game, then the script conversion | Uncommitted; not seen in the game yet |
| 2026-11-02 | M8 conversion | `infra/battle/anims.mjs` → `anims/firered.json` + `expansion.json` (all 467 moves, general/status/special); engine: labels, calls, jumps, sound tasks, blending, lazy chunks and sounds; 110 sounds in `sounds.json` | M8: background commands, per-tag art, top behaviors, general anims | 5 moves play their own script; tsc and vite pass |
| 2026-11-02 | M8 play test | Generic physical/special/status and a converted script (Tackle) seen working; hit splat blended (setalpha) | M8: background commands, per-tag art, top behaviors, general anims | Uncommitted |
| 2026-11-02 | M8 session 3 | Move backgrounds, art per tag (`art.json`, `anim-art.mjs`, expansion art in `make graphics`), stereo pan, behaviors split by family (`behaviors/`), base behaviors, status/stat-change/weather behaviors; 42/511 programs play their own script | M8 step 4 hookup in `playback.ts`, step 5 | tsc + vite ✅; not run in the game; `make graphics`/`make audio` needed; uncommitted |
| 2026-11-02 | M8 session 4 | General animations hooked into `playback.ts` (status, confusion, love, Curse/Nightmare, stat changes with MULTIPLE runs, weather upkeep); two-turn moves (turn 0/1, no "used" on the charge turn, Fly/Dig… hidden between turns, Solar Beam in sun) | Play-test M8, commit, M9 | tsc + vite ✅; not run in the game; uncommitted |
| 2026-11-02 | M8 close | User played it lightly; M8 marked ✅ and committed; its recipe, coverage check and open checks moved to M9 | M9 | |
| 2026-11-03 | M9 session 1 | Behaviors for Normal, movement, Poison, Bug, Dragon, Ground, Rock, Fighting, Flying, the most shared effects; sprite loop commands; all gBattleAnimArgs passed; move power in the context; 136/354 moves on their own script (23 before) | M9: Ghost onward | tsc ✅, vite not run (Docker down), not run in the game; uncommitted |
| 2026-11-03 | M9 session 2 | Behaviors for Ghost, Dark, Fire, Ice, Electric, Water, Psychic, `effects_1`, `effects_2`, most of `effects_3`; sprite templates can name their sounds in `TASK_SOUNDS`; fog in `make graphics`, `se_m_lock_on` in `make audio`; about 322/354 moves have all their names (rough count) | M9: `effects_3`'s last two names | tsc ✅, vite not run (Docker down), not run in the game; uncommitted; approximations listed in M9 |
| 2026-11-03 | M9 session 3 | Last behaviors (`utility.ts`, `general.ts`, cries, custom pan, weather, palette backups), general animations and substitute doll in `playback.ts`, `run.opponent`; fixed fast translation 16× too slow (Powder Snow, Blizzard, Icy Wind, one `effects-1` particle); 354/354 moves | M9: Docker builds, commit, play-test | tsc ✅, headless run 1744/1744 clean, vite not run (Docker down), not run in the game; uncommitted |
| 2026-11-03 | M9 play test | `make graphics`, `make audio`, vite ✅; 45 sampled moves seen in the game on both sides, look right; fixed sliding backgrounds' garbage past 256 px (Thunder, Blizzard, Aeroblast, Sky Uppercut…) | Commit; user decides on emulator spot checks; M10 | No side-by-side with the emulator; general-animation hooks mostly unseen; uncommitted |
| 2026-11-03 | M9 full sweep | Every move, general and status animation seen in the game through a temporary hook and team (both reverted); real turns for doll, Fly/Dig, items, status, weather, Future Sight; fixed `monbg` blending (compositor `onBg`), terrain on BG3 after the intro, spotlight window, hidden battlers, missing texts (foresaw, destiny, took, stole), animations of failed moves | Commit; user decides on emulator and sound; M10 | Still frames, no sound; a few effects not triggered in real turns (listed in M9); `make text` needed for the new strings; uncommitted |
| 2026-11-03 | M9 close | User closed M9 without emulator spot checks (D23); M9 file cut down; committed | M10 | Fixes come from playing |
| 2026-11-03 | M10 code | `behaviors/gen4.ts` (FireRed behaviors in new art, new callbacks, tasks), `paletteTag`, tags tasks draw (`TASK_TAGS`, `TASK_TAG_ARG`), `loadTag`, `retarget`; `expansion.json` edits where the C checks the move or a partner; 113/113 moves by a one-off scan | M10: `make graphics`, rebuild, sweep, commit | tsc ✅, vite ✅; the game not run (user asked to stop before testing); uncommitted |
| 2026-11-03 | M10 sweep | `make graphics`; all 113 moves seen in the game, 36 of them on the foe's side, with hook checks for fallback, errors, hangs, leftovers; fixed Mud Bomb and Rock Wrecker crashes | Commit; M11 | Still frames, no sound or real turns; uncommitted |
