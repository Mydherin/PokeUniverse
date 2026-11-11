# Phases Index

Current state of **every phase** of the project and everything still open, in one place. Details stay in each phase's file; this page only says where each phase stands and where leftovers went. The plan's principles and how a phase is tracked: [README.md](README.md).

**Current:** Phase 8, [Multiplayer World](phase-8-multiplayer-world/phase-8-multiplayer-world.md), in progress: 6/9 milestones ✅ (M1-M6), now [M7 Mobile compose](phase-8-multiplayer-world/milestones/m07-mobile-compose.md#resume-here) ⬜ (not started) (Phase 7 done 2026-11-10). **Updated:** 2026-11-11.

## Milestones of Phases With Folders

| Phase | Done | Next |
|---|---|---|
| [5 Battle System](phase-5-battle-system/phase-5-battle-system.md#milestones) | 14 / 14 ✅ | |
| [6 Pokémon and Party](phase-6-pokemon-party/phase-6-pokemon-party.md#milestones) | 10 / 10 ✅ | |
| [7 Wild Battles and Catching](phase-7-wild-battles-catching/phase-7-wild-battles-catching.md#milestones) | 8 / 8 ✅ | |
| [8 Multiplayer World](phase-8-multiplayer-world/phase-8-multiplayer-world.md#milestones) | 3 / 9 (M4 🧪) | [M4 Manual Test](phase-8-multiplayer-world/milestones/m04-zones-across-replicas.md#resume-here) |

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
| 8 | [Multiplayer World](phase-8-multiplayer-world/phase-8-multiplayer-world.md) | 🚧 | Moved: O13, O14 | Many players move together smoothly, with chat ([milestones](phase-8-multiplayer-world/phase-8-multiplayer-world.md#milestones)) |
| 9 | [Social](phase-9-social.md) | ⬜ | O14 | Players use the social menus, trade and battle each other |
| 10 | [Pallet Town](phase-10-pallet-town.md) | ⬜ | O1, O6, O9, O12, O13 | All of Pallet Town and its events, up to choosing a starter and the first rival battle |
| 11 | [Pallet Town Art Upgrade](phase-11-pallet-town-art.md) | ⬜ | | Pallet Town with awesome public art, same game |
| 12 | [World Content](phase-12-world-content.md) | ⬜ | O2, O8, O10, O11 | All of Kanto playable start to end |
| 13 | [Polish and Launch](phase-13-polish-launch.md) | ⬜ | | Game is public and stable |

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
| O14 | Trainer card on A facing a player; friends list, private chat per friend, party group chat, add or invite from a zone chat line; chat channel chips and line-actions menu (D24) | 8 | 9 | [Phase 9](phase-9-social.md) |
