// Showdown battles from our StartBattle, and their state for Redis (plans/battles D1, D2).
// Each Pokémon's Showdown name is its party slot ("0" to "5"): the log's idents then say exactly
// which party member they mean, and nicknames stay ours.

import { Battle, State, type PokemonSet } from "@pkmn/sim";
import type { BattleMon, StartBattle } from "@pokeuniverse/contracts/battle/v1/battle";
import { Status } from "@pokeuniverse/contracts/pokemon/v1/pokemon";
import type { Stats } from "@pokeuniverse/contracts/pokemon/v1/stats";
import { FORMAT } from "../rules.ts";
import { registerBagItems } from "./bag.ts";
import { abilityId, genderId, itemId, moveId, natureName, speciesId, statusId } from "./lookup.ts";

export type Pokemon = Battle["sides"][number]["pokemon"][number];
export type Side = Battle["sides"][number];

/** Showdown's side ID for our side number (0 → p1). */
export const sideId = (side: number) => `p${side + 1}` as "p1" | "p2";

/** Creates the battle and plays its start (send-outs) into battle.log. */
export function createBattle(start: StartBattle): Battle {
  const battle = new Battle({ formatid: FORMAT as never, seed: `gen5,${start.seed.toString(16).padStart(16, "0")}` });
  registerBagItems(battle);
  // Hold the start until both teams carry their HP, PP and status.
  start.sides.forEach((team, side) => {
    battle.started = side > 0;
    battle.setPlayer(sideId(side), { name: `side${side}`, team: leadFirst(team.pokemon.map(toSet), team.pokemon) });
  });
  battle.started = false;
  start.sides.forEach((team, side) => team.pokemon.forEach((mon, slot) => carryOver(battle, pokemonAt(battle, side, slot), mon)));
  battle.start();
  // Showdown's start counts every Pokémon as able to battle: recount without the fainted ones.
  for (const side of battle.sides) side.pokemonLeft = side.pokemon.filter((p) => !p.fainted).length;
  return battle;
}

export function restoreBattle(state: string): Battle {
  const battle = State.deserializeBattle(state);
  registerBagItems(battle);
  return battle;
}

/** The state to save. The log is cleared first: it was already translated, and it would only grow.
 *  Runtime listeners (registerBagItems) can't be serialized; restoreBattle adds them back. */
export function serializeBattle(battle: Battle): string {
  battle.log.length = 0;
  battle.inputLog.length = 0;
  battle.sentLogPos = 0;
  battle.lastMoveLine = -1;
  const events = battle.events;
  battle.events = null;
  try {
    return JSON.stringify(State.serializeBattle(battle));
  } finally {
    battle.events = events;
  }
}

/** A throwaway copy for the AI to read and try damage on: the real battle stays untouched. */
export function cloneBattle(battle: Battle): Battle {
  const b = battle as unknown as { events: Battle["events"]; log: string[]; inputLog: string[] };
  const { events, log, inputLog } = b;
  b.events = null;
  b.log = [];
  b.inputLog = [];
  try {
    return State.deserializeBattle(State.serializeBattle(battle));
  } finally {
    b.events = events;
    b.log = log;
    b.inputLog = inputLog;
  }
}

/** The Pokémon in this party slot (as the battle started). */
export function pokemonAt(battle: Battle, side: number, slot: number): Pokemon {
  const pokemon = battle.sides[side].pokemon.find((p) => p.name === String(slot));
  if (!pokemon) throw new Error(`no pokemon in side ${side} slot ${slot}`);
  return pokemon;
}

export const partySlot = (pokemon: Pokemon) => Number(pokemon.name);

function toSet(mon: BattleMon, slot: number): PokemonSet {
  return {
    name: String(slot),
    species: speciesId(mon.species),
    item: itemId(mon.heldItem),
    ability: abilityId(mon.ability),
    moves: mon.moves.map((m) => moveId(m.move)),
    nature: natureName(mon.nature),
    gender: genderId(mon.gender),
    evs: stats(mon.evs),
    ivs: stats(mon.ivs),
    level: mon.level,
    shiny: mon.shiny,
    happiness: mon.friendship,
  };
}

function stats(s: Stats | undefined) {
  return { hp: s?.hp ?? 0, atk: s?.attack ?? 0, def: s?.defense ?? 0, spa: s?.spAttack ?? 0, spd: s?.spDefense ?? 0, spe: s?.speed ?? 0 };
}

/** FireRed sends out the first Pokémon that can battle. */
function leadFirst(sets: PokemonSet[], team: BattleMon[]): PokemonSet[] {
  const lead = team.findIndex((mon) => mon.hp > 0);
  return lead <= 0 ? sets : [sets[lead], ...sets.filter((_, i) => i !== lead)];
}

/** HP, PP and status carry over between battles (D14). */
function carryOver(battle: Battle, pokemon: Pokemon, mon: BattleMon): void {
  pokemon.baseMoveSlots.forEach((slot, i) => {
    const move = mon.moves[i];
    if (!move) return;
    slot.pp = Math.min(move.pp, move.maxPp);
    slot.maxpp = move.maxPp;
  });
  if (mon.hp === 0) {
    pokemon.hp = 0;
    pokemon.fainted = true;
    pokemon.status = "fnt" as never;
    return;
  }
  pokemon.hp = Math.min(mon.hp, pokemon.maxhp);
  const status = statusId(mon.status);
  if (!status) return;
  pokemon.status = status as never;
  pokemon.statusState = battle.initEffectState({ id: status, target: pokemon });
  // Gen 4 sleep: 1-4 turns, counted as Showdown's slp condition does.
  if (mon.status === Status.SLEEP) pokemon.statusState.time = battle.random(2, 6);
  if (mon.status === Status.TOXIC) pokemon.statusState.stage = 0;
}

/** The first active Pokémon's options (moves, trapped) in a side's move request. */
export function moveOptions(side: Side) {
  const req = side.activeRequest;
  return req && "active" in req ? req.active[0] : undefined;
}
