# M5: Direct Messages

Part of [Phase 9](../phase-9-social.md). Decisions: [context.md](context.md#messaging) D8-D11, D13, D14.

## Resume Here

Not started. Needs M1 and M3.

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
| 1 | Send and receive | Player ↔ bot taken over in tab 2 | Both see lines in order, live | ⬜ |
| 2 | Unread | Messages while another conversation is open | Badge, toast/ticker; opening clears it | ⬜ |
| 3 | History | 120 messages, reopen | Last 50, older load on scroll up | ⬜ |
| 4 | Offline friend | Message an offline friend, they log in | They see it unread | ⬜ |
| 5 | Reconnect | Drop the connection mid-conversation | No line lost or doubled | ⬜ |
| 6 | Two replicas | Each on a replica | Delivered | ⬜ |
| 7 | Not friends | Removed friend tries to send | Refused; history still readable | ⬜ |
| 8 | Rate and charset | Flood; emoji | Limited; dropped with the hint | ⬜ |
| 9 | Phone compose | iPhone/Android preset, thread | Phase 8 D22 layout, send key sends | ⬜ |
