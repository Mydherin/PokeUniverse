// The party beside the box (pokemon_storage_system_tasks.c): the panel sliding down over the
// wallpaper with its slots and icons, and the CLOSE BOX button beside it.

import type { Pokemon } from "@pokeuniverse/contracts/party/v1/party";
import type { Background } from "../../gba/video";
import type { Flow } from "../flow";
import { ICON_STILL, MonIcon } from "../mon-icon";

const PANEL_X = 10;
const PANEL_WIDTH = 12;
const PANEL_ROWS = 22;
const HIDDEN_ROWS = 2;
const SLIDE_FRAMES = 20;
const SLIDE_SPEED = 8;
const CLOSE_X = 21;
const CLOSE_WIDTH = 9;
const BLANK = 0x100;
const SLOT_WIDTH = 4;
const SLOT_HEIGHT = 3;
const PARTY_SIZE = 6;

/** TilemapUtil_Update: part of a tilemap (`stride` wide) onto a background. */
export function putMapRect(bg: Background, map: ArrayLike<number>, stride: number, srcY: number, width: number, height: number, x: number, y: number): void {
  for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) bg.setEntry(x + col, y + row, map[(srcY + row) * stride + col]);
}

export class PartyPanel {
  private readonly map: Uint16Array;
  private icons: MonIcon[] = [];
  private frames = 0;
  private sliding: 1 | -1 | 0 = 0;
  shown: boolean;

  constructor(
    private readonly flow: Flow,
    private readonly bg: Background,
    private readonly party: readonly Pokemon[],
    shown: boolean,
  ) {
    const { assets } = flow;
    this.shown = shown;
    this.map = Uint16Array.from(assets.get("storagePartyMenu").map!);
    for (let pos = 1; pos < PARTY_SIZE; pos++) this.setSlot(pos, pos < party.length);
    const close = assets.get("storageCloseBox").map!;
    if (shown) {
      this.createIcons(0);
      this.drawRows(PANEL_ROWS);
    } else this.drawRows(HIDDEN_ROWS);
    putMapRect(bg, close, CLOSE_WIDTH, 0, CLOSE_WIDTH, 2, CLOSE_X, 0);
  }

  /** SetUpDoShowPartyMenu. */
  startShow(): void {
    this.flow.play("se_win_open");
    this.createIcons(-SLIDE_FRAMES * SLIDE_SPEED);
    this.frames = 0;
    this.sliding = 1;
  }

  /** SetUpHidePartyMenu. */
  startHide(): void {
    this.flow.play("se_select");
    this.frames = 0;
    this.sliding = -1;
  }

  /** ShowPartyMenu or HidePartyMenu, each frame; false once it's over. */
  update(): boolean {
    if (this.sliding === 0) return false;
    this.frames++;
    const showing = this.sliding === 1;
    this.drawRows(showing ? HIDDEN_ROWS + this.frames : PANEL_ROWS - this.frames);
    if (!showing) for (let x = 0; x < PANEL_WIDTH; x++) this.bg.setEntry(PANEL_X + x, PANEL_ROWS - this.frames, BLANK);
    for (const icon of this.icons) icon.sprite.y += this.sliding * SLIDE_SPEED;
    if (this.frames < SLIDE_FRAMES) return true;
    this.shown = showing;
    this.sliding = 0;
    if (!showing) {
      for (const icon of this.icons) this.flow.gba.sprites.destroy(icon.sprite);
      this.icons = [];
    }
    return false;
  }

  /** SetPartySlotTilemap: the first slot always looks taken. */
  private setSlot(pos: number, filled: boolean): void {
    const slot = this.flow.assets.get(filled ? "storageSlotFilled" : "storageSlotEmpty").map!;
    const at = PANEL_WIDTH * (SLOT_HEIGHT * (pos - 1) + 1) + 7;
    for (let y = 0; y < SLOT_HEIGHT; y++) for (let x = 0; x < SLOT_WIDTH; x++) this.map[at + y * PANEL_WIDTH + x] = slot[y * SLOT_WIDTH + x];
  }

  /** The panel's last `rows` rows, from the screen's top: the rest still hides above it. */
  private drawRows(rows: number): void {
    putMapRect(this.bg, this.map, PANEL_WIDTH, PANEL_ROWS - rows, PANEL_WIDTH, rows, PANEL_X, 0);
  }

  /** CreatePartyMonsSprites. */
  private createIcons(offsetY: number): void {
    this.party.forEach((mon, i) => {
      const [x, y] = i === 0 ? [104, 64] : [152, 24 * (i - 1) + 16];
      const icon = new MonIcon(this.flow, mon.species, x, y + offsetY, 12, 1);
      icon.setAnim(ICON_STILL);
      this.icons.push(icon);
    });
  }
}
