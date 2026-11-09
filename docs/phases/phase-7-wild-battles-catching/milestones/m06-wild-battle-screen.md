# M6 The Wild Battle Screen ✅

Part of [Phase 7](../phase-7-wild-battles-catching.md). **Needs:** M4. Rules: [context.md](context.md); Phase 5's [M7 battle screen](../../phase-5-battle-system/milestones/m07-battle-screen.md).

**Done when:** a wild battle looks and sounds like FireRed's from the transition to the end: the right transition, terrain and intro, "Wild X appeared!", the shiny sparkle, the caught mark on the foe's healthbox, wild music, and every RUN, escape and whiteout message.

## Resume Here

**Done 2026-11-09** (session 3: `make audio`, build, Play It). Next: [M7](m07-catch-scene.md).

Play It results (session 3, test grass 1F, Lucario L50 lead):
- SLICE by level (gray flashes, then rows split both ways) ✓; grass intro: BG1 tall-grass entry art slides and drops, the darkened Rattata slides in from the left with the trainer from the right, cry, healthbox slides in as its colors come back, player's balls, "Wild RATTATA appeared!", then the send-out ✓. Caught ball 16 px left of the foe's bar ✓ (every species is caught on account 2, so "no mark" wasn't seen).
- Sounds (logged by buffer length): `mus_vs_wild` from the transition ✓, `mus_victory_wild` on a win, then the map music ✓, `se_flee` with "Got away safely!" ✓, `se_shiny` ✓.
- Shiny (temporary client override): gold stars circle and cross 60 frames after the healthbox ✓.
- Forced once each (temporary override in `battle/state.ts` / `screen.ts`, deleted, git clean): WHITE_BARS_FADE + long grass, CLOCKWISE_WIPE + sand, GRID_SQUARES + underwater (pale blue is FireRed's palette), BLUR + water (waves), WAVE + pond, RIPPLE + mountain, SLICE + cave, building, plain (building art, green palette) ✓.
- Wild whiteout (Lucario 1 HP, others fainted, SQL): "AA is out of usable POKéMON!", "AA panicked and lost ¥400…", "… … … …", "AA whited out!", home ✓.
- Not played: Smoke Ball's `B_ANIM_SMOKEBALL_ESCAPE` before its message (hooked in `playback.ts` `escaped`; O4 moved to M8). Other RUN messages passed in M4.
- Test data restored: party Snorlax 0 HP, Lucario 136, Charizard 143, Garchomp 171; money 2560; 1F 10,5; test refresh tokens revoked.

Gotchas (Play It in the browser pane):
- Frame recorder: wrap `requestAnimationFrame` so after each callback every Nth frame `drawImage(canvas)` into a 256×192 2D canvas; show a contact sheet in a fixed `<img>` and screenshot it. Start it when a WebSocket message > 300 bytes arrives (the battle start).
- Walking: arrow presses must last ~260 ms (60 ms only turns). Sounds: wrap `AudioBufferSourceNode.prototype.start` and log `buffer.duration` (mus_vs_wild 76.9 s, mus_victory_wild 29.5, se_flee 0.73, se_shiny 0.88).
- Pane hidden: rAF stops; use the M3 recipe (rAF via setTimeout, fake ResizeObserver, `import` the index script) and capture `canvas.toDataURL()` right after the frame callback.
- `docker compose up -d --build spa-pokeuniverse` also restarts mic-core.

Done in session 2 (typecheck passes; not played):
- Intro: `screen.ts` `introJob` rewritten: two setup frames, band/halves as before, `scene.entrySlide()` (new in `scene.ts`: BG1 entry art, Slide1/2/3 motion and blend by terrain, `step(moving)` after the 32-frame delay, `end()`). Wild: foe switchIn events taken out of the playback list, art loaded during the transition (`playback.prepare`, now public, replaces `loadArt` + cry loading), mon shown darkened (blendPalette 10/16 to RGB(8,8,8)), x2 = −slide, cry at x2 0, then `playback.showHealthbox` (new, public: slide + shiny) with the palette back 2 a frame; then player's balls, `sText_WildPkmnAppeared` (added to `texts.json`), player's send-out.
- Shiny: new `battle/shiny.ts` `shinySparkle(flow, x, y)` (AnimTask_ShinySparkles, gold stars via new `anims/index.ts` `animTagArt`); `comeOut` uses `showHealthbox`, so every shiny send-out sparkles. SE_SHINY plays without panning.
- Transitions: `battleTransition(flow, wild?)` (screen.ts passes `state.wildTransition` when no trainer). Every transition starts with the gray flashes (`sTasks_Intro` all `Task_Intro`). Wild ones: `world.snapshot()` (new on `WorldView`; `world/scene.ts` via Phaser `renderer.snapshotArea`, scaled to 240×160 BGR555) taken once after the flashes; each frame composes `screen` into new `video.underlay` (shown where the backdrop is transparent; cleared by `video.reset`). Written: `slice` (Task_Slice: speed 256, accel 1→128 doubling, odd rows field x+effX, even x−effX, black off-range), `whiteBarsFade` (six bars, delays 0,9,15,6,12,3, 27 rows (last 25), x −24 and fade +192 a frame, lighten right of x; white; darken +480/256 until >16). Also `wave` (Task_Wave: edge tX+8/frame + Sin(i,40), i +4/row, +16/frame), `ripple` (VOFS Sin per row, amplitude +384 to 0x1fff, fade to black from frame 41, 10 a frame), `blur` (mosaic counter+1 every 3 frames to 15, fade 3/frame from step 10), `gridSquares` (grid_square.png 14 stages every 3 frames over the field, palette sliding_pokeball.pal, then 15 frames), `clockwiseWipe` (geometric sweep: hand end on the edges 32/16 px a frame; the last quarter isn't drawn, like FireRed's BUG, the hand waits there). Ends black (FadeScreenBlack). **Difference (tech):** the field is a still picture during the transition (Phaser draws it apart; FireRed's keeps animating and its OBJs aren't shifted by SLICE).
- Caught mark: `BattleHost.caught(species)` (`overworld.ts` battleHost: `pokedex.caught`), `HealthboxMon.caught` (wild foe only), `healthbox.ts` `GFX.ballCaught` 70 copied to bar sheet tile 8 when no status (cleared with a status), new foe-only 8×8 `ball` sprite at bar's left −16 (sHealthBar_Subsprites_Opponent).

Done in session 1 (files touched):
- Terrain table: `Makefile` (all `battle_terrain/<t>/terrain.* anim.*` + `indoor/plain.pal`), `manifest.ts` (`battleTerrain_<t>`, `battleTerrainEntry_<t>`, `battleTerrainPlainPal`), `battle/scene.ts` (`TERRAIN_ART`, `terrainId()`, ctor's `terrainId`, `drawTerrain` by it, `terrainEntry()`), `battle/state.ts` (`terrain`, `wildTransition` from the view), `screen.ts` `newScene` passes it, `anims/script.ts` `AnimBackdrop.terrainId`, `anims/behaviors/utility.ts` `AnimTask_GetBattleTerrain` reads it. Unset terrain = building (trainer battles).
- Music: `sounds.json` + `BATTLE_SOUNDS` get `mus_vs_wild`, `mus_victory_wild`, `se_flee`; intro and redraw play `mus_vs_wild` when no trainer; `playback.ts` `exp` case plays `mus_victory_wild` once (Cmd_getexp ~3219: wild, player's mon alive, `wildVictory` flag). `boot.ts` `TEXT_SONGS` 17 → `se_flee` (the texts' `{PLAY_SE SE_FLEE}`).
- Messages: RUN lines were already done in M4 (`messages.ts` `escaped`/`escapeFailed`/`wildFled`); "Wild"/"Foe" prefix already in `text.ts` `nameWithPrefix`. Added: `playback.ts` `escaped` case plays `B_ANIM_SMOKEBALL_ESCAPE` first for Smoke Ball; `screen.ts` `endJob` wild loss: `sText_PlayerWhiteout` then `sText_PlayerPanicked` (money > 0) or `sText_PlayerWhiteout2`; won with `e.payDay > 0`: `sText_PkmnPickedUpItem` (Cmd_givepaydaymoney). `texts.json` gets the three strings.

Looked up (don't re-read):
- `sBattleIntroSlideFuncs`: Slide1 grass, long grass, pond, mountain, cave; Slide2 sand, underwater, water; Slide3 building, plain. Plain = building art + `indoor/plain.pal`.
- BG1 = entry art (`anim.png/bin`, 32×14 tiles, terrain palette), template charbase 1, size 2 (256×512), priority 0; cleared at the slide's end. Every slide: case0 1 frame, case1 1 frame, case2 band opens 1 line/frame to 48, case3 32-frame delay, band 4/frame, halves slide 240→0 by 2.
- Slide1: BG1_X += 6/frame; after the 32-frame delay BG1_Y −1/frame to −56 (long grass −2 to −80). No blend.
- Slide2: BG1_X += 8 (sand, water) / 6 (underwater); water: BG1_Y = cos(d)·4096/512 − 8, d += 4 (<180) else 6, wraps 360. After the delay: blend BG1 over BG3+OBJ, EVA 16−k / EVB k, k+1 every 4 frames until EVA 0.
- Slide3: BG1_X += 8; blend 8/8 from the start; after the delay EVA−1/EVB+1 every 6 frames until EVA 0.
- Wild mon (battle_main.c 1883 `SpriteCB_EnemyMon`): OBJ palette 1 faded to RGB(8,8,8) at 10/16; x2 from −240 +2/frame while sliding (with the halves); at 0 `PlayCry_Normal`; when its anim ends: healthbox slides in, palette fades 10→0 (2 a frame). Then party balls (player's only), `STRINGID_INTROMSG` wild ("Wild X appeared!"), then the player's send-out. The foe's switchIn event must be taken out of the intro's playback list.
- Victory music: `battle_script_commands.c` 3219. Whiteout: `battle_scripts_1.s` 2930. Strings: `battle_message.c` 74-78, 178.

## Tasks

### Transitions (`firered/battle/transition.ts`)

- [x] FireRed's wild transitions from `sBattleTransitionTable_Wild` (context): `B_TRANSITION_SLICE`, `WHITE_BARS_FADE`, `CLOCKWISE_WIPE`, `GRID_SQUARES`, `BLUR`, `WAVE`, `RIPPLE`, from `src/battle_transition.c` (grep each `Task_` / `Phase2_` name). Picked by `BattleView.wild_transition` (M3). Played in the room: SLICE and WHITE_BARS_FADE (NORMAL); the others are written and checked once by forcing the type.

### Terrains (`firered/battle/scene.ts`, `make graphics`)

- [x] FireRed's terrain table (`src/battle_bg.c`, grep `sBattleTerrainTable`): tiles, map, palette and entry art per terrain (grass, long grass, sand, underwater, water, pond, mountain, cave, building, plain); `make graphics` copies them from `graphics/battle_terrain/`. `drawTerrain` reads `BattleView.terrain`.

### Intro (`firered/battle/screen.ts`)

- [x] `HandleIntroSlide`'s choice by terrain: `BattleIntroSlide1` (grass and most), `BattleIntroSlide2` (water, underwater: the waves), `BattleIntroSlide3` (building: built). Check which terrain uses which in `sBattleIntroSlideFuncs`.
- [x] The wild Pokémon slides in from the left instead of a trainer (FireRed's wild intro in the controllers: grep `BATTLE_TYPE_TRAINER` in `src/battle_controller_opponent.c` intro), no foe party balls, the player's party balls only, its cry, "Wild {B_OPPONENT_MON1_NAME} appeared!" (`STRINGID_INTROMSG`, its wild variant in `src/battle_message.c`), then the player sends out as now.
- [x] Shiny sparkle on a shiny wild Pokémon (grep `TryShinyAnimation` in `src/battle_gfx_sfx_util.c`; `SE_SHINY`; the sparkle sprites); check whether Phase 5 already plays it on send-out and reuse.
- [x] The caught mark: a small ball on the foe's healthbox when the species is already caught (grep `HEALTHBOX_GFX_STATUS_BALL_CAUGHT` or the caught ball in `src/battle_interface.c`).

### Music and sounds

- [x] `MUS_VS_WILD` from the transition, `MUS_VICTORY_WILD` on a win (check FireRed's choice in `src/battle_main.c` / `battle_setup.c`); `make audio` renders them; add them to `BATTLE_SOUNDS` for wild battles ([audio.md](../../../audio.md)). `SE_FLEE` on escape.

### Messages (`firered/battle/messages.ts`, `make text`)

- [x] RUN: "Got away safely!" (`STRINGID_GOTAWAYSAFELY`), "Can't escape!" and its variants, "{mon} fled using its {item}!" with `B_ANIM_SMOKEBALL_ESCAPE` (written in Phase 5 M9, not hooked), "{mon} fled using {ability}!", the escape item's use text ("{PLAYER} used POKé DOLL!"), "Wild {mon} fled!" (Roar, Teleport), the trainer-battle RUN refusal stays.
- [x] Wild whiteout (texts; the ending fade is the existing one): "{PLAYER} is out of usable POKéMON!", "{PLAYER} panicked and lost ¥X…", "… … … …", "{PLAYER} whited out!" (`STRINGID_PLAYERWHITEOUT`, `WHITEOUT2`, `PLAYERWHITEDOUT`); the ending fade as FireRed.
- [x] The wild Pokémon's name in move messages: "Wild X used …" vs "Foe X used …" (check `B_OPPONENT_MON1_NAME`'s prefix rule).
- [x] Pay Day's message.

## Play It

- In the test grass: SLICE or WHITE_BARS_FADE by level, the grass intro (with the patch's terrain set to grass), "Wild X appeared!" with its cry, wild music, a win with wild victory music.
- A shiny (SQL-forced personality, or a temporary roll override not committed): sparkle and sound.
- A caught species shows the mark; RUN messages for each way out; a whiteout's texts.
- Force each other transition and terrain once (temporary override, deleted): screenshots match FireRed (`make emulator` for the original).
