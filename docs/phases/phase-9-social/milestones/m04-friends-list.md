# M4: Friends List

Part of [Phase 9](../phase-9-social.md). Decisions: [context.md](context.md#friends-and-presence) D3, D6, D7, D13, D14.

## Resume Here

Not started. Needs M1 and M3.

## Tasks

- **FRIENDS tab:** sections REQUESTS (incoming: ACCEPT / DECLINE; outgoing: CANCEL) and FRIENDS: face (D6 portrait), name, status dot and text (online, in battle, trading, offline "seen 2h ago"), online first then by name; count badge for incoming.
- **Live:** `SocialEvent`s update rows in place; presence changes animate the dot only.
- **Actions:** tap a friend → its direct conversation (empty until M5: shows the header and "say hello"); long-press / ⋯ → MESSAGE, REMOVE (YES/NO).
- **Faces:** one `FaceView(face, gender)` everywhere (D6): loads `/faces/<id>.png` by ID for custom faces later, falls back to the gender default portrait (Red's or Leaf's, cut at build from `make graphics` output); integer scale, pixelated, cached by ID.
- **Reconnect:** refetch the list.

## Manual Test

| # | Case | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | List | Player with 3 bot friends, 1 offline | Rows with face, name, status, order right | ⬜ |
| 2 | Accept from list | Bot requests, accept in REQUESTS | Moves to FRIENDS, badge clears, bot notified | ⬜ |
| 3 | Decline, cancel | | Rows gone both sides | ⬜ |
| 4 | Live status | Bot enters battle, logs out | Dot and text change without reopening | ⬜ |
| 5 | Remove | REMOVE, YES | Gone for both | ⬜ |
| 6 | Phone | Mobile preset, long-press a friend | Menu, back gesture closes it | ⬜ |
| 7 | Many | 100 friends (bots) | Scrolls smoothly, no page scroll | ⬜ |
| 8 | Reconnect | Kill the connection | List correct after it reconnects | ⬜ |
