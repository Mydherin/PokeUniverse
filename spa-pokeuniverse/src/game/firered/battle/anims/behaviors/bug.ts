// Bug (battle_anim_bug.c): horns and needles, threads and webs, missiles that fly in arcs.

import { Effect, Layer } from "../../../../gba/video";
import { AnimBattler, type AnimSpriteTemplate } from "../script";
import { A, arc, arcTan2Neg, END, flip, flyTo, goneAtAffineEnd, J, L, placeAtAttacker, rotScale, runSprite, sin, travel } from "./util";

/** AnimMissileArc: an arc from the attacker, the sprite turned along its way. */
const missileArc: AnimSpriteTemplate["init"] = (sprite, run, args, done) => {
  placeAtAttacker(sprite, run, args);
  const [tx, ty] = run.center(AnimBattler.Target);
  const [toX, toY] = [tx + flip(run, args[2]), ty + args[3]];
  sprite.invisible = true;
  sprite.affineAnimPaused = true;
  let lastX = sprite.x;
  let lastY = sprite.y;
  runSprite(
    sprite,
    (function* () {
      yield;
      sprite.invisible = false;
      yield* arc(sprite, args[4], toX, toY, args[5], () => {
        const [x, y] = [sprite.x + sprite.x2, sprite.y + sprite.y2];
        if (x !== lastX || y !== lastY) rotScale(sprite, 0x100, 0x100, (arcTan2Neg(x - lastX, y - lastY) + 0xc000) & 0xffff);
        [lastX, lastY] = [x, y];
      });
    })(),
    done,
  );
};

export const BUG_TEMPLATES: Record<string, AnimSpriteTemplate> = {
  /** AnimMegahornHorn: from near the target onto it, mirrored when the target is the player's. */
  gMegahornHornSpriteTemplate: {
    tag: "ANIM_TAG_HORN_HIT_2",
    width: 32,
    height: 16,
    affine: true,
    affineAnims: [[A(0x100, 0x100, 30, 0), END], [A(0x100, 0x100, -99, 0), END], [A(0x100, 0x100, 94, 0), END]],
    init(sprite, run, args, done) {
      const mirror = !run.target.foe;
      const m = (v: number) => (mirror ? -v : v);
      if (mirror) sprite.startAffineAnim(1);
      const [x, y] = run.center(AnimBattler.Target);
      sprite.x = x + m(args[0]);
      sprite.y = y + m(args[1]);
      flyTo(sprite, args[4], x + m(args[2]), y + m(args[3]), done);
    },
  },

  /** AnimLeechLifeNeedle: from near the target onto it. */
  gLeechLifeNeedleSpriteTemplate: {
    tag: "ANIM_TAG_NEEDLE",
    width: 16,
    height: 16,
    affineNormal: true,
    affineAnims: [[A(0, 0, -33, 1), END], [A(0, 0, 96, 1), END], [A(0, 0, -96, 1), END]],
    init(sprite, run, args, done) {
      const m = (v: number) => (run.target.foe ? v : -v);
      if (!run.target.foe) sprite.startAffineAnim(1);
      const [x, y] = run.center(AnimBattler.Target);
      sprite.x = x + m(args[0]);
      sprite.y = y + m(args[1]);
      flyTo(sprite, args[2], x, y, done);
    },
  },

  /** AnimTranslateWebThread: a thread flies to the target (args[2]: its speed from the distance), swaying by args[3]. */
  gWebThreadSpriteTemplate: {
    tag: "ANIM_TAG_WEB_THREAD",
    width: 8,
    height: 8,
    init(sprite, run, args, done) {
      placeAtAttacker(sprite, run, args);
      const [x, y] = run.center(AnimBattler.Target);
      let phase = 0;
      runSprite(
        sprite,
        (function* () {
          yield;
          // InitAnimLinearTranslationWithSpeed: args[2] is the speed, the distance gives the frames.
          const steps = Math.max(1, Math.trunc((Math.abs(x - sprite.x) << 8) / args[2]));
          const moving = travel(sprite, steps, x, y);
          while (!moving.next().done) {
            sprite.x2 += sin(phase, args[3]);
            phase = (phase + 13) & 0xff;
            yield;
          }
        })(),
        done,
      );
    },
  },

  /** AnimStringWrap: flickers on the target, 51 frames. */
  gStringWrapSpriteTemplate: {
    tag: "ANIM_TAG_STRING",
    width: 64,
    height: 32,
    init(sprite, run, args, done) {
      const [x, y] = run.target.foe ? [176, 40] : [72, 80];
      sprite.x = x + flip(run, args[0]);
      sprite.y = y + args[1] + (run.target.foe ? 0 : 8);
      let [flicker, age] = [0, 0];
      sprite.callback = () => {
        if (++flicker === 3) {
          flicker = 0;
          sprite.invisible = !sprite.invisible;
        }
        if (++age === 51) done();
      };
    },
  },

  /** AnimSpiderWeb: a web grows over the target, then fades. */
  gSpiderWebSpriteTemplate: {
    tag: "ANIM_TAG_SPIDER_WEB",
    width: 64,
    height: 64,
    affine: true,
    blend: true,
    affineAnims: [[A(0x10, 0x10, 0, 0), A(6, 6, 0, 1), J(1)]],
    init(sprite, run, _args, done) {
      const { video } = run.flow.gba;
      video.effect = Effect.Blend;
      video.target1 = 0;
      video.target2 = Layer.ALL;
      video.eva = 16;
      video.evb = 0;
      let [alpha, wait, tick] = [16, 0, 0];
      sprite.callback = () => {
        if (wait < 20) return void wait++;
        if (!(tick++ & 1)) return;
        alpha--;
        video.eva = alpha;
        video.evb = 16 - alpha;
        if (alpha === 0) {
          sprite.invisible = true;
          video.resetBlend();
          done();
        }
      };
    },
  },

  /** AnimTranslateStinger: a needle in a straight line, pointed along it. */
  gLinearStingerSpriteTemplate: {
    tag: "ANIM_TAG_NEEDLE",
    width: 16,
    height: 16,
    affineNormal: true,
    init(sprite, run, args, done) {
      const foe = run.attacker.foe;
      const dx2 = foe ? -args[2] : args[2];
      const dy1 = foe ? -args[1] : args[1];
      const dy3 = foe ? -args[3] : args[3];
      placeAtAttacker(sprite, run, [args[0], dy1]);
      const [tx, ty] = run.center(AnimBattler.Target);
      const [toX, toY] = [tx + dx2, ty + dy3];
      rotScale(sprite, 0x100, 0x100, (arcTan2Neg(toX - sprite.x, toY - sprite.y) + 0xc000) & 0xffff);
      flyTo(sprite, args[4], toX, toY, done);
    },
  },

  gPinMissileSpriteTemplate: { tag: "ANIM_TAG_NEEDLE", width: 16, height: 16, affineNormal: true, init: missileArc },
  gIcicleSpearSpriteTemplate: { tag: "ANIM_TAG_ICICLE_SPEAR", width: 32, height: 32, affineNormal: true, init: missileArc },

  /** AnimTailGlowOrb: a circle of light grows and pulses on the battler (args[0]). */
  gTailGlowOrbSpriteTemplate: {
    tag: "ANIM_TAG_CIRCLE_OF_LIGHT",
    width: 64,
    height: 64,
    affineNormal: true,
    blend: true,
    affineAnims: [[A(0x10, 0x10, 0, 0), A(8, 8, 0, 18), L(0), A(-5, -5, 0, 8), A(5, 5, 0, 8), L(5), END]],
    init(sprite, run, args, done) {
      const [x, y] = run.center(args[0] === 0 ? AnimBattler.Attacker : AnimBattler.Target);
      sprite.x = x;
      sprite.y = y + 18;
      goneAtAffineEnd(sprite, done);
    },
  },
};

