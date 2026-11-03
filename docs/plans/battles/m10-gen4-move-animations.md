# M10 Gen 4 Move Animations (355-467) ✅

Part of the [battles plan](README.md). **Needs:** M8, M9. Shared rules: [context.md](context.md). **Done when:** moves 355-467 animate in Gen 3 style.

- [x] The expansion's behaviors and art for all 113 moves. No sound was missing (all in `sounds.json`).
- [x] The test teams' Gen 4 moves (written with the rest, not first).
- [x] `make graphics` and rebuild the SPA image.
- [x] Sweep moves 355-467 in the game (D23: no emulator comparison).
- [x] Fix what the sweep finds (Mud Bomb and Rock Wrecker crashed: `startAnim`/`startAffineAnim` on a table the C leaves as a dummy).

## Sweep Result (2026-11-03)

- **Seen:** all 113 moves, with both turns of Shadow Force: 111 on the player's side, 36 on the foe's (Feint, Psycho Cut, Trump Card, Wood Hammer, Stealth Rock, Draco Meteor and 30 others). Embargo and Fling were only seen on the foe's side. Still frames only.
- **Checked by the hook on every move played:** no generic fallback, no hang, no leftover sprites, screen back to its first frame after each.
- **Not checked:** sound (the hook only counted the calls; Wring Out's script has none), real turns (the moves played through a hook with fixed power, not from Showdown's events), the emulator (D23).

## What Was Built

- **`behaviors/gen4.ts`:** `gen4Templates(base)` is called from `behaviors.ts` with the FireRed templates. `skin(name, look)` covers 48 templates; 36 others are new callbacks, Avalanche's shake and partner-only no-ops. Also `GEN4_TASKS`, `GEN4_TASK_SOUNDS`, `GEN4_TASK_TAGS`.
- **Lifted out to share:** `water.ts` `rain` (Brine), `psychic.ts` `orbSwap` (Heart Swap), `electric.ts` `chargingParticles` (Flash Cannon), `ghost.ts` `whiteShadow` (Dark Void). `particles.ts` exports `basicHit`.
- **Engine (`engine.ts`, `script.ts`, `util.ts`):** `AnimSpriteTemplate.paletteTag` (one tag's art, another's colors); `needs()` reads `TASK_TAGS` and `TASK_TAG_ARG`, because the expansion's scripts load no art; `run.loadTag`, called by `tagPaletteOffset` (TryLoadPal); `run.retarget`; `tagName`.
- **`expansion.json` edited by hand (D9):** Flash Cannon → `AnimTask_FlashCannonCharge`, Dark Void → `AnimTask_DarkVoidBlackHole` (the C checks the move); `AnimTask_InvertScreenColor` `[7]` → FireRed's `[256,256,256]`; `se` on `SoundTask_PlaySeChangingVolume` (also in `infra/battle/anims.mjs`); the 16 `gElectricitySpriteTemplate` commands on partners (`args[4]` 2, 3) removed.

## Known Differences and Gotchas

- Heal Block's sound plays at full volume (`SoundTask_PlaySeChangingVolume`: no fade).
- **M13 (doubles) must restore** the removed electricity commands and the partner slides (`partnerOnly` in `gen4.ts`).
- A new tag passed as a task arg needs an entry in `TAG_BY_ID` (`util.ts`) and its task in `TASK_TAG_ARG` (`behaviors.ts`). A sprite a task creates needs its tag in `GEN4_TASK_TAGS`, or it draws without art.
- Don't read a new arg in a behavior shared with FireRed's scripts: stale `gBattleAnimArgs` make it unsafe. Edit the data or add a template (why the electricity commands changed).
- Move checks in the expansion's C become their own task names, not a move ID in the context.
- A shared callback may start an anim its `skin` has no table for: give the skin one (the C's dummy table does nothing).
- **Faster sweeps** than [M9's](m09-firered-move-animations.md#known-differences): in the throwaway build, step 12 frames per update in `game.ts`, and make the hook report generic fallback, thrown errors, hangs, leftover sprites and the last frame against the first. Pick frames evenly over time for moves with a background: "most different" picks only show the fade.
