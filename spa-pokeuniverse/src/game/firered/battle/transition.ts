// The battle transition on the field (battle_transition.c): the intro (the field fades to gray
// and back twice), then a wild battle's transition (SLICE, WHITE_BARS_FADE) or B_TRANSITION_ANGLED_WIPES, the trainer transition FireRed picks indoors
// when the foe isn't weaker: seven black wipes along slanted lines, each row's visible part cut
// to one side of the line (the game's per-scanline WIN0), until the screen is black.

import { Window } from "../../gba/text";
import { BattleTransition } from "@pokeuniverse/contracts/battle/v1/view";
import { rgb, RGB_BLACK, RGB_WHITE } from "../../gba/video";
import { initBg } from "../common";
import type { Flow } from "../flow";
import type { Graphic } from "../manifest";
import { sin } from "./anims/behaviors/util";

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

/**
 * The whole transition, a frame per step; the screen is black when it ends. `wild`: the wild
 * battle's (sBattleTransitionTable_Wild, picked by mic-core); none: the trainer's angled wipes.
 */
export function* battleTransition(flow: Flow, wild?: BattleTransition): Generator<void, void, void> {
  yield* intro(flow);
  if (wild === undefined || wild === BattleTransition.UNSPECIFIED) return yield* angledWipes(flow);
  // The field is drawn apart from the GBA screen: its picture, taken once, is what the effects move.
  let field: Uint16Array | null = null;
  let ready = false;
  flow.world.snapshot().then(
    (f) => ((field = f), (ready = true)),
    () => (ready = true),
  );
  while (!ready) yield;
  const screen = new Uint16Array(WIDTH * HEIGHT);
  const { video } = flow.gba;
  video.underlay = screen;
  const src = field ?? screen;
  switch (wild) {
    case BattleTransition.WHITE_BARS_FADE:
      yield* whiteBarsFade(src, screen);
      break;
    case BattleTransition.CLOCKWISE_WIPE:
      yield* clockwiseWipe(src, screen);
      break;
    case BattleTransition.GRID_SQUARES:
      yield* gridSquares(flow, src, screen);
      break;
    case BattleTransition.BLUR:
      yield* blur(src, screen);
      break;
    case BattleTransition.WAVE:
      yield* wave(src, screen);
      break;
    case BattleTransition.RIPPLE:
      yield* ripple(src, screen);
      break;
    default:
      yield* slice(src, screen);
  }
  // FadeScreenBlack; the black stays until the battle's screen resets the video.
  screen.fill(RGB_BLACK);
  yield;
}

/** Task_Slice: odd rows slide left, even rows right, faster and faster, black behind. */
function* slice(field: Uint16Array, screen: Uint16Array): Generator<void, void, void> {
  let speed = 1 << 8;
  let accel = 1;
  let effectX = 0;
  while (effectX < WIDTH) {
    effectX = Math.min(WIDTH, effectX + (speed >> 8));
    if (speed <= 0xfff) speed += accel;
    if (accel < 128) accel <<= 1;
    for (let y = 0; y < HEIGHT; y++) {
      const row = y * WIDTH;
      // BGx HOFS = camera ± effectX; WIN0H keeps only the part still on screen.
      const shift = y & 1 ? effectX : -effectX;
      for (let x = 0; x < WIDTH; x++) {
        const from = x + shift;
        screen[row + x] = from >= 0 && from < WIDTH ? field[row + from] : RGB_BLACK;
      }
    }
    yield;
  }
}

/** sWhiteBarsFade_StartDelays: each of the six bars' wait. */
const WHITE_BAR_DELAYS = [0, 9, 15, 6, 12, 3];
const WHITE_BAR_HEIGHT = 1 + Math.trunc(HEIGHT / 6);

/**
 * Task_WhiteBarsFade: six bars sweep in from the right, 24 pixels a frame, lightening what they
 * cover more and more (BLDY per row, WIN0H); then the screen is white and darkens to black.
 */
function* whiteBarsFade(field: Uint16Array, screen: Uint16Array): Generator<void, void, void> {
  const bldY = new Uint8Array(HEIGHT);
  const right = new Uint8Array(HEIGHT).fill(WIDTH);
  const bars = WHITE_BAR_DELAYS.map((delay, i) => ({ y: i * WHITE_BAR_HEIGHT, delay, x: WIDTH, fade: 0, finished: false, gone: false, main: i === 5 }));
  let counter = 0;
  while (counter < bars.length) {
    for (const bar of bars) {
      if (bar.gone) continue;
      if (bar.delay) {
        bar.delay--;
        continue;
      }
      // The last bar is 2 pixels shorter: six of 27 would be 162.
      const rows = bar.main ? WHITE_BAR_HEIGHT - 2 : WHITE_BAR_HEIGHT;
      for (let i = 0; i < rows; i++) {
        bldY[bar.y + i] = bar.fade >> 8;
        right[bar.y + i] = bar.x & 0xff;
      }
      if (bar.x === 0 && bar.fade === 16 << 8) bar.finished = true;
      bar.x = Math.max(0, bar.x - 24);
      bar.fade = Math.min(16 << 8, bar.fade + 192);
      if (bar.finished && (!bar.main || counter > 4)) {
        counter++;
        bar.gone = true;
      }
    }
    for (let y = 0; y < HEIGHT; y++) {
      const row = y * WIDTH;
      const evy = Math.min(16, bldY[y]);
      for (let x = 0; x < WIDTH; x++) screen[row + x] = x < right[y] ? field[row + x] : lighten(field[row + x], evy);
    }
    yield;
  }
  // BlendPalettes to white, then BLDY's darken 480/256 a frame until past 16.
  screen.fill(RGB_WHITE);
  yield;
  for (let fade = 480; fade >> 8 <= 16; fade += 480) {
    screen.fill(darken(RGB_WHITE, fade >> 8));
    yield;
  }
}

/** Task_Wave: black comes in from the left along a sine edge (WIN0H per row), 8 pixels a frame. */
function* wave(field: Uint16Array, screen: Uint16Array): Generator<void, void, void> {
  let tx = 0;
  let base = 0;
  for (let finished = false; !finished; ) {
    let index = base;
    base = (base + 16) & 0xff;
    tx += 8;
    finished = true;
    for (let y = 0; y < HEIGHT; y++, index = (index + 4) & 0xff) {
      const edge = Math.max(0, Math.min(WIDTH, tx + sin(index, 40)));
      if (edge < WIDTH) finished = false;
      const row = y * WIDTH;
      for (let x = 0; x < WIDTH; x++) screen[row + x] = x >= edge ? field[row + x] : RGB_BLACK;
    }
    yield;
  }
}

/** Task_Ripple: each row shown from a row above or below by a growing sine (BGx VOFS); a fast fade to black from frame 41. */
function* ripple(field: Uint16Array, screen: Uint16Array): Generator<void, void, void> {
  let sinVal = 0;
  let amplitude = 0;
  let fade = -1;
  for (let timer = 1; fade < 16; timer++) {
    const amp = amplitude >> 8;
    let v = sinVal;
    sinVal = (sinVal + 0x400) & 0xffff;
    if (amplitude <= 0x1fff) amplitude += 384;
    // BeginNormalPaletteFade(-8, 0 → 16): 10 a frame.
    if (timer === 41) fade = 0;
    else if (fade >= 0) fade = Math.min(16, fade + 10);
    for (let y = 0; y < HEIGHT; y++, v = (v + 384) & 0xffff) {
      const from = Math.max(0, Math.min(HEIGHT - 1, y + sin(v >> 8, amp)));
      const row = y * WIDTH;
      const src = from * WIDTH;
      for (let x = 0; x < WIDTH; x++) screen[row + x] = toBlack(field[src + x], Math.max(0, fade));
    }
    yield;
  }
}

/** Task_Blur: the field's mosaic grows a pixel every 3 frames; from the tenth step it fades to black, 3 a frame. */
function* blur(field: Uint16Array, screen: Uint16Array): Generator<void, void, void> {
  let delay = 0;
  let counter = 0;
  let fade = -1;
  while (counter <= 14 || (fade >= 0 && fade < 16)) {
    if (fade >= 0) fade = Math.min(16, fade + 3);
    if (counter <= 14) {
      if (delay) delay--;
      else {
        delay = 2;
        if (++counter === 10) fade = 0;
      }
    }
    // MOSAIC: blocks of counter + 1 pixels each way, each the color of its top-left pixel.
    const size = (counter & 0xf) + 1;
    for (let y = 0; y < HEIGHT; y++) {
      const src = (y - (y % size)) * WIDTH;
      const row = y * WIDTH;
      for (let x = 0; x < WIDTH; x++) screen[row + x] = toBlack(field[src + x - (x % size)], Math.max(0, fade));
    }
    yield;
  }
}

/** Task_GridSquares: BG0 filled with one tile, redrawn every 3 frames from grid_square.png's 14 stages (the squares close). */
function* gridSquares(flow: Flow, field: Uint16Array, screen: Uint16Array): Generator<void, void, void> {
  let art: Graphic | null = null;
  let ready = false;
  flow.assets.animArt({ png: "battle_transitions/grid_square.png", pal: "battle_transitions/sliding_pokeball.pal" }).then(
    (g) => ((art = g), (ready = true)),
    () => (ready = true),
  );
  while (!ready) yield;
  const g = art as Graphic | null;
  const draw = (stage: number) => {
    const tile = g?.tiles.subarray(stage * 64, stage * 64 + 64);
    for (let y = 0; y < HEIGHT; y++)
      for (let x = 0; x < WIDTH; x++) {
        const c = tile ? tile[(y & 7) * 8 + (x & 7)] : 0;
        screen[y * WIDTH + x] = c ? g!.palette[c] : field[y * WIDTH + x];
      }
  };
  draw(0);
  let delay = 0;
  for (let stage = 0; stage <= 13; ) {
    if (delay === 0) {
      delay = 3;
      draw(++stage);
    }
    delay--;
    yield;
  }
  for (let d = 15; d > 0; d--) yield;
}

/**
 * Task_ClockwiseWipe: black sweeps clockwise from 12 o'clock around the center, its hand's end
 * moving along the screen's edges (32 or 16 pixels a frame). FireRed's last quarter (ClockwiseWipe_Left
 * and _TopLeft, the decomp's BUG note) shows nothing new: the hand stops at 9 o'clock for those frames.
 */
function* clockwiseWipe(field: Uint16Array, screen: Uint16Array): Generator<void, void, void> {
  const ends: [number, number][] = [];
  for (let x = WIDTH / 2; x < WIDTH; x += 32) ends.push([x, 0]);
  for (let y = 0; y < HEIGHT; y += 16) ends.push([WIDTH, y]);
  for (let x = WIDTH; x > 0; x -= 32) ends.push([x, HEIGHT]);
  const hidden = Math.ceil(HEIGHT / 16) + Math.ceil(WIDTH / 2 / 32);
  const angle = (x: number, y: number) => {
    const a = Math.atan2(x - WIDTH / 2, -(y - HEIGHT / 2));
    return a < 0 ? a + 2 * Math.PI : a;
  };
  for (const [ex, ey] of ends) {
    const hand = angle(ex, ey);
    for (let y = 0; y < HEIGHT; y++)
      for (let x = 0; x < WIDTH; x++) screen[y * WIDTH + x] = angle(x + 0.5, y + 0.5) <= hand ? RGB_BLACK : field[y * WIDTH + x];
    yield;
  }
  for (let i = 0; i < hidden; i++) yield;
}

/** A palette fade's color: `c` moved toward black by y/16. */
function toBlack(c: number, y: number): number {
  return y ? darken(c, y) : c;
}

function lighten(c: number, evy: number): number {
  let out = 0;
  for (let shift = 0; shift <= 10; shift += 5) {
    const v = (c >> shift) & 31;
    out |= (v + (((31 - v) * evy) >> 4)) << shift;
  }
  return out;
}

function darken(c: number, evy: number): number {
  let out = 0;
  for (let shift = 0; shift <= 10; shift += 5) {
    const v = (c >> shift) & 31;
    out |= (v - ((v * evy) >> 4)) << shift;
  }
  return out;
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
