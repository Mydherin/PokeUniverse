# M6 The Wild Battle Screen ⬜

Part of [Phase 7](../phase-7-wild-battles-catching.md). **Needs:** M4. Rules: [context.md](context.md); Phase 5's [M7 battle screen](../../phase-5-battle-system/milestones/m07-battle-screen.md).

**Done when:** a wild battle looks and sounds like FireRed's from the transition to the end: the right transition, terrain and intro, "Wild X appeared!", the shiny sparkle, the caught mark on the foe's healthbox, wild music, and every RUN, escape and whiteout message.

## Resume Here

**Not started.** First step: read `battle/transition.ts` (the only transition, `B_TRANSITION_ANGLED_WIPES`) and `battle/scene.ts` `drawTerrain` (building only), then add the terrain table.

## Tasks

### Transitions (`firered/battle/transition.ts`)

- [ ] FireRed's wild transitions from `sBattleTransitionTable_Wild` (context): `B_TRANSITION_SLICE`, `WHITE_BARS_FADE`, `CLOCKWISE_WIPE`, `GRID_SQUARES`, `BLUR`, `WAVE`, `RIPPLE`, from `src/battle_transition.c` (grep each `Task_` / `Phase2_` name). Picked by `BattleView.wild_transition` (M3). Played in the room: SLICE and WHITE_BARS_FADE (NORMAL); the others are written and checked once by forcing the type.

### Terrains (`firered/battle/scene.ts`, `make graphics`)

- [ ] FireRed's terrain table (`src/battle_bg.c`, grep `sBattleTerrainTable`): tiles, map, palette and entry art per terrain (grass, long grass, sand, underwater, water, pond, mountain, cave, building, plain); `make graphics` copies them from `graphics/battle_terrain/`. `drawTerrain` reads `BattleView.terrain`.

### Intro (`firered/battle/screen.ts`)

- [ ] `HandleIntroSlide`'s choice by terrain: `BattleIntroSlide1` (grass and most), `BattleIntroSlide2` (water, underwater: the waves), `BattleIntroSlide3` (building: built). Check which terrain uses which in `sBattleIntroSlideFuncs`.
- [ ] The wild Pokémon slides in from the left instead of a trainer (FireRed's wild intro in the controllers: grep `BATTLE_TYPE_TRAINER` in `src/battle_controller_opponent.c` intro), no foe party balls, the player's party balls only, its cry, "Wild {B_OPPONENT_MON1_NAME} appeared!" (`STRINGID_INTROMSG`, its wild variant in `src/battle_message.c`), then the player sends out as now.
- [ ] Shiny sparkle on a shiny wild Pokémon (grep `TryShinyAnimation` in `src/battle_gfx_sfx_util.c`; `SE_SHINY`; the sparkle sprites); check whether Phase 5 already plays it on send-out and reuse.
- [ ] The caught mark: a small ball on the foe's healthbox when the species is already caught (grep `HEALTHBOX_GFX_STATUS_BALL_CAUGHT` or the caught ball in `src/battle_interface.c`).

### Music and sounds

- [ ] `MUS_VS_WILD` from the transition, `MUS_VICTORY_WILD` on a win (check FireRed's choice in `src/battle_main.c` / `battle_setup.c`); `make audio` renders them; add them to `BATTLE_SOUNDS` for wild battles ([audio.md](../../../audio.md)). `SE_FLEE` on escape.

### Messages (`firered/battle/messages.ts`, `make text`)

- [ ] RUN: "Got away safely!" (`STRINGID_GOTAWAYSAFELY`), "Can't escape!" and its variants, "{mon} fled using its {item}!" with `B_ANIM_SMOKEBALL_ESCAPE` (written in Phase 5 M9, not hooked), "{mon} fled using {ability}!", the escape item's use text ("{PLAYER} used POKé DOLL!"), "Wild {mon} fled!" (Roar, Teleport), the trainer-battle RUN refusal stays.
- [ ] Wild whiteout: "{PLAYER} is out of usable POKéMON!", "{PLAYER} panicked and lost ¥X…", "… … … …", "{PLAYER} whited out!" (`STRINGID_PLAYERWHITEOUT`, `WHITEOUT2`, `PLAYERWHITEDOUT`); the ending fade as FireRed.
- [ ] The wild Pokémon's name in move messages: "Wild X used …" vs "Foe X used …" (check `B_OPPONENT_MON1_NAME`'s prefix rule).
- [ ] Pay Day's message.

## Play It

- In the test grass: SLICE or WHITE_BARS_FADE by level, the grass intro (with the patch's terrain set to grass), "Wild X appeared!" with its cry, wild music, a win with wild victory music.
- A shiny (SQL-forced personality, or a temporary roll override not committed): sparkle and sound.
- A caught species shows the mark; RUN messages for each way out; a whiteout's texts.
- Force each other transition and terrain once (temporary override, deleted): screenshots match FireRed (`make emulator` for the original).
