---
milestones: [01-bot-players, 02-zone-presence, 03-drawing-others, 04-zones-across-replicas, 05-chat-server, 06-chat-window, 07-mobile-compose, 08-load-tuning, 09-phase-check]
---

# Phase 8: Multiplayer World

**Goal:** many players share the world efficiently ([ARCHITECTURE.md](../../ARCHITECTURE.md#efficient-event-model)): each one sees the others on their map walk, run and turn as FireRed draws its characters, with their following Pokémon, and they chat. Tried on the player's house (1F and 2F), the maps there are so far, with bot players filling it.

## Resume Here

**Done (2026-11-22, D-014):** every milestone played and passing (2026-11-11), except the cases that need the user's real phones: [M7](milestones/07-mobile-compose.md#resume-here) cases 9-10 and case 11's naming screen, [M9](milestones/09-phase-check.md#resume-here) case 6, now open item [O22](../../ROADMAP.md#open-items), played by the user (a ❌ there becomes a change request). On the phones: **iPhone (Safari, then the PWA)** and **Android (Chrome, then the PWA)**, dev server on the LAN ([How to Test in Game](../../ARCHITECTURE.md#how-to-test-in-game)), on each phone: M7 cases 1-8 (compose bar on the keyboard, portrait and landscape, swipe and back gestures, no page scroll or zoom on focus, nothing behind the keyboard); the naming screen (letter grid, no device keyboard: catch a Pokémon in the test grass, YES to the nickname); M9 case 6 (ticker, sheet, compose, gestures with a second player or bots chatting). Then mark them in M7 and M9 and close O22. Fixed in M9: walking blocked after a catch (f977d49). After the phase check, the user's desktop fixes (M6 cases 13-19 ✅): `T` only opens chat, scroll bar only on overflow, game centered at any size and drawn at 240×160 then scaled crisply, so no stray lines while walking (b818078, 8857e29). Leftovers moved: O13 (Phase 10), O14 (Phase 9), O15 (Phase 12), O16 (Phase 13) ([ROADMAP.md](../../ROADMAP.md#open-items)). Headless driver: M9's Resume Here. Shared decisions (D1-D24) and references: [context/multiplayer.md](../../context/multiplayer.md).

Carried in: O7 (other players' following Pokémon, from [Phase 6 M9](../06-pokemon-party/milestones/09-following-check.md#follow-ups-later-phases)), server done in M2, client in M3 (closed). From Phase 7: other players seeing a player in battle (D9).

## Milestones

Order = dependencies. Each milestone's status is in its file's front matter.

| # | Milestone | Needs | In short |
|---|---|---|---|
| M1 | [Bot players](milestones/01-bot-players.md) | | Dev-only bot accounts and tokens (`POST /api/dev/bots`); `infra/bots/` Node script: log in, enter the house, walk at FireRed's pace, ping stats |
| M2 | [Zone presence on one replica](milestones/02-zone-presence.md) | M1 | Contracts `OtherPlayer`, `ZoneEvents`; others in the snapshot and `Warped`; joined, left, moved, turned, follower, battle deltas per tick, encoded once per zone |
| M3 | [Drawing other players](milestones/03-drawing-others.md) | M2 | Client: other trainers and their followers drawn as FireRed's object events, step queue at FireRed's speed, grass, elevation, warps, reconnect rebuild |
| M4 | [Zones across replicas](milestones/04-zones-across-replicas.md) | M2 | NATS `world.zone.<map>.<phase>` fan-out, Redis zone members for snapshots, presence beat and crash cleanup; two `mic-core` replicas in Compose |
| M5 | [Chat: server and contracts](milestones/05-chat-server.md) | M4 | `SendChat` intent, `ChatMessage` in `ZoneEvents`, FireRed charset and length check, chat rate limit, bots chatting |
| M6 | [Chat window](milestones/06-chat-window.md) | M5, M3 | Client chat log in Union Room chat's style; PC panel (scroll bar), `T` key, game scaled to fit beside or above it; phone ticker, chat button, sheet with channel chips |
| M7 | [Mobile compose](milestones/07-mobile-compose.md) | M6 | `visualViewport` keyboard pattern ([ui.md](../../context/ui.md#mobile-keyboard)); compose bar on the keyboard, portrait and landscape; swipe and back gestures; iOS and Android checks |
| M8 | [Load and tuning](milestones/08-load-tuning.md) | M4, M5 | Bots at scale, `mic-core` zone metrics, budgets measured and written in ARCHITECTURE.md, limits tuned |
| M9 | [Phase check](milestones/09-phase-check.md) | M1-M8 | The whole phase played with bots and two replicas; restarts; regression |

M1 → M2, then M3 and M4 in either order; M5 needs M4; M6 needs M5 and M3; M7 needs M6; M8 needs M4 and M5.

## Scope

- **Zones:** a zone is map + phase (D19), phase `0` everywhere here; snapshot of the zone's players on enter (and after a warp or reconnect), then only deltas, batched per 50 ms tick and encoded once per zone (M2); the same zone across every `mic-core` replica (M4).
- **Other players:** visible walking, running and turning, with their following Pokémon (O7), drawn as FireRed draws its characters; no collision between players (D6) (M2, M3).
- **Chat:** the zone's general chat, in FireRed's charset (M5, M6), mobile-first: typing on phones re-laid out around the on-screen keyboard (M7, D21-D23).
- **Rate limits:** per-player intents (exists, 20/s burst 40), chat on its own limit; budgets measured (M5, M8).
- **Reconnect:** a fresh snapshot with the others, drawn again from it (M2, M3, M4).
- **Bot players** for load testing (M1, M8).
- **Not here:** acting on another player (A on them shows the trainer card, the social menu, trade, battle: Phase 9); friends, private and party chat (Phase 9); story flags, the personal layer (D20), map phase flags and private scene phases (Phase 10); chat moderation beyond length, charset and rate (D14, Phase 13, O16); seeing players on connected maps across a map border (no connections yet: Phase 12, D4, O15).

## Done When

- Two real players and many bots walk the house together; each sees the others and their followers move smoothly at FireRed's speed, across both maps and two `mic-core` replicas.
- Players on the same map chat, on PC and on phones (iOS Safari, Android Chrome) seeing their whole sentence, the recent lines and the game while typing; a flood is limited.
- A reconnect, a warp, and a restart or crash of one replica redraw the others from a fresh snapshot, with no ghost left.
- The load budget measured in M8 holds, with no regression in the regression check.
