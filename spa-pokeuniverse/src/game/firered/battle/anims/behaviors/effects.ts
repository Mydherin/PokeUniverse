// Shared effects (battle_anim_effects_1.c, _2.c, _3.c): the particles and battler moves many
// families' scripts use. Grows as moves need them.

import type { AffineCmd, Sprite } from "../../../../gba/sprites";
import { AnimBattler, type AnimRun, type AnimSpriteTemplate, type AnimTask } from "../script";
import { A, arc, battlerCoords, cloneMon, END, F, flip, flyTo, goneAtAnimEnd, J, monSprite, placeAtAttacker, placeAtTarget, rotScale, runSprite, sideX, spriteOnMon } from "./util";

const ARG_RET = 7;

/** PrepareAffineAnimInTaskData + RunAffineAnimFromTaskData: a table played on a battler; y2 keeps its feet down. */
export function* monAffine(mon: Sprite, table: readonly AffineCmd[], each?: () => void): Generator<void, void, void> {
  mon.affineAnimPaused = true;
  let [x, y, rot, index, n] = [0x100, 0x100, 0, 0, 0];
  for (;;) {
    let cmd = table[index];
    if (cmd === "end") {
      mon.y2 = 0;
      mon.setRotScale(0x100, 0x100, 0);
      mon.affineAnimPaused = false;
      return;
    }
    if (typeof cmd === "object" && "jump" in cmd) {
      index = cmd.jump;
      continue;
    }
    if (typeof cmd === "object" && "loop" in cmd) {
      index++;
      continue;
    }
    if (!cmd.duration) {
      [x, y, rot] = [cmd.xScale, cmd.yScale, (cmd.rotation ?? 0) << 8];
      index++;
      cmd = table[index];
      if (cmd === "end" || "jump" in cmd || "loop" in cmd) continue;
    }
    x += cmd.xScale;
    y += cmd.yScale;
    rot += (cmd.rotation ?? 0) << 8;
    mon.setRotScale(x, y, rot & 0xffff);
    // SetBattlerSpriteYOffsetFromYScale: a scaled picture stays on the ground (its picture's full height: no Y delta here).
    const scaled = Math.min(128, mon.matrixD ? Math.trunc((64 << 8) / mon.matrixD) : 0);
    mon.y2 = Math.trunc((64 - scaled) / 2);
    each?.();
    if (++n >= cmd.duration) {
      n = 0;
      index++;
    }
    yield;
  }
}

/** AnimTranslateLinearAndFlicker-free slice (AnimCuttingSlice): curves across the target, 20 frames + 3. */
const cuttingSlice: AnimSpriteTemplate["init"] = (sprite, run, args, done) => {
  [sprite.x, sprite.y] = battlerCoords(run, AnimBattler.Target);
  if (!run.target.foe) sprite.y += 8;
  if (args[2] === 0) sprite.x += args[0];
  else {
    sprite.x -= args[0];
    sprite.hFlip = true;
  }
  sprite.y += args[1];
  const reverse = args[2] === 1;
  let stepX = reverse ? 0x400 : -0x400;
  let stepY = 0x400;
  let [x, y, n] = [0, 0, 0];
  sprite.callback = () => {
    if (n >= 20) {
      if (n++ >= 23) done();
      return;
    }
    x += stepX;
    y += stepY;
    stepX += reverse ? -0x18 : 0x18;
    stepY -= 0x18;
    sprite.x2 = x >> 8;
    sprite.y2 = y >> 8;
    n++;
  };
};

const RING_AFFINE: AffineCmd[][] = [
  [A(16, 16, 0, 0), A(16, 16, 0, 30), END],
  [A(16, 16, 0, 0), A(32, 32, 0, 15), END],
];

export const EFFECT_TEMPLATES: Record<string, AnimSpriteTemplate> = {
  gHealingBlueStarSpriteTemplate: {
    tag: "ANIM_TAG_BLUE_STAR",
    width: 32,
    height: 32,
    anims: [[F(0, 2), F(16, 2), F(32, 2), F(48, 3), F(64, 5), F(80, 3), F(96, 2), F(0, 2), END]],
    init: spriteOnMon,
  },

  gExplosionSpriteTemplate: {
    tag: "ANIM_TAG_EXPLOSION",
    width: 32,
    height: 32,
    anims: [[F(0, 5), F(16, 5), F(32, 5), F(48, 5), END]],
    init: spriteOnMon,
  },

  /** AnimGrantingStars: floats by (args[3], args[4]) 8.8 a frame for args[5] frames, at the attacker unless args[2]. */
  gGrantingStarsSpriteTemplate: {
    tag: "ANIM_TAG_SPARKLE_2",
    width: 32,
    height: 32,
    anims: [[F(0, 7), F(16, 7), F(32, 7), F(48, 7), F(64, 7), F(80, 7), F(96, 7), F(112, 7), J(0)]],
    init(sprite, run, args, done) {
      if (!args[2]) [sprite.x, sprite.y] = run.center(AnimBattler.Attacker);
      sprite.x += sideX(run, args[0]);
      sprite.y += args[1];
      let [x, y, left] = [0, 0, args[5]];
      sprite.callback = () => {
        if (left <= 0) return done();
        left--;
        x += args[3];
        y += args[4];
        sprite.x2 = x >> 8;
        sprite.y2 = y >> 8;
      };
    },
  },

  /** AnimAbsorptionOrb: from the target to the attacker in an arc of args[2], args[3] frames, shrinking. */
  gAbsorptionOrbSpriteTemplate: {
    tag: "ANIM_TAG_ORBS",
    width: 16,
    height: 16,
    affineNormal: true,
    blend: true,
    anims: [[F(8, 1), END]],
    affineAnims: [[A(-5, -5, 0, 1), J(0)]],
    init(sprite, run, args, done) {
      placeAtTarget(sprite, run, args);
      const [x, y] = run.center(AnimBattler.Attacker);
      runSprite(
        sprite,
        (function* () {
          yield;
          yield* arc(sprite, args[3], x, y, args[2]);
        })(),
        done,
      );
    },
  },

  /** AnimBowMon: the attacker's bow, in its four parts (args[0]): back, turn, forward, up. */
  gBowMonSpriteTemplate: {
    width: 8,
    height: 8,
    init(sprite, run, args, done) {
      sprite.invisible = true;
      const mon = run.attacker.sprite;
      if (!mon) return done();
      const foe = run.attacker.foe;
      const moveBy = (step: number, n: number) =>
        (function* () {
          for (let i = 0; i < n; i++) {
            mon.x2 += step;
            yield;
          }
        })();
      const turn = (by: number, start: number, n: number, reset: boolean) =>
        (function* () {
          mon.affineAnimPaused = true;
          let rot = start;
          for (let i = 0; i <= n; i++) {
            rot = (rot + by) & 0xffff;
            rotScale(mon, 0x100, 0x100, rot);
            mon.y2 = Math.abs(mon.matrixC) >> 3;
            yield;
          }
          if (reset) {
            mon.setRotScale(0x100, 0x100, 0);
            mon.affineAnimPaused = false;
          }
        })();
      runSprite(
        sprite,
        (function* () {
          yield;
          if (args[0] === 0) {
            yield* moveBy(foe ? 2 : -2, 6);
            yield* turn(foe ? 0x300 : -0x300 & 0xffff, 0, 3, false);
          } else if (args[0] === 1) yield* moveBy(foe ? -3 : 3, 4);
          else if (args[0] === 2) {
            for (let i = 0; i < 9; i++) yield;
            yield* turn(foe ? 0xfc00 : 0x400, foe ? 0xc00 : 0xf400, 2, true);
          }
        })(),
        done,
      );
    },
  },

  /** AnimAngerMark: pulses on the battler (args[0]), offset by args[1], args[2]. */
  gAngerMarkSpriteTemplate: {
    tag: "ANIM_TAG_ANGER",
    width: 16,
    height: 16,
    affineNormal: true,
    affineAnims: [[A(11, 11, 0, 8), A(-11, -11, 0, 8), END]],
    init(sprite, run, args, done) {
      const which = args[0] ? AnimBattler.Target : AnimBattler.Attacker;
      const [x, y] = run.center(which);
      sprite.x = x + (run.mon(which).foe ? -args[1] : args[1]);
      sprite.y = Math.max(8, y + args[2]);
      sprite.callback = () => {
        if (sprite.affineEnded) done();
      };
    },
  },

  gThinRingExpandingSpriteTemplate: { tag: "ANIM_TAG_THIN_RING", width: 64, height: 64, affine: true, affineAnims: RING_AFFINE, init: spriteOnMon },
  gBlendThinRingExpandingSpriteTemplate: { tag: "ANIM_TAG_THIN_RING", width: 64, height: 64, affine: true, blend: true, affineAnims: RING_AFFINE, init: spriteOnMon },

  /** AnimHornHit: a horn thrust from 40 pixels away onto the spot, args[2] frames. */
  gHornHitSpriteTemplate: {
    tag: "ANIM_TAG_HORN_HIT",
    width: 32,
    height: 32,
    init(sprite, run, args, done) {
      const frames = Math.max(2, Math.min(0x7f, args[2]));
      const [cx, cy] = run.center(AnimBattler.Target);
      const [spotX, spotY] = [cx + args[0], cy + args[1]];
      const foe = run.attacker.foe;
      sprite.x = spotX + (foe ? 40 : -40);
      sprite.y = spotY + (foe ? -20 : 20);
      if (foe) sprite.hFlip = sprite.vFlip = true;
      let [x, y, left] = [sprite.x << 7, sprite.y << 7, frames];
      const stepX = Math.trunc((foe ? -0x1400 : 0x1400) / frames);
      const stepY = Math.trunc((foe ? 0xa00 : -0xa00) / frames);
      sprite.callback = () => {
        x += stepX;
        y += stepY;
        sprite.x = x >> 7;
        sprite.y = y >> 7;
        if (--left === 1) [sprite.x, sprite.y] = [spotX, spotY];
        if (left === 0) done();
      };
    },
  },

  /** AnimEndureEnergy: rises from the battler's spot, faster as args[3] allows, until its animation ends. */
  gEndureEnergySpriteTemplate: {
    tag: "ANIM_TAG_FOCUS_ENERGY",
    width: 16,
    height: 32,
    anims: [[F(0, 4), F(8, 12), F(16, 4), F(24, 4), END]],
    init(sprite, run, args, done) {
      const [x, y] = battlerCoords(run, args[0] === 0 ? AnimBattler.Attacker : AnimBattler.Target);
      sprite.x = x + args[1];
      sprite.y = y + args[2];
      let n = 0;
      sprite.callback = () => {
        if (++n > args[3]) {
          n = 0;
          sprite.y--;
        }
        sprite.y -= n;
        if (sprite.animEnded) done();
      };
    },
  },

  /** AnimPowerAbsorptionOrb: from a spot beside the attacker into it, args[2] frames, shrinking. */
  gPowerAbsorptionOrbSpriteTemplate: {
    tag: "ANIM_TAG_ORBS",
    width: 16,
    height: 16,
    affineNormal: true,
    blend: true,
    anims: [[F(8, 1), END]],
    affineAnims: [[A(-5, -5, 0, 1), J(0)]],
    init(sprite, run, args, done) {
      placeAtAttacker(sprite, run, args);
      const [x, y] = run.center(AnimBattler.Attacker);
      flyTo(sprite, args[2], x, y, done);
    },
  },

  /** AnimClawSlash: on the target, flipped by args[2]. */
  gClawSlashSpriteTemplate: {
    tag: "ANIM_TAG_CLAW_SLASH",
    width: 32,
    height: 32,
    anims: [
      [F(0, 4), F(16, 4), F(32, 4), F(48, 4), F(64, 4), END],
      [F(0, 4, "h"), F(16, 4, "h"), F(32, 4, "h"), F(48, 4, "h"), F(64, 4, "h"), END],
    ],
    init(sprite, _run, args, done) {
      sprite.x += args[0];
      sprite.y += args[1];
      sprite.startAnim(args[2]);
      goneAtAnimEnd(sprite, done);
    },
  },

  /** AnimEyeSparkle: on the attacker until its animation ends. */
  gEyeSparkleSpriteTemplate: {
    tag: "ANIM_TAG_EYE_SPARKLE",
    width: 16,
    height: 16,
    anims: [[F(0, 4), F(4, 4), F(8, 4), F(4, 4), F(0, 4), END]],
    init(sprite, run, args, done) {
      placeAtAttacker(sprite, run, args);
      goneAtAnimEnd(sprite, done);
    },
  },

  /** AnimUproarRing: a ring tinted args[4] by args[5]/16, the fast size; AnimSpriteOnMonPos. */
  gUproarRingSpriteTemplate: {
    tag: "ANIM_TAG_THIN_RING",
    width: 64,
    height: 64,
    affine: true,
    blend: true,
    affineAnims: RING_AFFINE,
    init(sprite, run, args, done) {
      const { palettes } = run.flow.gba;
      palettes.blendPalette(256 + (palettes.spritePaletteSlot("ANIM_TAG_THIN_RING") & 15) * 16 + 1, 15, args[5], args[4]);
      sprite.startAffineAnim(1);
      spriteOnMon(sprite, run, args, done);
    },
  },

  gCuttingSliceSpriteTemplate: { tag: "ANIM_TAG_CUT", width: 32, height: 32, blend: true, anims: [[F(0, 5), F(16, 5), F(32, 5), F(48, 5), END]], init: cuttingSlice },

  /** AnimRoarNoiseLine: a line flies out of the attacker, up (args[2] 0), down (1) or straight, 14 frames. */
  gRoarNoiseLineSpriteTemplate: {
    tag: "ANIM_TAG_NOISE_LINE",
    width: 32,
    height: 32,
    anims: [[F(0, 3), F(16, 3), J(0)], [F(32, 3), F(48, 3), J(0)]],
    init(sprite, run, args, done) {
      const [x, y] = battlerCoords(run, AnimBattler.Attacker);
      sprite.x = x + flip(run, args[0]);
      sprite.y = y + args[1];
      let stepY = 0;
      if (args[2] === 0) stepY = -0x280;
      else if (args[2] === 1) {
        sprite.vFlip = true;
        stepY = 0x280;
      } else sprite.startAnim(1);
      const stepX = run.attacker.foe ? -0x280 : 0x280;
      if (run.attacker.foe) sprite.hFlip = true;
      let [ox, oy, n] = [0, 0, 0];
      sprite.callback = () => {
        ox += stepX;
        oy += stepY;
        sprite.x2 = ox >> 8;
        sprite.y2 = oy >> 8;
        if (++n === 14) done();
      };
    },
  },
};

/** SetPsychicBackground_Step / FadeScreenToWhite_Step: the background's colors 1-11 rotate every 4 frames until args[7] is -1. */
function rotateBackgroundColors(run: AnimRun, buffers: readonly Uint16Array[]): Generator<void, void, void> {
  const base = 2 * 16;
  return (function* () {
    let n = 0;
    for (;;) {
      if (++n === 4) {
        n = 0;
        for (const buffer of buffers) {
          const last = buffer[base + 11];
          for (let i = 10; i > 0; i--) buffer[base + i + 1] = buffer[base + i];
          buffer[base + 1] = last;
        }
      }
      if (run.args[ARG_RET] === -1) return;
      yield;
    }
  })();
}

export const EFFECT_TASKS: Record<string, AnimTask> = {
  /** AnimTask_TraceMonBlended: args[3] blended copies of the battler, args[1] + 1 frames apart, each staying args[2] frames. */
  *AnimTask_TraceMonBlended(run, args) {
    const mon = monSprite(run, args[0]);
    if (!mon) return;
    const { sprites } = run.flow.gba;
    let [left, wait, active] = [args[3], 0, 0];
    while (left > 0 || active > 0) {
      if (left > 0) {
        if (wait > 0) wait--;
        else {
          const copy = cloneMon(run, mon);
          if (copy) {
            copy.priority = args[0] ? 1 : 2;
            let life = args[2];
            active++;
            copy.callback = () => {
              if (life > 0) life--;
              else {
                active--;
                sprites.destroy(copy);
              }
            };
          }
          left--;
          wait = args[1];
        }
      }
      yield;
    }
  },

  /** AnimTask_StretchTargetUp: the target stretches up and back, shaking. */
  *AnimTask_StretchTargetUp(run) {
    const mon = monSprite(run, AnimBattler.Target);
    if (!mon) return;
    mon.x2 = 4;
    yield;
    yield* monAffine(mon, [A(10, -13, 0, 10), A(-10, 13, 0, 10), END], () => (mon.x2 = -mon.x2));
    mon.x2 = mon.y2 = 0;
  },

  /** AnimTask_SetPsychicBackground: the psychic background's colors cycle while the script runs. */
  *AnimTask_SetPsychicBackground(run) {
    run.spawn(rotateBackgroundColors(run, [run.flow.gba.palettes.faded]));
  },

  /** AnimTask_FadeScreenToWhite: the same, in both color buffers (they stay through fades). */
  *AnimTask_FadeScreenToWhite(run) {
    const { palettes } = run.flow.gba;
    run.spawn(rotateBackgroundColors(run, [palettes.faded, palettes.unfaded]));
  },

  /** AnimTask_RockMonBackAndForth: the battler (args[0]) rocks side to side args[1] times, args[2] fast. */
  *AnimTask_RockMonBackAndForth(run, args) {
    if (!args[1]) return;
    const mon = monSprite(run, args[0]);
    if (!mon) return;
    const speed = Math.max(0, Math.min(2, args[2]));
    const steps = 8 - 2 * speed;
    const foe = run.mon(args[0] === 0 ? AnimBattler.Attacker : AnimBattler.Target).foe;
    const turn = (0x100 + speed * 128) * (foe ? -1 : 1);
    const slideBy = (speed + 2) * (foe ? -1 : 1);
    mon.affineAnimPaused = true;
    let rot = 0;
    const swing = function* (by: number, n: number) {
      for (let i = 0; i < n; i++) {
        mon.x2 += by;
        rot -= by === slideBy ? turn : -turn;
        mon.setRotScale(0x100, 0x100, rot & 0xffff);
        mon.y2 = Math.abs(mon.matrixC) >> 3;
        yield;
      }
    };
    yield;
    for (let left = args[1]; left > 0; left--) {
      yield* swing(slideBy, steps);
      yield* swing(-slideBy, steps * 2);
      yield* swing(slideBy, steps);
    }
    mon.setRotScale(0x100, 0x100, 0);
    mon.affineAnimPaused = false;
    mon.x2 = mon.y2 = 0;
  },
};
