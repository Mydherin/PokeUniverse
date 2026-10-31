// The GBA screen, modeled the way FireRed's art expects it: 4 tile backgrounds, sprites,
// 512 palette colors (BGR555), windows and color effects, composed scanline by scanline.
// Behavior follows the GBA hardware; the code is our own.

export const WIDTH = 240;
export const HEIGHT = 160;

export type Color = number; // BGR555: r | g << 5 | b << 10

export const rgb = (r: number, g: number, b: number): Color => r | (g << 5) | (b << 10);
export const RGB_BLACK = rgb(0, 0, 0);
export const RGB_WHITE = rgb(31, 31, 31);

/** Layer bits, as in WININ / WINOUT / BLDCNT. */
export const Layer = { BG0: 1, BG1: 2, BG2: 4, BG3: 8, OBJ: 16, BD: 32, ALL: 63 } as const;
/** Window bit that lets color effects apply inside it. */
export const WIN_EFFECTS = 32;

export const enum Effect {
  None = 0,
  Blend = 1,
  Lighten = 2,
  Darken = 3,
}

/**
 * A tile background. Coordinates are in 1/256 pixels, as the game changes them. An affine
 * background (BG2 in mode 1) is 8bpp with one-byte map entries; its x, y are the reference
 * point and pa..pd the 8.8 matrix (texture step per screen pixel and per line).
 */
export class Background {
  visible = false;
  priority = 0;
  /** One byte per pixel, 64 per 8×8 tile. */
  tiles: Uint8Array = new Uint8Array(0);
  bpp8 = false;
  /** Tilemap entries: tile (10 bits), h-flip, v-flip, palette (4 bits); a tile number when affine. */
  map: Uint16Array = new Uint16Array(32 * 32);
  /** Text: 0: 256×256, 1: 512×256, 2: 256×512, 3: 512×512. Affine: 128 << size pixels square. */
  size = 0;
  x = 0;
  y = 0;
  affine = false;
  /** Affine: the map repeats instead of being transparent outside. */
  wrap = false;
  pa = 0x100;
  pb = 0;
  pc = 0;
  pd = 0x100;

  get widthTiles(): number {
    if (this.affine) return 16 << this.size;
    return this.size & 1 ? 64 : 32;
  }

  get heightTiles(): number {
    if (this.affine) return 16 << this.size;
    return this.size & 2 ? 64 : 32;
  }

  /** Map entry at a tile position: screens of 32×32 tiles are stored one after another. */
  entry(tx: number, ty: number): number {
    if (this.affine) return this.map[ty * (16 << this.size) + tx] ?? 0;
    let block = 0;
    if (tx >= 32) block += 1;
    if (ty >= 32) block += this.size === 3 ? 2 : 1;
    return this.map[block * 1024 + (ty & 31) * 32 + (tx & 31)] ?? 0;
  }

  setEntry(tx: number, ty: number, value: number): void {
    if (this.affine) {
      this.map[ty * (16 << this.size) + tx] = value & 0xff;
      return;
    }
    let block = 0;
    if (tx >= 32) block += 1;
    if (ty >= 32) block += this.size === 3 ? 2 : 1;
    this.map[block * 1024 + (ty & 31) * 32 + (tx & 31)] = value;
  }

  reset(): void {
    this.visible = false;
    this.priority = 0;
    this.tiles = new Uint8Array(0);
    this.bpp8 = false;
    this.map = new Uint16Array(32 * 32);
    this.size = 0;
    this.x = 0;
    this.y = 0;
    this.affine = this.wrap = false;
    this.pa = this.pd = 0x100;
    this.pb = this.pc = 0;
  }

  /** BgAffineSet: scales around a texture point (8.8) shown at a screen point; no rotation. */
  setAffine(texX: number, texY: number, scrX: number, scrY: number, scaleX: number, scaleY: number): void {
    this.pa = scaleX;
    this.pd = scaleY;
    this.pb = this.pc = 0;
    this.x = texX - this.pa * scrX;
    this.y = texY - this.pd * scrY;
  }
}

/** One sprite as the hardware draws it (an OAM entry). */
export interface ObjEntry {
  x: number;
  y: number;
  /** Size in pixels. */
  width: number;
  height: number;
  tiles: Uint8Array;
  tileNum: number;
  palette: number;
  priority: number;
  /** 0 normal, 1 semi-transparent, 2 OBJ window. */
  mode: number;
  hFlip: boolean;
  vFlip: boolean;
  /** Affine matrix (8.8), or null. */
  matrix: { a: number; b: number; c: number; d: number } | null;
  double: boolean;
}

export interface Window {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export class Video {
  readonly bgs = [new Background(), new Background(), new Background(), new Background()];
  /** Palette as shown (after fades): 256 BG colors then 256 OBJ colors. */
  readonly palette = new Uint16Array(512);
  objs: ObjEntry[] = [];
  objOn = true;
  /** The backdrop is drawn transparent, showing the world drawn under the screen. */
  transparentBackdrop = false;

  readonly win0: Window = { left: 0, right: 0, top: 0, bottom: 0 };
  readonly win1: Window = { left: 0, right: 0, top: 0, bottom: 0 };
  win0On = false;
  win1On = false;
  objWinOn = false;
  /** Layers (and effects) inside WIN0 and WIN1. */
  winIn0 = 0;
  winIn1 = 0;
  /** Layers outside every window, and inside the OBJ window. */
  winOut = 0;
  winObj = 0;

  effect: Effect = Effect.None;
  target1 = 0;
  target2 = 0;
  eva = 0;
  evb = 0;
  evy = 0;
  /** Per-scanline BLDY, as the game's scanline effect writes it; null when off. */
  evyLines: Int16Array | null = null;

  private readonly rgba = new Uint32Array(WIDTH * HEIGHT);
  private readonly lut = new Uint32Array(32768);
  // Per-line work buffers.
  private readonly objColor = new Int32Array(WIDTH);
  private readonly objPrio = new Uint8Array(WIDTH);
  private readonly objBlend = new Uint8Array(WIDTH);
  private readonly objWindow = new Uint8Array(WIDTH);

  constructor() {
    // BGR555 to RGBA8888 (little endian), each 5-bit channel spread over 8 bits.
    for (let c = 0; c < 32768; c++) {
      const r = c & 31;
      const g = (c >> 5) & 31;
      const b = (c >> 10) & 31;
      this.lut[c] = 0xff000000 | (((b << 3) | (b >> 2)) << 16) | (((g << 3) | (g >> 2)) << 8) | ((r << 3) | (r >> 2));
    }
  }

  /** Back to a blank screen, as the game does between scenes. */
  reset(): void {
    for (const bg of this.bgs) bg.reset();
    this.objs = [];
    this.objOn = true;
    this.transparentBackdrop = false;
    Object.assign(this.win0, { left: 0, right: 0, top: 0, bottom: 0 });
    Object.assign(this.win1, { left: 0, right: 0, top: 0, bottom: 0 });
    this.win0On = this.win1On = this.objWinOn = false;
    this.winIn0 = this.winIn1 = this.winOut = this.winObj = 0;
    this.resetBlend();
  }

  resetBlend(): void {
    this.effect = Effect.None;
    this.target1 = this.target2 = 0;
    this.eva = this.evb = this.evy = 0;
    this.evyLines = null;
  }

  /** Renders a frame into RGBA pixels. */
  render(out: ImageData): void {
    for (let line = 0; line < HEIGHT; line++) this.renderLine(line);
    new Uint32Array(out.data.buffer).set(this.rgba);
  }

  private renderLine(line: number): void {
    this.renderObjs(line);
    const palette = this.palette;
    const backdrop = palette[0];
    const anyWindow = this.win0On || this.win1On || this.objWinOn;
    const evy = Math.min(16, this.evyLines ? this.evyLines[line] : this.evy);
    const eva = Math.min(16, this.eva);
    const evb = Math.min(16, this.evb);
    const in0V = this.win0On && inRange(line, this.win0.top, this.win0.bottom, 160);
    const in1V = this.win1On && inRange(line, this.win1.top, this.win1.bottom, 160);
    const base = line * WIDTH;

    // Visible backgrounds in priority order (lower priority value first, then lower index).
    const order: Background[] = [];
    const orderIds: number[] = [];
    for (let p = 0; p < 4; p++)
      for (let i = 0; i < 4; i++) {
        const bg = this.bgs[i];
        if (bg.visible && bg.priority === p) {
          order.push(bg);
          orderIds.push(i);
        }
      }

    for (let x = 0; x < WIDTH; x++) {
      let mask: number = Layer.ALL;
      if (anyWindow) {
        if (in0V && inRange(x, this.win0.left, this.win0.right, 240)) mask = this.winIn0;
        else if (in1V && inRange(x, this.win1.left, this.win1.right, 240)) mask = this.winIn1;
        else if (this.objWinOn && this.objWindow[x]) mask = this.winObj;
        else mask = this.winOut;
      }

      // The two top layers: their color and layer bit.
      let top = backdrop;
      let topLayer: number = Layer.BD;
      let topPrio = 4;
      let under = backdrop;
      let underLayer: number = Layer.BD;
      let found = 0;
      const objColor = this.objColor[x];
      const hasObj = objColor >= 0 && mask & Layer.OBJ && this.objOn;
      let objUsed = !hasObj;

      for (let k = 0; k < order.length && found < 2; k++) {
        const id = orderIds[k];
        if (!(mask & (1 << id))) continue;
        const bg = order[k];
        if (!objUsed && this.objPrio[x] <= bg.priority) {
          if (found === 0) {
            top = objColor;
            topLayer = Layer.OBJ;
            topPrio = this.objPrio[x];
          } else {
            under = objColor;
            underLayer = Layer.OBJ;
          }
          found++;
          objUsed = true;
          if (found === 2) break;
        }
        const color = this.bgPixel(bg, x, line);
        if (color < 0) continue;
        if (found === 0) {
          top = color;
          topLayer = 1 << id;
          topPrio = bg.priority;
        } else {
          under = color;
          underLayer = 1 << id;
        }
        found++;
      }
      if (!objUsed && found < 2) {
        if (found === 0) {
          top = objColor;
          topLayer = Layer.OBJ;
          topPrio = this.objPrio[x];
        } else {
          under = objColor;
          underLayer = Layer.OBJ;
        }
        found++;
      }
      void topPrio;

      let color = top;
      const effects = !anyWindow || mask & WIN_EFFECTS;
      if (effects) {
        const semi = topLayer === Layer.OBJ && this.objBlend[x];
        if (semi && this.target2 & underLayer) {
          color = blend(top, under, eva, evb);
        } else if (this.target1 & topLayer || semi) {
          if (this.effect === Effect.Blend) {
            if (this.target2 & underLayer) color = blend(top, under, eva, evb);
          } else if (this.effect === Effect.Lighten) {
            color = lighten(top, evy);
          } else if (this.effect === Effect.Darken) {
            color = darken(top, evy);
          }
        }
      }
      this.rgba[base + x] = topLayer === Layer.BD && this.transparentBackdrop ? 0 : this.lut[color & 0x7fff];
    }
    void palette;
  }

  /** A background's color at a screen pixel, or -1 when transparent. */
  private bgPixel(bg: Background, x: number, line: number): number {
    if (bg.affine) return this.affinePixel(bg, x, line);
    const w = bg.widthTiles * 8;
    const h = bg.heightTiles * 8;
    const px = (x + (bg.x >> 8)) & (w - 1);
    const py = (line + (bg.y >> 8)) & (h - 1);
    const e = bg.entry(px >> 3, py >> 3);
    const tile = e & 0x3ff;
    let tx = px & 7;
    let ty = py & 7;
    if (e & 0x400) tx = 7 - tx;
    if (e & 0x800) ty = 7 - ty;
    const index = bg.tiles[tile * 64 + ty * 8 + tx];
    if (!index) return -1;
    return bg.bpp8 ? this.palette[index] : this.palette[((e >> 12) << 4) + index];
  }

  private affinePixel(bg: Background, x: number, line: number): number {
    const size = 128 << bg.size;
    let px = (bg.x + bg.pa * x + bg.pb * line) >> 8;
    let py = (bg.y + bg.pc * x + bg.pd * line) >> 8;
    if (bg.wrap) {
      px &= size - 1;
      py &= size - 1;
    } else if (px < 0 || py < 0 || px >= size || py >= size) return -1;
    const tile = bg.map[(py >> 3) * (size >> 3) + (px >> 3)] & 0xff;
    const index = bg.tiles[tile * 64 + (py & 7) * 8 + (px & 7)];
    return index ? this.palette[index] : -1;
  }

  /** Draws the sprites crossing a scanline into the line's OBJ buffers. */
  private renderObjs(line: number): void {
    this.objColor.fill(-1);
    this.objPrio.fill(4);
    this.objBlend.fill(0);
    this.objWindow.fill(0);
    if (!this.objOn) return;
    // The first entry wins a pixel: draw from the last one up.
    for (let i = this.objs.length - 1; i >= 0; i--) {
      const o = this.objs[i];
      const boxW = o.matrix && o.double ? o.width * 2 : o.width;
      const boxH = o.matrix && o.double ? o.height * 2 : o.height;
      const by = (line - o.y) & 255;
      if (by >= boxH) continue;
      const tw = o.width >> 3;
      const ox = o.x & 511;
      for (let bx = 0; bx < boxW; bx++) {
        const sx = (ox + bx) & 511;
        if (sx >= WIDTH) continue;
        let tx: number;
        let ty: number;
        if (o.matrix) {
          const dx = bx - (boxW >> 1);
          const dy = by - (boxH >> 1);
          tx = ((o.matrix.a * dx + o.matrix.b * dy) >> 8) + (o.width >> 1);
          ty = ((o.matrix.c * dx + o.matrix.d * dy) >> 8) + (o.height >> 1);
          if (tx < 0 || ty < 0 || tx >= o.width || ty >= o.height) continue;
        } else {
          tx = o.hFlip ? o.width - 1 - bx : bx;
          ty = o.vFlip ? o.height - 1 - by : by;
        }
        const tile = o.tileNum + (ty >> 3) * tw + (tx >> 3);
        const index = o.tiles[tile * 64 + (ty & 7) * 8 + (tx & 7)];
        if (!index) continue;
        if (o.mode === 2) {
          this.objWindow[sx] = 1;
          continue;
        }
        this.objColor[sx] = this.palette[256 + (o.palette << 4) + index];
        this.objPrio[sx] = o.priority;
        this.objBlend[sx] = o.mode === 1 ? 1 : 0;
      }
    }
  }
}

/** Inside a window range; a start after the end wraps around the screen. */
function inRange(v: number, start: number, end: number, max: number): boolean {
  if (end > max || start > end) return v >= start || v < Math.min(end, max);
  return v >= start && v < end;
}

function blend(a: number, b: number, eva: number, evb: number): number {
  const r = Math.min(31, ((a & 31) * eva + (b & 31) * evb) >> 4);
  const g = Math.min(31, (((a >> 5) & 31) * eva + ((b >> 5) & 31) * evb) >> 4);
  const bl = Math.min(31, (((a >> 10) & 31) * eva + ((b >> 10) & 31) * evb) >> 4);
  return r | (g << 5) | (bl << 10);
}

function lighten(a: number, evy: number): number {
  const r = a & 31;
  const g = (a >> 5) & 31;
  const b = (a >> 10) & 31;
  return (r + (((31 - r) * evy) >> 4)) | ((g + (((31 - g) * evy) >> 4)) << 5) | ((b + (((31 - b) * evy) >> 4)) << 10);
}

function darken(a: number, evy: number): number {
  const r = a & 31;
  const g = (a >> 5) & 31;
  const b = (a >> 10) & 31;
  return (r - ((r * evy) >> 4)) | ((g - ((g * evy) >> 4)) << 5) | ((b - ((b * evy) >> 4)) << 10);
}
