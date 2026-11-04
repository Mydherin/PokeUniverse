# M5 NPC Battle AI ✅

Part of [Phase 5](../phase-5-battle-system.md). Shared rules and context: [context.md](context.md). Done 2026-11-01; this file keeps what later milestones use.

## What Exists

| Piece | Where | Notes |
|---|---|---|
| Entry | `mic-battles/src/ai/index.ts`: `decide`, `isAiSide`, `AiMemory` | Trainer: switch → item → move; a switch when CHECK_BAD_MOVE finds every move useless (≤ −8). Forced switch: `bestReplacement`. Wild side 1 without flags: `random.ts` |
| View | `ai/view.ts` (`AiView`) | Reads a copy of the battle (`cloneBattle` in `engine/battle.ts`); damage from Showdown's `getDamage` (crits off, top roll) × FireRed's 85-100 % roll, one per move per decision; `chance(n)` = Random % 256 < n from the real battle's PRNG |
| Effects | `ai/effects.ts` | FireRed's `EFFECT_*` names for every move, from Showdown's data plus an ID table (D17) |
| Scoring | `ai/score.ts`, `ai/flags/*.ts` | Start 100 (−1 for moves the request forbids), flags in FireRed's table order, floor 0, ties by `battle.sample` |
| Switching | `ai/switch.ts` | FireRed's ShouldSwitch reasons in order (Perish Song, Wonder Guard, absorbers incl. Motor Drive/Dry Skin, Natural Cure, immune/resisting bench mon with a super-effective move: 1 in 2 / 1 in 3); replacement by best defensive typing + a super-effective move, else most damage (D18) |
| Trainer items | `ai/items.ts`; effects in `engine/bag.ts` | `BattleTeam.items` (≤ 4); left in `meta.ai`. FireRed's rules: Full Restore < ¼ HP, potions < ¼ or missing more than they heal, status heals, X items / Dire Hit / Guard Spec. on the mon's first turn; items after the first only near the last Pokémon |
| Contracts | `battle.proto`: `BattleTeam.items = 3`; `event.proto`: `ItemUsed item_used = 32` (`foe`, `item`, `target`) | Log line `|bagitem|p2|<item number>|<target>` → `ItemUsed`; the effect follows as `Heal`/`StatusCured`/`StatChange`… with `from` = the item (our number) |

## Checked

A one-off in-process script (deleted), 40 seeds each: Electric moves never into a Ground type or Volt Absorb; Bullet Punch takes the KO every time; Swords Dance on turn 1 35/40; switch to a resisting Steelix after a super-effective hit 13/40 (FireRed's 1 in 3); Hyper Potion at low HP 10/10 with `ItemUsed` + `Heal`; only-useless moves → switch 40/40; wild random; 12 full 6v6 battles end; the same battle twice gives the same events. Builds: mic-battles tsc + bundle, mic-core, `make breaking`.

## Left for Later

- **M6:** the trainer table fills `ai_flags` (gym-leader set: CHECK_BAD_MOVE, TRY_TO_FAINT, CHECK_VIABILITY, SETUP_FIRST_TURN, HP_AWARE) and `items`.
- **M7:** `ItemUsed` → "<TRAINER> used <ITEM>!" (foe) before its effect events.
- **M12:** the rest of the bag items in `engine/bag.ts` (`EFFECTS`); potions, status heals, X items, Dire Hit and Guard Spec. already work there.
- **M13 (doubles):** the AI targets the foe's first active Pokémon only.
