# M8 Animation Engine and Generic Animations ⬜

Part of the [battles plan](README.md). **Needs:** M7, D9 confirmed by the user. Shared rules and context: [context.md](context.md).

**Read:** FireRed's `src/battle_anim.c` (script commands), `battle_anim_mons.c`, `battle_anim_utility_funcs.c`, `battle_anim_mon_movement.c`, `battle_anim_status_effects.c`, `battle_anim_effects_*.c`, `data/battle_anim_scripts.s` (the general and status anims).

- [ ] `infra/battle/anims.mjs`: converts each move's and each general, status and special animation's script into JSON (commands, args, sprite templates by name, sounds, pans). Moves 1-354 from FireRed, 355-467 from the expansion. Committed to `firered/battle/anims/`. The art they use goes into `make graphics` (FireRed's and the expansion's `battle_anims/` sprites and backgrounds, gitignored).
- [ ] `firered/battle/anims/engine.ts`: the script interpreter: createsprite, createvisualtask, delay, waitforvisualfinish, playsewithpan and pan helpers, monbg/clearmonbg, setalpha/blendoff, fadetobg/restorebg, loopsewithpan, jumps, calls and returns.
- [ ] Behaviors library (`anims/behaviors/*.ts`, by family): mon movement (shake, slide, jump), blend and flash, sprite travel (linear, arc, orbit, homing), particles, background scroll.
- [ ] Generic fallback per type × category (D9); general animations: status (poison, burn, paralysis, sleep, confusion, infatuation), stat up/down, weather, substitute, ball throw, held items, Leftovers, hazards.
- [ ] BATTLE SCENE OFF skips move animations (the trainer's option).
- **Done when:** every move animates (exact or fallback), and status and weather show.

## Progress

Not started. While 🚧: tasks ticked above, then here the exact next step, files touched, build state, gotchas.
