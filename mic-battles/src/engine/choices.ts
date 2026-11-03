// Our BattleActions as Showdown choices, and playing on until a player must choose.

import type { Battle } from "@pkmn/sim";
import type { StartBattle } from "@pokeuniverse/contracts/battle/v1/battle";
import { create } from "@bufbuild/protobuf";
import { BattleEventSchema, type BattleEvent } from "@pokeuniverse/contracts/battle/v1/event";
import { ItemActionSchema, type BattleAction, type ItemAction } from "@pokeuniverse/contracts/battle/v1/view";
import { decide, isAiSide, type AiMemory } from "../ai/index.ts";
import { bagItemWorks, chooseBagItem } from "./bag.ts";
import type { ExpState } from "../exp.ts";
import { learnMove, moveOptions, partySlot, pokemonAt, positionsToChoose, type Pokemon, type Side } from "./battle.ts";
import { moveNumber } from "./lookup.ts";

/** A choice the request doesn't allow. The step isn't played: the side gets its request again. */
export class InvalidChoice extends Error {}

/** One Pokémon's part of its side's choice: Showdown's words, or a bag item. */
type Part = string | ItemAction;

/** A side's whole choice: a part per position asked; Showdown's locked moves and passes are filled in. */
function choose(battle: Battle, side: number, parts: Part[]): void {
  const s = battle.sides[side];
  s.clearChoice();
  const left = [...parts];
  while (!s.isChoiceDone()) {
    const pokemon = s.active[s.getChoiceIndex()];
    const done =
      s.requestState === "switch" && !s.choice.forcedSwitchesLeft ? s.choosePass()
      : s.requestState === "move" && pokemon.getLockedMove() ? s.chooseMove(1)
      : choosePart(s, pokemon, left.shift());
    if (!done) throw new InvalidChoice(s.choice.error || `side ${side}: no choice`);
  }
  if (left.length) throw new InvalidChoice(`side ${side}: too many choices`);
  if (battle.allChoicesDone()) battle.commitChoices();
}

function choosePart(s: Side, pokemon: Pokemon, part: Part | undefined): boolean {
  if (part === undefined) return false;
  if (typeof part !== "string") return chooseBagItem(pokemon, part);
  const [verb, what, target] = part.split(" ");
  return !!(verb === "switch" ? s.chooseSwitch(what) : s.chooseMove(Number(what), Number(target ?? 0)));
}

export function applyChoice(battle: Battle, side: number, action: BattleAction | undefined, partner?: BattleAction): void {
  const s = battle.sides[side];
  const req = s.activeRequest;
  if (!req || req.wait || s.isChoiceDone()) throw new InvalidChoice(`side ${side} has nothing to choose`);
  const positions = positionsToChoose(battle, s);
  choose(battle, side, [action, partner].filter((a) => a !== undefined).map((a, i) => toPart(battle, side, positions[i], a)));
}

/** A player's action as the position's part of the choice. */
function toPart(battle: Battle, side: number, position: number | undefined, action: BattleAction): Part {
  const s = battle.sides[side];
  if (position === undefined) throw new InvalidChoice(`side ${side}: too many choices`);
  switch (action.kind.case) {
    case "move": {
      const { slot, target } = action.kind.value;
      const allowed: { id: string; target?: string }[] = moveOptions(s, position)?.moves ?? [];
      // Every move unusable: any FIGHT choice is Struggle, Showdown's only option then.
      if (allowed.length === 1 && allowed[0].id === "struggle") return "move 1";
      const aimed = target && battle.actions.targetTypeChoices(allowed[slot]?.target ?? "");
      return aimed ? `move ${slot + 1} ${target.foe ? target.position + 1 : -(target.position + 1)}` : `move ${slot + 1}`;
    }
    case "switch":
      return `switch ${pokemonAt(battle, side, action.kind.value.partySlot).position + 1}`;
    case "item":
      if (s.activeRequest?.forceSwitch || !bagItemWorks(s.active[position], action.kind.value)) throw new InvalidChoice(`item ${action.kind.value.item} can't be used`);
      return action.kind.value;
    default:
      // RUN: trainer battles can't be fled; wild battles come in Phase 9.
      throw new InvalidChoice(`unsupported action ${action.kind.case}`);
  }
}

/** The answer to a LEARN_MOVE request: the waiting move replaces the slot named, or is let go. */
export function answerLearn(battle: Battle, exp: ExpState, action: BattleAction | undefined): BattleEvent[] {
  const pending = exp.pending[0];
  if (action?.kind.case !== "learn") throw new InvalidChoice(`a move is waiting for its answer, got ${action?.kind.case}`);
  const forget = action.kind.value.forgetSlot;
  const pokemon = pokemonAt(battle, 0, pending.slot);
  const old = forget === undefined ? undefined : pokemon.baseMoveSlots[forget];
  if (forget !== undefined && !old) throw new InvalidChoice(`no move in slot ${forget}`);
  exp.pending.shift();
  if (forget === undefined || !old) return [];
  const forgot = moveNumber(old.id);
  learnMove(pokemon, pending.move, forget);
  const battler = { partySlot: pending.slot, position: Math.max(0, exp.active[0].indexOf(pending.slot)) };
  return [create(BattleEventSchema, { kind: { case: "moveLearned", value: { battler, move: pending.move, forgot } } })];
}

/** Battle style SHIFT (D26): the AI's replacement, chosen and waiting for the player's answer. */
export type ShiftOffer = { choice: string; slot: number };

/** Before any switch of this step: FireRed's player changes first, then the foe's next comes out. */
const BEFORE_OTHER_SWITCHES = 2;

/** The answer to a SHIFT request: the player's change if any (Showdown's forced switch), then the foe's. */
export function answerShift(battle: Battle, offer: ShiftOffer, action: BattleAction | undefined): void {
  if (action?.kind.case !== "shift") throw new InvalidChoice(`a change is waiting for its answer, got ${action?.kind.case}`);
  const slot = action.kind.value.partySlot;
  if (slot !== undefined) {
    const s = battle.sides[0];
    const pokemon = pokemonAt(battle, 0, slot);
    if (pokemon.fainted || pokemon.isActive) throw new InvalidChoice(`slot ${slot} can't come in`);
    s.active[0].switchFlag = true;
    s.activeRequest = { forceSwitch: [true], side: s.getRequestData() };
    s.clearChoice();
    if (!s.choose(`switch ${pokemon.position + 1}`)) throw new InvalidChoice(s.choice.error);
    Object.assign(s.choice.actions[0], { order: BEFORE_OTHER_SWITCHES });
  }
  if (!battle.choose("p2", offer.choice)) throw new Error(`AI choice refused: ${offer.choice} (${battle.sides[1].choice.error})`);
}

/** jumpifcantswitch for a SHIFT player: someone to send and nothing holding the active one; singles only. */
function canOfferShift(battle: Battle, start: StartBattle, side: number): boolean {
  const player = battle.sides[1 - side];
  const active = player.active[0];
  if (start.doubles || !start.sides[1 - side].shiftStyle || !battle.sides[side].active[0]?.fainted || active.fainted || active.switchFlag) return false;
  if (!player.pokemon.some((p) => !p.fainted && !p.isActive)) return false;
  active.trapped = false;
  battle.runEvent("TrapPokemon", active);
  return !active.trapped;
}

/** Chooses for the AI's sides and for locked moves (Outrage, recharging…) until a player must
 *  choose or the battle ends. A SHIFT offer stops it with the AI's replacement already chosen. */
export function advance(battle: Battle, start: StartBattle, memory: AiMemory): ShiftOffer | undefined {
  for (let progressed = true; progressed && !battle.ended; ) {
    progressed = false;
    for (const [side, s] of battle.sides.entries()) {
      if (battle.ended || !s.activeRequest || s.activeRequest.wait || s.isChoiceDone()) continue;
      const positions = positionsToChoose(battle, s);
      if (positions.length && !isAiSide(start, side)) continue;
      const taken = new Set<number>();
      const decisions = positions.map((position) => decide(battle, start, side, position, memory, taken));
      const [only] = decisions;
      if (decisions.length === 1 && "choice" in only && s.activeRequest.forceSwitch && canOfferShift(battle, start, side)) {
        return { choice: only.choice, slot: partySlot(s.pokemon[Number(only.choice.split(" ")[1]) - 1]) };
      }
      choose(battle, side, decisions.map((d, i) => ("choice" in d ? d.choice : create(ItemActionSchema, { item: d.item, partySlot: partySlot(s.active[positions[i]]) }))));
      progressed = true;
    }
  }
  return undefined;
}
