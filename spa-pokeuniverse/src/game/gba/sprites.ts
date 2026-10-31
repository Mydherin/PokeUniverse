// Sprites as the games manage them: 64 slots with callbacks, frame animations,
// scale animations (affine) and a priority sort that builds the OAM list each frame.

import type { Palettes } from "./palette";
import { HEIGHT, type ObjEntry } from "./video";

export const MAX_SPRITES = 64;

/** A frame: tile offset in the sheet and how many frames it shows (0 = forever). */
export type AnimCmd = { image: number; duration: number } | { jump: number } | "end";
/** A scale step: absolute when duration is 0, otherwise added once per frame for `duration` frames. */
export type AffineCmd = { xScale: number; yScale: number; duration: number } | "end";

export const enum ObjMode {
  Normal = 0,
  Blend = 1,
  Window = 2,
}

export type SpriteCallback = (sprite: Sprite) => void;
export const callbackDummy: SpriteCallback = () => {};

export interface SpriteTemplate {
  /** Sheet and palette tags (loaded with `loadSheet` and `Palettes.loadSpritePalette`). */
  sheet: string;
  palette: string;
  width: number;
  height: number;
  priority: number;
  mode?: ObjMode;
  /** Affine with the double-size box. */
  affine?: boolean;
  anims?: AnimCmd[][];
  affineAnims?: AffineCmd[][];
  callback?: SpriteCallback;
}

const DUMMY_ANIMS: AnimCmd[][] = [["end"]];
const DUMMY_AFFINE: AffineCmd[][] = [["end"]];

export class Sprite {
  inUse = false;
  x = 0;
  y = 0;
  x2 = 0;
  y2 = 0;
  centerToCornerX = 0;
  centerToCornerY = 0;
  invisible = false;
  subpriority = 0xff;
  priority = 3;
  width = 8;
  height = 8;
  mode = ObjMode.Normal;
  affine = false;
  tiles: Uint8Array = new Uint8Array(0);
  tileNum = 0;
  paletteNum = 0;
  /** 8 signed 16-bit slots, like the games' sprite data. */
  readonly data = new Int16Array(8);
  callback: SpriteCallback = callbackDummy;

  anims: AnimCmd[][] = DUMMY_ANIMS;
  animNum = 0;
  animCmdIndex = 0;
  animDelay = 0;
  animBeginning = true;
  animEnded = false;

  affineAnims: AffineCmd[][] = DUMMY_AFFINE;
  affineAnimNum = 0;
  affineCmdIndex = 0;
  affineDelay = 0;
  affineBeginning = true;
  affineEnded = false;
  xScale = 0x100;
  yScale = 0x100;
  /** Matrix diagonal (8.8); no rotation is used. */
  matrixA = 0x100;
  matrixD = 0x100;
  anchored = false;
  anchorX = 0;
  anchorY = 0;

  /** OAM position (9-bit x, 8-bit y), updated for visible sprites. */
  oamX = 304;
  oamY = 160;

  /** A 32-bit value kept in two data slots (low half first). */
  word(i: number): number {
    return ((this.data[i] & 0xffff) | (this.data[i + 1] << 16)) >>> 0;
  }

  setWord(i: number, value: number): void {
    this.data[i] = value & 0xffff;
    this.data[i + 1] = value >>> 16;
  }

  /** Changes the shape and recomputes the center-to-corner offset. */
  setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    const k = this.affine ? 1 : 0.5;
    this.centerToCornerX = -width * k;
    this.centerToCornerY = -height * k;
  }

  startAnim(num: number): void {
    this.animNum = num;
    this.animBeginning = true;
    this.animEnded = false;
  }

  startAffineAnim(num: number): void {
    this.affineAnimNum = num;
    this.affineCmdIndex = this.affineDelay = 0;
    this.xScale = this.yScale = 0x100;
    this.affineBeginning = true;
    this.affineEnded = false;
  }

  /** Keeps a point of the sprite (in its pixels) fixed while it scales. */
  setMatrixAnchor(x: number, y: number): void {
    this.anchorX = x;
    this.anchorY = y;
    this.anchored = true;
  }
}

export class Sprites {
  readonly slots = Array.from({ length: MAX_SPRITES }, () => new Sprite());
  private readonly order = Array.from({ length: MAX_SPRITES }, (_, i) => i);
  private readonly sheets = new Map<string, Uint8Array>();
  /** The OAM list built this frame; VBlank hands it to the video. */
  oam: ObjEntry[] = [];

  constructor(private readonly palettes: Palettes) {}

  loadSheet(tag: string, tiles: Uint8Array): void {
    this.sheets.set(tag, tiles);
  }

  /** Takes the lowest free slot, or returns null when all 64 are used. */
  create(template: SpriteTemplate, x: number, y: number, subpriority: number): Sprite | null {
    const index = this.slots.findIndex((s) => !s.inUse);
    if (index < 0) return null;
    const s = new Sprite();
    this.slots[index] = s;
    s.inUse = true;
    s.subpriority = subpriority;
    s.priority = template.priority;
    s.mode = template.mode ?? ObjMode.Normal;
    s.affine = template.affine ?? false;
    s.anims = template.anims ?? DUMMY_ANIMS;
    s.affineAnims = template.affineAnims ?? DUMMY_AFFINE;
    s.callback = template.callback ?? callbackDummy;
    s.x = x;
    s.y = y;
    s.setSize(template.width, template.height);
    s.tiles = this.sheets.get(template.sheet) ?? new Uint8Array(0);
    const first = s.anims[0][0];
    s.tileNum = typeof first === "object" && "image" in first ? first.image : 0;
    s.paletteNum = this.palettes.spritePaletteSlot(template.palette) & 15;
    return s;
  }

  destroy(sprite: Sprite | null | undefined): void {
    if (!sprite?.inUse) return;
    const index = this.slots.indexOf(sprite);
    sprite.inUse = false;
    if (index >= 0) this.slots[index] = new Sprite();
  }

  /** ResetSpriteData: frees every slot and the sheets. */
  reset(): void {
    for (let i = 0; i < MAX_SPRITES; i++) {
      this.slots[i].inUse = false;
      this.slots[i] = new Sprite();
      this.order[i] = i;
    }
    this.sheets.clear();
    this.oam = [];
  }

  /** Runs callbacks, then animations, slot by slot. */
  animate(): void {
    for (let i = 0; i < MAX_SPRITES; i++) {
      const s = this.slots[i];
      if (!s.inUse) continue;
      s.callback(s);
      if (!s.inUse) continue;
      if (s.animBeginning) beginAnim(s);
      else continueAnim(s);
      if (s.affine) {
        if (s.affineBeginning) beginAffineAnim(s);
        else continueAffineAnim(s);
      }
    }
  }

  /** Builds the OAM list: positions, then the priority sort (kept from frame to frame). */
  buildOam(): void {
    for (const s of this.slots) {
      if (!s.inUse || s.invisible) continue;
      s.oamX = (s.x + s.x2 + s.centerToCornerX) & 0x1ff;
      s.oamY = (s.y + s.y2 + s.centerToCornerY) & 0xff;
    }
    const key = (i: number) => (this.slots[i].priority << 8) | this.slots[i].subpriority;
    const sortY = (i: number) => {
      const s = this.slots[i];
      let y = s.oamY;
      if (y >= HEIGHT) y -= 256;
      // A 64-pixel tall double-size box can sit across the top edge.
      if (s.affine && s.height === 64 && s.width >= 32 && y > 128) y -= 256;
      return y;
    };
    for (let i = 1; i < MAX_SPRITES; i++) {
      for (let j = i; j > 0; j--) {
        const a = this.order[j - 1];
        const b = this.order[j];
        if (!(key(a) > key(b) || (key(a) === key(b) && sortY(a) < sortY(b)))) break;
        this.order[j - 1] = b;
        this.order[j] = a;
      }
    }
    const objs: ObjEntry[] = [];
    for (const i of this.order) {
      const s = this.slots[i];
      if (!s.inUse || s.invisible) continue;
      objs.push({
        x: s.oamX,
        y: s.oamY,
        width: s.width,
        height: s.height,
        tiles: s.tiles,
        tileNum: s.tileNum,
        palette: s.paletteNum,
        priority: s.priority,
        mode: s.mode,
        hFlip: false,
        vFlip: false,
        matrix: s.affine ? { a: s.matrixA, b: 0, c: 0, d: s.matrixD } : null,
        double: s.affine,
      });
    }
    this.oam = objs;
  }
}

function applyFrame(s: Sprite, cmd: { image: number; duration: number }): void {
  s.animDelay = cmd.duration ? cmd.duration - 1 : 0;
  s.tileNum = cmd.image;
}

function beginAnim(s: Sprite): void {
  s.animCmdIndex = 0;
  s.animEnded = false;
  const cmd = s.anims[s.animNum][0];
  if (typeof cmd === "object" && "image" in cmd) {
    s.animBeginning = false;
    applyFrame(s, cmd);
  }
}

function continueAnim(s: Sprite): void {
  if (s.animDelay) {
    s.animDelay--;
    return;
  }
  const cmd = s.anims[s.animNum][++s.animCmdIndex];
  if (cmd === "end" || cmd === undefined) {
    s.animCmdIndex--;
    s.animEnded = true;
  } else if ("jump" in cmd) {
    s.animCmdIndex = cmd.jump;
    const target = s.anims[s.animNum][cmd.jump];
    if (typeof target === "object" && "image" in target) applyFrame(s, target);
  } else applyFrame(s, cmd);
}

function updateMatrix(s: Sprite, dx: number, dy: number): void {
  s.xScale = (s.xScale + dx) << 16 >> 16;
  s.yScale = (s.yScale + dy) << 16 >> 16;
  s.matrixA = s.xScale ? Math.trunc(0x10000 / s.xScale) << 16 >> 16 : 0;
  s.matrixD = s.yScale ? Math.trunc(0x10000 / s.yScale) << 16 >> 16 : 0;
}

/** Absolute when the duration is 0; otherwise one relative step. Returns the frames left. */
function applyAffineFrame(s: Sprite, cmd: { xScale: number; yScale: number; duration: number }): number {
  if (cmd.duration) {
    updateMatrix(s, cmd.xScale, cmd.yScale);
    return cmd.duration - 1;
  }
  s.xScale = cmd.xScale;
  s.yScale = cmd.yScale;
  updateMatrix(s, 0, 0);
  return 0;
}

function beginAffineAnim(s: Sprite): void {
  const cmd = s.affineAnims[s.affineAnimNum][0];
  if (cmd === "end") return;
  s.affineCmdIndex = 0;
  s.affineBeginning = s.affineEnded = false;
  s.affineDelay = applyAffineFrame(s, cmd);
  if (s.anchored) updateAnchor(s);
}

function continueAffineAnim(s: Sprite): void {
  const current = s.affineAnims[s.affineAnimNum][s.affineCmdIndex];
  if (s.affineDelay) {
    s.affineDelay--;
    if (current !== "end") updateMatrix(s, current.xScale, current.yScale);
  } else {
    const cmd = s.affineAnims[s.affineAnimNum][++s.affineCmdIndex];
    if (cmd === "end" || cmd === undefined) {
      s.affineEnded = true;
      s.affineCmdIndex--;
      updateMatrix(s, 0, 0);
    } else s.affineDelay = applyAffineFrame(s, cmd);
  }
  if (s.anchored) updateAnchor(s);
}

function anchorCoord(base: number, xformed: number, modifier: number): number {
  const sub = xformed - base;
  const shift = sub < 0 ? -sub >> 9 : -(sub >> 9);
  return modifier - (Math.floor(((modifier * xformed) >>> 0) / (base >>> 0)) + shift);
}

function updateAnchor(s: Sprite): void {
  if (s.matrixA) s.x2 = anchorCoord(s.width << 8, Math.trunc((s.width << 16) / s.matrixA), s.anchorX) << 16 >> 16;
  if (s.matrixD) s.y2 = anchorCoord(s.height << 8, Math.trunc((s.height << 16) / s.matrixD), s.anchorY) << 16 >> 16;
}
