// The shown box (pokemon_storage_system_graphics.c): wallpaper, icons, title and arrows, and the
// slide to the next box. mic-core holds the boxes, so the next one's answer and art are in hand
// before the slide starts; FireRed has them at once.

import type { BoxView } from "@pokeuniverse/contracts/party/v1/box";
import type { Pokemon } from "@pokeuniverse/contracts/party/v1/party";
import { toTiles } from "../../gba/assets";
import { ObjMode, type AnimCmd, type Sprite, type SpriteTemplate } from "../../gba/sprites";
import { FontId, Window } from "../../gba/text";
import { RGB_WHITE, type Background } from "../../gba/video";
import { copyTiles } from "../menu";
import type { Flow } from "../flow";
import type { Graphic } from "../manifest";
import { MonIcon, ICON_STILL } from "../mon-icon";
import { BOX_COLUMNS, BOX_ROWS, BOX_SLOTS, STORAGE_SPRITE_PALETTE } from "./cursor";

export const BOX_COUNT = 14;
/** MovePokemon's `to` slot for DEPOSIT: mic-core picks the box's first free slot. */
export const FIRST_FREE = BOX_SLOTS;
const SCROLL_SPEED = 6;
const SCROLL_FRAMES = 32;
const WALLPAPER_WIDTH = 20;
const WALLPAPER_HEIGHT = 18;
const WALLPAPER_Y = 2;
/** TrimOldWallpaper's columns past the screen: all but what shows, so the new tiles can't show under the old map. */
const TRIM_COLUMNS = 44;
const WALLPAPER_PALETTE = 4;
const TITLE_Y = 28;
const TITLE_WIDTH = 64;
const TITLE_MOVE = 192;
const TITLE_PALETTE = "storageTitle";
const ARROW_Y = 28;
const ICON_MIN_X = 68;
const ICON_MAX_X = 252;
const ICON_COLUMN_MIN_X = 64;

const TITLE_ANIMS: AnimCmd[][] = [
  [{ image: 0, duration: 5 }, "end"],
  [{ image: 8, duration: 5 }, "end"],
];
export const ARROW_ANIMS: AnimCmd[][] = [
  [{ image: 0, duration: 5 }, "end"],
  [{ image: 2, duration: 5 }, "end"],
];

const enum ArrowState {
  Still,
  Bounce,
  Slide,
  SlideBack,
}

interface Arrow {
  sprite: Sprite;
  state: ArrowState;
  timer: number;
  moves: number;
  jump: number;
  speed: number;
}

/** A box icon, scrolling out at `speed` until off, or in until `distance` runs out. */
interface BoxIcon {
  icon: MonIcon;
  speed: number;
  incoming: boolean;
  distance: number;
  destX: number;
}

/** Fetches what a box needs to be shown: its icons and wallpaper. */
export async function loadBoxArt(flow: Flow, view: BoxView): Promise<Graphic> {
  const { assets } = flow;
  const [wallpaper] = await Promise.all([assets.wallpaper(view.boxes[view.box - 1]?.wallpaper ?? 0), ...view.pokemon.map((p) => assets.pokemonArt(p.pokemon?.species ?? 0).catch(() => null))]);
  return wallpaper;
}

/** A Pokémon's place on mic-core: box 0 is the party. */
export interface Place {
  box: number;
  slot: number;
}

/** The same Pokémon: mic-core sends no ids, the personality tells them apart. */
export function sameMon(a: Pokemon | null | undefined, b: Pokemon | null | undefined): boolean {
  return a?.species === b?.species && a?.personality === b?.personality;
}

export class BoxArea {
  view: BoxView;
  /** The held Pokémon's place on mic-core, which shows empty here (FireRed takes it out at once). */
  hidden: Place | null;
  /** MOVE ITEMS: an icon whose Pokémon holds nothing is see-through. */
  itemMode = false;
  private readonly mons: (Pokemon | null)[] = [];
  private readonly icons: (BoxIcon | null)[] = new Array<BoxIcon | null>(BOX_SLOTS).fill(null);
  private readonly arrows: Arrow[] = [];
  private titles: Sprite[] = [];
  private oldTitles: Sprite[] = [];
  private titleTarget = 0;
  private bgX = 0;
  private offset = 0;
  private scrollSpeed = 0;
  private scrollTimer = 0;
  private iconScroll: { state: number; direction: number; column: number; pos: number; distance: number; speed: number; incoming: number } | null = null;

  constructor(
    private readonly flow: Flow,
    private readonly bg: Background,
    view: BoxView,
    wallpaper: Graphic,
    hidden: Place | null,
  ) {
    const { gba } = flow;
    this.view = view;
    this.hidden = hidden;
    this.setMons(view);
    const palette = new Uint16Array(16);
    palette[14] = 7 | (7 << 5) | (7 << 10);
    palette[15] = 0x7fff;
    gba.palettes.loadSpritePalette(TITLE_PALETTE, palette);
    gba.sprites.loadSheet("storageArrow", flow.assets.get("storageArrow").tiles);
    this.drawWallpaper(wallpaper, 0);
    this.titles = this.createTitle(0);
    for (let col = 0; col < BOX_COLUMNS; col++) this.createColumn(col, 0, 0);
    for (let i = 0; i < 2; i++) this.createArrow(i);
  }

  /** What's in a slot of the shown box, or null. */
  monAt(slot: number): Pokemon | null {
    return this.mons[slot] ?? null;
  }

  /** The box's Pokémon without its gaps, as the summary pages through them, each with its slot. */
  present(): { slots: number[]; mons: Pokemon[] } {
    const slots: number[] = [];
    const mons: Pokemon[] = [];
    this.mons.forEach((mon, slot) => {
      if (mon) {
        slots.push(slot);
        mons.push(mon);
      }
    });
    return { slots, mons };
  }

  /** SetMovingMonSprite, from the box: the slot empties and its icon goes to the hand. */
  /** GetFirstFreeBoxSpot on the shown box (the held one's slot is free): -1 when full. */
  firstFree(): number {
    for (let slot = 0; slot < BOX_SLOTS; slot++) if (!this.mons[slot]) return slot;
    return -1;
  }

  take(slot: number): MonIcon | null {
    const icon = this.icons[slot]?.icon ?? null;
    this.icons[slot] = null;
    delete this.mons[slot];
    return icon;
  }

  /** A held item changed on the screen only (FireRed sets it at once; mic-core saves it when put down). */
  setItem(slot: number, item: number): void {
    const mon = this.mons[slot];
    if (!mon) return;
    this.mons[slot] = { ...mon, heldItem: item };
    this.blend(slot);
  }

  /** SetBoxMonIconObjMode, for every icon. */
  refreshBlend(): void {
    for (let slot = 0; slot < BOX_SLOTS; slot++) this.blend(slot);
  }

  private blend(slot: number): void {
    const icon = this.icons[slot]?.icon;
    if (icon) icon.sprite.mode = this.itemMode && !this.mons[slot]?.heldItem ? ObjMode.Blend : ObjMode.Normal;
  }

  /** SetPlacedMonSprite, into the box. */
  put(slot: number, mon: Pokemon, icon: MonIcon): void {
    const column = slot % BOX_COLUMNS;
    const destX = 24 * column + 100;
    this.mons[slot] = mon;
    this.icons[slot] = { icon, speed: 0, incoming: false, distance: 0, destX };
    const s = icon.sprite;
    s.callback = () => {};
    s.x = destX;
    s.y = 24 * Math.trunc(slot / BOX_COLUMNS) + 44;
    s.x2 = 0;
    s.priority = 2;
    s.subpriority = 19 - column;
    this.blend(slot);
  }

  /** The box as mic-core answered: only the slots that differ change their icons. */
  sync(view: BoxView): void {
    if (view.box !== this.view.box) return;
    this.view = view;
    const old = [...this.mons];
    this.setMons(view);
    for (let slot = 0; slot < BOX_SLOTS; slot++) {
      if (sameMon(old[slot], this.mons[slot])) continue;
      const box = this.icons[slot];
      if (box) this.flow.gba.sprites.destroy(box.icon.sprite);
      this.icons[slot] = null;
      const mon = this.mons[slot];
      if (!mon) continue;
      const column = slot % BOX_COLUMNS;
      const icon = new MonIcon(this.flow, mon.species, 0, 0, 19 - column, 2);
      icon.setAnim(ICON_STILL);
      this.put(slot, mon, icon);
    }
    this.refreshBlend();
  }

  /** AnimateBoxScrollArrows. */
  setArrowsBouncing(on: boolean): void {
    for (const a of this.arrows) {
      a.state = on ? ArrowState.Bounce : ArrowState.Still;
      a.timer = 0;
      a.moves = 0;
    }
  }

  /** BeginBoxScroll: `direction` is 1 for the next box, -1 for the one before. */
  startScroll(view: BoxView, wallpaper: Graphic, direction: number): void {
    this.view = view;
    this.setMons(view);
    this.scrollSpeed = direction * SCROLL_SPEED;
    this.scrollTimer = SCROLL_FRAMES;
    this.drawWallpaper(wallpaper, direction);
    this.oldTitles = this.titles;
    this.titles = this.createTitle(direction);
    this.startIconScroll(direction);
    this.startArrowSlide(direction);
  }

  /** DoWallpaperGfxChange's first fade: the wallpaper and title go white. */
  startWallpaperChange(): void {
    this.flow.gba.palettes.beginFade(this.wallpaperPalettes(), 1, 0, 16, RGB_WHITE);
  }

  /** Once white: the box's wallpaper as `view` has it, then back from white. */
  endWallpaperChange(view: BoxView, wallpaper: Graphic): void {
    this.view = view;
    this.drawWallpaper(wallpaper, 0);
    this.flow.gba.palettes.beginFade(this.wallpaperPalettes(), 1, 16, 0, RGB_WHITE);
  }

  /** wallpaperPalBits: BG palettes 4-9 and the title's. */
  private wallpaperPalettes(): number {
    return 0x3f0 | ((1 << 16) << this.flow.gba.palettes.spritePaletteSlot(TITLE_PALETTE));
  }

  /** ScrollToBox's last state, each frame; false once it's over. */
  update(): boolean {
    const icons = this.updateIconScroll();
    if (this.scrollTimer === 0) return icons;
    this.bgX += this.scrollSpeed;
    this.bg.x = this.bgX << 8;
    for (const s of this.oldTitles) s.x -= this.scrollSpeed;
    for (const s of this.titles) s.x -= this.scrollSpeed;
    if (--this.scrollTimer !== 0) return true;
    for (const s of this.oldTitles) this.flow.gba.sprites.destroy(s);
    this.oldTitles = [];
    this.titles.forEach((s, i) => (s.x = this.titleTarget + i * 32));
    this.stopArrowSlide();
    return icons;
  }

  private setMons(view: BoxView): void {
    this.mons.length = 0;
    const { hidden } = this;
    for (const p of view.pokemon) if (p.pokemon && !(hidden?.box === view.box && hidden.slot === p.slot)) this.mons[p.slot] = p.pokemon;
  }

  /** LoadWallpaperGfx, DrawWallpaper: the other tile bank and palettes, beside the shown one. */
  private drawWallpaper(wallpaper: Graphic, direction: number): void {
    const { bg } = this;
    const { palettes } = this.flow.gba;
    const scrollTile = this.bgX >> 3;
    if (direction !== 0) {
      this.offset ^= 1;
      for (let i = 0; i < TRIM_COLUMNS; i++) {
        const x = (scrollTile + 30 + i) & 63;
        for (let y = 0; y < WALLPAPER_HEIGHT; y++) bg.setEntry(x, y + WALLPAPER_Y, 0);
      }
    }
    copyTiles(bg, wallpaper.tiles, 256 * this.offset);
    palettes.load(wallpaper.palette, (WALLPAPER_PALETTE + this.offset * 2) * 16, 32);
    const left = scrollTile + 10 + direction * 24;
    const map = wallpaper.map!;
    for (let y = 0; y < WALLPAPER_HEIGHT; y++)
      for (let x = 0; x < WALLPAPER_WIDTH; x++) {
        const entry = map[y * WALLPAPER_WIDTH + x];
        const tile = (entry & 0x3ff) + (this.offset << 8);
        const palette = (entry >> 12) + this.offset * 2 + 3;
        bg.setEntry((left + x) & 63, y + WALLPAPER_Y, (entry & 0x0c00) | tile | (palette << 12));
      }
  }

  /** CreateIncomingBoxTitle: its name, centered, two sprites; from the side when scrolling. */
  private createTitle(direction: number): Sprite[] {
    const { flow, view } = this;
    const { gba } = flow;
    const font = flow.fonts[FontId.Normal];
    const name = flow.encode(view.boxes[view.box - 1]?.name ?? "");
    const buffer = new Window(this.bg, { left: 0, top: 0, width: TITLE_WIDTH / 8, height: 2, palette: 0, baseBlock: 0 });
    buffer.print(font, 0, 0, [0, 14, 15], name);
    const tag = `storageTitle${this.offset}`;
    gba.sprites.loadSheet(tag, toTiles({ width: TITLE_WIDTH, height: 16, pixels: buffer.pixels, palette: null }, [4, 2]));
    const template: SpriteTemplate = { sheet: tag, palette: TITLE_PALETTE, width: 32, height: 16, priority: 2, anims: TITLE_ANIMS };
    this.titleTarget = 240 - TITLE_WIDTH - Math.trunc(font.width(name) / 2);
    return [0, 1].map((i) => {
      const s = gba.sprites.create(template, this.titleTarget + i * 32 + direction * TITLE_MOVE, TITLE_Y, 24)!;
      s.startAnim(i);
      return s;
    });
  }

  /** CreateBoxMonIconsInColumn: how many came. */
  private createColumn(column: number, distance: number, speed: number): number {
    const destX = 24 * column + 100;
    let count = 0;
    for (let row = 0; row < BOX_ROWS; row++) {
      const slot = row * BOX_COLUMNS + column;
      const mon = this.mons[slot];
      if (!mon) continue;
      const icon = new MonIcon(this.flow, mon.species, destX - (distance + 1) * speed, 24 * row + 44, 19 - column, 2);
      icon.setAnim(ICON_STILL);
      if (speed === 0) icon.sprite.x = destX;
      this.icons[slot] = { icon, speed, incoming: speed !== 0, distance, destX };
      this.blend(slot);
      count++;
    }
    return count;
  }

  private destroyColumn(column: number): void {
    for (let row = 0; row < BOX_ROWS; row++) {
      const slot = row * BOX_COLUMNS + column;
      const box = this.icons[slot];
      if (box) this.flow.gba.sprites.destroy(box.icon.sprite);
      this.icons[slot] = null;
    }
  }

  /** InitBoxMonIconScroll, StartBoxMonIconsScrollOut. */
  private startIconScroll(direction: number): void {
    const speed = -direction * SCROLL_SPEED;
    const column = direction > 0 ? 0 : BOX_COLUMNS - 1;
    this.iconScroll = { state: 0, direction, column, pos: 24 * column + 100, distance: SCROLL_FRAMES, speed, incoming: 0 };
    for (const box of this.icons) if (box) box.speed = speed;
  }

  /** UpdateBoxMonIconScroll, and the icons' scroll callbacks: columns leave and arrive one by one, so never more than the screen holds. */
  private updateIconScroll(): boolean {
    const s = this.iconScroll;
    if (!s) return false;
    if (s.distance !== 0) s.distance--;
    for (const box of this.icons) {
      if (!box || box.speed === 0) continue;
      const { sprite } = box.icon;
      if (!box.incoming) {
        sprite.x += box.speed;
        if (sprite.x <= ICON_MIN_X || sprite.x >= ICON_MAX_X) box.speed = 0;
      } else if (box.distance !== 0) {
        box.distance--;
        sprite.x += box.speed;
      } else {
        sprite.x = box.destX;
        box.speed = 0;
        box.incoming = false;
        s.incoming--;
      }
    }
    switch (s.state) {
      case 0:
        s.pos += s.speed;
        if (s.pos <= ICON_COLUMN_MIN_X || s.pos >= ICON_MAX_X) {
          this.destroyColumn(s.column);
          s.pos += s.direction * 24;
          s.state = 1;
        }
        break;
      case 1:
        s.pos += s.speed;
        s.incoming += this.createColumn(s.column, s.distance, s.speed);
        if ((s.direction > 0 && s.column === BOX_COLUMNS - 1) || (s.direction < 0 && s.column === 0)) {
          s.state = 2;
        } else {
          s.column += s.direction;
          s.state = 0;
        }
        break;
      default:
        if (s.incoming === 0) {
          this.iconScroll = null;
          return false;
        }
    }
    return true;
  }

  private createArrow(i: number): void {
    const { sprites } = this.flow.gba;
    const template: SpriteTemplate = { sheet: "storageArrow", palette: STORAGE_SPRITE_PALETTE, width: 8, height: 16, priority: 2, anims: ARROW_ANIMS };
    const sprite = sprites.create(template, 92 + i * 136, ARROW_Y, 22)!;
    sprite.startAnim(i);
    const arrow: Arrow = { sprite, state: ArrowState.Still, timer: 0, moves: 0, jump: 0, speed: i === 0 ? -1 : 1 };
    sprite.callback = () => this.updateArrow(arrow);
    this.arrows.push(arrow);
  }

  /** SpriteCB_BoxScrollArrow. */
  private updateArrow(a: Arrow): void {
    const s = a.sprite;
    switch (a.state) {
      case ArrowState.Still:
        s.x2 = 0;
        break;
      case ArrowState.Bounce:
        if (++a.timer > 3) {
          a.timer = 0;
          s.x2 += a.speed;
          if (++a.moves > 5) {
            a.moves = 0;
            s.x2 = 0;
          }
        }
        break;
      case ArrowState.Slide:
        s.x -= this.scrollSpeed;
        if (s.x <= 72 || s.x >= 248) s.invisible = true;
        if (--a.timer === 0) {
          s.x = a.jump;
          s.invisible = false;
          a.state = ArrowState.SlideBack;
        }
        break;
      case ArrowState.SlideBack:
        s.x -= this.scrollSpeed;
        break;
    }
  }

  private startArrowSlide(direction: number): void {
    this.arrows.forEach((a, i) => {
      a.sprite.x2 = 0;
      a.state = ArrowState.Slide;
      a.timer = (direction < 0) === (i === 0) ? 29 : 5;
      a.jump = direction < 0 ? 72 : 248;
    });
  }

  private stopArrowSlide(): void {
    this.arrows.forEach((a, i) => {
      a.sprite.x = 136 * i + 92;
      a.sprite.x2 = 0;
      a.sprite.invisible = false;
    });
    this.setArrowsBouncing(true);
  }
}
