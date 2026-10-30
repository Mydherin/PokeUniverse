# Phases

High-level plan to build the **MVP: all of Kanto, including social features**.

## Principles

- **Each phase ends with something working and testable.**
- **Foundations before features:** later phases only add pieces.
- **Server-authoritative from day one:** even single-player movement goes through the server.
- **Riskiest parts early:** the map pipeline and client-server movement validate the approach.

## Phases

| # | Phase | Done when |
|---|---|---|
| 0 | [Foundations](phase-0-foundations.md) (in progress: `mic-battles` deferred) | Whole stack starts with one command; SPA ↔ `mic-core` WebSocket works |
| 1 | [Web App and Auth](phase-1-web-app-auth.md) | Log in with Google and reach an empty game screen |
| 2 | [Map and Asset Pipeline](phase-2-map-pipeline.md) | AI edits a text map and sees the compiled result |
| 3 | [Single-Player World](phase-3-single-player-world.md) | Walk between maps on desktop and mobile |
| 4 | [Multiplayer World](phase-4-multiplayer-world.md) | Many players move together smoothly, with chat |
| 5 | [Pokémon and Party](phase-5-pokemon-party.md) | Have a team; lead Pokémon follows you |
| 6 | [Battles](phase-6-battles.md) | Battle, catch and level up |
| 7 | [World Content](phase-7-world-content.md) | All of Kanto playable start to end |
| 8 | [Social](phase-8-social.md) | Players trade and battle each other |
| 9 | [Polish and Launch](phase-9-polish-launch.md) | Game is public and stable |
