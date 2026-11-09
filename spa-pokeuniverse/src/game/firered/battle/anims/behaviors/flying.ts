// Flying (battle_anim_flying.c): gusts and crescents, the balls of shadow behind two-turn moves,
// feathers and water sprays.

import { SIN } from "../../../../gba/trig";
import { AnimBattler, type AnimSpriteTemplate, type AnimTask } from "../script";
import { PARTICLE_TEMPLATES } from "./particles";
import { A, arcTan2Neg, battlerCoords, cos, END, F, flip, flyTo, frames, J, monSprite, placeAtAttacker, placeAtTarget, random, rotScale, seekAnim, sin, travel } from "./util";

const SHADOW = { tag: "ANIM_TAG_ROUND_SHADOW", width: 64, height: 64 } as const;

export const FLYING_TEMPLATES: Record<string, AnimSpriteTemplate> = {
  /** AnimEllipticalGust: at the target's spot, an ellipse for 71 frames. */
  gEllipticalGustSpriteTemplate: {
    tag: "ANIM_TAG_GUST",
    width: 32,
    height: 64,
    init(sprite, run, args, done) {
      placeAtTarget(sprite, run, args, false);
      sprite.y += 20;
      let [phase, n] = [191, 0];
      const step = () => {
        sprite.x2 = sin(phase, 32);
        sprite.y2 = cos(phase, 8);
        phase = (phase + 5) & 0xff;
        if (++n === 71) done();
      };
      sprite.callback = step;
      step();
    },
  },

  /** AnimGustToTarget: grows at the attacker, then flies to the target in args[4]. */
  gGustToTargetSpriteTemplate: {
    tag: "ANIM_TAG_GUST",
    width: 32,
    height: 64,
    affineNormal: true,
    affineAnims: [[A(0x10, 0x100, 0, 0), A(0xa, 0, 0, 24), END]],
    init(sprite, run, args, done) {
      placeAtAttacker(sprite, run, args);
      const [x, y] = run.center(AnimBattler.Target);
      const moving = travel(sprite, args[4], x + flip(run, args[2]), y + args[3]);
      sprite.callback = () => {
        if (sprite.affineEnded && moving.next().done) done();
      };
    },
  },

  /** AnimAirWaveCrescent: from the attacker to the target, its flips starting at args[5]. */
  gAirWaveCrescentSpriteTemplate: {
    tag: "ANIM_TAG_AIR_WAVE_2",
    width: 32,
    height: 16,
    anims: [[F(0, 3), F(0, 3, "h"), F(0, 3, "v"), F(0, 3, "hv"), J(0)]],
    init(sprite, run, args, done) {
      const [ax, ay] = run.center(AnimBattler.Attacker);
      const [tx, ty] = run.center(AnimBattler.Target);
      sprite.x = ax + flip(run, args[0]);
      sprite.y = ay + flip(run, args[1]);
      seekAnim(sprite, args[5]);
      flyTo(sprite, args[4], tx + flip(run, args[2]), ty + flip(run, args[3]), done);
    },
  },

  /** AnimFlyBallUp: the attacker turns into a ball and, after args[2] frames, rises off the screen. */
  gFlyBallUpSpriteTemplate: {
    ...SHADOW,
    affine: true,
    affineAnims: [[A(0x10, 0x100, 0, 0), A(0x28, 0, 0, 6), A(0, -0x20, 0, 5), A(-0x10, 0x20, 0, 10), END]],
    init(sprite, run, args, done) {
      placeAtAttacker(sprite, run, args);
      const mon = monSprite(run, AnimBattler.Attacker);
      if (mon) mon.invisible = true;
      let [wait, speed] = [args[2], 0];
      sprite.callback = () => {
        if (wait > 0) wait--;
        else {
          speed += args[3];
          sprite.y2 -= speed >> 8;
        }
        if (sprite.y + sprite.y2 < -32) done();
      };
    },
  },

  /** AnimFlyBallAttack: from above the attacker's corner, through the target and off the screen. */
  gFlyBallAttackSpriteTemplate: {
    ...SHADOW,
    affineNormal: true,
    affineAnims: [[A(0, 0, 50, 1), END], [A(0, 0, -40, 1), END]],
    init(sprite, run, args, done) {
      if (run.attacker.foe) {
        sprite.x = 240 + 32;
        sprite.startAffineAnim(1);
      } else sprite.x = -32;
      sprite.y = -32;
      const [tx, ty] = run.center(AnimBattler.Target);
      const axis = (d: number) => {
        const step = (((Math.abs(d) << 8) & 0xffff) / args[0]) & 0xffff;
        return d < 0 ? step | 1 : step & ~1;
      };
      const [stepX, stepY] = [axis(tx - sprite.x), axis(ty - sprite.y)];
      let [x, y] = [0, 0];
      const mon = monSprite(run, AnimBattler.Attacker);
      sprite.callback = () => {
        x = (x + stepX) & 0xffff;
        y = (y + stepY) & 0xffff;
        sprite.x2 = stepX & 1 ? -(x >> 8) : x >> 8;
        sprite.y2 = stepY & 1 ? -(y >> 8) : y >> 8;
        if (x >> 8 > 200) {
          sprite.x += sprite.x2;
          sprite.x2 = 0;
          x &= 0xff;
        }
        if (sprite.x + sprite.x2 < -32 || sprite.x + sprite.x2 > 240 + 32 || sprite.y + sprite.y2 > 160) {
          if (mon) mon.invisible = false;
          done();
        }
      };
    },
  },

  /** AnimFallingFeather: rocks down a sine; at the sine's turns it flips and swaps in front of or behind the battler. */
  gFallingFeatherSpriteTemplate: {
    tag: "ANIM_TAG_WHITE_FEATHER",
    width: 32,
    height: 32,
    affineNormal: true,
    anims: [[F(0, 0), END], [F(16, 0, "h"), END]],
    init(sprite, run, args, done) {
      const which = args[7] & 0x100 ? AnimBattler.Attacker : AnimBattler.Target;
      const mon = run.mon(which);
      const [spotX, spotY] = battlerCoords(run, which);
      sprite.x = spotX + (mon.foe ? args[0] : -args[0]);
      sprite.y = spotY + args[1];
      let y = sprite.y << 8;
      const limit = spotY + args[6];
      let phase = args[2] & 0xff;
      const tilt = (args[2] >> 8) & 0xff;
      const speed = args[3] & 0xffff;
      const backward = !!(speed & 0x8000);
      const amps = [args[5] & 0xff, (args[5] >> 8) & 0xff];
      let amp = 0;
      let front = !(phase >= 64 && phase <= 191);
      sprite.priority = front ? 1 : 2;
      const turn = () => {
        sprite.hFlip = !sprite.hFlip;
        sprite.startAnim(sprite.hFlip ? 1 : 0);
      };
      if (front === backward) turn();
      const pose = () => {
        sprite.x2 = (amps[amp] * SIN[phase]) >> 8;
        const index = ((-sprite.x2 >> 1) + tilt) & 0xff;
        const s = SIN[index];
        sprite.affineAnimPaused = true;
        sprite.matrixA = sprite.matrixD = SIN[index + 64];
        sprite.matrixB = s;
        sprite.matrixC = -s;
      };
      let last = phase >> 6;
      let [pause, armed] = [false, false];
      pose();
      sprite.callback = () => {
        if (pause) return void (pause = false);
        const q = phase >> 6;
        const hold = (flipNext: boolean, swap: boolean, wait: boolean) => {
          if (flipNext) armed = true;
          if (swap) amp ^= 1;
          if (wait) pause = true;
        };
        if (q === 0 && last === 1) hold(true, false, true);
        else if (q === 0 && last === 3) hold(false, true, true);
        else if (q === 1 && last === 0) hold(true, false, true);
        else if (q === 1 && last === 2) hold(false, false, true);
        else if (q === 2 && last === 3) hold(true, false, true);
        else if (q === 2 && last === 1) hold(false, false, true);
        else if (q === 3 && last === 2) hold(true, false, false);
        else if (q === 3 && last === 0) hold(false, true, true);
        else if (armed) {
          turn();
          sprite.priority += front ? 1 : -1;
          front = !front;
          armed = false;
        }
        last = q;
        pose();
        y += args[4];
        sprite.y = y >> 8;
        phase = (backward ? phase - (speed & 0x7fff) : phase + (speed & 0x7fff)) & 0xff;
        if (sprite.y + sprite.y2 >= limit) done();
      };
    },
  },

  /** AnimWhirlwindLine: a line across the battler (args[2]), restarting every 6 frames, args[3] + 1 frames. */
  gWhirlwindLineSpriteTemplate: {
    tag: "ANIM_TAG_WHIRLWIND_LINES",
    width: 32,
    height: 16,
    anims: [[F(0, 1), F(8, 1), F(16, 1), F(8, 1, "h"), F(0, 1, "h"), END]],
    init(sprite, run, args, done) {
      const attacker = args[2] === 0;
      if (attacker) placeAtAttacker(sprite, run, args, false);
      else placeAtTarget(sprite, run, args, false);
      if (!run.mon(attacker ? AnimBattler.Attacker : AnimBattler.Target).foe) sprite.x += 8;
      seekAnim(sprite, args[4]);
      sprite.x -= 32;
      sprite.x2 += 12 * args[4];
      let [n, left] = [args[4], args[3]];
      sprite.callback = () => {
        sprite.x2 += 0x0ccc >> 8;
        if (++n === 6) {
          n = 0;
          sprite.x2 = 0;
          sprite.startAnim(0);
        }
        if (--left === -1) done();
      };
    },
  },

  /** AnimBounceBallShrink: the attacker becomes a ball that shrinks away. */
  gBounceBallShrinkSpriteTemplate: {
    ...SHADOW,
    affine: true,
    affineAnims: [[A(0x10, 0x100, 0, 0), A(0x28, 0, 0, 6), A(0, -0x20, 0, 5), A(-0x14, 0, 0, 7), A(-0x14, -0x14, 0, 5), END]],
    init(sprite, run, args, done) {
      placeAtAttacker(sprite, run, args);
      const mon = monSprite(run, AnimBattler.Attacker);
      if (mon) mon.invisible = true;
      sprite.callback = () => {
        if (sprite.affineEnded) done();
      };
    },
  },

  /** AnimBounceBallLand: drops on the target and bounces back up off the screen. */
  gBounceBallLandSpriteTemplate: {
    ...SHADOW,
    affine: true,
    affineAnims: [[A(0xa0, 0x100, 0, 0), END]],
    init(sprite, run, _args, done) {
      sprite.y = battlerCoords(run, AnimBattler.Target)[1];
      sprite.y2 = -sprite.y - 32;
      let rising = false;
      const mon = monSprite(run, AnimBattler.Attacker);
      sprite.callback = () => {
        if (!rising) {
          sprite.y2 += 10;
          if (sprite.y2 >= 0) rising = true;
          return;
        }
        sprite.y2 -= 10;
        if (sprite.y + sprite.y2 < -32) {
          if (mon) mon.invisible = false;
          done();
        }
      };
    },
  },

  /** AnimDiveBall: the attacker becomes a ball that rises off the screen and, 20 frames later, falls back. */
  gDiveBallSpriteTemplate: {
    ...SHADOW,
    affine: true,
    affineAnims: [[A(0x10, 0x100, 0, 0), A(0x28, 0, 0, 6), A(0, -0x20, 0, 5), A(-0x10, 0x20, 0, 10), END]],
    init(sprite, run, args, done) {
      placeAtAttacker(sprite, run, args);
      const mon = monSprite(run, AnimBattler.Attacker);
      if (mon) mon.invisible = true;
      let [wait, speed, off, down] = [args[2], 0, 0, false];
      sprite.callback = () => {
        if (down) {
          sprite.y2 += speed >> 8;
          if (sprite.y + sprite.y2 > -32) sprite.invisible = false;
          if (sprite.y2 > 0) done();
        } else if (wait > 0) wait--;
        else if (sprite.y + sprite.y2 > -32) {
          speed += args[3];
          sprite.y2 -= speed >> 8;
        } else {
          sprite.invisible = true;
          if (off++ > 20) down = true;
        }
      };
    },
  },

  /** AnimDiveWaterSplash: a splash at the battler's feet stretches up and sinks, 24 frames. */
  gDiveWaterSplashSpriteTemplate: {
    tag: "ANIM_TAG_SPLASH",
    width: 64,
    height: 64,
    affine: true,
    init(sprite, run, args, done) {
      [sprite.x, sprite.y] = battlerCoords(run, args[0] ? AnimBattler.Target : AnimBattler.Attacker);
      let [scale, n] = [512, 0];
      rotScale(sprite, 256, scale, 0);
      sprite.callback = () => {
        scale += n <= 11 ? -40 : 40;
        n++;
        rotScale(sprite, 256, scale, 0);
        const height = Math.min(128, Math.trunc(15616 / sprite.matrixD) + 1);
        sprite.y2 = Math.trunc((64 - height) / 2);
        if (n === 24) done();
      };
    },
  },

  /** AnimSprayWaterDroplet: thrown up from the battler's feet to one side (args[0]), 31 frames. */
  gSprayWaterDropletSpriteTemplate: {
    tag: "ANIM_TAG_SWEAT_BEAD",
    width: 8,
    height: 8,
    init(sprite, run, args, done) {
      const v1 = random(0x200);
      const v2 = random(0x80);
      const stepX = v1 % 2 ? 736 + v1 : 736 - v1;
      let stepY = v2 % 2 ? 896 + v2 : 896 - v2;
      const left = !!args[0];
      if (left) sprite.hFlip = true;
      [sprite.x, sprite.y] = battlerCoords(run, args[1] === 0 ? AnimBattler.Attacker : AnimBattler.Target);
      sprite.y += 32;
      let n = 0;
      sprite.callback = () => {
        sprite.x2 += (left ? -1 : 1) * (stepX >> 8);
        sprite.y2 -= stepY >> 8;
        stepY -= 32;
        if (++n === 31) done();
      };
    },
  },

  /** AnimSkyAttackBird: a bird, pointed at the target, flies from the attacker past it. */
  gSkyAttackBirdSpriteTemplate: {
    tag: "ANIM_TAG_BIRD",
    width: 64,
    height: 64,
    affine: true,
    init(sprite, run, _args, done) {
      const [toX, toY] = [sprite.x, sprite.y];
      [sprite.x, sprite.y] = run.center(AnimBattler.Attacker);
      let [x, y] = [sprite.x << 4, sprite.y << 4];
      const stepX = Math.trunc(((toX - sprite.x) << 4) / 12);
      const stepY = Math.trunc(((toY - sprite.y) << 4) / 12);
      rotScale(sprite, 0x100, 0x100, (arcTan2Neg(toX - sprite.x, toY - sprite.y) + 49152) & 0xffff);
      sprite.callback = () => {
        x += stepX;
        y += stepY;
        sprite.x = x >> 4;
        sprite.y = y >> 4;
        if (sprite.x > 240 + 45 || sprite.x < -45 || sprite.y > 157 || sprite.y < -45) done();
      };
    },
  },
};

export const FLYING_TASKS: Record<string, AnimTask> = {
  /** AnimTask_AnimateGustTornadoPalette: colors 1-8 of the gust rotate every args[0] + 1 frames, for args[1] frames. */
  *AnimTask_AnimateGustTornadoPalette(run, args) {
    const { palettes } = run.flow.gba;
    const base = 256 + (palettes.spritePaletteSlot("ANIM_TAG_GUST") & 15) * 16;
    const { faded } = palettes;
    let [wait, left] = [0, args[1]];
    for (;;) {
      yield;
      if (wait++ === args[0]) {
        wait = 0;
        const last = faded[base + 8];
        for (let i = 7; i > 0; i--) faded[base + 1 + i] = faded[base + i];
        faded[base + 1] = last;
      }
      if (--left === 0) return;
    }
  },

  /** AnimTask_DrillPeckHitSplats: flashing hits around the target, a ring of eight. */
  *AnimTask_DrillPeckHitSplats(run) {
    const [x, y] = run.center(AnimBattler.Target);
    for (let phase = 0; phase <= 255; phase += 8) {
      if (!(phase % 32)) run.createSprite(PARTICLE_TEMPLATES.gFlashingHitSplatSpriteTemplate, x, y, 3, [sin(phase, -13), cos(phase, -13), 1, 3]);
      yield;
    }
    yield* frames(14);
  },
};
