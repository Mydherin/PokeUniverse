// AI_Risky: likes gambles (sleep, OHKO, Explosion, crits, Counter…).

import type { Effect } from "../effects.ts";
import type { AiView, Considered } from "../view.ts";

const RISKY = new Set<Effect>([
  "SLEEP", "EXPLOSION", "MIRROR_MOVE", "OHKO", "HIGH_CRITICAL", "CONFUSE", "METRONOME", "PSYWAVE", "COUNTER",
  "DESTINY_BOND", "SWAGGER", "ATTRACT", "PRESENT", "ALL_STATS_UP_HIT", "BELLY_DRUM", "MIRROR_COAT", "FOCUS_PUNCH", "REVENGE",
]);

export function risky(v: AiView, c: Considered): number {
  return RISKY.has(c.effect) && !v.chance(128) ? 2 : 0;
}
