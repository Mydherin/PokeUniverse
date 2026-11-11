# M6 Chat Window ✅

Part of [Phase 8](../phase-8-multiplayer-world.md). **Needs:** M5, M3. Rules: [context.md](context.md) D13, D15, D17, D23, D24; [ui.md](../../../ui.md) (Desktop keys, Mobile chat button, Game Screen). Q1-Q4 answered. Typing on phones (keyboard re-layout, compose bar, gestures) is [M7](m07-mobile-compose.md); here the phone sheet opens with a plain input.

**Done when:** on PC the player opens the chat with `T` or `/`, types, sends and reads everyone's lines on the map in a panel by the game; on a phone the ticker and the chat button show new lines and open the chat sheet with the log; all in Union Room chat's style while the game keeps running.

## Resume Here

**✅ 2026-11-11.** All 12 Manual Test cases passed in game (headless Playwright, desktop 1280×720 and 800×1000, phone 375×812 portrait and 812×375 landscape). `TEMP-PLAYIT` hooks removed, SPA `tsc` green, `spa-pokeuniverse` rebuilt. Nothing committed yet.

- **Files:** new `world/chat.ts` (`ChatLog`), new `firered/chat-window.ts` (`ChatWindow`); changed `realtime/connection.ts`, `world/others.ts`, `firered/overworld.ts`, `firered/boot.ts`, `firered/flow.ts`, `game.ts`, `gba/gba.ts` (`currentMain`), `gba/input.ts` (keys ignored in text fields), `styles/app.css` (`.chat-*`; landscape sheet starts below the top bar, case 8 fix).
- **Decisions:** own lines color 0, others `1 + id % 3`; row 15 px, colon at x 42; PC scale 2, phone 1.4; panel beside or below by whichever gives the bigger screen; Enter sends and keeps the input open; chat shown only when `field()` holds (overworld main, not away, no START menu, no battle). Landscape sheet: `top: safe-area + 3.5rem` (the top bar hid its close control).
- **Driver (shared copy):** `m6-headless/` in the orchestrator's notes folder (`pw.mjs` writes shots next to itself or to `$SHOTS`; `live.mjs` + `run.sh '<js>'` is an interactive mode for step-by-step play; `cN.mjs` per case). It needs the `TEMP-PLAYIT` hooks (`window.__self` in overworld.ts `frame`, `window.__chat` in boot.ts), re-added only while testing.
- **Follow-up (not M6):** after catching a wild Pokémon with a full party and giving it a nickname, the player turns but can't walk (START still works) until a reload; RUN from a wild battle is fine. Likely Phase 7's catch/naming return path.

## Tasks

### Model (`spa-pokeuniverse/src/game/world/chat.ts`) ✅ (built, cases below verify it)

- The last 50 lines on this map: player `id`, `name` (from `Others` or own name), text, channel (`zone` only now, D24); cleared on map change and reconnect (D13: nothing replayed). Lines of players who left keep their name.
- Input rules shared with M7: the same charset and 64-rune limit as `mic-core`'s `chat.Valid` (one list, M5); the same 0.5/s burst 4 rule (D17): over it, send does nothing. Unread count while the chat is closed.

### View ✅ (built, cases below verify it)

- **Log:** FireRed's font and the game's text renderer at an integer scale, a color per player from `messages.pal`, own lines in the own color, a panel like `panel.png`'s (D24). Drawn so the pixels stay crisp beside or below the GBA screen (canvas or an HTML layer with a pixel copy).
- **PC panel (D15):** beside the GBA screen when the window is wide, below otherwise; scrolled with the wheel; `T` opens and focuses the input, `/` opens with `/` typed, `Enter` sends, `Esc` closes; `Enter` stays START when closed; game keys ignored while the input has focus.
- **Phone (D23):** speech-bubble button with an unread badge on the touch layer (above Start in portrait, top of the right column in landscape) and the 1-2 line ticker in the band between the GBA screen and the controls, fading 5 s after the last line. Tap either → the chat sheet over the controls: channel chip row ("Zone"), the log (drag to scroll), a plain input; a close control. M7 adds the keyboard layout and gestures.
- **Line hook (D24):** long-press a line or tap its name selects its player `id`; nothing opens yet (Phase 9 fills the menu).
- Hidden during a battle and in full-screen menus (FireRed's screens stay unchanged); lines arriving then are in the log after.
- Sound: none (Union Room chat's typing sounds belong to its letter keyboard, not used).

### Docs

- ui.md if the button's or panel's place changed while building it.

## Manual Test

| # | Case | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | PC send | `T`, type, `Enter` | The line shows once (from the server) as `NAME: text` in the own color | ✅ 2026-11-11 (one line `BOT6 :Hello there!`, black, the colon at x 42 as Union Room's; input cleared) |
| 2 | Others' lines | Bots `--chat` on the map | Lines with their names, a color each, FireRed's font crisp | ✅ 2026-11-11 (5 bots: `BOT5`, `BOT4`, `BOT1`, `BOT3` lines, red, blue, green by id, log canvas at exactly 2×, crisp) |
| 3 | Keys | `/` opens with `/` typed; `Esc` closes; `Enter` with the chat closed opens START; arrows while typing don't walk, none stuck after | As listed | ✅ 2026-11-11 (`/` opens focused with `/`; `Esc` closes and blurs; arrows held while typing and released after `Esc`: no step, none stuck, next step walks; `Enter` closed opens START) |
| 4 | Panel place and scroll | Wide then narrow window | Panel beside, then below the GBA screen; wheel scrolls older lines (50 kept) | ✅ 2026-11-11 (1280×720: panel right of the screen, 560×720; 800×1000: below, 800×520; 10 flood bots: log holds 50, wheel up shows the oldest kept rows) |
| 5 | Charset and length | Type an emoji, 70 characters | Unsupported characters refused, stops at 64 | ✅ 2026-11-11 (typed or pasted emoji, `€`, `~` dropped, `ñ é` kept; 70 typed stop at 64, the server takes the line) |
| 6 | Flood | Hold `Enter` with text | 4 sent, then one per 2 s | ✅ 2026-11-11 (Enter every 80 ms, retyped: 4 sent at once, then one at 2.1, 4.1, 6.1, 8.1 s; the text stays until it goes) |
| 7 | Phone ticker and badge | Mobile preset portrait, bots chatting | 1-2 ticker lines fade 5 s after the last; the button's badge counts unread | ✅ 2026-11-11 (375×812 mobile: 3 lines 2 s apart, ticker shows the last 2, fades 5 s after the third; badge 1, 2, 3 on the button above START) |
| 8 | Phone sheet | Tap the button (portrait above Start, landscape top of the right column) | Sheet over the controls: "Zone" chip, log (drag scrolls), input; close → controls work | ✅ 2026-11-11 after a fix (❌ first: in landscape the sheet started at the top, under the top bar, which hid its close control; now it starts below the bar. Portrait: sheet over the controls, `Zone` chip, input focused, unread 0, a drag down scrolls 10 rows older; landscape: button top of the right column, sheet over it; close → the D-pad walks in both) |
| 9 | Warp and reconnect | Stairs; then `docker compose restart mic-core` | Log cleared each time; 1F lines stop after going up | ✅ 2026-11-11 (`docker compose restart mic-core`: log empty 1 s later, then new lines; stairs up: log empty, 45 s on 2F with 5 chatting bots on 1F: no line; back down: log empty, then 1F lines) |
| 10 | Battle and menus | Room trainer's battle, START menu | Chat hidden; the lines that came meanwhile are in the log after | ✅ 2026-11-11 (START menu: panel hidden, a line said meanwhile is in the log after closing; 2F trainer's battle: hidden, lines keep landing in the log (its lv50 battle too long to finish headless); wild battle in the 1F test grass: hidden, the line said during it shows after RUN) |
| 11 | Line hook | Long-press a line / tap a name | Selects that player id; nothing opens | ✅ 2026-11-11 (PC panel and phone sheet: a tap on `BOT13` selects id 285, a short tap on text keeps it, an 800 ms press on `BOT14`'s text selects 286 and marks its lines; no menu or dialog, chat state unchanged) |
| 12 | Regression | Menus; naming screen still uses its letter grid; context.md's check | Nothing broken | ✅ 2026-11-11 (START → POKéMON and BAG open and close; caught a Wooper, its nickname screen keeps the letter grid and `T`/`/` don't open chat there; with 5 bots: 1F → stairs → 2F → stairs → 1F, bots' corrections 0, mic-core logs clean; wild battle RUN then walks; the trainer's battle starts. Found: walking stays blocked after that catch + nickname until a reload, not from M6's code (follow-up below)) |

## Gotchas

- While the input has focus the game's key handler must ignore keys, and releasing focus must not leave a held direction stuck.
