// The NPC AI (phase-5 D6): FireRed's order of decisions for a trainer, switch → item →
// move, plus a switch when every move is useless. Wild Pokémon pick a random move (FireRed's
// wild battles have no flags).

import type { Battle } from "@pkmn/sim";
import { AiFlag, type StartBattle } from "@pokeuniverse/contracts/battle/v1/battle";
import { BattleKind } from "@pokeuniverse/contracts/battle/v1/view";
import { cloneBattle, moveOptions, type Pokemon } from "../engine/battle.ts";
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

/** One position's choice. `taken`: the bench positions another position of this side already sends. */
export function decide(battle: Battle, start: StartBattle, side: number, position: number, memory: AiMemory, taken: Set<number>): AiDecision {
  const team = start.sides[side];
  const s = battle.sides[side];
  const send = (to: Pokemon) => (taken.add(to.position), { choice: `switch ${to.position + 1}` });
  if (!team.aiFlags.length) return { choice: randomChoice(battle, side) };
  if (s.activeRequest?.forceSwitch) return send(bestReplacement(cloneBattle(battle), side, taken));

  const options = moveOptions(s, position);
  const moves: { id: string; disabled?: unknown; pp?: number; target?: string }[] = options?.moves ?? [];
  if (moves.length === 1 && moves[0].id === "struggle") return { choice: "move 1" };
  const trapped = !!(options?.trapped || options?.maybeTrapped);

  const foes = s.foe.active.filter((p) => !p.fainted).map((p) => p.position);
  const v = new AiView(battle, side, position, foes[0]);
  const free = v.bench(v.user).some((p) => !taken.has(p.position));
  if (!trapped && free) {
    const to = shouldSwitch(v);
    if (to) {
      const chosen = to === "best" ? bestReplacement(v.sim, side, taken) : to;
      if (!taken.has(chosen.position)) return send(chosen);
    }
  }
  const item = itemToUse(v, memory.items[side] ?? [], team.items.filter(Boolean).length);
  if (item) return { item };

  const usable = v.moves.map((c) => !!moves[c.slot] && !moves[c.slot].disabled && moves[c.slot].pp !== 0);
  if (!trapped && free && team.aiFlags.includes(AiFlag.CHECK_BAD_MOVE)) {
    // CHECK_BAD_MOVE draws no random numbers: asking it again changes nothing.
    if (v.moves.every((c) => !usable[c.slot] || checkBadMove(v, c) <= USELESS)) return send(bestReplacement(v.sim, side, taken));
  }
  // BattleAI_ChooseMoveOrAction_Doubles: each foe's best move, then the best of those.
  const views = [v, ...foes.slice(1).map((foe) => new AiView(battle, side, position, foe))];
  const scored = views.map((view) => scoreMoves(view, team.aiFlags, usable));
  const bests = scored.map((scores, i) => bestMove(views[i], scores));
  const top = Math.max(...bests.map((slot, i) => scored[i][slot]));
  const ties = bests.flatMap((slot, i) => (scored[i][slot] === top ? [i] : []));
  const pick = ties.length === 1 ? ties[0] : battle.sample(ties);
  const slot = bests[pick];
  const aim = start.doubles ? targetLoc(battle, moves[slot]?.target ?? "", position, foes[pick]) : "";
  return { choice: `move ${slot + 1}${aim}` };
}

/** Showdown's target location for a move that asks for one: a foe, or its own side's. */
function targetLoc(battle: Battle, target: string, position: number, foe: number): string {
  if (!battle.actions.targetTypeChoices(target)) return "";
  if (target === "adjacentAlly") return ` ${-(1 - position + 1)}`;
  if (target === "adjacentAllyOrSelf") return ` ${-(position + 1)}`;
  return ` ${foe + 1}`;
}
