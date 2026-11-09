# M6 The Wild Battle Screen 🔄

Part of [Phase 7](../phase-7-wild-battles-catching.md). **Needs:** M4. Rules: [context.md](context.md); Phase 5's [M7 battle screen](../../phase-5-battle-system/milestones/m07-battle-screen.md).

**Done when:** a wild battle looks and sounds like FireRed's from the transition to the end: the right transition, terrain and intro, "Wild X appeared!", the shiny sparkle, the caught mark on the foe's healthbox, wild music, and every RUN, escape and whiteout message.

## Resume Here

**In progress (session 1, 2026-11-09).** Typecheck passes (`cd spa-pokeuniverse && npx tsc --noEmit -p .`); `make graphics`, `make text`, `make audio` **not run yet** (needed for the new terrain art, texts and songs). Nothing played yet.

**Next step:** the wild intro in `battle/screen.ts` `introJob` (~line 176), then the slides' BG1 entry art, then the transitions, shiny, caught mark; then build and Play It.

Done this session (files touched):
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

- [ ] FireRed's wild transitions from `sBattleTransitionTable_Wild` (context): `B_TRANSITION_SLICE`, `WHITE_BARS_FADE`, `CLOCKWISE_WIPE`, `GRID_SQUARES`, `BLUR`, `WAVE`, `RIPPLE`, from `src/battle_transition.c` (grep each `Task_` / `Phase2_` name). Picked by `BattleView.wild_transition` (M3). Played in the room: SLICE and WHITE_BARS_FADE (NORMAL); the others are written and checked once by forcing the type.

### Terrains (`firered/battle/scene.ts`, `make graphics`)

- [x] FireRed's terrain table (`src/battle_bg.c`, grep `sBattleTerrainTable`): tiles, map, palette and entry art per terrain (grass, long grass, sand, underwater, water, pond, mountain, cave, building, plain); `make graphics` copies them from `graphics/battle_terrain/`. `drawTerrain` reads `BattleView.terrain`.

### Intro (`firered/battle/screen.ts`)

- [ ] `HandleIntroSlide`'s choice by terrain: `BattleIntroSlide1` (grass and most), `BattleIntroSlide2` (water, underwater: the waves), `BattleIntroSlide3` (building: built). Check which terrain uses which in `sBattleIntroSlideFuncs`.
- [ ] The wild Pokémon slides in from the left instead of a trainer (FireRed's wild intro in the controllers: grep `BATTLE_TYPE_TRAINER` in `src/battle_controller_opponent.c` intro), no foe party balls, the player's party balls only, its cry, "Wild {B_OPPONENT_MON1_NAME} appeared!" (`STRINGID_INTROMSG`, its wild variant in `src/battle_message.c`), then the player sends out as now.
- [ ] Shiny sparkle on a shiny wild Pokémon (grep `TryShinyAnimation` in `src/battle_gfx_sfx_util.c`; `SE_SHINY`; the sparkle sprites); check whether Phase 5 already plays it on send-out and reuse.
- [ ] The caught mark: a small ball on the foe's healthbox when the species is already caught (grep `HEALTHBOX_GFX_STATUS_BALL_CAUGHT` or the caught ball in `src/battle_interface.c`).

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
