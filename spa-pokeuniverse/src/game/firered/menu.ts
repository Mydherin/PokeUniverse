// FireRed's windows and menus: the dialogue box and standard frames on BG0, the "▶" cursor
// menus (YES/NO, lists), the top bar of the New Game screens and the bobbing text cursor.
// Tiles, palettes and layouts follow the game; the code is our own.

import { Button } from "../gba/input";
import type { Sprite, SpriteTemplate } from "../gba/sprites";
import { FontId, Window, type Text, type WindowTemplate } from "../gba/text";
import type { Background } from "../gba/video";
import { fillBgRect } from "./common";
import type { Flow } from "./flow";

export const DLG_WINDOW_PALETTE = 15;
export const DLG_WINDOW_BASE_TILE = 0x200;
export const STD_WINDOW_PALETTE = 14;
export const STD_WINDOW_BASE_TILE = 0x214;
const V_FLIP = 0x800;

/** The text box every message uses (InitStandardTextBoxWindows: window 0). */
export const STANDARD_TEXT_BOX: WindowTemplate = { left: 2, top: 15, width: 26, height: 4, palette: DLG_WINDOW_PALETTE, baseBlock: 0x198 };

/** LoadStdWindowFrameGfx: dialogue frame tiles and the user's frame (type 1) on BG0, with palettes. */
export function loadStdWindowFrameGfx(flow: Flow, bg: Background): void {
  const { assets, gba } = flow;
  gba.palettes.load(assets.get("stdMenuPal").palette, STD_WINDOW_PALETTE * 16, 10);
  copyTiles(bg, assets.get("menuMessageFrame").tiles, DLG_WINDOW_BASE_TILE, 20);
  gba.palettes.load(assets.get("textWindowPal0").palette, DLG_WINDOW_PALETTE * 16, 16);
  const frame = assets.get("textWindowFrame");
  copyTiles(bg, frame.tiles, STD_WINDOW_BASE_TILE, 9);
  gba.palettes.load(frame.palette, STD_WINDOW_PALETTE * 16, 16);
}

/** LoadSignpostWindowFrameGfx: the signpost frame in place of the dialogue frame, same palettes otherwise. */
export function loadSignpostWindowFrameGfx(flow: Flow, bg: Background): void {
  const { assets, gba } = flow;
  gba.palettes.load(assets.get("stdMenuPal").palette, STD_WINDOW_PALETTE * 16, 10);
  copyTiles(bg, assets.get("signpostFrame").tiles, DLG_WINDOW_BASE_TILE, 19);
  gba.palettes.load(assets.get("textWindowPal1").palette, DLG_WINDOW_PALETTE * 16, 16);
  const frame = assets.get("textWindowFrame");
  copyTiles(bg, frame.tiles, STD_WINDOW_BASE_TILE, 9);
  gba.palettes.load(frame.palette, STD_WINDOW_PALETTE * 16, 16);
}

/** LoadBgTiles: `count` tiles at `at`, growing the background's tiles when needed. */
export function copyTiles(bg: Background, tiles: Uint8Array, at: number, count = tiles.length / 64): void {
  const end = (at + count) * 64;
  if (bg.tiles.length < end) {
    const grown = new Uint8Array(end);
    grown.set(bg.tiles);
    bg.tiles = grown;
  }
  bg.tiles.set(tiles.subarray(0, count * 64), at * 64);
}

/**
 * DrawDialogueFrame: the message frame around the window, then an empty white window. The
 * signpost frame mirrors its middle rows the other way.
 */
export function drawDialogueFrame(win: Window, signpost = false): void {
  const { bg } = win;
  const { left, top, width } = win.template;
  const t = DLG_WINDOW_BASE_TILE;
  const p = DLG_WINDOW_PALETTE;
  const row = (y: number, a: number, b: number, mid: number | null, c: number, d: number, flip = 0) => {
    fillBgRect(bg, (t + a) | flip, left - 2, y, 1, 1, p);
    fillBgRect(bg, (t + b) | flip, left - 1, y, 1, 1, p);
    if (mid !== null) fillBgRect(bg, (t + mid) | flip, left, y, width, 1, p);
    fillBgRect(bg, (t + c) | flip, left + width, y, 1, 1, p);
    fillBgRect(bg, (t + d) | flip, left + width + 1, y, 1, 1, p);
  };
  row(top - 1, 0, 1, 2, 3, 4);
  row(top, 5, 6, null, 8, 9);
  row(top + 1, 10, 11, null, 12, 13);
  if (signpost) {
    row(top + 2, 5, 6, null, 8, 9, V_FLIP);
    row(top + 3, 10, 11, null, 12, 13, V_FLIP);
  } else {
    row(top + 2, 10, 11, null, 12, 13, V_FLIP);
    row(top + 3, 5, 6, null, 8, 9, V_FLIP);
  }
  row(top + 4, 0, 1, 2, 3, 4, V_FLIP);
  win.fill(1);
  win.putTilemap();
}

export function clearDialogWindowAndFrame(win: Window): void {
  const { left, top, width, height } = win.template;
  fillBgRect(win.bg, 0, left - 2, top - 1, width + 4, height + 2, STD_WINDOW_PALETTE);
  win.fill(1);
  win.clearTilemap();
  win.copyToVram();
}

/** DrawStdFrameWithCustomTileAndPalette, then a white window. */
export function drawStdFrame(win: Window, tile = STD_WINDOW_BASE_TILE, palette = STD_WINDOW_PALETTE): void {
  const { bg } = win;
  const { left, top, width, height } = win.template;
  fillBgRect(bg, tile, left - 1, top - 1, 1, 1, palette);
  fillBgRect(bg, tile + 1, left, top - 1, width, 1, palette);
  fillBgRect(bg, tile + 2, left + width, top - 1, 1, 1, palette);
  fillBgRect(bg, tile + 3, left - 1, top, 1, height, palette);
  fillBgRect(bg, tile + 5, left + width, top, 1, height, palette);
  fillBgRect(bg, tile + 6, left - 1, top + height, 1, 1, palette);
  fillBgRect(bg, tile + 7, left, top + height, width, 1, palette);
  fillBgRect(bg, tile + 8, left + width, top + height, 1, 1, palette);
  win.fill(1);
  win.putTilemap();
  win.copyToVram();
}

export function clearStdWindowAndFrameToTransparent(win: Window): void {
  const { left, top, width, height } = win.template;
  fillBgRect(win.bg, 0, left - 1, top - 1, width + 2, height + 2, 0);
  win.fill(0);
  win.clearTilemap();
  win.copyToVram();
}

/** Prints with the font's own colors and spacing (AddTextPrinterParameterized, speed 0). */
export function printDefault(flow: Flow, win: Window, font: FontId, text: Text, x: number, y: number): void {
  const f = flow.fonts[font];
  win.print(f, x, y, [1, 2, 3], text);
  win.copyToVram();
}

export const MENU_NOTHING_CHOSEN = -2;
export const MENU_B_PRESSED = -1;

/** Menu_InitCursor: a "▶" before options `optionHeight` pixels apart; A picks, B cancels. */
export class CursorMenu {
  cursorPos: number;

  constructor(
    private readonly flow: Flow,
    readonly win: Window,
    private readonly font: FontId,
    private readonly left: number,
    private readonly top: number,
    private readonly optionHeight: number,
    private readonly count: number,
    initial = 0,
  ) {
    this.cursorPos = initial < 0 || initial >= count ? 0 : initial;
    this.redraw(this.cursorPos, this.cursorPos);
  }

  private redraw(oldPos: number, newPos: number): void {
    const height = this.flow.fonts[this.font].maxLetterHeight;
    this.win.fillRect(1, this.left, this.optionHeight * oldPos + this.top, 8, height);
    printDefault(this.flow, this.win, this.font, this.flow.assets.text("gText_SelectorArrow2"), this.left, this.optionHeight * newPos + this.top);
  }

  private move(delta: number, wrap: boolean): number {
    const old = this.cursorPos;
    const next = old + delta;
    if (next < 0) this.cursorPos = wrap ? this.count - 1 : 0;
    else if (next >= this.count) this.cursorPos = wrap ? 0 : this.count - 1;
    else this.cursorPos = next;
    this.redraw(old, this.cursorPos);
    return this.cursorPos;
  }

  /** Menu_ProcessInput (wrapping) or Menu_ProcessInputNoWrapAround. */
  processInput(wrap: boolean): number {
    const { input } = this.flow.gba;
    if (input.isPressed(Button.A)) {
      this.flow.play("se_select");
      return this.cursorPos;
    }
    if (input.isPressed(Button.B)) return MENU_B_PRESSED;
    for (const [button, delta] of [
      [Button.Up, -1],
      [Button.Down, 1],
    ] as const) {
      if (!input.isPressed(button)) continue;
      const old = this.cursorPos;
      if (this.move(delta, wrap) !== old || wrap) this.flow.play("se_select");
      return MENU_NOTHING_CHOSEN;
    }
    return MENU_NOTHING_CHOSEN;
  }
}

/** CreateYesNoMenu: YES/NO in a standard frame; choosing (or B) clears it. */
export class YesNoMenu {
  private readonly menu: CursorMenu;

  constructor(flow: Flow, bg: Background, template: WindowTemplate, font: FontId, left: number, top: number, initial: number) {
    const win = new Window(bg, template);
    drawStdFrame(win);
    const f = flow.fonts[font];
    win.print(f, 8 + left, top, [1, 2, 3], flow.assets.text("gText_YesNo"));
    this.menu = new CursorMenu(flow, win, font, left, top, f.maxLetterHeight + f.lineSpacing, 2, initial);
  }

  /** Menu_ProcessInputNoWrapClearOnChoose: 0 YES, 1 NO, B pressed or nothing yet. */
  processInput(): number {
    const result = this.menu.processInput(false);
    if (result !== MENU_NOTHING_CHOSEN) clearStdWindowAndFrameToTransparent(this.menu.win);
    return result;
  }
}

/** The New Game screens' top bar: a title and the button hints, right-aligned. */
export class TopBar {
  readonly win: Window;

  constructor(
    private readonly flow: Flow,
    bg: Background,
    width: number,
    top: number,
    palette: number,
    baseBlock: number,
  ) {
    this.win = new Window(bg, { left: 30 - width, top, width, height: 2, palette, baseBlock });
    flow.gba.palettes.load(flow.assets.get("textWindowPal2").palette, palette * 16, 16);
  }

  /** TopBarWindowPrintTwoStrings: a title on the left, hints on the right. */
  printTwo(title: Text, hints: Text | null): void {
    const { fonts } = this.flow;
    const color = [15, 1, 2] as const;
    this.win.putTilemap();
    this.win.fill(15);
    if (hints) this.win.print(fonts[FontId.Small], (-20 - fonts[FontId.Small].width(hints)) & 0xff, 1, color, hints);
    this.win.print(fonts[FontId.NormalCopy1], 4, 1, color, title, 0, 0);
    this.win.copyToVram();
  }

  /** TopBarWindowPrintString: the hints only. */
  print(hints: Text): void {
    const small = this.flow.fonts[FontId.Small];
    this.win.putTilemap();
    this.win.fill(15);
    this.win.print(small, (-20 - small.width(hints)) & 0xff, 1, [15, 1, 2], hints);
    this.win.copyToVram();
  }

  clear(): void {
    this.win.fill(15);
    this.win.copyToVram();
  }

  destroy(): void {
    this.win.fill(0);
    this.win.clearTilemap();
    this.win.copyToVram();
  }
}

const CURSOR_DELAY = 8;

const TEXT_CURSOR: SpriteTemplate = {
  sheet: "textCursor",
  palette: "textCursor",
  width: 16,
  height: 16,
  priority: 0,
  callback: (sprite) => {
    const d = sprite.data;
    if (d[0]) {
      d[0]--;
      return;
    }
    d[0] = CURSOR_DELAY;
    if (d[1] === 3) {
      sprite.y2 = 1;
      d[1] = 0;
      return;
    }
    sprite.y2 = [0, 1, 2][d[1]];
    d[1]++;
  },
};

/** CreateTextCursorSprite: the bobbing arrow showing that A goes on. */
export function createTextCursorSprite(flow: Flow, x: number, y: number, priority: number, subpriority: number): Sprite | null {
  const { gba, assets } = flow;
  gba.sprites.loadSheet("textCursor", assets.get("textCursor").tiles);
  gba.palettes.loadSpritePalette("textCursor", assets.get("stdMenuPal").palette);
  const sprite = gba.sprites.create(TEXT_CURSOR, x + 3, y + 4, subpriority);
  if (!sprite) return null;
  sprite.priority = priority & 3;
  sprite.data[0] = CURSOR_DELAY;
  return sprite;
}

export function destroyTextCursorSprite(flow: Flow, sprite: Sprite | null): void {
  flow.gba.sprites.destroy(sprite);
  flow.gba.sprites.freeSheet("textCursor");
  flow.gba.palettes.freeSpritePalette("textCursor");
}
