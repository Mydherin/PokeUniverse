# Phases

High-level plan to build the **MVP: all of Kanto, including social features**.

## Principles

- **Each phase ends with something working and testable.**
- **Foundations before features:** later phases only add pieces.
- **Server-authoritative from day one:** even single-player movement goes through the server.
- **Faithful first, then better:** the start of the game (intro, Oak, room, Pallet Town) is rebuilt exactly like FireRed with its original art, then upgraded with public art.
- **Riskiest parts early:** the map pipeline and client-server movement validate the approach.

## Phases

| # | Phase | Done when |
|---|---|---|
| 0 | [Foundations](phase-0-foundations.md) ✅ | Whole stack starts with one command; SPA ↔ `mic-core` WebSocket works |
| 1 | [Web App and Auth](phase-1-web-app-auth.md) ✅ | Log in with Google and reach an empty game screen |
| 2 | [FireRed Intro](phase-2-firered-intro.md) ✅ | Play shows FireRed's intro, title screen and menu like the original |
| 3 | [New Game with Oak](phase-3-new-game.md) ✅ | A new player finishes Oak's speech and their trainer is saved |
| 4 | [Player's Room](phase-4-players-room.md) | Walk in your room, server-authoritative; START menu and PC like FireRed; maps edited as text |
| 5 | [Pallet Town](phase-5-pallet-town.md) | All of Pallet Town and its events, up to choosing a starter |
| 6 | [Pallet Town Art Upgrade](phase-6-pallet-town-art.md) | Pallet Town with awesome public art, same game |
| 7 | [Multiplayer World](phase-7-multiplayer-world.md) | Many players move together smoothly, with chat |
| 8 | [Pokémon and Party](phase-8-pokemon-party.md) | Have a team; lead Pokémon follows you |
| 9 | [Battles](phase-9-battles.md) | Battle, catch and level up |
| 10 | [World Content](phase-10-world-content.md) | All of Kanto playable start to end |
| 11 | [Social](phase-11-social.md) | Players trade and battle each other |
| 12 | [Polish and Launch](phase-12-polish-launch.md) | Game is public and stable |
