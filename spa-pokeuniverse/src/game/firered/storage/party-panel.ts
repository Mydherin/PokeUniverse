// The party beside the box (pokemon_storage_system_tasks.c): the panel sliding down over the
// wallpaper with its slots and icons, and the CLOSE BOX button beside it.

import type { Pokemon } from "@pokeuniverse/contracts/party/v1/party";
import { ObjMode } from "../../gba/sprites";
import type { Background } from "../../gba/video";
import type { Flow } from "../flow";
import { ICON_STILL, MonIcon } from "../mon-icon";
import { sameMon } from "./box-view";

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
const COMPACT_STEPS = 8;

/** A party icon's place. */
function slotXY(pos: number): [number, number] {
  return pos === 0 ? [104, 64] : [152, 24 * (pos - 1) + 16];
}

/** MovePartySpriteToNextSlot: a slide in eighths of a pixel. */
interface Slide {
  icon: MonIcon;
  x: number;
  y: number;
  dx: number;
  dy: number;
  steps: number;
  to: number;
}

/** TilemapUtil_Update: part of a tilemap (`stride` wide) onto a background. */
export function putMapRect(bg: Background, map: ArrayLike<number>, stride: number, srcY: number, width: number, height: number, x: number, y: number): void {
  for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) bg.setEntry(x + col, y + row, map[(srcY + row) * stride + col]);
}

export class PartyPanel {
  private readonly map: Uint16Array;
  private icons: (MonIcon | null)[] = [];
  private slides: Slide[] = [];
  private frames = 0;
  private sliding: 1 | -1 | 0 = 0;
  /** The party as shown: without the Pokémon in the hand. */
  readonly mons: (Pokemon | null)[];
  shown: boolean;
  /** MOVE ITEMS: an icon whose Pokémon holds nothing is see-through. */
  itemMode = false;

  constructor(
    private readonly flow: Flow,
    private readonly bg: Background,
    party: readonly Pokemon[],
    shown: boolean,
  ) {
    const { assets } = flow;
    this.shown = shown;
    this.mons = [...party];
    this.map = Uint16Array.from(assets.get("storagePartyMenu").map!);
    this.updateSlots();
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

  /** How many it shows: `mons` has gaps only while it closes up. */
  get count(): number {
    return this.mons.filter((m) => m).length;
  }

  /** SetMovingMonSprite, from the party: the slot empties and its icon goes to the hand. */
  take(pos: number): MonIcon | null {
    const icon = this.icons[pos] ?? null;
    this.icons[pos] = null;
    this.mons[pos] = null;
    return icon;
  }

  /** A held item changed on the screen only (mic-core saves it when put down). */
  setItem(pos: number, item: number): void {
    const mon = this.mons[pos];
    if (!mon) return;
    this.mons[pos] = { ...mon, heldItem: item };
    this.blend(pos);
  }

  /** SetPartyMonIconObjMode, for every icon. */
  refreshBlend(): void {
    for (let pos = 0; pos < this.icons.length; pos++) this.blend(pos);
  }

  private blend(pos: number): void {
    const icon = this.icons[pos];
    if (icon) icon.sprite.mode = this.itemMode && !this.mons[pos]?.heldItem ? ObjMode.Blend : ObjMode.Normal;
  }

  /** SetPlacedMonSprite, into the party: an empty slot keeps it until it closes up. */
  put(pos: number, mon: Pokemon, icon: MonIcon): void {
    this.mons[pos] = mon;
    this.icons[pos] = icon;
    const s = icon.sprite;
    s.callback = () => {};
    [s.x, s.y] = slotXY(pos);
    s.x2 = 0;
    s.priority = 1;
    s.subpriority = 12;
    this.blend(pos);
  }

  /** CompactPartySlots, CompactPartySprites: the icons after a gap slide up to close it. */
  startCompact(): void {
    let to = 0;
    const mons: (Pokemon | null)[] = [];
    const icons: (MonIcon | null)[] = [];
    this.mons.forEach((mon, pos) => {
      if (!mon) return;
      const icon = this.icons[pos];
      if (icon && pos !== to) {
        const [x, y] = slotXY(to);
        const sx = icon.sprite.x * 8;
        const sy = icon.sprite.y * 8;
        this.slides.push({ icon, x: sx, y: sy, dx: Math.trunc((x * 8 - sx) / 8), dy: Math.trunc((y * 8 - sy) / 8), steps: COMPACT_STEPS, to });
      }
      mons[to] = mon;
      icons[to] = icon ?? null;
      to++;
    });
    this.mons.length = 0;
    this.mons.push(...mons);
    this.icons = icons;
  }

  /** UpdatePartySlotColors. */
  updateSlots(): void {
    for (let pos = 1; pos < PARTY_SIZE; pos++) this.setSlot(pos, !!this.mons[pos]);
    if (this.shown && this.sliding === 0) this.drawRows(PANEL_ROWS);
  }

  /** The party as mic-core answered (without the held one): only the slots that differ change their icons. */
  sync(party: readonly Pokemon[]): void {
    for (let pos = 0; pos < PARTY_SIZE; pos++) {
      const mon = party[pos] ?? null;
      if (sameMon(this.mons[pos], mon)) {
        this.mons[pos] = mon;
        continue;
      }
      this.flow.gba.sprites.destroy(this.icons[pos]?.sprite);
      this.icons[pos] = null;
      this.mons[pos] = mon;
      if (mon && this.shown) this.put(pos, mon, this.createIcon(mon, pos, 0));
    }
    this.mons.length = party.length;
    this.icons.length = Math.min(this.icons.length, party.length);
    this.refreshBlend();
    this.updateSlots();
  }

  /** ShowPartyMenu, HidePartyMenu or the icons closing up, each frame; false once it's over. */
  update(): boolean {
    if (this.slides.length) return this.updateSlides();
    if (this.sliding === 0) return false;
    this.frames++;
    const showing = this.sliding === 1;
    this.drawRows(showing ? HIDDEN_ROWS + this.frames : PANEL_ROWS - this.frames);
    if (!showing) for (let x = 0; x < PANEL_WIDTH; x++) this.bg.setEntry(PANEL_X + x, PANEL_ROWS - this.frames, BLANK);
    for (const icon of this.icons) if (icon) icon.sprite.y += this.sliding * SLIDE_SPEED;
    if (this.frames < SLIDE_FRAMES) return true;
    this.shown = showing;
    this.sliding = 0;
    if (!showing) {
      for (const icon of this.icons) this.flow.gba.sprites.destroy(icon?.sprite);
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

  /** SpriteCB_MovePartySpriteToNextSlot, for every sliding icon. */
  private updateSlides(): boolean {
    this.slides = this.slides.filter((m) => {
      const s = m.icon.sprite;
      if (m.steps-- !== 0) {
        m.x += m.dx;
        m.y += m.dy;
        s.x = Math.trunc(m.x / 8);
        s.y = Math.trunc(m.y / 8);
        return true;
      }
      [s.x, s.y] = slotXY(m.to);
      return false;
    });
    if (this.slides.length) return true;
    this.updateSlots();
    return false;
  }

  private createIcon(mon: Pokemon, pos: number, offsetY: number): MonIcon {
    const [x, y] = slotXY(pos);
    const icon = new MonIcon(this.flow, mon.species, x, y + offsetY, 12, 1);
    icon.setAnim(ICON_STILL);
    return icon;
  }

  /** CreatePartyMonsSprites. */
  private createIcons(offsetY: number): void {
    this.icons = this.mons.map((mon, pos) => (mon ? this.createIcon(mon, pos, offsetY) : null));
    this.refreshBlend();
  }
}
