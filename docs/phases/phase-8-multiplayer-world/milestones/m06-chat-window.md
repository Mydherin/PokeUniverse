# M6 Chat Window ⬜

Part of [Phase 8](../phase-8-multiplayer-world.md). **Needs:** M5, M3. Rules: [context.md](context.md) D13, D15, D17, D23, D24; [ui.md](../../../ui.md) (Desktop keys, Mobile chat button, Game Screen). Q1-Q4 answered. Typing on phones (keyboard re-layout, compose bar, gestures) is [M7](m07-mobile-compose.md); here the phone sheet opens with a plain input.

**Done when:** on PC the player opens the chat with `T` or `/`, types, sends and reads everyone's lines on the map in a panel by the game; on a phone the ticker and the chat button show new lines and open the chat sheet with the log; all in Union Room chat's style while the game keeps running.

## Resume Here

**Not started.** First step: the log model, then the Union Room chat references ([context.md](context.md#firered-and-heartgold-references)).

## Tasks

### Model (`spa-pokeuniverse/src/game/world/chat.ts`)

- The last 50 lines on this map: player `id`, `name` (from `Others` or own name), text, channel (`zone` only now, D24); cleared on map change and reconnect (D13: nothing replayed). Lines of players who left keep their name.
- Input rules shared with M7: the same charset and 64-rune limit as `mic-core`'s `chat.Valid` (one list, M5); the same 0.5/s burst 4 rule (D17): over it, send does nothing. Unread count while the chat is closed.

### View

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
| 1 | PC send | `T`, type, `Enter` | The line shows once (from the server) as `NAME: text` in the own color | ⬜ |
| 2 | Others' lines | Bots `--chat` on the map | Lines with their names, a color each, FireRed's font crisp | ⬜ |
| 3 | Keys | `/` opens with `/` typed; `Esc` closes; `Enter` with the chat closed opens START; arrows while typing don't walk, none stuck after | As listed | ⬜ |
| 4 | Panel place and scroll | Wide then narrow window | Panel beside, then below the GBA screen; wheel scrolls older lines (50 kept) | ⬜ |
| 5 | Charset and length | Type an emoji, 70 characters | Unsupported characters refused, stops at 64 | ⬜ |
| 6 | Flood | Hold `Enter` with text | 4 sent, then one per 2 s | ⬜ |
| 7 | Phone ticker and badge | Mobile preset portrait, bots chatting | 1-2 ticker lines fade 5 s after the last; the button's badge counts unread | ⬜ |
| 8 | Phone sheet | Tap the button (portrait above Start, landscape top of the right column) | Sheet over the controls: "Zone" chip, log (drag scrolls), input; close → controls work | ⬜ |
| 9 | Warp and reconnect | Stairs; then `docker compose restart mic-core` | Log cleared each time; 1F lines stop after going up | ⬜ |
| 10 | Battle and menus | Room trainer's battle, START menu | Chat hidden; the lines that came meanwhile are in the log after | ⬜ |
| 11 | Line hook | Long-press a line / tap a name | Selects that player id; nothing opens | ⬜ |
| 12 | Regression | Menus; naming screen still uses its letter grid; context.md's check | Nothing broken | ⬜ |

## Gotchas

- While the input has focus the game's key handler must ignore keys, and releasing focus must not leave a held direction stuck.
