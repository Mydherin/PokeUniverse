# UI / UX

Applies to the **web app** (login, sections, menus) and the **in-game UI** (HUD, menus, chat, battle screens).

## Design

- **Original, modern and memorable:** a unique visual identity built around the game's own theme, not a generic template or a copy of official Pokémon menus.
- **Pokémon sprites as part of the design:** used intentionally (e.g. headers, empty states, loading screens), never as clutter.
- **Strong contrast:** text and controls meet **WCAG AA** contrast at minimum.
- **Motion with purpose:** smooth transitions between screens and original animations (e.g. entering the game, opening menus).
  - Animations stay fast and never block input.
  - Respect `prefers-reduced-motion`.
- **Consistent design system:** shared colors, typography, spacing and components (Tailwind theme tokens) across web app and in-game UI.

### Visual Identity

- **Theme:** a pixel night sky over Kanto: deep indigo surfaces, twinkling pixel stars, stepped pixel hills.
- **Colors:** `night` surfaces, `ink` text, `volt` yellow for primary actions (Play), `aqua` for links and focus, `leaf` for success, `berry` for errors.
- **Type:** Pixelify Sans for headings and the wordmark; Outfit for body text.
- **Shapes:** glass panels with soft corners; **pixel-cut corners** for the most important actions.
- Tokens live in `spa-pokeuniverse/src/styles/app.css`.

## Responsive

- **Mobile-first**, with a dedicated, polished design for both **mobile** and **desktop** (not just a stretched layout).
- Every screen works from small phones to large monitors, in **portrait and landscape**.
- **Spacing:** consistent margins and paddings from the design system; nothing touches screen edges.
- **No overflow:** no horizontal scroll, cut-off text or overlapping elements. Long text wraps or truncates intentionally.
- **Safe areas:** respect notches, rounded corners and home indicators (`env(safe-area-inset-*)`).
- **Touch targets:** at least **44×44 px**.

## Input

### Mobile

- Native **gestures**: tap, swipe, long-press where they make sense (e.g. swipe between tabs, long-press for details).
- **On-screen game controls:** D-pad and action buttons, sized for thumbs, never covering important game areas.
  - In the game: a D-pad you can slide across (8 directions), **A**, **B** and **Start**; at least 44×44 px; shown on touch screens only (`pointer: coarse`).
  - A **chat button** (speech bubble, unread badge) on the touch layer, clear of the game buttons ([Mobile Keyboard](#mobile-keyboard) for typing).
- **Chat log scroll bar:** the PC panel's and the phone sheet's logs show a scroll bar in the panel's own blue (thumb at the bottom for the newest) only while the lines overflow the log; otherwise none, and the text uses its width (user 2026-11-11); on PC it's dragged or clicked, on phones the log scrolls with a touch drag as before.
- No accidental zoom or text selection inside the game.

### Desktop

- Full **keyboard** support: game controls, menu navigation, shortcuts (`T` opens chat, `Enter` sends, `Esc` closes; `Enter` stays START while chat is closed; game keys aren't read while a text field has focus). `/` does nothing in the game: it's kept for chat commands later (user 2026-11-11).
- **Game buttons:**

  | GBA button | Keys |
  |---|---|
  | D-pad | Arrow keys or `W` `A` `S` `D` |
  | A | `Z` or `Space` |
  | B | `X` or `Backspace` |
  | Start | `Enter` |
  | Select | `Shift` |
- **Mouse:** hover states, clickable elements, scroll where expected.
- Visible focus states for keyboard navigation.

## Game Screen

- The game draws at the **GBA resolution (240×160)**, centered on black, **as large as its space allows** at 3:2 (any scale, user 2026-11-11: whole-number steps left big black bars in smaller windows); always nearest-neighbor.
- **How it's scaled (one rule for every layout):** the game is drawn at exactly 240×160, the world at zoom 1; the browser scales that one image with nearest-neighbor (`image-rendering: pixelated`) to the largest 3:2 size in whole device pixels (3u × 2u), placed on a whole device pixel (`placeScreen` in `game/screen.ts`, run on every cell, window, visual viewport and pixel-ratio change). Fractional scale is kept for the largest game; each game pixel is 3 or 4 device pixels wide (or n / n+1), never split. Why: drawing the world at a fractional zoom made each tile and sprite round and sample on its own, which left 1-px stray lines while walking at most sizes (user 2026-11-11). The chat only reads the space it gets; it never sizes the game.
- **Mouse and keyboard:** the game fills the screen under the top bar (Home, connection status, fullscreen). In the world, the chat panel sits beside the game when the window is wide and below it when it's narrow, whichever leaves the game bigger; the game takes the rest. Before the world (title, intro) the panel takes no room.
- **Touch, portrait:** the game at the top under the top bar, the controls below it (D-pad left, A/B and Start right).
- **Touch, landscape:** the game in the middle, the D-pad on the left side and A/B/Start on the right.
- The controls never cover the game; the layout follows rotation and browser bars.

### Audio Unlock

- Browsers play sound only after a user gesture. Coming from the **Play** button counts, so the intro starts at once.
- Opening `/play` directly (reload, link, installed PWA) shows a black screen with **"Tap or press any key to start"**; that first tap or key unlocks audio and starts the game, and isn't also a game button.

## Social Panel

Phase 8's chat grown into the social panel ([Phase 9](phases/phase-9-social/milestones/context.md#social-panel-uiux) D12-D14); code `spa-pokeuniverse/src/game/firered/chat-window.ts`, conversations `src/game/world/conversations.ts`.

- **Tabs** CHATS and FRIENDS (requests badge). **List:** Zone pinned first, then by last line; row = face, name, last line, unread badge. **FRIENDS:** REQUESTS (incoming ACCEPT / DECLINE, outgoing CANCEL; buttons on their own line) then FRIENDS (32×32 face, name, presence dot and text, online first then by name); tap → the friend's conversation; long-press / right-click / ⋯ → MESSAGE, REMOVE (YES/NO), CANCEL; on phones the menu is a history entry (back closes it). **Thread:** the conversation's log (Union Room chat style) and the compose bar.
- **PC:** beside or below the game, the game sized first (the panel's width is what the game leaves, so two panes show only on windows wider than about 16:9). Two panes (list | thread) when the panel is ≥ 480 px, else one pane with a back button. Closed, it shows the current thread ("T to chat"). Keys: `T` opens the last conversation, `Esc` back then close, `Alt+↑/↓` switch, `Enter` send. A line to a conversation not on screen: toast at the panel top (click opens it).
- **Phones:** the button (badge: unread lines plus friend requests) and ticker (lines of every unmuted conversation, labeled) stay; tapping opens the sheet on the list; a row pushes the thread (history entry: system back and the back arrow pop it); swipe right from the thread's left half (not the screen edge) goes back; swipe down on the header closes. The thread doesn't focus the field by itself.
- **Long-press (or right-click) a row:** MUTE / UNMUTE (this session), LEAVE (rooms), REMOVE FRIEND (friends).
- **No page moves:** lists `overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y`; the sheet `touch-action: none`.

## Mobile Keyboard

When the on-screen keyboard opens (chat, search). Names are entered on FireRed's own naming screen (letter grid), not with the device keyboard, so nothing changes there. The game is played mostly on phones (Chrome on Android, Safari on iOS, browser and PWA): every screen that types follows this one pattern (user 2026-11-10; first used by chat, [Phase 8](phases/phase-8-multiplayer-world/milestones/context.md#decisions) D21-D24).

- **Code:** `spa-pokeuniverse/src/ui/keyboard.ts` (`KeyboardTracker`) is the one tracker every typing screen reuses.
- **One code path for both browsers:** the viewport meta adds `interactive-widget=resizes-visual` (Chrome's default, iOS's only behavior), so the keyboard never resizes the layout viewport on either; the keyboard's size comes from the **VisualViewport API** (`resize` and `scroll`: `height`, `offsetTop`). *Why:* Android's `resizes-content` and iOS's overlay would otherwise need two layouts.
- **The app shell is pinned to the visual viewport** while the keyboard is open (`position: fixed`, top = `offsetTop`, height = `height`, also exposed as `--vvh`), so iOS doesn't scroll the page to the focused field and nothing jumps; `dvh` everywhere else, never `100vh`.
- **The screen is re-laid out in the space left**, not covered: the focused input sits right on top of the keyboard, the content it belongs to (e.g. recent chat lines) above it, the game scaled to fit what's left and still running.
- **Inputs:** font size ≥ 16 px (iOS zooms smaller ones); `enterkeyhint` set to the action (`send`, `search`); a textarea that grows with the text up to 3 lines, then scrolls, so a long sentence stays fully visible. Native fields only (IME, autocorrect, paste, dictation), styled with the pixel font.
- **Safe areas:** bottom inset applied only while the keyboard is down (it covers the home indicator when up).
- **Touch game controls are hidden** while typing and the own player doesn't move; no held direction stays stuck when focus leaves.
- **Closing:** the system back gesture closes the sheet that opened the keyboard (a history entry, `popstate`); dismissing only the keyboard keeps the sheet open, and the layout returns without jumps.
- **Landscape phones:** the keyboard takes most of the height, so only the input and the last lines show over the dimmed game; normal again when the keyboard closes.
- Check every typing screen on **iOS Safari and Android Chrome**, browser and installed PWA, portrait and landscape.

## Platforms

Runs directly in the browser, and installable as a **PWA**.

| Platform | Browser |
|---|---|
| iOS / iPadOS | **Safari** (browser and installed PWA) |
| Android | **Chrome** (browser and installed PWA) |
| Desktop | Chrome, Safari, Edge, Firefox |

- **PWA:** web manifest, app icons, splash screen, standalone display mode, service worker for fast loading. A new release takes over at once (the page reloads), never waiting for every tab to close.
- Test Safari-specific behavior (viewport, keyboard, audio unlock, PWA limits) explicitly; it differs from Chrome.
- In-game, support **fullscreen** and orientation handling where the platform allows it.
