// MARK's menu (mon_markings.c): a window of sprites built from the player's frame, the four marks
// (●, ■, ▲, ♥) lit or not, OK and CANCEL under them, and a cursor. A toggles a mark, OK keeps them,
// CANCEL or B leaves them as they were.

import { Button } from "../../gba/input";
import type { AnimCmd, Sprite, SpriteTemplate } from "../../gba/sprites";
import type { Flow } from "../flow";
import { userFrame } from "../manifest";

export const MARKINGS_COUNT = 4;
const SELECTION_OK = MARKINGS_COUNT;
const SELECTION_CANCEL = SELECTION_OK + 1;
const ANIM_CURSOR = MARKINGS_COUNT * 2;
const ANIM_TEXT = ANIM_CURSOR + 1;
const TILE_PIXELS = 64;
/** The window: 8 tiles wide, 14 rows, in two 64×64 sprites. */
const WINDOW_COLUMNS = 8;
const WINDOW_ROWS = 14;

/** sAnims_MenuSprite: each mark off and on, the cursor, the OK/CANCEL text. */
const MENU_ANIMS: AnimCmd[][] = [...Array.from({ length: ANIM_TEXT + 1 }, (_, i) => [{ image: i, duration: 5 }, "end"] as AnimCmd[])];
const WINDOW_ANIMS: AnimCmd[][] = [
  [{ image: 0, duration: 5 }, "end"],
  [{ image: 64, duration: 5 }, "end"],
];

/** BufferMenuFrameTiles: the frame's 3×3 tiles stretched to the window, its last two rows empty. */
function windowTiles(frame: Uint8Array): Uint8Array {
  const out = new Uint8Array(2 * 64 * TILE_PIXELS);
  for (let row = 0; row < WINDOW_ROWS; row++) {
    const band = row === 0 ? 0 : row === WINDOW_ROWS - 1 ? 6 : 3;
    for (let col = 0; col < WINDOW_COLUMNS; col++) {
      const piece = band + (col === 0 ? 0 : col === WINDOW_COLUMNS - 1 ? 2 : 1);
      out.set(frame.subarray(piece * TILE_PIXELS, (piece + 1) * TILE_PIXELS), (row * WINDOW_COLUMNS + col) * TILE_PIXELS);
    }
  }
  return out;
}

export class MarkingsMenu {
  /** The marks, one bit each; set from the menu's marks on OK. */
  markings: number;
  private readonly marks: boolean[];
  private cursorPos = 0;
  private readonly sprites: Sprite[] = [];

  /** OpenMonMarkingsMenu. */
  constructor(
    private readonly flow: Flow,
    markings: number,
    x: number,
    y: number,
  ) {
    const { gba, assets } = flow;
    this.markings = markings;
    this.marks = Array.from({ length: MARKINGS_COUNT }, (_, i) => ((markings >> i) & 1) === 1);
    const frame = assets.get(userFrame(flow.options.frame));
    gba.sprites.loadSheet("markingsWindow", windowTiles(frame.tiles));
    gba.palettes.loadSpritePalette("markingsWindow", frame.palette);
    const menu = assets.get("markingsMenu");
    gba.sprites.loadSheet("markingsMenu", menu.tiles);
    gba.palettes.loadSpritePalette("markingsMenu", menu.palette);

    const window: SpriteTemplate = { sheet: "markingsWindow", palette: "markingsWindow", width: 64, height: 64, priority: 0, anims: WINDOW_ANIMS };
    for (let i = 0; i < 2; i++) {
      const s = this.add(window, x + 32, y + 32 + 64 * i, 1);
      s.startAnim(i);
    }
    const small: SpriteTemplate = { sheet: "markingsMenu", palette: "markingsMenu", width: 8, height: 8, priority: 0, anims: MENU_ANIMS };
    for (let i = 0; i < MARKINGS_COUNT; i++) {
      // SpriteCB_Marking.
      this.add(small, x + 32, y + 16 + 16 * i, 0).callback = (s) => {
        const anim = 2 * i + (this.marks[i] ? 1 : 0);
        if (s.animNum !== anim) s.startAnim(anim);
      };
    }
    const text = this.add({ ...small, width: 32, height: 32 }, x + 32, y + 80, 0);
    text.startAnim(ANIM_TEXT);
    // Drawn 32×32, centered as 32×16.
    text.centerToCornerX = -16;
    text.centerToCornerY = -8;
    const cursor = this.add(small, x + 12, y + 16, 0);
    cursor.startAnim(ANIM_CURSOR);
    cursor.callback = (s) => {
      s.y = 16 * this.cursorPos + y + 16;
    };
  }

  private add(template: SpriteTemplate, x: number, y: number, subpriority: number): Sprite {
    const s = this.flow.gba.sprites.create(template, x, y, subpriority)!;
    this.sprites.push(s);
    return s;
  }

  /** HandleMonMarkingsMenuInput: false once it closes (`markings` changed only by OK). */
  update(): boolean {
    const { flow } = this;
    const { input } = flow.gba;
    if (input.isPressed(Button.Up)) {
      flow.play("se_select");
      if (--this.cursorPos < 0) this.cursorPos = SELECTION_CANCEL;
      return true;
    }
    if (input.isPressed(Button.Down)) {
      flow.play("se_select");
      if (++this.cursorPos > SELECTION_CANCEL) this.cursorPos = 0;
      return true;
    }
    if (input.isPressed(Button.A)) {
      flow.play("se_select");
      if (this.cursorPos === SELECTION_OK) {
        this.markings = this.marks.reduce((m, on, i) => m | (on ? 1 << i : 0), 0);
        return false;
      }
      if (this.cursorPos === SELECTION_CANCEL) return false;
      this.marks[this.cursorPos] = !this.marks[this.cursorPos];
      return true;
    }
    if (input.isPressed(Button.B)) {
      flow.play("se_select");
      return false;
    }
    return true;
  }

  /** FreeMonMarkingsMenu. */
  destroy(): void {
    for (const s of this.sprites) this.flow.gba.sprites.destroy(s);
  }
}
