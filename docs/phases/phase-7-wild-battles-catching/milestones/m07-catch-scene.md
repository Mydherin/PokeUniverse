# M7 Ball Throw and the Catch Scene 🚧

Part of [Phase 7](../phase-7-wild-battles-catching.md). **Needs:** M5, M6. Rules: [context.md](context.md) D10; Phase 5's [animation engine](../../phase-5-battle-system/milestones/m08-animation-engine.md) and [M9](../../phase-5-battle-system/milestones/m09-firered-move-animations.md) (how to write a task or a sprite behavior).

**Done when:** throwing any ball plays FireRed's animation with that ball's art and particles, the shakes and messages match the result, a catch plays "Gotcha!" with its fanfare and stars, then (in FireRed's order) the Pokédex page for a new species, the nickname question and naming screen, and the sent-to-PC message; a trainer blocks a ball with FireRed's animation.

## Resume Here

**In progress (session 2 ended 2026-11-09, usage limit).** Build: `npx tsc --noEmit -p spa-pokeuniverse` passes; nothing played yet; `make graphics` done (new balls copied); **`make audio` not run yet** (new sounds below).

**Done:**
- Art: Makefile `EXPANSION_GFX_FILES` + `balls/{heal,dusk,quick}.png`; manifest `BATTLE_GRAPHICS`: `ball_<name>` (11 FireRed + 3 expansion) and `ballParticles2`. Still to do: add the expansion balls to the copied-asset exceptions in AGENTS.md and tech-stack.md (`#firered-as-reference`).
- Sounds: `sounds.json` and `BATTLE_SOUNDS` + `se_ball_bounce_2/3/4`, `se_ball_click`, `mus_caught_intro`, `mus_caught` (run `make audio`; add them to docs/audio.md's table if it lists battle sounds).
- `firered/pokeball.ts` generalized: `BallId` (FireRed order, then Heal 12, Dusk 13, Quick 14), `BALLS` (art, color, particle anim, open kind), `ballIdOf(item)` (= ItemIdToBallId), `BallAffine` + the ball's affine anims, all 6 particle anims; public `loadGfx/freeGfx(ball)`, `sprite(ball, x, y, sub)`, `particle(...)`, `particles(x, y, prio, sub, ball)` (every ball's open task), `fadeMon(monPal, selected, ball, unfadeLater)` (both LaunchBallFadeMonTask variants); `flying`, `releaseInBattle`, `switchOutEffect` take an optional ball (default Poké). Particles are freed when the last one ends (counter, not data[7]).

- `battle/anims/behaviors/ball.ts` (session 2): `BALL_TASKS` (Load/FreeBallGfx, ThrowBall, IsBallBlockedByTrainerOrDodged) + `BALL_TASK_SOUNDS`, registered in `behaviors.ts`; ported frame by frame from `battle_anim_special.c` 734-1385 (shrink, bounce, shake, click/stars/fade, break-out, block); ghost dodge falls back to the block (Phase 12). `AnimContext.ballThrow { ball, result }` in `script.ts` (result: shakes 0-3, 4 caught, 5 block). Typechecks.

- Playback (session 2): `ballThrown` case in `playback.ts` (used-item line, `B_ANIM_BALL_THROW` with `ballThrow`, then block lines / `BALL_ESCAPE_TEXTS[shakes]` / Gotcha; caught foe added to `hidden`); old `ballBlocked()` and the `itemUsed` ball branch removed (the server sends no `bagitem` for balls: `mic-battles/src/engine/catch.ts` emits only `|ball|`). Send-out and switch-out use the mon's ball: `PlaybackHost.ballOf(slot)` (screen.ts, party `ball`), foes always Poké Ball.
- Texts: the 9 strings added to `texts.json`, `make text` run (702 strings).

- Text codes (session 2): `gba/text.ts` 0x0B PLAY_BGM → `ctx.playBgm` (`TEXT_MUSIC` 322 → `mus_caught` in `boot.ts`), {WAIT_SE} waits on `ctx.sePlaying` (`isPlaying("se")`). Typechecks.

**Next step:** the end flow in `battle/screen.ts` `endJob` (CAUGHT: `e.caught` = `CaughtPokemon` {species, nickname_pending, where, box, box_name, box_full_before, new_in_pokedex, slot}): "…data was added to the POKéDEX." + Pokédex page if new (`pokedex-pages.ts`) → "Give a nickname…" YES/NO (B = NO) → `naming-screen.ts` caught mode → send `NameCaughtPokemon` (`party.proto:198`, realtime `name_caught_pokemon = 37`; no client sender yet: find how other realtime party messages are sent, e.g. grep `learnMove` in the host) → PC message only on NO with `where == BOX` (STR_VAR_1 box name, 2 mon, 3 full box: `expandPlaceholders` codes 2/3/4; "Someone's" for now). No victory music/exp after a catch. Then the Trainer-block task line, the AGENTS.md / tech-stack.md copied-asset line for the expansion balls, docs/audio.md sounds, `make audio`, build, Play It.

### Looked up (don't re-read)

- **Throw** (`battle_anim_special.c` 727-1440): ball at (32, 80) subpriority 29, `arc` 34 steps to target spot (X, Y−16), amplitude −40. Then by case (`BALL_NO_SHAKES` 0 … `BALL_3_SHAKES_FAIL` 3, `_SUCCESS` 4, `TRAINER_BLOCK` 5, `GHOST_DODGE` 6; ours: case = caught ? 4 : shakes, blocked 5): anim 1 (open), particles at (x, y−5) prio 1 sub 28, fade task (to color, `unfadeLater` 0, palettes 14); 10 frames; mon shrinks (scale 256 +0x20/frame to ≥0x480, y2 rises by distance·256/28 per frame, SE_BALL_TRADE at frame 11) then invisible; anim 2 (close) → wait animEnded → fall: y += 40, y2 = −cos(d5, d4) bounce: d4 40, −10 each bounce, d5 += (bounces+4) up to 64 then back; SE_BALL_BOUNCE_1..4; after 4th y2 0. Case 0: 31 frames then break out. Else 31 frames, affine 1, SE_BALL, shake state machine (subpixel 0xB0, x2 ±1, phases 8/13/5 frames, affine 1 = rotate −3/frame right? (`sAffineAnim_BallRotate` 0 none, 1 rot −3, 2 rot +3, 3 reset, 4 rot 25), between shakes 31 frames + affine 3 then 1/2 + SE_BALL). After shake n: n == case → 31 frames → break out (anim 1, affine 0, particles, fade `unfadeLater` 1, mon visible, affine 1 emerge, rise data[1] 0x1000 −288/frame, end); case 4 and n == 3 → click: animPaused; frame 40 SE_BALL_CLICK + BlendPalettes(ball pal, 6, black) + 3 stars (`sCaptureStar` (10,2,−3) (15,0,−4) (−10,2,−4), arc 24 steps, master particle anim 1, blink); 60 fade ball pal 6→0 delay 2; 95 stop all music + play MUS_CAUGHT_INTRO as SE; 315 destroy mon sprite, then ball fades: OBJ blend 16/0 → 1 step every 2 frames to 0/16, palette to white 0→16, invisible, wait fade, end.
- **Block**: after the arc, x2/y2 folded in; each frame x2 −= (d1+0x680)>>8, y2 += (d0+0x800)>>8, keep low bytes; until y > 160 or x < −8. Then the script's `BallThrowTrainerBlock` (hit splat on the foe, SE_M_DOUBLE_SLAP).
- **Particles** (1448-1830): Poké 16 one per frame (exists in `pokeball.ts`); others `FanOut` (x2 = sin(d0, d1), y2 = cos(d0, d2), d0 += d4, d1 += d5, d2 += d6, 51 frames): Timer/Repeat? see table — Timer 8×(i·32, 10, 2, 1); Dive 8×(i·32, 10, 1, 2); Safari/Net 8×(i·32, 4, 1, 1); Ultra/Nest(/Dusk/Quick) 10×(i·25, 5, 1, 1); Great/Luxury twice 8 frames apart 8×(i·32, 8, 2, 2); Master 2×8 (i·32, 8, (2,1) then (1,2)); Repeat 12×i·21 with x2 = sin(d0, d1), y2 = cos(d0, sin(d0, d2)), d0 += 6; Premier 8×i·32 y2 = cos(d0, sin(d0 & 63, d2)), d0 += 10. Anim nums: Poké/Great/Safari/Heal 0, Master 1, Net/Dive/Dusk 2, Nest 3, Luxury/Premier/Quick 4, Ultra/Repeat/Timer 5 (anims: 0 regular cycle, 1 frame 3, 2 frame 4, 3 frame 5, 4 frames 6/7 ×4 loop, 5 frame 7).
- **Expansion balls** (`battle_anim_throw.c` 286-340): Heal color (31,23,27) Poké particles; Dusk (7,1,13) Ultra particles; Quick (16,25,30) Ultra particles; all three use `battle_anims/sprites/particles2.png` (sheet and its own palette, already copied: `expansion/battle_anims/sprites/particles2.png`). Ball PNGs `graphics/balls/{heal,dusk,quick}.png` 16×48 (to add to `EXPANSION_GFX_FILES`).
- **Messages**: `BattleScript_SuccessBallThrow`: "Gotcha! … caught!" (`{WAIT_SE}{PLAY_BGM MUS_CAUGHT}`: waits the intro, then MUS_CAUGHT), if new: "…data was added to the POKéDEX." + dex page; "Give a nickname…" YES/NO (`Cmd_trygivecaughtmonnick`: B = NO); **YES → naming → no PC message; NO → PC message only if the party was full** (FireRed's order). PC texts `data/text/pc_transfer.inc` (`Text_MonSentToBoxInSomeonesPC`, `Text_MonSentToBoxSomeonesBoxFull`, STR_VAR_1 box, STR_VAR_2 mon, STR_VAR_3 full box). Failed: `gBallEscapeStringIds` = sText_PkmnBrokeFree / ItAppearedCaught / AarghAlmostHadIt / ShootSoClose (by shakes 0-3). `sText_PlayerUsedItem` exists in texts.json; check the others there before `make text`.

## Tasks

### Animation (`firered/battle/anims/behaviors/`)

- [x] `AnimTask_LoadBallGfx`, `AnimTask_FreeBallGfx`, `AnimTask_ThrowBall` (734), `AnimTask_IsBallBlockedByTrainerOrDodged` (684), and the ball sprite's callbacks in `src/battle_anim_special.c`: the arc to the foe, the open (`SE_BALL_OPEN`), the Pokémon drawn into the ball (`LaunchBallFadeMonTask` 1865, its palette fade), the drop and bounces (`SE_BALL_BOUNCE_1`-`4`), the shakes (`SE_BALL`), then either breaking free (the ball opens, the Pokémon comes back out with its palette fade) or the click (`SE_BALL_CLICK`) and the stars (`SpriteCB_BallCaptureSuccessStar` 1298), the ball staying until the end.
- [x] (`pokeball.ts` `BALLS`, `ballIdOf`) `ItemIdToBallId` (702) for our catalog, Gen 4 balls included; per ball: sprite sheet and palette (`gBallSpriteSheets`, `gBallSpritePalettes`), open particles and their animation (`sBallParticleSpriteSheets`, grep `sBallParticleAnimNums`), the fade color (`sBallOpenFadeColors`).
- [x] `BallThrowTrainerBlock` (ball.ts `blocked`; playback prints the two lines) (the ball bounced away) for trainer battles; `BallThrowGhostDodged` stays unused until Pokémon Tower (Phase 12).
- [x] The send-out (`pokeball.ts`) already uses each ball's sprite? Check: party Pokémon caught in Gen 4 balls must send out from their own ball.

### Art (`make graphics`)

- [~] (copied and in the manifest; the AGENTS.md / tech-stack.md exception line still to write) FireRed's 12 balls and particles from `graphics/battle_anims/` / `graphics/balls/` (check the paths); Heal, Dusk and Quick from `pokeemerald-expansion` `graphics/balls/` and its particles. That's a new copied asset: add it to the build exceptions in AGENTS.md and [tech-stack.md](../../../tech-stack.md#firered-as-reference).

### Messages and flow (`firered/battle/playback.ts`, `messages.ts`, `make text`)

- [x] "{PLAYER} used {ITEM}!" (`BattleScript_ThrowBall`), then by shakes `gBallEscapeStringIds`: "Oh, no! The POKéMON broke free!", "Aww! It appeared to be caught!", "Aargh! Almost had it!", "Shoot! It was so close, too!".
- [ ] Caught, as `BattleScript_SuccessBallThrow` (73): "Gotcha! {mon} was caught!" with the caught fanfare (check which: `MUS_CAUGHT_INTRO` then `MUS_CAUGHT`, grep both in `src/`); if `new_in_pokedex`: "{mon}'s data was added to the POKéDEX." and the Pokédex page (`DexScreen_RegisterMonToPokedex`, `src/pokedex_screen.c`; reuse `pokedex-pages.ts`), back to the battle.
- [ ] "Give a nickname to the captured {mon}?" YES / NO (`Cmd_trygivecaughtmonnick` 9789) → `naming-screen.ts` in its caught-Pokémon mode (`NAMING_SCREEN_CAUGHT_MON`: the Pokémon's icon and title) → `NameCaughtPokemon` (M5); NO keeps the name.
- [ ] Where it went (`Cmd_givecaughtmon` 9617, `gCaughtMonStringIds`): nothing for the party; "{mon} was transferred to someone's PC. It was placed in BOX "{box}"."; the BOX-full variant naming both boxes. "Someone's" until the player meets BILL (`FLAG_SYS_NOT_SOMEONES_PC`, Phase 12): use "someone's" now and leave the flag's hook.
- [ ] The battle's end after a catch: fade out with the fanfare, no victory music, no exp (D9); evolutions from earlier exp this battle still run after (check FireRed's order).

## Play It

- One throw per result: 0, 1, 2, 3 shakes and a catch (a temporary roll override, deleted), each with its message.
- Each ball's art and particles once (give them by SQL), including Heal, Dusk and Quick; a Gen 4 ball's Pokémon sends out from its own ball.
- A new species: Pokédex page; a caught-before species: no page. Name it; cancel naming on another.
- Full party: the PC message; full box: the variant.
- Room trainer: the block animation and messages.
- Compare the throw frame by frame with the original once (`make emulator`, a state in a wild battle).
