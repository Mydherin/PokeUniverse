// Moves, the same for every art style: each move's rules from the catalog in lib-contracts.

import { create, getOption } from "@bufbuild/protobuf";
import { info, Move, MoveInfoSchema, MoveSchema, type MoveInfo } from "@pokeuniverse/contracts/move/v1/catalog";
import type { Item } from "@pokeuniverse/contracts/item/v1/catalog";
import { itemInfo } from "./items";

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

/** sHMMoves: moves that can't be forgotten (mic-core refuses them too). */
const HM_MOVES = new Set<number>([Move.CUT, Move.FLY, Move.SURF, Move.STRENGTH, Move.FLASH, Move.ROCK_SMASH, Move.WATERFALL, Move.DIVE]);

export function isHM(move: number): boolean {
  return HM_MOVES.has(move);
}
