# M3: Social Panel Shell

Part of [Phase 9](../phase-9-social.md). Decisions: [context.md](context.md#social-panel-uiux) D12-D14; Phase 8 D15, D21-D24; [ui.md](../../../ui.md#mobile-keyboard).

## Resume Here

Not started. No server work: the shell with Zone as its only conversation, ready for M4-M6.

## Tasks

- **Model:** a `Conversation` store on the client (id, kind, title, face, last line, unread, muted), Zone pinned first; the thread view takes any conversation; Phase 8's log becomes the thread.
- **PC:** tabs CHATS / FRIENDS; two panes ≥ 480 px, one pane with back below; keys `T`, `Esc`, `Alt+↑/↓` (D13); toasts at the panel top.
- **Phone:** sheet opens on the list; thread pushed as a history entry (back gesture, back arrow); swipe right from the thread's left area back, swipe down on the header closes; long-press a row → its menu; ticker labeled by conversation; badge on the chat button (D14).
- **Layout:** the game keeps its size rule (ui.md, Game Screen); the sheet never covers the GBA screen in portrait while not composing; landscape as Phase 8 D22.
- **Safari and Chrome, PWA:** no page scroll or zoom (`touch-action`, `overscroll-behavior: contain` on lists), safe areas, `visualViewport` compose (Phase 8 M7).
- **Docs:** ui.md: the social panel (list, thread, tabs, gestures).

## Manual Test

| # | Case | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | PC wide | Open with `T` | Two panes, Zone selected, game size unchanged | ⬜ |
| 2 | PC narrow | Narrow the window | One pane, back works, `Esc` back then close | ⬜ |
| 3 | Zone chat | Chat with bots | Same as Phase 8, nothing lost | ⬜ |
| 4 | Phone list → thread | Mobile preset: open, tap Zone | Thread slides in; back gesture and arrow return | ⬜ |
| 5 | Gestures | Swipe right in the thread, swipe down on the header | Back; closes | ⬜ |
| 6 | Compose | Type in the thread, portrait and landscape | Phase 8 D22 layout | ⬜ |
| 7 | No page moves | Scroll lists hard, at the ends | No page scroll, bounce or zoom | ⬜ |
| 8 | Game keeps running | Sheet open while bots walk | Game drawn and moving | ⬜ |
