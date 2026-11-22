# Vision

## Problem and goals

PokeUniverse is a **browser-based Pokémon MMO**: a Gen 3-style game with Pokémon and mechanics up to Gen 4, played online with other players.

- **Fan project. No monetization:** no ads, no payments, no donations.
- **Built entirely with AI.**
- **Goal, the MVP:** **all of Kanto**, playable from the first town to the Champion, **with social features**: zone chat, friends, direct messages and private channels (no parties), trading and PvP battles (single, double, 4-player multi) in the Pokémon Center 2F as FireRed's link features. Plan: [ROADMAP.md](ROADMAP.md).

## Users

- **Players** of a FireRed-like game with Gen 4's depth, on **desktop and mobile** browsers (touch controls on mobile), in the browser or installed as a **PWA** (iOS Safari, Android Chrome).
- **Players together:** many in the same world, seeing each other, chatting, trading and battling.
- **Admins:** accounts with the `admin` role, who see the Admin section and its tools.
- **The AI developers:** every change is made by AI agents, so everything is text or data they can read, write and verify ([Full AI Development](#full-ai-development)).

## In scope

### Experience

- An ordinary **web application**: login page, several sections, and a **Play** button.
- **Play** opens the game directly in the browser.
- **Browser-native:** no downloads, installs or compiled files.
- Plays on **desktop and mobile** (touch controls on mobile), in the browser or installed as a **PWA**.
- **Original, modern, fully responsive UI** (see [ui.md](context/ui.md)).
- Login with Google only (see [ARCHITECTURE.md](ARCHITECTURE.md#authentication)).

### Game

| Aspect | Decision |
|---|---|
| Graphics | Gen 3 style |
| Pokémon | All Pokémon up to **Gen 4** (493) |
| Mechanics | **Gen 4 rules**: physical/special split, Gen 4 moves, abilities and items |
| Base | **Pokémon FireRed**: its system is matched whenever possible, its code is never reused |
| World | Own world, starting from FireRed's map and extending it |
| Multiplayer | MMO: many players in the same world |

### FireRed as Reference

- **The game's system matches FireRed whenever possible:** screens, menus, flows, input, messages, sounds, animations and how the world behaves.
- **Battle and Pokémon rules are Gen 4:** battle mechanics, moves, abilities, what items do in battle, stats, natures, growth, learning and evolution. Where they meet, the rule is Gen 4 and FireRed's way of showing it stays.
- **Unless it conflicts with the MMO:** where FireRed's behavior can't work in an MMO, as much of it as possible is kept. SAVE behaves exactly like FireRed's dialog, though the MMO saves everything all the time.
- **A difference needs a reason:** a Gen 4 rule, the MMO or the user's request. *Why: the game should feel like FireRed, with Gen 4's depth.*
- The start of the game (intro, Oak's speech, room, Pallet Town) is rebuilt **exactly like FireRed**, with its original graphics, music and text.
- **All code is new:** Go on the server, Phaser on the frontend. No FireRed code is reused (see [ARCHITECTURE.md](ARCHITECTURE.md#firered-as-reference)).
- The FireRed map is the starting world; it is kept and **extended** with new areas.

### Following Pokémon

- **Required feature:** the player's Pokémon walks behind them in the overworld.
- Overworld sprites for **every Pokémon up to Gen 4**, in **HGSS** style.
- **How it behaves** comes from HeartGold and SoulSilver's decompilation (`references/pokeheartgold/`), the games that have it; FireRed has nothing to match. Behavior only, like every reference.

### Art Direction

- **Start faithful:** the intro, Oak's speech, the player's room and Pallet Town first use **FireRed's original graphics and music**, taken from the decompilation at build time and never committed ([audio.md](context/audio.md)) ([ARCHITECTURE.md](ARCHITECTURE.md#firered-as-reference)).
- **Then upgrade:** public resource packs replace them, starting with Pallet Town ([ROADMAP.md](ROADMAP.md)).
- **Species after FireRed (387-493):** Gen 3-style pictures, icons, footprints and cries from [pokeemerald-expansion](https://github.com/rh-hideout/pokeemerald-expansion), copied at build time like FireRed's; its artists are credited (its `CREDITS.md`) wherever the game credits its packs.
- **References for the upgrade:** Pokémon Hoenn Adventures and Pokémon Azul Agua.
- **No custom art:** only FireRed's art and public resource packs, for efficiency.
- Goal: the most beautiful result possible from those packs.
- Respect each pack's license and credit requirements.

### Non-Functional Requirements

#### Logic Decoupled from Graphics

- Game logic is **completely separate** from the presentation.
- The whole UI and art can be replaced (e.g. by Gen 5 graphics or 3D) and **the game stays exactly the same**.
- **Keep it simple:** achieve this with clear boundaries, not extra layers or complexity.

#### Performance and Scale

- Smooth gameplay in the browser on desktop and mobile.
- Client-server architecture that is **efficient, scalable and maintainable** (see [ARCHITECTURE.md](ARCHITECTURE.md)).

#### No Lost Progress

- A crash or restart **never loses a change a player has seen**: a caught Pokémon, a trade, a step, a battle turn.
- Every change is saved as it happens, not periodically or on logout (see [ARCHITECTURE.md](ARCHITECTURE.md#saving-state-resilience)).

#### Full AI Development

- Everything is built by AI: code, maps, content and configuration.
- **No manual tools** (e.g. no Tiled for maps). Everything is text or data the AI can read, write and verify.

## Out of scope

- **Monetization** of any kind: ads, payments, donations.
- **Custom art:** only FireRed's art and public resource packs.
- **FireRed's code:** never copied or reused; only its behavior, and its assets at build time, never committed.
- **Manual or visual editing tools** (Tiled and the like).
- **Regions beyond Kanto** in the MVP (the world is extended after it).
- **Parties:** dropped, private channels replace them (Phase 9 D1).
- **Login methods other than Google.**
- **Automated test suites** (unit, integration, end to end in code): testing is played in game ([D-004](DECISIONS.md#d-004-no-automated-tests-manual-end-to-end-tests-in-game)).
- **Production deployments and backups** are not built by the factory: they are prepared from their own Mooi chats.

## Success criteria

- A player can play **all of Kanto from the first town to the Champion**, like FireRed with Gen 4's rules, on desktop and mobile.
- Players meet in the world, chat, become friends, message each other, talk in private channels, trade and battle (single, double, multi) in the Pokémon Center 2F.
- **No lost progress:** a crash, restart or disconnect never loses or duplicates anything a player has seen.
- Smooth on desktop and phones, with the measured load budgets holding across `mic-core` replicas.
- Pallet Town, then all of Kanto, upgraded with public art, proving the art is swappable without changing the game.
- The game is **public and stable** (Phase 13's done when).
