# M4: Friends List

Part of [Phase 9](../phase-9-social.md). Decisions: [context.md](context.md#friends-and-presence) D3, D6, D7, D13, D14.

## Resume Here

✅ **Done 2026-11-13.** Every Manual Test case passed in game (headless Chromium: PC 1600×720, phone 390×844 with touch via CDP). No `TEMP-PLAYIT` left, spa rebuilt. Not committed (the orchestrator commits).

**What M5+ use:**
- A friend's conversation is `conversations.open("friend:<accountId>", "direct", name)` with `c.who = {id, face, gender}` (`ChatWindow.openFriend`, also `openWith(id)` for a friend). M5 may rekey it by its server conversation ID; `c.who.id` is the friend. Its empty thread shows "No messages yet. Say hello to {NAME}!" (`.social-say-hello`) and the face beside the title. `send()` still only sends in the Zone.
- `Faces` (`friends-view.ts`) is FaceView (D6): `faces.view(face, gender)` → a 32×32 pixelated canvas; `faces.draw(canvas, face, gender)` to reuse one. Default = head of Red's/Leaf's front pic cut at runtime from the `make graphics` output (`picRedFront`/`picLeafFront`, New Game set), not at build: same source, no extra build step. `face > 0` loads `/faces/<id>.png`, falls back on error. Built in `boot.ts`, passed to `ChatWindow`.
- `SocialState.accept/decline/cancel/remove(id)` (HTTP, 404 counts as done). Direct row menu REMOVE FRIEND calls `social.remove(c.who.id)` (`onConversationAction` default).
- The friends list is reloaded on every snapshot, including a same-map reconnect (`overworld.ts` `link.enter` `snapshot`; was missing for `resume`, fixed in case 8).

**Choices:** badge = incoming requests not answered (`social.unseen`), so it clears on ACCEPT/DECLINE, not on viewing the tab. Busy (battle, trade, link) sorts with online. Status texts are the panel's own (ours): Online, In a battle, Trading, In a link room, Seen Nm/Nh/Nd ago, Offline. Going back from a friend's thread lands on CHATS (the conversation lives there). The friend's menu on phones is a history entry `{friendMenu: true}`; an action closes it with `history.back()` and runs after the pop (`afterPop`).

**Files:** `spa-pokeuniverse/src/game/firered/friends-view.ts` (new), `game/world/social.ts`, `game/world/conversations.ts`, `game/firered/chat-window.ts`, `game/firered/boot.ts`, `game/firered/overworld.ts`, `styles/app.css` (M4 block), `docs/ui.md` (Social Panel FRIENDS line).

**Testing:** driver in the shared notes folder `m4-headless/` (`two.mjs` with `h.api`, `m4lib.mjs` `tokens`/`befriend`/`friendsDump`; `c1` case 1, `c25` 2-5, `c45` 4-5, `c68` 6-7, `c8` 8). Needs the M3 `TEMP-PLAYIT` hook; `__self` is in tiles now (the driver's `tile()` was fixed). Friends 403/404 online via `node infra/bots/bots.ts --count 2 --first 403 --map pallet_town_players_house_1f --idle` (`--first` ≤ 500); 405 offline. Busy: walk the bot on the test grass (10,5)-(11,5) of 1F; the room trainer is at (8,4), reached from (9,4) facing left. 100 friends seeded by SQL into `friendships` (HTTP changes are 120/min per IP), deleted after. Reconnect: `docker compose restart mic-core`.

## Tasks

- **FRIENDS tab:** sections REQUESTS (incoming: ACCEPT / DECLINE; outgoing: CANCEL) and FRIENDS: face (D6 portrait), name, status dot and text (online, in battle, trading, offline "seen 2h ago"), online first then by name; count badge for incoming.
- **Live:** `SocialEvent`s update rows in place; presence changes animate the dot only.
- **Actions:** tap a friend → its direct conversation (empty until M5: shows the header and "say hello"); long-press / ⋯ → MESSAGE, REMOVE (YES/NO).
- **Faces:** one `FaceView(face, gender)` everywhere (D6): loads `/faces/<id>.png` by ID for custom faces later, falls back to the gender default portrait (Red's or Leaf's, cut at build from `make graphics` output); integer scale, pixelated, cached by ID.
- **Reconnect:** refetch the list.

## Manual Test

| # | Case | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | List | Player with 3 bot friends, 1 offline | Rows with face, name, status, order right | ✅ |
| 2 | Accept from list | Bot requests, accept in REQUESTS | Moves to FRIENDS, badge clears, bot notified | ✅ |
| 3 | Decline, cancel | | Rows gone both sides | ✅ |
| 4 | Live status | Bot enters battle, logs out | Dot and text change without reopening | ✅ |
| 5 | Remove | REMOVE, YES | Gone for both | ✅ |
| 6 | Phone | Mobile preset, long-press a friend | Menu, back gesture closes it | ✅ |
| 7 | Many | 100 friends (bots) | Scrolls smoothly, no page scroll | ✅ |
| 8 | Reconnect | Kill the connection | List correct after it reconnects | ✅ |
