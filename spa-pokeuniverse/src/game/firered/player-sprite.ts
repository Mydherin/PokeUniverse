// The player's overworld sprite in FireRed's art: Red's or Leaf's 16×32 frames with the player
// palette, and the animation each action shows (object_event_anims.h, SetStepAnimHandleAlternation).

import { Direction } from "@pokeuniverse/contracts/map/v1/map";
import { Gender } from "@pokeuniverse/contracts/trainer/v1/trainer";
import type { IndexedImage } from "../gba/assets";
import type { Action, Avatar } from "../world/avatar";
import type { CharacterSheet, CharacterView, WorldView } from "../world/view";
import type { Assets } from "./manifest";

const FRAME_W = 16;
const FRAME_H = 32;
/** Frames 0-8 walk (south, north, west standing, then two steps each); 9-19 run, from the run sheet's 3-13. */
const WALK_FRAMES = 9;
const RUN_FIRST = 3;
const RUN_FRAMES = 11;

/** Standing frame and the two step frames per direction; east is west flipped. */
const WALK: Record<number, [number, number, number]> = {
  [Direction.SOUTH]: [0, 3, 4],
  [Direction.NORTH]: [1, 5, 6],
  [Direction.WEST]: [2, 7, 8],
  [Direction.EAST]: [2, 7, 8],
};
const RUN: Record<number, [number, number, number]> = {
  [Direction.SOUTH]: [9, 10, 11],
  [Direction.NORTH]: [12, 13, 14],
  [Direction.WEST]: [15, 16, 17],
  [Direction.EAST]: [15, 16, 17],
};

/** Builds the player's sheet: walk frames, then run frames, colored with the player palette. */
function playerSheet(assets: Assets, gender: Gender): CharacterSheet {
  const girl = gender === Gender.GIRL;
  const walk = assets.get(girl ? "owGreen" : "owRed").image!;
  const run = assets.get(girl ? "owGreenRun" : "owRedRun").image!;
  return characterSheet(`firered-player-${girl ? "girl" : "boy"}`, assets.get("owPlayerPal").palette, [
    [walk, 0, WALK_FRAMES],
    [run, RUN_FIRST, RUN_FRAMES],
  ]);
}

/**
 * A 16×32 character's sheet: from each image, `count` frames starting at frame `from`, side by
 * side in order, colored with a 16-color palette (index 0 transparent).
 */
export function characterSheet(key: string, palette: Uint16Array, parts: [image: IndexedImage, from: number, count: number][]): CharacterSheet {
  const canvas = document.createElement("canvas");
  canvas.width = parts.reduce((n, [, , count]) => n + count, 0) * FRAME_W;
  canvas.height = FRAME_H;
  const ctx = canvas.getContext("2d")!;
  const out = ctx.createImageData(canvas.width, canvas.height);
  const pixels = new Uint32Array(out.data.buffer);
  let to = 0;
  for (const [image, from, count] of parts) {
    for (let f = 0; f < count; f++)
      for (let y = 0; y < FRAME_H; y++)
        for (let x = 0; x < FRAME_W; x++) {
          const i = image.pixels[y * image.width + (from + f) * FRAME_W + x] & 15;
          if (i) pixels[y * canvas.width + (to + f) * FRAME_W + x] = rgba(palette[i]);
        }
    to += count;
  }
  ctx.putImageData(out, 0, 0);
  return { key, image: canvas, frameWidth: FRAME_W, frameHeight: FRAME_H };
}

/** BGR555 to the canvas' little-endian RGBA. */
function rgba(c: number): number {
  const r = c & 31;
  const g = (c >> 5) & 31;
  const b = (c >> 10) & 31;
  return (0xff000000 | (((b << 3) | (b >> 2)) << 16) | (((g << 3) | (g >> 2)) << 8) | ((r << 3) | (r >> 2))) >>> 0;
}

/**
 * The frame an action shows at its frame t. A step plays half of the 4-frame walk cycle
 * (a foot, then standing), alternating feet; running shows its own frames 5 + 3; a turn plays
 * half the cycle twice as fast; a bump plays the whole cycle.
 */
function frameOf(facing: Direction, a: Action | null): number {
  const [stand, footA, footB] = (a?.kind === "run" ? RUN : WALK)[facing] ?? WALK[Direction.SOUTH];
  if (!a) return WALK[facing]?.[0] ?? 0;
  const foot = (half: number) => (half === 0 ? footA : footB);
  switch (a.kind) {
    case "walk":
    case "walkInPlace":
      return a.t < 8 ? foot(a.foot) : stand;
    case "run":
      return a.t < 5 ? stand : foot(a.foot);
    case "turn":
      return a.t < 4 ? foot(a.foot) : stand;
    case "bump": {
      const cmd = (Math.floor(a.t / 8) + a.foot * 2) % 4;
      return cmd === 0 ? footA : cmd === 2 ? footB : stand;
    }
  }
}

/** The player drawn on the world, following the avatar. */
export class PlayerSprite {
  /** Pixels off its cell (x2, y2), e.g. on the stairs. */
  offsetX = 0;
  offsetY = 0;
  /** Drawn over the tiles whatever the elevation, e.g. leaving by the stairs. */
  forceOver = false;
  private readonly view: CharacterView;

  constructor(world: WorldView, assets: Assets, gender: Gender) {
    this.view = world.addCharacter(playerSheet(assets, gender));
  }

  /** Feet on the avatar's cell: the 16×32 frame starts 16 pixels above it. */
  update(avatar: Avatar): void {
    this.view.setPosition(avatar.pixelX + this.offsetX, avatar.pixelY - 16 + this.offsetY);
    this.view.setFrame(frameOf(avatar.facing, avatar.action), avatar.facing === Direction.EAST);
    this.view.setOverTiles(this.forceOver || avatar.overTiles);
  }

  destroy(): void {
    this.view.destroy();
  }
}
