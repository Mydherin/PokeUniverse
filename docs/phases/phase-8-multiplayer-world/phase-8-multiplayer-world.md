# Phase 8: Multiplayer World

**Goal:** many players share the world efficiently ([tech-stack.md](../../tech-stack.md#efficient-event-model)): each one sees the others on their map walk, run and turn as FireRed draws its characters, with their following Pokémon, and they chat. Tried on the player's house (1F and 2F), the maps there are so far, with bot players filling it.

## Resume Here

**Not started.** Next: [M1 Bot players](milestones/m01-bot-players.md). Shared decisions (D1-D16) and the FireRed/HeartGold references: [context.md](milestones/context.md). Open questions for the user (chat scope, moderation, names over sprites, chat key): [Q1-Q4](milestones/context.md#questions-for-the-user); M1-M4 don't depend on them, M5-M6 use the provisional answers until answered.

Carried in: O7 (other players' following Pokémon, from [Phase 6 M9](../phase-6-pokemon-party/milestones/m09-following-check.md#follow-ups-later-phases)), done in M2 (server) and M3 (client). From Phase 7: other players seeing a player in battle (D9).

## Milestones

Order = dependencies. Marks: ⬜ not started · 🚧 in progress · ✅ done · ⏸ deferred.

| # | Milestone | Status | Needs | In short |
|---|---|---|---|---|
| M1 | [Bot players](milestones/m01-bot-players.md) | ⬜ | | Dev-only bot accounts and tokens (`POST /api/dev/bots`); `infra/bots/` Node script: log in, enter the house, walk at FireRed's pace, ping stats |
| M2 | [Zone presence on one replica](milestones/m02-zone-presence.md) | ⬜ | M1 | Contracts `OtherPlayer`, `ZoneEvents`; others in the snapshot and `Warped`; joined, left, moved, turned, follower, battle deltas per tick, encoded once per zone |
| M3 | [Drawing other players](milestones/m03-drawing-others.md) | ⬜ | M2 | Client: other trainers and their followers drawn as FireRed's object events, step queue at FireRed's speed, grass, elevation, warps, reconnect rebuild |
| M4 | [Zones across replicas](milestones/m04-zones-across-replicas.md) | ⬜ | M2 | NATS `world.zone.<map>` fan-out, Redis zone members for snapshots, presence beat and crash cleanup; two `mic-core` replicas in Compose |
| M5 | [Chat: server and contracts](milestones/m05-chat-server.md) | ⬜ | M4 | `SendChat` intent, `ChatMessage` in `ZoneEvents`, FireRed charset and length check, chat rate limit, bots chatting |
| M6 | [Chat window](milestones/m06-chat-window.md) | ⬜ | M5, M3 | Client chat log and input in Union Room chat's style; keys, touch button, mobile keyboard ([ui.md](../../ui.md#mobile-keyboard)) |
| M7 | [Load and tuning](milestones/m07-load-tuning.md) | ⬜ | M4, M5 | Bots at scale, `mic-core` zone metrics, budgets measured and written in tech-stack.md, limits tuned |
| M8 | [Phase check](milestones/m08-phase-check.md) | ⬜ | M1-M7 | The whole phase played with bots and two replicas; restarts; regression |

M1 → M2, then M3 and M4 in either order; M5 needs M4; M6 needs M5 and M3; M7 needs M4 and M5.

## Scope

- **Zones:** snapshot of the map's players on enter (and after a warp or reconnect), then only deltas, batched per 50 ms tick and encoded once per zone (M2); the same zone across every `mic-core` replica (M4).
- **Other players:** visible walking, running and turning, with their following Pokémon (O7), drawn as FireRed draws its characters; no collision between players (D6) (M2, M3).
- **Chat:** to the players on the same map, in FireRed's charset (M5, M6).
- **Rate limits:** per-player intents (exists, 20/s burst 40), chat on its own limit; budgets measured (M5, M7).
- **Reconnect:** a fresh snapshot with the others, drawn again from it (M2, M3, M4).
- **Bot players** for load testing (M1, M7).
- **Not here:** acting on another player (A on them, the social menu, trade, battle: Phase 9); friends and private messages (Phase 9); chat moderation beyond length, charset and rate (D14, Phase 13); seeing players on connected maps across a map border (no connections yet: Phase 12, D4).

## Done When

- Two real players and many bots walk the house together; each sees the others and their followers move smoothly at FireRed's speed, across both maps and two `mic-core` replicas.
- Players on the same map chat; a flood is limited.
- A reconnect, a warp, and a restart or crash of one replica redraw the others from a fresh snapshot, with no ghost left.
- The load budget measured in M7 holds, with no regression in the regression check.
