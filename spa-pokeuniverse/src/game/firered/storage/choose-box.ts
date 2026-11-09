// The choose-box popup (pokemon_storage_system_menu.c's ChooseBoxMenu): DEPOSIT's and JUMP's box picker.

import type { BoxView } from "@pokeuniverse/contracts/party/v1/box";
import { Button } from "../../gba/input";
import type { AnimCmd, Sprite, SpriteTemplate } from "../../gba/sprites";
import { decimalText, EOS, FontId, NumberMode, Window, type Text } from "../../gba/text";
import type { Background } from "../../gba/video";
import type { Flow } from "../flow";
import { ARROW_ANIMS, BOX_COUNT } from "./box-view";
import { BOX_SLOTS, STORAGE_SPRITE_PALETTE } from "./cursor";

/** HandleBoxChooseSelectionInput's answers besides a box (1 to 14). */
export const BOX_NONE_CHOSEN = -1;
export const BOX_CANCELED = -2;

const CENTER_SHEET = "storageChooseBoxCenter";
const CORNERS_SHEET = "storageChooseBoxCorners";
const SUBPRIORITY = 3;
const BOX_NAME_LENGTH = 8;
/** PrintStringToBufferCopyNow's colors: TEXT_COLOR_RED, TEXT_DYNAMIC_COLOR_6, TEXT_DYNAMIC_COLOR_5. */
const TEXT_COLORS = [4, 15, 14] as const;
const CHAR_SPACE = 0x00;

const CORNER_ANIMS: AnimCmd[][] = [0, 4, 6, 10].map((image) => [{ image, duration: 5 }, "end"]);

/** ChooseBoxMenu: the box's name and count between two bobbing arrows; Left and Right wrap through the boxes. */
export class ChooseBoxMenu {
  private readonly sprites: Sprite[] = [];
  /** The center sheet's tiles, which the text is printed into. */
  private readonly tiles: Uint8Array;
  private box: number;

  /** LoadChooseBoxMenuGfx and ChooseBoxMenu_CreateSprites, starting on `box` (1 to 14). */
  constructor(
    private readonly flow: Flow,
    private readonly bg: Background,
    private readonly view: BoxView,
    box: number,
    /** The box the held Pokémon was taken from, counted without it (FireRed takes it out); 0 for none. */
    private readonly heldFrom: number,
  ) {
    const { sprites } = flow.gba;
    this.box = box;
    this.tiles = flow.assets.get(CENTER_SHEET).tiles.slice();
    sprites.loadSheet(CENTER_SHEET, this.tiles);
    sprites.loadSheet(CORNERS_SHEET, flow.assets.get(CORNERS_SHEET).tiles);
    const center: SpriteTemplate = { sheet: CENTER_SHEET, palette: STORAGE_SPRITE_PALETTE, width: 64, height: 64, priority: 0 };
    this.sprites.push(sprites.create(center, 160, 96, 0)!);
    // Top-left, bottom-left, top-right, bottom-right; the bottom ones are 8×16.
    for (let i = 0; i < 4; i++) {
      const corner: SpriteTemplate = { sheet: CORNERS_SHEET, palette: STORAGE_SPRITE_PALETTE, width: 8, height: i & 1 ? 16 : 32, priority: 0, anims: CORNER_ANIMS };
      const s = sprites.create(corner, i & 2 ? 196 : 124, i & 1 ? 112 : 80, SUBPRIORITY)!;
      s.startAnim(i);
      this.sprites.push(s);
    }
    // CreateChooseBoxArrows, SpriteCB_ChooseBoxArrow.
    const arrow: SpriteTemplate = { sheet: "storageArrow", palette: STORAGE_SPRITE_PALETTE, width: 8, height: 16, priority: 0, anims: ARROW_ANIMS };
    for (let i = 0; i < 2; i++) {
      const s = sprites.create(arrow, 72 * i + 124, 88, SUBPRIORITY)!;
      s.startAnim(i);
      const step = i === 0 ? -1 : 1;
      let timer = 0;
      let moves = 0;
      s.callback = () => {
        if (++timer <= 3) return;
        timer = 0;
        s.x2 += step;
        if (++moves > 5) {
          moves = 0;
          s.x2 = 0;
        }
      };
      this.sprites.push(s);
    }
    this.printBox();
    this.print(flow.encode("/30"), 5, 3);
  }

  /** HandleBoxChooseSelectionInput: the box chosen, BOX_CANCELED or BOX_NONE_CHOSEN. */
  update(): number {
    const { flow } = this;
    const { input } = flow.gba;
    if (input.isPressed(Button.B)) {
      flow.play("se_select");
      return BOX_CANCELED;
    }
    if (input.isPressed(Button.A)) {
      flow.play("se_select");
      return this.box;
    }
    if (input.isPressed(Button.Left) || input.isPressed(Button.Right)) {
      flow.play("se_select");
      const step = input.isPressed(Button.Left) ? BOX_COUNT - 1 : 1;
      this.box = ((this.box - 1 + step) % BOX_COUNT) + 1;
      this.printBox();
    }
    return BOX_NONE_CHOSEN;
  }

  /** How many Pokémon a box holds, as the popup counts them. */
  count(box: number): number {
    return (this.view.boxes[box - 1]?.count ?? 0) - (box === this.heldFrom ? 1 : 0);
  }

  isFull(box: number): boolean {
    return this.count(box) >= BOX_SLOTS;
  }

  /** ChooseBoxMenu_DestroySprites and FreeBoxSelectionPopupSpriteGfx. */
  destroy(): void {
    const { sprites } = this.flow.gba;
    for (const s of this.sprites) sprites.destroy(s);
    this.sprites.length = 0;
    sprites.freeSheet(CENTER_SHEET);
    sprites.freeSheet(CORNERS_SHEET);
  }

  /** ChooseBoxMenu_PrintBoxNameAndCount: the name padded with spaces, the count right-aligned. */
  private printBox(): void {
    const name = [...this.flow.encode(this.view.boxes[this.box - 1]?.name ?? "")].filter((c) => c !== EOS).slice(0, BOX_NAME_LENGTH);
    while (name.length < BOX_NAME_LENGTH) name.push(CHAR_SPACE);
    this.print(name, 0, 1);
    this.print(decimalText(this.count(this.box), NumberMode.RightAlign, 2), 3, 3);
  }

  /** ChooseBoxMenu_PrintTextToSprite: one tile per character, two rows tall, at tile (x, y) of the 64×64 sheet. */
  private print(text: Text, x: number, y: number): void {
    // StringLength_Multibyte: up to EOS.
    const end = text.indexOf(EOS);
    const width = end < 0 ? text.length : end;
    const win = new Window(this.bg, { left: 0, top: 0, width, height: 2, palette: 0, baseBlock: 0 });
    win.fill(TEXT_COLORS[0]);
    win.print(this.flow.fonts[FontId.NormalCopy1], 0, 2, TEXT_COLORS, text);
    for (let row = 0; row < 2; row++)
      for (let col = 0; col < width; col++) {
        const tile = ((y + row) * 8 + x + col) * 64;
        for (let py = 0; py < 8; py++)
          for (let px = 0; px < 8; px++) this.tiles[tile + py * 8 + px] = win.pixels[(row * 8 + py) * win.stride + col * 8 + px];
      }
  }
}
