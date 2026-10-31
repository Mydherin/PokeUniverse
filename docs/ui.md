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
- No accidental zoom or text selection inside the game.

### Desktop

- Full **keyboard** support: game controls, menu navigation, shortcuts (e.g. `Enter` to chat, `Esc` to close).
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

- The game draws at the **GBA resolution (240×160)**, centered on black: **integer scale** when at least 2× fits, otherwise the largest fit; always nearest-neighbor (crisp pixels).
- **Mouse and keyboard:** the game fills the screen under the top bar (Home, connection status, fullscreen).
- **Touch, portrait:** the game at the top under the top bar, the controls below it (D-pad left, A/B and Start right).
- **Touch, landscape:** the game in the middle, the D-pad on the left side and A/B/Start on the right.
- The controls never cover the game; the layout follows rotation and browser bars.

### Audio Unlock

- Browsers play sound only after a user gesture. Coming from the **Play** button counts, so the intro starts at once.
- Opening `/play` directly (reload, link, installed PWA) shows a black screen with **"Tap or press any key to start"**; that first tap or key unlocks audio and starts the game, and isn't also a game button.

## Mobile Keyboard

When the on-screen keyboard opens (chat, search). Names are entered on FireRed's own naming screen (letter grid), not with the device keyboard.

- The **focused input and the content around it stay visible**, never hidden behind the keyboard.
- Layout adapts to the visible area using the **VisualViewport API** and dynamic viewport units (`dvh`), not fixed `100vh`.
- **Chat:** recent messages remain visible above the input while typing.
- The game view resizes or shifts so the player still sees what is happening.
- Closing the keyboard restores the layout without jumps.

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
