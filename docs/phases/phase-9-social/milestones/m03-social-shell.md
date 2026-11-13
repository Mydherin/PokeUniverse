# M3: Social Panel Shell

Part of [Phase 9](../phase-9-social.md). Decisions: [context.md](context.md#social-panel-uiux) D12-D14; Phase 8 D15, D21-D24; [ui.md](../../../ui.md#social-panel).

## Resume Here

✅ **Done 2026-11-13.** Every Manual Test case passed in game (headless Chromium: PC 1600×720 and 1000×500, phone 390×844 and 844×390 with touch via CDP and the fake keyboard). No `TEMP-PLAYIT` left, spa rebuilt. Not committed (the orchestrator commits).

**What M4-M6 use:**
- `ChatWindow.conversations` (`src/game/world/conversations.ts`): `open(id, kind, title, face)` adds a conversation ("direct" / "room"), `remove(id)`, `get(id)`, `list` (Zone first, then by last line), `current`, `recent` (ticker), `setMuted`, `unread`.
- `ChatWindow.arrived(conversation, line)` adds a line and does the notices (PC toast, phone ticker/hint, vibrate for "direct").
- `ChatWindow.onConversationAction(c, "leave" | "remove")`: the row menu's LEAVE / REMOVE FRIEND (M4, M6 wire it). `openWith(id)` still just opens the panel (M5: open the friend's conversation, then `choose`).
- `send()` only sends while the current conversation is the Zone (M5 adds direct, M6 rooms; `c.log.allowSend()` is per conversation).
- The FRIENDS tab pane (`.social-friends`) holds a placeholder line; M4 replaces its content.

**Gotchas:**
- The PC panel is what the game leaves (Phase 8 layout untouched), so at 16:9 (1280×720, 1920×1080) it's 356 px: **one pane**. Two panes need a wider window (1600×720 gives 520 px) or the panel below the screen. Case 1 was played at 1600×720.
- Rows are updated in place (not rebuilt), so a tap survives zone lines arriving mid-press.
- Focus the PC input only after `state()`: a field in a hidden pane can't take focus.
- The phone button badge counts unread lines plus `social.unseen` (friend requests).

**Testing:** driver in the shared notes folder `m3-headless/` (`two.mjs`, `pc.mjs` cases 1-3, `phone.mjs` cases 4-8, `menu.mjs` row menu/mute; `fakekb.js`). Needs the `TEMP-PLAYIT` hook after `this.draw()` in `overworld.ts` `frame()`: `Object.assign(window, { __self: { x: this.avatar.x, y: this.avatar.y, script: this.script !== null }, __others: this.others, __chat: this.flow.chat, __social: this.flow.social })`.

**Files:** `spa-pokeuniverse/src/game/world/conversations.ts` (new), `src/game/firered/chat-window.ts` (ChatWindow rewritten around conversations; LogView and composer unchanged), `src/styles/app.css` (social panel block), `docs/ui.md` (Social Panel).

## Tasks

- ✅ **Model:** `Conversation` store, Zone pinned first; the thread view takes any conversation.
- ✅ **PC:** tabs, two panes ≥ 480 px, one with back below; `T`, `Esc`, `Alt+↑/↓`; toasts.
- ✅ **Phone:** sheet on the list, thread as a history entry, swipe back and down, long-press menu, labeled ticker, badge.
- ✅ **Layout, Safari/Chrome/PWA, Docs.**

## Manual Test

| # | Case | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | PC wide | Open with `T` | Two panes, Zone selected, game size unchanged | ✅ |
| 2 | PC narrow | Narrow the window | One pane, back works, `Esc` back then close | ✅ |
| 3 | Zone chat | Chat with bots | Same as Phase 8, nothing lost | ✅ |
| 4 | Phone list → thread | Mobile preset: open, tap Zone | Thread slides in; back gesture and arrow return | ✅ |
| 5 | Gestures | Swipe right in the thread, swipe down on the header | Back; closes | ✅ |
| 6 | Compose | Type in the thread, portrait and landscape | Phase 8 D22 layout | ✅ |
| 7 | No page moves | Scroll lists hard, at the ends | No page scroll, bounce or zoom | ✅ |
| 8 | Game keeps running | Sheet open while bots walk | Game drawn and moving | ✅ |
