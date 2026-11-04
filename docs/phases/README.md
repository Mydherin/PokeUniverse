# Phases

High-level plan to build the **MVP: all of Kanto, including social features**.

## Principles

- **Each phase ends with something working and testable.**
- **Foundations before features:** later phases only add pieces.
- **Global systems before content:** what affects the whole game (battles, items on Pokémon, multiplayer, social) is built first, on test content. Maps and events come last. *Why: content built on finished systems isn't redone.*
- **Server-authoritative from day one:** even single-player movement goes through the server.
- **Faithful first, then better:** the start of the game (intro, Oak, room, Pallet Town) is rebuilt exactly like FireRed with its original art, then upgraded with public art.
- **Riskiest parts early:** the map pipeline and client-server movement validate the approach.

## Phases

✅ done · 🚧 in progress

| # | Phase | Done when |
|---|---|---|
| 0 | [Foundations](phase-0-foundations.md) ✅ | Whole stack starts with one command; SPA ↔ `mic-core` WebSocket works |
| 1 | [Web App and Auth](phase-1-web-app-auth.md) ✅ | Log in with Google and reach an empty game screen |
| 2 | [FireRed Intro](phase-2-firered-intro.md) ✅ | Play shows FireRed's intro, title screen and menu like the original |
| 3 | [New Game with Oak](phase-3-new-game.md) ✅ | A new player finishes Oak's speech and their trainer is saved |
| 4 | [Player's Room](phase-4-players-room.md) 🚧 | Walk in your room, server-authoritative; START menu and PC like FireRed; maps edited as text; the Gen 4 battle system ✅ against a test trainer ([plan](../plans/battles/README.md)). Left: SAVE, the stairs to the first floor |
| 5 | [Pokémon and Party](phase-5-pokemon-party.md) | Items and TMs work on Pokémon; manage your team and boxes; lead Pokémon follows you |
| 6 | [Wild Battles and Catching](phase-6-wild-battles-catching.md) | Wild battles and catching work, on a test encounter |
| 7 | [Multiplayer World](phase-7-multiplayer-world.md) | Many players move together smoothly, with chat |
| 8 | [Social](phase-8-social.md) | Players use the social menus, trade and battle each other |
| 9 | [Pallet Town](phase-9-pallet-town.md) | All of Pallet Town and its events, up to choosing a starter and the first rival battle |
| 10 | [Pallet Town Art Upgrade](phase-10-pallet-town-art.md) | Pallet Town with awesome public art, same game |
| 11 | [World Content](phase-11-world-content.md) | All of Kanto playable start to end |
| 12 | [Polish and Launch](phase-12-polish-launch.md) | Game is public and stable |
