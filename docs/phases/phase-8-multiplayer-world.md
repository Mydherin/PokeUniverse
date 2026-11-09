# Phase 8: Multiplayer World

**Goal:** many players sharing the world efficiently ([tech-stack.md](../tech-stack.md#efficient-event-model)).

## Scope

- Zones with snapshot on enter, then deltas only. Tried on the player's house, the maps there are so far.
- Other players visible and moving, with their following Pokémon ([Phase 6](phase-6-pokemon-party/phase-6-pokemon-party.md)).
- Chat.
- Batching per tick and rate limiting.
- Reconnect with fresh snapshot.
- Bot players for load testing.

## Done When

- Many players (real or bots) move together smoothly and can chat.
