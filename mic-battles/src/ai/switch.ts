// FireRed's switching (src/battle_ai_switch_items.c): ShouldSwitch's reasons, in its order, and
// GetMostSuitableMonToSwitchInto for who comes in. Gen 4: Motor Drive and Dry Skin absorb too.

import type { Battle, Move } from "@pkmn/sim";
import type { Pokemon } from "../engine/battle.ts";
import { estimate, typeMatchup, type AiView } from "./view.ts";

/** The move that last hit the user, and who used it (FireRed's gLastLandedMoves, gLastHitBy). */
function lastLanded(v: AiView): { move: Move; by: Pokemon } | undefined {
  const hit = v.user.attackedBy.at(-1);
  if (!hit || hit.source.side === v.user.side) return undefined;
  return { move: v.sim.dex.moves.get(hit.move), by: hit.source };
}

const superEffective = (v: AiView, move: Move, target: Pokemon, user: Pokemon) =>
  move.category !== "Status" && typeMatchup(v.sim, move, target, user) >= 2;

const movesOf = (v: AiView, p: Pokemon) => p.moveSlots.map((s) => v.sim.dex.moves.get(s.id));

function hasSuperEffective(v: AiView, noRng: boolean): boolean {
  for (const move of movesOf(v, v.user)) {
    if (superEffective(v, move, v.target, v.user) && (noRng || v.battle.random(10) !== 0)) return true;
  }
  return false;
}

/** A bench Pokémon that the last move hitting the user would hurt less ("immune" or
 *  "resisted") and that has a super-effective move back, each picked with 1 in `odds`. */
function findResister(v: AiView, kind: "immune" | "resisted", odds: number): Pokemon | undefined {
  const last = lastLanded(v);
  if (!last || last.move.category === "Status") return undefined;
  for (const p of v.bench(v.user)) {
    const taken = typeMatchup(v.sim, last.move, p, last.by);
    if (kind === "immune" ? taken !== 0 : !(taken > 0 && taken < 1)) continue;
    for (const move of movesOf(v, p)) {
      if (superEffective(v, move, last.by, p) && v.battle.random(odds) === 0) return p;
    }
  }
  return undefined;
}

const ABSORBERS: Record<string, string[]> = { Fire: ["flashfire"], Water: ["waterabsorb", "dryskin"], Electric: ["voltabsorb", "motordrive"] };

/** Who to switch to now, "best" for GetMostSuitableMonToSwitchInto, or undefined to stay in. */
export function shouldSwitch(v: AiView): Pokemon | "best" | undefined {
  const { user: u, target: t } = v;
  if (!v.bench(u).length) return undefined;

  // Perish Song's count reaches 0 at the end of this turn.
  if ((u.volatiles.perishsong as { duration?: number } | undefined)?.duration === 1) return "best";

  // Wonder Guard: nothing here hits it; someone on the bench does (2 in 3 for each).
  if (v.ability(t) === "wonderguard") {
    if (!movesOf(v, u).some((m) => superEffective(v, m, t, u))) {
      for (const p of v.bench(u)) {
        if (movesOf(v, p).some((m) => superEffective(v, m, t, p)) && v.battle.random(3) < 2) return p;
      }
    }
  }

  // The last hit's type would be absorbed by someone on the bench (1 in 2 for each).
  const last = lastLanded(v);
  const absorbers = last && last.move.category !== "Status" ? ABSORBERS[last.move.type] : undefined;
  if (!(hasSuperEffective(v, true) && v.battle.random(3) !== 0) && absorbers && !absorbers.includes(v.ability(u))) {
    for (const p of v.bench(u)) {
      if (absorbers.includes(p.ability) && v.battle.random(2)) return p;
    }
  }

  // Natural Cure: asleep with half its HP or more, switch to wake up healed.
  if (v.status(u, "slp") && v.ability(u) === "naturalcure" && u.hp >= u.maxhp / 2) {
    if (!last && v.battle.random(2)) return "best";
    if (last && last.move.category === "Status" && v.battle.random(2)) return "best";
    const p = findResister(v, "immune", 1) ?? findResister(v, "resisted", 1);
    if (p) return p;
    if (v.battle.random(2)) return "best";
  }

  if (hasSuperEffective(v, false) || statsRaised(u)) return undefined;
  return findResister(v, "immune", 2) ?? findResister(v, "resisted", 3);
}

/** Boosts worth keeping: more than 3 stages up in all. */
function statsRaised(p: Pokemon): boolean {
  return Object.values(p.boosts).reduce((sum, n) => sum + Math.max(0, n), 0) > 3;
}

/** GetMostSuitableMonToSwitchInto: the best typed Pokémon that also has a super-effective move,
 *  else the one with the most damaging move. FireRed keeps the type the foe's types hit hardest
 *  (a bug that sends in weak Pokémon); we keep the one they hit least (phase-5 D18). */
export function bestReplacement(sim: Battle, side: number, sent: ReadonlySet<number> = new Set()): Pokemon {
  const s = sim.sides[side];
  const foe = s.foe.active.find((p) => !p.fainted) ?? s.foe.active[0];
  const bench = s.pokemon.filter((p) => !p.fainted && !p.isActive && !sent.has(p.position));
  const foeTypes = foe.getTypes();
  const taken = (p: Pokemon) =>
    foeTypes.reduce((x, type) => x * (sim.dex.getImmunity(type, p.getTypes()) ? 2 ** sim.dex.getEffectiveness(type, p.getTypes()) : 0), 1);

  const byType = [...bench].sort((a, b) => taken(a) - taken(b));
  for (const p of byType) {
    if (p.moveSlots.some((m) => superEffectiveStatic(sim, sim.dex.moves.get(m.id), foe, p))) return p;
  }
  let best = bench[0];
  let bestDamage = 0;
  for (const p of bench) {
    for (const m of p.moveSlots) {
      const damage = estimate(sim, p, foe, sim.dex.moves.get(m.id));
      if (damage > bestDamage) [best, bestDamage] = [p, damage];
    }
  }
  return best;
}

function superEffectiveStatic(sim: Battle, move: Move, target: Pokemon, user: Pokemon): boolean {
  return move.category !== "Status" && typeMatchup(sim, move, target, user) >= 2;
}
