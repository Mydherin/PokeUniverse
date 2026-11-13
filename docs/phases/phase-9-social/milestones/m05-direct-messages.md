# M5: Direct Messages

Part of [Phase 9](../phase-9-social.md). Decisions: [context.md](context.md#messaging) D8-D11, D13, D14.

## Resume Here

✅ **Done 2026-11-13.** Every Manual Test case passed in game (headless Chromium: PC 1600×720, iPhone 390×844 and Android 412×915 presets with touch via CDP and the fake keyboard; two replicas). No `TEMP-PLAYIT` left, spa rebuilt, stack at one replica. Not committed (the orchestrator commits).

**Bot check ✅ 2026-11-13:** `node infra/bots/bots.ts --count 2 --first 451 --map pallet_town_players_house_1f --idle --friend 1 --dm --verbose` (~2 min) printed 7 `message` lines and `select count(*) from messages` grew 155 → 162. The earlier empty run was `--first 951`, which `run.ts` refuses (`--first` is 1-500); no code change.

**What M6+ use:**
- Server: `mic-core/internal/social/messages.go`: `Service.Send(ctx, me, *SendMessage, text)` (direct only; channels return NOT_ALLOWED, M6 adds the member check), `MarkRead`, `PruneLoop` (daily, every replica; started in `main.go`), HTTP `conversations` / `messages` (`?before=` newest 50 by default, `?after=` up to 50, `more`). Queries `queries/messages.sql`; migration `00020_create_messages.sql` (`conversations` with `kind`, `pair_a/pair_b` for direct, `last_seq`, `last_at`; `conversation_members.last_read_seq`; `messages` with `client_id`, unique per sender). Seq: one CTE (UPDATE `last_seq` + INSERT); a retried `client_id` hits the unique index (23505) and is re-sent to the sender only.
- WebSocket: `ClientMessage.send_message` (39) / `mark_read` (40); `realtime.Handler` takes a `Messenger` (`NewHandler(tokens, game, friends, …)`). Rate: zone chat's `c.chat` limiter (one budget); refused → `SocialEvent.send_failed` to the connection only (RATE, INVALID, NOT_ALLOWED, ERROR). Saved → `SocialEvent.message` (`ConversationMessage`, `client_id` only for the sender, `friend` = the other member as the receiver sees it) on both inboxes.
- Client: `game/world/messages.ts` `DirectMessages` (`ChatWindow.messages`): conversation key stays `friend:<id>` (`friendKey`), `c.serverId`, `c.more`, `c.readSent`; `load()` on every snapshot after `social.load()` (`overworld.ts`), `opened`/`older` (scroll to top, `LogView.onScroll`/`atTop`), `send`/`retry`, read marker while the thread is open and the tab visible and focused. `ChatLog(max)`: `add` returns false for a known seq, replaces the pending copy by `clientId`; `prepend`, `firstSeq`, `lastSeq`, `setUnread`, `touched`. `ChatLine.seq/clientId/state`. M6 rooms: give `Conversation` a server ID key and reuse `older`/`markRead`.

**Choices (with reasons):**
- Own line: grey while sending, red with `×` before its text when failed (red alone is also a player's color); tap it to send again (same `client_id`). No answer in 10 s → failed; such lines (not refused ones) go again on reconnect.
- A direct line typed offline is kept as sending and sent on reconnect (zone lines still need the world, Phase 8).
- Client rate uses the zone log's limiter for every conversation (one budget, D8); over it the text stays in the field, as Phase 8.
- Refusal notices (panel's own texts, `REFUSED` in `chat-window.ts`): "Only friends can be sent messages.", "Too fast. Tap the red line to send it again.", "Not sent. Tap the red line to send it again."; the PC toast for a direct line is "NAME: text" (no title repeat).
- Removed friend: both get NOT_ALLOWED; history and the row stay (D11).

**Testing:** driver in the shared notes folder `m5-headless/` (`m5lib.mjs`; `c51` case 1, `c524` 2 and 4, `c53` 3, `c55` 5, `c56` 6, `c578` 7-8 and the `client_id` dedupe, `c59` 9), run with M4's `two.mjs` and the M3 `TEMP-PLAYIT` hook. Case 3 seeded 120 messages by SQL into conversation 1 (bots 901-902). Drop one page's socket: `window.__chat.link.ws.close()`.

**Files:** `lib-contracts/proto/pokeuniverse/social/v1/social.proto`, `realtime/v1/realtime.proto`; `mic-core/migrations/00020_create_messages.sql`, `queries/messages.sql`, `internal/social/messages.go`, `internal/social/friends.go` (routes), `internal/realtime/realtime.go`, `cmd/mic-core/main.go`; `infra/bots/run.ts` (`--dm`); `spa-pokeuniverse/src/game/world/{messages.ts (new), chat.ts, conversations.ts}`, `realtime/connection.ts`, `game/firered/{chat-window.ts, boot.ts, overworld.ts}`. Builds: Go build+vet pass (docker, Phase 8 M4's command), `tsc --noEmit` passes. `docs/ui.md` not updated yet for the sending/failed line look (one line in Social Panel, do it with M6).

## Tasks

- **Migration:** `conversations(id, kind, created_at)`, `conversation_members(conversation, player, last_read_seq)`, `messages` (D8); the direct conversation created on the first message (pair unique).
- **Contracts:** `SendMessage{conversation, text, client_id}` intent (`client_id` dedupes retries), `DirectMessage`/`ConversationMessage{conversation, seq, sender, text, sent_at}` in `SocialEvent`, `MarkRead{conversation, seq}`; HTTP `GET /api/social/conversations` (list with unread) and `.../{id}/messages?before=` (D10).
- **Server:** check friendship (D11), text and rate (D8), insert with next `seq` in one statement, then publish to both inboxes (D9); log for moderation (Phase 8 D14).
- **Client:** the friend's thread, own line shown sending then confirmed by `seq`; failed sends marked with retry; older pages on scroll up; unread badges, toasts, ticker; read sent while visible and focused.
- **Daily prune** to 1,000 per conversation (D10).
- **Bots:** `--dm` sends direct messages to friends at FireRed pace.

## Manual Test

| # | Case | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | Send and receive | Player ↔ bot taken over in tab 2 | Both see lines in order, live | ✅ |
| 2 | Unread | Messages while another conversation is open | Badge, toast/ticker; opening clears it | ✅ |
| 3 | History | 120 messages, reopen | Last 50, older load on scroll up | ✅ |
| 4 | Offline friend | Message an offline friend, they log in | They see it unread | ✅ |
| 5 | Reconnect | Drop the connection mid-conversation | No line lost or doubled | ✅ |
| 6 | Two replicas | Each on a replica | Delivered | ✅ |
| 7 | Not friends | Removed friend tries to send | Refused; history still readable | ✅ |
| 8 | Rate and charset | Flood; emoji | Limited; dropped with the hint | ✅ |
| 9 | Phone compose | iPhone/Android preset, thread | Phase 8 D22 layout, send key sends | ✅ |
