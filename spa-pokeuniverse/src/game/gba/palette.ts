// Palette buffers and fades, as the games drive them: colors are edited in an "unfaded"
// buffer, blended into a "faded" one, and the faded one is shown (copied at VBlank).
// Palette masks: bits 0-15 are the 16 BG palettes, bits 16-31 the 16 OBJ palettes.

import type { Task, Tasks } from "./tasks";
import type { Color, Video } from "./video";

export const PALETTES_BG = 0x0000ffff;
export const PALETTES_OBJ = 0xffff0000;
export const PALETTES_ALL = 0xffffffff;

/** What `updateFade` reports. */
export const enum FadeStatus {
  Done = 0,
  Active = 1,
  Delay = 2,
  Loading = 0xff,
}

export class Palettes {
  readonly unfaded = new Uint16Array(512);
  readonly faded = new Uint16Array(512);
  /** Sprite palette slots: the tag loaded in each OBJ palette. */
  private readonly tags: (string | null)[] = new Array(16).fill(null);

  // Normal fade state (one fade at a time).
  private active = false;
  private selected = 0;
  private delay = 0;
  private delayCounter = 0;
  private y = 0;
  private targetY = 0;
  private color = 0;
  private deltaY = 2;
  private yDec = false;
  private objToggle = false;
  private finishing = false;
  private finishingCounter = 0;
  private transferPending = false;

  get fadeActive(): boolean {
    return this.active;
  }

  get fadeY(): number {
    return this.y;
  }

  get fadeColor(): Color {
    return this.color;
  }

  /** Copies colors into both buffers. */
  load(colors: ArrayLike<number>, offset: number, count = colors.length): void {
    for (let i = 0; i < count; i++) this.unfaded[offset + i] = this.faded[offset + i] = colors[i] ?? 0;
  }

  fill(color: Color, offset: number, count: number): void {
    this.unfaded.fill(color, offset, offset + count);
    this.faded.fill(color, offset, offset + count);
  }

  /** faded = unfaded moved toward `color` by coeff/16. */
  blendPalette(offset: number, count: number, coeff: number, color: Color): void {
    const tr = color & 31;
    const tg = (color >> 5) & 31;
    const tb = (color >> 10) & 31;
    for (let i = offset; i < offset + count; i++) {
      const c = this.unfaded[i];
      const r = c & 31;
      const g = (c >> 5) & 31;
      const b = (c >> 10) & 31;
      this.faded[i] = (r + (((tr - r) * coeff) >> 4)) | ((g + (((tg - g) * coeff) >> 4)) << 5) | ((b + (((tb - b) * coeff) >> 4)) << 10);
    }
  }

  blendPalettes(mask: number, coeff: number, color: Color): void {
    for (let i = 0; i < 32; i++) if ((mask >>> i) & 1) this.blendPalette(i * 16, 16, coeff, color);
  }

  /**
   * Starts a fade from startY to targetY (0 = own colors, 16 = `color`), stepping 2 every
   * (delay + 1) frames; a negative delay steps faster instead. Ignored while a fade runs.
   */
  beginFade(mask: number, delay: number, startY: number, targetY: number, color: Color): boolean {
    if (this.active) return false;
    this.deltaY = 2;
    if (delay < 0) {
      this.deltaY += -delay;
      delay = 0;
    }
    this.selected = mask >>> 0;
    this.delay = this.delayCounter = delay;
    this.y = startY;
    this.targetY = targetY;
    this.color = color & 0x7fff;
    this.active = true;
    this.yDec = startY >= targetY;
    this.updateFade();
    this.transferPending = false;
    return true;
  }

  /** One fade step: BG palettes on one call, OBJ palettes on the next. */
  updateFade(): FadeStatus {
    if (this.transferPending) return FadeStatus.Loading;
    const status = this.stepFade();
    this.transferPending = this.selected !== 0;
    return status;
  }

  private stepFade(): FadeStatus {
    if (!this.active) return FadeStatus.Done;
    if (this.finishing) {
      // The fade stays "active" for 4 more updates after the last step.
      if (this.finishingCounter === 4) {
        this.active = this.finishing = false;
        this.finishingCounter = 0;
      } else this.finishingCounter++;
      return this.active ? FadeStatus.Active : FadeStatus.Done;
    }
    if (!this.objToggle) {
      if (this.delayCounter < this.delay) {
        this.delayCounter++;
        return FadeStatus.Delay;
      }
      this.delayCounter = 0;
    }
    const half = this.objToggle ? this.selected >>> 16 : this.selected & 0xffff;
    const base = this.objToggle ? 256 : 0;
    for (let i = 0; i < 16; i++) if ((half >> i) & 1) this.blendPalette(base + i * 16, 16, this.y, this.color);
    this.objToggle = !this.objToggle;
    if (!this.objToggle) {
      if (this.y === this.targetY) {
        this.selected = 0;
        this.finishing = true;
      } else if (!this.yDec) this.y = Math.min(this.y + this.deltaY, this.targetY);
      else this.y = Math.max(this.y - this.deltaY, this.targetY);
    }
    return FadeStatus.Active;
  }

  /** Stops any fade (ResetPaletteFadeControl). */
  resetFade(): void {
    this.active = this.finishing = this.objToggle = false;
    this.selected = this.delay = this.delayCounter = this.y = this.targetY = this.color = this.finishingCounter = 0;
    this.deltaY = 2;
    this.transferPending = false;
  }

  /** Clears both buffers, the fade and the sprite palette slots. */
  reset(): void {
    this.unfaded.fill(0);
    this.faded.fill(0);
    this.resetFade();
    this.freeSpritePalettes();
  }

  /** VBlank: shows the faded colors. */
  transfer(video: Video): void {
    video.palette.set(this.faded);
    this.transferPending = false;
  }

  /** Loads a sprite palette into the first free OBJ slot (or the one that has the tag). */
  loadSpritePalette(tag: string, colors: ArrayLike<number>): number {
    let slot = this.tags.indexOf(tag);
    if (slot < 0) {
      slot = this.tags.indexOf(null);
      if (slot < 0) return 0xff;
      this.tags[slot] = tag;
    } else return slot;
    this.load(colors, 256 + slot * 16, 16);
    return slot;
  }

  /** The OBJ palette slot holding a tag, or 0xff. */
  spritePaletteSlot(tag: string): number {
    const slot = this.tags.indexOf(tag);
    return slot < 0 ? 0xff : slot;
  }

  freeSpritePalettes(): void {
    this.tags.fill(null);
  }
}

/** Gray tint used by the title screen: luminance rounded down to a few gray levels. */
export function tintGrayScale(colors: Uint16Array, offset: number, count: number): void {
  const levels = [0, 0, 0, 0, 0, 5, 5, 5, 5, 5, 11, 11, 11, 11, 11, 16, 16, 16, 16, 16, 21, 21, 21, 21, 21, 27, 27, 27, 27, 27, 31, 31];
  for (let i = offset; i < offset + count; i++) {
    const c = colors[i];
    // 0.3, 0.59 and 0.1133 in 8.8 fixed point.
    const gray = levels[Math.min(31, ((c & 31) * 76 + ((c >> 5) & 31) * 151 + ((c >> 10) & 31) * 29) >> 8)];
    colors[i] = gray | (gray << 5) | (gray << 10);
  }
}

// Gradual blend (BlendPalettesGradually): a task that steps a blend coefficient toward a target.
const COEFF = 0;
const TARGET = 1;
const DELTA = 2;
const DELAY = 3;
const DELAY_TIMER = 4;
const COLOR = 5;
const ID = 6;
const MASK = 7; // and 8

export class GradualBlends {
  constructor(
    private readonly tasks: Tasks,
    private readonly palettes: Palettes,
  ) {}

  private readonly step = (task: Task): void => {
    const d = task.data;
    if (++d[DELAY_TIMER] <= d[DELAY]) return;
    d[DELAY_TIMER] = 0;
    this.palettes.blendPalettes(task.word(MASK), d[COEFF], d[COLOR] & 0x7fff);
    if (d[COEFF] === d[TARGET]) {
      this.tasks.destroy(task);
      return;
    }
    d[COEFF] += d[DELTA];
    if (d[DELTA] >= 0 ? d[COEFF] >= d[TARGET] : d[COEFF] <= d[TARGET]) d[COEFF] = d[TARGET];
  };

  /** delay >= 0: one coefficient step every (delay + 1) frames; negative: (1 - delay) steps per frame. */
  start(mask: number, delay: number, coeff: number, target: number, color: Color, priority: number, id: number): void {
    const task = this.tasks.create(this.step, priority);
    const d = task.data;
    d[COEFF] = coeff;
    d[TARGET] = target;
    d[DELAY] = delay >= 0 ? delay : 0;
    d[DELTA] = delay >= 0 ? 1 : -delay + 1;
    if (target < coeff) d[DELTA] = -d[DELTA];
    task.setWord(MASK, mask);
    d[COLOR] = color;
    d[ID] = id;
    this.step(task);
  }

  isActive(id: number): boolean {
    for (let t: Task | null | undefined = this.tasks.find(this.step); t; t = t.next) if (t.fn === this.step && t.data[ID] === id) return true;
    return false;
  }

  destroyAll(): void {
    for (let t = this.tasks.find(this.step); t; t = this.tasks.find(this.step)) this.tasks.destroy(t);
  }
}
