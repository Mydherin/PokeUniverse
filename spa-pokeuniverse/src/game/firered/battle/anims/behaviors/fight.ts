// Fighting (battle_anim_fight.c): fists and feet that slide, spin and stomp; Superpower's rocks;
// Brick Break's wall.

import { AnimBattler, type AnimSpriteTemplate, type AnimTask } from "../script";
import { HANDS_AND_FEET, BASIC_HIT_SPLAT } from "./particles";
import { A, battlerCoords, END, F, flip, flyTo, frames, goneAtAnimEnd, J, placeAtAttacker, placeAtTarget, random, runSprite, sin, travel } from "./util";

const HAND = { tag: "ANIM_TAG_HANDS_AND_FEET", width: 32, height: 32, anims: HANDS_AND_FEET } as const;
const ARG_RET = 7;

/** AnimTravelDiagonally via AnimSlideHandOrFootToTarget: slides to the battler args[5] picks; args[7] 1 flips Y for the foe. */
const slideHand: AnimSpriteTemplate["init"] = (sprite, run, args, done) => {
  const m = args[7] === 1 && run.attacker.foe ? -1 : 1;
  const [y1, y3] = [args[1] * m, args[3] * m];
  sprite.startAnim(args[6]);
  placeAtTarget(sprite, run, [args[0], y1]);
  const [x, y] = run.center(args[5] ? AnimBattler.Target : AnimBattler.Attacker);
  flyTo(sprite, args[4], x + flip(run, args[2]), y + y3, done);
};

export const FIGHT_TEMPLATES: Record<string, AnimSpriteTemplate> = {
  gKarateChopSpriteTemplate: { ...HAND, init: slideHand },
  gJumpKickSpriteTemplate: { ...HAND, init: slideHand },

  /** AnimFistOrFootRandomPos: on a random spot of the battler with a hit behind it, for args[1] frames. */
  gFistFootRandomPosSpriteTemplate: {
    ...HAND,
    init(sprite, run, args, done) {
      const which = args[0] === 0 ? AnimBattler.Attacker : AnimBattler.Target;
      sprite.startAnim(args[2] < 0 ? random(5) : args[2]);
      [sprite.x, sprite.y] = run.center(which);
      const mon = run.mon(which);
      const size = mon.sprite ? mon.sprite.width : 64;
      let x = random(size >> 1);
      let y = random(size >> 2);
      if (random(2)) x = -x;
      if (random(2)) y = -y;
      if (!mon.foe) y -= 16;
      sprite.x += x;
      sprite.y += y;
      const hit = run.createSprite(BASIC_HIT_SPLAT, sprite.x, sprite.y, sprite.subpriority + 1, [0, 0, 1, 0]);
      if (hit) {
        hit.x = sprite.x;
        hit.y = sprite.y;
        hit.callback = () => {};
      }
      let left = args[1];
      sprite.callback = () => {
        if (left-- > 0) return;
        if (hit) run.flow.gba.sprites.destroy(hit);
        done();
      };
    },
  },

  /** AnimCrossChopHand: slides apart from the target, then back through it. */
  gCrossChopHandSpriteTemplate: {
    ...HAND,
    anims: HANDS_AND_FEET.slice(3),
    init(sprite, run, args, done) {
      placeAtTarget(sprite, run, args);
      const away = args[2] === 0 ? sprite.x - 20 : sprite.x + 20;
      if (args[2] !== 0) sprite.hFlip = true;
      const [homeX, homeY] = [sprite.x, sprite.y];
      runSprite(
        sprite,
        (function* () {
          yield;
          yield* travel(sprite, 30, away, homeY - 20);
          yield* frames(11);
          const [x, y] = [sprite.x + sprite.x2, sprite.y + sprite.y2];
          const back = [homeX, homeY];
          [sprite.x, sprite.y, sprite.x2, sprite.y2] = [x, y, 0, 0];
          yield* travel(sprite, 8, back[0], back[1]);
        })(),
        done,
      );
    },
  },

  /** AnimSlidingKick: slides by args[2] in args[3], bobbing at args[4], height args[5]. */
  gSlidingKickSpriteTemplate: {
    ...HAND,
    anims: HANDS_AND_FEET.slice(1),
    init(sprite, run, args, done) {
      placeAtTarget(sprite, run, args);
      const moving = travel(sprite, args[3], sprite.x + flip(run, args[2]), sprite.y);
      let phase = 0;
      sprite.callback = () => {
        if (moving.next().done) return done();
        sprite.y2 += sin((phase >> 8) & 0xff, args[5]);
        phase += args[4];
      };
    },
  },

  /** AnimSpinningKickOrPunch: spins and shrinks for args[3] frames, then full size for 20. */
  gSpinningHandOrFootSpriteTemplate: { ...HAND, affine: true, affineAnims: [[A(0x100, 0x100, 0, 0), A(-8, -8, 20, 1), J(1)]], init: spinningKick },
  gMegaPunchKickSpriteTemplate: { ...HAND, affine: true, affineAnims: [[A(0x100, 0x100, 0, 0), A(-4, -4, 20, 1), J(1)]], init: spinningKick },

  /** AnimStompFoot: waits args[2] frames above the target, stomps in 6, stays 15. */
  gStompFootSpriteTemplate: {
    ...HAND,
    anims: HANDS_AND_FEET.slice(1),
    init(sprite, run, args, done) {
      placeAtTarget(sprite, run, args);
      const [x, y] = run.center(AnimBattler.Target);
      runSprite(
        sprite,
        (function* () {
          yield* frames(args[2] + 1);
          yield* travel(sprite, 6, x, y);
          yield* frames(15);
        })(),
        done,
      );
    },
  },

  /** AnimDizzyPunchDuck: drifts off along a hop, blinking at its end. */
  gDizzyPunchDuckSpriteTemplate: {
    tag: "ANIM_TAG_DUCK",
    width: 16,
    height: 16,
    anims: [[F(0, 8), F(4, 8), F(0, 8, "h"), F(8, 8), J(0)]],
    init(sprite, run, args, done) {
      placeAtTarget(sprite, run, args);
      let [ox, phase] = [0, 0];
      sprite.callback = () => {
        ox += args[2];
        sprite.x2 = ox >> 8;
        sprite.y2 = sin(phase, args[3]);
        phase = (phase + 3) & 0xff;
        if (phase > 100) sprite.invisible = phase % 2 === 1;
        if (phase > 120) done();
      };
    },
  },

  /** AnimBrickBreakWall: a wall at the battler's spot for args[3] frames, then shaking args[4] frames. */
  gBrickBreakWallSpriteTemplate: {
    tag: "ANIM_TAG_BLUE_LIGHT_WALL",
    width: 64,
    height: 64,
    blend: true,
    init(sprite, run, args, done) {
      [sprite.x, sprite.y] = battlerCoords(run, args[0] === 0 ? AnimBattler.Attacker : AnimBattler.Target);
      sprite.x += args[1];
      sprite.y += args[2];
      let [wait, left, tick, n] = [args[3], args[4], 0, 0];
      sprite.callback = () => {
        if (wait > 0) {
          if (--wait === 0 && left === 0) done();
          return;
        }
        if (++tick > 1) {
          tick = 0;
          sprite.x2 = ++n & 1 ? 2 : -2;
        }
        if (--left === 0) done();
      };
    },
  },

  /** AnimBrickBreakWallShard: a piece (args[1], a corner) flies off for 41 frames. */
  gBrickBreakWallShardSpriteTemplate: {
    tag: "ANIM_TAG_TORN_METAL",
    width: 32,
    height: 32,
    init(sprite, run, args, done) {
      [sprite.x, sprite.y] = battlerCoords(run, args[0] === 0 ? AnimBattler.Attacker : AnimBattler.Target);
      sprite.x += args[2];
      sprite.y += args[3];
      sprite.tileNum += args[1] * 16;
      const dx = args[1] & 1 ? 3 : -3;
      const dy = args[1] & 2 ? 3 : -3;
      let n = 0;
      sprite.callback = () => {
        sprite.x += dx;
        sprite.y += dy;
        if (++n > 40) done();
      };
    },
  },

  /** AnimSuperpowerOrb: grows on the attacker for 180 frames, then flies to the target in 16. */
  gSuperpowerOrbSpriteTemplate: {
    tag: "ANIM_TAG_CIRCLE_OF_LIGHT",
    width: 64,
    height: 64,
    affine: true,
    blend: true,
    affineAnims: [[A(0x20, 0x20, 0, 0), A(4, 4, 0, 64), A(-6, -6, 0, 8), A(6, 6, 0, 8), J(2)]],
    init(sprite, run, args, done) {
      if (args[0] === 0) [sprite.x, sprite.y] = run.center(AnimBattler.Attacker);
      const [x, y] = run.center(args[0] === 0 ? AnimBattler.Target : AnimBattler.Attacker);
      runSprite(
        sprite,
        (function* () {
          yield* frames(180);
          run.flow.gba.video.resetBlend();
          yield* travel(sprite, 16, x, y);
        })(),
        done,
      );
    },
  },

  /** AnimSuperpowerRock: rises from the ground at args[1] 1/256 for args[3] frames, then shoots at the target. */
  gSuperpowerRockSpriteTemplate: {
    tag: "ANIM_TAG_FLAT_ROCK",
    width: 16,
    height: 16,
    init(sprite, run, args, done) {
      sprite.x = args[0];
      sprite.y = 120;
      sprite.tileNum += args[2] * 4;
      let [left, y, shooting] = [args[3], 120 << 8, false];
      const [ax, ay] = run.center(AnimBattler.Attacker);
      const [tx, ty] = run.center(AnimBattler.Target);
      const [dx, dy] = [tx - ax, ty - ay];
      let [px, py] = [0, 0];
      sprite.callback = () => {
        if (!shooting) {
          if (left !== 0) {
            y -= args[1];
            sprite.y = y >> 8;
            if (sprite.y < -8) return done();
            left--;
          } else {
            px = sprite.x << 4;
            py = sprite.y << 4;
            shooting = true;
          }
          return;
        }
        px += dx;
        py += dy;
        sprite.x = px >> 4;
        sprite.y = py >> 4;
        if (((sprite.x + 8) & 0xffff) > 256 || sprite.y < -8 || sprite.y > 120) done();
      };
    },
  },

  /** AnimSuperpowerFireball: flies from one battler to the other in 16, flipped toward the player. */
  gSuperpowerFireballSpriteTemplate: {
    tag: "ANIM_TAG_METEOR",
    width: 64,
    height: 64,
    init(sprite, run, args, done) {
      const attacker = args[0] === 0;
      if (attacker) [sprite.x, sprite.y] = run.center(AnimBattler.Attacker);
      const toward = attacker ? AnimBattler.Target : AnimBattler.Attacker;
      if (!run.mon(toward).foe) sprite.hFlip = sprite.vFlip = true;
      const [x, y] = run.center(toward);
      runSprite(sprite, travel(sprite, 16, x, y), done);
    },
  },

  /** AnimArmThrustHit: a hand beside the target, the other side each turn, args[2] + 1 frames. */
  gArmThrustHandSpriteTemplate: {
    ...HAND,
    init(sprite, run, args, done) {
      [sprite.x, sprite.y] = run.center(AnimBattler.Target);
      const turn = (run.turn ?? 0) + (run.target.foe ? 0 : 1);
      const odd = !!(turn & 1);
      sprite.startAnim(args[3] + (odd ? 1 : 0));
      sprite.x2 = odd ? -args[0] : args[0];
      sprite.y2 = args[1];
      let n = 0;
      sprite.callback = () => {
        if (n++ === args[2]) done();
      };
    },
  },

  /** AnimRevengeScratch: a scratch on the battler's spot (args[2]); the flipped art for the foe. */
  gRevengeSmallScratchSpriteTemplate: {
    tag: "ANIM_TAG_PURPLE_SCRATCH",
    width: 32,
    height: 32,
    anims: [
      [F(0, 4), F(16, 4), F(32, 4), END],
      [F(0, 4, "v"), F(16, 4, "v"), F(32, 4, "v"), END],
      [F(0, 4, "h"), F(16, 4, "h"), F(32, 4, "h"), END],
    ],
    init: revengeScratch,
  },
  gRevengeBigScratchSpriteTemplate: {
    tag: "ANIM_TAG_PURPLE_SWIPE",
    width: 64,
    height: 64,
    anims: [
      [F(0, 6), F(64, 6), END],
      [F(0, 6, "hv"), F(64, 6, "hv"), END],
      [F(0, 6, "h"), F(64, 6, "h"), END],
    ],
    init: revengeScratch,
  },

  /** AnimFocusPunchFist: shrinks onto the target, then shakes for 41 frames. */
  gFocusPunchFistSpriteTemplate: {
    ...HAND,
    affine: true,
    affineAnims: [[A(0x200, 0x200, 0, 0), A(-0x20, -0x20, 0, 8), END]],
    init(sprite, _run, _args, done) {
      let [phase, n] = [0, 0];
      sprite.callback = () => {
        if (!sprite.affineEnded) return;
        phase = (phase + 40) & 0xff;
        sprite.x2 = sin(phase, 2);
        if (++n > 40) done();
      };
    },
  },
};

function spinningKick(...[sprite, run, args, done]: Parameters<AnimSpriteTemplate["init"]>): void {
  placeAtTarget(sprite, run, args);
  sprite.startAnim(args[2]);
  runSprite(
    sprite,
    (function* () {
      yield* frames(args[3]);
      sprite.startAffineAnim(0);
      sprite.affineAnimPaused = true;
      sprite.setRotScale(0x100, 0x100, 0);
      yield* frames(20);
    })(),
    done,
  );
}

function revengeScratch(...[sprite, run, args, done]: Parameters<AnimSpriteTemplate["init"]>): void {
  if (args[2] === 0) placeAtAttacker(sprite, run, args, false);
  else placeAtTarget(sprite, run, args, false);
  if (run.attacker.foe) sprite.startAnim(1);
  goneAtAnimEnd(sprite, done);
}

export const FIGHT_TASKS: Record<string, AnimTask> = {
  /** AnimTask_MoveSkyUppercutBg: the background flies by, faster after args[0] frames, until args[7] is -1. */
  *AnimTask_MoveSkyUppercutBg(run, args) {
    const { backdrop } = run;
    let [wait, x, y] = [args[0], 0, 0];
    for (;;) {
      if (wait >= 0) wait--;
      else x += 1280;
      y += 2816;
      backdrop.scrollX += (run.target.foe ? -1 : 1) * (x >> 8);
      backdrop.scrollY += y >> 8;
      x &= 0xff;
      y &= 0xff;
      if (run.args[ARG_RET] === -1) {
        backdrop.scrollX = backdrop.scrollY = 0;
        return;
      }
      yield;
    }
  },
};
