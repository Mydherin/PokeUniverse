# M14: Social Load and Tuning

Part of [Phase 9](../phase-9-social.md). Decisions: [context.md](context.md#messaging) D7-D10, D16, D19.

## Resume Here

Not started. Needs M5, M6, M8.

## Tasks

- **Targets:** 500 players online over 2 replicas, each with 50 friends; 100 channels of 50 members chatting at the rate limit; 50 link rooms opening and closing on one 2F; DM p99 delivery ≤ 150 ms; presence fan-out under 1 ms per change; Postgres insert p99 ≤ 10 ms.
- **Metrics:** `mic-core` counters and histograms (message save, publish, inbox delivery, presence fan-out, room ops); `make logs` for drops.
- **Tune:** presence throttle, page size, prune job, indexes on `messages(conversation, seq)`.
- **Docs:** budgets measured in tech-stack.md (Efficient Event Model), as Phase 8 M8 did.

## Manual Test

| # | Case | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | Friends at scale | 500 bots, 50 friends each, logging in and out | Presence delivered, budgets hold | ⬜ |
| 2 | Channel flood | 100 channels flooding | Delivery p99 in budget, rate limits apply | ⬜ |
| 3 | DMs | Bots DMing at the limit | No loss, order kept | ⬜ |
| 4 | Rooms | 50 rooms churning on one 2F | Lists right, no stuck room | ⬜ |
| 5 | Replica kill | Kill one replica under load | Players reconnect, nothing lost or doubled | ⬜ |
| 6 | Real player | Play during the load on PC and the mobile preset | Smooth game and panel | ⬜ |
