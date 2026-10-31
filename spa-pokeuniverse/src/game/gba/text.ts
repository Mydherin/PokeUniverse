// Text windows and the FireRed-style font: a window is a pixel buffer drawn into a
// background's tiles, and text is printed into it glyph by glyph.

import type { IndexedImage } from "./assets";
import type { Background } from "./video";

/** Character codes of the games' charmap (glyph id = code). */
const CHARMAP: Record<string, number> = { " ": 0x00, "é": 0x1b, ":": 0xf0 };
for (let i = 0; i < 10; i++) CHARMAP[String(i)] = 0xa1 + i;
for (let i = 0; i < 26; i++) {
  CHARMAP[String.fromCharCode(65 + i)] = 0xbb + i;
  CHARMAP[String.fromCharCode(97 + i)] = 0xd5 + i;
}

const GLYPH_HEIGHT = 14;

/** A latin font sheet: 16×16 glyph cells, 16 per row; 1 = text, 2 = shadow, others background. */
export class Font {
  constructor(
    private readonly sheet: IndexedImage,
    private readonly widths: number[],
  ) {}

  encode(text: string): number[] {
    return [...text].map((c) => CHARMAP[c] ?? 0);
  }

  width(text: string): number {
    return this.encode(text).reduce((w, id) => w + (this.widths[id] ?? 0), 0);
  }

  /** Draws one glyph at (x, y) into a pixel buffer; returns its advance. */
  drawGlyph(id: number, out: Uint8Array, stride: number, rows: number, x: number, y: number, colors: readonly [number, number, number]): number {
    const width = this.widths[id] ?? 0;
    const gx = (id & 15) * 16;
    const gy = (id >> 4) * 16;
    for (let row = 0; row < GLYPH_HEIGHT; row++) {
      const py = y + row;
      if (py < 0 || py >= rows) continue;
      for (let col = 0; col < width; col++) {
        const px = x + col;
        if (px < 0 || px >= stride) continue;
        const v = this.sheet.pixels[(gy + row) * this.sheet.width + gx + col];
        out[py * stride + px] = v === 1 ? colors[1] : v === 2 ? colors[2] : colors[0];
      }
    }
    return width;
  }
}

export interface WindowTemplate {
  /** Position and size in tiles. */
  left: number;
  top: number;
  width: number;
  height: number;
  palette: number;
  /** First tile of the window in the background's tiles. */
  baseBlock: number;
}

export class Window {
  /** One palette index per pixel. */
  readonly pixels: Uint8Array;
  private readonly stride: number;
  private readonly rows: number;

  constructor(
    private readonly bg: Background,
    readonly template: WindowTemplate,
  ) {
    this.stride = template.width * 8;
    this.rows = template.height * 8;
    this.pixels = new Uint8Array(this.stride * this.rows);
  }

  fill(color: number): void {
    this.pixels.fill(color);
  }

  /** Copies an image's pixels; index 0 is transparent. */
  blit(image: IndexedImage, x: number, y: number): void {
    for (let iy = 0; iy < image.height; iy++)
      for (let ix = 0; ix < image.width; ix++) {
        const v = image.pixels[iy * image.width + ix];
        const px = x + ix;
        const py = y + iy;
        if (v && px < this.stride && py < this.rows) this.pixels[py * this.stride + px] = v;
      }
  }

  /** Prints text at once; colors are [background, text, shadow]. */
  print(font: Font, x: number, y: number, colors: readonly [number, number, number], text: string): void {
    for (const id of font.encode(text)) x += font.drawGlyph(id, this.pixels, this.stride, this.rows, x, y, colors);
  }

  /** Writes the window's tiles into the background's map. */
  putTilemap(): void {
    const { left, top, width, height, palette, baseBlock } = this.template;
    for (let ty = 0; ty < height; ty++)
      for (let tx = 0; tx < width; tx++) this.bg.setEntry(left + tx, top + ty, ((baseBlock + ty * width + tx) & 0x3ff) | (palette << 12));
  }

  /** Copies the pixel buffer into the background's tiles. */
  copyToVram(): void {
    const { width, height, baseBlock } = this.template;
    const end = (baseBlock + width * height) * 64;
    if (this.bg.tiles.length < end) {
      const grown = new Uint8Array(end);
      grown.set(this.bg.tiles);
      this.bg.tiles = grown;
    }
    for (let ty = 0; ty < height; ty++)
      for (let tx = 0; tx < width; tx++) {
        const base = (baseBlock + ty * width + tx) * 64;
        for (let y = 0; y < 8; y++)
          for (let x = 0; x < 8; x++) this.bg.tiles[base + y * 8 + x] = this.pixels[(ty * 8 + y) * this.stride + tx * 8 + x];
      }
  }
}
