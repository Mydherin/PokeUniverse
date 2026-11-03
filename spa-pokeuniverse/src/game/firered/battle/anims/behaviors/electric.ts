// Electric (battle_anim_electric.c): sparks, bolts, charge orbs and Volt Tackle's run.

import type { AnimCmd, Sprite } from "../../../../gba/sprites";
import { SIN } from "../../../../gba/trig";
import type { SoundId } from "../../../manifest";
import { AnimBattler, type AnimRun, type AnimSpriteTemplate, type AnimTask } from "../script";
import { A, animEnd, battlerCoords, cos, END, F, flip, flipTarget, goneAtAffineEnd, goneAtAnimEnd, J, L, monSprite, placeAtAttacker, runSprite, sin, toTargetLocation, travel } from "./util";

const FLASHING = [[A(0, 0, 20, 1), J(0)]];
const SPARK_2 = { tag: "ANIM_TAG_SPARK_2", width: 16, height: 16, affineNormal: true } as const;
const ORB = { tag: "ANIM_TAG_CIRCLE_OF_LIGHT", width: 64, height: 64, affineNormal: true, blend: true } as const;
const LIGHTNING_ANIMS: AnimCmd[][] = [[F(0, 5), F(16, 5), F(32, 8), F(48, 5), F(64, 5), END]];
const ORB_AFFINE = [
  [A(0x10, 0x10, 0, 0), A(4, 4, 0, 60), A(0x100, 0x100, 0, 0), L(0), A(-4, -4, 0, 5), A(4, 4, 0, 5), L(10), END],
  [A(0x10, 0x10, 0, 0), A(8, 8, 0, 30), A(0x100, 0x100, 0, 0), A(-4, -4, 0, 5), A(4, 4, 0, 5), J(3)],
  [A(0x10, 0x10, 0, 0), A(8, 8, 0, 30), A(-8, -8, 0, 30), END],
];

const atBattler = (sprite: Sprite, run: AnimRun, which: number) => {
  [sprite.x, sprite.y] = run.center(which === AnimBattler.Attacker ? AnimBattler.Attacker : AnimBattler.Target);
};

/** sElectricChargingParticleCoordOffsets. */
const CHARGE_OFFSETS = [[58, -60], [-56, -36], [8, -56], [-16, 56], [58, -10], [-58, 10], [48, -18], [-8, 56], [16, -56], [-58, -42], [58, 30], [-48, 40], [12, -48], [48, -12], [-56, 18], [48, 48]];

export const ELECTRIC_TEMPLATES: Record<string, AnimSpriteTemplate> = {
  /** AnimLightning: on the target, offset, gone at the end of its animation. */
  gLightningSpriteTemplate: {
    tag: "ANIM_TAG_LIGHTNING",
    width: 32,
    height: 32,
    anims: LIGHTNING_ANIMS,
    init(sprite, run, args, done) {
      sprite.x += flip(run, args[0]);
      sprite.y += args[1];
      goneAtAnimEnd(sprite, done);
    },
  },

  /** AnimSparkElectricity: a still spark at an angle on a battler (args[4]), args[3] frames. */
  gSparkElectricitySpriteTemplate: {
    ...SPARK_2,
    init(sprite, run, args, done) {
      const which = args[4] === AnimBattler.Attacker ? AnimBattler.Attacker : AnimBattler.Target;
      [sprite.x, sprite.y] = args[5] === 0 ? battlerCoords(run, which) : run.center(which);
      sprite.x2 = (SIN[args[0] & 0xff] * args[1]) >> 8;
      sprite.y2 = (SIN[(args[0] & 0xff) + 64] * args[1]) >> 8;
      if (args[6] & 1) sprite.priority = (run.mon(which).sprite?.priority ?? 2) + 1;
      sprite.affineAnimPaused = true;
      const sine = SIN[args[2] & 0xff];
      Object.assign(sprite, { matrixA: SIN[(args[2] & 0xff) + 64], matrixD: SIN[(args[2] & 0xff) + 64], matrixB: sine, matrixC: -sine });
      let left = args[3];
      sprite.callback = () => {
        if (left-- <= 0) done();
      };
    },
  },

  gZapCannonBallSpriteTemplate: { tag: "ANIM_TAG_BLACK_BALL_2", width: 16, height: 16, init: toTargetLocation },

  /** AnimZapCannonSpark: flickers around a line to the target. */
  gZapCannonSparkSpriteTemplate: {
    ...SPARK_2,
    affineAnims: FLASHING,
    init(sprite, run, args, done) {
      placeAtAttacker(sprite, run, args);
      const [x, y] = run.center(AnimBattler.Target);
      const line = travel(sprite, args[3], x, y);
      sprite.tileNum += args[6] * 4;
      let phase = args[4];
      const step = () => {
        if (line.next().done) return done();
        sprite.x2 += sin(phase, args[2]);
        sprite.y2 += cos(phase, args[2]);
        phase = (phase + args[5]) & 0xff;
        if (!(phase % 3)) sprite.invisible = !sprite.invisible;
      };
      sprite.callback = step;
      step();
    },
  },

  /** AnimThunderboltOrb: on the target for args[0] frames, flickering every args[3]. */
  gThunderboltOrbSpriteTemplate: {
    tag: "ANIM_TAG_SHOCK_3",
    width: 32,
    height: 32,
    affineNormal: true,
    anims: [[F(0, 6), F(16, 6), F(32, 6), J(0)]],
    affineAnims: [[A(0xe8, 0xe8, 0, 0), A(-8, -8, 0, 10), A(8, 8, 0, 10), J(1)]],
    init(sprite, run, args, done) {
      const [x, y] = run.center(AnimBattler.Target);
      sprite.x = x + flipTarget(run, args[1]);
      sprite.y = y + args[2];
      let [left, wait] = [args[0], args[3]];
      sprite.callback = () => {
        if (--wait === -1) {
          sprite.invisible = !sprite.invisible;
          wait = args[3];
        }
        if (left-- <= 0) done();
      };
    },
  },

  /** AnimSparkElectricityFlashing: circles a battler (args[7]'s top bit: the target), flickering. */
  gSparkElectricityFlashingSpriteTemplate: {
    ...SPARK_2,
    affineAnims: FLASHING,
    init(sprite, run, args, done) {
      const which = args[7] & 0x8000 ? AnimBattler.Target : AnimBattler.Attacker;
      const [x, y] = run.center(which);
      sprite.x = x + (run.mon(which).foe ? args[0] : -args[0]);
      sprite.y = y + args[1];
      sprite.tileNum += args[6] * 4;
      const every = args[7] & 0x7fff;
      let [phase, left] = [args[4], args[3]];
      const step = () => {
        sprite.x2 = sin(phase, args[2]);
        sprite.y2 = cos(phase, args[2]);
        phase = (phase + args[5]) & 0xff;
        if (phase % every === 0) sprite.invisible = !sprite.invisible;
        if (left-- <= 0) done();
      };
      sprite.callback = step;
      step();
    },
  },

  /** AnimThunderWave: two halves side by side, flickering, 51 frames. */
  gThunderWaveSpriteTemplate: {
    tag: "ANIM_TAG_SPARK_H",
    width: 32,
    height: 16,
    init(sprite, run, args, done) {
      sprite.x += args[0];
      sprite.y += args[1];
      const flicker = (s: Sprite, end: () => void) => {
        let [wait, n] = [0, 0];
        s.callback = () => {
          if (++wait === 3) {
            wait = 0;
            s.invisible = !s.invisible;
          }
          if (++n === 51) end();
        };
      };
      run.createSprite(
        {
          tag: "ANIM_TAG_SPARK_H",
          width: 32,
          height: 16,
          init(half, _run, _args, end) {
            half.tileNum += 8;
            flicker(half, end);
          },
        },
        sprite.x + 32,
        sprite.y,
        sprite.subpriority,
      );
      flicker(sprite, done);
    },
  },

  /** AnimGrowingChargeOrb: on a battler until its affine animation ends. */
  gGrowingChargeOrbSpriteTemplate: {
    ...ORB,
    affineAnims: ORB_AFFINE,
    init(sprite, run, args, done) {
      atBattler(sprite, run, args[0]);
      goneAtAffineEnd(sprite, done);
    },
  },

  /** AnimElectricPuff. */
  gElectricPuffSpriteTemplate: {
    tag: "ANIM_TAG_ELECTRICITY",
    width: 32,
    height: 32,
    anims: [[F(0, 3), F(16, 3), F(32, 3), F(48, 3), END]],
    init(sprite, run, args, done) {
      atBattler(sprite, run, args[0]);
      sprite.x2 = args[1];
      sprite.y2 = args[2];
      goneAtAnimEnd(sprite, done);
    },
  },

  /** AnimVoltTackleOrbSlide: the orb and the attacker charge off screen after 40 frames. */
  gVoltTackleOrbSlideSpriteTemplate: {
    ...ORB,
    affineAnims: ORB_AFFINE,
    init(sprite, run, _args, done) {
      sprite.startAffineAnim(1);
      [sprite.x, sprite.y] = run.center(AnimBattler.Attacker);
      const mon = monSprite(run, AnimBattler.Attacker);
      const step = run.attacker.foe ? -16 : 16;
      let wait = 0;
      sprite.callback = () => {
        if (++wait <= 41) return;
        sprite.x += step;
        if (mon) mon.x2 += step;
        if (((sprite.x + 80) & 0xffff) > 400) done();
      };
    },
  },

  /** AnimGrowingShockWaveOrb. */
  gGrowingShockWaveOrbSpriteTemplate: {
    ...ORB,
    affineAnims: ORB_AFFINE,
    init(sprite, run, _args, done) {
      [sprite.x, sprite.y] = run.center(AnimBattler.Attacker);
      sprite.startAffineAnim(2);
      goneAtAffineEnd(sprite, done);
    },
  },
};

export const ELECTRIC_TASK_SOUNDS: Record<string, readonly string[]> = { AnimTask_ShockWaveProgressingBolt: ["se_m_thunderbolt"] };

/** A sprite that's gone after `life` frames; its count is the caller's. */
const timed = (tag: string, width: number, height: number, life: number, tileOffset: number, size: [number, number] | null, onGone?: () => void): AnimSpriteTemplate => ({
  tag,
  width,
  height,
  init(sprite, _run, _args, done) {
    sprite.tileNum += tileOffset;
    if (size) sprite.setSize(size[0], size[1]);
    let n = 0;
    sprite.callback = () => {
      if (++n >= life) {
        onGone?.();
        done();
      }
    };
  },
});

export const ELECTRIC_TASKS: Record<string, AnimTask> = {
  /** AnimTask_ElectricBolt: five segments fall down from the target's spot, one every other frame. */
  *AnimTask_ElectricBolt(run, args) {
    const [cx, cy] = battlerCoords(run, AnimBattler.Target);
    const [x, y] = [cx + args[0], cy + args[1]];
    const wide = !!args[2];
    const [tile0, tileStep] = wide ? [8, 4] : [0, 1];
    yield;
    for (let i = 0; i < 5; i++) {
      const tile = i === 4 ? tile0 : tile0 + tileStep * i;
      run.createSprite(timed("ANIM_TAG_SPARK", 8, 8, 15, tile, wide ? [16, 16] : [8, 16]), x, y + 16 * (i + 1), 2);
      yield;
      yield;
    }
  },

  /** AnimTask_ElectricChargingParticles: args[1] particles gather on a battler, faster over time. */
  *AnimTask_ElectricChargingParticles(run, args) {
    const [cx, cy] = run.center(args[0] ? AnimBattler.Target : AnimBattler.Attacker);
    let [left, active, speedup, index, count, wait] = [args[1], 0, 0, 0, 0, 0];
    const anims = [[F(3, 1), F(2, 1), F(1, 1), F(0, 1), END], [F(0, 5), F(1, 5), F(2, 5), F(3, 5), END]];
    for (;;) {
      yield;
      if (left) {
        if (++wait <= args[2]) continue;
        wait = 0;
        const [ox, oy] = CHARGE_OFFSETS[index];
        const steps = 40 - speedup * 5;
        active++;
        run.createSprite(
          {
            tag: "ANIM_TAG_ELECTRIC_ORBS",
            width: 8,
            height: 8,
            anims,
            init(sprite, _run, _args, done) {
              runSprite(
                sprite,
                (function* () {
                  yield;
                  yield* animEnd(sprite);
                  sprite.startAnim(1);
                  yield* travel(sprite, steps, cx, cy);
                  active--;
                })(),
                done,
              );
            },
          },
          cx + ox,
          cy + oy,
          2,
        );
        if (++index > 15) index = 0;
        if (++count >= args[3]) {
          count = 0;
          if (speedup <= 5) speedup++;
        }
        left--;
      } else if (!active) return;
    }
  },

  /** AnimTask_VoltTackleAttackerReappear: the attacker flickers back in. */
  *AnimTask_VoltTackleAttackerReappear(run) {
    const mon = monSprite(run, AnimBattler.Attacker);
    if (!mon) return;
    const player = !run.attacker.foe;
    let offset = player ? -32 : 32;
    const step = player ? 2 : -2;
    yield;
    mon.x2 = offset;
    yield;
    while (offset) {
      yield;
      yield;
      mon.invisible = !mon.invisible;
      offset += step;
      mon.x2 = offset;
    }
    for (let n = 0; n < 8; n++) {
      yield;
      yield;
      mon.invisible = !mon.invisible;
    }
    yield;
    mon.invisible = false;
  },

  /** AnimTask_VoltTackleBolt: a line of sparks across the screen, a line by args[0]. */
  *AnimTask_VoltTackleBolt(run, args) {
    const side = run.attacker.foe ? -1 : 1;
    let x: number, to: number, y: number;
    if (args[0] === 0) {
      x = run.center(AnimBattler.Attacker)[0];
      y = run.center(AnimBattler.Attacker)[1];
      to = side * 128 + 120;
    } else if (args[0] === 4) {
      x = 120 - side * 128;
      y = run.center(AnimBattler.Target)[1];
      to = run.center(AnimBattler.Target)[0] - side * 32;
    } else {
      [x, to] = args[0] & 1 ? [256, -16] : [-16, 256];
      if (side === 1) y = 80 - args[0] * 10;
      else {
        y = args[0] * 10 + 40;
        [x, to] = [to, x];
      }
    }
    const dir = x < to ? 1 : -1;
    let active = 0;
    yield;
    const bolt = () => {
      active++;
      run.createSprite(
        {
          tag: "ANIM_TAG_SPARK",
          width: 8,
          height: 16,
          affine: true,
          anims: [[F(0, 3), END]],
          affineAnims: [[A(0x100, 0x100, 64, 0), END]],
          init(sprite, _run, _args, done) {
            let n = 0;
            sprite.callback = () => {
              if (++n > 12) {
                active--;
                done();
              }
            };
          },
        },
        x,
        y,
        35,
      );
      x += dir * 16;
      return (dir === 1 && x >= to) || (dir === -1 && x <= to);
    };
    for (;;) {
      yield;
      if (bolt() || bolt()) break;
    }
    while (active > 0) yield;
  },

  /** AnimTask_ShockWaveProgressingBolt: five zigzag columns of sparks from the attacker to the target. */
  *AnimTask_ShockWaveProgressingBolt(run) {
    const [ax, ay] = run.center(AnimBattler.Attacker);
    const tx = run.center(AnimBattler.Target)[0];
    let [x, y, stop, tile, dir, hold, pan, columns, active] = [ax, ay, 4, 7, -1, 12, run.pan(-64), 0, 0];
    const panStep = Math.trunc((run.pan(63) - pan) / 3);
    const columnStep = Math.trunc((tx - x) / 5);
    const spark = () => {
      active++;
      run.createSprite(
        { ...timed("ANIM_TAG_SPARK", 8, 8, 13, tile, null, () => active--) },
        x,
        y,
        35,
      );
      tile += dir;
      if (tile < 0) tile = 7;
      if (tile > 7) tile = 0;
      if (tile === 0 && dir > 0) {
        pan += panStep;
        run.play("se_m_thunderbolt" as SoundId, pan);
      }
      if ((dir < 0 && y <= stop) || (dir > 0 && y >= stop)) {
        columns++;
        x += columnStep;
        return true;
      }
      y += dir * 8;
      return false;
    };
    yield;
    for (;;) {
      yield;
      const end = spark();
      if (hold) hold--;
      if (!end) continue;
      if (columns === 5) break;
      for (let n = 0; n < 5; n++) {
        if (hold) hold--;
        yield;
      }
      if (columns & 1) [y, stop, tile, dir] = [4, 68, 0, 1];
      else [y, stop, tile, dir] = [68, 4, 7, -1];
      while (hold) {
        hold--;
        yield;
      }
    }
    while (active > 0) yield;
  },

  /** AnimTask_ShockWaveLightning: bolts stacked down to the target's spot. */
  *AnimTask_ShockWaveLightning(run) {
    const bottom = battlerCoords(run, AnimBattler.Target)[1] + 32;
    let y = bottom;
    while (y > 16) y -= 32;
    const x = run.center(AnimBattler.Target)[0];
    const sub = (run.target.sprite?.subpriority ?? 2) - 2;
    let active = 0;
    yield;
    for (;;) {
      yield;
      yield;
      active++;
      run.createSprite(
        {
          tag: "ANIM_TAG_LIGHTNING",
          width: 32,
          height: 32,
          anims: LIGHTNING_ANIMS,
          init(sprite, _run, _args, done) {
            sprite.callback = () => {
              if (sprite.animEnded) {
                active--;
                done();
              }
            };
          },
        },
        x,
        y,
        sub,
      );
      if (y >= bottom) break;
      y += 32;
    }
    while (active > 0) yield;
  },
};
