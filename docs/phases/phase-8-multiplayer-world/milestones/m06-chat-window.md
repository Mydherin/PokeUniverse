# M6 Chat Window ⬜

Part of [Phase 8](../phase-8-multiplayer-world.md). **Needs:** M5, M3. Rules: [context.md](context.md) D13, D15, D17; [ui.md](../../../ui.md) (Desktop keys, Mobile Keyboard, Game Screen). Q3 answered (no names over sprites, D11); Q4 still provisional ([context.md](context.md#questions-for-the-user)): check the user's answer first.

**Done when:** on desktop and phone the player opens the chat, types with the device keyboard, sends, and reads the last lines of everyone on the map, in the style of FireRed's Union Room chat, while the game stays visible and keeps running.

## Resume Here

**Not started.** First step: read ui.md's sections above and the Union Room chat references, then the log model.

## Tasks

### Model (`spa-pokeuniverse/src/game/world/chat.ts`)

- The last 50 lines on this map (`name` from `Others` or own name, text); cleared on map change and reconnect (D13: nothing replayed). Lines of players who left stay with the name they had.
- Input filter: the same charset and 64-rune limit as `mic-core`'s `chat.Valid` (one list, M5); the same 0.5/s burst 4 rule (D17): over it the send key does nothing.

### View

- Chat log over the game, near the top or bottom of the GBA screen (not covering the player's tile: they're in the middle), last 4 lines shown for 8 s after they arrive, all 50 while the input is open. Lines drawn with FireRed's font and the game's text renderer (the same glyphs as the dialogs), colors from Union Room chat's `messages.pal`, the own lines in the own player's color; a translucent panel like `panel.png`'s. Drawn by our engine in the game canvas, or an HTML layer with a pixel copy: pick what keeps the GBA screen's integer scale crisp.
- Input: a real HTML `<input>` (device keyboard, IME, paste) below or over the GBA screen's bottom edge, styled to match; focus disables game buttons; `Enter` sends and closes, `Esc` closes. On touch, a chat button in the top bar opens it.
- Desktop keys: `T` or `/` opens (D15); `Enter` stays START outside the input. Update ui.md's Desktop line accordingly (Q4).
- Mobile keyboard: VisualViewport + `dvh`; the game shifts so the player's area and the last lines stay visible above the keyboard; closing it restores the layout without jumps ([ui.md](../../../ui.md#mobile-keyboard)). Test iOS Safari behavior notes in ui.md.
- Chat is closed and hidden during a battle and in full-screen menus (FireRed's screens stay unchanged); lines arriving then are in the log after.
- Sound: none (Union Room chat's typing sounds belong to its keyboard, not used).

### Docs

- ui.md: the chat's place and keys (only what changed).

## Play It

1. Desktop: `T`, type, `Enter`: the line appears once (from the server), bots' lines appear with their names; `Esc` closes; `Enter` outside opens START as before.
2. Flood with held `Enter`: the input stops sending after 4, then one per 2 s.
3. A character outside the charset (emoji) can't be typed or is removed; 64 is the limit.
4. Mobile preset in the pane and portrait: the keyboard doesn't hide the input or the last lines; the D-pad isn't triggered while typing.
5. Warp upstairs: the log clears; lines from 1F no longer arrive.
6. During the room trainer's battle the chat is hidden; afterwards the log has the lines.
7. Regression check (menus, naming screen typing still uses its letter grid).

## Gotchas

- While the input has focus the game's key handler must ignore keys, but releasing focus must not leave a held direction stuck.
