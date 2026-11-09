// The battle transition on the field (battle_transition.c): the intro (the field fades to gray
// and back twice), then B_TRANSITION_ANGLED_WIPES, the trainer transition FireRed picks indoors
// when the foe isn't weaker: seven black wipes along slanted lines, each row's visible part cut
// to one side of the line (the game's per-scanline WIN0), until the screen is black.

import { Window } from "../../gba/text";
import { rgb, RGB_BLACK } from "../../gba/video";
import { initBg } from "../common";
import type { Flow } from "../flow";

const GRAY = rgb(11, 11, 11);
const WIDTH = 240;
const HEIGHT = 160;

/** sAngledWipes_MoveData: start, end and whether the wipe moves up (cuts the right) or down (cuts the left). */
const WIPES: readonly [number, number, number, number, boolean][] = [
  [56, 0, 0, HEIGHT, false],
  [104, HEIGHT, WIDTH, 88, true],
  [WIDTH, 72, 56, 0, true],
  [0, 32, 144, HEIGHT, false],
  [144, HEIGHT, 184, 0, true],
  [56, 0, 168, HEIGHT, false],
  [168, HEIGHT, 48, 0, true],
];
/** sAngledWipes_EndDelays. */
const END_DELAYS = [1, 1, 1, 1, 1, 1, 0];
/** Points of the line handled per frame. */
const POINTS_PER_FRAME = 16;

/** The whole transition, a frame per step; the screen is black when it ends. */
export function* battleTransition(flow: Flow): Generator<void, void, void> {
  yield* intro(flow);
  yield* angledWipes(flow);
}

/** Task_BattleTransition_Intro (0, 0, 2 fades, speed 2): everything blends to gray and back, twice. */
function* intro(flow: Flow): Generator<void, void, void> {
  for (let n = 0; n < 2; n++) {
    for (let blend = 2; blend <= 16; blend += 2) {
      flow.world.setFade(blend, GRAY);
      yield;
    }
    for (let blend = 14; blend >= 0; blend -= 2) {
      flow.world.setFade(blend, GRAY);
      yield;
    }
  }
}

function* angledWipes(flow: Flow): Generator<void, void, void> {
  const { gba } = flow;
  const bg = gba.video.bgs[0];
  initBg(bg, 0, 0);
  bg.tiles = new Uint8Array((1 + 30 * 20) * 64);
  bg.visible = true;
  gba.palettes.load([0, RGB_BLACK], 15 * 16, 2);
  const win = new Window(bg, { left: 0, top: 0, width: 30, height: 20, palette: 15, baseBlock: 1 });
  win.fill(0);
  win.putTilemap();
  win.copyToVram();
  const left = new Int16Array(HEIGHT);
  const right = new Int16Array(HEIGHT).fill(WIDTH);
  const paint = (y: number) => {
    const row = y * win.stride;
    for (let x = 0; x < WIDTH; x++) win.pixels[row + x] = x >= left[y] && x < right[y] ? 0 : 1;
  };
  for (let w = 0; w < WIPES.length; w++) {
    const [x0, y0, x1, y1, up] = WIPES[w];
    const points = line(x0, y0, x1, y1);
    let done = false;
    while (!done) {
      for (let i = 0; i < POINTS_PER_FRAME && !done; i++) {
        const next = points.next();
        if (next.done) {
          done = true;
          break;
        }
        const [x, y] = next.value;
        if (y < 0 || y >= HEIGHT) continue;
        if (up) right[y] = Math.max(left[y], Math.min(right[y], x));
        else left[y] = Math.min(right[y], Math.max(left[y], x));
        paint(y);
      }
      win.copyToVram();
      yield;
    }
    for (let d = 0; d < END_DELAYS[w]; d++) yield;
  }
  // FadeScreenBlack.
  win.fill(1);
  win.copyToVram();
  yield;
}

/** InitBlackWipe / UpdateBlackWipe: the line's points, a step along its longer axis each. */
function* line(x0: number, y0: number, x1: number, y1: number): Generator<[number, number], void, void> {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x1 > x0 ? 1 : -1;
  const sy = y1 > y0 ? 1 : -1;
  let x = x0;
  let y = y0;
  let err = 0;
  yield [x, y];
  if (dx >= dy) {
    while (x !== x1) {
      x += sx;
      err += dy;
      if (err * 2 >= dx) {
        y += sy;
        err -= dx;
      }
      yield [x, y];
    }
  } else {
    while (y !== y1) {
      y += sy;
      err += dx;
      if (err * 2 >= dy) {
        x += sx;
        err -= dy;
      }
      yield [x, y];
    }
  }
}
