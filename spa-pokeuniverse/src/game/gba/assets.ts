// Loads the art as the game's build tools read it: indexed PNGs (pixel = palette index),
// JASC .pal palettes and .bin tilemaps. Colors become BGR555 (5 bits per channel).

import type { Color } from "./video";

export interface IndexedImage {
  width: number;
  height: number;
  /** One palette index per pixel, row by row. */
  pixels: Uint8Array;
  /** The PNG's own palette, or null for a grayscale PNG. */
  palette: Uint16Array | null;
}

const toColor = (r: number, g: number, b: number): Color => (r >> 3) | ((g >> 3) << 5) | ((b >> 3) << 10);

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`asset ${url}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function fetchPng(url: string): Promise<IndexedImage> {
  return decodePng(await fetchBytes(url));
}

export async function fetchPal(url: string): Promise<Uint16Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`asset ${url}: ${res.status}`);
  // "JASC-PAL", "0100", the count, then one "r g b" line per color.
  const lines = (await res.text()).split(/\r?\n/);
  const count = Number(lines[2]);
  const colors = new Uint16Array(count);
  for (let i = 0; i < count; i++) {
    const [r, g, b] = lines[3 + i].trim().split(/\s+/).map(Number);
    colors[i] = toColor(r, g, b);
  }
  return colors;
}

/** Tilemap entries: tile (10 bits), h-flip, v-flip, palette (4 bits), little endian. */
export async function fetchBin(url: string): Promise<Uint16Array> {
  const bytes = await fetchBytes(url);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Uint16Array.from({ length: bytes.length >> 1 }, (_, i) => view.getUint16(i * 2, true));
}

/**
 * Splits an image into 8×8 tiles, 64 indices per tile: row-major across the image, or frame
 * by frame for `[width, height]` metatiles (each frame's tiles row-major), as gbagfx orders them.
 */
export function toTiles(image: IndexedImage, meta?: [number, number]): Uint8Array {
  const cols = image.width >> 3;
  const rows = image.height >> 3;
  const [mw, mh] = meta ?? [cols, rows];
  const metaCols = cols / mw;
  const tiles = new Uint8Array(cols * rows * 64);
  for (let i = 0; i < cols * rows; i++) {
    const m = Math.floor(i / (mw * mh));
    const sub = i % (mw * mh);
    const tx = (m % metaCols) * mw + (sub % mw);
    const ty = Math.floor(m / metaCols) * mh + Math.floor(sub / mw);
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) tiles[i * 64 + y * 8 + x] = image.pixels[(ty * 8 + y) * image.width + tx * 8 + x];
  }
  return tiles;
}

async function decodePng(bytes: Uint8Array): Promise<IndexedImage> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  let palette: Uint16Array | null = null;
  const idat: Uint8Array[] = [];
  for (let at = 8; at < bytes.length; ) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const data = bytes.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      depth = data[8];
      colorType = data[9];
      if (data[12]) throw new Error("interlaced PNG");
    } else if (type === "PLTE") {
      palette = Uint16Array.from({ length: length / 3 }, (_, i) => toColor(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]));
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    at += 12 + length;
  }
  if (colorType !== 0 && colorType !== 3) throw new Error(`PNG color type ${colorType} is not indexed`);

  const raw = await inflate(idat);
  const stride = Math.ceil((width * depth) / 8);
  const pixels = new Uint8Array(width * height);
  const prev = new Uint8Array(stride);
  const row = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    row.set(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    // Indexed pixels are at most one byte, so the filter distance is 1.
    for (let i = 0; i < stride; i++) {
      const a = i > 0 ? row[i - 1] : 0;
      const b = prev[i];
      const c = i > 0 ? prev[i - 1] : 0;
      if (filter === 1) row[i] += a;
      else if (filter === 2) row[i] += b;
      else if (filter === 3) row[i] += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        row[i] += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
    }
    prev.set(row);
    const perByte = 8 / depth;
    const mask = (1 << depth) - 1;
    // Like gbagfx, a grayscale PNG's levels are inverted: white is index 0.
    const invert = colorType === 0 ? mask : 0;
    for (let x = 0; x < width; x++) {
      const byte = row[Math.floor(x / perByte)];
      pixels[y * width + x] = ((byte >> (8 - depth * ((x % perByte) + 1))) & mask) ^ invert;
    }
  }
  return { width, height, pixels, palette: colorType === 3 ? palette : null };
}

async function inflate(chunks: Uint8Array[]): Promise<Uint8Array> {
  const stream = new Blob(chunks as BlobPart[]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
