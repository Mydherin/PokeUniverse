# M8 Animation Engine and Generic Animations ✅

Part of the [battles plan](README.md). Done 2026-11-02 (lightly play-tested by the user). How to write behaviors, the coverage check and the open checks moved to [M9](m09-firered-move-animations.md).

## What It Built (used by M9, M10)

| Piece | Where |
|---|---|
| Converted scripts (D9): moves 1-354 FireRed, 355-467 expansion, FireRed's general/status/special | `infra/battle/anims.mjs` (once) → `spa-pokeuniverse/src/game/firered/battle/anims/{firered,expansion}.json` |
| Art per tag and move backgrounds (411 tags; joined sheets `png: [..]`; backgrounds per game by BG_*) | `infra/battle/anim-art.mjs` (once) → `anims/art.json`; `Assets.animArt(files)`; `make graphics` copies the expansion's `battle_anims/` |
| Engine: commands, timing, flow, sprites, tasks, sound tasks, pans, blending, background fades, preload of a program's art/sounds, restore at the end; `canPlay` → generic fallback | `anims/engine.ts`, `anims/script.ts`, `anims/index.ts` (`moveAnimation`, `generalAnimation`, `loadAnimations`) |
| Generic animation by type × category | `anims/generic.ts` |
| Behaviors by family (aggregated by `behaviors.ts`; `TASK_ART`/`ART` for a task's own art) | `anims/behaviors/{util,mon-movement,blend,particles,bg,sound,status,weather}.ts` |
| Playback: move anims (BATTLE SCENE OFF skips), two-turn moves (`turn` 0/1, no "used" on the charge turn, Fly/Dig/Dive/Bounce/Shadow Force hidden between turns, Solar Beam in sun), general anims (status, confusion, love, Curse/Nightmare, stat changes with MULTIPLE runs, weather upkeep; status ones skip with BATTLE SCENE OFF or out of sight) | `firered/battle/playback.ts` |
| Stereo pan per sound player | `gba/sound.ts` (`play(id, player, pan)`, `setPan`) |
