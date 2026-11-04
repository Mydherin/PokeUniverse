// What FireRed's AI script commands read (src/battle_ai_script_commands.c), from Showdown's live
// battle objects. Everything is read on a throwaway copy (`sim`); random draws come from the real
// battle's PRNG, so a replayed step makes the same choice (phase-5 D6).

import type { ActiveMove, Battle, Move } from "@pkmn/sim";
import { cloneBattle, type Pokemon } from "../engine/battle.ts";
import { effectOf, type Effect, type StatId } from "./effects.ts";

/** One of the user's four move slots, as the flags consider it. */
export type Considered = {
  slot: number;
  move: Move;
  effect: Effect;
  /** Damage estimate with FireRed's simulated roll (85-100 %), 0 when it deals none. */
  damage: number;
};

/** FireRed's AI_EFFECTIVENESS_* values (pure type matchup, no STAB). */
export type Effectiveness = 0 | 0.25 | 0.5 | 1 | 2 | 4;

/** Moves FireRed's get_how_powerful_move_is never calls the strongest. */
const DISCOURAGED_POWER = new Set<Effect>(["EXPLOSION", "DREAM_EATER", "CHARGE", "RECHARGE", "SPIT_UP", "FOCUS_PUNCH", "SUPERPOWER", "ERUPTION", "OVERHEAT"]);

/** Damage that depends on what the user takes this turn: not estimated. */
const NO_ESTIMATE = new Set<Effect>(["COUNTER", "MIRROR_COAT", "BIDE"]);

export class AiView {
  readonly sim: Battle;
  readonly user: Pokemon;
  readonly target: Pokemon;
  readonly moves: Considered[];

  /** The user at `position` against the foe at `target` (FireRed's doubles try each foe in turn). */
  constructor(readonly battle: Battle, side: number, position = 0, target = 0) {
    this.sim = cloneBattle(battle);
    this.user = this.sim.sides[side].active[position];
    this.target = this.sim.sides[side].foe.active[target];
    this.moves = this.user.moveSlots.map((s, slot) => {
      const move = this.sim.dex.moves.get(s.id);
      // FireRed draws one roll per move per decision (simulatedRNG).
      const roll = 100 - battle.random(16);
      return { slot, move, effect: effectOf(move), damage: Math.floor((this.estimate(this.user, this.target, move) * roll) / 100) };
    });
  }

  /** if_random_less_than n: FireRed's Random() % 256 < n. */
  chance(n: number): boolean {
    return this.battle.random(256) < n;
  }

  /** HP percent as FireRed compares it (100 × hp ÷ max, rounded down). */
  hp(p: Pokemon): number {
    return Math.floor((100 * p.hp) / p.maxhp);
  }

  /** FireRed's stat stage: 0 to 12, 6 neutral. */
  stage(p: Pokemon, stat: StatId): number {
    return p.boosts[stat] + 6;
  }

  /** if_target_faster: the target moves first by speed (Trick Room counted), ties not. */
  targetFaster(): boolean {
    return this.target.getActionSpeed() > this.user.getActionSpeed();
  }

  /** FireRed's turn counter: 0 on the first turn. */
  turn(): number {
    return this.sim.turn - 1;
  }

  /** is_first_turn_for: it came in this turn. */
  firstTurn(p: Pokemon): boolean {
    return p.activeTurns === 0;
  }

  /** get_protect_count: Protect/Detect/Endure used in a row. */
  protectCount(p: Pokemon): number {
    const counter = (p.volatiles.stall as { counter?: number } | undefined)?.counter;
    return counter ? Math.round(Math.log(counter) / Math.log(3)) : 0;
  }

  /** count_alive_pokemon: the side's Pokémon that could come in. */
  bench(p: Pokemon): Pokemon[] {
    return p.side.pokemon.filter((q) => !q.fainted && !q.isActive);
  }

  status(p: Pokemon, ...ids: string[]): boolean {
    return ids.length ? ids.includes(p.status) : !!p.status;
  }

  volatile(p: Pokemon, id: string): boolean {
    return !!p.volatiles[id];
  }

  sideHas(p: Pokemon, id: string): boolean {
    return !!p.side.sideConditions[id];
  }

  /** The weather that acts (Cloud Nine and Air Lock clear it). */
  weather(): string {
    return this.sim.field.effectiveWeather();
  }

  /** get_ability: the real ability, as FireRed's AI reads it. */
  ability(p: Pokemon): string {
    return p.ignoringAbility() ? "" : p.ability;
  }

  /** if_has_move_with_effect: among the moves the Pokémon has shown (the target) or knows (the user). */
  hasEffect(p: Pokemon, ...effects: Effect[]): boolean {
    const own = p === this.user;
    return p.moveSlots.some((s) => (own || s.used) && effects.includes(effectOf(this.sim.dex.moves.get(s.id))));
  }

  /** get_last_used_move. */
  lastMove(p: Pokemon): Move | undefined {
    return p.lastMove ? this.sim.dex.moves.get(p.lastMove.id) : undefined;
  }

  /** if_type_effectiveness: the move's type against the target (immunities count, abilities too). */
  effectiveness(move: Move, target = this.target, user = this.user): Effectiveness {
    return typeMatchup(this.sim, move, target, user);
  }

  /** get_how_powerful_move_is. */
  power(c: Considered): "discouraged" | "most" | "not-most" {
    if (!poweredMove(c)) return "discouraged";
    const best = Math.max(...this.moves.filter(poweredMove).map((m) => Math.max(m.damage, 1)));
    return Math.max(c.damage, 1) >= best ? "most" : "not-most";
  }

  estimate(user: Pokemon, target: Pokemon, move: Move): number {
    return estimate(this.sim, user, target, move);
  }
}

const poweredMove = (c: Considered) => (c.move.basePower > 1 || !!c.move.basePowerCallback) && c.move.category !== "Status" && !DISCOURAGED_POWER.has(c.effect);

/** Abilities that take a move of their type: the move does nothing. */
const ABSORBS: Record<string, string[]> = {
  Fire: ["flashfire"],
  Water: ["waterabsorb", "dryskin"],
  Electric: ["voltabsorb", "motordrive"],
};

export function absorbs(move: Move, target: Pokemon): boolean {
  return !target.ignoringAbility() && (ABSORBS[move.type] ?? []).includes(target.ability) && move.target !== "self";
}

/** The move's type against `target`: 0 for an immunity (type, Levitate, an absorbing ability,
 *  Wonder Guard against what isn't super effective, Soundproof). */
export function typeMatchup(sim: Battle, move: Move, target: Pokemon, user: Pokemon): Effectiveness {
  const active = toActive(sim, move);
  if (!target.runImmunity(active, false)) return 0;
  if (absorbs(move, target)) return 0;
  if (move.flags.sound && target.ability === "soundproof" && !target.ignoringAbility()) return 0;
  if (move.category === "Status") return 1;
  const mod = Math.max(-2, Math.min(2, target.runEffectiveness(active)));
  if (target.ability === "wonderguard" && !target.ignoringAbility() && mod <= 0 && !user.hasAbility("moldbreaker")) return 0;
  return (2 ** mod) as Effectiveness;
}

function toActive(sim: Battle, move: Move): ActiveMove {
  return sim.dex.getActiveMove(move.id);
}

/** Damage from one use with Showdown's own formula, on the copy: no critical hit, the random roll
 *  at its highest (the caller applies FireRed's roll). The user may be on the bench. */
export function estimate(sim: Battle, user: Pokemon, target: Pokemon, move: Move): number {
  if (move.category === "Status" || NO_ESTIMATE.has(effectOf(move))) return 0;
  if (typeMatchup(sim, move, target, user) === 0) return 0;
  const active = toActive(sim, move);
  active.willCrit = false;
  const randomizer = sim.randomizer;
  sim.randomizer = (d: number) => d;
  const saved = { move: sim.activeMove, pokemon: sim.activePokemon, target: sim.activeTarget };
  sim.activeMove = active;
  sim.activePokemon = user;
  sim.activeTarget = target;
  try {
    const dmg = sim.actions.getDamage(user, target, active, true);
    const hits = Array.isArray(move.multihit) ? 3 : (move.multihit ?? 1);
    return typeof dmg === "number" ? dmg * hits : 0;
  } catch {
    return 0;
  } finally {
    sim.randomizer = randomizer;
    sim.activeMove = saved.move;
    sim.activePokemon = saved.pokemon;
    sim.activeTarget = saved.target;
  }
}
