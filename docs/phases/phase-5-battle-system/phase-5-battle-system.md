# Phase 5: Battle System ✅

**Goal:** a **FireRed-style trainer battle with Gen 4 rules**, against a test trainer in the player's room: FireRed's screen, sprites, animations, sounds and texts, resolved by Showdown in `mic-battles` (battles saved in Redis every turn), with a FireRed-style AI adapted to Gen 4, experience, leveling, evolution and learning moves. It needed Pokémon first, so the data model, the party and its screens are here too.

## Resume Here

Done: every milestone was played and passes. Still open, none of it blocks the next phases:

- The user's frame rate check on a real phone ([M14](milestones/m14-battle-check.md#resume-here)); the three minor fixes are done.
- **Shared details,** for later phases building on this one: [context.md](milestones/context.md) (commands, client engine, decisions D1-D27, architecture, reference map) and [references.md](milestones/references.md). Open only the section a step needs; a milestone's file is enough to resume it. [Session log](milestones/log.md), for history only.

## Milestones

Order = dependencies. Marks: ⬜ not started · 🚧 in progress · ✅ done · ⏸ deferred.

| # | Milestone | Status | In short |
|---|---|---|---|
| M0 + M1 | [Data catalogs](milestones/m01-data-catalogs.md) | ✅ | Showdown reference; move, ability, nature, stats catalogs; species battle data and learnsets; TM moves; `ids.ts`; texts; back/shiny art |
| M2 | [Pokémon and the party in `mic-core`](milestones/m02-party.md) | ✅ | Gen 4 stats, growth, personality, `trainer_pokemon`, test team, SWITCH and held items, `party.v1` |
| M3 | [Party screen and summary](milestones/m03-party-screen.md) | ✅ | FireRed's party menu and summary, GIVE from bag/TM CASE/BERRY POUCH/PC, move SWITCH |
| M4 | [Battle engine in `mic-battles`](milestones/m04-battle-engine.md) | ✅ | Contracts, Redis store with step check, Showdown wrapper, log → events per side, handlers, Gen 4 exp, random AI |
| M5 | [NPC battle AI](milestones/m05-npc-ai.md) | ✅ | FireRed's AI flags with Gen 4 knowledge, switching, trainer items |
| M6 | [Battles in `mic-core` and the room trainer](milestones/m06-mic-core-battles.md) | ✅ | NPCs in maps, the test trainer, battle script steps, active battle, outcome transaction, whiteout, resume |
| M7 | [The battle screen](milestones/m07-battle-screen.md) | ✅ | Transition, intro, healthboxes, menus, event playback, party/bag in battle, ending, music |
| M8 | [Animation engine](milestones/m08-animation-engine.md) | ✅ | Scripts → JSON, interpreter, behaviors, generic fallbacks, status/weather, two-turn moves |
| M9 | [FireRed move animations](milestones/m09-firered-move-animations.md) | ✅ | Moves 1-354, general animations, full sweep in the game |
| M10 | [Gen 4 move animations](milestones/m10-gen4-move-animations.md) | ✅ | Moves 355-467 from the expansion |
| M11 | [Exp, level up, moves, evolution](milestones/m11-exp-level-up-evolution.md) | ✅ | Exp bar, level up window, learning moves, evolution, Pokédex seen (not played yet: M14) |
| M12 | [Held and bag items](milestones/m12-held-and-bag-items.md) | ✅ | Gen 4 battle items, bag items in battle, item messages (not played yet: M14) |
| M13 | [Options, doubles, polish](milestones/m13-options-doubles-polish.md) | ✅ | SHIFT, doubles, double prize, partner animations, field texts, multi-hit replay; played |
| M14 | [Battle check](milestones/m14-battle-check.md) | ✅ | Manual full check; real phone's frame rate left for the user |

**Built in other phases:** following Pokémon, Bill's PC boxes, TM/HM teaching, items used on a Pokémon outside battle and Exp. Share ([Phase 6](../phase-6-pokemon-party/phase-6-pokemon-party.md)), wild battles and catching ([Phase 7](../phase-7-wild-battles-catching/phase-7-wild-battles-catching.md)), PvP ([Phase 9](../phase-9-social.md)), the rival battle in Oak's lab ([Phase 10](../phase-10-pallet-town.md)).

## Done When

- ✅ The test team shows in POKéMON, and a battle against the room's test trainer plays to the end like FireRed with Gen 4 rules, surviving a restart of `mic-core` or `mic-battles`.
