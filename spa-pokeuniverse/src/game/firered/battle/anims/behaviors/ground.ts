// Ground (battle_anim_ground.c): bones, dirt, Dig's vanishing act and Fissure's background.

import type { Sprite } from "../../../../gba/sprites";
import { Layer } from "../../../../gba/video";
import { SIN } from "../../../../gba/trig";
import { AnimBattler, type AnimRun, type AnimSpriteTemplate, type AnimTask } from "../script";
import { A, arc, battlerCoords, F, END, flip, flyTo, J, monSprite, placeAtAttacker, placeAtTarget, random, runSprite } from "./util";

const ARG_RET = 7;
const BONE = { tag: "ANIM_TAG_BONE", width: 32, height: 32, affineNormal: true } as const;

/**
 * SetDigScanlineEffect: below `bottom` the battler's background is scrolled away. Our battlers
 * are sprites: a window hides sprites below that line around the battler.
 */
function clipBelow(run: AnimRun, mon: Sprite, bottom: number): () => void {
  const { video } = run.flow.gba;
  const saved = { on: video.win0On, inside: video.winIn0, outside: video.winOut };
  Object.assign(video.win0, { left: Math.max(0, mon.x - 32), right: Math.min(240, mon.x + 32), top: Math.max(0, bottom), bottom: 160 });
  video.win0On = true;
  video.winIn0 = Layer.ALL & ~Layer.OBJ;
  video.winOut = Layer.ALL;
  return () => {
    video.win0On = saved.on;
    video.winIn0 = saved.inside;
    video.winOut = saved.outside;
  };
}

/** AnimDirtScatter: from the attacker to around the target (±16). */
const dirtScatter: AnimSpriteTemplate["init"] = (sprite, run, args, done) => {
  placeAtAttacker(sprite, run, args);
  const [x, y] = run.center(AnimBattler.Target);
  const off = () => {
    const v = random(32);
    return v > 16 ? 16 - v : v;
  };
  flyTo(sprite, args[2], x + off(), y + off(), done);
};

export const GROUND_TEMPLATES: Record<string, AnimSpriteTemplate> = {
  /** AnimBonemerangProjectile: in an arc to the target and back, 20 frames each way. */
  gBonemerangSpriteTemplate: {
    ...BONE,
    affineAnims: [[A(0, 0, 15, 1), J(0)]],
    init(sprite, run, _args, done) {
      const [fromX, fromY] = run.center(AnimBattler.Attacker);
      [sprite.x, sprite.y] = [fromX, fromY];
      const [toX, toY] = run.center(AnimBattler.Target);
      runSprite(
        sprite,
        (function* () {
          yield* arc(sprite, 20, toX, toY, -40);
          sprite.x += sprite.x2;
          sprite.y += sprite.y2;
          sprite.x2 = sprite.y2 = 0;
          yield* arc(sprite, 20, fromX, fromY, 40);
        })(),
        done,
      );
    },
  },

  /** AnimBoneHitProjectile: from beside the target onto it. */
  gSpinningBoneSpriteTemplate: {
    ...BONE,
    affineAnims: [[A(0, 0, 20, 1), J(0)]],
    init(sprite, run, args, done) {
      placeAtTarget(sprite, run, args);
      const [x, y] = run.center(AnimBattler.Target);
      flyTo(sprite, args[4], x + flip(run, args[2]), y + args[3], done);
    },
  },

  gSandAttackDirtSpriteTemplate: { tag: "ANIM_TAG_MUD_SAND", width: 8, height: 8, init: dirtScatter },
  gMudSlapMudSpriteTemplate: { tag: "ANIM_TAG_MUD_SAND", width: 16, height: 16, anims: [[F(1, 1), END]], init: dirtScatter },

  /** AnimMudSportDirt: rises off the attacker (args[0] 0), or falls at a spot and blinks out. */
  gMudsportMudSpriteTemplate: {
    tag: "ANIM_TAG_MUD_SAND",
    width: 16,
    height: 16,
    init(sprite, run, args, done) {
      sprite.tileNum++;
      if (args[0] === 0) {
        const [x, y] = run.center(AnimBattler.Attacker);
        sprite.x = x + args[1];
        sprite.y = y + args[2];
        const side = args[1] > 0 ? 1 : -1;
        let wait = 0;
        sprite.callback = () => {
          if (++wait > 1) {
            wait = 0;
            sprite.x += side;
          }
          sprite.y -= 4;
          if (sprite.y < -4) done();
        };
        return;
      }
      sprite.x = args[1];
      sprite.y = args[2];
      sprite.y2 = -args[2];
      let [landed, blinks] = [false, 0];
      sprite.callback = () => {
        if (!landed) {
          sprite.y2 += 4;
          if (sprite.y2 >= 0) {
            sprite.y2 = 0;
            landed = true;
          }
          return;
        }
        sprite.invisible = !sprite.invisible;
        if (++blinks === 10) done();
      };
    },
  },

  /** AnimDirtPlumeParticle: from beside the battler's feet, in an arc. */
  gDirtPlumeSpriteTemplate: {
    tag: "ANIM_TAG_MUD_SAND",
    width: 8,
    height: 8,
    init(sprite, run, args, done) {
      const which = args[0] === 0 ? AnimBattler.Attacker : AnimBattler.Target;
      const right = args[1] === 1;
      sprite.x = run.center(which)[0] + (right ? -24 : 24);
      sprite.y = battlerCoords(run, which)[1] + 30;
      const toX = sprite.x + (right ? -args[2] : args[2]);
      const toY = sprite.y + args[3];
      runSprite(
        sprite,
        (function* () {
          yield;
          yield* arc(sprite, args[5], toX, toY, args[4]);
        })(),
        done,
      );
    },
  },

  /** AnimDigDirtMound: half of the mound (args[1]) at the battler's feet, for args[2] frames. */
  gDirtMoundSpriteTemplate: {
    tag: "ANIM_TAG_DIRT_MOUND",
    width: 32,
    height: 16,
    init(sprite, run, args, done) {
      const [x, y] = battlerCoords(run, args[0] === 0 ? AnimBattler.Attacker : AnimBattler.Target);
      sprite.x = x - 16 + args[1] * 32;
      sprite.y = y + 32;
      sprite.tileNum += args[1] * 8;
      let left = args[2];
      sprite.callback = () => {
        if (left-- <= 0) done();
      };
    },
  },
};

export const GROUND_TASKS: Record<string, AnimTask> = {
  /** AnimTask_DigDownMovement: args[0] 0 the attacker bounces and sinks into the ground; else it's gone. */
  *AnimTask_DigDownMovement(run, args) {
    const mon = monSprite(run, AnimBattler.Attacker);
    if (!mon) return;
    if (args[0]) {
      mon.invisible = true;
      mon.x2 = mon.y2 = 0;
      return;
    }
    const line = battlerCoords(run, AnimBattler.Attacker)[1];
    yield;
    const unclip = clipBelow(run, mon, line + 32);
    yield;
    let [phase, wait, down] = [0, 0, 0];
    for (;;) {
      phase = (phase + 6) & 0x7f;
      if (++wait > 2) {
        wait = 0;
        down++;
      }
      const depth = down + (SIN[phase] >> 4);
      mon.y2 = depth;
      if (depth > 63) break;
      yield;
    }
    unclip();
    mon.invisible = true;
    mon.y2 = 0;
  },

  /** AnimTask_DigUpMovement: args[0] 0 the attacker is back, underground; else it rises from the hole. */
  *AnimTask_DigUpMovement(run, args) {
    const mon = monSprite(run, AnimBattler.Attacker);
    if (!mon) return;
    if (!args[0]) {
      mon.invisible = false;
      mon.x2 = 0;
      mon.y2 = 160 - mon.y;
      return;
    }
    const line = battlerCoords(run, AnimBattler.Attacker)[1];
    yield;
    const unclip = clipBelow(run, mon, line + 32);
    mon.y2 = 96;
    yield;
    while ((mon.y2 -= 8) > 0) yield;
    mon.y2 = 0;
    unclip();
  },

  /** AnimTask_IsPowerOver99: answers in gBattleAnimArgs[15]. */
  *AnimTask_IsPowerOver99(run) {
    run.args[15] = (run.movePower ?? 0) > 99 ? 1 : 0;
  },

  /** AnimTask_PositionFissureBgOnBattler: the background centers on a battler until args[7] is args[2]. */
  *AnimTask_PositionFissureBgOnBattler(run, args) {
    const [cx, cy] = run.center(args[0] & 1 ? AnimBattler.Target : AnimBattler.Attacker);
    const { backdrop } = run;
    const [x, y] = [(32 - cx) & 0x1ff, (64 - cy) & 0xff];
    backdrop.scrollX = x;
    backdrop.scrollY = y;
    run.spawn(
      (function* () {
        for (;;) {
          if (run.args[ARG_RET] === args[2]) {
            backdrop.scrollX = backdrop.scrollY = 0;
            return;
          }
          backdrop.scrollX = x;
          backdrop.scrollY = y;
          yield;
        }
      })(),
    );
  },
};
