// Our catalog numbers ⇄ Showdown's IDs and names, both ways.

import { toID } from "@pkmn/sim";
import { Gender, Status } from "@pokeuniverse/contracts/pokemon/v1/pokemon";
import { TypeSchema, type Type } from "@pokeuniverse/contracts/species/v1/catalog";
import { BattleStat, Weather } from "@pokeuniverse/contracts/battle/v1/event";
import { ABILITIES, ITEMS, MOVES, NATURES, SPECIES } from "./ids.ts";

function index(ids: readonly string[]): Map<string, number> {
  return new Map(ids.flatMap((id, n) => (id ? [[toID(id), n] as const] : [])));
}

const species = index(SPECIES);
const moves = index(MOVES);
const abilities = index(ABILITIES);
const items = new Map(Object.entries(ITEMS).map(([n, id]) => [id, Number(n)]));

/** Our number for a Showdown species, move, ability or item name or ID; 0 when we have none. */
export const speciesNumber = (name: string) => species.get(toID(name)) ?? 0;
export const moveNumber = (name: string) => moves.get(toID(name)) ?? 0;
export const abilityNumber = (name: string) => abilities.get(toID(name)) ?? 0;
export const itemNumber = (name: string) => items.get(toID(name)) ?? 0;

export const speciesId = (n: number) => SPECIES[n] ?? "";
export const moveId = (n: number) => MOVES[n] ?? "";
export const abilityId = (n: number) => ABILITIES[n] ?? "";
export const itemId = (n: number) => ITEMS[n] ?? "";
export const natureName = (n: number) => NATURES[n] ?? "";

const STATUSES: Record<string, Status> = {
  slp: Status.SLEEP,
  psn: Status.POISON,
  brn: Status.BURN,
  frz: Status.FREEZE,
  par: Status.PARALYSIS,
  tox: Status.TOXIC,
};
const STATUS_IDS = Object.fromEntries(Object.entries(STATUSES).map(([id, s]) => [s, id])) as Record<Status, string>;

/** Showdown's status ID (`fnt` and none: unspecified). */
export const statusNumber = (id: string): Status => STATUSES[id] ?? Status.UNSPECIFIED;
export const statusId = (s: Status): string => STATUS_IDS[s] ?? "";

export function genderId(g: Gender): "M" | "F" | "N" | "" {
  return g === Gender.MALE ? "M" : g === Gender.FEMALE ? "F" : g === Gender.GENDERLESS ? "N" : "";
}

const STATS: Record<string, BattleStat> = {
  atk: BattleStat.ATTACK,
  attack: BattleStat.ATTACK,
  def: BattleStat.DEFENSE,
  defense: BattleStat.DEFENSE,
  spa: BattleStat.SP_ATTACK,
  spatk: BattleStat.SP_ATTACK,
  specialattack: BattleStat.SP_ATTACK,
  spd: BattleStat.SP_DEFENSE,
  spdef: BattleStat.SP_DEFENSE,
  specialdefense: BattleStat.SP_DEFENSE,
  spe: BattleStat.SPEED,
  speed: BattleStat.SPEED,
  accuracy: BattleStat.ACCURACY,
  evasion: BattleStat.EVASION,
};
export const statNumber = (name: string): BattleStat => STATS[toID(name)] ?? BattleStat.UNSPECIFIED;

const WEATHERS: Record<string, Weather> = {
  raindance: Weather.RAIN,
  sunnyday: Weather.SUN,
  sandstorm: Weather.SANDSTORM,
  hail: Weather.HAIL,
};
/** The weather a Showdown weather name means; unspecified for anything else. */
export const weatherNumber = (name: string): Weather => WEATHERS[toID(name)] ?? Weather.UNSPECIFIED;

/** A type name ("Water") as our Type. */
export function typeNumber(name: string): Type {
  const value = TypeSchema.values.find((v) => v.name === `TYPE_${name.toUpperCase()}`);
  return (value?.number ?? 0) as Type;
}
