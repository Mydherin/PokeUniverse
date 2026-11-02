// Battlers moving (battle_anim_mon_movement.c, battle_anim_ground.c): lunges, slides, shakes,
// sways and scaling. Templates with no art are invisible sprites that move a battler.

import { AnimBattler, type AnimSpriteTemplate, type AnimTask } from "../script";
import { cos, linear, monSprite, runSprite, sideX, sin } from "./util";

/** An invisible sprite that only drives a behavior. */
const INVISIBLE = { width: 8, height: 8 } as const;

export const MON_MOVEMENT_TEMPLATES: Record<string, AnimSpriteTemplate> = {
  /**
   * DoHorizontalLunge: the attacker slides args[1] pixels a frame toward the foe for args[0]
   * frames, then back (TranslateSpriteLinearById both ways).
   */
  gHorizontalLungeSpriteTemplate: {
    ...INVISIBLE,
    init(sprite, run, args, done) {
      sprite.invisible = true;
      const mon = run.attacker.sprite;
      const step = sideX(run, args[1]);
      let frames = args[0];
      let back = false;
      sprite.callback = () => {
        if (mon) mon.x2 += back ? -step : step;
        if (--frames > 0) return;
        if (back) return done();
        back = true;
        frames = args[0];
      };
    },
  },

  /**
   * SlideMonToOffset: the battler (args[0]: attacker 0, target 1) slides by (args[1], args[2])
   * over args[4] frames, mirrored on the foe's side (args[3] 1: Y too), and stays there.
   */
  gSlideMonToOffsetSpriteTemplate: {
    ...INVISIBLE,
    init(sprite, run, args, done) {
      sprite.invisible = true;
      const mon = run.mon(args[0] === 0 ? AnimBattler.Attacker : AnimBattler.Target);
      if (!mon.sprite) return done();
      const target = mon.sprite;
      const dx = mon.foe ? -args[1] : args[1];
      const dy = mon.foe && args[3] === 1 ? -args[2] : args[2];
      runSprite(
        sprite,
        (function* () {
          yield;
          yield* linear(args[4], dx, dy, (x, y) => ((target.x2 = x), (target.y2 = y)));
        })(),
        done,
      );
    },
  },

  /**
   * SlideMonToOriginalPos: the battler (args[0]) slides back to its spot over args[2] frames;
   * args[1] 1 only along X, 2 only along Y.
   */
  gSlideMonToOriginalPosSpriteTemplate: {
    ...INVISIBLE,
    init(sprite, run, args, done) {
      sprite.invisible = true;
      const mon = run.mon(args[0] === 0 ? AnimBattler.Attacker : AnimBattler.Target).sprite;
      if (!mon) return done();
      const axis = args[1];
      const [x2, y2] = [mon.x2, mon.y2];
      const frames = args[2];
      const stepX = axis === 2 ? 0 : Math.trunc(((-x2 << 8) << 16 >> 16) / frames);
      const stepY = axis === 1 ? 0 : Math.trunc(((-y2 << 8) << 16 >> 16) / frames);
      let [x, y, left] = [0, 0, frames];
      sprite.callback = () => {
        if (left === 0) {
          if (axis !== 2) mon.x2 = 0;
          if (axis !== 1) mon.y2 = 0;
          return done();
        }
        left--;
        x += stepX;
        y += stepY;
        mon.x2 = (x >> 8) + x2;
        mon.y2 = (y >> 8) + y2;
      };
    },
  },
};

export const MON_MOVEMENT_TASKS: Record<string, AnimTask> = {
  /**
   * AnimTask_ShakeMon: the battler (args[0]) jumps between (args[1], args[2]) and its place,
   * args[3] times, every args[4] frames.
   */
  *AnimTask_ShakeMon(run, args) {
    const mon = monSprite(run, args[0]);
    if (!mon) return;
    const [dx, dy, times, every] = [args[1], args[2], args[3], args[4]];
    mon.x2 = dx;
    mon.y2 = dy;
    let left = times;
    let wait = every;
    for (;;) {
      if (wait === 0) {
        mon.x2 = mon.x2 === 0 ? dx : 0;
        mon.y2 = mon.y2 === 0 ? dy : 0;
        wait = every;
        if (--left === 0) {
          mon.x2 = mon.y2 = 0;
          return;
        }
      } else wait--;
      yield;
    }
  },

  /**
   * AnimTask_ShakeMon2: like AnimTask_ShakeMon, between (args[1], args[2]) and its mirror;
   * args[0] 4-7 a battler by position (4 player, 6 foe), 8 the attacker.
   */
  *AnimTask_ShakeMon2(run, args) {
    const which = args[0];
    const byPosition = which >= 4 && which <= 7 ? [run.attacker, run.target].find((m) => m.foe === (which >= 6) && which % 2 === 0) : undefined;
    const mon = which < 4 ? monSprite(run, which) : which === 8 ? run.attacker.sprite : (byPosition?.sprite ?? null);
    if (!mon || (which >= 4 && which !== 8 && mon.invisible)) return;
    const [dx, dy] = [args[1], args[2]];
    mon.x2 = dx;
    mon.y2 = dy;
    let left = args[3];
    let wait = args[4];
    for (;;) {
      if (wait === 0) {
        mon.x2 = mon.x2 === dx ? -dx : dx;
        mon.y2 = mon.y2 === dy ? -dy : dy;
        wait = args[4];
        if (--left === 0) {
          mon.x2 = mon.y2 = 0;
          return;
        }
      } else wait--;
      yield;
    }
  },

  /**
   * AnimTask_ShakeMonInPlace: the battler (args[0]) moves by (args[1], args[2]), then swings by
   * twice that back and forth args[3] times, every args[4] frames, ending half a swing back.
   */
  *AnimTask_ShakeMonInPlace(run, args) {
    const mon = monSprite(run, args[0]);
    if (!mon) return;
    mon.x2 += args[1];
    mon.y2 += args[2];
    const [dx, dy] = [args[1] * 2, args[2] * 2];
    let n = 0;
    let wait = 0;
    for (;;) {
      if (wait === 0) {
        const sign = n & 1 ? 1 : -1;
        mon.x2 += sign * dx;
        mon.y2 += sign * dy;
        wait = args[4];
        if (++n >= args[3]) {
          const half = n & 1 ? 1 : -1;
          mon.x2 += half * Math.trunc(dx / 2);
          mon.y2 += half * Math.trunc(dy / 2);
          return;
        }
      } else wait--;
      yield;
    }
  },

  /**
   * AnimTask_TranslateMonElliptical: the battler (args[0]) circles args[3] times on an ellipse
   * args[1] wide and args[2] high, 2^args[4] sine steps a frame (at most 5).
   */
  *AnimTask_TranslateMonElliptical(run, args) {
    yield* ellipse(run, args, args[1]);
  },

  /** AnimTask_TranslateMonEllipticalRespectSide: the same, mirrored when the foe attacks. */
  *AnimTask_TranslateMonEllipticalRespectSide(run, args) {
    yield* ellipse(run, args, run.attacker.foe ? -args[1] : args[1]);
  },

  /**
   * AnimTask_SwayMon: the battler (args[4]) sways args[3] half waves, args[1] pixels wide (toward
   * the foe), at args[2] (8.8 sine steps) a frame; args[0] 0 sideways, else up (bouncing on its side).
   */
  *AnimTask_SwayMon(run, args) {
    const who = args[4] === 0 ? run.attacker : run.target;
    const mon = monSprite(run, args[4]);
    if (!mon) return;
    const amplitude = run.attacker.foe ? -args[1] : args[1];
    let index = 0;
    let [flip, armed] = [0, 1];
    let left = args[3];
    yield;
    for (;;) {
      index = (index + args[2]) & 0xffff;
      const wave = index >> 8;
      const value = sin(wave, amplitude);
      if (args[0] === 0) mon.x2 = value;
      else mon.y2 = who.foe ? -Math.abs(value) : Math.abs(value);
      if ((wave > 0x7f && flip === 0 && armed === 1) || (wave < 0x7f && flip === 1 && armed === 0)) {
        flip ^= 1;
        armed ^= 1;
        if (--left === 0) {
          mon.x2 = mon.y2 = 0;
          return;
        }
      }
      yield;
    }
  },

  /**
   * AnimTask_ScaleMonAndRestore: the battler (args[3]) scales by (args[0], args[1]) a frame for
   * args[2] frames, then back; args[4] is its object mode meanwhile (1: blended).
   */
  *AnimTask_ScaleMonAndRestore(run, args) {
    const mon = monSprite(run, args[3]);
    if (!mon) return;
    const mode = mon.mode;
    mon.mode = args[4];
    mon.affineAnimPaused = true;
    let [dx, dy, frames] = [args[0], args[1], args[2]];
    let back = args[2];
    let [x, y] = [0x100, 0x100];
    for (;;) {
      yield;
      x += dx;
      y += dy;
      mon.setRotScale(x, y, 0);
      if (--frames > 0) continue;
      if (back > 0) {
        [dx, dy, frames, back] = [-dx, -dy, back, 0];
        continue;
      }
      mon.setRotScale(0x100, 0x100, 0);
      mon.affineAnimPaused = false;
      mon.mode = mode;
      return;
    }
  },

  /**
   * AnimTask_HorizontalShake: battlers (args[0]: one, 4 all, 5 the terrain) shake sideways
   * args[1] + 3 pixels for args[2] steps, every other frame, then die down over 4 steps a pixel.
   */
  *AnimTask_HorizontalShake(run, args) {
    let offset = (args[1] || 0) + 3;
    const first = offset;
    const which = args[0];
    const mons = which === 4 ? [run.attacker.sprite, run.target.sprite].filter((s) => s && !s.invisible) : [monSprite(run, which)];
    if (which !== 5 && !mons[0]) return;
    const { backdrop } = run;
    const startX = backdrop.scrollX;
    const set = (timer: number, by: number) => {
      const x = timer & 1 ? -by : by;
      if (which === 5) backdrop.scrollX = startX + x;
      else for (const s of mons) if (s) s.x2 = x;
    };
    let [timer, delay] = [0, 0];
    // Full swings, then the dying down (the terrain swings by the first offset meanwhile).
    for (let state = 0; state < 2; ) {
      yield;
      if (++delay <= 1) continue;
      delay = 0;
      set(timer, which === 5 && state === 0 ? first : offset);
      if (state === 0 && ++timer === args[2]) {
        timer = 0;
        offset--;
        state++;
      } else if (state === 1 && ++timer === 4) {
        timer = 0;
        if (--offset === 0) state++;
      }
    }
    yield;
    if (which === 5) backdrop.scrollX = startX;
    else for (const s of mons) if (s) s.x2 = 0;
  },
};

function* ellipse(run: Parameters<AnimTask>[0], args: readonly number[], width: number): Generator<void, void, void> {
  const mon = monSprite(run, args[0]);
  if (!mon) return;
  const period = 1 << Math.min(args[4], 5);
  const height = args[2];
  let left = args[3];
  let index = 0;
  for (;;) {
    mon.x2 = sin(index, width);
    mon.y2 = -cos(index, height) + height;
    index = (index + period) & 0xff;
    if (index === 0) left--;
    if (left === 0) {
      mon.x2 = mon.y2 = 0;
      return;
    }
    yield;
  }
}
