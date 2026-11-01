# M5 NPC Battle AI ⬜

Part of the [battles plan](README.md). **Needs:** M4. Shared rules and context: [context.md](context.md).

**Read:** `references/pokefirered/data/battle_ai_scripts.s` (per flag), `src/battle_ai_script_commands.c` (scoring rules), `src/battle_ai_switch_items.c` (switch and items), `references/pokeemerald-expansion/src/battle_ai_main.c`, `battle_ai_util.c`, `battle_ai_switch.c` (Gen 4 knowledge). Behavior only, never code.

- [ ] `ai/score.ts`: every usable move starts at 100. Each flag in order adjusts it, and the best score wins; ties are picked at random with the battle's PRNG.
- [ ] Flags: `check-bad-move.ts` (immunities including Gen 4 abilities: Levitate, Flash Fire, Water/Volt Absorb, Motor Drive, Dry Skin, Wonder Guard, Soundproof; useless status and stat moves; already-set hazards and screens), `try-to-faint.ts` (KO with Showdown's damage calc, priority to finish), `check-viability.ts` (effect-by-effect, Gen 4 effects: Stealth Rock, Toxic Spikes, Trick Room, Tailwind, U-turn, Roost, …), `setup-first-turn.ts`, `risky.ts`, `prefer-strongest-move.ts`, `prefer-baton-pass.ts`, `hp-aware.ts`.
- [ ] `ai/switch.ts`: FireRed's ShouldSwitch reasons (Perish Song, Wonder Guard, an absorbing ability on the bench, Natural Cure, super-effective threat, nothing useful left), plus FireRed's choice of the replacement after a faint.
- [ ] `ai/items.ts`: trainer items (up to 4, FireRed rules: Full Restore / potions at low HP, status heals, X items, Guard Spec.), shown as "<TRAINER> used <ITEM>!".
- [ ] Wild Pokémon: random usable move (FireRed's wild battles have no flags); Phase 9 uses it.
- [ ] AI flags per trainer come from `mic-core`'s trainer table (D3).
- **Done when:** the test trainer avoids immune targets, takes KOs, sets up sensibly and switches out of bad matchups.

## Progress

Not started. While 🚧: tasks ticked above, then here the exact next step, files touched, build state, gotchas.
