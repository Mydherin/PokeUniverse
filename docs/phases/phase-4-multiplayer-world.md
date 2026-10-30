# Phase 4: Multiplayer World

**Goal:** many players sharing the world efficiently ([tech-stack.md](../tech-stack.md#efficient-event-model)).

## Scope

- Zones with snapshot on enter, then deltas only.
- Other players visible and moving.
- Chat.
- Batching per tick and rate limiting.
- Reconnect with fresh snapshot.
- Bot players for load testing.

## Done When

- Many players (real or bots) move together smoothly and can chat.
