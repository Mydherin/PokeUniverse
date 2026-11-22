---
phases:
  - id: 00-foundations
    title: "Foundations"
    status: done
    depends: []
  - id: 01-web-app-auth
    title: "Web App and Auth"
    status: done
    depends: [00-foundations]
  - id: 02-firered-intro
    title: "FireRed Intro"
    status: done
    depends: [01-web-app-auth]
  - id: 03-new-game
    title: "New Game with Oak"
    status: done
    depends: [02-firered-intro]
  - id: 04-players-room
    title: "Player's Room"
    status: done
    depends: [03-new-game]
  - id: 05-battle-system
    title: "Battle System"
    status: done
    depends: [04-players-room]
  - id: 06-pokemon-party
    title: "Pokémon and Party"
    status: done
    depends: [05-battle-system]
  - id: 07-wild-battles-catching
    title: "Wild Battles and Catching"
    status: done
    depends: [06-pokemon-party]
  - id: 08-multiplayer-world
    title: "Multiplayer World"
    status: done
    depends: [07-wild-battles-catching]
  - id: 09-social
    title: "Social"
    status: expanded
    depends: [08-multiplayer-world]
  - id: 10-pallet-town
    title: "Pallet Town"
    status: planned
    depends: [09-social]
  - id: 11-pallet-town-art
    title: "Pallet Town Art Upgrade"
    status: planned
    depends: [10-pallet-town]
  - id: 12-world-content
    title: "World Content"
    status: planned
    depends: [11-pallet-town-art]
  - id: 13-polish-launch
    title: "Polish and Launch"
    status: planned
    depends: [12-world-content]
---

# Roadmap

Phases in the order they are built. Each line explains what the phase delivers and why it comes there. The MVP is **all of Kanto, including social features** ([VISION.md](VISION.md)).

## Principles

- **Each phase ends with something working and testable.**
- **Foundations before features:** later phases only add pieces.
- **Global systems before content:** what affects the whole game (battles, items on Pokémon, multiplayer, social) is built first, on test content. Maps and events come last. *Why: content built on finished systems isn't redone.*
- **Server-authoritative from day one:** even single-player movement goes through the server.
- **Faithful first, then better:** the start of the game (intro, Oak, room, Pallet Town) is rebuilt exactly like FireRed with its original art, then upgraded with public art.
- **FireRed system, Gen 4 rules:** every phase matches FireRed unless it conflicts with the MMO, with Gen 4 battle and Pokémon rules ([VISION.md](VISION.md#firered-as-reference)).
- **Riskiest parts early:** the map pipeline and client-server movement validate the approach.

## Phases

- **00-foundations** ([Foundations](phases/00-foundations/PHASE.md), done): technical base: monorepo, contracts, Compose stack and the Mooi development deployment, so every milestone is tested end to end in a live preview. *Done when:* Whole stack starts with one command; SPA ↔ `mic-core` WebSocket works.
- **01-web-app-auth** ([Web App and Auth](phases/01-web-app-auth/PHASE.md), done): the web app and Google sign-in: every later phase needs a signed-in player. *Done when:* Log in with Google and reach an empty game screen.
- **02-firered-intro** ([FireRed Intro](phases/02-firered-intro/PHASE.md), done): FireRed's intro, title screen and menu, faithful: the first of the game, and the GBA engine everything draws with. *Done when:* Play shows FireRed's intro, title screen and menu like the original.
- **03-new-game** ([New Game with Oak](phases/03-new-game/PHASE.md), done): Oak's speech and the saved trainer: the player exists before the world. *Done when:* A new player finishes Oak's speech and their trainer is saved.
- **04-players-room** ([Player's Room](phases/04-players-room/PHASE.md), done): the first map, server-authoritative movement, START menu, bag and PC, maps as text: the riskiest parts (map pipeline, client-server movement) early. *Done when:* Walk in your room, server-authoritative; START menu and PC like FireRed; maps edited as text. Open: Moved: O1, O2.
- **05-battle-system** ([Battle System](phases/05-battle-system/PHASE.md), done): Gen 4 battles drawn as FireRed: the largest global system, on a test trainer. *Done when:* A Gen 4 battle against a test trainer plays to the end like FireRed ([milestones](phases/05-battle-system/PHASE.md#milestones)). Open: O3 (user).
- **06-pokemon-party** ([Pokémon and Party](phases/06-pokemon-party/PHASE.md), done): items, TMs, boxes and the following Pokémon: everything the party needs before wild Pokémon. *Done when:* Items and TMs work on Pokémon; manage your team and boxes; lead Pokémon follows you ([milestones](phases/06-pokemon-party/PHASE.md#milestones)). Open: Moved: O6-O8.
- **07-wild-battles-catching** ([Wild Battles and Catching](phases/07-wild-battles-catching/PHASE.md), done): wild battles and catching, on a test grass patch: the last single-player system. *Done when:* Wild battles and catching work, on a test grass patch ([milestones](phases/07-wild-battles-catching/PHASE.md#milestones)). Open: Moved: O9, O10, O11, O12.
- **08-multiplayer-world** ([Multiplayer World](phases/08-multiplayer-world/PHASE.md), done): many players in one world, across replicas, with zone chat: the MMO base social features build on. *Done when:* Many players move together smoothly, with chat ([milestones](phases/08-multiplayer-world/PHASE.md#milestones)). Open: O22 (user); moved: O13, O14, O15, O16.
- **09-social** ([Social](phases/09-social/PHASE.md), expanded): friends, direct messages, private channels, and trading and PvP in FireRed's Cable Club: the MVP's social features. *Done when:* Friends, direct messages and private channels; trade and battle each other (single, double, 4-player multi) in the Pokémon Center 2F ([milestones](phases/09-social/PHASE.md#milestones)). Open: O14; moved: O17, O19-O21.
- **10-pallet-town** ([Pallet Town](#10-pallet-town), planned): Pallet Town and its events (event system, story flags, personal layer, map phases): the first real content, on finished systems; removes the test content. *Done when:* All of Pallet Town and its events, up to choosing a starter and the first rival battle. Open: O1, O6, O9, O12, O13.
- **11-pallet-town-art** ([Pallet Town Art Upgrade](#11-pallet-town-art), planned): Pallet Town with public art: proves the art is swappable before all of Kanto's content. *Done when:* Pallet Town with awesome public art, same game.
- **12-world-content** ([World Content](#12-world-content), planned): all of Kanto from the first town to the Champion, with its art: the content, built last on finished systems. *Done when:* All of Kanto playable start to end. Open: O2, O8, O10, O11, O15, O20, O21.
- **13-polish-launch** ([Polish and Launch](#13-polish-launch), planned): performance, moderation, PWA, monitoring and admin tools: the MVP ready to go public. Production deployment and backups are prepared outside the factory (D-016). *Done when:* the game is stable and ready to go public (publishing is the production deployment, outside the factory). Open: O16, O17, O19.

## Open Items

Everything a phase left open, reopened or handed to another phase. An item leaves this table once done in its target phase.

| # | Item | From | Goes to | Details |
|---|---|---|---|---|
| O1 | The house's door out, Mom's healing, the Running Shoes (story flags) | 4 | 10 | [Phase 4](phases/04-players-room/PHASE.md) |
| O2 | Item screens (TOWN MAP, FAME CHECKER, TEACHY TV, mail) and field item effects (bike, rods, ESCAPE ROPE, VS SEEKER, ITEMFINDER) | 4 | 12 | [Phase 4](phases/04-players-room/PHASE.md) |
| O3 | Frame rate on a real phone, checked by the user | 5 | user | [M14](phases/05-battle-system/milestones/14-battle-check.md#resume-here) |
| O6 | Whiteout respawn map (now same zone, `Start`'s tile) | 6 | 10 | [Phase 6 M9](phases/06-pokemon-party/milestones/09-following-check.md#follow-ups-later-phases), Phase 7 D11 |
| O8 | Field moves on the map; the follower with sight trainers and walking NPCs | 6 | 12 | [Phase 6](phases/06-pokemon-party/PHASE.md#scope-outside-this-phase) |
| O9 | Remove the test content: test team, room trainer, test grass patch | 5, 7 | 10 | [Phase 10](#10-pallet-town) |
| O10 | Real encounter tables, Surf, Rock Smash and rod encounters, Safari Zone and Safari Ball, roamers, `FLAG_SYS_NOT_SOMEONES_PC` | 7 | 12 | [Phase 7 M8](phases/07-wild-battles-catching/milestones/08-phase-check.md#follow-ups-later-phases) |
| O11 | Field moves' cut-in of the Pokémon (`CreateFieldEffectShowMon`), Sweet Scent's included | 7 | 12 | [Phase 7 M3](phases/07-wild-battles-catching/milestones/03-encounters.md) |
| O12 | SUMMARY shows "Met in Somewhere" in the house (no map section name); look at the naming screen's Pokémon icon fix | 7 | 10 | [Phase 7 M8](phases/07-wild-battles-catching/milestones/08-phase-check.md#follow-ups-later-phases) |
| O13 | Story flags' personal layer (flag-filtered objects and collisions), map phase flags, private scene phases (zone key is map + phase from Phase 8) | 8 | 10 | [Phase 8 D19, D20](context/multiplayer.md#decisions), [Phase 10](#10-pallet-town) |
| O14 | Friends (requests, list with faces and status), direct messages, private channels, acting on a player (A facing them, chat line actions), social panel; parties dropped, trainer card moved to O17 (user 2026-11-12) | 8 | 9 | [Phase 9](phases/09-social/PHASE.md) M1-M6 |
| O15 | Players across a map border: connected maps' players drawn together (D4) | 8 | 12 | [Phase 8 M9](phases/08-multiplayer-world/milestones/09-phase-check.md#follow-ups-later-phases), [Phase 12](#12-world-content) |
| O16 | Chat word filter, muting, blocking a player (requests and messages) and reporting (D14; Phase 9 Q3) | 8 | 13 | [Phase 8 M9](phases/08-multiplayer-world/milestones/09-phase-check.md#follow-ups-later-phases), [Phase 13](#13-polish-launch) |
| O17 | Another player's trainer card (A facing them, Colosseum seats) and link battle records | 9 | 13 | [Phase 9 D2](context/social.md#scope), [Phase 13](#13-polish-launch) |
| O19 | Push notifications for messages while the game is closed (PWA web push) | 9 | 13 | [Phase 9](phases/09-social/PHASE.md#scope), [Phase 13](#13-polish-launch) |
| O20 | Pokémon Center 2F moves to Viridian's Pokémon Center (stairs from 1F, the room's door removed); attendants' Pokédex check | 9 | 12 | [Phase 9 D15, D17](context/social.md#pokémon-center-2f), [Phase 12](#12-world-content) |
| O21 | Traded Pokémon obey by badges (Gen 4 level caps) | 9 | 12 | [Phase 9 D24](context/social.md#trading), [Phase 12](#12-world-content) |
| O22 | Real-phone cases: Phase 8 M7 cases 9-10 and case 11's naming screen, M9 case 6, on an iPhone and an Android phone (browser, then PWA) | 8 | user | [Phase 8](phases/08-multiplayer-world/PHASE.md#resume-here), D-014 |

## Notes for Planned Phases

What is already known about each phase not yet expanded: scope gathered so far and the open items aimed at it. The phase's expansion starts from here and from the open items above.

### 10-pallet-town

**Pallet Town.** **Goal:** all of Pallet Town as in FireRed, with its events, up to choosing a starter and the first rival battle.

#### Scope

- Maps: rival's house, Oak's lab and Pallet Town outdoors, with warps and the edge to Route 1 (the player's house exists since [Phase 4](phases/04-players-room/PHASE.md)).
- Event system (interpreter in `mic-core`) with per-player story flags saved in PostgreSQL.
- NPCs and dialogue: Mom, the rival's sister, townsfolk, signs.
- Oak stops the player at the edge of Route 1 and leads them to the lab.
- Choosing a starter (Bulbasaur, Charmander or Squirtle); the rival takes the one strong against it.
- The first rival battle in Oak's lab, on the [Battle System](phases/05-battle-system/PHASE.md).
- The starter is saved with the Pokémon data model from [Phase 5](phases/05-battle-system/PHASE.md), and it replaces the test team; the test trainer and the test grass patch on 1F ([Phase 7](phases/07-wild-battles-catching/PHASE.md)) leave the room.
- Oak gives the POKéDEX (`FLAG_SYS_POKEDEX_GET`: the START menu shows it; the screen exists since [Phase 4](phases/04-players-room/PHASE.md)), and the starters seen and caught are registered.
- The START menu shows POKéMON once the starter is chosen, as in FireRed (the party screen and summary exist since [Phase 5](phases/05-battle-system/PHASE.md)).
- The house's maps get Pallet Town's map section, so SUMMARY stops showing "Met in Somewhere"; look at the naming screen's Pokémon icon fix when the starter is named ([O12](#open-items), from Phase 7 M8).
- **Shared map, personal layer** (user 2026-11-10, [Phase 8 D20](context/multiplayer.md#decisions)): players in one zone see each other; each one's FireRed story flags (per player, on the server) change only their own layer: stationary/legendary encounters (one per player, each catches their own), item balls and hidden items, temporary NPCs that leave after you talk to them, beaten trainers, Cut trees, boulders, tiles a map script changes by flag. The server checks collisions against the player's own flags; the client filters map objects by its own flags. Seeing another player walk through an object that blocks you is accepted (as PokeMMO). Permanent NPCs (Oak in his lab, townsfolk) are shared by the zone.
- **Map phases** ([Phase 8 D19](context/multiplayer.md#decisions)): a map lists the story flags that split it into phases; zone = map + phase, so players in different phases never see each other. Maps listing none stay phase `0`. Pallet Town's maps list theirs here, if any.
- **Private scene phase:** during a scripted story scene (Oak leading the player to the lab) the player is in a private phase until it ends, so NPCs one player's script moves never show to others.

#### Done When

- A new player walks from their room to Oak's lab, gets a starter and battles the rival, like in FireRed.
- Restarting `mic-core` mid-event keeps the story progress already shown.

### 11-pallet-town-art

**Pallet Town Art Upgrade.** **Goal:** Pallet Town looks awesome with public art, with the same maps and game ([vision.md](VISION.md#art-direction)).

#### Scope

- Select and import public resource packs; credits on the About page.
- Tile catalogs and labeled tileset previews for the new packs, using the same tile names as FireRed's ([maps.md](context/maps.md#tile-catalog)).
- A new art style in the asset manifest; maps and game logic stay untouched.
- Pallet Town polished end to end with the new art.

#### Done When

- Pallet Town meets the art direction.
- Both art styles render the same Pallet Town, proving the art is swappable.

### 12-world-content

**World Content.** **Goal:** all of Kanto playable from start to end.

#### Scope

- NPCs, dialogue and story events for all of Kanto, on the event system from [Phase 10](#10-pallet-town).
- Where items come from (found, given, bought) and the effects still missing, on the item catalog, bag and money from [Phase 4](phases/04-players-room/PHASE.md); Pokémon Centers, PokéMarts.
- Gyms, badges, Elite Four and Champion.
- Field moves needed to progress (e.g. Cut, Surf, Strength), with their cut-in of the Pokémon (`CreateFieldEffectShowMon`), Sweet Scent's too ([O11](#open-items), from Phase 7 M3).
- **Map phases** (from [Phase 10](#10-pallet-town)): each map built here lists the story flags that split it into phases, e.g. Saffron City with Team Rocket vs cleared; a map that doesn't really change lists none (one phase). Personal-layer objects (Snorlax, item balls, Cut trees, boulders, trainers) use the player's flags, not phases.
- Players across a map border: connected maps' players drawn together ([O15](#open-items), Phase 8 D4).
- All Kanto maps, story trainers (spotting the player by sight range) and encounters; the Pokédex area page shows where each species lives (FireRed's area markers, Sevii Islands maps once unlocked).
- Wild content left by Phase 7 ([O10](#open-items)): every real encounter table, Surf, Rock Smash and rods hooked on their maps (server ready), the Safari Zone and Safari Ball, roamers, `FLAG_SYS_NOT_SOMEONES_PC` (the PC message's owner).
- Public art for all of Kanto, as done for Pallet Town in [Phase 11](#11-pallet-town-art).

#### Done When

- A player can play all of Kanto from the first town to the Champion.

### 13-polish-launch

**Polish and Launch.** **Goal:** a stable, public MVP.

#### Scope

- Performance and mobile tuning.
- Pokédex extras: species forms (Unown, Deoxys, Castform, Spinda, Gen 4 forms), FireRed's L/R help, the Pokédex diploma.
- Complete PWA (install, icons, offline loading screen).
- Logs, metrics and monitoring.
- Admin tools for the `admin` role.
- Chat moderation: word filter, muting and reporting ([O16](#open-items), Phase 8 D14).
- Ready for production: NATS TLS settings, logs and metrics documented; the production deployment and its PostgreSQL and Redis backups are prepared from their own Mooi chats, not here (D-016).

#### Done When

- The game is stable, ready to go public and playable on desktop and mobile; publishing it is the production deployment, prepared outside the factory (D-016).
