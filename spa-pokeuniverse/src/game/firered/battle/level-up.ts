// What a level up shows besides the bars: the stripes rising over the Pokémon
// (Task_LevelUpVerticalSprites) and the stats box, with what each stat gained and then its total
// (Cmd_drawlvlupbox, DrawLevelUpWindowPg1 and 2).

import type { Stats } from "@pokeuniverse/contracts/pokemon/v1/stats";
import { Button } from "../../gba/input";
import { ObjMode } from "../../gba/sprites";
import type { Sprite } from "../../gba/sprites";
import { decimalText, EOS, FontId, joinText, NumberMode, type Window } from "../../gba/text";
import { Layer } from "../../gba/video";
import type { Flow } from "../flow";
import type { TextId } from "../manifest";
import type { BattleScene } from "./scene";

const STRIPES = 18;
/** Any button (gMain.newKeys != 0). */
const ANY = Button.A | Button.B | Button.Start | Button.Select | Button.Up | Button.Down | Button.Left | Button.Right | Button.L | Button.R;
const COLORS: [number, number, number] = [14, 13, 15];
const CHAR_SPACE = 0x00;

/** ISO_RANDOMIZE1. */
const randomize = (n: number) => (Math.imul(n, 1103515245) + 24691) >>> 16;

/** The stripes start at the Pokémon's lower left; one every two frames, each rising at its own speed. */
export function* levelUpStripes(flow: Flow, mon: Sprite | null): Generator<void, void, void> {
  if (!mon) return;
  const { gba, assets } = flow;
  const { sprites, palettes, video } = gba;
  const blend = [video.target1, video.target2, video.eva, video.evb] as const;
  const art = assets.get("levelUpStripes");
  sprites.loadSheet("levelUpStripe", art.tiles);
  palettes.loadSpritePalette("levelUpStripe", art.palette);
  // BLDCNT_TGT2_ALL, BLDALPHA_BLEND(12, 6).
  Object.assign(video, { target1: 0, target2: Layer.ALL, eva: 12, evb: 6 });
  // MoveBattlerSpriteToBG: the stripes blend with the Pokémon.
  mon.onBg = true;
  const x = mon.x + mon.x2 - 32;
  const y = mon.y + mon.y2 + 32;
  const template = { sheet: "levelUpStripe", palette: "levelUpStripe", width: 8, height: 16, priority: 1, mode: ObjMode.Blend };
  let made = 0;
  let active = 0;
  const create = () => {
    made++;
    const speed = (randomize(made) & 0x3f) + 0x20;
    let sub = 0;
    const s = sprites.create(template, ((made * 219) & 0x3f) + x, y, 0);
    if (!s) return;
    active++;
    s.callback = () => {
      sub -= speed;
      s.y2 = sub >> 4;
      if (s.y2 < -0x40) {
        active--;
        sprites.destroy(s);
      }
    };
  };
  for (let frame = 0; made < STRIPES || active > 0; frame++) {
    if (made < STRIPES && frame % 2 === 0) create();
    yield;
  }
  [video.target1, video.target2, video.eva, video.evb] = blend;
  mon.onBg = false;
  sprites.freeSheet("levelUpStripe");
  palettes.freeSpritePalette("levelUpStripe");
}

/** In the box's order; each stat's label and field. */
const ROWS: [TextId, keyof Pick<Stats, "hp" | "attack" | "defense" | "spAttack" | "spDefense" | "speed">][] = [
  ["gText_LevelUp_MaxHP", "hp"],
  ["gText_LevelUp_Attack", "attack"],
  ["gText_LevelUp_Defense", "defense"],
  ["gText_LevelUp_SpAtk", "spAttack"],
  ["gText_LevelUp_SpDef", "spDefense"],
  ["gText_LevelUp_Speed", "speed"],
];

/** The box: any button shows the totals, any button closes it. */
export function* levelUpBox(flow: Flow, scene: BattleScene, before: Stats | undefined, after: Stats | undefined): Generator<void, void, void> {
  const { input } = flow.gba;
  const close = scene.openWindow(18, 7, 29, 19);
  const win = scene.blankWindow("levelUp");
  levelUpGains(flow, win, before, after);
  win.copyToVram();
  const press = function* () {
    do yield;
    while (!input.isPressed(ANY));
    flow.play("se_select");
  };
  yield* press();
  win.fill(14);
  levelUpTotals(flow, win, after);
  win.copyToVram();
  yield* press();
  close();
}

/** DrawLevelUpWindowPg1, which the party menu's box shares: what each stat gained. */
export function levelUpGains(flow: Flow, win: Window, before: Stats | undefined, after: Stats | undefined, colors = COLORS): void {
  const { assets, fonts } = flow;
  const font = fonts[FontId.Normal];
  ROWS.forEach(([label, stat], i) => {
    const y = i * 15;
    const diff = (after?.[stat] ?? 0) - (before?.[stat] ?? 0);
    win.print(font, 0, y, colors, assets.text(label), 0, 0);
    win.print(font, 56, y, colors, assets.text(diff >= 0 ? "gText_LevelUp_Plus" : "gText_LevelUp_Minus"), 0, 0);
    win.print(font, (Math.abs(diff) < 10 ? 12 : 6) + 56, y, colors, joinText([CHAR_SPACE, EOS], decimalText(Math.abs(diff), NumberMode.LeftAlign, 2)), 0, 0);
  });
}

/** DrawLevelUpWindowPg2: each stat's total. */
export function levelUpTotals(flow: Flow, win: Window, after: Stats | undefined, colors = COLORS): void {
  const { assets, fonts } = flow;
  const font = fonts[FontId.Normal];
  ROWS.forEach(([label, stat], i) => {
    const y = i * 15;
    const value = after?.[stat] ?? 0;
    const digits = String(value).length;
    win.print(font, 0, y, colors, assets.text(label), 0, 0);
    win.print(font, 56 + 6 * (4 - digits), y, colors, decimalText(value, NumberMode.LeftAlign, digits), 0, 0);
  });
}
