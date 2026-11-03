// BattleScript_AskToLearnMove: a move with no slot free, in a battle or after an evolution.
// "<MON> is trying to learn…", YES/NO, the summary's forget screen, and "Stop learning?" with
// its own YES/NO. The scene is a getter: coming back from the summary draws a new one. Which move
// goes away is the caller's to send.

import type { Text } from "../../gba/text";
import { FORGET_NONE } from "../summary";
import type { BattleScene } from "./scene";
import type { BattleTexts } from "./text";

/** The move slot it replaces, or null when it doesn't learn the move. */
export function* askToLearnMove(scene: () => BattleScene, texts: BattleTexts, name: Text, move: number, forgetScreen: (pick: (row: number) => void) => Generator<void, void, void>): Generator<void, number | null, void> {
  const args = { buff1: name, buff2: texts.moveName(move) };
  for (;;) {
    yield* scene().message(texts.format("sText_TryToLearnMove1", args), 0);
    yield* scene().message(texts.format("sText_TryToLearnMove2", args), 0);
    yield* scene().message(texts.format("sText_TryToLearnMove3", args), 0);
    if (yield* scene().yesNo()) {
      let row = FORGET_NONE;
      yield* forgetScreen((r) => (row = r));
      if (row !== FORGET_NONE) return row;
    }
    yield* scene().message(texts.format("sText_StopLearningMove", args), 0);
    if (yield* scene().yesNo()) {
      yield* scene().message(texts.format("sText_DidNotLearnMove", args), 0);
      return null;
    }
  }
}
