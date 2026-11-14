# Phases Index

Current state of **every phase** of the project and everything still open, in one place. Details stay in each phase's file; this page only says where each phase stands and where leftovers went. The plan's principles and how a phase is tracked: [README.md](README.md).

**Current:** Phase 8, [Multiplayer World](phase-8-multiplayer-world/phase-8-multiplayer-world.md), done except the real-phone cases: 7/9 milestones ✅ (M1-M6, M8); [M7](phase-8-multiplayer-world/milestones/m07-mobile-compose.md#resume-here) 🧪 (cases 9-10 and 11's naming screen) and [M9](phase-8-multiplayer-world/milestones/m09-phase-check.md#resume-here) 🧪 (case 6) wait on the user's iPhone and Android; what to play on each: [Phase 8 Resume Here](phase-8-multiplayer-world/phase-8-multiplayer-world.md#resume-here). [Phase 9](phase-9-social/phase-9-social.md#resume-here) in progress: 7/15 ✅ (M1-M7); [M8](phase-9-social/milestones/m08-link-rooms.md#resume-here) (link rooms) 🔨: server built, client next. **Updated:** 2026-11-14.

## Milestones of Phases With Folders

| Phase | Done | Next |
|---|---|---|
| [5 Battle System](phase-5-battle-system/phase-5-battle-system.md#milestones) | 14 / 14 ✅ | |
| [6 Pokémon and Party](phase-6-pokemon-party/phase-6-pokemon-party.md#milestones) | 10 / 10 ✅ | |
| [7 Wild Battles and Catching](phase-7-wild-battles-catching/phase-7-wild-battles-catching.md#milestones) | 8 / 8 ✅ | |
| [8 Multiplayer World](phase-8-multiplayer-world/phase-8-multiplayer-world.md#milestones) | 7 / 9 (M7, M9 🧪: real phones) | [M7 phone cases](phase-8-multiplayer-world/milestones/m07-mobile-compose.md#resume-here), [M9 case 6](phase-8-multiplayer-world/milestones/m09-phase-check.md#resume-here) |
| [9 Social](phase-9-social/phase-9-social.md#milestones) | 7 / 15 | [M8 Link rooms](phase-9-social/milestones/m08-link-rooms.md) |

## Phases

✅ done · 🚧 in progress · 🧪 code done, Manual Test pending · 🔁 reopened · ⬜ not started

| # | Phase | State | Open | Done when |
|---|---|---|---|---|
| 0 | [Foundations](phase-0-foundations.md) | ✅ | | Whole stack starts with one command; SPA ↔ `mic-core` WebSocket works |
| 1 | [Web App and Auth](phase-1-web-app-auth.md) | ✅ | | Log in with Google and reach an empty game screen |
| 2 | [FireRed Intro](phase-2-firered-intro.md) | ✅ | | Play shows FireRed's intro, title screen and menu like the original |
| 3 | [New Game with Oak](phase-3-new-game.md) | ✅ | | A new player finishes Oak's speech and their trainer is saved |
| 4 | [Player's Room](phase-4-players-room.md) | ✅ | Moved: O1, O2 | Walk in your room, server-authoritative; START menu and PC like FireRed; maps edited as text |
| 5 | [Battle System](phase-5-battle-system/phase-5-battle-system.md) | ✅ | O3 (user) | A Gen 4 battle against a test trainer plays to the end like FireRed ([milestones](phase-5-battle-system/phase-5-battle-system.md#milestones)) |
| 6 | [Pokémon and Party](phase-6-pokemon-party/phase-6-pokemon-party.md) | ✅ | Moved: O6-O8 | Items and TMs work on Pokémon; manage your team and boxes; lead Pokémon follows you ([milestones](phase-6-pokemon-party/phase-6-pokemon-party.md#milestones)) |
| 7 | [Wild Battles and Catching](phase-7-wild-battles-catching/phase-7-wild-battles-catching.md) | ✅ | Moved: O9, O10, O11, O12 | Wild battles and catching work, on a test grass patch ([milestones](phase-7-wild-battles-catching/phase-7-wild-battles-catching.md#milestones)) |
| 8 | [Multiplayer World](phase-8-multiplayer-world/phase-8-multiplayer-world.md) | 🧪 real phones left | Moved: O13, O14, O15, O16 | Many players move together smoothly, with chat ([milestones](phase-8-multiplayer-world/phase-8-multiplayer-world.md#milestones)) |
| 9 | [Social](phase-9-social/phase-9-social.md) | 🚧 in progress | O14; moved: O17, O19-O21 | Friends, direct messages and private channels; trade and battle each other (single, double, 4-player multi) in the Pokémon Center 2F ([milestones](phase-9-social/phase-9-social.md#milestones)) |
| 10 | [Pallet Town](phase-10-pallet-town.md) | ⬜ | O1, O6, O9, O12, O13 | All of Pallet Town and its events, up to choosing a starter and the first rival battle |
| 11 | [Pallet Town Art Upgrade](phase-11-pallet-town-art.md) | ⬜ | | Pallet Town with awesome public art, same game |
| 12 | [World Content](phase-12-world-content.md) | ⬜ | O2, O8, O10, O11, O15, O20, O21 | All of Kanto playable start to end |
| 13 | [Polish and Launch](phase-13-polish-launch.md) | ⬜ | O16, O17, O19 | Game is public and stable |

## Open Items

Everything a phase left open, reopened or handed to another phase. An item leaves this table once done in its target phase.

| # | Item | From | Goes to | Details |
|---|---|---|---|---|
| O1 | The house's door out, Mom's healing, the Running Shoes (story flags) | 4 | 10 | [Phase 4](phase-4-players-room.md) |
| O2 | Item screens (TOWN MAP, FAME CHECKER, TEACHY TV, mail) and field item effects (bike, rods, ESCAPE ROPE, VS SEEKER, ITEMFINDER) | 4 | 12 | [Phase 4](phase-4-players-room.md) |
| O3 | Frame rate on a real phone, checked by the user | 5 | 5 | [M14](phase-5-battle-system/milestones/m14-battle-check.md#resume-here) |
| O6 | Whiteout respawn map (now same zone, `Start`'s tile) | 6 | 10 | [Phase 6 M9](phase-6-pokemon-party/milestones/m09-following-check.md#follow-ups-later-phases), Phase 7 D11 |
| O8 | Field moves on the map; the follower with sight trainers and walking NPCs | 6 | 12 | [Phase 6](phase-6-pokemon-party/phase-6-pokemon-party.md#scope-outside-this-phase) |
| O9 | Remove the test content: test team, room trainer, test grass patch | 5, 7 | 10 | [Phase 10](phase-10-pallet-town.md) |
| O10 | Real encounter tables, Surf, Rock Smash and rod encounters, Safari Zone and Safari Ball, roamers, `FLAG_SYS_NOT_SOMEONES_PC` | 7 | 12 | [Phase 7 M8](phase-7-wild-battles-catching/milestones/m08-phase-check.md#follow-ups-later-phases) |
| O11 | Field moves' cut-in of the Pokémon (`CreateFieldEffectShowMon`), Sweet Scent's included | 7 | 12 | [Phase 7 M3](phase-7-wild-battles-catching/milestones/m03-encounters.md) |
| O12 | SUMMARY shows "Met in Somewhere" in the house (no map section name); look at the naming screen's Pokémon icon fix | 7 | 10 | [Phase 7 M8](phase-7-wild-battles-catching/milestones/m08-phase-check.md#follow-ups-later-phases) |
| O13 | Story flags' personal layer (flag-filtered objects and collisions), map phase flags, private scene phases (zone key is map + phase from Phase 8) | 8 | 10 | [Phase 8 D19, D20](phase-8-multiplayer-world/milestones/context.md#decisions), [Phase 10](phase-10-pallet-town.md) |
| O14 | Friends (requests, list with faces and status), direct messages, private channels, acting on a player (A facing them, chat line actions), social panel; parties dropped, trainer card moved to O17 (user 2026-11-12) | 8 | 9 | [Phase 9](phase-9-social/phase-9-social.md) M1-M6 |
| O15 | Players across a map border: connected maps' players drawn together (D4) | 8 | 12 | [Phase 8 M9](phase-8-multiplayer-world/milestones/m09-phase-check.md#follow-ups-later-phases), [Phase 12](phase-12-world-content.md) |
| O16 | Chat word filter, muting, blocking a player (requests and messages) and reporting (D14; Phase 9 Q3) | 8 | 13 | [Phase 8 M9](phase-8-multiplayer-world/milestones/m09-phase-check.md#follow-ups-later-phases), [Phase 13](phase-13-polish-launch.md) |
| O17 | Another player's trainer card (A facing them, Colosseum seats) and link battle records | 9 | 13 | [Phase 9 D2](phase-9-social/milestones/context.md#scope), [Phase 13](phase-13-polish-launch.md) |
| O19 | Push notifications for messages while the game is closed (PWA web push) | 9 | 13 | [Phase 9](phase-9-social/phase-9-social.md#scope), [Phase 13](phase-13-polish-launch.md) |
| O20 | Pokémon Center 2F moves to Viridian's Pokémon Center (stairs from 1F, the room's door removed); attendants' Pokédex check | 9 | 12 | [Phase 9 D15, D17](phase-9-social/milestones/context.md#pokémon-center-2f), [Phase 12](phase-12-world-content.md) |
| O21 | Traded Pokémon obey by badges (Gen 4 level caps) | 9 | 12 | [Phase 9 D24](phase-9-social/milestones/context.md#trading), [Phase 12](phase-12-world-content.md) |
