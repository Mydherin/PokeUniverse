// FireRed's BattleAI_ChooseMoveOrAction: every usable move starts at 100, each of the trainer's
// flags adjusts it in FireRed's order (gBattleAI_ScriptsTable), never below 0, and the best score
// wins; ties are broken with the battle's PRNG.

import { AiFlag } from "@pokeuniverse/contracts/battle/v1/battle";
import { checkBadMove } from "./flags/check-bad-move.ts";
import { checkViability } from "./flags/check-viability.ts";
import { hpAware } from "./flags/hp-aware.ts";
import { preferBatonPass } from "./flags/prefer-baton-pass.ts";
import { preferStrongestMove } from "./flags/prefer-strongest-move.ts";
import { risky } from "./flags/risky.ts";
import { setupFirstTurn } from "./flags/setup-first-turn.ts";
import { tryToFaint } from "./flags/try-to-faint.ts";
import type { AiView, Considered } from "./view.ts";

type Flag = (v: AiView, c: Considered) => number;

/** In FireRed's order: its table puts CHECK_VIABILITY before TRY_TO_FAINT. */
const FLAGS: [AiFlag, Flag][] = [
  [AiFlag.CHECK_BAD_MOVE, checkBadMove],
  [AiFlag.CHECK_VIABILITY, checkViability],
  [AiFlag.TRY_TO_FAINT, tryToFaint],
  [AiFlag.SETUP_FIRST_TURN, setupFirstTurn],
  [AiFlag.RISKY, risky],
  [AiFlag.PREFER_STRONGEST_MOVE, preferStrongestMove],
  [AiFlag.PREFER_BATON_PASS, preferBatonPass],
  [AiFlag.HP_AWARE, hpAware],
];

export const START_SCORE = 100;

/** Each move slot's score; -1 for the ones the request doesn't allow (never picked). */
export function scoreMoves(v: AiView, flags: readonly AiFlag[], usable: readonly boolean[]): number[] {
  const scores: number[] = v.moves.map((c) => (usable[c.slot] ? START_SCORE : -1));
  for (const [flag, run] of FLAGS) {
    if (!flags.includes(flag)) continue;
    for (const c of v.moves) {
      if (usable[c.slot]) scores[c.slot] = Math.max(0, scores[c.slot] + run(v, c));
    }
  }
  return scores;
}

/** The best-scored slot, ties broken at random. */
export function bestMove(v: AiView, scores: readonly number[]): number {
  const best = Math.max(...scores);
  const slots = scores.flatMap((s, i) => (s === best ? [i] : []));
  return slots.length === 1 ? slots[0] : v.battle.sample(slots);
}
