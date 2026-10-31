// The intro: Game Freak logo, then Gengar vs. Nidorino in three scenes (intro-fight.ts).
// A, Start or Select skips to the title screen. Behavior, timings and numbers follow
// FireRed (rev 0: no "presents" text); the code is our own.

import { Button } from "../gba/input";
import { PALETTES_ALL } from "../gba/palette";
import type { Sprite, SpriteTemplate } from "../gba/sprites";
import type { Task } from "../gba/tasks";
import { Window } from "../gba/text";
import { randomize, SIN } from "../gba/trig";
import { Effect, Layer, RGB_BLACK, WIDTH, type Video } from "../gba/video";
import { BlendTask, fillBgRect, initBg, loadBg } from "./common";
import type { Flow } from "./flow";
import { startScene1 } from "./intro-fight";

/** One step of the intro: called once per frame with the sequence. */
export type IntroCallback = (intro: Intro) => void;

/** The intro's shared state (IntroSequenceData). */
export class Intro {
  callback: IntroCallback = introInit;
  state = 0;
  /** u16, like the game's. */
  timer = 0;
  gengarAttackLanded = false;
  readonly blend: BlendTask;
  window!: Window;
  logoSprite: Sprite | null = null;
  scene3Nidorino: Sprite | null = null;
  scene2Gengar: Sprite | null = null;
  scene2Nidorino: Sprite | null = null;
  scene3Gengars: (Sprite | null)[] = [];
  task!: Task;

  constructor(readonly flow: Flow) {
    this.blend = new BlendTask(flow.gba);
  }

  set(callback: IntroCallback): void {
    this.callback = callback;
    this.state = 0;
  }

  tick(): void {
    this.timer = (this.timer + 1) & 0xffff;
  }
}

/** CB2_SetUpIntro: three setup frames, then the sequence runs as a task. */
export function startIntro(flow: Flow): void {
  const { gba, assets } = flow;
  const { video, palettes } = gba;
  gba.setMain(() => {
    switch (gba.state) {
      case 0: {
        gba.setVBlank(null);
        gba.reset();
        video.palette.fill(0);
        palettes.fill(RGB_BLACK, 0, 512);
        // Game Freak scene: BG3 the backdrop, BG2 the text and logo window.
        initBg(video.bgs[3], 0, 3);
        initBg(video.bgs[2], 0, 2);
        break;
      }
      case 1: {
        const bg = assets.get("gfBg");
        palettes.load(bg.palette, 0, 16);
        loadBg(video.bgs[3], bg);
        palettes.load(assets.get("gfLogo").palette, 13 * 16, 16);
        break;
      }
      case 2: {
        const intro = new Intro(flow);
        intro.task = gba.tasks.create(() => {
          if (gba.input.isPressed(Button.A | Button.Start | Button.Select) && intro.callback !== exitToTitle) intro.set(exitToTitle);
          intro.callback(intro);
        }, 3);
        palettes.blendPalettes(PALETTES_ALL, 16, RGB_BLACK);
        gba.setMain(gba.runFrame);
        gba.setVBlank(gba.standardVBlank);
        return;
      }
    }
    gba.state++;
  });
}

function introInit(intro: Intro): void {
  const { gba, assets } = intro.flow;
  if (intro.state === 0) {
    const bg2 = gba.video.bgs[2];
    // BG2 shares BG3's character block; the window's tiles start at 16.
    bg2.tiles = new Uint8Array((16 + 18 * 9) * 64);
    bg2.tiles.set(gba.video.bgs[3].tiles.subarray(0, 16 * 64));
    intro.window = new Window(bg2, { left: 6, top: 4, width: 18, height: 9, palette: 13, baseBlock: 16 });
    fillBgRect(bg2, 0, 0, 0, 32, 32, 17);
    intro.window.fill(0);
    intro.window.blit(assets.get("gfText").image!, 0, 40);
    intro.window.putTilemap();
    intro.window.copyToVram();
    intro.state++;
  } else intro.set(gfOpenWindow);
}

/** A letterbox opens from the middle of the screen. */
function gfOpenWindow(intro: Intro): void {
  const { video, palettes } = intro.flow.gba;
  switch (intro.state) {
    case 0:
      video.win1On = true;
      video.winIn1 = Layer.ALL;
      video.winOut = 0;
      Object.assign(video.win1, { left: 0, right: WIDTH, top: 0, bottom: 0 });
      intro.timer = 0;
      intro.state++;
      break;
    case 1:
      video.bgs[3].visible = true;
      palettes.blendPalettes(PALETTES_ALL, 0, RGB_BLACK);
      intro.state++;
      break;
    case 2:
      intro.timer = Math.min(intro.timer + 8, 48);
      video.win1.top = 80 - intro.timer;
      video.win1.bottom = 80 + intro.timer;
      if (intro.timer === 48) intro.set(gfStar);
      break;
  }
}

function gfStar(intro: Intro): void {
  switch (intro.state) {
    case 0:
      // The jingle is a song on the BGM player.
      intro.flow.playBgm("mus_game_freak");
      loadGfxCreateStar(intro.flow);
      intro.timer = 0;
      intro.state++;
      break;
    case 1:
      intro.tick();
      if (intro.timer === 30) {
        intro.flow.gba.tasks.create(nameSparklesSmall(intro.flow), 1);
        intro.timer = 0;
        intro.state++;
      }
      break;
    case 2:
      intro.tick();
      if (intro.timer === 90) intro.set(gfRevealName);
      break;
  }
}

function gfRevealName(intro: Intro): void {
  const { gba } = intro.flow;
  const { video } = gba;
  switch (intro.state) {
    case 0:
      gba.tasks.create(nameSparklesBig(intro.flow), 2);
      intro.timer = 0;
      intro.state++;
      break;
    case 1:
      intro.tick();
      if (intro.timer >= 40) intro.state++;
      break;
    case 2:
      setBlend(video, Layer.BG2, Effect.Blend, Layer.ALL);
      intro.blend.start(0, 16, 16, 0, 48, 0);
      intro.state++;
      break;
    case 3:
      video.bgs[2].visible = true;
      intro.state++;
      break;
    case 4:
      if (!intro.blend.active) {
        setBlend(video, 0, Effect.None, 0);
        intro.timer = 0;
        intro.state++;
      }
      break;
    case 5:
      intro.tick();
      if (intro.timer > 50) intro.set(gfRevealLogo);
      break;
  }
}

function gfRevealLogo(intro: Intro): void {
  const { gba, assets } = intro.flow;
  const { video } = gba;
  switch (intro.state) {
    case 0:
      setBlend(video, Layer.OBJ, Effect.Blend, Layer.ALL);
      intro.blend.start(0, 16, 16, 0, 16, 0);
      intro.timer = 0;
      intro.state++;
      break;
    case 1:
      intro.logoSprite = gba.sprites.create(LOGO, 120, 70, 4);
      intro.state++;
      break;
    case 2:
      if (!intro.blend.active) {
        // The logo is drawn into the window, where the fading sprite was.
        intro.window.blit(assets.get("gfLogo").image!, 56, 6);
        intro.window.blit(assets.get("gfText").image!, 0, 40);
        intro.window.copyToVram();
        intro.state++;
      }
      break;
    case 3:
      gba.sprites.destroy(intro.logoSprite);
      intro.timer = 0;
      intro.state++;
      break;
    case 4:
      intro.tick();
      if (intro.timer > 90) {
        video.target1 |= Layer.BG2;
        intro.blend.start(16, 0, 0, 16, 20, 0);
        intro.state++;
      }
      break;
    case 5:
      if (!intro.blend.active) {
        video.bgs[2].visible = false;
        intro.state++;
      }
      break;
    case 6:
      gba.sprites.reset();
      gba.palettes.freeSpritePalettes();
      intro.timer = 0;
      intro.state++;
      break;
    case 7:
      intro.tick();
      if (intro.timer > 20) {
        setBlend(video, 0, Effect.None, 0);
        intro.set(startScene1);
      }
      break;
  }
}

/** BLDCNT: first targets, effect, second targets. */
export function setBlend(video: Video, target1: number, effect: Effect, target2: number): void {
  video.target1 = target1;
  video.effect = effect;
  video.target2 = target2;
}

/** All palettes black, then the title screen on the next frame. */
export function exitToTitle(intro: Intro): void {
  const { gba } = intro.flow;
  if (intro.state === 0) {
    gba.palettes.fill(RGB_BLACK, 0, 512);
    intro.state++;
  } else {
    gba.tasks.destroy(intro.task);
    intro.flow.toTitle();
  }
}

// Game Freak scene sprites

const ANIM_SPARKLE_LOOP = 0;
const ANIM_SPARKLE_ONCE = 1;
const SPARKLE_COORDS: [number, number][] = [
  [72, 80],
  [136, 74],
  [168, 80],
  [120, 80],
  [104, 86],
  [88, 74],
  [184, 74],
  [56, 86],
  [152, 86],
];

const STAR: SpriteTemplate = { sheet: "star", palette: "star", width: 16, height: 16, priority: 2, callback: starCallback };
const SPARKLES_SMALL: SpriteTemplate = {
  sheet: "sparklesSmall",
  palette: "sparkles",
  width: 8,
  height: 8,
  priority: 2,
  anims: [
    [{ image: 0, duration: 4 }, { image: 1, duration: 4 }, { image: 2, duration: 4 }, { image: 3, duration: 4 }, { jump: 0 }],
    [{ image: 0, duration: 4 }, { image: 1, duration: 4 }, { image: 2, duration: 4 }, { image: 3, duration: 4 }, "end"],
  ],
  callback: sparkleStarCallback,
};
const SPARKLES_BIG: SpriteTemplate = {
  sheet: "sparklesBig",
  palette: "sparkles",
  width: 32,
  height: 32,
  priority: 2,
  anims: [[{ image: 0, duration: 8 }, { image: 16, duration: 8 }, { image: 32, duration: 8 }, { image: 48, duration: 8 }, "end"]],
  callback: (s) => s.animEnded && gfFlow.gba.sprites.destroy(s),
};
const LOGO: SpriteTemplate = { sheet: "gfLogo", palette: "gf", width: 32, height: 64, priority: 3, mode: 1 };

// The star needs the machine from its callbacks; set when the scene loads.
let gfFlow: Flow;
/** Trail sparkles' vertical offset: kept between intro runs, as in the game. */
let sparkleYMod = 0;

function loadGfxCreateStar(flow: Flow): void {
  const { gba, assets } = flow;
  gfFlow = flow;
  gba.sprites.loadSheet("star", assets.get("gfStar").tiles);
  gba.sprites.loadSheet("sparklesSmall", assets.get("gfSparklesSmall").tiles);
  gba.sprites.loadSheet("sparklesBig", assets.get("gfSparklesBig").tiles);
  gba.sprites.loadSheet("gfLogo", assets.get("gfLogo").tiles);
  gba.palettes.loadSpritePalette("star", assets.get("gfStar").palette);
  gba.palettes.loadSpritePalette("sparkles", assets.get("gfSparkles").palette);
  gba.palettes.loadSpritePalette("gf", assets.get("gfLogo").palette);
  const star = gba.sprites.create(STAR, 248, 55, 0);
  if (!star) return;
  star.data[STAR_BASE_X] = 248 << 4;
  star.data[STAR_BASE_Y] = 55 << 4;
  star.data[STAR_SPEED_X] = 96;
  star.data[STAR_SPEED_Y] = 16;
  star.setWord(STAR_SEED, 354128453);
}

const STAR_BASE_X = 0;
const STAR_BASE_Y = 1;
const STAR_SPEED_X = 2;
const STAR_SPEED_Y = 3;
const STAR_SIN = 4;
const STAR_SPARKLE_TIMER = 5;
const STAR_SEED = 6;

function starCallback(s: Sprite): void {
  const d = s.data;
  d[STAR_BASE_X] -= d[STAR_SPEED_X];
  d[STAR_BASE_Y] += d[STAR_SPEED_Y];
  d[STAR_SIN] += 48;
  s.x = d[STAR_BASE_X] >> 4;
  s.y = d[STAR_BASE_Y] >> 4;
  s.y2 = SIN[(d[STAR_SIN] >> 4) + 64] >> 5;
  d[STAR_SPARKLE_TIMER]++;
  // A trail sparkle on 7 frames out of 8.
  if (d[STAR_SPARKLE_TIMER] % 8) {
    const seed = randomize(s.word(STAR_SEED));
    s.setWord(STAR_SEED, seed);
    createStarSparkle(s.x, s.y + s.y2, seed >>> 16);
  }
  if (s.x < -8) gfFlow.gba.sprites.destroy(s);
}

const SPARK_BASE_X = 0;
const SPARK_BASE_Y = 1;
const SPARK_SPEED_X = 2;
const SPARK_SPEED_Y = 3;
const SPARK_FALL_SPEED = 4;
const SPARK_FALL_DIST = 5;
const SPARK_TIMER = 7;

function createStarSparkle(x: number, y: number, random: number): void {
  const xMod = (random & 7) + 2;
  const yMod = sparkleYMod;
  if (++sparkleYMod > 3) sparkleYMod = -3;
  x += xMod;
  y += yMod;
  if (x <= 0 || x >= WIDTH) return;
  const s = gfFlow.gba.sprites.create(SPARKLES_SMALL, x, y, 1);
  if (!s) return;
  s.data[SPARK_BASE_X] = x << 5;
  s.data[SPARK_BASE_Y] = y << 5;
  s.data[SPARK_SPEED_X] = xMod;
  s.data[SPARK_SPEED_Y] = yMod;
}

function sparkleStarCallback(s: Sprite): void {
  const d = s.data;
  d[SPARK_BASE_X] += d[SPARK_SPEED_X];
  d[SPARK_BASE_Y] += d[SPARK_SPEED_Y];
  d[SPARK_FALL_DIST] += ++d[SPARK_FALL_SPEED];
  d[SPARK_TIMER]++;
  s.x = (d[SPARK_BASE_X] & 0xffff) >> 5;
  s.y = d[SPARK_BASE_Y] >> 5;
  if (d[SPARK_TIMER] > 90) {
    s.invisible = !s.invisible;
    if (d[SPARK_TIMER] > 120) gfFlow.gba.sprites.destroy(s);
  }
  if (s.y + s.y2 < 0 || s.y + s.y2 > 160) gfFlow.gba.sprites.destroy(s);
}

const NAME_STATE = 0;
const NAME_BASE_Y = 1;
const NAME_ANIM_TIMER = 2;
const NAME_NUM_LOOPS = 3;
const NAME_DESTROY_TIMER = 4;

/** Small sparkles over the name, 7 frames apart, twice over the 9 spots. */
function nameSparklesSmall(flow: Flow): (task: Task) => void {
  const IDX = 0;
  const LOOPS = 1;
  const TIMER = 2;
  return (task) => {
    const d = task.data;
    if (++d[TIMER] <= 6) return;
    d[TIMER] = 0;
    const [x, y] = SPARKLE_COORDS[d[IDX]];
    const s = flow.gba.sprites.create(SPARKLES_SMALL, x, y, 2);
    if (s) {
      s.startAnim(ANIM_SPARKLE_ONCE);
      s.callback = sparkleNameCallback;
      s.data[NAME_BASE_Y] = y << 4;
      s.data[NAME_ANIM_TIMER] = 120;
      s.data[NAME_NUM_LOOPS] = d[LOOPS] < 0 ? 1 : d[LOOPS];
    }
    if (++d[IDX] >= SPARKLE_COORDS.length) {
      if (++d[LOOPS] > 1) flow.gba.tasks.destroy(task);
      else d[IDX] = 0;
    }
  };
}

function sparkleNameCallback(s: Sprite): void {
  const d = s.data;
  if (d[NAME_ANIM_TIMER]) {
    d[NAME_ANIM_TIMER]--;
    d[NAME_BASE_Y]++;
    s.y = d[NAME_BASE_Y] >> 4;
    if (s.y > 86) {
      s.y = 74;
      d[NAME_BASE_Y] = 74 << 4;
    }
    if (s.animEnded) {
      // Hop 26 pixels along the name, bouncing between x 52 and 188.
      if (d[NAME_STATE] === 0) {
        s.x += 26;
        if (s.x > 188) {
          s.x = 188 * 2 - s.x;
          d[NAME_STATE] = 1;
        }
      } else {
        s.x -= 26;
        if (s.x < 52) {
          s.x = 52 * 2 - s.x;
          d[NAME_STATE] = 0;
        }
      }
      s.startAnim(ANIM_SPARKLE_ONCE);
    }
  } else {
    if (d[NAME_NUM_LOOPS]) gfFlow.gba.sprites.destroy(s);
    if (s.animEnded) s.startAnim(ANIM_SPARKLE_LOOP);
    d[NAME_BASE_Y] += 4;
    s.y = d[NAME_BASE_Y] >> 4;
    if (++d[NAME_DESTROY_TIMER] > 50) gfFlow.gba.sprites.destroy(s);
  }
}

/** Big sparkles: one every 10 frames, jumping 4 spots ahead each time. */
function nameSparklesBig(flow: Flow): (task: Task) => void {
  const TIMER = 0;
  const IDX = 1;
  const COUNT = 2;
  return (task) => {
    const d = task.data;
    if (d[TIMER] === 0) {
      const [x, y] = SPARKLE_COORDS[d[IDX]];
      d[IDX] += 4;
      if (d[IDX] >= SPARKLE_COORDS.length) d[IDX] -= SPARKLE_COORDS.length;
      flow.gba.sprites.create(SPARKLES_BIG, x, y, 3);
      if (++d[COUNT] >= SPARKLE_COORDS.length) flow.gba.tasks.destroy(task);
    }
    if (++d[TIMER] > 9) d[TIMER] = 0;
  };
}

