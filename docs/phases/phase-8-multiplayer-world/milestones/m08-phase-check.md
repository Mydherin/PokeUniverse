# M8 Phase Check ⬜

Part of [Phase 8](../phase-8-multiplayer-world.md). **Needs:** M1-M7. Rules: [context.md](context.md) (all), [Playing a Milestone](context.md#playing-a-milestone).

**Done when:** the phase's Done When is played end to end, every restart and crash case passes, and the regression check finds nothing; leftovers are moved to later phases in [index.md](../../index.md#open-items).

## Resume Here

**Not started.** First step: back up the test account's save (Phase 6's backup steps) and start two replicas with bots.

## Play It

1. **Together:** two real players (pane tab + `?bot=` tab) and 30 bots on both maps, two replicas: each sees the others and their followers walk, run, turn, use the stairs; walking through others never corrects.
2. **Followers:** a lead swap, a faint in the test grass making another lead, an empty-follower case if any: seen by the other tab.
3. **Battles:** one tab in a wild battle and one in the room trainer's: the other sees them standing; after it they walk again.
4. **Chat:** lines between the two tabs and bots on one map; not on the other map; flood limited; charset and length; mobile keyboard.
5. **Reconnects:** network off and on in one tab: the others drawn again, chat log cleared; take-over (same account in a third tab): the old one stops, the others see one leave and one join.
6. **Restarts:** restart each replica in turn, `docker kill` one, restart Redis and NATS: no ghost players, everyone back within 15 s, no lost position.
7. **Load:** M7's ramp, short (100 on one map): numbers still within D18.
8. **Regression:** Phase 7's regression check (party, bag, PC, boxes, the room trainer, the test grass, catching).
9. Restore the backup; `make bots-clean`.

## Follow-ups (Later Phases)

- To fill in at the end: what moved to Phase 9 (trainer card on A, friends, private and party chat, busy state in the social menu), Phase 10 (story flags, personal layer, map phases, D19-D20), Phase 12 (players across connected maps), Phase 13 (moderation, production limits).
