// The NPC AI (plans/battles D6): FireRed's order of decisions for a trainer, switch → item →
// move, plus a switch when every move is useless. Wild Pokémon pick a random move (FireRed's
// wild battles have no flags).

import type { Battle } from "@pkmn/sim";
import { AiFlag, type StartBattle } from "@pokeuniverse/contracts/battle/v1/battle";
import { BattleKind } from "@pokeuniverse/contracts/battle/v1/view";
import { cloneBattle, moveOptions } from "../engine/battle.ts";
import { checkBadMove } from "./flags/check-bad-move.ts";
import { itemToUse } from "./items.ts";
import { randomChoice } from "./random.ts";
import { bestMove, scoreMoves } from "./score.ts";
import { bestReplacement, shouldSwitch } from "./switch.ts";
import { AiView } from "./view.ts";

/** What the AI keeps between steps (saved with the battle): each side's items left, 0 once used. */
export type AiMemory = { items: number[][] };

export function newAiMemory(start: StartBattle): AiMemory {
  return { items: start.sides.map((team) => team.items.slice(0, 4)) };
}

/** Sides the AI plays: a trainer with flags, or the wild Pokémon. */
export function isAiSide(start: StartBattle, side: number): boolean {
  return start.sides[side].aiFlags.length > 0 || (start.kind === BattleKind.WILD && side === 1);
}

/** CHECK_BAD_MOVE this low for every usable move: nothing worth doing, so switch. */
const USELESS = -8;

export type AiDecision = { choice: string } | { item: number };

export function decide(battle: Battle, start: StartBattle, side: number, memory: AiMemory): AiDecision {
  const team = start.sides[side];
  const s = battle.sides[side];
  if (!team.aiFlags.length) return { choice: randomChoice(battle, side) };
  if (s.activeRequest?.forceSwitch) return { choice: switchTo(bestReplacement(cloneBattle(battle), side).position) };

  const options = moveOptions(s);
  const moves: { id: string; disabled?: unknown; pp?: number }[] = options?.moves ?? [];
  if (moves.length === 1 && moves[0].id === "struggle") return { choice: "move 1" };
  const trapped = !!(options?.trapped || options?.maybeTrapped);

  const v = new AiView(battle, side);
  if (!trapped) {
    const to = shouldSwitch(v);
    if (to) return { choice: switchTo(to === "best" ? bestReplacement(v.sim, side).position : to.position) };
  }
  const item = itemToUse(v, memory.items[side] ?? [], team.items.filter(Boolean).length);
  if (item) return { item };

  const usable = v.moves.map((c) => !!moves[c.slot] && !moves[c.slot].disabled && moves[c.slot].pp !== 0);
  if (!trapped && team.aiFlags.includes(AiFlag.CHECK_BAD_MOVE) && v.bench(v.user).length) {
    // CHECK_BAD_MOVE draws no random numbers: asking it again changes nothing.
    if (v.moves.every((c) => !usable[c.slot] || checkBadMove(v, c) <= USELESS)) return { choice: switchTo(bestReplacement(v.sim, side).position) };
  }
  return { choice: `move ${bestMove(v, scoreMoves(v, team.aiFlags, usable)) + 1}` };
}

const switchTo = (position: number) => `switch ${position + 1}`;
