// The player's menus (battle_controller_player.c): FIGHT / BAG / POKéMON / RUN with "What will
// <MON> do?", and the move menu with each move's PP (colored by how much is left) and its type.
// The Gen 4 category icon (plans/battles D10) stands where "TYPE/" was, before the type's name.
// In doubles, the target of a move that asks for one.

import type { Battler } from "@pokeuniverse/contracts/battle/v1/event";
import { Target } from "@pokeuniverse/contracts/move/v1/catalog";
import type { RequestMove } from "@pokeuniverse/contracts/battle/v1/view";
import { Button } from "../../gba/input";
import type { Sprite } from "../../gba/sprites";
import { decimalText, EOS, joinText, NumberMode, type Text } from "../../gba/text";
import { moveInfo } from "../../world/moves";
import type { Flow } from "../flow";
import { Page, type BattleScene, type Spot, type WindowId } from "./scene";
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

/** HandleInputChooseAction: the cursor moves in the 2×2 grid; A picks; with `canGoBack` (the partner's turn to choose), B returns null. */
export function* chooseAction(flow: Flow, scene: BattleScene, texts: BattleTexts, active: Battler, cursors: Cursors, canGoBack = false): Generator<void, Action | null, void> {
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
      scene.setCursor(...at(c), false);
      return c as Action;
    } else if (canGoBack && input.isPressed(Button.B)) {
      flow.play("se_select");
      scene.setCursor(...at(c), false);
      return null;
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
 * can't use now, says so and the menu stays. `confirm` runs on the move chosen with the menu still
 * up (its target, in doubles); false stays on the menu.
 */
export function* chooseMove(flow: Flow, scene: BattleScene, texts: BattleTexts, active: Battler, moves: readonly RequestMove[], cursors: Cursors, confirm?: (move: RequestMove) => Generator<void, boolean, void>): Generator<void, number | null, void> {
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
        if (confirm && !(yield* confirm(m))) continue;
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

/** HandleInputChooseTarget's order: player left, player right, foe right, foe left. */
const TARGET_CYCLE: readonly Spot[] = [
  { foe: false, position: 0 },
  { foe: false, position: 1 },
  { foe: true, position: 1 },
  { foe: true, position: 0 },
];

/** The targets a move's Target value leaves to the player. */
function canTarget(target: Target, user: Spot, spot: Spot): boolean {
  const self = spot.foe === user.foe && spot.position === user.position;
  switch (target) {
    case Target.NORMAL:
      return !self;
    case Target.ADJACENT_ALLY:
      return !self && !spot.foe;
    case Target.ADJACENT_ALLY_OR_SELF:
      return !spot.foe;
    case Target.ADJACENT_FOE:
      return spot.foe;
    default:
      return false;
  }
}

/** The move asks for a target at all (Showdown refuses these with none, in doubles). */
export function choosesTarget(target: Target): boolean {
  return target === Target.NORMAL || target === Target.ADJACENT_ALLY || target === Target.ADJACENT_ALLY_OR_SELF || target === Target.ADJACENT_FOE;
}

/**
 * HandleInputChooseTarget: the battler chosen, or null when B goes back. Left and Up go backward,
 * Right and Down forward, over those on the field; the one under the cursor blinks and its
 * healthbox bounces. With nobody else to pick, there's no question: the one left, or (an ally that
 * fainted) the empty spot, which is still a valid target to Showdown.
 */
export function* chooseTarget(flow: Flow, scene: BattleScene, user: Spot, target: Target, onField: (spot: Spot) => boolean): Generator<void, Spot | null, void> {
  const spots = TARGET_CYCLE.filter((s) => onField(s) && canTarget(target, user, s));
  if (spots.length <= 1) return spots[0] ?? (target === Target.NORMAL || target === Target.ADJACENT_FOE ? { foe: true, position: 0 } : { foe: false, position: 1 - user.position });
  const first = target === Target.ADJACENT_ALLY_OR_SELF ? [(s: Spot) => !s.foe && s.position === user.position] : [(s: Spot) => s.foe && s.position === 0, (s: Spot) => s.foe];
  let cursor = Math.max(0, first.map((test) => spots.findIndex(test)).find((i) => i >= 0) ?? 0);
  const { input } = flow.gba;
  let frame = 0;
  // SpriteCB_ShowAsMoveTarget (one out of sight, Fly or Dig, goes back to that) and the bounce (DoBounceEffect's delta 7, amplitude 1).
  let wasInvisible = scene.mon(spots[cursor])?.sprite.invisible ?? false;
  const stop = (s: Spot) => {
    const sprite = scene.mon(s)?.sprite;
    if (sprite) sprite.invisible = wasInvisible;
    scene.healthbox(s).offsetY = 0;
  };
  for (;;) {
    yield;
    frame++;
    const s = spots[cursor];
    const sprite = scene.mon(s)?.sprite;
    if (sprite) sprite.invisible = (frame >> 3) % 2 === 1;
    scene.healthbox(s).offsetY = Math.floor(Math.sin((2 * Math.PI * ((frame * 7) & 255)) / 256));
    const step = input.isPressed(Button.Left | Button.Up) ? -1 : input.isPressed(Button.Right | Button.Down) ? 1 : 0;
    if (step) {
      flow.play("se_select");
      stop(s);
      cursor = (cursor + step + spots.length) % spots.length;
      wasInvisible = scene.mon(spots[cursor])?.sprite.invisible ?? false;
      frame = 0;
    } else if (input.isPressed(Button.A)) {
      flow.play("se_select");
      stop(s);
      return s;
    } else if (input.isPressed(Button.B)) {
      flow.play("se_select");
      stop(s);
      return null;
    }
  }
}
