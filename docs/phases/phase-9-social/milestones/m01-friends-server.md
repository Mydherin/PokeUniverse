# M1: Friends, Server

Part of [Phase 9](../phase-9-social.md). Decisions: [context.md](context.md#friends-and-presence) D3, D5-D7, D9.

## Resume Here

Not started. First step: the migration and contracts.

## Tasks

- **Migration (goose):** `friend_requests`, `friendships` (D3), `trainers.face` (default 0, D6).
- **Contracts** (`lib-contracts/proto/pokeuniverse/social/v1/social.proto`): `Friend{id, name, gender, face, presence, last_seen}`, `Presence` enum (OFFLINE, ONLINE, BUSY_BATTLE, BUSY_TRADE, BUSY_LINK), `FriendRequest`, `FriendsList{friends, incoming, outgoing}`, `SocialEvent` (one of: request received, accepted, declined or cancelled, friend removed, presence changed) as a new `ServerMessage` field.
- **HTTP** (`mic-core`, `user` role, rate-limited): the D3 routes; errors `404` no player, `409` already friends or pending, `422` limit reached.
- **Inbox** (D9): `social.player.<id>` subscribed on session start, dropped on end or take-over; a `socialbus` like `sessionbus`.
- **Presence** (D7): the busy enum in Redis beside the session; Phase 8's `in_battle` set from it; pushed to online friends, throttled 2 s.
- **Bots:** `--friend <n>` sends and accepts requests between bots; `--verbose` prints social events.
- **Docs:** tech-stack.md endpoints list and the `social.player.<id>` subject.

## Manual Test

| # | Case | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | Request and accept | `curl` as bot A to request bot B, then accept as B | Both lists show each other; A's verbose bot gets "accepted" live | ⬜ |
| 2 | Cross request | A asks B, B asks A | One friendship, no pending left | ⬜ |
| 3 | Decline, cancel | Decline one, cancel another | Gone on both sides, live events sent | ⬜ |
| 4 | Remove | Remove a friend | Gone for both, no message to the other | ⬜ |
| 5 | Limits | 21st outgoing request; 101st friend | `422` | ⬜ |
| 6 | Presence | B logs in, enters a wild battle, logs out | A gets ONLINE, BUSY_BATTLE, OFFLINE with last seen | ⬜ |
| 7 | Two replicas | A and B on different replicas | Requests and presence arrive live | ⬜ |
| 8 | Take-over | B opens a second tab | Inbox moves to the new replica, no event lost or doubled | ⬜ |
