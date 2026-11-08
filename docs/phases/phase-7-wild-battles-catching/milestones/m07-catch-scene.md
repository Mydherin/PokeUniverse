# M7 Ball Throw and the Catch Scene ⬜

Part of [Phase 7](../phase-7-wild-battles-catching.md). **Needs:** M5, M6. Rules: [context.md](context.md) D10; Phase 5's [animation engine](../../phase-5-battle-system/milestones/m08-animation-engine.md) and [M9](../../phase-5-battle-system/milestones/m09-firered-move-animations.md) (how to write a task or a sprite behavior).

**Done when:** throwing any ball plays FireRed's animation with that ball's art and particles, the shakes and messages match the result, a catch plays "Gotcha!" with its fanfare and stars, then (in FireRed's order) the Pokédex page for a new species, the nickname question and naming screen, and the sent-to-PC message; a trainer blocks a ball with FireRed's animation.

## Resume Here

**Not started.** First step: read `Special_BallThrow` in `anims/firered.json` and list the tasks and sprite callbacks it calls that aren't in `anims/behaviors/` yet; write the list here.

## Tasks

### Animation (`firered/battle/anims/behaviors/`)

- [ ] `AnimTask_LoadBallGfx`, `AnimTask_FreeBallGfx`, `AnimTask_ThrowBall` (734), `AnimTask_IsBallBlockedByTrainerOrDodged` (684), and the ball sprite's callbacks in `src/battle_anim_special.c`: the arc to the foe, the open (`SE_BALL_OPEN`), the Pokémon drawn into the ball (`LaunchBallFadeMonTask` 1865, its palette fade), the drop and bounces (`SE_BALL_BOUNCE_1`-`4`), the shakes (`SE_BALL`), then either breaking free (the ball opens, the Pokémon comes back out with its palette fade) or the click (`SE_BALL_CLICK`) and the stars (`SpriteCB_BallCaptureSuccessStar` 1298), the ball staying until the end.
- [ ] `ItemIdToBallId` (702) for our catalog, Gen 4 balls included; per ball: sprite sheet and palette (`gBallSpriteSheets`, `gBallSpritePalettes`), open particles and their animation (`sBallParticleSpriteSheets`, grep `sBallParticleAnimNums`), the fade color (`sBallOpenFadeColors`).
- [ ] `BallThrowTrainerBlock` (the ball bounced away) for trainer battles; `BallThrowGhostDodged` stays unused until Pokémon Tower (Phase 12).
- [ ] The send-out (`pokeball.ts`) already uses each ball's sprite? Check: party Pokémon caught in Gen 4 balls must send out from their own ball.

### Art (`make graphics`)

- [ ] FireRed's 12 balls and particles from `graphics/battle_anims/` / `graphics/balls/` (check the paths); Heal, Dusk and Quick from `pokeemerald-expansion` `graphics/balls/` and its particles. That's a new copied asset: add it to the build exceptions in AGENTS.md and [tech-stack.md](../../../tech-stack.md#firered-as-reference).

### Messages and flow (`firered/battle/playback.ts`, `messages.ts`, `make text`)

- [ ] "{PLAYER} used {ITEM}!" (`BattleScript_ThrowBall`), then by shakes `gBallEscapeStringIds`: "Oh, no! The POKéMON broke free!", "Aww! It appeared to be caught!", "Aargh! Almost had it!", "Shoot! It was so close, too!".
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
