# Vision

## Purpose

PokeUniverse is a **browser-based Pokémon MMO**: a Gen 3-style game with Pokémon and mechanics up to Gen 4, played online with other players.

- **Fan project. No monetization:** no ads, no payments, no donations.
- **Built entirely with AI.**

## MVP

- **All of Kanto**, playable from the first town to the Champion.
- **Includes social features:** chat, trading and PvP battles.
- Plan: [phases/](phases/README.md).

## Experience

- An ordinary **web application**: login page, several sections, and a **Play** button.
- **Play** opens the game directly in the browser.
- **Browser-native:** no downloads, installs or compiled files.
- Plays on **desktop and mobile** (touch controls on mobile), in the browser or installed as a **PWA**.
- **Original, modern, fully responsive UI** (see [ui.md](ui.md)).
- Login with Google only (see [tech-stack.md](tech-stack.md#authentication)).

## Game

| Aspect | Decision |
|---|---|
| Graphics | Gen 3 style |
| Pokémon | All Pokémon up to **Gen 4** (493) |
| Mechanics | **Gen 4 rules**: physical/special split, Gen 4 moves, abilities and items |
| Base | **Pokémon FireRed**, as reference only |
| World | Own world, starting from FireRed's map and extending it |
| Multiplayer | MMO: many players in the same world |

### FireRed as Reference

- FireRed is used to understand **how things work** (movement, rules, maps, menus).
- The start of the game (intro, Oak's speech, room, Pallet Town) is rebuilt **exactly like FireRed**, with its original graphics, music and text.
- **All code is new:** Go on the server, Phaser on the frontend. No FireRed code is reused (see [tech-stack.md](tech-stack.md#firered-as-reference)).
- The FireRed map is the starting world; it is kept and **extended** with new areas.

### Following Pokémon

- **Required feature:** the player's Pokémon walks behind them in the overworld.
- Overworld sprites for **every Pokémon up to Gen 4**, in **HGSS** style.

## Art Direction

- **Start faithful:** the intro, Oak's speech, the player's room and Pallet Town first use **FireRed's original graphics and music**, taken from the decompilation at build time and never committed ([audio.md](audio.md)) ([tech-stack.md](tech-stack.md#firered-as-reference)).
- **Then upgrade:** public resource packs replace them, starting with Pallet Town ([phases](phases/README.md)).
- **References for the upgrade:** Pokémon Hoenn Adventures and Pokémon Azul Agua.
- **No custom art:** only FireRed's art and public resource packs, for efficiency.
- Goal: the most beautiful result possible from those packs.
- Respect each pack's license and credit requirements.

## Non-Functional Requirements

### Logic Decoupled from Graphics

- Game logic is **completely separate** from the presentation.
- The whole UI and art can be replaced (e.g. by Gen 5 graphics or 3D) and **the game stays exactly the same**.
- **Keep it simple:** achieve this with clear boundaries, not extra layers or complexity.

### Performance and Scale

- Smooth gameplay in the browser on desktop and mobile.
- Client-server architecture that is **efficient, scalable and maintainable** (see [tech-stack.md](tech-stack.md)).

### No Lost Progress

- A crash or restart **never loses a change a player has seen**: a caught Pokémon, a trade, a step, a battle turn.
- Every change is saved as it happens, not periodically or on logout (see [tech-stack.md](tech-stack.md#saving-state-resilience)).

### Full AI Development

- Everything is built by AI: code, maps, content and configuration.
- **No manual tools** (e.g. no Tiled for maps). Everything is text or data the AI can read, write and verify.
