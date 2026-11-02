// The player's menus (battle_controller_player.c): FIGHT / BAG / POKéMON / RUN with "What will
// <MON> do?", and the move menu with each move's PP (colored by how much is left) and its type.
// The Gen 4 category icon (plans/battles D10) stands where "TYPE/" was, before the type's name.

import type { Battler } from "@pokeuniverse/contracts/battle/v1/event";
import type { RequestMove } from "@pokeuniverse/contracts/battle/v1/view";
import { Button } from "../../gba/input";
import type { Sprite } from "../../gba/sprites";
import { decimalText, EOS, joinText, NumberMode, type Text } from "../../gba/text";
import { moveInfo } from "../../world/moves";
import type { Flow } from "../flow";
import { Page, type BattleScene, type WindowId } from "./scene";
import type { BattleTexts } from "./text";

export const enum Action {
  Fight,
  Bag,
  Pokemon,
  Run,
}

/** Where the cursors were last (gActionSelectionCursor, gMoveSelectionCursor). */
export interface Cursors {
  action: number;
  move: number;
}

const MOVE_WINDOWS: WindowId[] = ["moveName1", "moveName2", "moveName3", "moveName4"];
const CHAR_SLASH = 0xba;

/** HandleInputChooseAction: the cursor moves in the 2×2 grid; A picks. */
export function* chooseAction(flow: Flow, scene: BattleScene, texts: BattleTexts, active: Battler, cursors: Cursors): Generator<void, Action, void> {
  scene.page = Page.Action;
  scene.print("actionPrompt", texts.format("gText_WhatWillPkmnDo", { atk: active }));
  scene.print("actionMenu", flow.assets.text("gText_BattleMenu"));
  const at = (c: number): [number, number] => [7 * (c & 1) + 16, 35 + (c & 2)];
  scene.setCursor(...at(cursors.action), true);
  for (;;) {
    yield;
    const { input } = flow.gba;
    const c = cursors.action;
    let next = c;
    if (input.isPressed(Button.Left) && c & 1) next = c ^ 1;
    else if (input.isPressed(Button.Right) && !(c & 1)) next = c ^ 1;
    else if (input.isPressed(Button.Up) && c & 2) next = c ^ 2;
    else if (input.isPressed(Button.Down) && !(c & 2)) next = c ^ 2;
    if (next !== c) {
      flow.play("se_select");
      scene.setCursor(...at(c), false);
      scene.setCursor(...at(next), true);
      cursors.action = next;
    } else if (input.isPressed(Button.A)) {
      flow.play("se_select");
      return c as Action;
    }
  }
}

/** GetCurrentPpToMaxPpState: 3 plenty, 2 half, 1 a quarter, 0 none. */
function ppState(pp: number, max: number): number {
  if (max === pp) return 3;
  if (max <= 2) return pp > 1 ? 3 : 2 - pp;
  if (max <= 7) return pp > 2 ? 3 : 2 - pp;
  if (pp === 0) return 0;
  if (pp <= Math.trunc(max / 4)) return 1;
  if (pp > Math.trunc(max / 2)) return 3;
  return 2;
}

/**
 * HandleInputChooseMove: the move's slot, or null when B goes back. A move with no PP, or one it
 * can't use now, says so and the menu stays.
 */
export function* chooseMove(flow: Flow, scene: BattleScene, texts: BattleTexts, active: Battler, moves: readonly RequestMove[], cursors: Cursors): Generator<void, number | null, void> {
  const { gba, assets } = flow;
  const count = moves.length;
  if (cursors.move >= count) cursors.move = 0;
  const at = (c: number): [number, number] => [9 * (c & 1) + 1, 55 + (c & 2)];
  gba.sprites.loadSheet("battleCategory", assets.get("categoryIcons").tiles);
  gba.palettes.loadSpritePalette("battleCategory", assets.get("categoryIcons").palette);
  const icon: Sprite | null = gba.sprites.create(
    { sheet: "battleCategory", palette: "battleCategory", width: 16, height: 16, priority: 0, anims: [0, 4, 8].map((image) => [{ image, duration: 0 }, "end"]) },
    176,
    144,
    0,
  );
  const draw = () => {
    scene.page = Page.Moves;
    MOVE_WINDOWS.forEach((id, i) => scene.print(id, moves[i] ? assets.moveName(moves[i].move) : [EOS]));
    scene.print("pp", assets.text("gText_MoveInterfacePP"));
    scene.setCursor(...at(cursors.move), true);
    info();
  };
  // MoveSelectionDisplayPpNumber and MoveSelectionDisplayMoveType.
  const info = () => {
    const m = moves[cursors.move];
    const pal = assets.get("ppTextPal").palette;
    const s = ppState(m.pp, m.maxPp);
    gba.palettes.load([pal[s * 2 + 1], pal[s * 2]], 5 * 16 + 11, 2);
    scene.print("ppRemaining", joinText(decimalText(m.pp, NumberMode.RightAlign, 2), [CHAR_SLASH, EOS], decimalText(m.maxPp, NumberMode.RightAlign, 2)));
    const moveData = moveInfo(m.move);
    scene.print("moveType", texts.typeName(moveData.type), 0, 18);
    if (icon) icon.startAnim(Math.max(0, moveData.category - 1));
  };
  draw();
  try {
    for (;;) {
      yield;
      const { input } = gba;
      const c = cursors.move;
      let next = c;
      if (input.isPressed(Button.Left) && c & 1) next = c ^ 1;
      else if (input.isPressed(Button.Right) && !(c & 1) && (c ^ 1) < count) next = c ^ 1;
      else if (input.isPressed(Button.Up) && c & 2) next = c ^ 2;
      else if (input.isPressed(Button.Down) && !(c & 2) && (c ^ 2) < count) next = c ^ 2;
      if (next !== c) {
        flow.play("se_select");
        scene.setCursor(...at(c), false);
        scene.setCursor(...at(next), true);
        cursors.move = next;
        info();
        continue;
      }
      if (input.isPressed(Button.B)) {
        flow.play("se_select");
        scene.setCursor(...at(c), false);
        return null;
      }
      if (!input.isPressed(Button.A)) continue;
      flow.play("se_select");
      const m = moves[c];
      if (!m.disabled && m.pp > 0) {
        scene.setCursor(...at(c), false);
        return c;
      }
      // TrySetCantSelectMoveBattleScript: the reason in the message box, then back to the moves.
      const why: Text = m.pp === 0 ? texts.format("sText_NoPPLeft") : texts.format("sText_PkmnMoveIsDisabled", { atk: active, move: m.move });
      if (icon) icon.invisible = true;
      yield* scene.message(why, 0);
      if (icon) icon.invisible = false;
      draw();
    }
  } finally {
    gba.sprites.destroy(icon);
  }
}
