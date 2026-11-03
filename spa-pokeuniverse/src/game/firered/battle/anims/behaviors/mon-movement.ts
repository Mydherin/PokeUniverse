// Battlers moving (battle_anim_mon_movement.c, battle_anim_ground.c): lunges, slides, shakes,
// sways and scaling. Templates with no art are invisible sprites that move a battler.

import type { Sprite } from "../../../../gba/sprites";
import { AnimBattler, type AnimSpriteTemplate, type AnimTask } from "../script";
import { cos, INVISIBLE, linear, monSprite, runSprite, sideX, sin } from "./util";


/** TranslateSpriteLinearById twice: a sprite dips by (dx, dy) a frame for `steps` frames and back. */
function dipAndBack(sprite: Sprite, mon: Sprite | null, steps: number, dx: number, dy: number, done: () => void): void {
  sprite.invisible = true;
  let [left, back] = [steps, false];
  sprite.callback = () => {
    if (mon) {
      mon.x2 += back ? -dx : dx;
      mon.y2 += back ? -dy : dy;
    }
    if (--left > 0) return;
    if (back) return done();
    back = true;
    left = steps;
  };
}

/** AnimTask_RotateMonSpriteToSide_Step: turns by `by` a frame for `steps`; mode 0 stays turned, 1 straightens, 2 turns back too. */
function* rotateMon(mon: Sprite, steps: number, start: number, by: number, mode: number, lift: boolean): Generator<void, void, void> {
  mon.affineAnimPaused = true;
  let [angle, n] = [start, 0];
  yield;
  for (;;) {
    angle = (angle + by) << 16 >> 16;
    mon.setRotScale(0x100, 0x100, angle & 0xffff);
    // SetBattlerSpriteYOffsetFromRotation: c is the rotation's sine.
    if (lift) mon.y2 = Math.abs(mon.matrixC) >> 3;
    if (++n >= steps) {
      if (mode === 2) {
        n = 0;
        by = -by;
        mode = 1;
      } else {
        if (mode === 1) {
          mon.setRotScale(0x100, 0x100, 0);
          mon.affineAnimPaused = false;
        }
        return;
      }
    }
    yield;
  }
}

export const MON_MOVEMENT_TEMPLATES: Record<string, AnimSpriteTemplate> = {
  /** DoVerticalDip: the battler (args[2]) moves by args[1] a frame for args[0] frames, and back. */
  gVerticalDipSpriteTemplate: {
    ...INVISIBLE,
    init(sprite, run, args, done) {
      dipAndBack(sprite, monSprite(run, args[2]), args[0], 0, args[1], done);
    },
  },

  /** SlideMonToOffsetAndBack: the battler slides by (args[1], args[2]) in args[4]; args[5] set: then back at its spot at once. */
  gSlideMonToOffsetAndBackSpriteTemplate: {
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
          yield* linear(args[4], dx, dy, (x, y) => ((target.x2 = x), (target.y2 = y)), target.x2 << 8, target.y2 << 8);
          if (args[5]) target.x2 = target.y2 = 0;
        })(),
        done,
      );
    },
  },

  /**
   * AnimShakeMonOrBattleTerrain: the terrain (args[3] 0 X, 1 Y) or the battlers (2 X, 3 Y; args[4]:
   * 0 attacker, 1 target, 2 both) jump by args[0] back and forth every args[1] + 1 frames, for args[2] frames.
   */
  gShakeMonOrTerrainSpriteTemplate: {
    ...INVISIBLE,
    init(sprite, run, args, done) {
      sprite.invisible = true;
      const { backdrop } = run;
      const mons = args[3] < 2 ? [] : [args[4] !== 1 ? run.attacker.sprite : null, args[4] !== 0 ? run.target.sprite : null];
      const axisX = args[3] === 0 || args[3] === 2;
      let offset = 0;
      const start = args[3] === 0 ? backdrop.scrollX : args[3] === 1 ? backdrop.scrollY : 0;
      const apply = (by: number) => {
        offset += by;
        if (args[3] === 0) backdrop.scrollX = start + offset;
        else if (args[3] === 1) backdrop.scrollY = start + offset;
        else for (const m of mons) if (m) axisX ? (m.x2 += by) : (m.y2 += by);
      };
      let [by, wait, left] = [-args[0], args[1], args[2]];
      sprite.callback = () => {
        if (left <= 0) {
          apply(-offset);
          return done();
        }
        left--;
        if (wait > 0) return void wait--;
        wait = args[1];
        apply(by);
        by = -by;
      };
    },
  },

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
  /** AnimTask_ShakeAndSinkMon: the battler shakes by args[1] every args[2] + 1 frames, sinking args[3] 1/256 a frame, args[4] frames. */
  *AnimTask_ShakeAndSinkMon(run, args) {
    const mon = monSprite(run, args[0]);
    if (!mon) return;
    mon.x2 = args[1];
    let [x, wait, sink, left] = [args[1], 0, 0, args[4]];
    for (;;) {
      if (args[2] === wait++) {
        wait = 0;
        if (mon.x2 === x) x = -x;
        mon.x2 += x;
      }
      sink += args[3];
      mon.y2 = sink >> 8;
      if (--left === 0) return;
      yield;
    }
  },

  /**
   * AnimTask_WindUpLunge: the battler backs up along a half sine (args[1] over args[3] frames,
   * height args[2]), waits args[4], lunges args[5] over args[6]; it stays there.
   */
  *AnimTask_WindUpLunge(run, args) {
    const mon = monSprite(run, args[0]);
    if (!mon) return;
    const wave = Math.trunc(0x8000 / args[3]);
    const stepX = Math.trunc((sideX(run, args[1]) * 256) / args[3]);
    const lunge = Math.trunc((sideX(run, args[5]) * 256) / args[6]);
    let [x, phase] = [0, 0];
    yield;
    for (let left = args[3]; left > 0; left--) {
      x += stepX;
      mon.x2 = x >> 8;
      mon.y2 = sin((phase >> 8) & 0xff, args[2]);
      phase += wave;
      yield;
    }
    for (let left = args[4]; left > 0; left--) yield;
    let forward = 0;
    for (let left = args[6]; left > 0; left--) {
      forward += lunge;
      mon.x2 = (forward >> 8) + (x >> 8);
      yield;
    }
  },

  /** AnimTask_SlideOffScreen: the battler slides off at args[1] a frame, away from the attacker's side. */
  *AnimTask_SlideOffScreen(run, args) {
    const mon = monSprite(run, args[0]);
    if (!mon) return;
    const by = run.target.foe ? args[1] : -args[1];
    for (;;) {
      yield;
      mon.x2 += by;
      if (mon.x2 + mon.x < -32 || mon.x2 + mon.x > 240 + 32) return;
    }
  },

  /** AnimTask_RotateMonSpriteToSide: the battler (args[2]) turns args[1] a frame for args[0] frames; args[3] see rotateMon. */
  *AnimTask_RotateMonSpriteToSide(run, args) {
    const mon = monSprite(run, args[2]);
    if (!mon) return;
    const own = run.mon(args[2] === 0 ? AnimBattler.Attacker : AnimBattler.Target);
    const mirror = !own.foe;
    const start = args[3] !== 1 ? 0 : args[0] * args[1];
    yield* rotateMon(mon, args[0], mirror ? -start : start, mirror ? -args[1] : args[1], args[3], mirror);
  },

  /** AnimTask_RotateMonToSideAndRestore: as AnimTask_RotateMonSpriteToSide, mirrored on the foe's side. */
  *AnimTask_RotateMonToSideAndRestore(run, args) {
    const mon = monSprite(run, args[2]);
    if (!mon) return;
    const own = run.mon(args[2] === 0 ? AnimBattler.Attacker : AnimBattler.Target);
    const by = own.foe ? -args[1] : args[1];
    const start = args[3] !== 1 ? 0 : args[0] * by;
    yield* rotateMon(mon, args[0], -start, -by, args[3], true);
  },

  /**
   * AnimTask_ShakeTargetBasedOnMovePowerOrDmg: the target shakes by a size from the move's power
   * (args[0] 0) or damage, every args[1] + 1 frames, args[2] times, sideways (args[3]) or down (args[4]).
   */
  *AnimTask_ShakeTargetBasedOnMovePowerOrDmg(run, args) {
    const mon = monSprite(run, AnimBattler.Target);
    if (!mon) return;
    const size = Math.max(1, Math.min(16, Math.trunc((args[0] === 0 ? (run.movePower ?? 0) : (run.moveDamage ?? 0)) / 12)));
    const half = size >> 1;
    const other = half + (size & 1);
    const startX = mon.x2;
    let [wait, on, left] = [0, 0, args[2]];
    for (;;) {
      yield;
      if (++wait <= args[1]) continue;
      wait = 0;
      on ^= 1;
      if (args[3]) mon.x2 = on ? startX + other : startX - half;
      if (args[4]) mon.y2 = on ? size : 0;
      if (--left === 0) {
        mon.x2 = mon.y2 = 0;
        return;
      }
    }
  },

  /**
   * AnimTask_ShakeBattleTerrain: the terrain jumps between (args[0], -args[1]) and (-args[0], 0),
   * args[2] times, every args[3] + 1 frames.
   */
  *AnimTask_ShakeBattleTerrain(run, args) {
    const { backdrop } = run;
    backdrop.scrollX = args[0];
    backdrop.scrollY = args[1];
    let [left, wait] = [args[2], args[3]];
    for (;;) {
      if (wait === 0) {
        backdrop.scrollX = backdrop.scrollX === args[0] ? -args[0] : args[0];
        backdrop.scrollY = backdrop.scrollY === -args[1] ? 0 : -args[1];
        wait = args[3];
        if (--left === 0) {
          backdrop.scrollX = backdrop.scrollY = 0;
          return;
        }
      } else wait--;
      yield;
    }
  },

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
