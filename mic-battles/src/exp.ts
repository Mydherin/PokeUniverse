// Gen 4 experience and EVs (Showdown has neither). Like FireRed's gSentPokesToOpponent, each
// Pokémon on the field records which foes faced it; when it faints, those still standing share
// its experience and each gets its full EV yield. mic-core applies levels and the EV caps.

import { create, getOption } from "@bufbuild/protobuf";
import type { Battle } from "@pkmn/sim";
import { BattleEventSchema, type BattleEvent } from "@pokeuniverse/contracts/battle/v1/event";
import type { StartBattle } from "@pokeuniverse/contracts/battle/v1/battle";
import { BattleKind } from "@pokeuniverse/contracts/battle/v1/view";
import { SpeciesSchema, info, type SpeciesInfo } from "@pokeuniverse/contracts/species/v1/catalog";
import { pokemonAt } from "./engine/battle.ts";
import type { Line } from "./protocol/line.ts";
import { parseIdent } from "./protocol/line.ts";

const INFOS: SpeciesInfo[] = [];
for (const v of SpeciesSchema.values) if (v.number) INFOS[v.number] = getOption(v, info);

/** Six EVs in Stats order: HP, Attack, Defense, Speed, Sp. Atk, Sp. Def. */
export type Evs = [number, number, number, number, number, number];

/** Saved with the battle (its meta). */
export type ExpState = {
  /** Party slots by side and position. */
  active: (number | null)[][];
  /** "side:slot" of a Pokémon → the other side's party slots that faced it. */
  faced: Record<string, number[]>;
  /** By side and party slot. */
  gains: { exp: number; evs: Evs }[][];
};

export function newExpState(start: StartBattle): ExpState {
  return {
    active: start.sides.map(() => []),
    faced: {},
    gains: start.sides.map((team) => team.pokemon.map(() => ({ exp: 0, evs: [0, 0, 0, 0, 0, 0] }))),
  };
}

/** Wild and trainer battles give the player's side experience; PvP gives none. */
function gainsExp(start: StartBattle, side: number): boolean {
  return side === 0 && (start.kind === BattleKind.TRAINER || start.kind === BattleKind.WILD);
}

const key = (side: number, slot: number) => `${side}:${slot}`;

/** Follows the switch-ins and faints; returns the Exp events each side must see after this line. */
export function observe(line: Line, state: ExpState, battle: Battle, start: StartBattle): BattleEvent[][] {
  const out: BattleEvent[][] = start.sides.map(() => []);
  const id = parseIdent(line.args[0]);
  if (!id) return out;
  const other = 1 - id.side;

  if (line.cmd === "switch" || line.cmd === "drag") {
    state.active[id.side][id.position] = id.slot;
    const facing = state.active[other].filter((s): s is number => s !== null);
    state.faced[key(id.side, id.slot)] = [...facing];
    for (const foe of facing) {
      const list = (state.faced[key(other, foe)] ??= []);
      if (!list.includes(id.slot)) list.push(id.slot);
    }
  }

  if (line.cmd === "faint") {
    state.active[id.side][id.position] = null;
    // A fainted Pokémon gains nothing from the foes it faced.
    for (const [k, list] of Object.entries(state.faced)) {
      if (k.startsWith(`${other}:`)) state.faced[k] = list.filter((s) => s !== id.slot);
    }
    if (gainsExp(start, other)) {
      const participants = state.faced[key(id.side, id.slot)] ?? [];
      for (const slot of participants) {
        const amount = award(state, battle, start, other, slot, id.side, id.slot, participants.length);
        const battler = { partySlot: slot, position: Math.max(0, state.active[other].indexOf(slot)) };
        out[other].push(create(BattleEventSchema, { kind: { case: "exp", value: { battler, amount } } }));
      }
    }
  }
  return out;
}

/** Gen 4: ⌊⌊base exp × level ÷ 7⌋ ÷ participants⌋, × 1.5 traded, × 1.5 trainer, × 1.5 Lucky Egg. */
function award(state: ExpState, battle: Battle, start: StartBattle, side: number, slot: number, foeSide: number, foeSlot: number, participants: number): number {
  const foe = start.sides[foeSide].pokemon[foeSlot];
  const mon = start.sides[side].pokemon[slot];
  const item = pokemonAt(battle, side, slot).item;
  const species = INFOS[foe.species];
  let exp = Math.floor(Math.floor((species.baseExp * foe.level) / 7) / participants);
  if (mon.traded) exp = Math.floor(exp * 1.5);
  if (start.kind === BattleKind.TRAINER) exp = Math.floor(exp * 1.5);
  if (item === "luckyegg") exp = Math.floor(exp * 1.5);
  exp = Math.max(exp, 1);

  const gain = state.gains[side][slot];
  gain.exp += exp;
  const y = species.evYield;
  const factor = item === "machobrace" ? 2 : 1;
  [y?.hp, y?.attack, y?.defense, y?.speed, y?.spAttack, y?.spDefense].forEach((v, i) => (gain.evs[i] += (v ?? 0) * factor));
  return exp;
}
