# M11 Experience, Level Up, Moves and Evolution ⬜

Part of the [battles plan](README.md). **Needs:** M6, M7. Shared rules and context: [context.md](context.md).

**Read:** FireRed's `src/battle_script_commands.c` (exp, level up), `evolution_scene.c` (behavior).

- [ ] The exp bar filling, `mus_level_up` / level-up fanfare, the level-up stats window (deltas, then totals), "<MON> grew to Lv. X!".
- [ ] Learning a level-up move (FireRed's "wants to learn" flow, forgetting a move with the summary's move page); decided by `mic-core`.
- [ ] Evolution after battle by level (FireRed's evolution scene, `mus_evolution`, B cancels), saved by `mic-core`.
- [ ] Pokédex: the foe's Pokémon are registered as seen when sent out (`mic-core` with the outcome or per event, saved before shown).
- **Done when:** the test team can level up, learn moves and evolve. Test with a lower-level variant of the test NPC if needed.

## Progress

Not started. While 🚧: tasks ticked above, then here the exact next step, files touched, build state, gotchas.
