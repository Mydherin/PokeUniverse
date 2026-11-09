// MOVE ITEMS' held item icons (pokemon_storage_system_misc.c): the item of the Pokémon under the
// hand, the one in the hand, and one on its way; three sprites at most, as in FireRed.

import type { AffineCmd, Sprite, SpriteCallback } from "../../gba/sprites";
import { SIN } from "../../gba/trig";
import { iconTiles } from "../common";
import type { Flow } from "../flow";
import { Area, BOX_COLUMNS } from "./cursor";

const MAX_ICONS = 3;
/** Where an icon is: a box or party slot, or the hand (FireRed's CURSOR_AREA_BOX_TITLE). */
const HAND = Area.Title;

const ANIM_APPEAR = 1;
const ANIM_DISAPPEAR = 2;
const ANIM_PICK_UP = 3;
const ANIM_PUT_DOWN = 4;
const ANIM_PUT_AWAY = 5;
const ANIM_LARGE = 6;
/** sAffineAnims_ItemIcon: a frame of duration 0 sets the scale. */
const AFFINE_ANIMS: AffineCmd[][] = [
  [{ xScale: 128, yScale: 128, duration: 0 }, "end"],
  [{ xScale: 88, yScale: 88, duration: 0 }, { xScale: 5, yScale: 5, duration: 8 }, "end"],
  [{ xScale: 128, yScale: 128, duration: 0 }, { xScale: -5, yScale: -5, duration: 8 }, "end"],
  [{ xScale: 128, yScale: 128, duration: 0 }, { xScale: 10, yScale: 10, duration: 12 }, { xScale: 256, yScale: 256, duration: 0 }, "end"],
  [{ xScale: 256, yScale: 256, duration: 0 }, { xScale: -10, yScale: -10, duration: 12 }, { xScale: 128, yScale: 128, duration: 0 }, "end"],
  [{ xScale: 256, yScale: 256, duration: 0 }, { xScale: -5, yScale: -5, duration: 16 }, "end"],
  [{ xScale: 256, yScale: 256, duration: 0 }, "end"],
];
/** The flights to and from the hand: 12 frames of (10, 21) sixteenths of a pixel. */
const FLIGHT_FRAMES = 12;
const FLIGHT_DX = 10;
const FLIGHT_DY = 21;

interface Icon {
  sprite: Sprite;
  active: boolean;
  area: Area;
  pos: number;
  /** A callback still running (anything but standing still or following the hand). */
  moving: boolean;
  /** Which art load this icon waits for. */
  request: number;
}

const idle: SpriteCallback = () => {};

export class ItemIcons {
  private readonly icons: Icon[] = [];
  private requests = 0;

  /** `hand`: SpriteCB_ItemIcon_SetPosToCursor's point and priority. */
  constructor(
    private readonly flow: Flow,
    private readonly hand: () => [number, number, number],
  ) {
    const { gba } = flow;
    // CreateItemIconSprites.
    for (let i = 0; i < MAX_ICONS; i++) {
      const tag = `storageItemIcon${i}`;
      gba.sprites.loadSheet(tag, new Uint8Array(32 * 32 / 2));
      gba.palettes.loadSpritePalette(tag, new Uint16Array(16));
      const sprite = gba.sprites.create({ sheet: tag, palette: tag, width: 32, height: 32, priority: 1, affineNormal: true, affineAnims: AFFINE_ANIMS }, 0, 0, 11)!;
      sprite.invisible = true;
      this.icons.push({ sprite, active: false, area: Area.Box, pos: 0, moving: false, request: 0 });
    }
  }

  /** Starts loading items' art, so their icons show without waiting. */
  preload(items: readonly number[]): void {
    for (const item of new Set(items)) if (item) void this.flow.assets.itemIcon(item).catch(() => {});
  }

  /** IsItemIconAnimActive. */
  get busy(): boolean {
    return this.icons.some((i) => i.active && ((!i.sprite.affineEnded && i.sprite.affineBeginning) || i.moving));
  }

  /** TryLoadItemIconAtPos: the item of the Pokémon there grows in (none for no item). */
  showAt(area: Area, pos: number, item: number): void {
    if (!item || (area !== Area.Box && area !== Area.Party) || this.find(area, pos)) return;
    const icon = this.take();
    if (!icon) return;
    this.place(icon, area, pos);
    this.load(icon, item);
    icon.sprite.startAffineAnim(ANIM_APPEAR);
    this.setActive(icon, true);
  }

  /** TryHideItemIconAtPos: shrinks away. */
  hideAt(area: Area, pos: number): void {
    if (area !== Area.Box && area !== Area.Party) return;
    const icon = this.find(area, pos);
    if (!icon) return;
    icon.sprite.startAffineAnim(ANIM_DISAPPEAR);
    this.waitAnim(icon);
  }

  /** Item_FromMonToMoving: TAKE, it grows and flies to the hand. */
  toHand(area: Area, pos: number): void {
    const icon = this.find(area, pos);
    if (!icon) return;
    icon.sprite.startAffineAnim(ANIM_PICK_UP);
    this.flyToHand(icon, false);
    icon.area = HAND;
    icon.pos = 0;
  }

  /** InitItemIconInCursor: back from the bag with an item chosen, already in the hand. */
  inHand(item: number): void {
    const icon = this.take();
    if (!icon) return;
    this.load(icon, item);
    icon.sprite.startAffineAnim(ANIM_LARGE);
    icon.area = HAND;
    icon.pos = 0;
    this.followHand(icon);
    this.setActive(icon, true);
  }

  /** Item_SwitchMonsWithMoving: the two pass each other, the slot's to the hand. */
  swap(area: Area, pos: number): void {
    const there = this.find(area, pos);
    const held = this.find(HAND, 0);
    if (there) {
      there.sprite.startAffineAnim(ANIM_PICK_UP);
      this.flyToHand(there, true);
    }
    if (held) {
      held.sprite.startAffineAnim(ANIM_PUT_DOWN);
      this.flyToMon(held, area, pos, true);
    }
  }

  /** Item_GiveMovingToMon: shrinks as it flies down to the Pokémon. */
  give(area: Area, pos: number): void {
    const held = this.find(HAND, 0);
    if (!held) return;
    held.sprite.startAffineAnim(ANIM_PUT_DOWN);
    this.flyToMon(held, area, pos, false);
  }

  /** Item_TakeMons: BAG, it shrinks away from the Pokémon. */
  toBag(area: Area, pos: number): void {
    this.hideAt(area, pos);
  }

  /** MoveItemFromCursorToBag: the hand's shrinks away. */
  handToBag(): void {
    const held = this.find(HAND, 0);
    if (!held) return;
    held.sprite.startAffineAnim(ANIM_PUT_AWAY);
    this.waitAnim(held);
  }

  /** The hand's item gone at once (the bag took it while the screen was away, or mic-core refused). */
  dropHand(): void {
    const held = this.find(HAND, 0);
    if (held) this.setActive(held, false);
  }

  /** Every icon gone at once (mic-core refused a change the screen showed). */
  clear(): void {
    for (const icon of this.icons) this.setActive(icon, false);
  }

  /** MoveHeldItemWithPartyMenu: a party icon slides up with the closing panel. */
  hideParty(): void {
    for (const icon of this.icons) {
      if (!icon.active || icon.area !== Area.Party) continue;
      icon.moving = true;
      icon.sprite.callback = (s) => {
        s.y -= 8;
        if (s.y + s.y2 >= -16) return;
        s.callback = idle;
        icon.moving = false;
        this.setActive(icon, false);
      };
    }
  }

  private find(area: Area, pos: number): Icon | null {
    return this.icons.find((i) => i.active && i.area === area && i.pos === pos) ?? null;
  }

  /** GetNewItemIconIdx. */
  private take(): Icon | null {
    const icon = this.icons.find((i) => !i.active) ?? null;
    if (icon) icon.active = true;
    return icon;
  }

  private setActive(icon: Icon, on: boolean): void {
    icon.active = on;
    icon.sprite.invisible = !on;
    if (!on) {
      icon.moving = false;
      icon.sprite.callback = idle;
      icon.request = ++this.requests;
    }
  }

  /** SetItemIconPosition. */
  private place(icon: Icon, area: Area, pos: number): void {
    const s = icon.sprite;
    if (area === Area.Box) {
      s.x = 24 * (pos % BOX_COLUMNS) + 112;
      s.y = 24 * Math.trunc(pos / BOX_COLUMNS) + 56;
      s.priority = 2;
    } else if (area === Area.Party) {
      [s.x, s.y] = pos === 0 ? [116, 76] : [164, 24 * (pos - 1) + 28];
      s.priority = 1;
    }
    icon.area = area;
    icon.pos = pos;
  }

  /** LoadItemIconGfx: the 24×24 icon at the top left of the 32×32 sprite, shown once loaded. */
  private load(icon: Icon, item: number): void {
    const { gba, assets } = this.flow;
    const request = ++this.requests;
    icon.request = request;
    icon.sprite.tiles = new Uint8Array(32 * 32 / 2);
    void assets.itemIcon(item).then(
      (art) => {
        if (icon.request !== request) return;
        icon.sprite.tiles = iconTiles(art.image!);
        gba.palettes.load(art.palette, 256 + (icon.sprite.paletteNum & 15) * 16, 16);
      },
      () => {},
    );
  }

  /** SpriteCB_ItemIcon_WaitAnim: gone once its anim ends. */
  private waitAnim(icon: Icon): void {
    icon.moving = true;
    icon.sprite.callback = (s) => {
      if (!s.affineEnded) return;
      s.callback = idle;
      this.setActive(icon, false);
    };
  }

  /** SpriteCB_ItemIcon_SetPosToCursor. */
  private followHand(icon: Icon): void {
    icon.moving = false;
    icon.sprite.callback = (s) => {
      [s.x, s.y, s.priority] = this.hand();
    };
  }

  /** SpriteCB_ItemIcon_ToHand and SwapToHand (swinging out): up and left, then with the hand. */
  private flyToHand(icon: Icon, swing: boolean): void {
    icon.moving = true;
    let x = icon.sprite.x << 4;
    let y = icon.sprite.y << 4;
    let frame = 0;
    icon.sprite.callback = (s) => {
      x -= FLIGHT_DX;
      y -= FLIGHT_DY;
      s.x = x >> 4;
      s.y = y >> 4;
      if (swing) s.x2 = SIN[frame * 8] >> 4;
      if (++frame < FLIGHT_FRAMES) return;
      s.x2 = 0;
      icon.area = HAND;
      icon.pos = 0;
      this.followHand(icon);
    };
  }

  /** SpriteCB_ItemIcon_ToMon and SwapToMon (swinging the other way): down and right, onto the slot. */
  private flyToMon(icon: Icon, area: Area, pos: number, swing: boolean): void {
    icon.moving = true;
    let x = icon.sprite.x << 4;
    let y = icon.sprite.y << 4;
    let frame = 0;
    icon.sprite.callback = (s) => {
      x += FLIGHT_DX;
      y += FLIGHT_DY;
      s.x = x >> 4;
      s.y = y >> 4;
      if (swing) s.x2 = -(SIN[frame * 8] >> 4);
      if (++frame < FLIGHT_FRAMES) return;
      s.x2 = 0;
      this.place(icon, area, pos);
      s.callback = idle;
      icon.moving = false;
    };
  }
}
