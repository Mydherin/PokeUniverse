// Shared effects (battle_anim_effects_3.c): eyes, hands, stars, spotlights and mon deformations.

import { ObjMode, type Sprite } from "../../../../gba/sprites";
import { SIN } from "../../../../gba/trig";
import { Effect, Layer } from "../../../../gba/video";
import type { AnimArtFiles, SoundId } from "../../../manifest";
import { initBg } from "../../../common";
import { AnimBattler, type AnimRun, type AnimSpriteTemplate, type AnimTask } from "../script";
import { monBlend } from "./dark";
import { monAffine } from "./effects";
import { THOUGHT_ANIMS } from "./effects-1";
import { showDoll } from "./general";
import { A, arc, arcTan2Neg, battlerCoords, cloneMon, cos, END, F, flip, flipTarget, flyTo, goneAtAnimEnd, J, L, monSprite, PIC_HALF, placeAtAttacker, placeAtTarget, random, resetMonScale, rotScale, runSprite, sideX, sin, spriteOnMon, throwProjectile, travel } from "./util";

const ANIM_PALETTE = 8;
const rgb = (r: number, g: number, b: number) => r | (g << 5) | (b << 10);
const SPOTLIGHT_AFFINE = [[A(0, 0x180, 0, 0), A(0x10, 0, 0, 20), END], [A(0x140, 0x180, 0, 0), A(-0x10, 0, 0, 19), END]];
const YAWN_AFFINE = [
  [A(0x80, 0x80, 0, 0), A(-8, -8, 0, 8), A(8, 8, 0, 8), J(0)],
  [A(0xc0, 0xc0, 0, 0), A(8, 8, 0, 8), A(-8, -8, 0, 8), J(0)],
  [A(0x100, 0x100, 0, 0), A(8, 8, 0, 8), A(-8, -8, 0, 8), J(0)],
];
const HAND = { tag: "ANIM_TAG_TAG_HAND", width: 32, height: 32 } as const;

/** The OBJ window a spotlight sprite opens: outside it the screen takes the color effect. */
function spotlightOn(run: AnimRun, sprite: Sprite): void {
  const { video } = run.flow.gba;
  video.objWinOn = true;
  video.winOut = Layer.ALL | 32;
  video.winObj = Layer.ALL;
  sprite.mode = ObjMode.Window;
  sprite.invisible = true;
}

function spotlightOff(run: AnimRun): void {
  const { video } = run.flow.gba;
  video.objWinOn = false;
  video.winObj = 0;
  if (!video.win0On && !video.win1On) video.winOut = 0;
}

/** AnimClappingHand; `window`: AnimClappingHand2 opens the OBJ window instead. */
const clappingHand =
  (window: boolean): AnimSpriteTemplate["init"] =>
  (sprite, run, args, done) => {
    if (window) sprite.mode = ObjMode.Window;
    if (args[3] === 0) [sprite.x, sprite.y] = battlerCoords(run, AnimBattler.Attacker);
    sprite.x += args[0];
    sprite.y += args[1];
    sprite.tileNum += 16;
    const left = args[2] === 0;
    sprite.hFlip = left;
    sprite.x2 = left ? -12 : 12;
    const step = left ? 2 : -2;
    let [claps, out] = [args[4], false];
    sprite.callback = () => {
      if (!out) {
        sprite.x2 += step;
        if (sprite.x2 === 0) {
          out = true;
          if (!window && args[2] === 0) run.play("se_m_encore" as SoundId, run.pan(-64));
        }
      } else {
        sprite.x2 -= step;
        if (Math.abs(sprite.x2) === 12) {
          claps--;
          out = false;
        }
      }
      if (claps === 0) done();
    };
  };

/** AnimMiniTwinklingStar. */
const MINI_STAR: AnimSpriteTemplate = {
  tag: "ANIM_TAG_GOLD_STARS",
  width: 8,
  height: 8,
  init(sprite, _run, _args, done) {
    sprite.tileNum += random(4) === 0 ? 4 : 5;
    let y = random(8);
    if (y > 3) y = -y;
    sprite.y2 = y;
    let [n, wait] = [0, 0];
    sprite.callback = () => {
      if (++n < 30) {
        if (++wait === 2) {
          sprite.invisible = !sprite.invisible;
          wait = 0;
        }
      } else {
        if (wait === 2) sprite.invisible = false;
        if (wait === 3) {
          sprite.invisible = true;
          wait = -1;
        }
        wait++;
      }
      if (n > 60) done();
    };
  },
};

export const EFFECTS_3_TEMPLATES: Record<string, AnimSpriteTemplate> = {
  gScratchSpriteTemplate: { tag: "ANIM_TAG_SCRATCH", width: 32, height: 32, blend: true, anims: [[F(0, 4), F(16, 4), F(32, 4), F(48, 4), F(64, 4), END]], init: spriteOnMon },
  gBlackBallSpriteTemplate: { tag: "ANIM_TAG_BLACK_BALL", width: 8, height: 8, init: throwProjectile },
  gOpeningEyeSpriteTemplate: { tag: "ANIM_TAG_OPENING_EYE", width: 32, height: 32, anims: [[F(0, 40), F(16, 8), F(32, 40), END]], init: spriteOnMon },
  gEclipsingOrbSpriteTemplate: { tag: "ANIM_TAG_ECLIPSING_ORB", width: 32, height: 32, anims: [[F(0, 3), F(16, 3), F(32, 3), F(48, 3), F(32, 3, "h"), F(16, 3, "h"), F(0, 3, "h"), L(1), END]], init: spriteOnMon },
  gClappingHandSpriteTemplate: { ...HAND, init: clappingHand(false) },
  gClappingHand2SpriteTemplate: { ...HAND, init: clappingHand(true) },

  /** AnimBlackSmoke. */
  gBlackSmokeSpriteTemplate: {
    tag: "ANIM_TAG_BLACK_SMOKE",
    width: 32,
    height: 16,
    init(sprite, _run, args, done) {
      sprite.x += args[0];
      sprite.y += args[1];
      const speed = args[3] ? -args[2] : args[2];
      let [left, x] = [args[4], 0];
      sprite.callback = () => {
        if (left <= 0) return done();
        sprite.x2 = x >> 8;
        x += speed;
        sprite.invisible = !sprite.invisible;
        left--;
      };
    },
  },

  /** AnimWhiteHalo: 90 frames, then fades out. */
  gWhiteHaloSpriteTemplate: {
    tag: "ANIM_TAG_ROUND_WHITE_HALO",
    width: 64,
    height: 64,
    blend: true,
    init(sprite, run, _args, done) {
      monBlend(run, 7, 9);
      runSprite(
        sprite,
        (function* () {
          for (let n = 0; n <= 90; n++) yield;
          for (let level = 7; level >= 0; level--) {
            monBlend(run, level, 16 - level);
            yield;
          }
          sprite.invisible = true;
          yield;
          run.flow.gba.video.resetBlend();
        })(),
        done,
      );
    },
  },

  /** AnimTealAlert: from around the target into its middle, turned that way. */
  gTealAlertSpriteTemplate: {
    tag: "ANIM_TAG_TEAL_ALERT",
    width: 32,
    height: 32,
    affineNormal: true,
    init(sprite, run, args, done) {
      const [x, y] = run.center(AnimBattler.Target);
      placeAtTarget(sprite, run, args);
      rotScale(sprite, 0x100, 0x100, (arcTan2Neg(sprite.x - x, sprite.y - y) + 0x6000) & 0xffff);
      flyTo(sprite, args[2], x, y, done);
    },
  },

  /** AnimMeanLookEye: breathes, shrinks away, returns big and fades out. */
  gMeanLookEyeSpriteTemplate: {
    tag: "ANIM_TAG_EYE",
    width: 64,
    height: 64,
    affine: true,
    blend: true,
    affineAnims: [[A(0x180, 0x180, 0, 0), A(-0x20, 0x18, 0, 5), A(0x18, -0x20, 0, 5), J(1)], [A(0x30, 0x30, 0, 0), A(0x20, 0x20, 0, 6), END]],
    init(sprite, run, _args, done) {
      monBlend(run, 0, 16);
      runSprite(
        sprite,
        (function* () {
          yield;
          let [level, down, n] = [4, false, 0];
          for (;;) {
            monBlend(run, level, 16 - level);
            level += down ? -1 : 1;
            if (level === 15 || level === 4) down = !down;
            if (n++ > 70) break;
            yield;
          }
          run.flow.gba.video.resetBlend();
          sprite.startAffineAnim(1);
          sprite.invisible = true;
          sprite.affineAnimPaused = true;
          for (let wait = 0; wait <= 10; wait++) yield;
          sprite.invisible = false;
          sprite.affineAnimPaused = false;
          yield;
          while (!sprite.affineEnded) yield;
          for (let i = 0, t = 0; i <= 16; i++) {
            [sprite.x2, sprite.y2] = t < 2 ? [1, 0] : t < 4 ? [-1, 0] : t < 6 ? [0, 1] : [0, -1];
            if (++t > 7) t = 0;
            yield;
          }
          let [wait, a] = [0, 16];
          monBlend(run, a, 0);
          for (;;) {
            yield;
            monBlend(run, a, 16 - a);
            if (wait++ > 1) {
              a--;
              wait = 0;
            }
            if (a === 0) sprite.invisible = true;
            if (a < 0) break;
          }
          run.flow.gba.video.resetBlend();
        })(),
        done,
      );
    },
  },

  /** AnimSpikes: thrown high to the target's spot, rests 30, flickers away. */
  gSpikesSpriteTemplate: {
    tag: "ANIM_TAG_SPIKES",
    width: 16,
    height: 16,
    init(sprite, run, args, done) {
      placeAtAttacker(sprite, run, args);
      const [x, y] = battlerCoords(run, AnimBattler.Target);
      runSprite(
        sprite,
        (function* () {
          yield;
          yield* arc(sprite, args[4], x + flip(run, args[2]), y + args[3], -50);
          for (let n = 0; n <= 30; n++) yield;
          for (let n = 0; n < 16; n++) {
            if (n & 1) sprite.invisible = !sprite.invisible;
            yield;
          }
        })(),
        done,
      );
    },
  },

  /** AnimLeer. */
  gLeerSpriteTemplate: {
    tag: "ANIM_TAG_LEER",
    width: 32,
    height: 32,
    anims: [[F(0, 3), F(16, 3), F(32, 3), F(48, 3), F(64, 3), END]],
    init(sprite, run, args, done) {
      [sprite.x, sprite.y] = run.center(AnimBattler.Attacker);
      sprite.x += sideX(run, args[0]);
      sprite.y += args[1];
      goneAtAnimEnd(sprite, done);
    },
  },

  /** AnimLetterZ: drifts from the attacker, waving, until off screen. */
  gLetterZSpriteTemplate: {
    tag: "ANIM_TAG_LETTER_Z",
    width: 32,
    height: 32,
    affineNormal: true,
    anims: [[F(0, 3), END]],
    affineAnims: [[A(-7, -7, -3, 16), A(7, 7, 3, 16), J(0)]],
    init(sprite, run, args, done) {
      [sprite.x, sprite.y] = run.center(AnimBattler.Attacker);
      sprite.x += sideX(run, args[0]);
      const [dx, dy] = run.attacker.foe ? [-args[2], -args[3]] : [args[2], args[3]];
      let [n, x, y] = [0, 0, 0];
      const step = () => {
        n++;
        x += dx;
        y += dy;
        sprite.x2 = Math.trunc(x / 2);
        sprite.y2 = sin((n * 20) & 0xff, 5) + Math.trunc(y / 2);
        if (((sprite.x + sprite.x2) & 0xffff) > 240) done();
      };
      sprite.callback = step;
      step();
    },
  },

  /** AnimFang. */
  gFangSpriteTemplate: {
    tag: "ANIM_TAG_FANG_ATTACK",
    width: 32,
    height: 32,
    affine: true,
    anims: [[F(0, 8), F(16, 16), F(32, 4), F(48, 4), END]],
    affineAnims: [[A(0x200, 0x200, 0, 0), A(-0x20, -0x20, 0, 8), END]],
    init(sprite, _run, _args, done) {
      goneAtAnimEnd(sprite, done);
    },
  },

  /** AnimSpotlight: an OBJ window opens on the target, sways, closes. */
  gSpotlightSpriteTemplate: {
    tag: "ANIM_TAG_SPOTLIGHT",
    width: 64,
    height: 64,
    affine: true,
    affineAnims: SPOTLIGHT_AFFINE,
    init(sprite, run, args, done) {
      spotlightOn(run, sprite);
      placeAtTarget(sprite, run, args, false);
      runSprite(
        sprite,
        (function* () {
          yield;
          sprite.invisible = false;
          while (!sprite.affineEnded) yield;
          let x = 0;
          for (const [frames, by] of [[21, 117], [41, -117], [21, 117]]) {
            for (let n = 0; n < frames; n++) {
              x += by;
              sprite.x2 = x >> 8;
              yield;
            }
          }
          sprite.startAffineAnim(1);
          yield;
          yield;
          while (!sprite.affineEnded) yield;
          sprite.invisible = true;
          yield;
          spotlightOff(run);
        })(),
        done,
      );
    },
  },

  /** AnimFlatterSpotlight: the same, still for args[2] frames. */
  gFlatterSpotlightSpriteTemplate: {
    tag: "ANIM_TAG_SPOTLIGHT",
    width: 64,
    height: 64,
    affine: true,
    affineAnims: SPOTLIGHT_AFFINE,
    init(sprite, run, args, done) {
      spotlightOn(run, sprite);
      placeAtTarget(sprite, run, args, false);
      runSprite(
        sprite,
        (function* () {
          yield;
          sprite.invisible = false;
          while (!sprite.affineEnded) yield;
          for (let left = args[2]; left > 0; left--) yield;
          sprite.startAffineAnim(1);
          yield;
          while (!sprite.affineEnded) yield;
          sprite.invisible = true;
          yield;
          spotlightOff(run);
        })(),
        done,
      );
    },
  },

  /** AnimRapidSpin: spins sideways between two heights on a battler's spot. */
  gRapidSpinSpriteTemplate: {
    tag: "ANIM_TAG_RAPID_SPIN",
    width: 32,
    height: 16,
    anims: [[F(0, 2), F(8, 2), F(16, 2), J(0)]],
    init(sprite, run, args, done) {
      const [x, y] = battlerCoords(run, args[0] === 0 ? AnimBattler.Attacker : AnimBattler.Target);
      sprite.x = x + args[1];
      sprite.y = y;
      sprite.y2 = args[2];
      const up = sprite.y2 > args[3];
      let phase = 0;
      sprite.callback = () => {
        phase = (phase + args[4]) & 0xff;
        sprite.x2 = SIN[phase] >> 4;
        sprite.y2 += args[5];
        if (up ? sprite.y2 < args[3] : sprite.y2 > args[3]) done();
      };
    },
  },

  /** AnimTriAttackTriangle: spins at the attacker, flickering, then flies to the target in 20. */
  gTriAttackTriangleSpriteTemplate: {
    tag: "ANIM_TAG_TRI_ATTACK_TRIANGLE",
    width: 64,
    height: 64,
    affine: true,
    anims: [[F(0, 8), END]],
    affineAnims: [[A(0, 0, 5, 40), A(0, 0, 10, 10), A(0, 0, 15, 10), A(0, 0, 20, 40), J(0)]],
    init(sprite, run, args, done) {
      placeAtAttacker(sprite, run, args, false);
      runSprite(
        sprite,
        (function* () {
          yield;
          for (let n = 1; n <= 61; n++) {
            if (n < 40) sprite.invisible = !(n & 1);
            if (n > 30) sprite.invisible = false;
            if (n < 61) yield;
          }
          const [x, y] = run.center(AnimBattler.Target);
          yield;
          yield* travel(sprite, 20, x, y);
        })(),
        done,
      );
    },
  },

  /** AnimBatonPassPokeball: the attacker squashes away, the ball flies up. */
  gBatonPassPokeballSpriteTemplate: {
    tag: "ANIM_TAG_POKEBALL",
    width: 16,
    height: 16,
    init(sprite, run, _args, done) {
      const mon = monSprite(run, AnimBattler.Attacker);
      [sprite.x, sprite.y] = run.center(AnimBattler.Attacker);
      runSprite(
        sprite,
        (function* () {
          if (mon) {
            mon.affineAnimPaused = true;
            let [x, y] = [256, 256];
            yield;
            for (let n = 1; n <= 9; n++) {
              x += 96;
              y += n <= 5 ? -26 : 48;
              mon.setRotScale(x, y, 0);
              yield;
            }
            mon.invisible = true;
            resetMonScale(mon);
          }
          for (;;) {
            sprite.y2 -= 6;
            if (sprite.y + sprite.y2 < -32) return;
            yield;
          }
        })(),
        done,
      );
    },
  },

  /** AnimWishStar: crosses the top of the screen leaving twinkles. */
  gWishStarSpriteTemplate: {
    tag: "ANIM_TAG_GOLD_STARS",
    width: 16,
    height: 16,
    init(sprite, run, _args, done) {
      const foe = run.attacker.foe;
      sprite.x = foe ? -16 : 256;
      sprite.y = 0;
      let [x, fall, n] = [0, 0, 0];
      sprite.callback = () => {
        x += 72;
        sprite.x2 = foe ? x >> 4 : -(x >> 4);
        fall += 16;
        sprite.y2 += fall >> 8;
        if (++n % 3 === 0) run.createSprite(MINI_STAR, sprite.x + sprite.x2, sprite.y + sprite.y2, sprite.subpriority + 1);
        if (((sprite.x + sprite.x2 + 32) >>> 0) > 304) done();
      };
    },
  },

  /** AnimSwallowBlueOrb: tossed up from the attacker's spot, gone when it falls back. */
  gSwallowBlueOrbSpriteTemplate: {
    tag: "ANIM_TAG_BLUE_ORB",
    width: 8,
    height: 8,
    init(sprite, run, args, done) {
      placeAtAttacker(sprite, run, args, false);
      const stop = run.center(AnimBattler.Attacker)[1];
      let rise = 0x900;
      sprite.callback = () => {
        sprite.y2 -= rise >> 8;
        rise -= 96;
        if (sprite.y + sprite.y2 > stop) done();
      };
    },
  },

  /** AnimGreenStar: rises from under the attacker with two trailing stars. */
  gGreenStarSpriteTemplate: {
    tag: "ANIM_TAG_GREEN_STAR",
    width: 16,
    height: 16,
    anims: [[F(0, 6), F(4, 6), J(0)], [F(8, 6), END], [F(12, 6), END]],
    init(sprite, run, args, done) {
      let x = random(64);
      if (x > 31) x = 32 - x;
      const [ax, ay] = battlerCoords(run, AnimBattler.Attacker);
      sprite.x = ax + x;
      sprite.y = ay + 32;
      const trail = (anim: number) => {
        let [left, carry, over] = [args[0], 0, false];
        const star = run.createSprite(
          {
            tag: "ANIM_TAG_GREEN_STAR",
            width: 16,
            height: 16,
            anims: [[F(0, 6), F(4, 6), J(0)], [F(8, 6), END], [F(12, 6), END]],
            init(s) {
              s.startAnim(anim);
              s.invisible = true;
              s.callback = () => {
                if (s.invisible || over) return;
                s.y2 -= (carry + args[1]) >> 8;
                carry = (carry + args[1]) & 0xff;
                if (--left === -1) {
                  s.invisible = true;
                  over = true;
                }
              };
            },
          },
          sprite.x,
          sprite.y,
          sprite.subpriority + 1,
        );
        return { star, ended: () => over };
      };
      const [one, two] = [trail(1), trail(2)];
      let [carry, shown, left] = [0, 0, args[0]];
      sprite.callback = () => {
        if (left >= 0) {
          sprite.y2 -= (carry + args[1]) >> 8;
          carry = (carry + args[1]) & 0xff;
          if (shown === 0 && sprite.y2 < -8) {
            if (one.star) one.star.invisible = false;
            shown++;
          }
          if (shown === 1 && sprite.y2 < -16) {
            if (two.star) two.star.invisible = false;
            shown++;
          }
          if (--left === -1) sprite.invisible = true;
          return;
        }
        if (one.ended() && two.ended()) {
          run.flow.gba.sprites.destroy(one.star);
          run.flow.gba.sprites.destroy(two.star);
          done();
        }
      };
    },
  },

  /** AnimWeakFrustrationAngerMark: after 20 frames falls off. */
  gWeakFrustrationAngerMarkSpriteTemplate: {
    tag: "ANIM_TAG_ANGER",
    width: 16,
    height: 16,
    init(sprite, run, args, done) {
      placeAtAttacker(sprite, run, args, false);
      let [n, x, y] = [0, 0, 0];
      sprite.callback = () => {
        if (n++ <= 20) return;
        x += 160;
        y += 128;
        sprite.x2 = run.attacker.foe ? -(x >> 8) : x >> 8;
        sprite.y2 += y >> 8;
        if (sprite.y2 > 64) done();
      };
    },
  },

  /** AnimSweetScentPetal: crosses the screen waving. */
  gSweetScentPetalSpriteTemplate: {
    tag: "ANIM_TAG_PINK_PETAL",
    width: 8,
    height: 8,
    anims: [
      [F(0, 8), F(1, 8), F(2, 8), F(3, 8), F(3, 8, "v"), F(2, 8, "v"), F(0, 8, "v"), F(1, 8, "v"), J(0)],
      [F(0, 8, "h"), F(1, 8, "h"), F(2, 8, "h"), F(3, 8, "h"), F(3, 8, "hv"), F(2, 8, "hv"), F(0, 8, "hv"), F(1, 8, "hv"), J(0)],
      [F(0, 8), END],
    ],
    init(sprite, run, args, done) {
      const foe = run.attacker.foe;
      sprite.x = foe ? 240 : 0;
      sprite.y = foe ? args[0] - 30 : args[0];
      sprite.startAnim(args[1]);
      let phase = 0;
      sprite.callback = () => {
        phase += 3;
        if (!foe) {
          sprite.x += 5;
          sprite.y -= 1;
          if (sprite.x > 240) return done();
          sprite.y2 = sin(phase & 0xff, 16);
        } else {
          sprite.x -= 5;
          sprite.y += 1;
          if (sprite.x < 0) return done();
          sprite.y2 = cos(phase & 0xff, 16);
        }
      };
    },
  },

  /** AnimPainSplitProjectile: hops off a battler. */
  gPainSplitProjectileSpriteTemplate: {
    tag: "ANIM_TAG_PAIN_SPLIT",
    width: 16,
    height: 16,
    anims: [[F(0, 5), F(4, 9), F(8, 5), END]],
    init(sprite, run, args, done) {
      if (args[2] === AnimBattler.Attacker) [sprite.x, sprite.y] = run.center(AnimBattler.Attacker);
      sprite.x += args[0];
      sprite.y += args[1];
      let [x, y, bounced] = [0x80, 0x300, false];
      runSprite(
        sprite,
        (function* () {
          yield;
          for (;;) {
            sprite.x2 = x >> 8;
            sprite.y2 += y >> 8;
            if (!bounced && sprite.y2 > -args[1]) {
              bounced = true;
              y = Math.trunc(-y / 3) * 2;
            }
            x += 192;
            y += 128;
            if (sprite.animEnded) return;
            yield;
          }
        })(),
        done,
      );
    },
  },

  /** AnimFlatterConfetti: thrown up from a corner at random. */
  gFlatterConfettiSpriteTemplate: {
    tag: "ANIM_TAG_CONFETTI",
    width: 8,
    height: 8,
    init(sprite, _run, args, done) {
      sprite.tileNum += random(12);
      const [r1, r2] = [random(0x200), random(0x100)];
      let vx = r1 & 1 ? 0x5e0 + r1 : 0x5e0 - r1;
      let vy = r2 & 1 ? 0x480 + r2 : 0x480 - r2;
      const left = args[0] === AnimBattler.Attacker;
      sprite.x = left ? -8 : 248;
      sprite.y = 104;
      let n = 0;
      sprite.callback = () => {
        sprite.x2 += left ? vx >> 8 : -(vx >> 8);
        sprite.y2 -= vy >> 8;
        vx = Math.max(vx - 22, 0);
        vy -= 48;
        if (++n === 31) done();
      };
    },
  },

  /** AnimReversalOrb: orbits the attacker out and back. */
  gReversalOrbSpriteTemplate: {
    tag: "ANIM_TAG_BLUE_ORB",
    width: 8,
    height: 8,
    init(sprite, run, args, done) {
      [sprite.x, sprite.y] = run.center(AnimBattler.Attacker);
      const sub = run.attacker.sprite?.subpriority ?? 2;
      let [angle, rx, ry, n, back] = [args[1], 0, 0, 0, false];
      const step = () => {
        sprite.x2 = sin(angle, rx >> 8);
        sprite.y2 = cos(angle, ry >> 8);
        angle = (angle + 9) & 0xff;
        sprite.subpriority = angle < 64 || angle > 195 ? sub - 1 : sub + 1;
        rx += back ? -0x400 : 0x400;
        ry += back ? -0x100 : 0x100;
        if (++n === args[0]) {
          if (back) return done();
          n = 0;
          back = true;
        }
      };
      sprite.callback = step;
      step();
    },
  },

  /** AnimYawnCloud: from the attacker to where it starts, waving, flickers out. */
  gYawnCloudSpriteTemplate: {
    tag: "ANIM_TAG_PINK_CLOUD",
    width: 32,
    height: 32,
    affineNormal: true,
    affineAnims: YAWN_AFFINE,
    init(sprite, run, args, done) {
      const [toX, toY] = [sprite.x, sprite.y];
      [sprite.x, sprite.y] = run.center(AnimBattler.Attacker);
      sprite.startAffineAnim(args[0]);
      const stepX = Math.trunc(((toX - sprite.x) << 4) / 64);
      const stepY = Math.trunc(((toY - sprite.y) << 4) / 64);
      let [x, y, n, wait, flicks] = [sprite.x << 4, sprite.y << 4, 0, 0, 0];
      sprite.callback = () => {
        n++;
        x += stepX;
        y += stepY;
        sprite.x = x >> 4;
        sprite.y = y >> 4;
        sprite.y2 = sin((n * 8) & 0xff, 8);
        if (n > 58 && ++wait > 1) {
          wait = 0;
          sprite.invisible = !!(++flicks & 1);
          if (flicks > 3) done();
        }
      };
    },
  },

  /** AnimAssistPawprint. */
  gAssistPawprintSpriteTemplate: {
    tag: "ANIM_TAG_PAW_PRINT",
    width: 32,
    height: 32,
    init(sprite, _run, args, done) {
      sprite.x = args[0];
      sprite.y = args[1];
      flyTo(sprite, args[4], args[2], args[3], done);
    },
  },

  /** AnimSmellingSaltsHand: slaps a battler args[2] times. */
  gSmellingSaltsHandSpriteTemplate: {
    ...HAND,
    init(sprite, run, args, done) {
      const which = args[0] === AnimBattler.Attacker ? AnimBattler.Attacker : AnimBattler.Target;
      sprite.tileNum += 16;
      const dir = args[1] === 0 ? -1 : 1;
      const [cx, cy] = run.center(which);
      sprite.y = cy;
      sprite.hFlip = args[1] === 0;
      sprite.x = args[1] === 0 ? cx - PIC_HALF - 8 : cx + PIC_HALF + 8;
      runSprite(
        sprite,
        (function* () {
          yield;
          for (let n = 0; n < 12; n++) {
            yield;
            yield;
            sprite.x2 += dir;
          }
          for (let left = args[2]; left > 0; left--) {
            for (let n = 0; n < 8; n++) yield;
            for (let n = 0; n < 6; n++) {
              sprite.x2 -= dir * 4;
              yield;
            }
            for (let n = 0; n < 8; n++) {
              sprite.x2 += dir * 3;
              if (n < 7) yield;
            }
            yield;
          }
        })(),
        done,
      );
    },
  },

  /** AnimSmellingSaltExclamation: blinks on a battler's head. */
  gSmellingSaltExclamationSpriteTemplate: {
    tag: "ANIM_TAG_SMELLINGSALT_EFFECT",
    width: 32,
    height: 32,
    init(sprite, run, args, done) {
      const [x, y] = run.center(args[0] === AnimBattler.Attacker ? AnimBattler.Attacker : AnimBattler.Target);
      sprite.x = x;
      sprite.y = Math.max(y - PIC_HALF, 8);
      let [wait, on, left] = [0, 0, args[2]];
      sprite.callback = () => {
        if (++wait < args[1]) return;
        wait = 0;
        on = (on + 1) & 1;
        sprite.invisible = !!on;
        if (on && --left === 0) done();
      };
    },
  },

  /** AnimHelpingHandClap: two hands meet in the middle of the screen. */
  gHelpingHandClapSpriteTemplate: {
    ...HAND,
    init(sprite, _run, args, done) {
      const left = args[0] === 0;
      sprite.hFlip = left;
      sprite.x = left ? 100 : 140;
      sprite.y = 56;
      const dir = left ? 1 : -1;
      runSprite(
        sprite,
        (function* () {
          yield;
          for (let n = 0; n < 9; n++) {
            sprite.y -= dir * 2;
            if (n & 1) sprite.x -= dir * 2;
            yield;
          }
          for (let n = 0; n < 4; n++) yield;
          for (let n = 1; n <= 12; n++) {
            sprite.y += dir * 3;
            sprite.x2 = dir * (SIN[n * 10] >> 3);
            yield;
          }
          yield;
          yield;
          let n = 0;
          for (; n < 12; ) {
            n++;
            sprite.y -= dir * 3;
            sprite.x2 = dir * (SIN[n * 10] >> 3);
            yield;
          }
          for (; n < 18; ) {
            n++;
            sprite.y += dir * 3;
            sprite.x2 = dir * (SIN[n * 10] >> 3);
            if (n === 15) sprite.tileNum += 16;
            yield;
          }
          for (let t = 0; t < 9; t++) {
            sprite.x += dir * 6;
            yield;
          }
          sprite.x += dir * 2;
          yield;
          for (let t = 0; t < 5; t++) {
            sprite.x -= dir * 3;
            if (t < 4) yield;
          }
        })(),
        done,
      );
    },
  },

  /** AnimForesightMagnifyingGlass: sweeps the corners of a battler, ends on its middle, fades. */
  gForesightMagnifyingGlassSpriteTemplate: {
    tag: "ANIM_TAG_MAGNIFYING_GLASS",
    width: 32,
    height: 32,
    blend: true,
    init(sprite, run, args, done) {
      const which = args[0] === AnimBattler.Attacker ? AnimBattler.Attacker : AnimBattler.Target;
      if (which === AnimBattler.Attacker) placeAtAttacker(sprite, run, args);
      if (run.mon(which).foe) sprite.hFlip = true;
      sprite.priority = run.mon(which).sprite?.priority ?? 2;
      const [cx, cy] = run.center(which);
      const [right, left, top, bottom] = [cx + PIC_HALF, cx - PIC_HALF, cy - PIC_HALF, cy + PIC_HALF];
      const path: [number, number, number][] = [
        [right - 4, bottom - 4, 12],
        [right - 4, top + 4, 12],
        [left + 4, bottom - 4, 12],
        [left + 4, top - 4, 12],
        [right - 4, bottom - 4, 24],
        [cx, cy, 6],
      ];
      runSprite(
        sprite,
        (function* () {
          yield;
          for (let i = 0; i < path.length; i++) {
            yield* travel(sprite, path[i][2], path[i][0], path[i][1]);
            sprite.x += sprite.x2;
            sprite.y += sprite.y2;
            sprite.x2 = sprite.y2 = 0;
            if (i < 4) for (let n = 0; n < 4; n++) yield;
            else yield;
          }
          let [a, b] = [16, 0];
          for (let n = 0; n < 32; n++) {
            if (!(n & 1)) a--;
            else b++;
            monBlend(run, a, b);
            yield;
          }
          sprite.invisible = true;
          yield;
        })(),
        done,
      );
    },
  },

  /** AnimMeteorMashStar: a straight streak leaving twinkles. */
  gMeteorMashStarSpriteTemplate: {
    tag: "ANIM_TAG_GOLD_STARS",
    width: 16,
    height: 16,
    init(sprite, run, args, done) {
      const [x0, x1] = [sprite.x + flipTarget(run, args[0]), sprite.x + flipTarget(run, args[2])];
      const [y0, y1] = [sprite.y + args[1], sprite.y + args[3]];
      sprite.x = x0;
      sprite.y = y0;
      let n = 0;
      sprite.callback = () => {
        sprite.x2 = Math.trunc(((x1 - x0) * n) / args[4]);
        sprite.y2 = Math.trunc(((y1 - y0) * n) / args[4]);
        if (!(n & 1)) run.createSprite(MINI_STAR, sprite.x + sprite.x2, sprite.y + sprite.y2, 5);
        if (n === args[4]) done();
        n++;
      };
    },
  },

  /** AnimBlockX: falls on the target, bounces twice, blinks. */
  gBlockXSpriteTemplate: {
    tag: "ANIM_TAG_X_SIGN",
    width: 64,
    height: 64,
    init(sprite, run, _args, done) {
      const onPlayer = !run.target.foe;
      const sub = run.target.sprite?.subpriority ?? 2;
      sprite.subpriority = onPlayer ? sub - 2 : sub + 2;
      sprite.y = run.center(AnimBattler.Target)[1];
      sprite.y2 = onPlayer ? -144 : -96;
      const pan = run.pan(63);
      runSprite(
        sprite,
        (function* () {
          yield;
          for (;;) {
            sprite.y2 += 10;
            if (sprite.y2 >= 0) break;
            yield;
          }
          run.play("se_m_sketch" as SoundId, pan);
          sprite.y2 = 0;
          yield;
          for (let n = 4; ; n += 4) {
            sprite.y2 = -(SIN[n] >> 3);
            if (n > 0x7f) break;
            yield;
          }
          run.play("se_m_sketch" as SoundId, pan);
          sprite.y2 = 0;
          yield;
          for (let n = 6; ; n += 6) {
            sprite.y2 = -(SIN[n] >> 4);
            if (n > 0x7f) break;
            yield;
          }
          sprite.y2 = 0;
          for (let n = 0; n <= 8; n++) yield;
          run.play("se_m_leer" as SoundId, pan);
          for (let flips = 1; flips <= 7; flips++) {
            for (let n = 0; n <= 8; n++) yield;
            sprite.invisible = !!(flips & 1);
          }
        })(),
        done,
      );
    },
  },

  /** AnimKnockOffStrike: sweeps an arc on the target. */
  gKnockOffStrikeSpriteTemplate: {
    tag: "ANIM_TAG_SLAM_HIT_2",
    width: 64,
    height: 64,
    affineNormal: true,
    anims: [[F(0, 4), F(64, 4), END]],
    affineAnims: [[A(0x100, 0x100, 0, 0), A(0, 0, -4, 8), END], [A(-0x100, 0x100, 0, 0), A(0, 0, 4, 8), END]],
    init(sprite, run, args, done) {
      const onPlayer = !run.target.foe;
      sprite.x += onPlayer ? -args[0] : args[0];
      sprite.y += args[1];
      if (onPlayer) sprite.startAffineAnim(1);
      const step = onPlayer ? -11 : 11;
      let angle = 192;
      sprite.callback = () => {
        angle = (angle + step) & 0xff;
        sprite.x2 = cos(angle, 20);
        sprite.y2 = sin(angle, 20);
        if (sprite.animEnded) done();
      };
    },
  },

  /** AnimRecycle: fades in over the attacker's head, stays 10, fades out. */
  gRecycleSpriteTemplate: {
    tag: "ANIM_TAG_RECYCLE",
    width: 64,
    height: 64,
    affineNormal: true,
    blend: true,
    affineAnims: [[A(0, 0, -4, 64), J(0)]],
    init(sprite, run, _args, done) {
      const [x, y] = run.center(AnimBattler.Attacker);
      sprite.x = x;
      sprite.y = Math.max(y - PIC_HALF, 16);
      let [a, b] = [0, 16];
      monBlend(run, a, b);
      runSprite(
        sprite,
        (function* () {
          let n = 0;
          while (b !== 0) {
            yield;
            yield;
            if (!(n & 1)) {
              if (a < 16) a++;
            } else if (b !== 0) b--;
            n++;
            monBlend(run, a, b);
          }
          for (let t = 0; t < 10; t++) yield;
          n = 0;
          while (b !== 16) {
            yield;
            yield;
            if (!(n & 1)) {
              if (a !== 0) a--;
            } else if (b < 16) b++;
            n++;
            monBlend(run, a, b);
          }
          yield;
        })(),
        done,
      );
    },
  },
};

export const EFFECTS_3_TASK_SOUNDS: Record<string, readonly string[]> = {
  gClappingHandSpriteTemplate: ["se_m_encore"],
  gBlockXSpriteTemplate: ["se_m_sketch", "se_m_leer"],
  AnimTask_TormentAttacker: ["se_m_metronome"],
  AnimTask_MorningSunLightBeam: ["se_m_morning_sun"],
  AnimTask_MonToSubstitute: ["se_m_bubble2"],
};

export const EFFECTS_3_ART: Record<string, AnimArtFiles> = {
  morningSun: { png: "battle_anims/masks/light_beam.png", pal: "battle_anims/masks/light_beam.png", bin: "battle_anims/masks/light_beam.bin" },
};
export const EFFECTS_3_TASK_ART: Record<string, string[]> = { AnimTask_MorningSunLightBeam: ["morningSun"] };

/** sFacadeBlendColors. */
const FACADE_COLORS = [[28, 25, 1], [28, 21, 5], [27, 18, 8], [27, 14, 11], [26, 10, 15], [26, 7, 18], [25, 3, 21], [25, 0, 25], [25, 0, 23], [25, 0, 20], [25, 0, 16], [25, 0, 13], [26, 0, 10], [26, 0, 6], [26, 0, 3], [27, 0, 0], [27, 1, 0], [27, 5, 0], [27, 9, 0], [27, 12, 0], [28, 16, 0], [28, 19, 0], [28, 23, 0], [29, 27, 0]].map(([r, g, b]) => rgb(r, g, b));

/** A battler (args[0] or the attacker) plays an affine table. */
const deform =
  (table: Parameters<typeof monAffine>[1], which?: AnimBattler): AnimTask =>
  function* (run, args) {
    const mon = monSprite(run, which ?? args[0]);
    if (mon) {
      yield;
      yield* monAffine(mon, table);
    }
  };

export const EFFECTS_3_TASKS: Record<string, AnimTask> = {
  AnimTask_DefenseCurlDeformMon: deform([A(-12, 20, 0, 8), A(12, -20, 0, 8), L(2), END], AnimBattler.Attacker),
  AnimTask_StockpileDeformMon: deform([A(8, -8, 0, 12), A(-16, 16, 0, 12), A(8, -8, 0, 12), L(1), END], AnimBattler.Attacker),
  AnimTask_SpitUpDeformMon: deform([A(0, 6, 0, 20), A(0, 0, 0, 20), A(0, -18, 0, 6), A(-18, -18, 0, 3), A(0, 0, 0, 15), A(4, 4, 0, 13), END], AnimBattler.Attacker),
  AnimTask_SwallowDeformMon: deform([A(0, 6, 0, 20), A(0, 0, 0, 20), A(7, -30, 0, 6), A(0, 0, 0, 20), A(-2, 3, 0, 20), END], AnimBattler.Attacker),
  AnimTask_StrongFrustrationGrowAndShrink: deform([A(0, -15, 0, 7), A(0, 15, 0, 7), L(2), END], AnimBattler.Attacker),

  /** AnimTask_CreateSpotlight: WIN1 keeps the text area out of the color effect. */
  *AnimTask_CreateSpotlight(run) {
    const { video } = run.flow.gba;
    video.winIn0 = Layer.ALL | 32;
    video.winIn1 = Layer.ALL;
    video.winOut = Layer.ALL | 32;
    Object.assign(video.win1, { left: 0, right: 240, top: 120, bottom: 160 });
    video.win1On = true;
  },

  *AnimTask_RemoveSpotlight(run) {
    const { video } = run.flow.gba;
    video.win1On = false;
    video.winIn0 = video.winIn1 = video.winOut = 0;
    Object.assign(video.win1, { left: 0, right: 0, top: 0, bottom: 0 });
  },

  /**
   * AnimTask_TransformMon: the C mosaics the attacker while its picture changes. Ours pinches it
   * thin and back (no sprite mosaic); the new picture comes with the battle's own event.
   */
  *AnimTask_TransformMon(run) {
    const mon = monSprite(run, AnimBattler.Attacker);
    if (!mon) return;
    mon.affineAnimPaused = true;
    yield;
    for (let level = 1; level <= 15; level++) {
      yield;
      yield;
      yield;
      mon.setRotScale(0x100 + level * 0x20, 0x100, 0);
    }
    yield;
    for (let level = 14; level >= 0; level--) {
      yield;
      yield;
      yield;
      mon.setRotScale(0x100 + level * 0x20, 0x100, 0);
    }
    yield;
    resetMonScale(mon);
  },

  /** AnimTask_DeepInhale: a battler (args[0]) takes a breath, trembling. */
  *AnimTask_DeepInhale(run, args) {
    const mon = monSprite(run, args[0]);
    if (!mon) return;
    let [n, wait, flips] = [0, 0, 0];
    yield;
    yield* monAffine(mon, [A(16, 0, 0, 4), A(0, -3, 0, 16), A(4, 0, 0, 4), A(0, 0, 0, 24), A(-5, 3, 0, 16), END], () => {
      if (((n++ - 20) & 0xffff) < 23) {
        if (++wait > 1) {
          wait = 0;
          mon.x2 = ++flips & 1 ? 1 : -1;
        }
      } else mon.x2 = 0;
    });
  },

  /** AnimTask_SquishAndSweatDroplets: a battler squishes args[1] times, throwing sweat. */
  *AnimTask_SquishAndSweatDroplets(run, args) {
    if (!args[1]) return;
    const which = args[0] === AnimBattler.Attacker ? AnimBattler.Attacker : AnimBattler.Target;
    const [x, y] = battlerCoords(run, which);
    const mon = monSprite(run, args[0]);
    const sub = (mon?.subpriority ?? 2) - 5;
    let active = 0;
    const drops = (lower: boolean) => {
      const [ox, oy] = lower ? [30, 20] : [18, -20];
      const xs = [x - ox, x - ox - 4, x + ox, x + ox + 4];
      const ys = [y + oy, y + oy + 6];
      xs.forEach((dx, i) => {
        active++;
        run.createSprite(
          {
            tag: "ANIM_TAG_SWEAT_DROP",
            width: 8,
            height: 8,
            init(sprite, _run, _args, done) {
              let n = 0;
              sprite.callback = () => {
                sprite.x += i < 2 ? -2 : 2;
                sprite.y -= 1;
                if (++n > 6) {
                  active--;
                  done();
                }
              };
            },
          },
          dx,
          ys[i & 1],
          sub,
        );
      });
    };
    if (!mon) return;
    yield;
    for (let left = args[1]; left > 0; left--) {
      let t = 0;
      yield* monAffine(mon, [A(-16, 16, 0, 6), A(16, -16, 0, 12), A(-16, 16, 0, 6), END], () => {
        t++;
        if (t === 6) drops(true);
        if (t === 18) drops(false);
      });
    }
    while (active > 0) yield;
  },

  /**
   * AnimTask_MonToSubstitute: squashes away and the doll falls in with two bounces.
   */
  *AnimTask_MonToSubstitute(run) {
    const mon = monSprite(run, AnimBattler.Attacker);
    if (!mon) return;
    mon.affineAnimPaused = true;
    let [x, y] = [0x100, 0x100];
    yield;
    for (let n = 0; n < 9; n++) {
      x += 0x60;
      y -= 0xd;
      mon.setRotScale(x, y, 0);
      yield;
    }
    resetMonScale(mon);
    mon.invisible = true;
    yield;
    yield;
    mon.y2 = -200;
    mon.x2 = 200;
    showDoll(run, true);
    const pan = run.pan(-64);
    let v = 0;
    yield;
    for (;;) {
      v += 112;
      mon.y2 += v >> 8;
      if (mon.y + mon.y2 >= -32) mon.x2 = 0;
      if (mon.y2 > 0) mon.y2 = 0;
      if (mon.y2 === 0) break;
      yield;
    }
    run.play("se_m_bubble2" as SoundId, pan);
    v -= 0x800;
    yield;
    while (v !== 0) {
      v = Math.max(v - 112, 0);
      mon.y2 -= v >> 8;
      yield;
    }
    for (;;) {
      v += 112;
      mon.y2 += v >> 8;
      if (mon.y2 > 0) mon.y2 = 0;
      if (mon.y2 === 0) break;
      yield;
    }
    run.play("se_m_bubble2" as SoundId, pan);
  },

  /** AnimTask_IsHealingMove: whether the move hurt nothing. */
  *AnimTask_IsHealingMove(run) {
    run.args[7] = (run.moveDamage ?? 0) > 0 ? 0 : 1;
  },

  /**
   * AnimTask_RapinSpinMonElevation: the C wipes the battler up by scanlines; ours flickers, then is
   * hidden (args[2] 0) or shown (the second call).
   */
  *AnimTask_RapinSpinMonElevation(run, args) {
    const mon = monSprite(run, args[0] ? AnimBattler.Target : AnimBattler.Attacker);
    if (!mon) return;
    const steps = Math.max(1, Math.ceil(69 / Math.max(args[1], 1)) + 8);
    let wait = 0;
    for (let n = 0; n < steps; n++) {
      yield;
      if (++wait > 1) {
        wait = 0;
        mon.invisible = !mon.invisible;
      }
    }
    mon.invisible = !args[2];
  },

  /** AnimTask_TormentAttacker: six thought bubbles pop around the attacker as it shakes. */
  *AnimTask_TormentAttacker(run) {
    const mon = monSprite(run, AnimBattler.Attacker);
    const [ax, ay] = run.center(AnimBattler.Attacker);
    const { sprites } = run.flow.gba;
    let [dx, dy] = [32, -20];
    const bubbles: (Sprite | null)[] = [];
    const pan = run.pan(-64);
    yield;
    for (let i = 0; i < 6; i++) {
      const bubble = run.createSprite({ tag: "ANIM_TAG_THOUGHT_BUBBLE", width: 32, height: 32, anims: THOUGHT_ANIMS, init() {} }, i & 1 ? ax - dx : ax + dx, ay + dy, 6 - i);
      if (bubble) bubble.hFlip = !!(i & 1);
      bubbles.push(bubble);
      run.play("se_m_metronome" as SoundId, pan);
      if (i & 1) {
        dx -= 6;
        dy -= 6;
      }
      if (mon) yield* monAffine(mon, [A(-12, 8, 0, 4), A(20, -20, 0, 4), A(-8, 12, 0, 4), END]);
      for (let wait = i === 5 ? 8 : i <= 1 ? 10 : 0; wait >= 0; wait--) yield;
    }
    for (const bubble of bubbles) bubble?.startAnim(2);
    yield;
    while (bubbles.some((b) => b && !b.animEnded)) yield;
    for (const bubble of bubbles) sprites.destroy(bubble);
  },

  /** AnimTask_MorningSunLightBeam: a beam on BG1 pulses four times in different spots. */
  *AnimTask_MorningSunLightBeam(run) {
    const art = run.art("morningSun");
    if (!art) return;
    const { gba } = run.flow;
    const { video } = gba;
    Object.assign(video, { effect: Effect.Blend, target1: Layer.BG1, target2: Layer.ALL, eva: 0, evb: 16 });
    const bg1 = video.bgs[1];
    initBg(bg1, 0, 1);
    bg1.tiles = art.tiles;
    bg1.map.set(art.map!.subarray(0, bg1.map.length));
    bg1.visible = true;
    gba.palettes.load(art.palette, ANIM_PALETTE * 16, 16);
    const baseX = run.attacker.foe ? -135 : -10;
    bg1.x = baseX * 256;
    bg1.y = 0;
    const pan = run.pan(-64);
    run.play("se_m_morning_sun" as SoundId, pan);
    const shifts = [-24, 24, -4, 0];
    yield;
    for (let i = 0; i < 4; i++) {
      for (let level = 1; level <= 12; level++) {
        yield;
        yield;
        video.eva = level;
        video.evb = 16 - level;
      }
      for (let level = 11; level >= 0; level--) {
        yield;
        video.eva = level;
        video.evb = 16 - level;
      }
      bg1.x = (shifts[i] + baseX) * 256;
      if (i < 3) {
        for (let n = 0; n < 4; n++) yield;
        run.play("se_m_morning_sun" as SoundId, pan);
      }
    }
    yield;
    bg1.visible = false;
    bg1.x = 0;
    video.resetBlend();
  },

  /** AnimTask_FlailMovement: a battler (args[0]) swings ever narrower. */
  *AnimTask_FlailMovement(run, args) {
    const mon = monSprite(run, args[0]);
    if (!mon) return;
    mon.affineAnimPaused = true;
    let [turn, swing, narrow, n, down] = [0, 0x800, 0x20, 0, false];
    yield;
    for (;;) {
      turn += down ? -0x200 : 0x200;
      if (!down && turn >= swing) {
        turn = swing - ((swing - turn) % (swing * 2));
        down = true;
      } else if (down && turn <= -swing) {
        turn = (swing - turn) % (swing * 2);
        turn -= swing;
        down = false;
      }
      mon.setRotScale(0x100, 0x100, turn);
      mon.x2 = -((turn >= 0 ? turn : turn + 63) >> 6);
      if (++n > 8) {
        if (!narrow) break;
        narrow--;
        swing = Math.max(swing - 0x40, 16);
      }
      yield;
    }
    yield;
    resetMonScale(mon);
    mon.x2 = 0;
  },

  /** AnimTask_PainSplitMovement: a battler (args[0]) tilts (args[1]) and shakes 13 frames. */
  *AnimTask_PainSplitMovement(run, args) {
    const which = args[0];
    const mon = monSprite(run, which);
    if (!mon) return;
    mon.affineAnimPaused = true;
    const [x, y, rot] = [[0xe0, 0x140, 0], [0xd0, 0x130, 0xf00], [0xd0, 0x130, 0xf100]][args[1]] ?? [0x100, 0x100, 0];
    mon.setRotScale(x, y, rot);
    mon.y2 = Math.trunc(32 - (32 * 256) / y);
    if (args[1] !== 0 && !run.mon(which).foe) mon.y2 += 16;
    mon.x2 = 2;
    let wait = 0;
    for (let n = 0; n < 13; n++) {
      yield;
      if (++wait === 3) {
        wait = 0;
        mon.x2 = -mon.x2;
      }
    }
    resetMonScale(mon);
    mon.x2 = mon.y2 = 0;
  },

  /** AnimTask_RolePlaySilhouette: a white copy of the target beside the attacker fades in and thins away. */
  *AnimTask_RolePlaySilhouette(run) {
    const from = run.target.sprite;
    const copy = from && cloneMon(run, from);
    if (!copy) return;
    const { palettes, sprites, video } = run.flow.gba;
    const tag = "ANIM_TAG_BENT_SPOON";
    const slot = palettes.loadSpritePalette(tag, new Uint16Array(16).fill(0x7fff)) & 15;
    copy.paletteNum = slot;
    copy.hFlip = false;
    const [x, y] = battlerCoords(run, AnimBattler.Attacker);
    copy.x = x + (run.attacker.foe ? -20 : 20);
    copy.y = y;
    copy.x2 = copy.y2 = 0;
    copy.priority = run.attacker.sprite?.priority ?? copy.priority;
    let [level, wait] = [0, 0];
    monBlend(run, level, 16);
    while (level !== 10) {
      yield;
      if (wait++ > 1) {
        wait = 0;
        level++;
        monBlend(run, level, 16 - level);
      }
    }
    copy.affineAnimPaused = true;
    let [sx, sy] = [256, 256];
    for (let n = 0; n < 9; n++) {
      yield;
      sx -= 16;
      sy += 128;
      copy.setRotScale(sx, sy, 0);
    }
    sprites.destroy(copy);
    palettes.freeSpritePalette(tag);
    yield;
    video.resetBlend();
  },

  /** AnimTask_AcidArmor: the C melts the battler by scanlines; ours sinks swaying while it fades, and returns. */
  *AnimTask_AcidArmor(run, args) {
    const mon = monSprite(run, args[0]);
    if (!mon) return;
    mon.mode = ObjMode.Blend;
    mon.affineAnimPaused = true;
    let [a, b, phase, scale] = [16, 0, 0, 0x100];
    monBlend(run, a, b);
    yield;
    for (let n = 0; n < 32; n++) {
      phase = (phase + 2) & 0xff;
      scale += 8;
      mon.setRotScale(0x100, scale, 0);
      mon.y2 = Math.trunc(32 - (32 * 256) / scale);
      mon.x2 = SIN[phase * 5 & 0xff] >> 5;
      yield;
    }
    let n = 0;
    while (a !== 0 || b !== 16) {
      if (++n & 1) a--;
      else b++;
      monBlend(run, a, b);
      yield;
    }
    for (let t = 0; t <= 12; t++) yield;
    resetMonScale(mon);
    mon.x2 = 0;
    n = 0;
    while (a !== 16 || b !== 0) {
      if (++n & 1) a++;
      else b--;
      monBlend(run, a, b);
      yield;
    }
    mon.mode = ObjMode.Normal;
    run.flow.gba.video.resetBlend();
  },

  /** AnimTask_FacadeColorBlend: a battler (args[0]) runs through hot colors, args[1] frames. */
  *AnimTask_FacadeColorBlend(run, args) {
    const mon = monSprite(run, args[0]);
    if (!mon) return;
    const offset = 256 + mon.paletteNum * 16;
    let color = 0;
    yield;
    for (let left = args[1]; left > 0; left--) {
      run.flow.gba.palettes.blendPalette(offset, 16, 8, FACADE_COLORS[color]);
      if (++color > 23) color = 0;
      yield;
    }
    run.flow.gba.palettes.blendPalette(offset, 16, 0, 0);
  },

  /** AnimTask_GlareEyeDots: pairs of dots line up from the attacker's eyes to the target. */
  *AnimTask_GlareEyeDots(run) {
    const [ax, ay] = run.center(AnimBattler.Attacker);
    const [tx, ty] = run.center(AnimBattler.Target);
    const offset = Math.trunc((PIC_HALF * 2) / 4);
    const startX = ax + flip(run, offset);
    const startY = ay - offset;
    const PAIRS = 12;
    let active = 0;
    yield;
    for (let pair = 0; pair <= PAIRS; pair++) {
      for (let wait = 0; wait <= 3; wait++) yield;
      const x = pair >= PAIRS ? tx : startX + Math.trunc(((tx - startX) * pair) / (PAIRS - 1));
      const y = pair >= PAIRS ? ty : startY + Math.trunc(((ty - startY) * pair) / (PAIRS - 1));
      for (const by of [-3, 3]) {
        active++;
        const dot = run.createSprite(
          {
            tag: "ANIM_TAG_SMALL_RED_EYE",
            width: 8,
            height: 8,
            init(sprite, _run, _args, done) {
              let n = 0;
              sprite.callback = () => {
                if (++n > 36) {
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
        if (dot) dot.x2 = dot.y2 = by;
      }
    }
    while (active > 0) yield;
  },

  /** AnimTask_BarrageBall: a ball arcs at half speed, then full, and flickers. */
  *AnimTask_BarrageBall(run) {
    const [ax, ay] = run.center(AnimBattler.Attacker);
    const [tx, ty] = run.center(AnimBattler.Target);
    const toY = ty + Math.trunc((PIC_HALF * 2) / 4);
    const ball = run.createSprite(
      { tag: "ANIM_TAG_RED_BALL", width: 32, height: 32, affineNormal: true, affineAnims: [[A(0, 0, -4, 24), END], [A(0x100, 0x100, -64, 0), A(0, 0, 4, 24), END]], init() {} },
      ax,
      ay,
      (run.target.sprite?.subpriority ?? 2) - 5,
    );
    if (!ball) return;
    if (run.attacker.foe) ball.startAffineAnim(1);
    const path = arc(ball, 16, tx, toY, -32);
    yield;
    for (let n = 0; n <= 7; n++) {
      path.next();
      yield;
      yield;
    }
    while (!path.next().done) yield;
    for (let n = 1; n <= 16; n++) {
      yield;
      yield;
      ball.invisible = !!(n & 1);
    }
    run.flow.gba.sprites.destroy(ball);
  },

  /** AnimTask_SmellingSaltsSquish: the target squishes shaking, args[1] times. */
  *AnimTask_SmellingSaltsSquish(run, args) {
    if (args[0] === AnimBattler.Attacker) return;
    const mon = monSprite(run, args[0]);
    if (!mon) return;
    yield;
    for (let left = args[1]; left > 0; left--) {
      let wait = 0;
      yield* monAffine(mon, [A(0, -16, 0, 6), A(0, 16, 0, 6), END], () => {
        if (++wait > 1) {
          wait = 0;
          mon.x2 = 2;
        }
      });
      mon.x2 = 0;
    }
  },

  /** AnimTask_HelpingHandAttackerMovement: the attacker sways, twice small, once wide. */
  *AnimTask_HelpingHandAttackerMovement(run) {
    const mon = monSprite(run, AnimBattler.Attacker);
    if (!mon) return;
    const dir = run.attacker.foe ? 1 : -1;
    yield;
    for (let n = 0; n < 13; n++) yield;
    for (let lap = 0; lap < 2; lap++) {
      for (let n = 0; n < 6; n++) {
        mon.x2 -= dir * 3;
        yield;
      }
      for (let n = 0; n < 6; n++) {
        mon.x2 += dir * 3;
        yield;
      }
      yield;
      yield;
    }
    for (let n = 0; n < 3; n++) {
      mon.x2 += dir;
      yield;
    }
    for (let n = 0; n < 6; n++) yield;
    for (let n = 0; n < 5; n++) {
      mon.x2 -= dir * 4;
      yield;
    }
    for (let n = 0; n < 5; n++) {
      mon.x2 += dir * 4;
      yield;
    }
    mon.x2 = 0;
  },

  /** AnimTask_OdorSleuthMovement: two flickering copies of the target cross it and narrow. */
  *AnimTask_OdorSleuthMovement(run) {
    const mon = monSprite(run, AnimBattler.Target);
    if (!mon) return;
    const { sprites } = run.flow.gba;
    let active = 0;
    for (const [speed, start, hidden] of [[16, 0, false], [-16, 128, true]] as const) {
      const copy = cloneMon(run, mon, ObjMode.Normal);
      if (!copy) continue;
      active++;
      copy.invisible = hidden || mon.invisible;
      let [wait, n, wave, radius] = [0, 0, start as number, 24];
      copy.callback = () => {
        if (++wait > 1) {
          wait = 0;
          if (!mon.invisible) copy.invisible = !copy.invisible;
        }
        wave = (wave + speed) & 0xff;
        copy.x2 = cos(wave, radius);
        if (n < 60) n++;
        else {
          radius -= 2;
          if (radius < 0) {
            active--;
            sprites.destroy(copy);
          }
        }
      };
    }
    do yield;
    while (active > 0);
  },

  /** AnimTask_GetReturnPowerLevel: by friendship; the battle doesn't send it, so from the move's power. */
  *AnimTask_GetReturnPowerLevel(run) {
    const friendship = Math.trunc((run.movePower ?? 80) * 2.5);
    run.args[7] = friendship > 200 ? 3 : friendship > 91 ? 2 : friendship > 60 ? 1 : 0;
  },

  /** AnimTask_TeeterDanceMovement: the attacker wobbles out and back. */
  *AnimTask_TeeterDanceMovement(run) {
    const mon = monSprite(run, AnimBattler.Attacker);
    if (!mon) return;
    const dir = run.attacker.foe ? -1 : 1;
    const x0 = mon.x;
    let [wobble, sway] = [0, 0];
    yield;
    for (;;) {
      wobble = (wobble + 8) & 0xff;
      mon.x2 = SIN[wobble] >> 5;
      sway = (sway + 2) & 0xff;
      mon.x = (SIN[sway] >> 3) * dir + x0;
      if (sway === 0) break;
      yield;
    }
    mon.x = x0;
    do {
      wobble = (wobble + 8) & 0xff;
      mon.x2 = SIN[wobble] >> 5;
      yield;
    } while (wobble !== 0);
    mon.x2 = 0;
  },

  *AnimTask_GetWeather(run) {
    run.args[7] = run.weather ?? 0;
  },

  /** AnimTask_SlackOffSquish: a battler (args[0]) relaxes, trembling. */
  *AnimTask_SlackOffSquish(run, args) {
    const mon = monSprite(run, args[0]);
    if (!mon) return;
    let [n, wait, flips] = [0, 0, 0];
    yield;
    yield* monAffine(mon, [A(0, 16, 0, 4), A(-2, 0, 0, 8), A(0, 4, 0, 4), A(0, 0, 0, 24), A(1, -5, 0, 16), END], () => {
      n++;
      if (n > 16 && n < 40) {
        if (++wait > 2) {
          wait = 0;
          mon.x2 = ++flips & 1 ? 1 : -1;
        }
      } else mon.x2 = 0;
    });
  },
};
