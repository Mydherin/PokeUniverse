// Shared effects (battle_anim_effects_1.c): powders, leaves, music notes, slices and small helpers.

import { ObjMode, type AnimCmd, type Sprite } from "../../../../gba/sprites";
import { SIN } from "../../../../gba/trig";
import type { SoundId } from "../../../manifest";
import { AnimBattler, type AnimRun, type AnimSpriteTemplate, type AnimTask } from "../script";
import { monBlend } from "./dark";
import { A, arc, arcTan2Neg, battlerCoords, cloneMon, cos, END, F, fastSteps, flip, flyTo, goneAtAnimEnd, J, L, monPalettes, monSprite, paletteMask, PIC_HALF, pixelLine, placeAtAttacker, placeAtTarget, random, resetMonScale, rotScale, runSprite, selectedPalettes, sideX, sin, slideAt, spriteOnMon, toTargetLocation, travel } from "./util";

const rgb = (r: number, g: number, b: number) => r | (g << 5) | (b << 10);
const POWDER = [[F(0, 5), F(2, 5), F(4, 5), F(6, 5), F(8, 5), F(10, 5), F(12, 5), F(14, 5), J(0)]];
const LEAF_ANIMS = [[F(0, 5), F(4, 5), F(8, 5), F(12, 5), F(16, 5), F(20, 5), F(16, 5), F(12, 5), F(8, 5), F(4, 5), J(0)], [F(24, 5), F(28, 5), F(32, 5), END]];
const WHIP: AnimCmd[][] = [[F(64, 3), F(80, 3), F(96, 3), F(112, 6), END], [F(64, 3, "h"), F(80, 3, "h"), F(96, 3, "h"), F(112, 6, "h"), END]];
const FALLING_BAG_AFFINE = [
  [A(0, 0, -4, 10), A(0, 0, 4, 20), A(0, 0, -4, 10), END],
  [A(0, 0, -1, 2), A(0, 0, 1, 4), A(0, 0, -1, 4), A(0, 0, 1, 4), A(0, 0, -1, 4), A(0, 0, 1, 2), END],
];
const SPARK_6 = { tag: "ANIM_TAG_SPARKLE_6", width: 16, height: 16, affineNormal: true } as const;

/** gMusicNotesAnimTable. */
export const MUSIC_NOTES_ANIMS: AnimCmd[][] = [[F(0, 10), END], [F(4, 10), END], [F(8, 41), END], [F(12, 10), END], [F(16, 10), END], [F(20, 10), END], [F(0, 10, "v"), END], [F(4, 10, "v"), END]];

/** sParticlesColorBlendTable: the tags that hold the notes' extra palettes, and their colors. */
const NOTE_COLORS: readonly [string, readonly number[]][] = [
  ["ANIM_TAG_MUSIC_NOTES", [rgb(31, 31, 31), rgb(31, 26, 28), rgb(31, 22, 26), rgb(31, 17, 24), rgb(31, 13, 22)]],
  ["ANIM_TAG_BENT_SPOON", [rgb(31, 31, 31), rgb(25, 31, 26), rgb(20, 31, 21), rgb(15, 31, 16), rgb(10, 31, 12)]],
  ["ANIM_TAG_SPHERE_TO_CUBE", [rgb(31, 31, 31), rgb(31, 31, 24), rgb(31, 31, 17), rgb(31, 31, 10), rgb(31, 31, 3)]],
  ["ANIM_TAG_LARGE_FRESH_EGG", [rgb(31, 31, 31), rgb(26, 28, 31), rgb(21, 26, 31), rgb(16, 24, 31), rgb(12, 22, 31)]],
];

/** The notes' palettes: created from the music notes' colors, with the table's on top. */
export function loadNotePalettes(run: AnimRun): void {
  const { palettes } = run.flow.gba;
  const base = 256 + (palettes.spritePaletteSlot(NOTE_COLORS[0][0]) & 15) * 16;
  const colors = palettes.unfaded.slice(base, base + 16);
  NOTE_COLORS.forEach(([tag, row], j) => {
    const offset = 256 + ((j === 0 ? palettes.spritePaletteSlot(tag) : palettes.loadSpritePalette(tag, colors)) & 15) * 16;
    row.forEach((color, i) => (palettes.faded[offset + 1 + i] = color));
  });
}

export function freeNotePalettes(run: AnimRun): void {
  for (let i = 1; i < NOTE_COLORS.length; i++) run.flow.gba.palettes.freeSpritePalette(NOTE_COLORS[i][0]);
}

const notePalette = (run: AnimRun, sprite: Sprite, index: number) => {
  const tag = NOTE_COLORS[index]?.[0];
  if (tag) sprite.paletteNum = run.flow.gba.palettes.spritePaletteSlot(tag) & 15;
};

/** AnimMovePowderParticle. */
const powder: AnimSpriteTemplate["init"] = (sprite, run, args, done) => {
  sprite.x += args[0];
  sprite.y += args[1];
  const amp = run.attacker.foe ? -args[4] : args[4];
  let [left, fall, phase] = [args[2], 0, 0];
  sprite.callback = () => {
    if (left <= 0) return done();
    left--;
    sprite.y2 = fall >> 8;
    fall += args[3];
    sprite.x2 = sin(phase, amp);
    phase = (phase + args[5]) & 0xff;
  };
};

/** AnimTranslateLinearSingleSineWave: an arc that repeats on past the target, until off screen. */
const singleSineWave: AnimSpriteTemplate["init"] = (sprite, run, args, done) => {
  placeAtAttacker(sprite, run, args);
  const [cx, cy] = run.center(AnimBattler.Target);
  const axis = (d: number) => {
    const step = (((Math.abs(d) << 8) & 0xffff) / args[4]) & 0xffff;
    return d < 0 ? -step : step;
  };
  const [stepX, stepY] = [axis(cx + flip(run, args[2]) - sprite.x), axis(cy + args[3] - sprite.y)];
  const wave = Math.trunc(0x8000 / args[4]);
  let [x, y, phase] = [0, 0, 0];
  sprite.callback = () => {
    x += stepX;
    y += stepY;
    phase = (phase + wave) & 0xffff;
    sprite.x2 = x >> 8;
    sprite.y2 = (y >> 8) + sin(phase >> 8, args[5]);
    if (sprite.x + sprite.x2 > 256 || sprite.x + sprite.x2 < -16 || sprite.y + sprite.y2 > 160 || sprite.y + sprite.y2 < -16) done();
  };
};

/** AnimMoveTwisterParticle: circles, rising, faster until args[4] frames are left. */
const twister: AnimSpriteTemplate["init"] = (sprite, run, args, done) => {
  sprite.y += 32;
  const base = run.target.sprite?.priority ?? 2;
  let [left, rise, phase] = [args[0], args[1], 0];
  sprite.callback = () => {
    if (rise === 0xff) sprite.y -= 2;
    else if (rise > 0) {
      sprite.y -= 2;
      rise -= 2;
    }
    phase += args[2];
    if (left < args[4]) phase += args[2];
    phase &= 0xff;
    sprite.x2 = cos(phase, args[3]);
    sprite.y2 = sin(phase, 5);
    sprite.priority = phase < 0x80 ? base - 1 : base + 1;
    if (--left === 0) done();
  };
};

/** AnimFlyingParticle: crosses the screen from the battler's (args[6]) back, on a sine. */
const flyingParticle: AnimSpriteTemplate["init"] = (sprite, run, args, done) => {
  const which = args[6] ? AnimBattler.Target : AnimBattler.Attacker;
  const foe = run.mon(which).foe;
  const dx = foe ? args[3] : -args[3];
  sprite.x = foe ? -16 : 256;
  const base = run.mon(which).sprite?.priority ?? 2;
  if (args[5] < 2) sprite.y = args[0];
  else sprite.y = run.center(args[5] === 2 ? which : AnimBattler.Target)[1] + args[0];
  sprite.priority = args[5] === 1 || args[5] === 3 ? base + 1 : base;
  let [phase, n] = [args[2], 0];
  sprite.callback = () => {
    const a = n++;
    sprite.y2 = (args[1] * SIN[phase]) >> 8;
    sprite.x2 = dx * a;
    phase = (args[4] * a) & 0xff;
    if (foe ? sprite.x2 + sprite.x <= 0xf7 : sprite.x2 + sprite.x > -16) return;
    done();
  };
};

/** AnimWhipHit. */
const whipHit: AnimSpriteTemplate["init"] = (sprite, run, args, done) => {
  if (!run.attacker.foe) sprite.startAnim(1);
  sprite.x += sideX(run, args[0]);
  sprite.y += args[1];
  goneAtAnimEnd(sprite, done);
};

/** AnimFalseSwipeSlice_Step3: 9 flickers every other frame. */
export function* sliceFlicker(sprite: Sprite): Generator<void, void, void> {
  for (let n = 0; n <= 8; n++) {
    yield;
    yield;
    sprite.invisible = !sprite.invisible;
  }
}

/** SetSpriteNextToMonHead. */
function nextToHead(run: AnimRun, sprite: Sprite, which: AnimBattler): void {
  const [x, y] = run.center(which);
  sprite.x = run.mon(which).foe ? x - PIC_HALF - 8 : x + PIC_HALF + 8;
  sprite.y = y - Math.trunc((PIC_HALF * 2) / 4);
}

/** gThoughtBubbleSpriteTemplate's table; AnimThoughtBubble: opens by the head, stays args[1], closes. */
export const THOUGHT_ANIMS = [
  [F(0, 2, "h"), F(16, 2, "h"), F(32, 2, "h"), F(48, 2, "h"), END],
  [F(0, 2), F(16, 2), F(32, 2), F(48, 2), END],
  [F(48, 2, "h"), F(32, 2, "h"), F(16, 2, "h"), F(0, 2, "h"), END],
  [F(48, 2), F(32, 2), F(16, 2), F(0, 2), END],
];

/**
 * InitItemBagData + AnimItemSteal_Step1, Step2: the bag falls to (x, y) in `time` frames with
 * `bounces`, shakes at frame 10 of its rest, gone at 50.
 */
export function* itemFall(sprite: Sprite, x: number, y: number, time: number, bounces: number): Generator<void, void, void> {
  const [startX, startY] = [sprite.x, sprite.y];
  let [wave, n, t] = [0, 0, 0];
  for (;;) {
    wave += Math.trunc((bounces * 128) / time);
    if (wave >= 128) {
      n++;
      wave = 0;
    }
    sprite.y2 = sin(wave + 128, 30 - n * 8);
    sprite.x = Math.trunc(((x - startX) * t) / time) + startX;
    sprite.y = Math.trunc(((y - startY) * t) / time) + startY;
    if (++t === time) break;
    yield;
  }
  sprite.y2 = 0;
  for (let rest = 0; rest <= 50; rest++) {
    yield;
    if (rest === 10) sprite.startAffineAnim(1);
  }
}

const TRICK_PATH = [[5, 24, 1], [0, 4, 0], [8, 16, -1], [0, 2, 0], [8, 16, 1], [0, 2, 0], [8, 16, 1], [0, 2, 0], [8, 16, 1], [0, 16, 0], [0, 0, 127]];

/** sMagicalLeafBlendColors. */
const LEAF_COLORS = [rgb(31, 0, 0), rgb(31, 19, 0), rgb(31, 31, 0), rgb(0, 31, 0), rgb(5, 14, 31), rgb(22, 10, 31), rgb(22, 21, 31)];

/** AnimRootFlickerOut: gone after `life` frames, flickering for the last 10. */
const rootFlicker = (sprite: Sprite, life: number, done: () => void) => {
  let n = 0;
  sprite.callback = () => {
    if (++n > life - 10) sprite.invisible = !!(n % 2);
    if (n > life) done();
  };
};

/** AnimMetronomeFinger_Step: stays 16 frames, wags and shrinks. */
function* fingerEnd(sprite: Sprite): Generator<void, void, void> {
  for (let n = 0; n <= 16; n++) yield;
  sprite.startAffineAnim(1);
  yield;
  while (!sprite.affineEnded) yield;
}

const FINGER_AFFINE = [[A(0x10, 0x10, 0, 0), A(0x1e, 0x1e, 0, 8), END], [A(0, 0, 4, 11), A(0, 0, -4, 11), L(2), A(-0x1e, -0x1e, 0, 8), END]];
const SLICE_2: { tag: string; width: number; height: number; anims: AnimCmd[][] } = { tag: "ANIM_TAG_SLASH_2", width: 32, height: 32, anims: [[F(0, 4), F(16, 4), F(32, 4), F(48, 4), END], [F(48, 4), END]] };
const ROOT_ANIMS = [[F(0, 7), F(16, 7), F(32, 7), F(48, 7), END], [F(0, 7, "h"), F(16, 7, "h"), F(32, 7, "h"), F(48, 7, "h"), END], [F(0, 7), F(16, 7), F(32, 7), END], [F(0, 7, "h"), F(16, 7, "h"), F(32, 7, "h"), END]];
const CONVERSION_AFFINE = [[A(0x200, 0x200, 0, 0), END]];
const FLOWER = { tag: "ANIM_TAG_FLOWER" } as const;
/** The runs whose moon and sparkles AnimTask_MoonlightEndFade told to go. */
const moonGone = new WeakSet<AnimRun>();
const LEAF_BLADE_ANIMS = [[F(28, 1), END], [F(32, 1), END], [F(20, 1), END], [F(28, 1, "h"), END], [F(16, 1), END], [F(16, 1, "h"), END], [F(28, 1), END]];
const LOCK_ON_PATH = [[64, 64], [0, -64], [-64, 64], [32, -32]];

/** AnimLockOnTarget: the sight jumps around the target, then locks; `corner` 0 is the middle piece. */
function lockOn(sprite: Sprite, run: AnimRun, corner: number, done: () => void): void {
  sprite.x -= 32;
  sprite.y -= 32;
  const settle = () => {
    sprite.x += sprite.x2;
    sprite.y += sprite.y2;
    sprite.x2 = sprite.y2 = 0;
  };
  runSprite(
    sprite,
    (function* () {
      for (let n = 0; n <= 20; n++) yield;
      for (const [dx, dy] of LOCK_ON_PATH) {
        yield;
        yield;
        settle();
        const to = [sprite.x + dx, sprite.y + dy] as const;
        run.play("se_m_lock_on" as SoundId, run.pan(63));
        yield* travel(sprite, 8, to[0], to[1]);
      }
      for (let n = 0; n <= 10; n++) yield;
      if (corner === 0) {
        for (let n = 0; n <= 3; n++) yield;
        const { palettes } = run.flow.gba;
        const mask = paletteMask(run, selectedPalettes(run, 7));
        let [level, back] = [0, false];
        for (;;) {
          if (!back) level = Math.min(level + 3, 16);
          else level = Math.max(level - 3, 0);
          palettes.blendPalettes(mask, level, 0x7fff);
          if (level === 16) {
            back = true;
            const offset = 256 + sprite.paletteNum * 16;
            palettes.load(palettes.unfaded.slice(offset + 8, offset + 10), offset + 1, 2);
            run.play("se_m_leer" as SoundId, run.pan(63));
          } else if (level === 0) break;
          yield;
        }
      } else {
        const [a, b] = corner === 1 ? [-8, -8] : corner === 2 ? [-8, 8] : corner === 3 ? [8, -8] : [8, 8];
        settle();
        const [tx, ty] = run.center(AnimBattler.Target);
        yield* travel(sprite, 6, tx + a, ty + b);
      }
      while ((run.args[7] & 0xffff) !== 0xffff) yield;
      for (let n = 0, toggles = 0; toggles < 8; n++) {
        if (n % 3 === 0) {
          toggles++;
          sprite.invisible = !sprite.invisible;
        }
        yield;
      }
    })(),
    done,
  );
}

export const EFFECTS_1_TEMPLATES: Record<string, AnimSpriteTemplate> = {
  gSleepPowderParticleSpriteTemplate: { tag: "ANIM_TAG_SLEEP_POWDER", width: 8, height: 16, anims: POWDER, init: powder },
  gStunSporeParticleSpriteTemplate: { tag: "ANIM_TAG_STUN_SPORE", width: 8, height: 16, anims: POWDER, init: powder },
  gPoisonPowderParticleSpriteTemplate: { tag: "ANIM_TAG_POISON_POWDER", width: 8, height: 16, anims: POWDER, init: powder },

  /** AnimSolarBeamBigOrb. */
  gSolarBeamBigOrbSpriteTemplate: {
    tag: "ANIM_TAG_ORBS",
    width: 8,
    height: 8,
    anims: [0, 1, 2, 3, 4, 5, 6].map((image) => [F(image, 1), END]),
    init(sprite, run, args, done) {
      placeAtAttacker(sprite, run, args);
      sprite.startAnim(args[3]);
      const [x, y] = run.center(AnimBattler.Target);
      flyTo(sprite, args[2], x, y, done);
    },
  },

  /** AnimPowerAbsorptionOrb: into the attacker. */
  gStockpileAbsorptionOrbSpriteTemplate: {
    tag: "ANIM_TAG_GRAY_ORB",
    width: 8,
    height: 8,
    affine: true,
    affineAnims: [[A(320, 320, 0, 0), A(-14, -14, 0, 1), J(1)]],
    init(sprite, run, args, done) {
      placeAtAttacker(sprite, run, args);
      const [x, y] = run.center(AnimBattler.Attacker);
      flyTo(sprite, args[2], x, y, done);
    },
  },

  /** AnimSporeParticle: circles the target going down. */
  gSporeParticleSpriteTemplate: {
    tag: "ANIM_TAG_SPORE",
    width: 16,
    height: 16,
    anims: [[F(0, 1), END], [F(4, 7), END]],
    init(sprite, run, args, done) {
      placeAtTarget(sprite, run, args);
      sprite.startAnim(args[4]);
      if (args[4] === 1) sprite.mode = ObjMode.Blend;
      const base = run.target.sprite?.priority ?? 2;
      let [left, phase, fall] = [args[3], args[2], 0];
      const step = () => {
        fall += 24;
        sprite.x2 = sin(phase, 32);
        sprite.y2 = cos(phase, -3) + (fall >> 8);
        sprite.priority = ((phase - 0x40) & 0xffff) < 0x80 ? base : Math.min(base + 1, 3);
        phase = (phase + 2) & 0xff;
        if (--left === -1) done();
      };
      sprite.callback = step;
      step();
    },
  },

  /** AnimPetalDanceBigFlower: falls from the attacker's spot, circling in front and behind. */
  gPetalDanceBigFlowerSpriteTemplate: {
    tag: "ANIM_TAG_FLOWER",
    width: 16,
    height: 16,
    anims: [[F(0, 1), END]],
    init(sprite, run, args, done) {
      placeAtAttacker(sprite, run, args, false);
      const line = travel(sprite, args[3], sprite.x, run.center(AnimBattler.Attacker)[1] + args[2]);
      const sub = run.attacker.sprite?.subpriority ?? 2;
      let phase = 0x40;
      const step = () => {
        if (line.next().done) return done();
        sprite.x2 += sin(phase, 32);
        sprite.y2 += cos(phase, -5);
        sprite.subpriority = ((phase - 0x40) & 0xffff) < 0x80 ? sub - 1 : sub + 1;
        phase = (phase + 5) & 0xff;
      };
      sprite.callback = step;
      step();
    },
  },

  /** AnimPetalDanceSmallFlower. */
  gPetalDanceSmallFlowerSpriteTemplate: {
    tag: "ANIM_TAG_FLOWER",
    width: 8,
    height: 8,
    anims: [[F(4, 1), END]],
    init(sprite, run, args, done) {
      placeAtAttacker(sprite, run, args);
      const line = travel(sprite, args[3], sprite.x, run.center(AnimBattler.Attacker)[1] + args[2]);
      let phase = 0x40;
      const step = () => {
        if (line.next().done) return done();
        sprite.x2 += sin(phase, 8);
        if (((phase - 59) & 0xffff) < 5 || ((phase - 187) & 0xffff) < 5) sprite.hFlip = !sprite.hFlip;
        phase = (phase + 5) & 0xff;
      };
      sprite.callback = step;
      step();
    },
  },

  /** AnimRazorLeafParticle: rises at (args[0], args[1]) for args[2] frames, then falls swaying. */
  gRazorLeafParticleSpriteTemplate: {
    tag: "ANIM_TAG_LEAF",
    width: 16,
    height: 16,
    anims: LEAF_ANIMS,
    init(sprite, run, args, done) {
      [sprite.x, sprite.y] = run.center(AnimBattler.Attacker);
      runSprite(
        sprite,
        (function* () {
          yield;
          for (let left = args[2]; left > 0; left--) {
            sprite.x += args[0];
            sprite.y += args[1];
            yield;
          }
          let [phase, n] = [args[1] & 1 ? 0x80 : 0, 0];
          yield;
          for (;;) {
            sprite.x2 = run.attacker.foe ? -sin(phase, 25) : sin(phase, 25);
            phase = (phase + 2) & 0xff;
            if (!(++n & 1)) sprite.y2++;
            if (n > 80) return;
            yield;
          }
        })(),
        done,
      );
    },
  },

  gTwisterLeafSpriteTemplate: { tag: "ANIM_TAG_LEAF", width: 16, height: 16, anims: LEAF_ANIMS, init: twister },
  gRazorLeafCutterSpriteTemplate: { tag: "ANIM_TAG_RAZOR_LEAF", width: 32, height: 16, anims: [[F(0, 3), F(0, 3, "h"), F(0, 3, "hv"), F(0, 3, "v"), J(0)]], init: singleSineWave },
  gSwiftStarSpriteTemplate: { tag: "ANIM_TAG_YELLOW_STAR", width: 32, height: 32, affineNormal: true, affineAnims: [[A(0, 0, 0, 1), J(0)]], init: singleSineWave },

  /** AnimConstrictBinding: squeezes args[3] times once a task sets the last arg (-1). */
  gConstrictBindingSpriteTemplate: {
    tag: "ANIM_TAG_TENDRILS",
    width: 64,
    height: 32,
    affineNormal: true,
    anims: [[F(0, 4), F(32, 4), F(64, 4), F(96, 4), END], [F(0, 4, "h"), F(32, 4, "h"), F(64, 4, "h"), F(96, 4, "h"), END]],
    affineAnims: [
      [A(0x100, 0x100, 0, 0), A(-11, 0, 0, 6), A(11, 0, 0, 6), END],
      [A(-0x100, 0x100, 0, 0), A(11, 0, 0, 6), A(-11, 0, 0, 6), END],
    ],
    init(sprite, run, args, done) {
      placeAtTarget(sprite, run, args, false);
      sprite.startAffineAnim(args[2]);
      sprite.affineAnimPaused = true;
      let left = args[3];
      let started = false;
      sprite.callback = () => {
        if (!started) {
          if ((run.args[7] & 0xffff) !== 0xffff) return;
          sprite.affineAnimPaused = false;
          started = true;
          return;
        }
        if (!sprite.affineEnded) return;
        if (--left > 0) sprite.startAffineAnim(args[2]);
        else done();
      };
    },
  },

  /** AnimPresent: the bag falls on the target, bouncing. */
  gPresentSpriteTemplate: {
    tag: "ANIM_TAG_ITEM_BAG",
    width: 32,
    height: 32,
    affineNormal: true,
    anims: [[F(0, 30), END]],
    affineAnims: FALLING_BAG_AFFINE,
    init(sprite, run, args, done) {
      placeAtAttacker(sprite, run, args, false);
      const [x, y] = battlerCoords(run, AnimBattler.Target);
      runSprite(sprite, itemFall(sprite, x, y + 10, 60, 3), done);
    },
  },

  /** AnimPresentHealParticle: rises from the target's spot, args[2] a frame. */
  gPresentHealParticleSpriteTemplate: {
    tag: "ANIM_TAG_GREEN_SPARKLE",
    width: 16,
    height: 16,
    anims: [[F(0, 4), F(4, 4), F(8, 4), F(12, 4), END]],
    init(sprite, run, args, done) {
      placeAtTarget(sprite, run, args, false);
      let n = 0;
      const step = () => {
        n++;
        sprite.y2 = args[2] * n;
        if (sprite.animEnded) done();
      };
      sprite.callback = step;
      step();
    },
  },

  /** AnimTrickBag: falls in a ring around the middle of the screen, circles and flickers away. */
  gTrickBagSpriteTemplate: {
    tag: "ANIM_TAG_ITEM_BAG",
    width: 32,
    height: 32,
    affineNormal: true,
    anims: [[F(0, 30), END]],
    affineAnims: [
      [A(0, 0, 0, 3), END],
      [A(0, -10, 0, 3), A(0, -6, 0, 3), A(0, -2, 0, 3), A(0, 0, 0, 3), A(0, 2, 0, 3), A(0, 6, 0, 3), A(0, 10, 0, 3), END],
      ...FALLING_BAG_AFFINE,
    ],
    init(sprite, _run, args, done) {
      sprite.x = 120;
      sprite.y = args[0];
      let angle = args[1];
      const place = () => {
        sprite.x2 = cos(angle, 60);
        sprite.y2 = sin(angle, 20);
        sprite.subpriority = ((angle - 1) & 0xffff) < 191 ? 31 : 29;
      };
      place();
      sprite.subpriority = angle > 0 && angle < 192 ? 31 : 29;
      runSprite(
        sprite,
        (function* () {
          yield;
          let [y, speed] = [args[0], 20];
          while (y <= 78) {
            y += Math.trunc(speed / 10);
            speed += 3;
            sprite.y = y;
            yield;
          }
          sprite.startAffineAnim(1);
          yield;
          while (!sprite.affineEnded) yield;
          for (const [step, frames, dir] of TRICK_PATH) {
            if (dir === 127) break;
            for (let n = 0; n < frames; n++) {
              angle = (step * dir + angle) & 0xff;
              place();
              yield;
            }
            yield;
          }
          for (let n = 0; n <= 20; n++) {
            sprite.invisible = !!(n % 2);
            yield;
          }
        })(),
        done,
      );
    },
  },

  gSilverWindBigSparkSpriteTemplate: { ...SPARK_6, affineAnims: [[A(256, 256, 0, 0), A(0, 0, -10, 1), J(1)]], init: flyingParticle },
  gSilverWindMediumSparkSpriteTemplate: { ...SPARK_6, affineAnims: [[A(192, 192, 0, 0), A(0, 0, -12, 1), J(1)]], init: flyingParticle },
  gSilverWindSmallSparkSpriteTemplate: { ...SPARK_6, affineAnims: [[A(143, 143, 0, 0), A(0, 0, -15, 1), J(1)]], init: flyingParticle },

  /** AnimNeedleArmSpike: straight at or from a battler (args[1]), turned to where it goes. */
  gNeedleArmSpikeSpriteTemplate: {
    tag: "ANIM_TAG_GREEN_SPIKE",
    width: 16,
    height: 16,
    affineNormal: true,
    init(sprite, run, args, done) {
      if (args[4] === 0) return done();
      const [a, b] = run.center(args[0] === 0 ? AnimBattler.Attacker : AnimBattler.Target);
      const [toX, toY] = args[1] === 0 ? [a, b] : [args[2] + a, args[3] + b];
      [sprite.x, sprite.y] = args[1] === 0 ? [args[2] + a, args[3] + b] : [a, b];
      let [x, y, left] = [sprite.x * 16, sprite.y * 16, args[4]];
      const stepX = Math.trunc(((toX - sprite.x) * 16) / args[4]);
      const stepY = Math.trunc(((toY - sprite.y) * 16) / args[4]);
      rotScale(sprite, 0x100, 0x100, arcTan2Neg(toX - sprite.x, toY - sprite.y));
      sprite.callback = () => {
        if (!left) return done();
        x += stepX;
        y += stepY;
        sprite.x = x >> 4;
        sprite.y = y >> 4;
        left--;
      };
    },
  },

  gSlamHitSpriteTemplate: { tag: "ANIM_TAG_SLAM_HIT", width: 32, height: 32, anims: WHIP, init: whipHit },
  gVineWhipSpriteTemplate: { tag: "ANIM_TAG_WHIP_HIT", width: 32, height: 32, anims: WHIP, init: whipHit },

  /** AnimProtect: drifts on the attacker's spot, its colors turning, fading in, held args[2], out. */
  gProtectSpriteTemplate: {
    tag: "ANIM_TAG_PROTECT",
    width: 64,
    height: 64,
    blend: true,
    init(sprite, run, args, done) {
      const [x, y] = battlerCoords(run, AnimBattler.Attacker);
      sprite.x = x + args[0];
      sprite.y = y + args[1];
      const base = run.attacker.sprite?.priority ?? 2;
      sprite.priority = run.attacker.foe ? base : base + 1;
      const { palettes, video } = run.flow.gba;
      const offset = 256 + (palettes.spritePaletteSlot("ANIM_TAG_PROTECT") & 15) * 16;
      let [level, left, turn, wait, drift] = [16, args[2], 0, 0, 0];
      monBlend(run, 16 - level, level);
      sprite.callback = () => {
        drift += 96;
        sprite.x2 = -(drift >> 8);
        if (++turn > 1) {
          turn = 0;
          const first = palettes.faded[offset + 1];
          for (let i = 1; i <= 6; i++) palettes.faded[offset + i] = palettes.faded[offset + i + 1];
          palettes.faded[offset + 7] = first;
        }
        if (level > 6 && left > 0 && ++wait > 1) {
          wait = 0;
          level--;
          monBlend(run, 16 - level, level);
        }
        if (left > 0) left--;
        else if (++wait > 1) {
          wait = 0;
          level++;
          monBlend(run, 16 - level, level);
          if (level === 16) {
            sprite.invisible = true;
            video.resetBlend();
            done();
          }
        }
      };
    },
  },

  /** AnimSparklingStars: drifts from a battler (args[2]) at (args[3], args[4]) 8.8 for args[5]. */
  gSparklingStarsSpriteTemplate: {
    tag: "ANIM_TAG_SPARKLE_2",
    width: 32,
    height: 32,
    anims: [[F(0, 7), F(16, 7), F(32, 7), F(48, 7), F(64, 7), F(80, 7), F(96, 7), F(112, 7), J(0)]],
    init(sprite, run, args, done) {
      const which = args[2] ? AnimBattler.Target : AnimBattler.Attacker;
      [sprite.x, sprite.y] = args[6] ? run.center(which) : battlerCoords(run, which);
      sprite.y += args[1];
      sprite.x += sideX(run, args[0]);
      runSprite(
        sprite,
        (function* () {
          yield;
          yield* slideAt(sprite, args[5], args[3], args[4]);
        })(),
        done,
      );
    },
  },

  /** AnimSlashSlice: on a battler, then flickers. */
  gSlashSliceSpriteTemplate: {
    tag: "ANIM_TAG_SLASH",
    width: 32,
    height: 32,
    anims: [[F(0, 4), F(16, 4), F(32, 4), F(48, 4), END], [F(48, 4), END]],
    init(sprite, run, args, done) {
      const [x, y] = run.center(args[0] === 0 ? AnimBattler.Attacker : AnimBattler.Target);
      sprite.x = x + args[1];
      sprite.y = y + args[2];
      runSprite(
        sprite,
        (function* () {
          yield;
          while (!sprite.animEnded) yield;
          yield* sliceFlicker(sprite);
        })(),
        done,
      );
    },
  },

  /** AnimSharpenSphere: above the attacker, blinking slower and slower, with its sound. */
  gSharpenSphereSpriteTemplate: {
    tag: "ANIM_TAG_SPHERE_TO_CUBE",
    width: 32,
    height: 32,
    anims: [[F(0, 18), F(0, 6), F(16, 18), F(0, 6), F(16, 6), F(32, 18), F(16, 6), F(32, 6), F(48, 18), F(32, 6), F(48, 6), F(64, 18), F(48, 6), F(64, 54), END]],
    init(sprite, run, _args, done) {
      [sprite.x, sprite.y] = run.center(AnimBattler.Attacker);
      sprite.y -= 12;
      const pan = run.pan(-64);
      let [wait, every, n, blinks] = [0, 2, 0, 0];
      sprite.callback = () => {
        if (++wait >= every) {
          sprite.invisible = !sprite.invisible;
          if (!sprite.invisible && !(++blinks & 1)) run.play("se_m_swagger2" as SoundId, pan);
          wait = 0;
          if (++n > 1) {
            n = 0;
            every++;
          }
        }
        if (sprite.animEnded && every > 16 && sprite.invisible) done();
      };
    },
  },

  /** AnimSuperFang. */
  gSuperFangSpriteTemplate: {
    tag: "ANIM_TAG_FANG_ATTACK",
    width: 32,
    height: 32,
    anims: [[F(0, 2), F(16, 2), F(32, 2), F(48, 2), END]],
    init(sprite, _run, _args, done) {
      goneAtAnimEnd(sprite, done);
    },
  },

  /** AnimWavyMusicNotes: from the attacker to the target and on, waving, colored by args[1]. */
  gWavyMusicNotesSpriteTemplate: {
    tag: "ANIM_TAG_MUSIC_NOTES",
    width: 16,
    height: 16,
    affine: true,
    anims: MUSIC_NOTES_ANIMS,
    affineAnims: [[A(0xc, 0xc, 0, 16), A(-12, -12, 0, 16), J(0)]],
    init(sprite, run, args, done) {
      [sprite.x, sprite.y] = run.center(AnimBattler.Attacker);
      sprite.startAnim(args[0]);
      notePalette(run, sprite, args[1]);
      let [color, timer, n] = [args[1], 0, 0];
      const [tx, ty] = run.center(AnimBattler.Target);
      const dx = (tx - sprite.x) * 256;
      const time = Math.trunc(dx / (dx < 0 ? -40 : 40)) || 1;
      const vx = Math.trunc(dx / time);
      const vy = Math.trunc(((ty - sprite.y) * 256) / time);
      let [x, y] = [sprite.x << 4, sprite.y << 4];
      sprite.callback = () => {
        n++;
        x += vx;
        y += vy;
        sprite.x = x >> 4;
        sprite.y = y >> 4;
        sprite.y2 = sin((n * 5) & 0xff, 15);
        if (sprite.x < -16 || sprite.x > 256 || sprite.y < -16 || sprite.y > 128) return done();
        if (args[2] && ++timer > args[2]) {
          timer = 0;
          if (++color > 3) color = 0;
          notePalette(run, sprite, color);
        }
      };
    },
  },

  /** AnimSlowFlyingMusicNotes: up and to a side from the attacker, waving. */
  gSlowFlyingMusicNotesSpriteTemplate: {
    tag: "ANIM_TAG_MUSIC_NOTES",
    width: 16,
    height: 16,
    affine: true,
    anims: MUSIC_NOTES_ANIMS,
    affineAnims: [[A(0xa0, 0xa0, 0, 0), A(4, 4, 0, 1), J(1)]],
    init(sprite, run, args, done) {
      [sprite.x, sprite.y] = run.center(AnimBattler.Attacker);
      sprite.y += 8;
      sprite.startAnim(args[1]);
      notePalette(run, sprite, args[2]);
      const line = travel(sprite, 40, sprite.x + (args[0] === 0 ? -32 : 32), sprite.y - 40);
      let phase = args[3];
      sprite.callback = () => {
        if (line.next().done) return done();
        const x = sin(phase, 8);
        sprite.x2 += sprite.x2 < 0 ? -x : x;
        sprite.y2 += sin(phase, 4);
        phase = (phase + 8) & 0xff;
      };
    },
  },

  /** AnimThoughtBubble. */
  gThoughtBubbleSpriteTemplate: {
    tag: "ANIM_TAG_THOUGHT_BUBBLE",
    width: 32,
    height: 32,
    anims: THOUGHT_ANIMS,
    init(sprite, run, args, done) {
      const which = args[0] === 0 ? AnimBattler.Attacker : AnimBattler.Target;
      nextToHead(run, sprite, which);
      const anim = run.mon(which).foe ? 1 : 0;
      sprite.startAnim(anim);
      runSprite(
        sprite,
        (function* () {
          yield;
          while (!sprite.animEnded) yield;
          for (let left = args[1]; left > 1; left--) yield;
          sprite.startAnim(anim + 2);
          yield;
          while (!sprite.animEnded) yield;
        })(),
        done,
      );
    },
  },

  /** AnimTauntFinger: by the head, wags after 10 frames. */
  gTauntFingerSpriteTemplate: {
    tag: "ANIM_TAG_FINGER_2",
    width: 32,
    height: 32,
    anims: [
      [F(0, 1), END],
      [F(0, 1, "h"), END],
      [F(0, 4), F(16, 4), F(32, 4), F(16, 4), F(0, 4), F(16, 4), F(32, 4), END],
      [F(0, 4, "h"), F(16, 4, "h"), F(32, 4, "h"), F(16, 4, "h"), F(0, 4, "h"), F(16, 4, "h"), F(32, 4, "h"), END],
    ],
    init(sprite, run, args, done) {
      const which = args[0] === 0 ? AnimBattler.Attacker : AnimBattler.Target;
      nextToHead(run, sprite, which);
      const foe = run.mon(which).foe;
      sprite.startAnim(foe ? 1 : 0);
      runSprite(
        sprite,
        (function* () {
          for (let n = 0; n <= 10; n++) yield;
          sprite.startAnim(foe ? 3 : 2);
          yield;
          while (!sprite.animEnded) yield;
          for (let n = 0; n <= 5; n++) yield;
        })(),
        done,
      );
    },
  },
  gOctazookaBallSpriteTemplate: { tag: "ANIM_TAG_BLACK_BALL", width: 8, height: 8, init: toTargetLocation },
  gOctazookaSmokeSpriteTemplate: { tag: "ANIM_TAG_GRAY_SMOKE", width: 32, height: 32, anims: [[F(0, 3), F(16, 3), F(32, 3), F(48, 3), F(64, 3), END]], init: spriteOnMon },
  gAromatherapySmallFlowerSpriteTemplate: { ...FLOWER, width: 8, height: 8, anims: [[F(4, 1), END]], init: flyingParticle },
  gAromatherapyBigFlowerSpriteTemplate: { ...FLOWER, width: 16, height: 16, affineNormal: true, anims: [[F(0, 1), END]], affineAnims: [[A(256, 256, 0, 0), A(0, 0, 4, 1), J(1)]], init: flyingParticle },

  /** AnimHyperBeamOrb: from just ahead of the attacker to the target at a random speed, waving. */
  gHyperBeamOrbSpriteTemplate: {
    tag: "ANIM_TAG_ORBS",
    width: 8,
    height: 8,
    anims: [0, 1, 2, 3, 4, 5, 6].map((image) => [F(image, 1), END]),
    init(sprite, run, _args, done) {
      sprite.startAnim(random(7));
      [sprite.x, sprite.y] = run.center(AnimBattler.Attacker);
      sprite.x += flip(run, 20);
      const [tx, ty] = run.center(AnimBattler.Target);
      const line = travel(sprite, fastSteps(tx - sprite.x, random(32) + 64), tx, ty);
      const sub = sprite.subpriority;
      let phase = random(256);
      const step = () => {
        if (line.next().done) return done();
        sprite.y2 += cos(phase, 12);
        sprite.subpriority = phase < 0x7f ? sub : sub + 1;
        phase = (phase + 24) & 0xff;
      };
      sprite.callback = step;
      step();
    },
  },

  /** AnimLeechSeed: arcs to the target's spot, hides 10 frames, sprouts for 60. */
  gLeechSeedSpriteTemplate: {
    tag: "ANIM_TAG_SEED",
    width: 16,
    height: 16,
    anims: [[F(0, 1), END], [F(4, 7), F(8, 7), J(0)]],
    init(sprite, run, args, done) {
      placeAtAttacker(sprite, run, args);
      const [x, y] = battlerCoords(run, AnimBattler.Target);
      runSprite(
        sprite,
        (function* () {
          yield;
          yield* arc(sprite, args[4], x + flip(run, args[2]), y + args[3], args[5]);
          sprite.invisible = true;
          for (let n = 0; n <= 10; n++) yield;
          sprite.invisible = false;
          sprite.startAnim(1);
          for (let n = 0; n <= 60; n++) yield;
        })(),
        done,
      );
    },
  },

  /** AnimMimicOrb: grows on the target's spot, flies to the attacker in 25 frames. */
  gMimicOrbSpriteTemplate: {
    tag: "ANIM_TAG_ORBS",
    width: 16,
    height: 16,
    affine: true,
    anims: [[F(8, 1), END]],
    affineAnims: [[A(0, 0, 0, 0), A(48, 48, 0, 14), END], [A(-16, -16, 0, 1), J(0)]],
    init(sprite, run, args, done) {
      const [x, y] = battlerCoords(run, AnimBattler.Target);
      sprite.x = x + (run.target.foe ? args[0] : -args[0]);
      sprite.y = y + args[1];
      sprite.invisible = true;
      runSprite(
        sprite,
        (function* () {
          yield;
          sprite.invisible = false;
          while (!sprite.affineEnded) yield;
          sprite.startAffineAnim(1);
          const [ax, ay] = run.center(AnimBattler.Attacker);
          yield* travel(sprite, 25, ax, ay);
        })(),
        done,
      );
    },
  },

  /** AnimIngrainRoot. */
  gIngrainRootSpriteTemplate: {
    tag: "ANIM_TAG_ROOTS",
    width: 32,
    height: 32,
    anims: ROOT_ANIMS,
    init(sprite, run, args, done) {
      sprite.x = run.center(AnimBattler.Attacker)[0];
      sprite.y = battlerCoords(run, AnimBattler.Attacker)[1];
      sprite.x2 = args[0];
      sprite.y2 = args[1];
      sprite.subpriority = args[2] + 30;
      sprite.startAnim(args[3]);
      if (sprite.y + sprite.y2 > 120) sprite.y += sprite.y2 + sprite.y - 120;
      rootFlicker(sprite, args[4], done);
    },
  },

  /** AnimFrenzyPlantRoot: at args[0]% of the way from the attacker to the target. */
  gFrenzyPlantRootSpriteTemplate: {
    tag: "ANIM_TAG_ROOTS",
    width: 32,
    height: 32,
    anims: ROOT_ANIMS,
    init(sprite, run, args, done) {
      const [ax, ay] = run.center(AnimBattler.Attacker);
      const [tx, ty] = run.center(AnimBattler.Target);
      sprite.x = ax + Math.trunc(((tx - ax) * args[0]) / 100);
      sprite.y = ay + Math.trunc(((ty - ay) * args[0]) / 100);
      sprite.x2 = args[1];
      sprite.y2 = args[2];
      sprite.subpriority = args[3] + 30;
      sprite.startAnim(args[4]);
      rootFlicker(sprite, args[5], done);
    },
  },

  /** AnimIngrainOrb. */
  gIngrainOrbSpriteTemplate: {
    tag: "ANIM_TAG_ORBS",
    width: 8,
    height: 8,
    anims: [[F(3, 3), F(0, 5), J(0)]],
    init(sprite, run, args, done) {
      sprite.x = run.center(AnimBattler.Attacker)[0] + args[0];
      sprite.y = battlerCoords(run, AnimBattler.Attacker)[1] + args[1];
      let n = 0;
      const step = () => {
        n++;
        sprite.x2 = args[2] * n;
        sprite.y2 = sin((n * 20) & 0xff, args[3]);
        if (n > args[4]) done();
      };
      sprite.callback = step;
      step();
    },
  },

  /** AnimAirCutterSlice: a curved slice on the target's spot. */
  gAirCutterSliceSpriteTemplate: {
    tag: "ANIM_TAG_CUT",
    width: 32,
    height: 32,
    blend: true,
    anims: [[F(0, 5), F(16, 5), F(32, 5), F(48, 5), END]],
    init(sprite, run, args, done) {
      [sprite.x, sprite.y] = battlerCoords(run, AnimBattler.Target);
      if (!run.target.foe) sprite.y += 8;
      if (args[2] === 0) sprite.x += args[0];
      else {
        sprite.x -= args[0];
        sprite.hFlip = true;
      }
      sprite.y += args[1];
      const reverse = args[2] === 1;
      let [vx, vy, x, y, n] = [reverse ? 0x400 : -0x400, 0x400, 0, 0, 0];
      sprite.callback = () => {
        x += vx;
        y += vy;
        vx += reverse ? -0x18 : 0x18;
        vy -= 0x18;
        sprite.x2 = x >> 8;
        sprite.y2 = y >> 8;
        if (++n >= 24) done();
      };
    },
  },

  /** AnimMilkBottle: fades in over the target, tilts and sinks, fades out. */
  gMilkBottleSpriteTemplate: {
    tag: "ANIM_TAG_MILK_BOTTLE",
    width: 32,
    height: 32,
    affineNormal: true,
    blend: true,
    affineAnims: [[A(0x100, 0x100, 0, 0), END], [A(0, 0, 2, 12), A(0, 0, 0, 6), A(0, 0, -2, 24), A(0, 0, 0, 6), A(0, 0, 2, 12), J(0)]],
    init(sprite, run, _args, done) {
      [sprite.x, sprite.y] = run.center(AnimBattler.Target);
      sprite.y -= 24;
      let [a, b] = [0, 16];
      monBlend(run, a, b);
      runSprite(
        sprite,
        (function* () {
          let n = 0;
          yield;
          while (a !== 16 || b !== 0) {
            if (++n & 1) {
              if (a <= 15) a++;
            } else if (b > 0) b--;
            monBlend(run, a, b);
            yield;
          }
          for (let wait = 0; wait <= 8; wait++) yield;
          sprite.startAffineAnim(1);
          let [t, sink, count, sway] = [0, 0, 0, 0];
          for (;;) {
            yield;
            if (t <= 11) sway += 2;
            if (((t - 0x12) & 0xffff) <= 0x17) sway -= 2;
            if (t > 0x2f) sway += 2;
            sprite.x2 = Math.trunc(sway / 9);
            sprite.y2 = Math.abs(Math.trunc(sway / 14));
            if (++t > 0x3b) t = 0;
            if (++sink > 2) {
              sink = 0;
              sprite.y++;
            }
            if (++count <= 29) continue;
            if (count & 1) {
              if (a > 0) a--;
            } else if (b <= 15) b++;
            monBlend(run, a, b);
            if (a === 0 && b === 16) break;
          }
          yield;
          sprite.invisible = true;
          yield;
          run.flow.gba.video.resetBlend();
        })(),
        done,
      );
    },
  },

  gLockOnTargetSpriteTemplate: {
    tag: "ANIM_TAG_LOCK_ON",
    width: 32,
    height: 32,
    init(sprite, run, _args, done) {
      lockOn(sprite, run, 0, done);
    },
  },

  /** AnimLockOnMoveTarget: a corner of the sight, args[0] 1-4. */
  gLockOnMoveTargetSpriteTemplate: {
    tag: "ANIM_TAG_LOCK_ON",
    width: 16,
    height: 16,
    init(sprite, run, args, done) {
      const corner = args[0];
      sprite.x += corner === 1 || corner === 2 ? -0x18 : 0x18;
      sprite.y += corner === 1 || corner === 3 ? -0x18 : 0x18;
      sprite.vFlip = corner !== 1 && corner !== 3;
      sprite.hFlip = corner !== 1 && corner !== 2;
      sprite.tileNum += 16;
      lockOn(sprite, run, corner, done);
    },
  },

  /** AnimFalseSwipeSlice: left of the target, its animation, slides right, flickers. */
  gFalseSwipeSliceSpriteTemplate: {
    ...SLICE_2,
    init(sprite, run, _args, done) {
      [sprite.x, sprite.y] = run.center(AnimBattler.Target);
      sprite.x -= 48;
      runSprite(
        sprite,
        (function* () {
          yield;
          while (!sprite.animEnded) yield;
          for (let n = 0; n <= 8; n++) yield;
          yield* pixelLine(sprite, 12, 8, 0);
          yield* sliceFlicker(sprite);
        })(),
        done,
      );
    },
  },

  /** AnimFalseSwipePositionedSlice. */
  gFalseSwipePositionedSliceSpriteTemplate: {
    ...SLICE_2,
    init(sprite, run, args, done) {
      [sprite.x, sprite.y] = run.center(AnimBattler.Target);
      sprite.x += -48 + args[0];
      sprite.startAnim(1);
      runSprite(sprite, sliceFlicker(sprite), done);
    },
  },

  /** AnimConversion: stays on the attacker's spot until the last arg is -1. */
  gConversionSpriteTemplate: {
    tag: "ANIM_TAG_CONVERSION",
    width: 8,
    height: 8,
    affine: true,
    blend: true,
    anims: [[F(3, 5), F(2, 5), F(1, 5), F(0, 5), END]],
    affineAnims: CONVERSION_AFFINE,
    init(sprite, run, args, done) {
      const [x, y] = battlerCoords(run, AnimBattler.Attacker);
      sprite.x = x + args[0];
      sprite.y = y + args[1];
      const step = () => {
        if ((run.args[7] & 0xffff) === 0xffff) done();
      };
      sprite.callback = step;
    },
  },

  /** AnimConversion2: on the target's spot, flies to the attacker after args[2]. */
  gConversion2SpriteTemplate: {
    tag: "ANIM_TAG_CONVERSION",
    width: 8,
    height: 8,
    affine: true,
    blend: true,
    anims: [[F(0, 5), F(1, 5), F(2, 5), F(3, 5), END]],
    affineAnims: CONVERSION_AFFINE,
    init(sprite, run, args, done) {
      placeAtTarget(sprite, run, args, false);
      sprite.animPaused = true;
      runSprite(
        sprite,
        (function* () {
          for (let n = 0; n <= args[2]; n++) yield;
          sprite.animPaused = false;
          const [x, y] = run.center(AnimBattler.Attacker);
          yield* travel(sprite, 30, x, y);
        })(),
        done,
      );
    },
  },

  /** AnimMoon: until the task ends it. */
  gMoonSpriteTemplate: {
    tag: "ANIM_TAG_MOON",
    width: 64,
    height: 64,
    blend: true,
    init(sprite, run, args, done) {
      sprite.x = args[0];
      sprite.y = args[1];
      sprite.callback = () => {
        if (moonGone.has(run)) done();
      };
    },
  },

  /** AnimMoonlightSparkle: falls on the attacker's column until the task ends it. */
  gMoonlightSparkleSpriteTemplate: {
    tag: "ANIM_TAG_GREEN_SPARKLE",
    width: 16,
    height: 16,
    anims: [[F(0, 8), F(4, 8), F(8, 8), F(12, 8), J(0)]],
    init(sprite, run, args, done) {
      sprite.x = run.center(AnimBattler.Attacker)[0] + args[0];
      sprite.y = args[1];
      let [wait, n] = [0, 0];
      sprite.callback = () => {
        if (++wait > 1) {
          wait = 0;
          if (n < 120) {
            sprite.y++;
            n++;
          }
        }
        if (moonGone.has(run)) done();
      };
    },
  },

  /** AnimFlyingMusicNotes: out from the attacker with one loop. */
  gFastFlyingMusicNotesSpriteTemplate: {
    tag: "ANIM_TAG_MUSIC_NOTES",
    width: 16,
    height: 16,
    affine: true,
    anims: MUSIC_NOTES_ANIMS,
    affineAnims: [[A(0xc, 0xc, 0, 16), A(-12, -12, 0, 16), J(0)]],
    init(sprite, run, args, done) {
      const dx = run.attacker.foe ? -args[1] : args[1];
      const [ax, ay] = run.center(AnimBattler.Attacker);
      sprite.x = ax + dx;
      sprite.y = ay + args[2];
      sprite.startAnim(args[0]);
      const stepX = Math.trunc((dx << 4) / 5);
      const stepY = Math.trunc((args[2] << 7) / 5);
      let [x, y, n, wave, looped] = [sprite.x << 4, sprite.y << 4, 0, 0, false];
      sprite.callback = () => {
        x += stepX;
        y += stepY;
        sprite.x = x >> 4;
        sprite.y = y >> 4;
        if (n > 5 && !looped) {
          wave = (wave + 16) & 0xff;
          sprite.x2 = cos(wave, 18);
          sprite.y2 = sin(wave, 18);
          if (wave === 0) looped = true;
        }
        if (++n === 48) done();
      };
    },
  },

  /** AnimBellyDrumHand: 8 frames at a side of the attacker. */
  gBellyDrumHandSpriteTemplate: {
    tag: "ANIM_TAG_PURPLE_HAND_OUTLINE",
    width: 32,
    height: 32,
    init(sprite, run, args, done) {
      sprite.hFlip = args[0] === 1;
      const [x, y] = run.center(AnimBattler.Attacker);
      sprite.x = x + (args[0] === 1 ? 16 : -16);
      sprite.y = y + 8;
      let left = 8;
      sprite.callback = () => {
        if (left-- <= 0) done();
      };
    },
  },

  /** AnimMetronomeFinger. */
  gMetronomeFingerSpriteTemplate: {
    tag: "ANIM_TAG_FINGER",
    width: 32,
    height: 32,
    affine: true,
    affineAnims: FINGER_AFFINE,
    init(sprite, run, args, done) {
      nextToHead(run, sprite, args[0] === 0 ? AnimBattler.Attacker : AnimBattler.Target);
      runSprite(
        sprite,
        (function* () {
          yield;
          while (!sprite.affineEnded) yield;
          yield* fingerEnd(sprite);
        })(),
        done,
      );
    },
  },

  /** AnimFollowMeFinger: on top of the battler, swings once, then ends like Metronome's. */
  gFollowMeFingerSpriteTemplate: {
    tag: "ANIM_TAG_FINGER",
    width: 32,
    height: 32,
    affineNormal: true,
    affineAnims: FINGER_AFFINE,
    init(sprite, run, args, done) {
      const which = args[0] === 0 ? AnimBattler.Attacker : AnimBattler.Target;
      sprite.x = battlerCoords(run, which)[0];
      sprite.y = Math.max(run.center(which)[1] - PIC_HALF, 10);
      const [near, far] = [sprite.subpriority, sprite.subpriority + 4];
      runSprite(
        sprite,
        (function* () {
          yield;
          while (!sprite.affineEnded) yield;
          for (let n = 0; n <= 12; n++) yield;
          let angle = 0;
          for (;;) {
            angle += 4;
            if (angle > 254) break;
            if (angle > 0x4f) sprite.subpriority = far;
            if (angle > 0x9f) sprite.subpriority = near;
            const wave = SIN[angle];
            sprite.x2 = (wave >> 3) + (wave >> 4);
            yield;
          }
          sprite.x2 = 0;
          yield* fingerEnd(sprite);
        })(),
        done,
      );
    },
  },
};

export const EFFECTS_1_TASK_SOUNDS: Record<string, readonly string[]> = { gSharpenSphereSpriteTemplate: ["se_m_swagger2"], gLockOnTargetSpriteTemplate: ["se_m_lock_on", "se_m_leer"], gLockOnMoveTargetSpriteTemplate: ["se_m_lock_on"] };

export const EFFECTS_1_TASKS: Record<string, AnimTask> = {
  /** AnimTask_CycleMagicalLeafPal: the leaves run through the colors until the last arg is -1. */
  *AnimTask_CycleMagicalLeafPal(run) {
    const { palettes } = run.flow.gba;
    const offset = (tag: string) => 256 + (palettes.spritePaletteSlot(tag) & 15) * 16;
    const [leaf, razor] = [offset("ANIM_TAG_LEAF"), offset("ANIM_TAG_RAZOR_LEAF")];
    let [level, color] = [0, 0];
    yield;
    while (run.args[7] !== -1) {
      yield;
      palettes.blendPalette(leaf, 16, level, LEAF_COLORS[color]);
      palettes.blendPalette(razor, 16, level, LEAF_COLORS[color]);
      if (++level === 17) {
        level = 0;
        if (++color === 7) color = 0;
      }
    }
  },

  *AnimTask_MusicNotesRainbowBlend(run) {
    loadNotePalettes(run);
  },

  *AnimTask_MusicNotesClearRainbowBlend(run) {
    freeNotePalettes(run);
  },

  /** AnimTask_CreateSmallSolarBeamOrbs: 15 orbs, one every 7 frames, spiral to the target. */
  *AnimTask_CreateSmallSolarBeamOrbs(run) {
    const sub = (run.target.sprite?.subpriority ?? 2) + 1;
    for (let n = 0; n < 15; n++) {
      run.createSprite(
        {
          tag: "ANIM_TAG_ORBS",
          width: 8,
          height: 8,
          anims: [[F(7, 1), END]],
          init(sprite, _run, _args, done) {
            placeAtAttacker(sprite, run, [15, 0]);
            const [x, y] = run.center(AnimBattler.Target);
            const line = travel(sprite, 80, x, y);
            let phase = 0;
            const step = () => {
              if (line.next().done) return done();
              sprite.subpriority = phase > 0x7f ? sub : sub + 5;
              sprite.x2 += sin(phase, 5);
              sprite.y2 += cos(phase, 14);
              phase = (phase + 15) & 0xff;
            };
            sprite.callback = step;
            step();
          },
        },
        0,
        0,
        sub,
      );
      for (let wait = 0; wait < 7; wait++) yield;
    }
  },

  /** AnimTask_SporeDoubleBattle: a BG priority for doubles; nothing in singles. */
  *AnimTask_SporeDoubleBattle() {},

  /** AnimTask_ShrinkTargetCopy: the target shrinks away faintly until the last arg is -1. */
  *AnimTask_ShrinkTargetCopy(run, args) {
    const mon = monSprite(run, AnimBattler.Target);
    if (!mon || mon.invisible) return;
    mon.mode = ObjMode.Blend;
    mon.affineAnimPaused = true;
    let [x, scale] = [0, 0x100];
    for (let left = args[1]; left > 0; left--) {
      yield;
      x += args[0];
      mon.x2 = run.target.foe ? -(x >> 8) : x >> 8;
      scale += 16;
      mon.setRotScale(scale, scale, 0);
      mon.y2 = Math.trunc(32 - (32 * 256) / scale);
    }
    while ((run.args[7] & 0xffff) !== 0xffff) yield;
    resetMonScale(mon);
    mon.mode = ObjMode.Normal;
    mon.x2 = mon.y2 = 0;
    yield;
    yield;
  },

  /** AnimTask_LeafBlade: a leaf slashes around the target in six arcs, leaving a flickering trail. */
  *AnimTask_LeafBlade(run) {
    const [cx, cy] = run.center(AnimBattler.Target);
    const dir = run.target.foe ? 1 : -1;
    const [w, h] = [PIC_HALF + 10, PIC_HALF + 10];
    const startY = 56 - dir * 64;
    const startX = cy - startY + cx;
    let sub = (run.target.sprite?.subpriority ?? 2) - 1;
    let trails = 0;
    let animNum = 0;
    const template: AnimSpriteTemplate = { tag: "ANIM_TAG_LEAF", width: 16, height: 16, anims: LEAF_BLADE_ANIMS, init() {} };
    const leaf = run.createSprite(template, startX, startY, sub);
    if (!leaf) return;
    const trail = () => {
      const spot = run.createSprite(
        {
          ...template,
          init(sprite, _run, _args, done) {
            sprite.startAnim(animNum);
            let [wait, n] = [0, 0];
            sprite.callback = () => {
              if (++wait <= 1) return;
              wait = 0;
              sprite.invisible = !sprite.invisible;
              if (++n > 8) {
                trails--;
                done();
              }
            };
          },
        },
        leaf.x + leaf.x2,
        leaf.y + leaf.y2,
        sub,
      );
      if (spot) trails++;
    };
    const legs: [number, number, number, number][] = [
      [cx - w * dir, cy + h * dir, 0, 0],
      [cx, cy, 2, 1],
      [cx - w * dir, cy - h * dir, 0, 2],
      [cx + w * dir, cy + h * dir, -2, 3],
      [cx, cy, 2, 4],
      [cx - w * dir, cy + h * dir, 0, 5],
      [startX, startY, -2, 6],
    ];
    yield;
    for (let i = 0; i < legs.length; i++) {
      const [x, y, subBy, anim] = legs[i];
      if (i > 0) {
        for (let wait = 0; wait <= 5; wait++) yield;
        leaf.x += leaf.x2;
        leaf.y += leaf.y2;
        leaf.x2 = leaf.y2 = 0;
        sub += subBy;
        leaf.subpriority = sub;
        animNum = anim;
        leaf.startAnim(anim);
        yield;
      }
      const path = arc(leaf, 10, x, y, y < leaf.y ? -8 : 8);
      for (;;) {
        trail();
        if (path.next().done) break;
        yield;
      }
    }
    run.flow.gba.sprites.destroy(leaf);
    while (trails > 0) yield;
  },

  /** AnimTask_ConversionAlphaBlend: fades in, then tells the sprites to go. */
  *AnimTask_ConversionAlphaBlend(run) {
    for (let level = 1; level <= 16; level++) {
      for (let wait = 0; wait < 4; wait++) yield;
      monBlend(run, 16 - level, level);
    }
    yield;
    run.args[7] = -1;
    yield;
  },

  /** AnimTask_Conversion2AlphaBlend. */
  *AnimTask_Conversion2AlphaBlend(run) {
    for (let level = 1; level <= 16; level++) {
      for (let wait = 0; wait < 4; wait++) yield;
      monBlend(run, level, 16 - level);
    }
  },

  /** AnimTask_MoonlightEndFade: the background whitens by hand, everything else by a fade, then all back. */
  *AnimTask_MoonlightEndFade(run) {
    const { palettes } = run.flow.gba;
    const color = rgb(27, 29, 31);
    const bg = selectedPalettes(run, 1);
    const mons = paletteMask(run, monPalettes(run, true, true));
    const tagBit = (tag: string) => (1 << (16 + (palettes.spritePaletteSlot(tag) & 15))) >>> 0;
    palettes.beginFade((mons | tagBit("ANIM_TAG_MOON") | tagBit("ANIM_TAG_GREEN_SPARKLE")) >>> 0, 0, 0, 16, color);
    const paint = (value: number) => {
      for (let i = 0; i < 16; i++) if ((bg >> i) & 1) for (let j = 1; j <= 15; j++) palettes.faded[i * 16 + j] = value;
    };
    let [r, g, b] = [0, 0, 0];
    for (let n = 1; n <= 15; n++) {
      r += 13;
      g += 14;
      b += 15;
      paint(rgb(r >> 3, g >> 3, b >> 3));
      yield;
    }
    paint(color);
    yield;
    while (palettes.fadeActive) yield;
    moonGone.add(run);
    for (let n = 0; n <= 30; n++) yield;
    palettes.beginFade((bg | mons) >>> 0, 0, 16, 0, color);
    do yield;
    while (palettes.fadeActive);
  },

  /** AnimTask_DoubleTeam: two dark copies of the attacker sway out and back. */
  *AnimTask_DoubleTeam(run) {
    const mon = monSprite(run, AnimBattler.Attacker);
    if (!mon) return;
    const { palettes, sprites } = run.flow.gba;
    const own = 256 + mon.paletteNum * 16;
    const tag = "ANIM_TAG_BENT_SPOON";
    const slot = palettes.loadSpritePalette(tag, palettes.unfaded.slice(own, own + 16)) & 15;
    palettes.blendPalette(256 + slot * 16, 16, 11, 0);
    let active = 0;
    for (let i = 0; i < 2; i++) {
      const copy = cloneMon(run, mon);
      if (!copy) break;
      copy.paletteNum = slot;
      active++;
      let [n, wait, phase] = [0, 0, i << 7];
      copy.callback = () => {
        if (++wait > 1) {
          wait = 0;
          n++;
        }
        if (n > 64) {
          active--;
          sprites.destroy(copy);
          return;
        }
        phase = (phase + Math.trunc(SIN[n] / 13)) & 0xff;
        copy.x2 = sin(phase, Math.trunc(SIN[n] / 6));
      };
    }
    do yield;
    while (active > 0);
    palettes.freeSpritePalette(tag);
  },

  /** AnimTask_SkullBashPosition: args[0] 0 the attacker leans back and shakes; 1 it stands again. */
  *AnimTask_SkullBashPosition(run, args) {
    const mon = monSprite(run, AnimBattler.Attacker);
    if (!mon) return;
    const player = !run.attacker.foe;
    if (args[0] === 1) {
      mon.affineAnimPaused = true;
      let rotation = player ? -0x600 : 0x600;
      const step = player ? -0xc0 : 0xc0;
      for (let left = 8; left > 0; left--) {
        yield;
        rotation -= step;
        mon.setRotScale(0x100, 0x100, rotation);
      }
      yield;
      resetMonScale(mon);
    } else if (args[0] === 0) {
      let x = 0;
      for (let left = 8; left > 0; left--) {
        yield;
        x += player ? -3 : 3;
        mon.x2 = x;
      }
      yield;
      mon.affineAnimPaused = true;
      let rotation = 0;
      for (let left = 8; left > 0; left--) {
        yield;
        rotation += player ? -0xc0 : 0xc0;
        mon.setRotScale(0x100, 0x100, rotation);
      }
      yield;
      const base = mon.x2;
      const by = player ? 2 : -2;
      for (let left = 8; left > 0; left--) {
        yield;
        yield;
        mon.x2 = left & 1 ? base + by : base - by;
      }
      mon.x2 = base;
      for (let n = 0; n <= 12; n++) yield;
      x = base;
      for (let left = 3; left > 0; left--) {
        yield;
        x += player ? 8 : -8;
        mon.x2 = x;
      }
      yield;
    }
  },
};
