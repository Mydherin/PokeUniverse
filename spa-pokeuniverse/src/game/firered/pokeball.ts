// The Poké Ball: a ball that opens and releases a Pokémon (it grows out with a flash of the
// ball's color) or takes it back (it shrinks and rises into the ball), with the ball-open
// sparkles and the white screen flash. Oak's speech flies the Pokémon out in an arc
// (`release`); battles have it come out where it stands (`releaseInBattle`) and go back with
// no ball on screen (`switchOutEffect`).

import type { Sprite, SpriteTemplate } from "../gba/sprites";
import type { Task } from "../gba/tasks";
import { SIN, s16 } from "../gba/trig";
import { rgb, RGB_WHITE } from "../gba/video";
import type { Flow } from "./flow";

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

const BALL_COLOR = rgb(31, 22, 30);

const BALL: SpriteTemplate = {
  sheet: "pokeBall",
  palette: "pokeBall",
  width: 16,
  height: 16,
  priority: 2,
  affine: true,
  anims: [
    [{ image: 0, duration: 1 }, "end"],
    [{ image: 4, duration: 5 }, { image: 8, duration: 5 }, "end"],
    [{ image: 4, duration: 5 }, { image: 0, duration: 5 }, "end"],
  ],
};

const PARTICLE: SpriteTemplate = {
  sheet: "ballParticles",
  palette: "ballParticles",
  width: 8,
  height: 8,
  priority: 0,
  anims: [
    [
      { image: 0, duration: 1 },
      { image: 1, duration: 1 },
      { image: 2, duration: 1 },
      { image: 0, duration: 1, hFlip: true },
      { image: 2, duration: 1 },
      { image: 1, duration: 1 },
      { jump: 0 },
    ],
  ],
};

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
  constructor(private readonly flow: Flow) {}

  private loadGfx(): void {
    const { gba, assets } = this.flow;
    gba.sprites.loadSheet("pokeBall", assets.get("pokeBall").tiles);
    gba.palettes.loadSpritePalette("pokeBall", assets.get("pokeBall").palette);
  }

  private createBall(mon: Sprite, x: number, y: number, priority: number, subpriority: number, delay: number, fade: number): Sprite {
    this.loadGfx();
    const ball = this.flow.gba.sprites.create(BALL, x, y, subpriority)!;
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
  flying(x: number, y: number, priority: number, subpriority: number): Sprite {
    this.loadGfx();
    const ball = this.flow.gba.sprites.create(BALL, x, y, subpriority)!;
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
  releaseInBattle(mon: Sprite, x: number, y: number, priority: number, subpriority: number, delay: number): Sprite {
    // Palettes 1 to 3 (the terrain's) flash white.
    const ball = this.createBall(mon, x, y, priority, subpriority, delay, 14);
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
  switchOutEffect(mon: Sprite, x: number, y: number): Task {
    const { gba } = this.flow;
    const { palettes } = gba;
    const offset = 256 + mon.paletteNum * 16;
    const selected = 14;
    this.particles(x, y, mon.priority, mon.subpriority);
    palettes.blendPalette(offset, 16, 0, BALL_COLOR);
    const task = gba.tasks.create((t: Task) => {
      const d = t.data;
      if (d[2] <= 16) {
        palettes.blendPalette(offset, 16, d[0], BALL_COLOR);
        d[0] += d[1];
        d[2]++;
      } else if (!palettes.fadeActive) {
        palettes.beginFade(selected, 0, 16, 0, RGB_WHITE);
        gba.tasks.destroy(t);
      }
    }, 5);
    task.data[1] = 1;
    palettes.beginFade(selected, 0, 0, 16, RGB_WHITE);
    return task;
  }

  /** The ball opens: its animation, the sparkles and the flash. */
  private open(ball: Sprite): void {
    const fade = ((ball.data[FADE_LO] & 0xffff) | ((ball.data[FADE_HI] & 0xffff) << 16)) >>> 0;
    ball.startAnim(1);
    this.particles(ball.x, ball.y - 5, ball.priority, ball.subpriority ? ball.subpriority - 1 : 0);
    this.fadeMon(ball.data[MON_PAL], fade);
  }

  private destroyBall(ball: Sprite): void {
    const { gba } = this.flow;
    gba.sprites.destroy(ball);
    gba.sprites.freeSheet("pokeBall");
    gba.palettes.freeSpritePalette("pokeBall");
  }

  /** AnimateBallOpenParticles: 16 sparkles, one per frame, flying out in a circle. */
  private particles(x: number, y: number, priority: number, subpriority: number): void {
    const { gba, assets } = this.flow;
    gba.sprites.loadSheet("ballParticles", assets.get("ballParticles").tiles);
    gba.palettes.loadSpritePalette("ballParticles", assets.get("ballParticlesPal").palette);
    const step = (sprite: Sprite) => {
      sprite.x2 = (SIN[sprite.data[0] & 0xff] * sprite.data[1]) >> 8;
      sprite.y2 = (SIN[(sprite.data[0] & 0xff) + 64] * sprite.data[1]) >> 8;
      sprite.data[1] += 2;
      if (sprite.data[1] === 50) {
        gba.sprites.destroy(sprite);
        if (sprite.data[7] === 1) {
          gba.sprites.freeSheet("ballParticles");
          gba.palettes.freeSpritePalette("ballParticles");
        }
      }
    };
    gba.tasks.create((task: Task) => {
      const n = task.data[0];
      if (n < 16) {
        const sprite = gba.sprites.create(PARTICLE, x, y, subpriority);
        if (sprite) {
          sprite.startAnim(0);
          sprite.callback = (s) => {
            if (s.data[1] === 0) s.callback = step;
            else s.data[1]--;
          };
          sprite.priority = priority;
          sprite.data[0] = (n >= 8 ? n - 8 : n) * 32;
        }
        if (n === 15) {
          if (sprite) sprite.data[7] = 1;
          gba.tasks.destroy(task);
          return;
        }
      }
      task.data[0]++;
    }, 5);
    this.flow.play("se_ball_open");
  }

  /** LaunchBallFadeMonTask (unfade later): the Pokémon in the ball's color, the screen flashes white. */
  private fadeMon(monPal: number, selected: number): void {
    const { gba } = this.flow;
    const { palettes } = gba;
    const offset = 256 + monPal * 16;
    palettes.blendPalette(offset, 16, 16, BALL_COLOR);
    // Waits for the flash, fades back, then the Pokémon's color returns over 17 frames.
    let waiting = true;
    const task = gba.tasks.create((t: Task) => {
      const d = t.data;
      if (waiting) {
        if (palettes.fadeActive) return;
        palettes.beginFade(selected, 0, 16, 0, RGB_WHITE);
        waiting = false;
      } else if (d[2] <= 16) {
        palettes.blendPalette(offset, 16, d[0], BALL_COLOR);
        d[0] += d[1];
        d[2]++;
      } else gba.tasks.destroy(t);
    }, 5);
    task.data[0] = 16;
    task.data[1] = -1;
    palettes.beginFade(selected, 0, 0, 16, RGB_WHITE);
  }
}
