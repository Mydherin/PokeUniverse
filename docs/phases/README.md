# Phases

High-level plan to build the **MVP: all of Kanto, including social features**.

## Principles

- **Each phase ends with something working and testable.**
- **Foundations before features:** later phases only add pieces.
- **Global systems before content:** what affects the whole game (battles, items on Pokémon, multiplayer, social) is built first, on test content. Maps and events come last. *Why: content built on finished systems isn't redone.*
- **Server-authoritative from day one:** even single-player movement goes through the server.
- **Faithful first, then better:** the start of the game (intro, Oak, room, Pallet Town) is rebuilt exactly like FireRed with its original art, then upgraded with public art.
- **FireRed system, Gen 4 rules:** every phase matches FireRed unless it conflicts with the MMO, with Gen 4 battle and Pokémon rules ([vision.md](../vision.md#firered-as-reference)).
- **Riskiest parts early:** the map pipeline and client-server movement validate the approach.

## How a Phase Is Tracked

The phase file is the source of its goal, scope, technical details and progress, self-contained enough to resume with no other read. [AGENTS.md](../../AGENTS.md#current-work) points at the file to resume.

- **Every phase file:** goal, **Resume Here** while it is open (exact next step, what is left), scope with ✅ per item, done when, and the technical details found so far.
- **A phase too big for one file** becomes a folder, like [Phase 5](phase-5-battle-system/phase-5-battle-system.md):

  ```
  phase-N-name/
    phase-N-name.md       goal, Resume Here, milestone table with status, scope, done when
    milestones/
      mNN-name.md         tasks, Resume Here, files, commands, decisions, gotchas: enough alone to resume
      context.md          optional: decisions and details milestones share, read by section
      references.md       optional: where things are in the reference repositories
      log.md              optional: session history, not needed to resume
  ```

- **Planning a milestone:** list every piece, on every layer: contract, server, client screens, and what FireRed shows for it (scenes, art, strings, sounds, with their functions and files). What's missing gets rediscovered at full cost. If it won't fit one session (about 14% of the context after the start, reading included), split it.
- **When a milestone is ✅,** cut its file down to what later milestones use.
- **Code comments** cite a phase's milestones and decisions by short name: `phase-5 M7`, `phase-5 D9` (decisions are in its `context.md`).

## Phases

The phase index: the one place for every phase's current state and what is still open. Details stay in each phase's file; this page only says where things stand and where they went.

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
| 7 | [Wild Battles and Catching](phase-7-wild-battles-catching/phase-7-wild-battles-catching.md) | 🚧 planned M1-M8, next M1 | O4, O5 | Wild battles and catching work, on a test grass patch ([milestones](phase-7-wild-battles-catching/phase-7-wild-battles-catching.md#milestones)) |
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
