# Phases Index

Current state of **every phase** of the project and everything still open, in one place. Details stay in each phase's file; this page only says where each phase stands and where leftovers went. The plan's principles and how a phase is tracked: [README.md](README.md).

**Current:** Phase 7, [M1](phase-7-wild-battles-catching/milestones/m01-data-tables.md) next. **Updated:** 2026-11-08.

## Milestones of Phases With Folders

| Phase | Done | Next |
|---|---|---|
| [5 Battle System](phase-5-battle-system/phase-5-battle-system.md#milestones) | 14 / 14 ✅ | |
| [6 Pokémon and Party](phase-6-pokemon-party/phase-6-pokemon-party.md#milestones) | 10 / 10 ✅ | |
| [7 Wild Battles and Catching](phase-7-wild-battles-catching/phase-7-wild-battles-catching.md#milestones) | 0 / 8 | M1 |

## Phases

✅ done · 🚧 in progress · 🔁 reopened · ⬜ not started

| # | Phase | State | Open | Done when |
|---|---|---|---|---|
| 0 | [Foundations](phase-0-foundations.md) | ✅ | | Whole stack starts with one command; SPA ↔ `mic-core` WebSocket works |
| 1 | [Web App and Auth](phase-1-web-app-auth.md) | ✅ | | Log in with Google and reach an empty game screen |
| 2 | [FireRed Intro](phase-2-firered-intro.md) | ✅ | | Play shows FireRed's intro, title screen and menu like the original |
| 3 | [New Game with Oak](phase-3-new-game.md) | ✅ | | A new player finishes Oak's speech and their trainer is saved |
| 4 | [Player's Room](phase-4-players-room.md) | ✅ | Moved: O1, O2 | Walk in your room, server-authoritative; START menu and PC like FireRed; maps edited as text |
| 5 | [Battle System](phase-5-battle-system/phase-5-battle-system.md) | ✅ | O3 (user); moved: O4 | A Gen 4 battle against a test trainer plays to the end like FireRed ([milestones](phase-5-battle-system/phase-5-battle-system.md#milestones)) |
| 6 | [Pokémon and Party](phase-6-pokemon-party/phase-6-pokemon-party.md) | ✅ | Moved: O4-O8 | Items and TMs work on Pokémon; manage your team and boxes; lead Pokémon follows you ([milestones](phase-6-pokemon-party/phase-6-pokemon-party.md#milestones)) |
| 7 | [Wild Battles and Catching](phase-7-wild-battles-catching/phase-7-wild-battles-catching.md) | 🚧 M1 next | O4, O5 | Wild battles and catching work, on a test grass patch ([milestones](phase-7-wild-battles-catching/phase-7-wild-battles-catching.md#milestones)) |
| 8 | [Multiplayer World](phase-8-multiplayer-world.md) | ⬜ | O7 | Many players move together smoothly, with chat |
| 9 | [Social](phase-9-social.md) | ⬜ | | Players use the social menus, trade and battle each other |
| 10 | [Pallet Town](phase-10-pallet-town.md) | ⬜ | O1, O6, O9 | All of Pallet Town and its events, up to choosing a starter and the first rival battle |
| 11 | [Pallet Town Art Upgrade](phase-11-pallet-town-art.md) | ⬜ | | Pallet Town with awesome public art, same game |
| 12 | [World Content](phase-12-world-content.md) | ⬜ | O2, O8, O10 | All of Kanto playable start to end |
| 13 | [Polish and Launch](phase-13-polish-launch.md) | ⬜ | | Game is public and stable |

## Open Items

Everything a phase left open, reopened or handed to another phase. An item leaves this table once done in its target phase.

| # | Item | From | Goes to | Details |
|---|---|---|---|---|
| O1 | The house's door out, Mom's healing, the Running Shoes (story flags) | 4 | 10 | [Phase 4](phase-4-players-room.md) |
| O2 | Item screens (TOWN MAP, FAME CHECKER, TEACHY TV, mail) and field item effects (bike, rods, ESCAPE ROPE, VS SEEKER, ITEMFINDER) | 4 | 12 | [Phase 4](phase-4-players-room.md) |
| O3 | Frame rate on a real phone, checked by the user | 5 | 5 | [M14](phase-5-battle-system/milestones/m14-battle-check.md#resume-here) |
| O4 | Poké Doll, Fluffy Tail, Smoke Ball's escape animation, Cleanse Tag, Pure Incense | 5, 6 | 7 (M4, M3) | [Phase 7](phase-7-wild-battles-catching/phase-7-wild-battles-catching.md) |
| O5 | Catching into the boxes; Sweet Scent from the party menu | 6 | 7 (M5, M3) | [Phase 7](phase-7-wild-battles-catching/phase-7-wild-battles-catching.md) |
| O6 | Whiteout respawn map (now same zone, `Start`'s tile) | 6 | 10 | [Phase 6 M9](phase-6-pokemon-party/milestones/m09-following-check.md#follow-ups-later-phases), Phase 7 D11 |
| O7 | Other players' following Pokémon | 6 | 8 | [Phase 6 M9](phase-6-pokemon-party/milestones/m09-following-check.md#follow-ups-later-phases) |
| O8 | Field moves on the map; the follower with sight trainers and walking NPCs | 6 | 12 | [Phase 6](phase-6-pokemon-party/phase-6-pokemon-party.md#scope-outside-this-phase) |
| O9 | Remove the test content: test team, room trainer, test grass patch | 5, 7 | 10 | [Phase 10](phase-10-pallet-town.md) |
| O10 | Real encounter tables, Surf, Rock Smash and rod encounters, Safari Zone, roamers, `FLAG_SYS_NOT_SOMEONES_PC` | 7 | 12 | [Phase 7](phase-7-wild-battles-catching/phase-7-wild-battles-catching.md#scope) |
