# M1: Friends, Server

Part of [Phase 9](../phase-9-social.md). Decisions: [context.md](context.md#friends-and-presence) D3, D5-D7, D9.

## Resume Here

✅ Done 2026-11-13: built and every Manual Test case passed (bots, curl, the headless driver, two replicas). Nothing left. M2 builds on it.

**What's there (for M2+):**
- `mic-core/internal/social/`: `social.go` (`Service`: `Open` inbox, `SetPresence` throttled push, `presences` read), `friends.go` (HTTP `Handler`, the D3 routes). Wired in `cmd/mic-core/main.go`; `world.Social` interface (`world.go`) called from `Join` (Open before `Claim`, then ONLINE or BUSY_BATTLE), `Leave` (close inbox, OFFLINE only if `live.Release` ended the session, so a take-over shows none) and `zone.showChanges` (battle in/out). Clients get `ServerMessage.social` (field 23).
- Migration `00019_create_friends.sql` (`friend_requests`, `friendships`, `trainers.face`, `trainers.last_seen_at`), queries `queries/social.sql`, proto `social/v1/social.proto`. `{id}` in every route is the other player's account ID (= `OtherPlayer.id`).
- Bots: `--friend n` (the last bot asks bot-<first>…, they accept); the verbose bot prints `social …` JSON.

**Differences and choices (with reasons):**
- Presence is read with one Redis pipeline (`EXISTS player:<id>:session` + `GET player:<id>:busy`), not one `MGET`: the session key is a hash, which `MGET` can't read (D7's intent, one round trip, kept).
- Last seen is `trainers.last_seen_at`, written when OFFLINE is pushed (PostgreSQL, so it outlives Redis).
- Remove sends `friend_removed` only to the remover's own inbox (their view); the other gets nothing (D3).
- A request past the receiver's 50 incoming drops their oldest; its sender gets `request_closed` `DROPPED`.
- Same-replica take-over keeps one NATS subscription and swaps where it delivers (no doubled event); across replicas the new one subscribes before claiming the session.
- Rate limits are per IP (as every route): 120/min for the list, 120/min shared by the changes.

**Testing notes:** `/api/dev/bots` takes at most 100 bots per call and a spawn needs `map`; it's rate-limited, so fetch tokens once per script. Which replica holds an inbox: `docker compose exec nats wget -qO- "localhost:8222/connz?subs=1"` (each replica's `mic-core` connection lists its `social.player.<id>`). The headless driver needs a `window.__self` hook (`{x, y}` of `this.avatar` after `this.draw()` in `overworld.ts`'s update), added as `TEMP-PLAYIT` and removed after.

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
| 1 | Request and accept | `curl` as bot A to request bot B, then accept as B | Both lists show each other; A's verbose bot gets "accepted" live | ✅ |
| 2 | Cross request | A asks B, B asks A | One friendship, no pending left | ✅ |
| 3 | Decline, cancel | Decline one, cancel another | Gone on both sides, live events sent | ✅ |
| 4 | Remove | Remove a friend | Gone for both, no message to the other | ✅ |
| 5 | Limits | 21st outgoing request; 101st friend | `422` | ✅ |
| 6 | Presence | B logs in, enters a wild battle, logs out | A gets ONLINE, BUSY_BATTLE, OFFLINE with last seen | ✅ |
| 7 | Two replicas | A and B on different replicas | Requests and presence arrive live | ✅ |
| 8 | Take-over | B opens a second tab | Inbox moves to the new replica, no event lost or doubled | ✅ |
