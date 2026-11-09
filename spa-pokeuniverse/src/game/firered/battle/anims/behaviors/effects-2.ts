// Shared effects (battle_anim_effects_2.c): rings, coins, hearts, pincers, notes and mon stretches.

import { ObjMode } from "../../../../gba/sprites";
import { Effect, Layer } from "../../../../gba/video";
import type { AnimArtFiles, SoundId } from "../../../manifest";
import { initBg } from "../../../common";
import { AnimBattler, type AnimSpriteTemplate, type AnimTask } from "../script";
import { monBlend, setGrayscale } from "./dark";
import { monAffine } from "./effects";
import { MUSIC_NOTES_ANIMS } from "./effects-1";
import { GROWING_RING } from "./water";
import { A, animEnd, arcTan2Neg, battlerCoords, circle, cos, END, F, flip, flyTo, goneAtAnimEnd, J, L, cloneMon, monSprite, paletteMask, PIC_HALF, placeAtAttacker, random, resetMonScale, rotScale, runSprite, seekAnim, selectedPalettes, sin, slideAt, speedSteps, spriteOnMon, throwProjectile, toTargetLocation, travel } from "./util";

const ANIM_PALETTE = 8;
const RING = { width: 16, height: 32, affine: true, affineAnims: GROWING_RING, init: toTargetLocation } as const;
const CUT = { tag: "ANIM_TAG_CUT", width: 32, height: 32, blend: true } as const;
const HEART = { tag: "ANIM_TAG_RED_HEART", width: 16, height: 16 } as const;
const RED_ORB_AFFINE = [[A(128, 128, 0, 0), A(8, 8, 0, 1), J(1)]];
const PERISH_AFFINE = [[A(0, 0, 0, 5), END], [A(0, 0, -8, 16), END], [A(0, 0, 8, 16), END]];
const NOTES_2 = { tag: "ANIM_TAG_MUSIC_NOTES_2", width: 16, height: 16, affineNormal: true, anims: MUSIC_NOTES_ANIMS, affineAnims: PERISH_AFFINE } as const;

/** gMusicNotePaletteTagsTable: the first is the art's, the others are made by AnimTask_LoadMusicNotesPals. */
export const NOTE_PAL_TAGS = ["ANIM_TAG_MUSIC_NOTES_2", "animMusicNotePal1", "animMusicNotePal2"];

/** AnimViceGripPincer and AnimGuillotinePincer's start and end, by which pincer. */
const pincerOffsets = (second: number) => (second ? [-32, 32, -16, 16] : [32, -32, 16, -16]);

/** AnimParticleBurst. */
const particleBurst: AnimSpriteTemplate["init"] = (sprite, _run, args, done) => {
  let [x, phase] = [0, 0];
  runSprite(
    sprite,
    (function* () {
      yield;
      for (;;) {
        x += args[0];
        sprite.x2 = x >> 8;
        sprite.y2 = sin(phase, args[1]);
        phase = (phase + 3) & 0xff;
        if (phase > 100) sprite.invisible = !!(phase % 2);
        if (phase > 120) return;
        yield;
      }
    })(),
    done,
  );
};

export const EFFECTS_2_TEMPLATES: Record<string, AnimSpriteTemplate> = {
  /** AnimKinesisZapEnergy. */
  gKinesisZapEnergySpriteTemplate: {
    tag: "ANIM_TAG_ALERT",
    width: 32,
    height: 16,
    anims: [[F(0, 3, "h"), F(8, 3, "h"), F(16, 3, "h"), F(24, 3, "h"), F(32, 3, "h"), F(40, 3, "h"), F(48, 3, "h"), L(1), END]],
    init(sprite, run, args, done) {
      [sprite.x, sprite.y] = run.center(AnimBattler.Attacker);
      sprite.x += flip(run, args[0]);
      sprite.y += args[1];
      if (run.attacker.foe) sprite.hFlip = true;
      if (args[2]) sprite.vFlip = true;
      goneAtAnimEnd(sprite, done);
    },
  },

  /** AnimSwordsDanceBlade: grows on the attacker's spot, rises 32. */
  gSwordsDanceBladeSpriteTemplate: {
    tag: "ANIM_TAG_SWORD",
    width: 32,
    height: 64,
    affineNormal: true,
    blend: true,
    affineAnims: [[A(16, 256, 0, 0), A(20, 0, 0, 12), A(0, 0, 0, 32), END]],
    init(sprite, run, args, done) {
      placeAtAttacker(sprite, run, args, false);
      runSprite(
        sprite,
        (function* () {
          yield;
          while (!sprite.affineEnded) yield;
          yield* travel(sprite, 6, sprite.x, sprite.y - 32);
        })(),
        done,
      );
    },
  },

  /** AnimSonicBoomProjectile: turned to the target, straight. */
  gSonicBoomSpriteTemplate: {
    tag: "ANIM_TAG_AIR_WAVE",
    width: 32,
    height: 16,
    affine: true,
    blend: true,
    init(sprite, run, args, done) {
      const foe = run.attacker.foe;
      placeAtAttacker(sprite, run, [args[0], foe ? -args[1] : args[1]]);
      const [cx, cy] = run.center(AnimBattler.Target);
      const [x, y] = [cx + flip(run, args[2]), cy + (foe ? -args[3] : args[3])];
      rotScale(sprite, 0x100, 0x100, (arcTan2Neg(x - sprite.x, y - sprite.y) + 0xf000) & 0xffff);
      flyTo(sprite, args[4], x, y, done);
    },
  },

  gSupersonicRingSpriteTemplate: { tag: "ANIM_TAG_GOLD_RING", ...RING },
  gScreechRingSpriteTemplate: { tag: "ANIM_TAG_PURPLE_RING", ...RING },
  gMetalSoundSpriteTemplate: { tag: "ANIM_TAG_METAL_SOUND_WAVES", ...RING, width: 32, height: 64 },

  /** AnimWaterPulseRing: to the target, its affine animation pulsing. */
  gWaterPulseRingSpriteTemplate: {
    tag: "ANIM_TAG_BLUE_RING_2",
    width: 16,
    height: 32,
    affine: true,
    affineAnims: [[A(5, 5, 0, 10), A(-10, -10, 0, 10), A(10, 10, 0, 10), A(-10, -10, 0, 10), A(10, 10, 0, 10), A(-10, -10, 0, 10), A(10, 10, 0, 10), END]],
    init: toTargetLocation,
  },

  gEggThrowSpriteTemplate: { tag: "ANIM_TAG_LARGE_FRESH_EGG", width: 16, height: 16, init: throwProjectile },

  /** AnimCoinThrow: turned to the target, at speed args[4]. */
  gCoinThrowSpriteTemplate: {
    tag: "ANIM_TAG_COIN",
    width: 16,
    height: 16,
    affineNormal: true,
    anims: [[F(8, 1), END]],
    init(sprite, run, args, done) {
      placeAtAttacker(sprite, run, args);
      const [cx, cy] = run.center(AnimBattler.Target);
      const [x, y] = [cx + flip(run, args[2]), cy + args[3]];
      rotScale(sprite, 0x100, 0x100, (arcTan2Neg(x - sprite.x, y - sprite.y) + 0xc000) & 0xffff);
      flyTo(sprite, speedSteps(x - sprite.x, args[4]), x, y, done);
    },
  },

  /** AnimFallingCoin: two shrinking bounces on the target. */
  gFallingCoinSpriteTemplate: {
    tag: "ANIM_TAG_COIN",
    width: 16,
    height: 16,
    affineNormal: true,
    anims: [[F(8, 1), END]],
    affineAnims: [[A(0, 0, 10, 1), J(0)]],
    init(sprite, run, _args, done) {
      sprite.y += 8;
      let [x, phase, amp, n] = [0, 0, -16, 0];
      sprite.callback = () => {
        x += 0x80;
        sprite.x2 = run.attacker.foe ? x >> 8 : -(x >> 8);
        sprite.y2 = sin(phase, amp);
        phase += 5;
        if (phase > 126) {
          phase = 0;
          amp = Math.trunc(amp / 2);
          if (++n === 2) done();
        }
      };
    },
  },

  /** AnimBulletSeed: to the target in 20, then one bounce off at random. */
  gBulletSeedSpriteTemplate: {
    tag: "ANIM_TAG_SEED",
    width: 16,
    height: 16,
    affineNormal: true,
    affineAnims: [[A(0, 0, 20, 1), J(0)]],
    init(sprite, run, args, done) {
      placeAtAttacker(sprite, run, args);
      const [x, y] = run.center(AnimBattler.Target);
      sprite.affineAnimPaused = true;
      runSprite(
        sprite,
        (function* () {
          yield;
          yield* travel(sprite, 20, x, y);
          run.play("se_m_horn_attack" as SoundId, run.pan(63));
          sprite.x += sprite.x2;
          sprite.y += sprite.y2;
          sprite.x2 = sprite.y2 = 0;
          const amp = -12 - random(8);
          const speed = random(0xa0) + 0xa0;
          sprite.affineAnimPaused = false;
          yield;
          let [dx, phase] = [0, 0];
          for (;;) {
            dx += speed;
            sprite.x2 = speed & 1 ? -(dx >> 8) : dx >> 8;
            sprite.y2 = sin(phase, amp);
            phase += 8;
            if (phase > 126) return;
            yield;
          }
        })(),
        done,
      );
    },
  },

  /** AnimRazorWindTornado: circles the attacker's spot. */
  gRazorWindTornadoSpriteTemplate: {
    tag: "ANIM_TAG_GUST",
    width: 32,
    height: 64,
    affineNormal: true,
    affineAnims: [[A(16, 256, 0, 0), A(4, 0, 0, 40), END]],
    init(sprite, run, args, done) {
      placeAtAttacker(sprite, run, args, false);
      if (!run.attacker.foe) sprite.y += 16;
      runSprite(sprite, circle(sprite, args[4], args[2], args[6], args[5]), done);
    },
  },

  /** AnimViceGripPincer: closes on the target, gone when its animation ends. */
  gViceGripSpriteTemplate: {
    ...CUT,
    anims: [[F(0, 3), F(16, 3), F(32, 20), END], [F(0, 3, "hv"), F(16, 3, "hv"), F(32, 20, "hv"), END]],
    init(sprite, run, args, done) {
      const [sx, sy, ex, ey] = pincerOffsets(args[0]);
      if (args[0]) sprite.startAnim(1);
      const [cx, cy] = run.center(AnimBattler.Target);
      sprite.x += sx;
      sprite.y += sy;
      runSprite(
        sprite,
        (function* () {
          yield;
          yield* travel(sprite, 6, cx + ex, cy + ey);
          yield* animEnd(sprite);
        })(),
        done,
      );
    },
  },

  /** AnimGuillotinePincer: closes, shakes 51 frames, opens back. */
  gGuillotineSpriteTemplate: {
    ...CUT,
    anims: [[F(0, 2), F(16, 2), F(32, 1), END], [F(0, 2, "hv"), F(16, 2, "hv"), F(32, 1, "hv"), END]],
    init(sprite, run, args, done) {
      const [sx, sy, ex, ey] = pincerOffsets(args[0]);
      if (args[0]) sprite.startAnim(args[0]);
      const [cx, cy] = run.center(AnimBattler.Target);
      sprite.x += sx;
      sprite.y += sy;
      const [fromX, fromY] = [sprite.x, sprite.y];
      runSprite(
        sprite,
        (function* () {
          yield;
          yield* travel(sprite, 6, cx + ex, cy + ey);
          yield* animEnd(sprite);
          seekAnim(sprite, 0);
          sprite.animPaused = true;
          sprite.x += sprite.x2;
          sprite.y += sprite.y2;
          sprite.x2 = 2;
          sprite.y2 = -2;
          yield;
          for (let n = 0; n < 51; n++) {
            if (n & 1) {
              sprite.x2 = -sprite.x2;
              sprite.y2 = -sprite.y2;
            }
            yield;
          }
          sprite.x2 = sprite.y2 = 0;
          sprite.animPaused = false;
          sprite.startAnim(args[0] ^ 1);
          yield* travel(sprite, 6, fromX, fromY);
        })(),
        done,
      );
    },
  },

  /** AnimBreathPuff: slides out of the attacker's mouth, 52 frames. */
  gBreathPuffSpriteTemplate: {
    tag: "ANIM_TAG_BREATH",
    width: 16,
    height: 16,
    anims: [[F(0, 4, "h"), F(4, 40, "h"), F(8, 4, "h"), F(12, 4, "h"), END], [F(0, 4), F(4, 40), F(8, 4), F(12, 4), END]],
    init(sprite, run, _args, done) {
      const foe = run.attacker.foe;
      sprite.startAnim(foe ? 1 : 0);
      const [x, y] = run.center(AnimBattler.Attacker);
      sprite.x = x + (foe ? -32 : 32);
      sprite.y = y;
      runSprite(
        sprite,
        (function* () {
          yield;
          yield* slideAt(sprite, 52, foe ? -64 : 64, 0);
        })(),
        done,
      );
    },
  },

  /** AnimPencil: flickers, draws up the target scribbling, flickers. */
  gPencilSpriteTemplate: {
    tag: "ANIM_TAG_PENCIL",
    width: 32,
    height: 32,
    init(sprite, run, _args, done) {
      const [tx, ty] = battlerCoords(run, AnimBattler.Target);
      sprite.x = tx - 16;
      sprite.y = ty + 16;
      const height = PIC_HALF * 2 + 2;
      const pan = run.pan(63);
      runSprite(
        sprite,
        (function* () {
          const flicker = function* () {
            let [n, wait] = [0, 0];
            for (;;) {
              if (++wait > 1) {
                wait = 0;
                sprite.invisible = !sprite.invisible;
              }
              if (++n > 16) break;
              yield;
            }
            sprite.invisible = false;
          };
          yield;
          yield* flicker();
          yield;
          let [wait, drawn, dir, x] = [0, 0, 16, 0];
          while (drawn !== height) {
            if (++wait > 3 && drawn < height) {
              wait = 0;
              sprite.y--;
              drawn++;
              if (drawn % 10 === 0) run.play("se_m_sketch" as SoundId, pan);
            }
            x += dir;
            if (x > 31) {
              x = 0x40 - x;
              dir = -dir;
            } else if (x <= -32) {
              x = -0x40 - x;
              dir = -dir;
            }
            sprite.x2 = x;
            yield;
          }
          yield* flicker();
        })(),
        done,
      );
    },
  },

  gSnoreZSpriteTemplate: { tag: "ANIM_TAG_SNORE_Z", width: 32, height: 32, init: toTargetLocation },

  /** AnimSoftBoiledEgg: an egg arcs from the attacker, wobbles, hatches open and fades. */
  gSoftBoiledEggSpriteTemplate: {
    tag: "ANIM_TAG_BREAKING_EGG",
    width: 32,
    height: 32,
    affine: true,
    blend: true,
    affineAnims: [
      [A(0, 0, -8, 2), A(0, 0, 8, 4), A(0, 0, -8, 2), J(0)],
      [A(256, 256, 0, 0), END],
      [A(-8, 4, 0, 8), L(0), A(16, -8, 0, 8), A(-16, 8, 0, 8), L(1), A(256, 256, 0, 0), A(0, 0, 0, 15), END],
    ],
    init(sprite, run, args, done) {
      placeAtAttacker(sprite, run, args, false);
      const add = run.attacker.foe ? -160 : 160;
      runSprite(
        sprite,
        (function* () {
          let [rise, x] = [0x380, add];
          yield;
          for (;;) {
            sprite.y2 -= rise >> 8;
            sprite.x2 = x >> 8;
            rise -= 32;
            x += add;
            if (sprite.y2 > 0) break;
            yield;
          }
          sprite.y += sprite.y2;
          sprite.x += sprite.x2;
          sprite.x2 = sprite.y2 = 0;
          sprite.startAffineAnim(1);
          for (let n = 0; n <= 20; n++) yield;
          sprite.startAffineAnim(2);
          yield;
          while (!sprite.affineEnded) yield;
          sprite.startAffineAnim(1);
          if (args[2] === 0) {
            sprite.tileNum += 16;
            for (let n = 0; n < 9; n++) {
              yield;
              sprite.y2 -= 2;
            }
            let [level, count] = [16, 0];
            monBlend(run, level, 0);
            while (level) {
              yield;
              if (count++ % 3 === 0) {
                level--;
                monBlend(run, level, 16 - level);
              }
            }
          } else sprite.tileNum += 32;
          while ((run.args[7] & 0xffff) !== 0xffff) yield;
          sprite.invisible = true;
          yield;
          if (args[2] === 0) run.flow.gba.video.resetBlend();
        })(),
        done,
      );
    },
  },

  gThinRingShrinkingSpriteTemplate: { tag: "ANIM_TAG_THIN_RING", width: 64, height: 64, affine: true, blend: true, affineAnims: [[A(512, 512, 0, 0), A(-16, -16, 0, 30), END]], init: spriteOnMon },

  /** AnimHyperVoiceRing: from one battler to the other, over args[2] frames. */
  gHyperVoiceRingSpriteTemplate: {
    tag: "ANIM_TAG_THIN_RING",
    width: 64,
    height: 64,
    affine: true,
    blend: true,
    affineAnims: [[A(16, 16, 0, 0), A(11, 11, 0, 45), END]],
    init(sprite, run, args, done) {
      const [from, to] = args[5] === 0 ? [AnimBattler.Attacker, AnimBattler.Target] : [AnimBattler.Target, AnimBattler.Attacker];
      const spot = (which: AnimBattler) => (args[6] ? run.center(which) : battlerCoords(run, which));
      const foeFrom = run.mon(from).foe;
      sprite.x = spot(from)[0] + (foeFrom ? args[0] : -args[0]);
      sprite.y = spot(from)[1] + args[1];
      sprite.subpriority = (run.mon(foeFrom ? to : from).sprite?.subpriority ?? 2) - 1;
      const line = travel(sprite, args[2], spot(to)[0] + (run.mon(to).foe ? args[3] : -args[3]), spot(to)[1] + args[4]);
      const step = () => {
        if (line.next().done) done();
      };
      sprite.callback = step;
      step();
    },
  },

  gBellSpriteTemplate: { tag: "ANIM_TAG_BELL", width: 32, height: 32, anims: [[F(0, 6), F(16, 6), F(32, 15), F(16, 6), F(0, 6), F(16, 6, "h"), F(32, 15, "h"), F(16, 6, "h"), F(0, 6), F(16, 6), F(32, 15), F(16, 6), F(0, 6), END]], init: spriteOnMon },

  /** AnimHealBellMusicNote: from the attacker's spot, a note picked by args[5], args[6]. */
  gHealBellMusicNoteSpriteTemplate: {
    tag: "ANIM_TAG_MUSIC_NOTES_2",
    width: 16,
    height: 16,
    init(sprite, run, args, done) {
      placeAtAttacker(sprite, run, args, false);
      const [x, y] = battlerCoords(run, AnimBattler.Attacker);
      sprite.tileNum += (args[6] & 1 ? 32 : 0) + (args[5] << 2);
      sprite.paletteNum = run.flow.gba.palettes.spritePaletteSlot(NOTE_PAL_TAGS[args[6] >> 1]) & 15;
      flyTo(sprite, args[4], x + flip(run, args[2]), y + args[3], done);
    },
  },

  /** AnimRedHeartProjectile: waves to the target in 95. */
  gRedHeartProjectileSpriteTemplate: {
    ...HEART,
    init(sprite, run, args, done) {
      placeAtAttacker(sprite, run, args);
      const [x, y] = run.center(AnimBattler.Target);
      const line = travel(sprite, 95, x, y);
      let phase = 0;
      sprite.callback = () => {
        if (line.next().done) return done();
        sprite.y2 += sin(phase, 14);
        phase = (phase + 4) & 0xff;
      };
    },
  },

  gRedHeartBurstSpriteTemplate: { ...HEART, init: particleBurst },

  /** AnimRedHeartRising: from the bottom at x args[0], after args[2], flickers out at the top. */
  gRedHeartRisingSpriteTemplate: {
    ...HEART,
    init(sprite, _run, args, done) {
      sprite.x = args[0];
      sprite.y = 160;
      runSprite(
        sprite,
        (function* () {
          for (let n = 0; n <= args[2]; n++) yield;
          let [rise, phase] = [0, 0];
          for (;;) {
            rise += args[1];
            sprite.y2 = -((rise & 0xffff) >> 8);
            sprite.x2 = sin(phase, 4);
            phase = (phase + 3) & 0xff;
            const y = sprite.y + sprite.y2;
            if (y <= 72) {
              sprite.invisible = !!(phase % 2);
              if (y <= 64) return;
            }
            yield;
          }
        })(),
        done,
      );
    },
  },

  /** AnimOrbitFast: orbits the attacker, out for args[0], back, until the last arg is -1. */
  gHiddenPowerOrbSpriteTemplate: {
    tag: "ANIM_TAG_RED_ORB",
    width: 16,
    height: 16,
    affineNormal: true,
    affineAnims: RED_ORB_AFFINE,
    init(sprite, run, args, done) {
      [sprite.x, sprite.y] = run.center(AnimBattler.Attacker);
      sprite.affineAnimPaused = true;
      const sub = run.attacker.sprite?.subpriority ?? 2;
      let [angle, rx, ry, n, stage] = [args[1], 0, 0, 0, 0];
      const step = () => {
        sprite.subpriority = angle >= 64 && angle <= 191 ? sub + 1 : sub - 1;
        sprite.x2 = sin(angle, rx >> 8);
        sprite.y2 = cos(angle, ry >> 8);
        angle = (angle + 9) & 0xff;
        if (stage === 1) {
          rx -= 0x400;
          ry -= 0x100;
          if (++n === args[0]) return void (stage = 2);
        } else if (stage === 0) {
          rx += 0x400;
          ry += 0x100;
          if (++n === args[0]) {
            n = 0;
            stage = 1;
          }
        }
        if ((run.args[7] & 0xffff) === 0xffff) done();
      };
      sprite.callback = step;
      step();
    },
  },

  /** AnimOrbitScatter: flies off at angle args[0]. */
  gHiddenPowerOrbScatterSpriteTemplate: {
    tag: "ANIM_TAG_RED_ORB",
    width: 16,
    height: 16,
    affine: true,
    affineAnims: RED_ORB_AFFINE,
    init(sprite, run, args, done) {
      [sprite.x, sprite.y] = run.center(AnimBattler.Attacker);
      const [dx, dy] = [sin(args[0], 10), cos(args[0], 7)];
      sprite.callback = () => {
        sprite.x2 += dx;
        sprite.y2 += dy;
        const [x, y] = [sprite.x + sprite.x2, sprite.y + sprite.y2];
        if (x + 16 > 272 || x + 16 < 0 || y > 160 || y < -16) done();
      };
    },
  },

  /** AnimSpitUpOrb: flies off at angle args[0] for args[1] frames. */
  gSpitUpOrbSpriteTemplate: {
    tag: "ANIM_TAG_RED_ORB_2",
    width: 8,
    height: 8,
    affine: true,
    affineAnims: RED_ORB_AFFINE,
    init(sprite, run, args, done) {
      [sprite.x, sprite.y] = run.center(AnimBattler.Attacker);
      const [dx, dy] = [sin(args[0], 10), cos(args[0], 7)];
      let n = 0;
      sprite.callback = () => {
        sprite.x2 += dx;
        sprite.y2 += dy;
        if (n++ >= args[1]) done();
      };
    },
  },

  /** AnimAngel: floats down around the target. */
  gAngelSpriteTemplate: {
    tag: "ANIM_TAG_ANGEL",
    width: 32,
    height: 32,
    anims: [[F(0, 24), END]],
    init(sprite, _run, args, done) {
      sprite.x += args[0];
      sprite.y += args[1];
      let [n, drift] = [0, 0];
      const step = () => {
        n++;
        const phase = (n * 10) & 0xff;
        sprite.x2 = sin(phase, 80) >> 8;
        if (n < 80) sprite.y2 = Math.trunc(n / 2) + (cos(phase, 80) >> 8);
        if (n > 90) {
          drift++;
          sprite.x2 -= Math.trunc(drift / 2);
        }
        if (n > 100) done();
      };
      sprite.callback = step;
      step();
    },
  },

  /** AnimPinkHeart: a burst that then falls swaying. */
  gPinkHeartSpriteTemplate: {
    tag: "ANIM_TAG_PINK_HEART",
    width: 16,
    height: 16,
    init(sprite, _run, args, done) {
      runSprite(
        sprite,
        (function* () {
          yield;
          let [x, phase] = [0, 0];
          for (;;) {
            x += args[0];
            sprite.x2 = x >> 8;
            sprite.y2 = sin(phase, args[1]);
            phase = (phase + 3) & 0xff;
            if (phase > 70) break;
            yield;
          }
          sprite.x += sprite.x2;
          sprite.y += sprite.y2;
          sprite.x2 = sprite.y2 = 0;
          phase = random(180);
          yield;
          for (let n = 1; ; n++) {
            sprite.x2 = sin(phase, 5);
            sprite.y2 = Math.trunc(n / 2);
            phase = (phase + 3) & 0xff;
            if (n > 20) sprite.invisible = !!(n % 2);
            if (n > 30) return;
            yield;
          }
        })(),
        done,
      );
    },
  },

  /** AnimDevil: circles narrowing on the target, flickering at both ends. */
  gDevilSpriteTemplate: {
    tag: "ANIM_TAG_DEVIL",
    width: 32,
    height: 32,
    anims: [[F(0, 3), J(0)], [F(16, 3), J(0)]],
    init(sprite, run, args, done) {
      sprite.x += args[0];
      sprite.y += args[1];
      sprite.subpriority = (run.target.sprite?.subpriority ?? 2) - 1;
      let [t, dir, n] = [0, 1, 0];
      const step = () => {
        t += dir;
        const angle = Math.max((t * 4) % 256, 0);
        sprite.x2 = cos(angle, 30 - Math.trunc(t / 4));
        sprite.y2 = sin(angle, 10 - Math.trunc(t / 8));
        if (angle > 128 && dir > 0) dir = -1;
        if (angle === 0 && dir < 0) dir = 1;
        n++;
        sprite.invisible = n < 10 || n > 80 ? !!(t % 2) : false;
        if (n > 90) done();
      };
      sprite.callback = step;
      step();
    },
  },

  /** AnimFurySwipes. */
  gFurySwipesSpriteTemplate: {
    tag: "ANIM_TAG_SWIPE",
    width: 32,
    height: 32,
    anims: [[F(0, 4), F(16, 4), F(32, 4), F(48, 4), END], [F(0, 4, "h"), F(16, 4, "h"), F(32, 4, "h"), F(48, 4, "h"), END]],
    init(sprite, _run, args, done) {
      sprite.x += args[0];
      sprite.y += args[1];
      sprite.startAnim(args[2]);
      goneAtAnimEnd(sprite, done);
    },
  },

  /** AnimMovementWaves: its animation args[2] times at a side of a battler. */
  gMovementWavesSpriteTemplate: {
    tag: "ANIM_TAG_MOVEMENT_WAVES",
    width: 32,
    height: 32,
    anims: [[F(0, 8), F(16, 8), F(32, 8), F(16, 8), END], [F(16, 8, "h"), F(32, 8, "h"), F(16, 8, "h"), F(0, 8, "h"), END]],
    init(sprite, run, args, done) {
      if (!args[2]) return done();
      [sprite.x, sprite.y] = run.center(args[0] ? AnimBattler.Target : AnimBattler.Attacker);
      sprite.x += args[1] ? -32 : 32;
      sprite.startAnim(args[1]);
      let left = args[2];
      sprite.callback = () => {
        if (!sprite.animEnded) return;
        if (--left) sprite.startAnim(args[1]);
        else done();
      };
    },
  },

  /** AnimJaggedMusicNote: out from a battler for 17 frames. */
  gJaggedMusicNoteSpriteTemplate: {
    tag: "ANIM_TAG_JAGGED_MUSIC_NOTE",
    width: 32,
    height: 32,
    init(sprite, run, args, done) {
      const which = args[0] ? AnimBattler.Target : AnimBattler.Attacker;
      const dx = run.mon(which).foe ? -args[1] : args[1];
      const [cx, cy] = run.center(which);
      sprite.x = cx + dx;
      sprite.y = cy + args[2];
      sprite.tileNum += args[3] * 16;
      let [x, y, n] = [sprite.x << 3, sprite.y << 3, 0];
      sprite.callback = () => {
        x += dx;
        y += args[2];
        sprite.x = x >> 3;
        sprite.y = y >> 3;
        if (++n > 16) done();
      };
    },
  },

  /** AnimPerishSongMusicNote: notes circle the screen for 120 frames, then fall and bounce. */
  gPerishSongMusicNoteSpriteTemplate: {
    ...NOTES_2,
    init(sprite, _run, args, done) {
      sprite.x = 120;
      sprite.y = Math.trunc(args[0] / 2) - 15;
      sprite.startAnim(args[1]);
      runSprite(
        sprite,
        (function* () {
          let [n, wave] = [0, 0];
          yield;
          for (;;) {
            n++;
            wave = (wave + 10) & 0xff;
            const phase = (n * 3 + args[2]) & 0xff;
            sprite.x2 = cos(phase, 100);
            sprite.y2 = Math.trunc(n / 2) + sin(phase, 10) + cos(wave, 4);
            if (n > 120) break;
            yield;
          }
          sprite.x += sprite.x2;
          sprite.y += sprite.y2;
          sprite.x2 = sprite.y2 = 0;
          sprite.startAffineAnim(1);
          for (let t = 0; t <= 10; t++) yield;
          let [speed, fall, bounces] = [5, 0, 0];
          for (;;) {
            yield;
            fall += speed;
            sprite.y2 = fall;
            speed++;
            if (fall > 48 && speed > 0) {
              speed = bounces - 5;
              bounces++;
            }
            if (bounces > 3) {
              sprite.invisible = !!(speed % 2);
              return;
            }
          }
        })(),
        done,
      );
    },
  },

  /** AnimPerishSongMusicNote2: invisible, turns the notes' colors gray at frame 120 - args[0]. */
  gPerishSongMusicNote2SpriteTemplate: {
    ...NOTES_2,
    init(sprite, run, args, done) {
      const at = 120 - args[0];
      sprite.invisible = true;
      let n = 0;
      const step = () => {
        if (++n === at) setGrayscale(run, 256 + sprite.paletteNum * 16, false);
        if (n === at + 80) done();
      };
      sprite.callback = step;
      step();
    },
  },

  /** AnimGuardRing: rises through the attacker. */
  gGuardRingSpriteTemplate: {
    tag: "ANIM_TAG_GUARD_RING",
    width: 64,
    height: 32,
    affine: true,
    blend: true,
    affineAnims: [[A(256, 256, 0, 0), END], [A(512, 256, 0, 0), END]],
    init(sprite, run, _args, done) {
      const [x, y] = battlerCoords(run, AnimBattler.Attacker);
      sprite.x = x;
      sprite.y = y + 40;
      flyTo(sprite, 13, x, sprite.y - 72, done);
    },
  },
};

export const EFFECTS_2_TASK_SOUNDS: Record<string, readonly string[]> = { gBulletSeedSpriteTemplate: ["se_m_horn_attack"], gPencilSpriteTemplate: ["se_m_sketch"], AnimTask_AirCutterProjectile: ["se_m_blizzard2"] };

export const EFFECTS_2_ART: Record<string, AnimArtFiles> = {
  scaryFacePlayer: { png: "battle_anims/backgrounds/scary_face.png", pal: "battle_anims/backgrounds/scary_face.png", bin: "battle_anims/backgrounds/scary_face_player.bin" },
  attract: { png: "battle_anims/backgrounds/attract.png", pal: "battle_anims/backgrounds/attract.png", bin: "battle_anims/backgrounds/attract.bin" },
  musicNotes2: { png: "battle_anims/sprites/music_notes_2.png", pal: "battle_anims/sprites/music_notes_2.pal" },
  scaryFaceOpponent: { png: "battle_anims/backgrounds/scary_face.png", pal: "battle_anims/backgrounds/scary_face.png", bin: "battle_anims/backgrounds/scary_face_opponent.bin" },
};
export const EFFECTS_2_TASK_ART: Record<string, string[]> = { AnimTask_ScaryFace: ["scaryFacePlayer", "scaryFaceOpponent"], AnimTask_HeartsBackground: ["attract"], AnimTask_LoadMusicNotesPals: ["musicNotes2"] };

export const EFFECTS_2_TASKS: Record<string, AnimTask> = {
  /** AnimTask_Splash: the battler (args[0]) hops args[1] times. */
  *AnimTask_Splash(run, args) {
    const mon = monSprite(run, args[0]);
    if (!args[1] || !mon) return;
    yield;
    for (let left = args[1]; left > 0; left--) {
      const stretch = monAffine(mon, [A(-6, 4, 0, 8), A(10, -10, 0, 8), A(-4, 6, 0, 8), END]);
      let rise = 0;
      for (let n = 0; n < 8; n++) {
        stretch.next();
        rise += 3;
        mon.y2 += rise;
        yield;
      }
      for (let n = 0; n < 8; n++) {
        stretch.next();
        mon.y2 += rise;
        yield;
      }
      while (rise !== 0) {
        mon.y2 -= 2;
        rise -= 2;
        yield;
      }
      yield;
      while (!stretch.next().done) yield;
    }
    mon.y2 = 0;
  },

  /** AnimTask_GrowAndShrink. */
  *AnimTask_GrowAndShrink(run) {
    const mon = monSprite(run, AnimBattler.Attacker);
    if (mon) yield* monAffine(mon, [A(-4, -5, 0, 12), A(0, 0, 0, 24), A(4, 5, 0, 12), END]);
  },

  /** AnimTask_ScaryFace: the face on BG1 fades in, stays and fades out. */
  *AnimTask_ScaryFace(run) {
    const art = run.art(run.target.foe ? "scaryFacePlayer" : "scaryFaceOpponent");
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
    bg1.x = bg1.y = 0;
    yield;
    for (let level = 1; level <= 14; level++) {
      yield;
      yield;
      video.eva = level;
      video.evb = 16 - level;
    }
    for (let n = 0; n < 21; n++) yield;
    for (let level = 13; level >= 0; level--) {
      yield;
      yield;
      video.eva = level;
      video.evb = 16 - level;
    }
    yield;
    bg1.visible = false;
    video.resetBlend();
  },

  /** AnimTask_Withdraw: the attacker tips back and sinks, stays 30 frames, returns. */
  *AnimTask_Withdraw(run) {
    const mon = monSprite(run, AnimBattler.Attacker);
    if (!mon) return;
    mon.affineAnimPaused = true;
    const sign = run.attacker.foe ? 1 : -1;
    let turn = 0;
    do {
      yield;
      mon.setRotScale(0x100, 0x100, sign * turn);
      turn += 0xb0;
      mon.y2++;
    } while (turn !== 0xf20);
    yield;
    for (let n = 0; n < 30; n++) {
      mon.setRotScale(0x100, 0x100, sign * turn);
      yield;
    }
    do {
      mon.setRotScale(0x100, 0x100, sign * turn);
      turn -= 0xb0;
      mon.y2--;
      yield;
    } while (turn !== 0);
    resetMonScale(mon);
  },

  /** AnimTask_AirCutterProjectile: three air waves fly at the target, slow down and fade. */
  *AnimTask_AirCutterProjectile(run, args) {
    const onPlayer = !run.target.foe;
    const speed = onPlayer ? args[2] ^ 1 : args[2];
    const [x, y] = battlerCoords(run, AnimBattler.Attacker);
    const [tx, ty] = battlerCoords(run, AnimBattler.Target);
    const [toX, toY] = [tx + (onPlayer ? -args[0] : args[0]), ty + (onPlayer ? -args[1] : args[1])];
    const steps = Math.trunc((Math.abs(toX - x) * 256) / (speed & ~1));
    const half = (steps * 0x80) >> 8;
    const stepY = Math.trunc((Math.abs(toY - y) * 256) / steps);
    const signY = toY >= y ? 0 : 1;
    const base = run.target.sprite?.subpriority ?? 2;
    const sub = Math.max(3, args[4] & 0x7f ? ((args[4] & 0x7f) >= 64 ? base + (args[4] & 0x7f) - 64 : base - (args[4] & 0x7f)) : base);
    const pan = run.pan(-63);
    let active = 0;
    const template: AnimSpriteTemplate = {
      tag: "ANIM_TAG_AIR_WAVE",
      width: 32,
      height: 16,
      blend: true,
      init(sprite, _run, _args, done) {
        if (onPlayer) sprite.hFlip = sprite.vFlip = true;
        const place = (dx: number, dy: number) => {
          sprite.x2 = speed & 1 ? -((dx & 0xffff) >> 8) : (dx & 0xffff) >> 8;
          sprite.y2 = signY ? -((dy & 0xffff) >> 8) : (dy & 0xffff) >> 8;
        };
        runSprite(
          sprite,
          (function* () {
            let [dx, dy, left] = [0, 0, steps - half];
            for (;;) {
              dx += speed & ~1;
              dy += stepY;
              place(dx, dy);
              if (left-- <= 0) break;
              yield;
            }
            sprite.x += sprite.x2;
            sprite.y += sprite.y2;
            sprite.x2 = sprite.y2 = 0;
            yield;
            const accel = (d: number) => {
              const scaled = (Math.abs(d) * 256 * 16) >> 8;
              return (scaled * Math.trunc(0x10000 / 0x1c0)) >> 8;
            };
            const [ax, ay] = [accel(toX - sprite.x), accel(toY - sprite.y)];
            let [vx, vy] = [0, 0];
            [dx, dy, left] = [0, 0, 8];
            for (;;) {
              vx += left > 4 ? ax : -ax;
              vy += left > 4 ? ay : -ay;
              dx += vx;
              dy += vy;
              place(dx, dy);
              if (left-- <= 0) break;
              yield;
            }
            for (let n = 30; n >= 0; n--) yield;
            active--;
          })(),
          done,
        );
      },
    };
    yield;
    for (let i = 0; i < 3; i++) {
      active++;
      run.createSprite(template, x, y, sub - i);
      run.play("se_m_blizzard2" as SoundId, pan);
      if (i < 2) for (let wait = 0; wait <= args[3]; wait++) yield;
    }
    while (active > 0) yield;
  },

  /** AnimTask_GrowAndGrayscale: the target, doubled-ish and gray, 80 frames. */
  *AnimTask_GrowAndGrayscale(run) {
    const mon = monSprite(run, AnimBattler.Target);
    if (!mon) return;
    mon.mode = ObjMode.Blend;
    mon.affineAnimPaused = true;
    mon.setRotScale(0xd0, 0xd0, 0);
    const offset = 256 + mon.paletteNum * 16;
    setGrayscale(run, offset, false);
    for (let n = 0; n <= 80; n++) yield;
    resetMonScale(mon);
    mon.mode = ObjMode.Normal;
    setGrayscale(run, offset, true);
  },

  /** AnimTask_Minimize: the attacker shrinks three times leaving faint copies, waits and returns. */
  *AnimTask_Minimize(run) {
    const mon = monSprite(run, AnimBattler.Attacker);
    if (!mon) return;
    mon.affineAnimPaused = true;
    const { sprites } = run.flow.gba;
    const sub = mon.subpriority;
    let [scale, copies] = [0x100, 0];
    const set = () => {
      mon.setRotScale(scale, scale, 0);
      mon.y2 = Math.trunc(32 - (32 * 256) / scale);
    };
    yield;
    for (let cycle = 0; cycle < 3; cycle++) {
      let made = 0;
      for (let n = 0; n < 32; n++) {
        if (n === 0 || n === 3 || n === 6) {
          const copy = cloneMon(run, mon, ObjMode.Blend);
          if (copy) {
            copy.subpriority = sub - made++;
            copy.affineAnimPaused = true;
            copy.setRotScale(scale, scale, 0);
            copies++;
            let left = 16;
            copy.callback = () => {
              if (--left === 0) {
                copies--;
                sprites.destroy(copy);
              }
            };
          }
        }
        scale += 0x28;
        set();
        yield;
      }
      while (copies > 0) yield;
      if (cycle < 2) {
        scale = 0x100;
        set();
        yield;
        yield;
      }
    }
    for (let n = 0; n <= 32; n++) yield;
    for (let n = 0; n < 16; n++) {
      scale -= 0x50;
      set();
      yield;
    }
    resetMonScale(mon);
  },

  /** AnimTask_ThrashMoveMonHorizontal. */
  *AnimTask_ThrashMoveMonHorizontal(run) {
    const mon = monSprite(run, AnimBattler.Attacker);
    if (mon) yield* monAffine(mon, [A(-10, 9, 0, 7), A(20, -20, 0, 7), A(-20, 20, 0, 7), A(10, -9, 0, 7), L(2), END]);
  },

  /** AnimTask_ThrashMoveMonVertical: charges back and forth three times, bobbing. */
  *AnimTask_ThrashMoveMonVertical(run) {
    const mon = monSprite(run, AnimBattler.Attacker);
    if (!mon) return;
    const step = run.attacker.foe ? -4 : 4;
    let [wait, bob] = [0, 0];
    yield;
    for (let lap = 3; lap > 0; lap--) {
      for (const [frames, by] of [[7, step], [14, -step], [7, step]]) {
        for (let n = 0; n < frames; n++) {
          if (++wait > 2) {
            wait = 0;
            mon.y += ++bob & 1 ? 2 : -2;
          }
          mon.x += by;
          yield;
        }
      }
    }
    if (bob & 1) mon.y -= 2;
  },

  /** AnimTask_SketchDrawMon: the C draws the target line by line (scanlines); ours is hidden until the drawing ends. */
  *AnimTask_SketchDrawMon(run) {
    const mon = monSprite(run, AnimBattler.Target);
    if (!mon) return;
    const was = mon.invisible;
    mon.invisible = true;
    for (let n = 0; n <= 20 + PIC_HALF * 2 * 4; n++) yield;
    mon.invisible = was;
  },

  /** AnimTask_AttackerStretchAndDisappear. */
  *AnimTask_AttackerStretchAndDisappear(run) {
    const mon = monSprite(run, AnimBattler.Attacker);
    if (!mon) return;
    yield* monAffine(mon, [A(96, -13, 0, 8), END]);
    mon.y2 = 0;
    mon.invisible = true;
  },

  /** AnimTask_ExtremeSpeedImpact: the target is hit back three times, and slides home. */
  *AnimTask_ExtremeSpeedImpact(run) {
    const mon = monSprite(run, AnimBattler.Target);
    if (!mon) return;
    const onPlayer = !run.target.foe;
    yield;
    for (let hit = 3; hit > 0; hit--) {
      mon.x2 += onPlayer ? 8 : -8;
      yield;
      let [wait, flips, n] = [0, 0, 0];
      for (;;) {
        yield;
        if (++wait <= 1) continue;
        wait = 0;
        flips++;
        mon.x2 += flips & 1 ? 6 : -6;
        if (++n > 4) {
          if (flips & 1) mon.x2 -= 6;
          break;
        }
      }
      yield;
    }
    do {
      yield;
      mon.x2 += onPlayer ? -1 : 1;
    } while (mon.x2 !== 0);
  },

  /** AnimTask_ExtremeSpeedMonReappear: flickers back in. */
  *AnimTask_ExtremeSpeedMonReappear(run) {
    const mon = monSprite(run, AnimBattler.Attacker);
    if (!mon) return;
    for (let n = 1; n <= 14; n++) {
      yield;
      yield;
      mon.invisible = !(n & 1);
    }
    mon.invisible = false;
  },

  /** AnimTask_SpeedDust: dust at the attacker's feet, all flickering together. */
  *AnimTask_SpeedDust(run) {
    const [x, y] = battlerCoords(run, AnimBattler.Attacker);
    let [hidden, active, wait, gap, stage, flicks, again, made, rounds] = [0, 0, 0, 4, 0, 0, false, 0, 0];
    const spots = [[30, 28], [-20, 24], [16, 26], [-10, 28]];
    yield;
    for (;;) {
      if (stage === 0) {
        if (++wait > 1) {
          wait = 0;
          hidden = (hidden + 1) & 1;
          if (++flicks > 20) {
            if (!again) {
              flicks = 0;
              stage = 1;
            } else stage = 2;
          }
        }
      } else if (stage === 1) {
        hidden = 0;
        if (++wait > 20) {
          again = true;
          stage = 0;
        }
      } else hidden = 1;
      if (rounds <= 5) {
        if (++gap > 4) {
          gap = 0;
          const [ox, oy] = spots[made];
          active++;
          const dust = run.createSprite(
            {
              tag: "ANIM_TAG_SPEED_DUST",
              width: 16,
              height: 16,
              anims: [[F(0, 3), F(4, 3), F(8, 3), F(4, 3), F(0, 3), END]],
              init(sprite, _run, _args, done) {
                sprite.callback = () => {
                  sprite.invisible = !!hidden;
                  if (sprite.animEnded) {
                    active--;
                    done();
                  }
                };
              },
            },
            x,
            y,
            0,
          );
          if (dust) Object.assign(dust, { x2: ox, y2: oy });
          if (++made > 3) {
            made = 0;
            rounds++;
          }
        }
      } else if (!active) return;
      yield;
    }
  },

  /** AnimTask_LoadMusicNotesPals: three palettes for the notes, from the art's own row. */
  *AnimTask_LoadMusicNotesPals(run) {
    const { palettes } = run.flow.gba;
    const art = run.art("musicNotes2");
    NOTE_PAL_TAGS.forEach((tag, i) => {
      const colors = art && art.palette.length >= (i + 1) * 16 ? art.palette.slice(i * 16, (i + 1) * 16) : palettes.unfaded.slice(256 + (palettes.spritePaletteSlot(NOTE_PAL_TAGS[0]) & 15) * 16, 272 + (palettes.spritePaletteSlot(NOTE_PAL_TAGS[0]) & 15) * 16);
      const slot = i === 0 ? palettes.spritePaletteSlot(tag) : palettes.loadSpritePalette(tag, colors);
      palettes.load(colors, 256 + (slot & 15) * 16, 16);
    });
  },

  *AnimTask_FreeMusicNotesPals(run) {
    for (const tag of NOTE_PAL_TAGS) run.flow.gba.palettes.freeSpritePalette(tag);
  },

  /** AnimTask_FakeOut: the background goes black outside a window that closes from both sides, then flashes white. */
  *AnimTask_FakeOut(run) {
    const { video, palettes } = run.flow.gba;
    video.win0On = true;
    video.winIn0 = Layer.ALL;
    video.winOut = Layer.ALL | 32;
    video.effect = Effect.Darken;
    video.target1 = Layer.BG3;
    video.evy = 16;
    let [left, right] = [0, 240];
    Object.assign(video.win0, { left, right, top: 0, bottom: 160 });
    for (;;) {
      yield;
      left += 13;
      right -= 13;
      if (left >= right) break;
      Object.assign(video.win0, { left, right });
    }
    Object.assign(video.win0, { left: 0, right: 0 });
    for (let n = 0; n < 5; n++) yield;
    video.effect = Effect.Lighten;
    palettes.blendPalettes(paletteMask(run, selectedPalettes(run, 1)), 16, 0x7fff);
    yield;
    video.win0On = false;
    video.winIn0 = video.winOut = 0;
    video.resetBlend();
  },

  /** AnimTask_StretchAttackerUp: stretches, shaking. */
  *AnimTask_StretchAttackerUp(run) {
    const mon = monSprite(run, AnimBattler.Attacker);
    if (!mon) return;
    yield* monAffine(mon, [A(10, -13, 0, 10), A(-10, 13, 0, 10), END], () => (mon.x2 = mon.x2 ? -mon.x2 : 4));
    mon.x2 = mon.y2 = 0;
  },

  /** AnimTask_HeartsBackground: hearts on BG1 behind the battlers, fading in, 140 frames, out. */
  *AnimTask_HeartsBackground(run) {
    const art = run.art("attract");
    if (!art) return;
    const { gba } = run.flow;
    const { video } = gba;
    Object.assign(video, { effect: Effect.Blend, target1: Layer.BG1, target2: Layer.ALL, eva: 0, evb: 16 });
    const bg1 = video.bgs[1];
    initBg(bg1, 0, 3);
    bg1.tiles = art.tiles;
    bg1.map.set(art.map!.subarray(0, bg1.map.length));
    bg1.visible = true;
    gba.palettes.load(art.palette, ANIM_PALETTE * 16, 16);
    bg1.x = bg1.y = 0;
    yield;
    for (let level = 1; level <= 16; level++) {
      for (let n = 0; n < 4; n++) yield;
      video.eva = level;
      video.evb = 16 - level;
    }
    for (let n = 0; n < 141; n++) yield;
    for (let level = 15; level >= 0; level--) {
      for (let n = 0; n < 4; n++) yield;
      video.eva = level;
      video.evb = 16 - level;
    }
    yield;
    bg1.visible = false;
    bg1.priority = 1;
    video.resetBlend();
  },

  /** AnimTask_UproarDistortion. */
  *AnimTask_UproarDistortion(run, args) {
    const mon = monSprite(run, args[0]);
    if (mon) yield* monAffine(mon, [A(-12, 8, 0, 4), A(20, -20, 0, 4), A(-8, 12, 0, 4), END]);
  },

  /** Fury Cutter's run isn't sent yet: always its first hit. */
  *AnimTask_IsFuryCutterHitRight(run) {
    run.args[7] = 1;
  },

  *AnimTask_GetFuryCutterHitCount(run) {
    run.args[7] = 1;
  },
};
