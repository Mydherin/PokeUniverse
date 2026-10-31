# Phase 2: FireRed Intro

**Goal:** **Play** opens the game exactly like FireRed boots, with its original art and music.

**Status:** done.

## Scope

- [x] FireRed's graphics **as they are** (`.png` tiles, `.pal` palettes, `.bin` tilemaps, fonts): a plain file copy from `references/pokefirered` into a gitignored folder at build time (`make graphics`), no tool; never committed ([tech-stack.md](../tech-stack.md#firered-as-reference)).
- [x] The game draws them like the GBA, at runtime: a small GBA-style renderer (tile backgrounds, sprites, palette fades, windows, blending) drawn through Phaser. **Why:** the intro animates palettes, windows and blending; emulating those few hardware features is the only way to get it exact, and later phases (Oak's speech, menus) reuse it.
- [x] `make audio`: FireRed's music, sound effects and cries rendered exactly from the decompilation to Opus and AAC ([audio.md](../audio.md)).
- [x] Asset manifest for the FireRed art style ([tech-stack.md](../tech-stack.md#decoupled-presentation)).
- [x] Game screen at the GBA resolution (240×160) and frame rate (59.73 fps), scaled pixel-perfect; fullscreen and orientation handling ([ui.md](../ui.md#game-screen)).
- [x] Boot sequence as in FireRed (rev 0): copyright screen, Game Freak logo, the Gengar vs. Nidorino scenes, title screen, **Press Start**, rewritten from zero with the original frame timings.
- [x] Plays on **every Play**. **A, Start or Select** skips the intro to the title screen; **A, B or Start** skips the title animation, as in the game. Left alone, the title screen plays the intro again after 2700 frames (45 s).
- [x] Main menu as in FireRed: **CONTINUE** (player, time, badges; Pokédex once obtained) and **NEW GAME** when the account has a trainer, asked to the server (`GET /api/trainer`). FireRed has **no OPTION** entry here (Options are in the start menu).
  - Without a trainer (FireRed's empty save) there is nothing to choose: **Press Start goes straight to New Game**, as in the game, without drawing the menu.
  - A plays the select sound (New Game arrived in Phase 3, Continue arrives in Phase 4); B goes back to the title screen.
- [x] Sounds: `mus_game_freak`, `mus_intro_fight`, `mus_title`, `se_select`, Nidorino's cry (doubles mode) and Charizard's cry, looping like the game. The intro's "blast" is part of `mus_intro_fight`. Audio unlocked by the first tap or key (Safari).
- [x] Input: keyboard (desktop) and touch buttons (mobile) for directions, A, B and Start ([ui.md](../ui.md#input)).

## Done When

- [x] Play shows the intro, title screen and menu like the original, with sound, on desktop and mobile.
- [x] Skipping jumps straight to the title screen.
