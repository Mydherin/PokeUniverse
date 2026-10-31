// Text windows and the GBA-style text printer: a window is a pixel buffer drawn into a
// background's tiles; text is the games' encoded bytes (charmap), printed glyph by glyph,
// at once or one character every few frames with the games' control codes, prompts
// (down arrow, scroll, clear) and A/B to speed up.

import type { IndexedImage } from "./assets";
import type { Input } from "./input";
import { Button } from "./input";
import type { Background } from "./video";

/** Encoded text: one byte per character or control code, ending with EOS. */
export type Text = readonly number[];

export const EOS = 0xff;
const CHAR_NEWLINE = 0xfe;
const PLACEHOLDER_BEGIN = 0xfd;
const EXT_CTRL_CODE_BEGIN = 0xfc;
/** {FONT_...}: the following glyphs in another font. */
const CTRL_FONT = 0x06;
const CHAR_PROMPT_CLEAR = 0xfb;
const CHAR_PROMPT_SCROLL = 0xfa;
const CHAR_KEYPAD_ICON = 0xf8;
const CHAR_EXTRA_SYMBOL = 0xf9;
export const PLACEHOLDER_PLAYER = 0x01;
export const PLACEHOLDER_STR_VAR_1 = 0x02;
export const PLACEHOLDER_STR_VAR_2 = 0x03;
export const PLACEHOLDER_RIVAL = 0x06;

/** Character <-> byte, from the games' charmap (`make text`). */
export interface Charmap {
  encode: Record<string, number>;
  decode: Record<string, string>;
}

export function encodeText(charmap: Charmap, s: string): number[] {
  return [...[...s].map((c) => charmap.encode[c] ?? 0), EOS];
}

export function decodeText(charmap: Charmap, text: Text): string {
  let s = "";
  for (const b of text) {
    if (b === EOS) break;
    s += charmap.decode[b] ?? "";
  }
  return s;
}

/** StringExpandPlaceholders: {PLAYER}, {RIVAL}, {STR_VAR_1}... become the given text. */
export function expandPlaceholders(text: Text, vars: Partial<Record<number, Text>>): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const b = text[i];
    if (b === PLACEHOLDER_BEGIN) {
      const value = vars[text[++i]] ?? [];
      for (const v of value) {
        if (v === EOS) break;
        out.push(v);
      }
    } else {
      out.push(b);
      if (b === EOS) break;
    }
  }
  return out;
}

/** Joins texts (StringCopy, StringAppend): each one's EOS dropped, one at the end. */
export function joinText(...texts: Text[]): number[] {
  const out: number[] = [];
  for (const t of texts)
    for (const b of t) {
      if (b === EOS) break;
      out.push(b);
    }
  out.push(EOS);
  return out;
}

export const enum NumberMode {
  LeftAlign,
  /** Padded with spaces. */
  RightAlign,
  LeadingZeros,
}

const CHAR_SPACE = 0x00;
const CHAR_0 = 0xa1;
const CHAR_QUESTION_MARK = 0xac;

/** ConvertIntToDecimalStringN: `n` digits at most; a digit past 9 (too big a value) shows as "?". */
export function decimalText(value: number, mode: NumberMode, n: number): number[] {
  const out: number[] = [];
  let writing = mode === NumberMode.LeadingZeros;
  for (let power = 10 ** (n - 1); power > 0; power = Math.floor(power / 10)) {
    const digit = Math.floor(value / power);
    value -= power * digit;
    if (writing || digit !== 0 || power === 1) {
      writing = true;
      out.push(digit <= 9 ? CHAR_0 + digit : CHAR_QUESTION_MARK);
    } else if (mode === NumberMode.RightAlign) out.push(CHAR_SPACE);
  }
  out.push(EOS);
  return out;
}

export const enum FontId {
  Small = 0,
  NormalCopy1 = 1,
  Normal = 2,
  NormalCopy2 = 3,
  Male = 4,
  Female = 5,
}

/**
 * A latin font sheet: glyph cells of `cellWidth`×16 pixels, 256 / cellWidth per row;
 * pixel 1 = text, 2 = shadow, others background.
 */
export class Font {
  /** The button icons ({A_BUTTON}...) printed in this font's lines, once loaded. */
  keypadIcons: IndexedImage | null = null;
  /** The fonts a {FONT_...} control code switches to (gFonts), once loaded. */
  family: Partial<Record<number, Font>> | null = null;

  constructor(
    private readonly sheet: IndexedImage,
    private readonly widths: number[],
    private readonly cellWidth: 8 | 16,
    /** Glyph height drawn (gGlyphInfo.height) and the font's line height (maxLetterHeight). */
    readonly glyphHeight: number,
    readonly maxLetterHeight: number,
    /** Letter spacing and line spacing of AddTextPrinterParameterized (the font's defaults). */
    readonly letterSpacing: number,
    readonly lineSpacing: number,
  ) {}

  glyphWidth(id: number): number {
    return this.widths[id] ?? 0;
  }

  /** GetStringWidth: the widest line, other control codes skipped; {FONT_...} measures in that font. */
  width(text: Text, letterSpacing = 0): number {
    let widest = 0;
    let line = 0;
    let glyphs: Font = this;
    for (let i = 0; i < text.length; i++) {
      const b = text[i];
      if (b === EOS) break;
      if (b === CHAR_NEWLINE) {
        widest = Math.max(widest, line);
        line = 0;
      } else if (b === EXT_CTRL_CODE_BEGIN) {
        const code = text[++i];
        if (code === CTRL_FONT) glyphs = this.family?.[text[i + 1]] ?? glyphs;
        i += controlCodeArgs(code);
      } else if (b === PLACEHOLDER_BEGIN) i++;
      else if (b === CHAR_KEYPAD_ICON) line += KEYPAD_ICONS[text[++i]]?.width ?? 0;
      else if (b === CHAR_PROMPT_CLEAR || b === CHAR_PROMPT_SCROLL) continue;
      else if (b === CHAR_EXTRA_SYMBOL) line += glyphs.glyphWidth(text[++i] | 0x100) + letterSpacing;
      else line += glyphs.glyphWidth(b) + letterSpacing;
    }
    return Math.max(widest, line);
  }

  /**
   * Draws one glyph at (x, y) into a pixel buffer, clipped to `maxWidth`×`maxHeight` from
   * there; colors are [background, text, shadow] and color 0 is not drawn (transparent).
   */
  drawGlyph(id: number, out: Uint8Array, stride: number, rows: number, x: number, y: number, colors: readonly [number, number, number]): void {
    const width = Math.min(this.glyphWidth(id), stride - x);
    const height = Math.min(this.glyphHeight, rows - y);
    const perRow = 256 / this.cellWidth;
    const gx = (id % perRow) * this.cellWidth;
    const gy = Math.floor(id / perRow) * 16;
    for (let row = 0; row < height; row++) {
      const py = y + row;
      if (py < 0) continue;
      for (let col = 0; col < width; col++) {
        const px = x + col;
        if (px < 0) continue;
        const v = this.sheet.pixels[(gy + row) * this.sheet.width + gx + col];
        const color = v === 1 ? colors[1] : v === 2 ? colors[2] : colors[0];
        if (color) out[py * stride + px] = color;
      }
    }
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
  readonly stride: number;
  readonly rows: number;

  constructor(
    readonly bg: Background,
    readonly template: WindowTemplate,
  ) {
    this.stride = template.width * 8;
    this.rows = template.height * 8;
    this.pixels = new Uint8Array(this.stride * this.rows);
  }

  fill(color: number): void {
    this.pixels.fill(color);
  }

  fillRect(color: number, x: number, y: number, width: number, height: number): void {
    for (let py = Math.max(0, y); py < Math.min(this.rows, y + height); py++)
      this.pixels.fill(color, py * this.stride + Math.max(0, x), py * this.stride + Math.min(this.stride, x + width));
  }

  /** Copies an image's pixels; index 0 is transparent. */
  blit(image: IndexedImage, x: number, y: number): void {
    this.blitRect(image, 0, 0, x, y, image.width, image.height);
  }

  /** BlitBitmapRectToWindow: part of an image, index 0 transparent, 4bpp indices. */
  blitRect(image: IndexedImage, srcX: number, srcY: number, x: number, y: number, width: number, height: number): void {
    for (let iy = 0; iy < height; iy++)
      for (let ix = 0; ix < width; ix++) {
        const sx = srcX + ix;
        const sy = srcY + iy;
        if (sx >= image.width || sy >= image.height) continue;
        const v = image.pixels[sy * image.width + sx] & 15;
        const px = x + ix;
        const py = y + iy;
        if (v && px >= 0 && py >= 0 && px < this.stride && py < this.rows) this.pixels[py * this.stride + px] = v;
      }
  }

  /** CopyToWindowPixelBuffer for one 8×8 tile (64 indices a tile), color 0 included. */
  copyTile(tiles: Uint8Array, tile: number, tx: number, ty: number): void {
    for (let y = 0; y < 8; y++)
      this.pixels.set(tiles.subarray(tile * 64 + y * 8, tile * 64 + y * 8 + 8), (ty * 8 + y) * this.stride + tx * 8);
  }

  /** ScrollWindow up: the content moves up and the bottom fills with `fill`. */
  scroll(distance: number, fill: number): void {
    const shift = distance * this.stride;
    this.pixels.copyWithin(0, shift);
    this.pixels.fill(fill, this.pixels.length - shift);
  }

  /** ScrollWindow down: the content moves down and the top fills with `fill`. */
  scrollDown(distance: number, fill: number): void {
    const shift = distance * this.stride;
    this.pixels.copyWithin(shift, 0, this.pixels.length - shift);
    this.pixels.fill(fill, 0, shift);
  }

  /** Prints text at once (AddTextPrinter with speed 0); colors are [background, text, shadow]. */
  print(font: Font, x: number, y: number, colors: readonly [number, number, number], text: Text, letterSpacing = font.letterSpacing, lineSpacing = font.lineSpacing): void {
    new TextPrinter(this, { font, x, y, letterSpacing, lineSpacing, colors }, 0, null).start(text).renderAll();
  }

  /** Writes the window's tiles into the background's map. */
  putTilemap(): void {
    const { left, top, width, height, palette, baseBlock } = this.template;
    for (let ty = 0; ty < height; ty++)
      for (let tx = 0; tx < width; tx++) this.bg.setEntry(left + tx, top + ty, ((baseBlock + ty * width + tx) & 0x3ff) | (palette << 12));
  }

  clearTilemap(): void {
    const { left, top, width, height } = this.template;
    for (let ty = 0; ty < height; ty++) for (let tx = 0; tx < width; tx++) this.bg.setEntry(left + tx, top + ty, 0);
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

/** The button icons a text can show ({A_BUTTON}...): tile in the icon sheet and size. */
const KEYPAD_ICONS: Record<number, { tile: number; width: number; height: number }> = {
  0x00: { tile: 0x0, width: 8, height: 12 },
  0x01: { tile: 0x1, width: 8, height: 12 },
  0x02: { tile: 0x2, width: 16, height: 12 },
  0x03: { tile: 0x4, width: 16, height: 12 },
  0x04: { tile: 0x6, width: 24, height: 12 },
  0x05: { tile: 0x9, width: 24, height: 12 },
  0x06: { tile: 0xc, width: 8, height: 12 },
  0x07: { tile: 0xd, width: 8, height: 12 },
  0x08: { tile: 0xe, width: 8, height: 12 },
  0x09: { tile: 0xf, width: 8, height: 12 },
  0x0a: { tile: 0x20, width: 8, height: 12 },
  0x0b: { tile: 0x21, width: 8, height: 12 },
  0x0c: { tile: 0x22, width: 8, height: 12 },
};

/** How many argument bytes follow an extended control code. */
function controlCodeArgs(code: number): number {
  if (code === 0x04) return 3;
  if (code === 0x0b || code === 0x10) return 2;
  if ([0x01, 0x02, 0x03, 0x05, 0x06, 0x08, 0x0c, 0x0d, 0x0e, 0x11, 0x12, 0x13, 0x14].includes(code)) return 1;
  return 0;
}

/** What the printers share: fonts, the prompt arrow and icon sheets, buttons and sound. */
export interface TextContext {
  fonts: Record<FontId, Font>;
  downArrow: IndexedImage;
  input: Input;
  /** PlaySE(SE_SELECT) when a prompt is answered. */
  playSelect(): void;
  /** gTextFlags.canABSpeedUpPrint. */
  canABSpeedUpPrint: boolean;
  /** Pixels a prompt scroll moves per frame (by text speed: 1, 2, 4). */
  scrollSpeed: number;
}

export interface PrinterTemplate {
  font: Font;
  x: number;
  y: number;
  letterSpacing: number;
  lineSpacing: number;
  colors: readonly [number, number, number];
}

const enum RenderState {
  HandleChar,
  Wait,
  Clear,
  ScrollStart,
  Scroll,
  WaitSe,
  Pause,
}

const enum Render {
  Print,
  Finish,
  Repeat,
  Update,
}

const DOWN_ARROW_X = [0, 16, 32, 16];
const CURSOR_DELAY = 8;

/** One printer, as the games' TextPrinter: prints into a window, one character per step. */
export class TextPrinter {
  active = true;
  private state = RenderState.HandleChar;
  private pos = 0;
  private currentX: number;
  private currentY: number;
  private colors: [number, number, number];
  private font: Font;
  /** The font glyphs are drawn in: the template's, until a {FONT_...} code changes it. */
  private glyphs: Font;
  private readonly textSpeed: number;
  private delayCounter = 0;
  private scrollDistance = 0;
  private spedUp = false;
  private downArrowDelay = 0;
  private downArrowIndex = 0;
  /** {MIN_LETTER_SPACING n}: each glyph takes at least n pixels. */
  private minLetterSpacing = 0;
  private text: Text = [EOS];

  constructor(
    readonly window: Window,
    private readonly template: PrinterTemplate,
    speed: number,
    private readonly ctx: TextContext | null,
  ) {
    this.currentX = template.x;
    this.currentY = template.y;
    this.colors = [...template.colors];
    this.font = template.font;
    this.glyphs = template.font;
    this.textSpeed = speed > 0 ? speed - 1 : 0;
  }

  start(text: Text): this {
    this.text = text;
    return this;
  }

  /** Renders up to the end (or a prompt) at once, as AddTextPrinter with speed 0. */
  renderAll(): void {
    for (let i = 0; i < 0x400; i++) if (this.step() === Render.Finish) break;
    this.active = false;
  }

  /** One RenderFont call: repeats until something shows, finishes or waits. */
  step(): Render {
    for (;;) {
      const r = this.render();
      if (r !== Render.Repeat) return r;
    }
  }

  private render(): Render {
    const ctx = this.ctx;
    switch (this.state) {
      case RenderState.HandleChar: {
        if (ctx?.input.isHeld(Button.A | Button.B) && this.spedUp) this.delayCounter = 0;
        if (this.delayCounter && this.textSpeed) {
          this.delayCounter--;
          if (ctx?.canABSpeedUpPrint && ctx.input.isPressed(Button.A | Button.B)) {
            this.spedUp = true;
            this.delayCounter = 0;
          }
          return Render.Update;
        }
        this.delayCounter = this.textSpeed;
        let c = this.next();
        switch (c) {
          case CHAR_NEWLINE:
            this.currentX = this.template.x;
            this.currentY += this.font.maxLetterHeight + this.template.lineSpacing;
            return Render.Repeat;
          case PLACEHOLDER_BEGIN:
            this.pos++;
            return Render.Repeat;
          case EXT_CTRL_CODE_BEGIN:
            return this.controlCode();
          case CHAR_PROMPT_CLEAR:
            this.state = RenderState.Clear;
            this.downArrowIndex = this.downArrowDelay = 0;
            return Render.Update;
          case CHAR_PROMPT_SCROLL:
            this.state = RenderState.ScrollStart;
            this.downArrowIndex = this.downArrowDelay = 0;
            return Render.Update;
          case CHAR_EXTRA_SYMBOL:
            c = this.next() | 0x100;
            break;
          case CHAR_KEYPAD_ICON: {
            const icon = KEYPAD_ICONS[this.next()];
            const sheet = this.glyphs.keypadIcons;
            if (icon && sheet) {
              this.window.blitRect(sheet, (icon.tile % 16) * 8, Math.floor(icon.tile / 16) * 8, this.currentX, this.currentY, icon.width, icon.height);
              this.currentX += icon.width + this.template.letterSpacing;
            }
            return Render.Print;
          }
          case EOS:
            return Render.Finish;
        }
        this.glyphs.drawGlyph(c, this.window.pixels, this.window.stride, this.window.rows, this.currentX, this.currentY, this.colors);
        const width = this.glyphs.glyphWidth(c);
        this.currentX += width;
        if (this.minLetterSpacing > width) {
          // ClearTextSpan: the rest of the cell in the background color.
          this.window.fillRect(this.colors[0], this.currentX, this.currentY, this.minLetterSpacing - width, this.glyphs.glyphHeight);
          this.currentX += this.minLetterSpacing - width;
        }
        return Render.Print;
      }
      case RenderState.Wait:
        if (this.waitForPress()) this.state = RenderState.HandleChar;
        return Render.Update;
      case RenderState.Clear:
        if (this.waitWithDownArrow()) {
          this.window.fill(this.colors[0]);
          this.currentX = this.template.x;
          this.currentY = this.template.y;
          this.state = RenderState.HandleChar;
        }
        return Render.Update;
      case RenderState.ScrollStart:
        if (this.waitWithDownArrow()) {
          this.window.fillRect(this.colors[0], this.currentX, this.currentY, 10, 12);
          this.scrollDistance = this.font.maxLetterHeight + this.template.lineSpacing;
          this.currentX = this.template.x;
          this.state = RenderState.Scroll;
        }
        return Render.Update;
      case RenderState.Scroll:
        if (this.scrollDistance) {
          const speed = ctx?.scrollSpeed ?? 2;
          const d = Math.min(this.scrollDistance, speed);
          this.window.scroll(d, this.colors[0]);
          this.scrollDistance -= d;
          this.window.copyToVram();
        } else this.state = RenderState.HandleChar;
        return Render.Update;
      case RenderState.WaitSe:
        this.state = RenderState.HandleChar;
        return Render.Update;
      case RenderState.Pause:
        if (this.delayCounter) this.delayCounter--;
        else this.state = RenderState.HandleChar;
        return Render.Update;
    }
    return Render.Finish;
  }

  private next(): number {
    return this.text[this.pos++] ?? EOS;
  }

  private controlCode(): Render {
    const code = this.next();
    switch (code) {
      case 0x01:
        this.colors[1] = this.next();
        return Render.Repeat;
      case 0x02:
        this.colors[0] = this.next();
        return Render.Repeat;
      case 0x03:
        this.colors[2] = this.next();
        return Render.Repeat;
      case 0x04:
        this.colors[1] = this.next();
        this.colors[0] = this.next();
        this.colors[2] = this.next();
        return Render.Repeat;
      case CTRL_FONT:
        this.glyphs = this.font.family?.[this.next()] ?? this.glyphs;
        return Render.Repeat;
      case 0x08:
        this.delayCounter = this.next();
        this.state = RenderState.Pause;
        return Render.Repeat;
      case 0x09:
        this.state = RenderState.Wait;
        return Render.Update;
      case 0x0a:
        this.state = RenderState.WaitSe;
        return Render.Update;
      case 0x0d:
        this.currentX = this.template.x + this.next();
        return Render.Repeat;
      case 0x0e:
        this.currentY = this.template.y + this.next();
        return Render.Repeat;
      case 0x0f:
        this.window.fill(this.colors[0]);
        return Render.Repeat;
      case 0x11: {
        const width = this.next();
        if (width > 0) {
          this.currentX += width;
          return Render.Print;
        }
        return Render.Repeat;
      }
      case 0x12:
        this.currentX = this.template.x + this.next();
        return Render.Repeat;
      case 0x13: {
        const width = this.template.x + this.next() - this.currentX;
        if (width > 0) {
          this.currentX += width;
          return Render.Print;
        }
        return Render.Repeat;
      }
      case 0x14:
        this.minLetterSpacing = this.next();
        return Render.Repeat;
      default:
        // Palettes, sounds and music changes: their arguments are skipped.
        this.pos += controlCodeArgs(code);
        return Render.Repeat;
    }
  }

  private waitForPress(): boolean {
    if (this.ctx?.input.isPressed(Button.A | Button.B)) {
      this.ctx.playSelect();
      return true;
    }
    return false;
  }

  private waitWithDownArrow(): boolean {
    const ctx = this.ctx;
    if (ctx) {
      if (this.downArrowDelay) this.downArrowDelay--;
      else {
        this.window.fillRect(this.colors[0], this.currentX, this.currentY, 10, 12);
        this.window.blitRect(ctx.downArrow, DOWN_ARROW_X[this.downArrowIndex], 0, this.currentX, this.currentY, 10, 12);
        this.window.copyToVram();
        this.downArrowDelay = CURSOR_DELAY;
        this.downArrowIndex = (this.downArrowIndex + 1) & 3;
      }
    }
    return this.waitForPress();
  }
}

/** The running printers, one per window, stepped once per frame (RunTextPrinters). */
export class TextPrinters {
  private readonly printers = new Map<Window, TextPrinter>();

  constructor(readonly ctx: TextContext) {}

  /**
   * AddTextPrinter: speed 0 prints at once; otherwise one character every `speed` frames
   * from the next frames on.
   */
  add(window: Window, template: PrinterTemplate, speed: number, text: Text): void {
    const printer = new TextPrinter(window, template, speed, this.ctx).start(text);
    if (speed === 0) {
      printer.renderAll();
      window.copyToVram();
      this.printers.delete(window);
    } else this.printers.set(window, printer);
  }

  isActive(window: Window): boolean {
    return this.printers.get(window)?.active ?? false;
  }

  run(): void {
    for (const [window, printer] of this.printers) {
      if (!printer.active) continue;
      const r = printer.step();
      if (r === Render.Print) window.copyToVram();
      else if (r === Render.Finish) printer.active = false;
    }
  }

  reset(): void {
    this.printers.clear();
  }
}
