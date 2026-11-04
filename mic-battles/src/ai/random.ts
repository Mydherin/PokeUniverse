// Temporary AI until M5: a random usable move, or a random Pokémon when it must switch. It draws
// from the battle's own PRNG, so a replayed step makes the same choice (phase-5 D6).

import type { Battle } from "@pkmn/sim";
import { moveOptions } from "../engine/battle.ts";

/** A Showdown choice for this side's current request. */
export function randomChoice(battle: Battle, side: number): string {
  const s = battle.sides[side];
  if (s.activeRequest?.forceSwitch) {
    const bench = s.pokemon.filter((p) => !p.fainted && !p.isActive);
    return `switch ${battle.sample(bench).position + 1}`;
  }
  const moves: { disabled?: unknown; pp?: number }[] = moveOptions(s)?.moves ?? [];
  const usable = moves.flatMap((m, i) => (m.disabled || m.pp === 0 ? [] : [i]));
  return `move ${usable.length ? battle.sample(usable) + 1 : 1}`;
}
