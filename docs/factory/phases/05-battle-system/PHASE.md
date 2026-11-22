---
milestones: [01-data-catalogs, 02-party, 03-party-screen, 04-battle-engine, 05-npc-ai, 06-mic-core-battles, 07-battle-screen, 08-animation-engine, 09-firered-move-animations, 10-gen4-move-animations, 11-exp-level-up-evolution, 12-held-and-bag-items, 13-options-doubles-polish, 14-battle-check]
---

# Phase 5: Battle System

**Goal:** a **FireRed-style trainer battle with Gen 4 rules**, against a test trainer in the player's room: FireRed's screen, sprites, animations, sounds and texts, resolved by Showdown in `mic-battles` (battles saved in Redis every turn), with a FireRed-style AI adapted to Gen 4, experience, leveling, evolution and learning moves. It needed Pokémon first, so the data model, the party and its screens are here too.

## Resume Here

Done: every milestone was played and passes. Still open, none of it blocks the next phases:

- The user's frame rate check on a real phone ([M14](milestones/14-battle-check.md#resume-here)); the three minor fixes are done.
- **Shared details,** for later phases building on this one: [context/battle-system.md](../../context/battle-system.md) (commands, client engine, decisions D1-D27, architecture, reference map) and [references.md](../../context/battle-references.md). Open only the section a step needs; a milestone's file is enough to resume it. [Session log](log.md), for history only.

## Milestones

Order = dependencies. Each milestone's status is in its file's front matter.

| # | Milestone | In short |
|---|---|---|
| M0 + M1 | [Data catalogs](milestones/01-data-catalogs.md) | Showdown reference; move, ability, nature, stats catalogs; species battle data and learnsets; TM moves; `ids.ts`; texts; back/shiny art |
| M2 | [Pokémon and the party in `mic-core`](milestones/02-party.md) | Gen 4 stats, growth, personality, `trainer_pokemon`, test team, SWITCH and held items, `party.v1` |
| M3 | [Party screen and summary](milestones/03-party-screen.md) | FireRed's party menu and summary, GIVE from bag/TM CASE/BERRY POUCH/PC, move SWITCH |
| M4 | [Battle engine in `mic-battles`](milestones/04-battle-engine.md) | Contracts, Redis store with step check, Showdown wrapper, log → events per side, handlers, Gen 4 exp, random AI |
| M5 | [NPC battle AI](milestones/05-npc-ai.md) | FireRed's AI flags with Gen 4 knowledge, switching, trainer items |
| M6 | [Battles in `mic-core` and the room trainer](milestones/06-mic-core-battles.md) | NPCs in maps, the test trainer, battle script steps, active battle, outcome transaction, whiteout, resume |
| M7 | [The battle screen](milestones/07-battle-screen.md) | Transition, intro, healthboxes, menus, event playback, party/bag in battle, ending, music |
| M8 | [Animation engine](milestones/08-animation-engine.md) | Scripts → JSON, interpreter, behaviors, generic fallbacks, status/weather, two-turn moves |
| M9 | [FireRed move animations](milestones/09-firered-move-animations.md) | Moves 1-354, general animations, full sweep in the game |
| M10 | [Gen 4 move animations](milestones/10-gen4-move-animations.md) | Moves 355-467 from the expansion |
| M11 | [Exp, level up, moves, evolution](milestones/11-exp-level-up-evolution.md) | Exp bar, level up window, learning moves, evolution, Pokédex seen (not played yet: M14) |
| M12 | [Held and bag items](milestones/12-held-and-bag-items.md) | Gen 4 battle items, bag items in battle, item messages (not played yet: M14) |
| M13 | [Options, doubles, polish](milestones/13-options-doubles-polish.md) | SHIFT, doubles, double prize, partner animations, field texts, multi-hit replay; played |
| M14 | [Battle check](milestones/14-battle-check.md) | Manual full check; real phone's frame rate left for the user |

**Built in other phases:** following Pokémon, Bill's PC boxes, TM/HM teaching, items used on a Pokémon outside battle and Exp. Share ([Phase 6](../06-pokemon-party/PHASE.md)), wild battles and catching ([Phase 7](../07-wild-battles-catching/PHASE.md)), PvP ([Phase 9](../09-social/PHASE.md)), the rival battle in Oak's lab ([Phase 10](../../ROADMAP.md#10-pallet-town)).

## Done When

- ✅ The test team shows in POKéMON, and a battle against the room's test trainer plays to the end like FireRed with Gen 4 rules, surviving a restart of `mic-core` or `mic-battles`.
