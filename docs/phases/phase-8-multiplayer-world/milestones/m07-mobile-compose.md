# M7 Mobile Compose ⬜

Part of [Phase 8](../phase-8-multiplayer-world.md). **Needs:** M6. Rules: [context.md](context.md) D13, D21, D22, D23; [ui.md](../../../ui.md#mobile-keyboard) (the one keyboard pattern every typing screen reuses).

**Done when:** on iOS Safari and Android Chrome (browser and installed PWA, portrait and landscape) the player types in chat and always sees the whole sentence, the recent lines and the running game, re-laid out around the on-screen keyboard, with the usual mobile gestures; the naming screen and the touch controls work as before.

## Resume Here

**Not started.** First step: the viewport meta and the `visualViewport` tracker.

## Tasks

### Keyboard tracking (reusable: `spa-pokeuniverse/src/ui/keyboard.ts`)

- `index.html` viewport meta: add `interactive-widget=resizes-visual` (keep `viewport-fit=cover`).
- Tracker on `visualViewport` `resize`/`scroll`: keyboard open/closed and height, `--vvh` and `--vv-top` CSS variables; while open, pin `.game-layout` to the visual viewport (`position: fixed`, top `offsetTop`, height `height`) so iOS doesn't scroll the page; bottom safe-area inset only while the keyboard is down.
- No regression: the touch layout in `app.css` (`.game-layout` portrait/landscape grids) is unchanged while no field has focus.

### Compose (D22)

- Portrait: GBA screen scaled into what's left (integer scale if it fits), latest lines as many as fit (newest at the bottom), input bar on top of the keyboard. Touch D-pad/A/B/Start hidden; the own player stops (no held direction stuck).
- Input bar: textarea 1→3 lines then scrolls, font ≥ 16 px with the pixel font, `enterkeyhint="send"` (Enter sends, no newline), send button, counter from 54/64, unsupported characters dropped as typed with the hint (M6's charset list).
- Landscape: only the input bar and the last 2-3 lines over the dimmed game; normal again when the keyboard closes.

### Gestures (D23)

- Opening the sheet pushes a history entry; the system back gesture (`popstate`) or a swipe down on the sheet closes it (and pops the entry if still there).
- Keyboard dismissed (iOS "Done", Android back with the keyboard up) → sheet stays with the log; tap the input to type again.
- Drag the log to scroll older lines without moving the sheet; long-press / name tap keep M6's hook.

## Play It

1. Pane, mobile preset, portrait: open the sheet, type a 64-character sentence: all of it visible over 3 lines, counter shows, the GBA screen and the last lines visible above; the send key sends.
2. Emoji typed: dropped with the hint; the server never sees it.
3. Swipe down and back gesture each close the sheet; dismissing the keyboard keeps it.
4. Landscape: input and last lines over the dimmed game; rotate back while typing: no jump.
5. **iOS Safari and Android Chrome** on a real phone (browser and PWA, via the dev server on the LAN): steps 1-4; no page scroll or zoom on focus, nothing behind the keyboard.
6. Regression: naming screen (letter grid, no device keyboard), D-pad slide and A/B/Start after closing chat, fullscreen.
