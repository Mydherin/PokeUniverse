// Moves, the same for every art style: each move's rules from the catalog in lib-contracts.

import { create, getOption } from "@bufbuild/protobuf";
import { info, Move, MoveInfoSchema, MoveSchema, type MoveInfo } from "@pokeuniverse/contracts/move/v1/catalog";
import type { Item } from "@pokeuniverse/contracts/item/v1/catalog";
import type { Pokemon } from "@pokeuniverse/contracts/party/v1/party";
import { Gender } from "@pokeuniverse/contracts/pokemon/v1/pokemon";
import { EvolutionMethod } from "@pokeuniverse/contracts/species/v1/catalog";
import { itemInfo } from "./items";
import { speciesInfo } from "./pokedex";

const INFOS = new Map<Move, MoveInfo>(MoveSchema.values.filter((v) => v.number !== Move.UNSPECIFIED).map((v) => [v.number as Move, getOption(v, info)]));
const NONE = create(MoveInfoSchema);

/** The move's rules; an empty MoveInfo (no type) for a number that isn't a move. */
export function moveInfo(move: Move): MoveInfo {
  return INFOS.get(move) ?? NONE;
}

/** The move a TM or HM teaches; UNSPECIFIED for other items. */
export function tmMove(item: Item): Move {
  return itemInfo(item)?.move ?? Move.UNSPECIFIED;
}

/** CanMonLearnTMTutor's answer for a TM or HM's move. */
export const enum MachineAnswer {
  Able,
  NotAble,
  Known,
}

/** mic-core decides; this picks the slot's word and the message. */
export function machineAnswer(mon: Pokemon, move: Move): MachineAnswer {
  if (!speciesInfo(mon.species).machineMoves.includes(move)) return MachineAnswer.NotAble;
  return mon.moves.some((m) => m.move === move) ? MachineAnswer.Known : MachineAnswer.Able;
}

/** EVO_MODE_ITEM_CHECK: whether the item evolves this Pokémon. mic-core decides; this picks the slot's word. */
export function itemEvolves(mon: Pokemon, item: Item): boolean {
  return speciesInfo(mon.species).evolutions.some((e) => e.method === EvolutionMethod.ITEM && e.item === item && (e.gender === Gender.UNSPECIFIED || e.gender === mon.gender));
}

/** sHMMoves: moves that can't be forgotten (mic-core refuses them too). */
const HM_MOVES = new Set<number>([Move.CUT, Move.FLY, Move.SURF, Move.STRENGTH, Move.FLASH, Move.ROCK_SMASH, Move.WATERFALL, Move.DIVE]);

export function isHM(move: number): boolean {
  return HM_MOVES.has(move);
}
