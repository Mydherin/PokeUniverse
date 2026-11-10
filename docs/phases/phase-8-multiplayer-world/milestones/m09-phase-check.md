# M9 Phase Check ⬜

Part of [Phase 8](../phase-8-multiplayer-world.md). **Needs:** M1-M8. Rules: [context.md](context.md) (all), [Playing a Milestone](context.md#playing-a-milestone).

**Done when:** the phase's Done When is played end to end, every restart and crash case passes, and the regression check finds nothing; leftovers are moved to later phases in [index.md](../../index.md#open-items).

## Resume Here

**Not started.** First step: back up the test account's save (Phase 6's backup steps) and start two replicas with bots.

## Manual Test

| # | Case | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | Backup | Phase 6's backup steps | Save backed up in the shared notes folder | ⬜ |
| 2 | Together | Two real tabs (pane + `?bot=`), 30 bots on both maps, two replicas | Each sees the others and their followers walk, run, turn, use the stairs; no `Correction` walking through | ⬜ |
| 3 | Followers | Lead swap; a faint in the test grass making another lead | The other tab sees each new follower | ⬜ |
| 4 | Battles | One tab in a wild battle, the other in the room trainer's | Each sees the other standing; both walk after | ⬜ |
| 5 | Chat, PC | Lines between tabs and bots; the other map; flood; charset and length; panel | Zone-only, limited, valid text only | ⬜ |
| 6 | Chat, phones | Ticker, sheet, compose, gestures on iOS Safari and Android Chrome (D21-D23) | As M6, M7 | ⬜ |
| 7 | Reconnect and take-over | Network off/on in one tab; same account in a third tab | Others redrawn, chat log cleared; old tab stops, one leave + one join | ⬜ |
| 8 | Restarts | Restart each replica in turn, `docker kill` one, restart Redis and NATS | No ghost, everyone back within 15 s, no lost position | ⬜ |
| 9 | Load | M8's ramp, short (100 on one map) | Within D18 | ⬜ |
| 10 | Regression | Phase 7's check: party, bag, PC, boxes, room trainer, test grass, catching | Nothing broken | ⬜ |
| 11 | Clean up | Restore the backup; `make bots-clean` | Save equal to the backup; no bot accounts | ⬜ |

## Follow-ups (Later Phases)

- To fill in at the end: what moved to Phase 9 (trainer card on A, friends, private and party chat, busy state in the social menu), Phase 10 (story flags, personal layer, map phases, D19-D20), Phase 12 (players across connected maps), Phase 13 (moderation, production limits).
