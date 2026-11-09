// The Poké Ball: a ball that opens and releases a Pokémon (it grows out with a flash of the
// ball's color) or takes it back (it shrinks and rises into the ball), with the ball-open
// sparkles and the white screen flash. Oak's speech flies the Pokémon out in an arc
// (`release`); battles have it come out where it stands (`releaseInBattle`) and go back with
// no ball on screen (`switchOutEffect`). Every ball has its art, its sparkles and its color
// (`BALLS`); the battle's throw is battle/anims/behaviors/ball.ts.

import { Item } from "@pokeuniverse/contracts/item/v1/catalog";
import type { AnimCmd, AffineCmd, Sprite, SpriteTemplate } from "../gba/sprites";
import type { Task } from "../gba/tasks";
import { SIN, s16 } from "../gba/trig";
import { rgb, RGB_WHITE } from "../gba/video";
import type { Flow } from "./flow";
import type { GraphicId } from "./manifest";

/** The Pokémon's scale animations outside battle (gAffineAnims_BattleSpritePlayerSide). */
export const enum MonAffine {
  Normal = 0,
  Emerge = 1,
  Return = 2,
}

export const MON_AFFINE_ANIMS = [
  [{ xScale: 0x100, yScale: 0x100, duration: 0 }, "end"],
  [{ xScale: 0x28, yScale: 0x28, duration: 0 }, { xScale: 0x12, yScale: 0x12, duration: 12 }, "end"],
  [{ xScale: -0x2, yScale: -0x2, duration: 18 }, { xScale: -0x10, yScale: -0x10, duration: 15 }, "end"],
] as const satisfies SpriteTemplate["affineAnims"];

/** FireRed's BALL_* (its 12 balls), then the expansion's Gen 4 three. */
export const enum BallId {
  Poke,
  Great,
  Safari,
  Ultra,
  Master,
  Net,
  Dive,
  Nest,
  Repeat,
  Timer,
  Luxury,
  Premier,
  Heal,
  Dusk,
  Quick,
}

/** sBallParticleAnimationFuncs: how the sparkles fly out when the ball opens. */
const enum Open {
  Poke,
  Great,
  Safari,
  Ultra,
  Master,
  Dive,
  Repeat,
  Timer,
  Premier,
}

interface Ball {
  art: GraphicId;
  /** sBallOpenFadeColors: the Pokémon's color going in or out. */
  color: number;
  /** sBallParticleAnimNums. */
  anim: number;
  open: Open;
  /** The expansion's balls' sparkles (particles2.png, its own colors). */
  particles2?: boolean;
}

/** gBallSpriteSheets, sBallOpenFadeColors, sBallParticleAnimNums, sBallParticleAnimationFuncs (the expansion's battle_anim_throw.c for Heal, Dusk, Quick). */
export const BALLS: readonly Ball[] = [
  { art: "pokeBall", color: rgb(31, 22, 30), anim: 0, open: Open.Poke },
  { art: "ball_great", color: rgb(16, 23, 30), anim: 0, open: Open.Great },
  { art: "ball_safari", color: rgb(23, 30, 20), anim: 0, open: Open.Safari },
  { art: "ball_ultra", color: rgb(31, 31, 15), anim: 5, open: Open.Ultra },
  { art: "ball_master", color: rgb(23, 20, 28), anim: 1, open: Open.Master },
  { art: "ball_net", color: rgb(21, 31, 25), anim: 2, open: Open.Safari },
  { art: "ball_dive", color: rgb(12, 25, 30), anim: 2, open: Open.Dive },
  { art: "ball_nest", color: rgb(30, 27, 10), anim: 3, open: Open.Ultra },
  { art: "ball_repeat", color: rgb(31, 24, 16), anim: 5, open: Open.Repeat },
  { art: "ball_timer", color: rgb(29, 30, 30), anim: 5, open: Open.Timer },
  { art: "ball_luxury", color: rgb(31, 17, 10), anim: 4, open: Open.Great },
  { art: "ball_premier", color: rgb(31, 9, 10), anim: 4, open: Open.Premier },
  { art: "ball_heal", color: rgb(31, 23, 27), anim: 0, open: Open.Poke, particles2: true },
  { art: "ball_dusk", color: rgb(7, 1, 13), anim: 2, open: Open.Ultra, particles2: true },
  { art: "ball_quick", color: rgb(16, 25, 30), anim: 4, open: Open.Ultra, particles2: true },
];

const BALL_OF_ITEM: Partial<Record<number, BallId>> = {
  [Item.MASTER_BALL]: BallId.Master,
  [Item.ULTRA_BALL]: BallId.Ultra,
  [Item.GREAT_BALL]: BallId.Great,
  [Item.SAFARI_BALL]: BallId.Safari,
  [Item.NET_BALL]: BallId.Net,
  [Item.DIVE_BALL]: BallId.Dive,
  [Item.NEST_BALL]: BallId.Nest,
  [Item.REPEAT_BALL]: BallId.Repeat,
  [Item.TIMER_BALL]: BallId.Timer,
  [Item.LUXURY_BALL]: BallId.Luxury,
  [Item.PREMIER_BALL]: BallId.Premier,
  [Item.HEAL_BALL]: BallId.Heal,
  [Item.DUSK_BALL]: BallId.Dusk,
  [Item.QUICK_BALL]: BallId.Quick,
};

/** ItemIdToBallId: the Poké Ball for anything else. */
export const ballIdOf = (item: Item | undefined): BallId => BALL_OF_ITEM[item ?? 0] ?? BallId.Poke;

const sheetTag = (ball: BallId) => `ball${ball}`;
const particleTag = (ball: BallId) => (BALLS[ball].particles2 ? "ballParticles2" : "ballParticles");

/** sAffineAnim_BallRotate: still, rolling right, rolling left, reset, spinning. */
export const enum BallAffine {
  Still,
  RotateRight,
  RotateLeft,
  Reset,
  Spin,
}

const BALL_AFFINE: AffineCmd[][] = [
  [{ xScale: 0, yScale: 0, rotation: 0, duration: 1 }, { jump: 0 }],
  [{ xScale: 0, yScale: 0, rotation: -3, duration: 1 }, { jump: 0 }],
  [{ xScale: 0, yScale: 0, rotation: 3, duration: 1 }, { jump: 0 }],
  [{ xScale: 256, yScale: 256, rotation: 0, duration: 0 }, "end"],
  [{ xScale: 0, yScale: 0, rotation: 25, duration: 1 }, { jump: 0 }],
];

/** gBallSpriteTemplates: closed, opening, closing. */
const ballTemplate = (ball: BallId): SpriteTemplate => ({
  sheet: sheetTag(ball),
  palette: sheetTag(ball),
  width: 16,
  height: 16,
  priority: 2,
  affine: true,
  anims: [
    [{ image: 0, duration: 1 }, "end"],
    [{ image: 4, duration: 5 }, { image: 8, duration: 5 }, "end"],
    [{ image: 4, duration: 5 }, { image: 0, duration: 5 }, "end"],
  ],
  affineAnims: BALL_AFFINE,
});

/** sAnims_BallParticles. */
const PARTICLE_ANIMS: AnimCmd[][] = [
  [
    { image: 0, duration: 1 },
    { image: 1, duration: 1 },
    { image: 2, duration: 1 },
    { image: 0, duration: 1, hFlip: true },
    { image: 2, duration: 1 },
    { image: 1, duration: 1 },
    { jump: 0 },
  ],
  [{ image: 3, duration: 1 }, "end"],
  [{ image: 4, duration: 1 }, "end"],
  [{ image: 5, duration: 1 }, "end"],
  [{ image: 6, duration: 4 }, { image: 7, duration: 4 }, { jump: 0 }],
  [{ image: 7, duration: 4 }, "end"],
];

const particleTemplate = (ball: BallId): SpriteTemplate => ({
  sheet: particleTag(ball),
  palette: particleTag(ball),
  width: 8,
  height: 8,
  priority: 0,
  anims: PARTICLE_ANIMS,
});

/** gBattleAnimArgs-free sparkles alive (numBallParticles): their art is freed with the last. */
let liveParticles = 0;

// Ball sprite data
const MON = 0;
const DELAY = 1;
const MON_PAL = 2;
const FADE_LO = 3;
const FADE_HI = 4;
const FINAL_X = 5;
const TIMER = 5;
const FINAL_Y = 6;
const TRIG = 7;

export class PokeBalls {
  /** Which ball each ball sprite is. */
  private readonly kinds = new WeakMap<Sprite, BallId>();

  constructor(private readonly flow: Flow) {}

  /** LoadBallGfx: the ball's art and colors, once. */
  loadGfx(ball: BallId): void {
    const { gba, assets } = this.flow;
    const art = assets.get(BALLS[ball].art);
    gba.sprites.loadSheet(sheetTag(ball), art.tiles);
    gba.palettes.loadSpritePalette(sheetTag(ball), art.palette);
  }

  /** FreeBallGfx. */
  freeGfx(ball: BallId): void {
    const { gba } = this.flow;
    gba.sprites.freeSheet(sheetTag(ball));
    gba.palettes.freeSpritePalette(sheetTag(ball));
  }

  /** The ball's sprite (gBallSpriteTemplates), its art loaded. */
  sprite(ball: BallId, x: number, y: number, subpriority: number): Sprite {
    this.loadGfx(ball);
    const sprite = this.flow.gba.sprites.create(ballTemplate(ball), x, y, subpriority)!;
    this.kinds.set(sprite, ball);
    return sprite;
  }

  private createBall(mon: Sprite, x: number, y: number, priority: number, subpriority: number, delay: number, fade: number, kind = BallId.Poke): Sprite {
    const ball = this.sprite(kind, x, y, subpriority);
    ball.data[MON] = this.flow.gba.sprites.slots.indexOf(mon);
    ball.data[DELAY] = delay;
    ball.data[MON_PAL] = mon.paletteNum;
    ball.data[FADE_LO] = fade & 0xffff;
    ball.data[FADE_HI] = fade >>> 16;
    ball.priority = priority;
    return ball;
  }

  private mon(ball: Sprite): Sprite {
    return this.flow.gba.sprites.slots[ball.data[MON]];
  }

  /** A ball with no Pokémon in it, thrown at a spot (the caller moves it and destroys it). */
  flying(x: number, y: number, priority: number, subpriority: number, kind = BallId.Poke): Sprite {
    const ball = this.sprite(kind, x, y, subpriority);
    ball.priority = priority;
    return ball;
  }

  /** CreatePokeballSpriteToReleaseMon: the Pokémon comes out after `delay` frames, then moves home. */
  release(mon: Sprite, x: number, y: number, priority: number, subpriority: number, delay: number, fade: number): Sprite {
    const ball = this.createBall(mon, x, y, priority, subpriority, delay, fade);
    ball.data[FINAL_X] = mon.x;
    ball.data[FINAL_Y] = mon.y;
    mon.x = x;
    mon.y = y;
    mon.invisible = true;
    ball.callback = (b) => {
      if (b.data[DELAY]) {
        b.data[DELAY]--;
        return;
      }
      this.open(b);
      const m = this.mon(b);
      b.callback = (s) => this.flyOut(s);
      m.invisible = false;
      m.startAffineAnim(MonAffine.Emerge);
      this.flow.gba.sprites.animateSprite(m);
      m.data[1] = 0x1000;
      b.data[TRIG] = 0;
    };
    return ball;
  }

  /** SpriteCB_ReleaseMonFromBall: in battle the Pokémon comes out where it stands, rising as it grows. */
  releaseInBattle(mon: Sprite, x: number, y: number, priority: number, subpriority: number, delay: number, kind = BallId.Poke): Sprite {
    // Palettes 1 to 3 (the terrain's) flash white.
    const ball = this.createBall(mon, x, y, priority, subpriority, delay, 14, kind);
    mon.invisible = true;
    ball.callback = (b) => {
      if (b.data[DELAY]) {
        b.data[DELAY]--;
        return;
      }
      this.open(b);
      const m = this.mon(b);
      b.callback = (s) => this.emerge(s);
      m.invisible = false;
      m.startAffineAnim(MonAffine.Emerge);
      this.flow.gba.sprites.animateSprite(m);
      m.data[1] = 0x1000;
    };
    return ball;
  }

  /** HandleBallAnimEnd: done once both the ball's animation and the Pokémon's growth end. */
  private emerge(ball: Sprite): void {
    const mon = this.mon(ball);
    let emerged = false;
    if (ball.animEnded) ball.invisible = true;
    if (mon.affineEnded) {
      mon.startAffineAnim(MonAffine.Normal);
      emerged = true;
    } else {
      mon.data[1] -= 288;
      mon.y2 = mon.data[1] >> 8;
    }
    if (ball.animEnded && emerged) {
      mon.y2 = 0;
      this.destroyBall(ball);
    }
  }

  private flyOut(ball: Sprite): void {
    const mon = this.mon(ball);
    let emerged = false;
    let home = false;
    if (ball.animEnded) ball.invisible = true;
    if (mon.affineEnded) {
      mon.startAffineAnim(MonAffine.Normal);
      emerged = true;
    }
    const trig = ball.data[TRIG];
    // u16 positions, as the game's.
    mon.x = s16((Math.trunc(((ball.data[FINAL_X] - ball.x) * trig) / 128) + ball.x) & 0xffff);
    mon.y = s16((Math.trunc(((ball.data[FINAL_Y] - ball.y) * trig) / 128) + ball.y) & 0xffff);
    if (trig < 128) {
      const sine = -Math.trunc(SIN[trig & 0xff] / 8);
      ball.data[TRIG] += 4;
      mon.x2 = mon.y2 = sine;
    } else {
      mon.x = ball.data[FINAL_X];
      mon.y = ball.data[FINAL_Y];
      mon.x2 = mon.y2 = 0;
      home = true;
    }
    if (ball.animEnded && emerged && home) this.destroyBall(ball);
  }

  /** CreateTradePokeballSprite: after `delay` frames the ball opens and takes the Pokémon in. */
  takeBack(mon: Sprite, x: number, y: number, priority: number, subpriority: number, delay: number, fade: number): Sprite {
    const ball = this.createBall(mon, x, y, priority, subpriority, delay, fade);
    ball.callback = (b) => {
      if (b.data[DELAY]) {
        b.data[DELAY]--;
        return;
      }
      this.open(b);
      const m = this.mon(b);
      b.callback = (s) => this.sendOff(s);
      m.startAffineAnim(MonAffine.Return);
      this.flow.gba.sprites.animateSprite(m);
      m.data[1] = 0;
    };
    return ball;
  }

  private sendOff(ball: Sprite): void {
    if (++ball.data[TIMER] === 11) this.flow.play("se_ball_trade");
    const mon = this.mon(ball);
    if (mon.affineEnded) {
      ball.startAnim(2);
      mon.invisible = true;
      ball.data[TIMER] = 0;
      ball.callback = (b) => {
        if (b.animEnded) b.callback = () => {};
      };
    } else {
      mon.data[1] += 96;
      mon.y2 = -mon.data[1] >> 8;
    }
  }

  /**
   * AnimTask_SwitchOutBallEffect: a Pokémon going back in battle has no ball on screen, only the
   * sparkles, its palette fading to the ball's color and the terrain's flash. Over when the task ends.
   */
  switchOutEffect(mon: Sprite, x: number, y: number, kind = BallId.Poke): Task {
    this.particles(x, y, mon.priority, mon.subpriority, kind);
    return this.fadeMon(mon.paletteNum, 14, kind, false);
  }

  /** The ball opens: its animation, the sparkles and the flash. */
  private open(ball: Sprite): void {
    const fade = ((ball.data[FADE_LO] & 0xffff) | ((ball.data[FADE_HI] & 0xffff) << 16)) >>> 0;
    ball.startAnim(1);
    const kind = this.kinds.get(ball) ?? BallId.Poke;
    this.particles(ball.x, ball.y - 5, ball.priority, ball.subpriority ? ball.subpriority - 1 : 0, kind);
    this.fadeMon(ball.data[MON_PAL], fade, kind);
  }

  private destroyBall(ball: Sprite): void {
    const { gba } = this.flow;
    gba.sprites.destroy(ball);
    this.freeGfx(this.kinds.get(ball) ?? BallId.Poke);
  }

  /** LoadBallParticleGfx. */
  private loadParticles(kind: BallId): void {
    const { gba, assets } = this.flow;
    const tag = particleTag(kind);
    if (BALLS[kind].particles2) {
      const art = assets.get("ballParticles2");
      gba.sprites.loadSheet(tag, art.tiles);
      gba.palettes.loadSpritePalette(tag, art.palette);
    } else {
      gba.sprites.loadSheet(tag, assets.get("ballParticles").tiles);
      gba.palettes.loadSpritePalette(tag, assets.get("ballParticlesPal").palette);
    }
  }

  /** A sparkle (sBallParticlesSpriteTemplates) moving by `step` each frame, then DestroyBallOpenAnimationParticle. */
  particle(kind: BallId, x: number, y: number, priority: number, subpriority: number, anim: number, step: (sprite: Sprite) => boolean): Sprite | null {
    const { gba } = this.flow;
    this.loadParticles(kind);
    const sprite = gba.sprites.create(particleTemplate(kind), x, y, subpriority);
    if (!sprite) return null;
    liveParticles++;
    sprite.startAnim(anim);
    sprite.priority = priority;
    sprite.callback = (s) => {
      if (!step(s)) return;
      gba.sprites.destroy(s);
      if (--liveParticles === 0)
        for (const tag of ["ballParticles", "ballParticles2"]) {
          gba.sprites.freeSheet(tag);
          gba.palettes.freeSpritePalette(tag);
        }
    };
    return sprite;
  }

  /** AnimateBallOpenParticles: the ball's sparkles fly out (sBallParticleAnimationFuncs) with SE_BALL_OPEN. */
  particles(x: number, y: number, priority: number, subpriority: number, kind = BallId.Poke): void {
    const { gba } = this.flow;
    const { anim, open } = BALLS[kind];
    const make = (step: (sprite: Sprite) => boolean, phase: number) => {
      const sprite = this.particle(kind, x, y, priority, subpriority, anim, step);
      if (sprite) sprite.data[0] = phase;
      return sprite;
    };
    // FanOutBallOpenParticles_Step1: an ellipse growing by (d5, d6), turning by d4, 51 frames.
    const fan = (count: number, spacing: number, turn: number, growX: number, growY: number) => {
      for (let i = 0; i < count; i++) {
        const sprite = make((s) => {
          const d = s.data;
          s.x2 = sinOf(d[0], d[1]);
          s.y2 = cosOf(d[0], d[2]);
          d[0] = (d[0] + d[4]) & 0xff;
          d[1] += d[5];
          d[2] += d[6];
          return ++d[3] === 51;
        }, i * spacing);
        if (sprite) [sprite.data[4], sprite.data[5], sprite.data[6]] = [turn, growX, growY];
      }
    };
    // The Repeat and Premier Balls' own: an ellipse squashed by a sine.
    const wave = (count: number, spacing: number, turn: number, mask: number) => {
      for (let i = 0; i < count; i++)
        make((s) => {
          const d = s.data;
          s.x2 = sinOf(d[0], d[1]);
          s.y2 = cosOf(d[0], sinOf(d[0] & mask, d[2]));
          d[0] = (d[0] + turn) & 0xff;
          d[1]++;
          d[2]++;
          return ++d[3] === 51;
        }, i * spacing);
    };
    switch (open) {
      case Open.Poke:
        // PokeBallOpenParticleAnimation: 16, one a frame, each waiting its turn then a growing circle.
        gba.tasks.create((task: Task) => {
          const n = task.data[0];
          const sprite = this.particle(kind, x, y, priority, subpriority, anim, (s) => {
            // PokeBallOpenParticleAnimation_Step1: waits, then Step2 from the next frame.
            if (!s.data[2]) {
              if (s.data[1] === 0) s.data[2] = 1;
              else s.data[1]--;
              return false;
            }
            s.x2 = sinOf(s.data[0], s.data[1]);
            s.y2 = cosOf(s.data[0], s.data[1]);
            s.data[1] += 2;
            return s.data[1] === 50;
          });
          if (sprite) sprite.data[0] = (n >= 8 ? n - 8 : n) * 32;
          if (n === 15) gba.tasks.destroy(task);
          else task.data[0]++;
        }, 5);
        break;
      case Open.Great: {
        // Twice, 8 frames apart.
        let wait = 0;
        let sets = 0;
        gba.tasks.create((task: Task) => {
          if (wait) {
            wait--;
            return;
          }
          fan(8, 32, 8, 2, 2);
          wait = 8;
          if (++sets === 2) gba.tasks.destroy(task);
        }, 5);
        break;
      }
      case Open.Safari:
        fan(8, 32, 4, 1, 1);
        break;
      case Open.Ultra:
        fan(10, 25, 5, 1, 1);
        break;
      case Open.Master:
        fan(8, 32, 8, 2, 1);
        fan(8, 32, 8, 1, 2);
        break;
      case Open.Dive:
        fan(8, 32, 10, 1, 2);
        break;
      case Open.Timer:
        fan(8, 32, 10, 2, 1);
        break;
      case Open.Repeat:
        wave(12, 21, 6, 0xff);
        break;
      case Open.Premier:
        wave(8, 32, 10, 0x3f);
        break;
    }
    this.flow.play("se_ball_open");
  }

  /**
   * LaunchBallFadeMonTask: the Pokémon's palette `monPal` turns the ball's color and `selected`
   * flashes white; then (`unfadeLater`) the flash ends and the color returns over 17 frames, or
   * (going in) the color comes over 17 frames and the flash ends after.
   */
  fadeMon(monPal: number, selected: number, kind = BallId.Poke, unfadeLater = true): Task {
    const { gba } = this.flow;
    const { palettes } = gba;
    const offset = 256 + monPal * 16;
    const color = BALLS[kind].color;
    palettes.blendPalette(offset, 16, unfadeLater ? 16 : 0, color);
    let waiting = unfadeLater;
    const task = gba.tasks.create((t: Task) => {
      const d = t.data;
      if (waiting) {
        // Task_FadeMon_ToNormal: the flash ends first.
        if (palettes.fadeActive) return;
        palettes.beginFade(selected, 0, 16, 0, RGB_WHITE);
        waiting = false;
      } else if (d[2] <= 16) {
        palettes.blendPalette(offset, 16, d[0], color);
        d[0] += d[1];
        d[2]++;
      } else if (unfadeLater) gba.tasks.destroy(t);
      else if (!palettes.fadeActive) {
        // Task_FadeMon_ToBallColor: then the flash ends.
        palettes.beginFade(selected, 0, 16, 0, RGB_WHITE);
        gba.tasks.destroy(t);
      }
    }, 5);
    task.data[0] = unfadeLater ? 16 : 0;
    task.data[1] = unfadeLater ? -1 : 1;
    palettes.beginFade(selected, 0, 0, 16, RGB_WHITE);
    return task;
  }
}

const sinOf = (index: number, amplitude: number) => (SIN[index & 0xff] * amplitude) >> 8;
const cosOf = (index: number, amplitude: number) => (SIN[(index & 0xff) + 64] * amplitude) >> 8;
