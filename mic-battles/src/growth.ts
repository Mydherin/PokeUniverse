// The experience each level starts at, per growth rate: the same tables as mic-core's
// internal/pokemon/growth.go, which checks the level the outcome reaches.

import { GrowthRate } from "@pokeuniverse/contracts/species/v1/catalog";

export const MAX_LEVEL = 100;

const FORMULAS: Partial<Record<GrowthRate, (n: number) => number>> = {
  [GrowthRate.MEDIUM_FAST]: (n) => n ** 3,
  [GrowthRate.ERRATIC]: (n) => {
    if (n <= 50) return Math.trunc(((100 - n) * n ** 3) / 50);
    if (n <= 68) return Math.trunc(((150 - n) * n ** 3) / 100);
    if (n <= 98) return Math.trunc((Math.trunc((1911 - 10 * n) / 3) * n ** 3) / 500);
    return Math.trunc(((160 - n) * n ** 3) / 100);
  },
  [GrowthRate.FLUCTUATING]: (n) => {
    if (n <= 15) return Math.trunc(((Math.trunc((n + 1) / 3) + 24) * n ** 3) / 50);
    if (n <= 36) return Math.trunc(((n + 14) * n ** 3) / 50);
    return Math.trunc(((Math.trunc(n / 2) + 32) * n ** 3) / 50);
  },
  [GrowthRate.MEDIUM_SLOW]: (n) => Math.trunc((6 * n ** 3) / 5) - 15 * n ** 2 + 100 * n - 140,
  [GrowthRate.FAST]: (n) => Math.trunc((4 * n ** 3) / 5),
  [GrowthRate.SLOW]: (n) => Math.trunc((5 * n ** 3) / 4),
};

/** The experience a level starts at (0 at level 1, as in Gen 4). */
export function expAt(rate: GrowthRate, level: number): number {
  const n = Math.min(Math.max(level, 1), MAX_LEVEL);
  return n === 1 ? 0 : (FORMULAS[rate]?.(n) ?? 0);
}
