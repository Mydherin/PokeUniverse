// AI_TryToFaint: take a KO when a move has one (priority moves first, to finish before the foe
// moves), and otherwise prefer the strongest move.

import type { AiView, Considered } from "../view.ts";

export function tryToFaint(v: AiView, c: Considered): number {
  // FireRed's if_can_faint skips moves of 0-1 power (fixed damage counts in Gen 4; OHKO moves don't).
  if (c.damage > 0 && c.effect !== "OHKO" && c.damage >= v.target.hp) {
    if (c.effect === "EXPLOSION") return 0;
    return c.move.priority > 0 ? 6 : 4;
  }
  return v.power(c) === "not-most" ? -1 : 0;
}
