// Dragon (battle_anim_dragon.c): flames thrown at the target and the orbs of Dragon Dance.

import type { AffineCmd, AnimCmd } from "../../../../gba/sprites";
import { SIN } from "../../../../gba/trig";
import { AnimBattler, type AnimSpriteTemplate, type AnimTask } from "../script";
import { A, battlerCoords, cos, END, F, flip, flickerLine, flyTo, goneAtAnimEnd, J, monSprite, runSprite, sideX, sin } from "./util";

/** sAnims_OutrageOverheatFire. */
const FLAME_ANIMS: AnimCmd[][] = [[F(0, 4), F(16, 4), F(32, 4), F(48, 4), F(64, 4), J(0)]];
const EMBER = { tag: "ANIM_TAG_SMALL_EMBER", width: 32, height: 32 } as const;

/** AnimDragonFireToTarget: from the attacker to the target; mirrored art for the foe. */
const fireToTarget: AnimSpriteTemplate["init"] = (sprite, run, args, done) => {
  const foe = run.attacker.foe;
  if (foe) sprite.startAffineAnim(1);
  else sprite.startAnim(1);
  const [ax, ay] = run.center(AnimBattler.Attacker);
  const [tx, ty] = run.center(AnimBattler.Target);
  sprite.x = ax + (foe ? -args[1] : args[0]);
  sprite.y = ay + args[1];
  flyTo(sprite, args[4], tx + (foe ? -args[2] : args[2]), ty + args[3], done);
};

const FIRE_BREATH_AFFINE: AffineCmd[][] = [[A(0x50, 0x50, 127, 0), A(0xd, 0xd, 0, 100), END], [A(0x50, 0x50, 0, 0), A(0xd, 0xd, 0, 100), END]];

export const DRAGON_TEMPLATES: Record<string, AnimSpriteTemplate> = {
  /** AnimOutrageFlame: flickers from the attacker at (args[3], args[4]) 8.8 a frame for args[2] frames. */
  gOutrageFlameSpriteTemplate: {
    ...EMBER,
    anims: FLAME_ANIMS,
    init(sprite, run, args, done) {
      const [x, y] = run.center(AnimBattler.Attacker);
      sprite.x = x + flip(run, args[0]);
      sprite.y = y + args[1];
      sprite.invisible = true;
      runSprite(
        sprite,
        (function* () {
          yield;
          yield* flickerLine(sprite, args[2], flip(run, args[3]), flip(run, args[4]), args[5]);
        })(),
        done,
      );
    },
  },

  gDragonBreathFireSpriteTemplate: {
    ...EMBER,
    affine: true,
    anims: [
      [F(16, 3), F(32, 3), F(48, 3), J(0)],
      [F(16, 3, "hv"), F(32, 3, "hv"), F(48, 3, "hv"), J(0)],
    ],
    affineAnims: FIRE_BREATH_AFFINE,
    init: fireToTarget,
  },

  gDragonRageFireSpitSpriteTemplate: {
    ...EMBER,
    affine: true,
    anims: [
      [F(16, 3), F(32, 3), F(48, 3), J(0)],
      [F(16, 3), F(32, 3), F(48, 3), J(0)],
    ],
    affineAnims: [[A(0x64, 0x64, 127, 1), END], [A(0x64, 0x64, 0, 1), END]],
    init: fireToTarget,
  },

  /** AnimDragonRageFirePlume: at the battler's spot (args[0]), gone when its animation ends. */
  gDragonRageFirePlumeSpriteTemplate: {
    tag: "ANIM_TAG_FIRE_PLUME",
    width: 32,
    height: 32,
    anims: [[F(0, 5), F(16, 5), F(32, 5), F(48, 5), F(64, 5), END]],
    init(sprite, run, args, done) {
      [sprite.x, sprite.y] = battlerCoords(run, args[0] === 0 ? AnimBattler.Attacker : AnimBattler.Target);
      sprite.x += sideX(run, args[1]);
      sprite.y += args[2];
      goneAtAnimEnd(sprite, done);
    },
  },

  /** AnimDragonDanceOrb: circles the attacker faster and faster for 60 frames, then flies off in a wider circle. */
  gDragonDanceOrbSpriteTemplate: {
    tag: "ANIM_TAG_HOLLOW_ORB",
    width: 16,
    height: 16,
    init(sprite, run, args, done) {
      [sprite.x, sprite.y] = run.center(AnimBattler.Attacker);
      const mon = run.attacker.sprite;
      // GetBattlerSpriteCoordAttr's size: half the picture's box.
      let radius = (mon ? Math.max(mon.width, mon.height) : 64) >> 1;
      let [phase, speed, tick, age, out] = [args[0], 1, 0, 0, false];
      const place = () => {
        sprite.x2 = cos(phase, radius);
        sprite.y2 = sin(phase, radius);
      };
      place();
      sprite.callback = () => {
        phase = (phase - speed) & 0xff;
        if (out && radius <= 0x95 && (radius += 8) > 0x95) radius = 0x96;
        place();
        if (++tick > 5) {
          tick = 0;
          if (speed <= 15 && ++speed > 15) speed = 16;
        }
        if (++age > (out ? 20 : 0x3c)) {
          if (out) return done();
          age = 0;
          out = true;
        }
      };
    },
  },

  /** AnimOverheatFlame: from a spot on a ring of args[2] at angle args[1], outward for args[3] frames. */
  gOverheatFlameSpriteTemplate: {
    ...EMBER,
    anims: FLAME_ANIMS,
    init(sprite, run, args, done) {
      const [x, y] = run.center(AnimBattler.Attacker);
      const stepX = cos(args[1], args[2]);
      const stepY = sin(args[1], Math.trunc((args[2] * 3) / 5));
      sprite.x = x + stepX * args[0];
      sprite.y = y + args[4] + stepY * args[0];
      let [ox, oy, age] = [0, 0, 0];
      sprite.callback = () => {
        ox += stepX;
        oy += stepY;
        sprite.x2 = Math.trunc(ox / 10);
        sprite.y2 = Math.trunc(oy / 10);
        if (++age > args[3]) done();
      };
    },
  },
};

export const DRAGON_TASKS: Record<string, AnimTask> = {
  /**
   * AnimTask_DragonDanceWaver: a wave of scanline shifts over the attacker. Our battlers are
   * sprites: the whole sprite sways with the wave's amplitude (0-3, held 60 frames, back).
   */
  *AnimTask_DragonDanceWaver(run) {
    const mon = monSprite(run, AnimBattler.Attacker);
    if (!mon) return;
    let [amp, phase, wait, hold] = [0, 0, 0, 0];
    const sway = () => {
      mon.x2 = (SIN[phase] * amp) >> 7;
      phase = (phase + 9) & 0xff;
    };
    while (amp < 3) {
      if (++wait > 1) {
        wait = 0;
        amp++;
      }
      sway();
      yield;
    }
    while (++hold <= 0x3c) {
      sway();
      yield;
    }
    while (amp > 0) {
      if (++wait > 1) {
        wait = 0;
        amp--;
      }
      sway();
      yield;
    }
    mon.x2 = 0;
  },
};
