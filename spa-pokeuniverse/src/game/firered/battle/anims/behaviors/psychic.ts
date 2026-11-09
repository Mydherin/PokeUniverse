// Psychic (battle_anim_psychic.c): light walls, sparkles, orbs and stretches.

import { SIN } from "../../../../gba/trig";
import { ObjMode } from "../../../../gba/sprites";
import type { SoundId } from "../../../manifest";
import { AnimBattler, type AnimRun, type AnimSpriteTemplate, type AnimTask } from "../script";
import { monBlend } from "./dark";
import { monAffine } from "./effects";
import { A, arc, battlerCoords, cloneMon, END, F, flip, goneAtAnimEnd, J, L, monSprite, PIC_HALF, resetMonScale, runSprite, spriteOnMon, tagPaletteOffset, toTargetLocation } from "./util";

/** AnimDefensiveWall: at the attacker's spot; fades in, its colors turn 16 steps, fades out. */
const wall: AnimSpriteTemplate["init"] = (sprite, run, args, done) => {
  if (!run.attacker.foe) {
    sprite.priority = 2;
    sprite.subpriority = 200;
  }
  const [x, y] = battlerCoords(run, AnimBattler.Attacker);
  sprite.x = x + flip(run, args[0]);
  sprite.y = y + args[1];
  const base = tagPaletteOffset(run, args[2]);
  const { faded } = run.flow.gba.palettes;
  runSprite(
    sprite,
    (function* () {
      let level = 0;
      for (;;) {
        monBlend(run, level, 16 - level);
        if (level === 13) break;
        level++;
        yield;
      }
      yield;
      for (let turns = 0; turns < 16; turns++) {
        yield;
        const last = faded[base + 8];
        for (let i = 8; i > 0; i--) faded[base + i] = faded[base + i - 1];
        faded[base + 1] = last;
        if (turns < 15) yield;
      }
      yield;
      for (; level >= 0; level--) {
        monBlend(run, level, 16 - level);
        if (level > 0) yield;
      }
      sprite.invisible = true;
      yield;
      yield;
    })(),
    done,
  );
};

const WALL = { width: 64, height: 64, blend: true, init: wall } as const;
const CIRCLE = { width: 64, height: 64, blend: true } as const;

const SPOON = (flag: "h" | "") => [F(8, 60, flag), F(16, 5, flag), F(8, 5, flag), F(0, 5, flag), F(8, 22, flag), L(0), F(16, 5, flag), F(8, 5, flag), F(0, 5, flag), F(8, 5, flag), L(1), F(8, 22, flag), F(24, 3, flag), F(32, 3, flag), F(40, 22, flag), END];

export const PSYCHIC_TEMPLATES: Record<string, AnimSpriteTemplate> = {
  gPsychUpSpiralSpriteTemplate: { tag: "ANIM_TAG_SPIRAL", width: 64, height: 64, affineNormal: true, blend: true, affineAnims: [[A(0x100, 0x100, 0, 0), A(-2, -2, -10, 120), END]], init: spriteOnMon },
  gLightScreenWallSpriteTemplate: { tag: "ANIM_TAG_GREEN_LIGHT_WALL", ...WALL },
  gReflectWallSpriteTemplate: { tag: "ANIM_TAG_BLUE_LIGHT_WALL", ...WALL },
  gMirrorCoatWallSpriteTemplate: { tag: "ANIM_TAG_RED_LIGHT_WALL", ...WALL },
  gBarrierWallSpriteTemplate: { tag: "ANIM_TAG_GRAY_LIGHT_WALL", ...WALL },
  gMagicCoatWallSpriteTemplate: { tag: "ANIM_TAG_ORANGE_LIGHT_WALL", ...WALL },
  gReflectSparkleSpriteTemplate: { tag: "ANIM_TAG_SPARKLE_4", width: 32, height: 32, anims: [[F(0, 3), F(16, 3), F(32, 3), F(48, 3), F(64, 3), END]], init: spriteOnMon },
  gSpecialScreenSparkleSpriteTemplate: { tag: "ANIM_TAG_SPARKLE_3", width: 16, height: 16, anims: [[F(0, 5), F(4, 5), F(8, 5), F(12, 5), END]], init: spriteOnMon },
  gGoldRingSpriteTemplate: { tag: "ANIM_TAG_GOLD_RING", width: 16, height: 32, init: toTargetLocation },
  gLusterPurgeCircleSpriteTemplate: { tag: "ANIM_TAG_WHITE_CIRCLE_OF_LIGHT", ...CIRCLE, affine: true, affineAnims: [[A(0x20, 0x20, 0, 0), A(4, 4, 0, 120), END]], init: spriteOnMon },

  /** AnimBentSpoon: beside the attacker until its animation ends. */
  gBentSpoonSpriteTemplate: {
    tag: "ANIM_TAG_BENT_SPOON",
    width: 16,
    height: 32,
    anims: [SPOON("h"), SPOON("")],
    init(sprite, run, _args, done) {
      [sprite.x, sprite.y] = run.center(AnimBattler.Attacker);
      if (run.attacker.foe) {
        sprite.startAnim(1);
        sprite.x -= 40;
        sprite.y += 10;
      } else {
        sprite.x += 40;
        sprite.y -= 10;
      }
      goneAtAnimEnd(sprite, done);
    },
  },

  /** AnimQuestionMark: by the attacker's head; its animation, then it wobbles and stays 18 more frames. */
  gQuestionMarkSpriteTemplate: {
    tag: "ANIM_TAG_AMNESIA",
    width: 32,
    height: 32,
    affineNormal: true,
    anims: [[F(0, 6), F(16, 6), F(32, 6), F(48, 6), F(64, 6), F(80, 6), F(96, 18), END]],
    init(sprite, run, _args, done) {
      const [x, y] = run.center(AnimBattler.Attacker);
      sprite.x = x + (run.attacker.foe ? -PIC_HALF : PIC_HALF);
      sprite.y = Math.max(y - PIC_HALF, 16);
      runSprite(
        sprite,
        (function* () {
          yield;
          while (!sprite.animEnded) yield;
          sprite.affineAnims = [[A(0, 0, 4, 4), A(0, 0, -4, 8), A(0, 0, 4, 4), L(2), END]];
          sprite.startAffineAnim(0);
          yield;
          while (!sprite.affineEnded) yield;
          for (let n = 0; n <= 18; n++) yield;
        })(),
        done,
      );
    },
  },

  /** AnimRedX: on a battler, flickering the last 10 of args[1] frames. */
  gRedXSpriteTemplate: {
    tag: "ANIM_TAG_X_SIGN",
    width: 64,
    height: 64,
    init(sprite, run, args, done) {
      if (args[0] === 0) [sprite.x, sprite.y] = run.center(AnimBattler.Attacker);
      let n = 0;
      sprite.callback = () => {
        if (n > args[1] - 10) sprite.invisible = !!(n & 1);
        if (n === args[1]) done();
        n++;
      };
    },
  },

  /** AnimPsychoBoost: grows on the attacker, then stretches up and fades away. */
  gPsychoBoostOrbSpriteTemplate: {
    tag: "ANIM_TAG_CIRCLE_OF_LIGHT",
    ...CIRCLE,
    affine: true,
    affineAnims: [
      [A(0x20, 0x20, 0, 0), A(0x10, 0x10, 0, 17), L(0), A(-8, -8, 0, 10), A(8, 8, 0, 10), L(4), L(0), A(-0x10, -0x10, 0, 5), A(0x10, 0x10, 0, 5), L(7), END],
      [A(-0x14, 0x18, 0, 15), END],
    ],
    init(sprite, run, _args, done) {
      [sprite.x, sprite.y] = battlerCoords(run, AnimBattler.Attacker);
      let level = 8;
      monBlend(run, level, 16 - level);
      runSprite(
        sprite,
        (function* () {
          yield;
          while (!sprite.affineEnded) yield;
          run.play("se_m_teleport" as SoundId, run.pan(-64));
          sprite.startAffineAnim(1);
          let [wait, rise] = [0, 0];
          for (;;) {
            yield;
            if (wait++ > 1) {
              wait = 0;
              level--;
              monBlend(run, level, 16 - level);
              if (level === 0) {
                sprite.invisible = true;
                break;
              }
            }
            rise += 0x380;
            sprite.y2 -= rise >> 8;
            rise &= 0xff;
          }
          yield;
          run.flow.gba.video.resetBlend();
        })(),
        done,
      );
    },
  },
};

export const PSYCHIC_TASK_SOUNDS: Record<string, readonly string[]> = { gPsychoBoostOrbSpriteTemplate: ["se_m_teleport"] };

/** AnimTask_SkillSwap: twelve orbs of a tag arc from one battler's corner to the other's. */
function* orbSwap(run: AnimRun, args: readonly number[], tag: string): Generator<void, void, void> {
  const [ax, ay] = run.center(AnimBattler.Attacker);
  const [tx, ty] = run.center(AnimBattler.Target);
  const fromTarget = args[0] === 1;
  const [amp, x, y, toX, toY] = fromTarget
    ? [-10, tx - PIC_HALF + 8, ty - PIC_HALF + 8, ax - PIC_HALF + 8, ay - PIC_HALF + 8]
    : [10, ax + PIC_HALF - 8, ay + PIC_HALF - 8, tx + PIC_HALF - 8, ty + PIC_HALF - 8];
  let wait = 6;
  yield;
  for (let n = 0; n < 12; ) {
    if (++wait > 6) {
      wait = 0;
      const index = n & 3;
      run.createSprite(
        {
          tag,
          width: 16,
          height: 16,
          affineNormal: true,
          affineAnims: [
            [A(-8, -8, 0, 8), A(8, 8, 0, 8), J(0)],
            [A(0xf0, 0xf0, 0, 0), A(-8, -8, 0, 6), A(8, 8, 0, 8), A(-8, -8, 0, 2), J(1)],
            [A(0xd0, 0xd0, 0, 0), A(-8, -8, 0, 4), A(8, 8, 0, 8), A(-8, -8, 0, 4), J(1)],
            [A(0xb0, 0xb0, 0, 0), A(-8, -8, 0, 2), A(8, 8, 0, 8), A(-8, -8, 0, 6), J(1)],
          ],
          init(sprite, _run, _args, done) {
            sprite.startAffineAnim(index);
            runSprite(sprite, arc(sprite, 16, toX, toY, amp), done);
          },
        },
        x,
        y,
        0,
      );
      n++;
    }
    yield;
  }
  for (let n = 0; n <= 17; n++) yield;
}

export const PSYCHIC_TASKS: Record<string, AnimTask> = {
  /** AnimTask_MeditateStretchAttacker. */
  *AnimTask_MeditateStretchAttacker(run) {
    const mon = monSprite(run, AnimBattler.Attacker);
    if (mon) yield* monAffine(mon, [A(-8, 10, 0, 16), A(18, -18, 0, 16), A(-20, 16, 0, 8), END]);
  },

  /** AnimTask_Teleport: the attacker thins and rises off screen. */
  *AnimTask_Teleport(run) {
    const mon = monSprite(run, AnimBattler.Attacker);
    if (!mon) return;
    const stretch = monAffine(mon, [A(64, -4, 0, 20), A(0, 0, 0, 200), END]);
    stretch.next();
    yield;
    for (let n = 0; n <= 19; n++) {
      stretch.next();
      yield;
    }
    for (let left = run.attacker.foe ? 4 : 8; left > 0; left--) {
      mon.y2 -= 8;
      yield;
    }
    mon.invisible = true;
    mon.x = 240 + 32;
    resetMonScale(mon);
  },

  /** AnimTask_ImprisonOrbs: orbs appear on the attacker's corners and fade. */
  *AnimTask_ImprisonOrbs(run) {
    const [x, y] = run.center(AnimBattler.Attacker);
    const r = Math.trunc((PIC_HALF * 2) / 3);
    monBlend(run, 16, 0);
    const spots = [[r, -r], [-r, r], [r, r], [-r, -r], [0, 0]];
    const { sprites, video } = run.flow.gba;
    const orbs = [];
    yield;
    for (const [ox, oy] of spots) {
      for (let wait = 0; wait <= 8; wait++) yield;
      const orb = run.createSprite({ tag: "ANIM_TAG_HOLLOW_ORB", width: 16, height: 16, blend: true, init() {} }, x, y, 0);
      if (orb) Object.assign(orb, { x2: ox, y2: oy });
      orbs.push(orb);
    }
    let [a, b] = [16, 0];
    for (let n = 0; n < 32; n++) {
      yield;
      if (n & 1) a--;
      else b++;
      monBlend(run, a, b);
    }
    for (const orb of orbs) sprites.destroy(orb);
    yield;
    yield;
    video.resetBlend();
  },

  *AnimTask_SkillSwap(run, args) {
    yield* orbSwap(run, args, "ANIM_TAG_BLUEGREEN_ORB");
  },

  *AnimTask_HeartSwap(run, args) {
    yield* orbSwap(run, args, "ANIM_TAG_PINKVIO_ORB");
  },

  /** AnimTask_ExtrasensoryDistortion: the target sways by a sine for 24 frames (the C waves its scanlines). */
  *AnimTask_ExtrasensoryDistortion(run, args) {
    const mon = monSprite(run, AnimBattler.Target);
    if (!mon) return;
    const [shift, start] = [[5, 64], [5, 192], [4, 0]][args[0]] ?? [5, 64];
    yield;
    for (let n = 0; n <= 23; n++) {
      let wave = SIN[(start + n * 16) & 0xff] >> shift;
      if (wave > 0) wave += n & 3;
      else if (wave < 0) wave -= n & 3;
      mon.x2 = wave;
      yield;
    }
    mon.x2 = 0;
  },

  /** AnimTask_TransparentCloneGrowAndShrink: a faint copy of a battler (args[0]) swells and returns. */
  *AnimTask_TransparentCloneGrowAndShrink(run, args) {
    const mon = monSprite(run, args[0]);
    const copy = mon && cloneMon(run, mon, ObjMode.Blend);
    if (!copy) return;
    copy.subpriority++;
    copy.affineAnimPaused = true;
    let n = 0;
    const scale = () => {
      const size = 256 - (SIN[n] >> 1);
      copy.setRotScale(size, size, 0);
      copy.y2 = Math.trunc(32 - (32 * 256) / size);
    };
    yield;
    while (n !== 48) {
      n += 4;
      scale();
      yield;
    }
    while (n !== 0) {
      n -= 4;
      scale();
      yield;
    }
    run.flow.gba.sprites.destroy(copy);
    yield;
  },
};
