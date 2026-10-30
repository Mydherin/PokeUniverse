# Phase 2: FireRed Intro

**Goal:** **Play** opens the game exactly like FireRed boots, with its original art and music.

## Scope

- `tool-maps extract`: FireRed's graphics, music and text from `references/pokefirered` into a gitignored folder at build time; never committed ([tech-stack.md](../tech-stack.md#firered-as-reference)).
- Asset manifest for the FireRed art style ([tech-stack.md](../tech-stack.md#decoupled-presentation)).
- Game screen at the GBA resolution (240×160), scaled pixel-perfect; fullscreen and orientation handling ([ui.md](../ui.md)).
- Boot sequence as in FireRed: copyright screen, Game Freak intro, opening scene, title screen, **Press Start**.
- Plays on **every Play**; any key or tap skips to the title screen.
- Main menu: **Continue** when the account has a trainer, otherwise **New Game** (asked to the server).
- Music and sound effects; audio unlocked on the first tap (Safari).
- Input: keyboard (desktop) and touch buttons (mobile) for directions, A, B and Start.

## Done When

- Play shows the intro, title screen and menu like the original, with sound, on desktop and mobile.
- Skipping jumps straight to the title screen.
