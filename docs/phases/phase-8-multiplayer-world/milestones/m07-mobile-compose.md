# M7 Mobile Compose 🧪

Part of [Phase 8](../phase-8-multiplayer-world.md). **Needs:** M6. Rules: [context.md](context.md) D13, D21, D22, D23; [ui.md](../../../ui.md#mobile-keyboard) (the one keyboard pattern every typing screen reuses).

**Done when:** on iOS Safari and Android Chrome (browser and installed PWA, portrait and landscape) the player types in chat and always sees the whole sentence, the recent lines and the running game, re-laid out around the on-screen keyboard, with the usual mobile gestures; the naming screen and the touch controls work as before.

## Resume Here

**Built 2026-11-11; Manual Test 1-8 ✅ headless, 11 ✅ except the naming screen; 9-10 (real iPhone, real Android) not played: they need the user's phones.** Next: the user plays 9, 10 and 11's naming screen on real devices (dev server on the LAN), then M7 ✅. No `TEMP-PLAYIT` hooks left; `tsc` green; nothing committed.

- **Files:** `index.html` (viewport meta), `src/ui/keyboard.ts` (new: `KeyboardTracker`, sets `data-keyboard`, `--vvh`, `--vv-top` on the shell; open = visual viewport ≥ 120 px shorter than `innerHeight` at scale 1 with a field focused), `chat-window.ts` (textarea composer, counter, hint, `layoutCompose` → `data-compose="portrait|landscape"` + `--compose-screen`, history entry, swipe, `Input.suspend` on the field's focus/blur), `gba/input.ts` (`suspend()`), `boot.ts` (passes `gba.input`), `app/router.ts` (a `popstate` on the same path renders nothing, else the sheet's history entry would rebuild the page), `app.css` (pinned shell, compose layouts).
- **Fixed in test:** × pressed while typing missed (the field's blur dropped the keyboard and moved the button before the click): × now keeps focus on `pointerdown`, like SEND.
- **Headless keyboard:** the shared driver's `FAKEKB=1` injects `fakekb.js` (a fake `visualViewport` 336 px shorter in portrait, 190 in landscape while a field has focus; `window.__kb(h)` sets it by hand). `NOENTER=1` only opens `/play`. Hooks used: `window.__chat` (boot.ts) and `window.__self` (overworld `main`), both removed.
- **Naming screen:** bot accounts skip the intro, so it wasn't reached; it has no DOM field, so neither the tracker nor `suspend` can touch it (60 touch-A taps on a fresh bot: focus stayed on `BODY`, no `data-keyboard`).

## Tasks

### Keyboard tracking (reusable: `spa-pokeuniverse/src/ui/keyboard.ts`)

- ✅ `index.html` viewport meta: add `interactive-widget=resizes-visual` (keep `viewport-fit=cover`).
- ✅ Tracker on `visualViewport` `resize`/`scroll`: keyboard open/closed and height, `--vvh` and `--vv-top` CSS variables; while open, pin `.game-layout` to the visual viewport (`position: fixed`, top `offsetTop`, height `height`) so iOS doesn't scroll the page; bottom safe-area inset only while the keyboard is down.
- ✅ No regression: the touch layout in `app.css` (`.game-layout` portrait/landscape grids) is unchanged while no field has focus.

### Compose (D22)

- ✅ Portrait: GBA screen scaled into what's left (integer scale if it fits), latest lines as many as fit (newest at the bottom), input bar on top of the keyboard. Touch D-pad/A/B/Start hidden; the own player stops (no held direction stuck).
- ✅ Input bar: textarea 1→3 lines then scrolls, font ≥ 16 px with the pixel font, `enterkeyhint="send"` (Enter sends, no newline), send button, counter from 54/64, unsupported characters dropped as typed with the hint (M6's charset list).
- ✅ Landscape: only the input bar and the last 2-3 lines over the dimmed game; normal again when the keyboard closes.

### Gestures (D23)

- ✅ Opening the sheet pushes a history entry; the system back gesture (`popstate`) or a swipe down on the sheet closes it (and pops the entry if still there).
- ✅ Keyboard dismissed (iOS "Done", Android back with the keyboard up) → sheet stays with the log; tap the input to type again.
- ✅ Drag the log to scroll older lines without moving the sheet; long-press / name tap keep M6's hook.

## Manual Test

| # | Case | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | Portrait compose | Mobile preset portrait, open the sheet, type 64 characters | Whole sentence over up to 3 lines, counter from 54; GBA screen and latest lines visible above | ✅ 2026-11-11 (headless 375×812, simulated keyboard 336 px) |
| 2 | Send key | Enter / send button | Sends, no newline; the line appears once | ✅ 2026-11-11 |
| 3 | Unsupported characters | Type an emoji | Dropped as typed with the hint; never reaches the server | ✅ 2026-11-11 (emoji and € dropped, pasted newline → space) |
| 4 | Player stops | Hold a D-pad direction, then focus the input | The own player stops; no direction stuck after closing | ✅ 2026-11-11 (after fixing × while typing: the keyboard dropping moved it before the click) |
| 5 | Close gestures | Swipe down; system back | Each closes the sheet (history entry popped) | ✅ 2026-11-11 (short drag springs back; back doesn't reload the game) |
| 6 | Keyboard dismissed | iOS "Done" / Android back with the keyboard up | Sheet stays with the log; tap the input types again | ✅ 2026-11-11 (blur and keyboard-only hide both) |
| 7 | Landscape | Rotate, type | Input bar and last 2-3 lines over the dimmed game; rotate back while typing: no jump | ✅ 2026-11-11 (3 rows over the dimmed game at 812×375 with a 190 px keyboard; focus and text kept across rotations) |
| 8 | Log drag | Drag the log | Older lines scroll, the sheet doesn't move | ✅ 2026-11-11 (name tap still selects) |
| 9 | Real iPhone (Safari, PWA) | Dev server on the LAN, cases 1-8 | Same; no page scroll or zoom on focus, nothing behind the keyboard | ⬜ needs the user's iPhone (also the naming screen of case 11) |
| 10 | Real Android (Chrome, PWA) | Same | Same | ⬜ needs the user's Android phone |
| 11 | Regression | Naming screen (letter grid, no device keyboard), D-pad slide, A/B/Start after chat, fullscreen | As before | ✅ 2026-11-11 except the naming screen (not reachable with bots, see Resume Here): D-pad slide, Start/B, fullscreen after chat; layout back to normal |
