// Sprites as the games manage them: 64 slots with callbacks, frame animations,
// scale and rotation animations (affine) and a priority sort that builds the OAM list each frame.

import type { Palettes } from "./palette";
import { HEIGHT, type ObjEntry } from "./video";

export const MAX_SPRITES = 64;

/** A frame: tile offset in the sheet and how many frames it shows (0 = forever). */
export type AnimCmd = { image: number; duration: number; hFlip?: boolean; vFlip?: boolean } | { jump: number } | { loop: number } | "end";
/**
 * A scale and rotation step: absolute when duration is 0, otherwise added once per frame for
 * `duration` frames. Rotation is in 1/256 of a turn (the command's s8, shifted by 8 in the game).
 */
export type AffineCmd = { xScale: number; yScale: number; rotation?: number; duration: number } | { jump: number } | { loop: number } | "end";

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
  /** Affine in its own box (ST_OAM_AFFINE_NORMAL). */
  affineNormal?: boolean;
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
  /** Drawn as if on a BG: semi-transparent sprites blend with it (ObjEntry.onBg). */
  onBg = false;
  affine = false;
  /** With `affine`: drawn in a double-size box. */
  affineDouble = true;
  /** The sprite's own flip (sprite->hFlip/vFlip); an animation frame's flip is XORed onto it when drawn. */
  hFlip = false;
  vFlip = false;
  /** The current animation frame's flip (SetSpriteOamFlipBits). */
  animHFlip = false;
  animVFlip = false;
  /**
   * The GBA's rule for the sprite's own flip: it reaches OAM only when a frame is applied or its
   * delay counts down (SetSpriteOamFlipBits), so once the animation ends a flip waits for the next
   * StartSpriteAnim. Off by default: ports of code that writes OAM's flip bits directly
   * (`oam.matrixNum ^= ST_OAM_HFLIP`) set `hFlip` and need it drawn at once.
   */
  latchFlip = false;
  private oamHFlip = false;
  private oamVFlip = false;
  /** SetSpriteOamFlipBits. */
  latchOamFlip(): void {
    this.oamHFlip = this.hFlip !== this.animHFlip;
    this.oamVFlip = this.vFlip !== this.animVFlip;
  }
  /** The flip OAM draws. */
  get drawnHFlip(): boolean {
    return this.latchFlip ? this.oamHFlip : this.hFlip !== this.animHFlip;
  }
  get drawnVFlip(): boolean {
    return this.latchFlip ? this.oamVFlip : this.vFlip !== this.animVFlip;
  }
  /** Moved by the shared sprite offset (gSpriteCoordOffsetX/Y). */
  coordOffsetEnabled = false;
  animPaused = false;
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
  animLoop = 0;

  affineAnims: AffineCmd[][] = DUMMY_AFFINE;
  affineAnimNum = 0;
  affineCmdIndex = 0;
  affineDelay = 0;
  affineBeginning = true;
  affineEnded = false;
  affineLoop = 0;
  /** The affine animation stops; the matrix stays as set (setRotScale). */
  affineAnimPaused = false;
  xScale = 0x100;
  yScale = 0x100;
  /** 0x10000 per turn. */
  rotation = 0;
  /** OAM matrix (8.8). */
  matrixA = 0x100;
  matrixB = 0;
  matrixC = 0;
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
    const k = this.affine && this.affineDouble ? 1 : 0.5;
    this.centerToCornerX = -width * k;
    this.centerToCornerY = -height * k;
  }

  startAnim(num: number): void {
    this.animNum = num;
    this.animBeginning = true;
    this.animEnded = false;
    this.animLoop = 0;
  }

  startAffineAnim(num: number): void {
    this.affineAnimNum = num;
    this.affineCmdIndex = this.affineDelay = 0;
    this.xScale = this.yScale = 0x100;
    this.rotation = 0;
    this.affineBeginning = true;
    this.affineEnded = false;
    this.affineLoop = 0;
  }

  /**
   * SetSpriteRotScale (ObjAffineSet): the matrix from scales in its own terms (0x100 = full size,
   * larger is smaller) and a rotation (0x10000 per turn); pause the affine animation first.
   */
  setRotScale(xScale: number, yScale: number, rotation: number): void {
    const turn = (rotation >> 8) & 0xff;
    const sin = AFFINE_SIN[turn];
    const cos = AFFINE_SIN[(turn + 64) & 0xff];
    this.matrixA = (xScale * cos) >> 14;
    this.matrixB = -(xScale * sin) >> 14;
    this.matrixC = (yScale * sin) >> 14;
    this.matrixD = (yScale * cos) >> 14;
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
  /** Added to sprites with coordOffsetEnabled (gSpriteCoordOffsetX/Y). */
  coordOffsetX = 0;
  coordOffsetY = 0;

  constructor(private readonly palettes: Palettes) {}

  loadSheet(tag: string, tiles: Uint8Array): void {
    this.sheets.set(tag, tiles);
  }

  sheet(tag: string): Uint8Array {
    return this.sheets.get(tag) ?? new Uint8Array(0);
  }

  freeSheet(tag: string): void {
    this.sheets.delete(tag);
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
    s.onBg = false;
    s.affine = (template.affine ?? false) || (template.affineNormal ?? false);
    s.affineDouble = !template.affineNormal;
    s.anims = template.anims ?? DUMMY_ANIMS;
    s.affineAnims = template.affineAnims ?? DUMMY_AFFINE;
    s.callback = template.callback ?? callbackDummy;
    s.x = x;
    s.y = y;
    s.setSize(template.width, template.height);
    s.tiles = this.sheets.get(template.sheet) ?? new Uint8Array(0);
    const first = s.anims[0][0];
    const frame = typeof first === "object" && "image" in first ? first : null;
    s.tileNum = frame?.image ?? 0;
    s.hFlip = s.vFlip = false;
    s.animHFlip = frame?.hFlip ?? false;
    s.animVFlip = frame?.vFlip ?? false;
    s.latchFlip = false;
    s.latchOamFlip();
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
    this.coordOffsetX = this.coordOffsetY = 0;
  }

  /** Runs callbacks, then animations, slot by slot. */
  animate(): void {
    for (let i = 0; i < MAX_SPRITES; i++) {
      const s = this.slots[i];
      if (!s.inUse) continue;
      s.callback(s);
      if (s.inUse) this.animateSprite(s);
    }
  }

  /** AnimateSprite: one step of a sprite's frame and scale animations. */
  animateSprite(s: Sprite): void {
    if (s.animBeginning) beginAnim(s);
    else if (!s.animPaused) continueAnim(s);
    if (s.affine && !s.affineAnimPaused) {
      if (s.affineBeginning) beginAffineAnim(s);
      else continueAffineAnim(s);
    }
  }

  /** Builds the OAM list: positions, then the priority sort (kept from frame to frame). */
  buildOam(): void {
    for (const s of this.slots) {
      if (!s.inUse || s.invisible) continue;
      const ox = s.coordOffsetEnabled ? this.coordOffsetX : 0;
      const oy = s.coordOffsetEnabled ? this.coordOffsetY : 0;
      s.oamX = (s.x + s.x2 + s.centerToCornerX + ox) & 0x1ff;
      s.oamY = (s.y + s.y2 + s.centerToCornerY + oy) & 0xff;
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
        onBg: s.onBg,
        hFlip: s.drawnHFlip,
        vFlip: s.drawnVFlip,
        matrix: s.affine ? { a: s.matrixA, b: s.matrixB, c: s.matrixC, d: s.matrixD } : null,
        double: s.affine && s.affineDouble,
      });
    }
    this.oam = objs;
  }
}

function applyFrame(s: Sprite, cmd: { image: number; duration: number; hFlip?: boolean; vFlip?: boolean }): void {
  s.animDelay = cmd.duration ? cmd.duration - 1 : 0;
  s.tileNum = cmd.image;
  s.animHFlip = cmd.hFlip ?? false;
  s.animVFlip = cmd.vFlip ?? false;
  if (!s.affine) s.latchOamFlip();
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

/**
 * ANIMCMD_LOOP / AFFINEANIMCMD_LOOP at `index`: the first time it counts `times`; while the count
 * lasts it goes back to the command after the previous loop (or the first). Returns where to go on.
 */
function runLoop(anim: readonly (object | string)[], index: number, times: number, counter: number): { index: number; counter: number } {
  counter = counter ? counter - 1 : times;
  if (!counter) return { index: index + 1, counter };
  let back = index - 1;
  while (back >= 0 && !(typeof anim[back] === "object" && "loop" in (anim[back] as object))) back--;
  return { index: back + 1, counter };
}

function continueAnim(s: Sprite): void {
  if (s.animDelay) {
    // ContinueAnim: the flip bits are set again while a frame's delay counts down.
    s.animDelay--;
    if (!s.affine) s.latchOamFlip();
    return;
  }
  const anim = s.anims[s.animNum];
  let cmd = anim[++s.animCmdIndex];
  while (typeof cmd === "object" && "loop" in cmd) {
    const next = runLoop(anim, s.animCmdIndex, cmd.loop, s.animLoop);
    s.animLoop = next.counter;
    cmd = anim[(s.animCmdIndex = next.index)];
  }
  if (cmd === "end" || cmd === undefined) {
    s.animCmdIndex--;
    s.animEnded = true;
  } else if ("jump" in cmd) {
    s.animCmdIndex = cmd.jump;
    const target = s.anims[s.animNum][cmd.jump];
    if (typeof target === "object" && "image" in target) applyFrame(s, target);
  } else applyFrame(s, cmd);
}

/** Sine and cosine of a 1/256 turn, 1.14 fixed point like the BIOS table. */
const AFFINE_SIN = Int16Array.from({ length: 256 }, (_, i) => Math.round(Math.sin((i * 2 * Math.PI) / 256) * 0x4000));

/** The relative step, then the OAM matrix (ObjAffineSet: the inverse scale, rotated). */
function updateMatrix(s: Sprite, dx: number, dy: number, dRotation = 0): void {
  s.xScale = (s.xScale + dx) << 16 >> 16;
  s.yScale = (s.yScale + dy) << 16 >> 16;
  s.rotation = (s.rotation + (dRotation << 8)) & 0xffff;
  const sx = s.xScale ? Math.trunc(0x10000 / s.xScale) << 16 >> 16 : 0;
  const sy = s.yScale ? Math.trunc(0x10000 / s.yScale) << 16 >> 16 : 0;
  const turn = s.rotation >> 8;
  const sin = AFFINE_SIN[turn];
  const cos = AFFINE_SIN[(turn + 64) & 0xff];
  s.matrixA = (sx * cos) >> 14;
  s.matrixB = -(sx * sin) >> 14;
  s.matrixC = (sy * sin) >> 14;
  s.matrixD = (sy * cos) >> 14;
}

/** Absolute when the duration is 0; otherwise one relative step. Returns the frames left. */
function applyAffineFrame(s: Sprite, cmd: { xScale: number; yScale: number; rotation?: number; duration: number }): number {
  if (cmd.duration) {
    updateMatrix(s, cmd.xScale, cmd.yScale, cmd.rotation);
    return cmd.duration - 1;
  }
  s.xScale = cmd.xScale;
  s.yScale = cmd.yScale;
  s.rotation = (cmd.rotation ?? 0) << 8;
  updateMatrix(s, 0, 0);
  return 0;
}

function beginAffineAnim(s: Sprite): void {
  const cmd = s.affineAnims[s.affineAnimNum][0];
  if (cmd === "end" || "jump" in cmd || "loop" in cmd) return;
  s.affineCmdIndex = 0;
  s.affineBeginning = s.affineEnded = false;
  s.affineDelay = applyAffineFrame(s, cmd);
  if (s.anchored) updateAnchor(s);
}

function continueAffineAnim(s: Sprite): void {
  const anim = s.affineAnims[s.affineAnimNum];
  const current = anim[s.affineCmdIndex];
  if (s.affineDelay) {
    s.affineDelay--;
    if (current !== "end" && !("jump" in current) && !("loop" in current)) updateMatrix(s, current.xScale, current.yScale, current.rotation);
  } else {
    let cmd = anim[++s.affineCmdIndex];
    // AFFINEANIMCMD_JUMP: on to that command, applied at once.
    while (typeof cmd === "object" && ("jump" in cmd || "loop" in cmd)) {
      if ("jump" in cmd) cmd = anim[(s.affineCmdIndex = cmd.jump)];
      else {
        const next = runLoop(anim, s.affineCmdIndex, cmd.loop, s.affineLoop);
        s.affineLoop = next.counter;
        cmd = anim[(s.affineCmdIndex = next.index)];
      }
    }
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
