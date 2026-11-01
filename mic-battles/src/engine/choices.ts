// Our BattleActions as Showdown choices, and playing on until a player must choose.

import type { Battle } from "@pkmn/sim";
import type { StartBattle } from "@pokeuniverse/contracts/battle/v1/battle";
import { create } from "@bufbuild/protobuf";
import { ItemActionSchema, type BattleAction } from "@pokeuniverse/contracts/battle/v1/view";
import { decide, isAiSide, type AiMemory } from "../ai/index.ts";
import { chooseBagItem } from "./bag.ts";
import { moveOptions, partySlot, pokemonAt, sideId } from "./battle.ts";

/** A choice the request doesn't allow. The step isn't played: the side gets its request again. */
export class InvalidChoice extends Error {}

export function applyChoice(battle: Battle, side: number, action: BattleAction | undefined): void {
  const s = battle.sides[side];
  const req = s.activeRequest;
  if (!req || req.wait || s.isChoiceDone()) throw new InvalidChoice(`side ${side} has nothing to choose`);

  let input: string;
  switch (action?.kind.case) {
    case "move": {
      const allowed: { id: string }[] = moveOptions(s)?.moves ?? [];
      // Every move unusable: any FIGHT choice is Struggle, Showdown's only option then.
      input = allowed.length === 1 && allowed[0].id === "struggle" ? "move 1" : `move ${action.kind.value.slot + 1}`;
      break;
    }
    case "switch":
      input = `switch ${pokemonAt(battle, side, action.kind.value.partySlot).position + 1}`;
      break;
    case "item":
      if (req.forceSwitch || !chooseBagItem(s.active[0], action.kind.value)) throw new InvalidChoice(`item ${action.kind.value.item} can't be used`);
      if (battle.allChoicesDone()) battle.commitChoices();
      return;
    default:
      // RUN: trainer battles can't be fled; wild battles come in Phase 9.
      throw new InvalidChoice(`unsupported action ${action?.kind.case}`);
  }
  if (!battle.choose(sideId(side), input)) throw new InvalidChoice(s.choice.error || input);
}

/** Chooses for the AI's sides and for locked moves (Outrage, recharging…) until a player must
 *  choose or the battle ends. */
export function advance(battle: Battle, start: StartBattle, memory: AiMemory): void {
  for (let progressed = true; progressed && !battle.ended; ) {
    progressed = false;
    for (const [side, s] of battle.sides.entries()) {
      if (battle.ended || !s.activeRequest || s.activeRequest.wait || s.isChoiceDone()) continue;
      const locked = !s.activeRequest.forceSwitch && s.active[0]?.getLockedMove();
      if (locked) battle.choose(sideId(side), "move 1");
      else if (isAiSide(start, side)) {
        const decision = decide(battle, start, side, memory);
        if ("choice" in decision) {
          if (!battle.choose(sideId(side), decision.choice)) throw new Error(`AI choice refused: ${decision.choice} (${s.choice.error})`);
        } else {
          const user = s.active[0];
          chooseBagItem(user, create(ItemActionSchema, { item: decision.item, partySlot: partySlot(user) }));
          if (battle.allChoicesDone()) battle.commitChoices();
        }
      } else continue;
      progressed = true;
    }
  }
}
