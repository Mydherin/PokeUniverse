// Helpers the FireRed screens share: background setup the way the game's bg templates
// do it, tilemap fills, and the smooth alpha blend task.

import { toTiles, type IndexedImage } from "../gba/assets";
import type { Gba } from "../gba/gba";
import type { Task } from "../gba/tasks";
import type { Background } from "../gba/video";
import type { Graphic } from "./manifest";

/** Applies a bg template: screen size (0-3), priority, color mode; position back to 0. */
export function initBg(bg: Background, size: number, priority: number, bpp8 = false): void {
  const entries = 1024 * (size === 0 ? 1 : size === 3 ? 4 : 2);
  if (bg.map.length !== entries) bg.map = new Uint16Array(entries);
  bg.size = size;
  bg.priority = priority;
  bg.bpp8 = bpp8;
  bg.x = bg.y = 0;
}

export function loadBgTiles(bg: Background, graphic: Graphic): void {
  bg.tiles = graphic.tiles;
}

export function loadBgMap(bg: Background, graphic: Graphic): void {
  bg.map.fill(0);
  if (graphic.map) bg.map.set(graphic.map.subarray(0, bg.map.length));
}

/** Both, like DecompressAndCopyTileDataToVram for tiles and map. */
export function loadBg(bg: Background, graphic: Graphic): void {
  loadBgTiles(bg, graphic);
  loadBgMap(bg, graphic);
}

/** Fills a rectangle of the tilemap with one tile (and its flip bits) and palette. */
export function fillBgRect(bg: Background, tile: number, left: number, top: number, width: number, height: number, palette: number): void {
  const entry = (tile & 0xfff) | ((palette & 15) << 12);
  for (let y = top; y < top + height; y++)
    for (let x = left; x < left + width; x++) if (x >= 0 && y >= 0 && x < bg.widthTiles && y < bg.heightTiles) bg.setEntry(x, y, entry);
}

export function resetBgPositions(gba: Gba): void {
  for (const bg of gba.video.bgs) bg.x = bg.y = 0;
}

// Smooth alpha blend (StartBlendTask): EVA/EVB move from start to end over `steps`
// pairs of frames, EVA on one frame and EVB on the next.
const EVA = 0;
const EVB = 1;
const EVA_END = 2;
const EVB_END = 3;
const EVA_DELTA = 4;
const EVB_DELTA = 5;
const STEPS = 6;
const WHICH = 7;

function setBlendAlpha(gba: Gba, eva: number, evb: number): void {
  gba.video.eva = ((eva & 0xffff) >> 8) & 31;
  gba.video.evb = (evb >> 8) & 31;
}

export function smoothBlend(gba: Gba): (task: Task) => void {
  return (task) => {
    const d = task.data;
    if (!d[STEPS]) return;
    if (!d[WHICH]) {
      d[EVA] += d[EVA_DELTA];
      d[WHICH] = 1;
    } else {
      if (--d[STEPS]) d[EVB] += d[EVB_DELTA];
      else {
        d[EVA] = d[EVA_END] << 8;
        d[EVB] = d[EVB_END] << 8;
      }
      d[WHICH] = 0;
    }
    setBlendAlpha(gba, d[EVA], d[EVB]);
    if (!d[STEPS]) gba.tasks.destroy(task);
  };
}

export class BlendTask {
  private readonly fn: (task: Task) => void;

  constructor(private readonly gba: Gba) {
    this.fn = smoothBlend(gba);
  }

  start(evaStart: number, evbStart: number, evaEnd: number, evbEnd: number, steps: number, priority: number): void {
    const d = this.gba.tasks.create(this.fn, priority).data;
    d[EVA] = evaStart << 8;
    d[EVB] = evbStart << 8;
    d[EVA_END] = evaEnd;
    d[EVB_END] = evbEnd;
    d[EVA_DELTA] = Math.trunc(((evaEnd - evaStart) * 256) / steps);
    d[EVB_DELTA] = Math.trunc(((evbEnd - evbStart) * 256) / steps);
    d[STEPS] = steps;
    this.gba.video.eva = evaStart;
    this.gba.video.evb = evbStart;
  }

  get active(): boolean {
    return this.gba.tasks.isActive(this.fn);
  }
}

/** CopyItemIconPicTo4x4Buffer: the icon's 3×3 tiles at the top left of a 4×4 sprite. */
export function iconTiles(image: IndexedImage): Uint8Array {
  const pixels = new Uint8Array(32 * 32);
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) pixels[y * 32 + x] = image.pixels[y * image.width + x] & 15;
  return toTiles({ width: 32, height: 32, pixels, palette: null });
}
