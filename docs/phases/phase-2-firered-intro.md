# Phase 2: FireRed Intro

**Goal:** **Play** opens the game exactly like FireRed boots, with its original art and music.

## Scope

- FireRed's graphics **as they are** (`.png` tiles, `.pal` palettes, `.bin` tilemaps, fonts): a plain file copy from `references/pokefirered` into a gitignored folder at build time, no tool; never committed ([tech-stack.md](../tech-stack.md#firered-as-reference)).
- The game draws them like the GBA: tiles placed by the tilemap, colored by the palette, at runtime. **Why:** FireRed's intro animates palettes (fades, flames), so runtime palettes are needed anyway; pre-baked images would add a tool and lose that.
- `make audio`: FireRed's music and sound effects rendered exactly from the decompilation to Opus and AAC ([audio.md](../audio.md)).
- Asset manifest for the FireRed art style ([tech-stack.md](../tech-stack.md#decoupled-presentation)).
- Game screen at the GBA resolution (240×160), scaled pixel-perfect; fullscreen and orientation handling ([ui.md](../ui.md)).
- Boot sequence as in FireRed: copyright screen, Game Freak intro, opening scene, title screen, **Press Start**.
- Plays on **every Play**; any key or tap skips to the title screen.
- Main menu: **Continue** when the account has a trainer, otherwise **New Game** (asked to the server).
- Intro music and sound effects (`mus_game_freak`, `se_intro_blast`, `mus_intro_fight`, `mus_title`), looping like the game; audio unlocked on the first tap (Safari).
- Input: keyboard (desktop) and touch buttons (mobile) for directions, A, B and Start.

## Done When

- Play shows the intro, title screen and menu like the original, with sound, on desktop and mobile.
- Skipping jumps straight to the title screen.
