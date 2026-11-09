// Poison (battle_anim_poison.c): sludge thrown in arcs, droplets and rising bubbles.

import type { AffineCmd, AnimCmd } from "../../../../gba/sprites";
import { AnimBattler, type AnimSpriteTemplate } from "../script";
import { A, arc, END, F, flip, flyTo, J, placeAtTarget, runSprite, sin, spriteOnMon } from "./util";

/** sAnims_PoisonProjectile and its neighbors share one sheet: bubble, droplet, hit. */
const POISON_ANIMS: AnimCmd[][] = [[F(0, 1), END], [F(4, 1), END], [F(8, 1), END]];
const PROJECTILE_AFFINE: AffineCmd[][] = [[A(0x160, 0x160, 0, 0), A(-0xa, -0xa, 0, 10), A(0xa, 0xa, 0, 10), J(0)]];
/** sAffineAnims_Bubble: grows for 20 frames. */
export const BUBBLE_AFFINE: AffineCmd[][] = [[A(0x9c, 0x9c, 0, 0), A(5, 5, 0, 20), END]];
/** gAffineAnims_Droplet: squashes and stretches. */
export const DROPLET_AFFINE: AffineCmd[][] = [[A(-0x10, 0x10, 0, 6), A(0x10, -0x10, 0, 6), J(0)]];
/** gAnims_WaterBubble. */
export const WATER_BUBBLE_ANIMS: AnimCmd[][] = [[F(0, 1), END]];

const PROJECTILE = { tag: "ANIM_TAG_POISON_BUBBLE", width: 16, height: 16, affine: true, anims: POISON_ANIMS } as const;

/** AnimBubbleEffect: at the target, rises and sways while it grows; gone when it stops growing. */
const bubbleEffect: AnimSpriteTemplate["init"] = (sprite, run, args, done) => {
  placeAtTarget(sprite, run, args);
  let [phase, rise] = [0, 0];
  sprite.callback = () => {
    phase = (phase + 0xb) & 0xff;
    sprite.x2 = sin(phase, 4);
    rise += 0x30;
    sprite.y2 = -(rise >> 8);
    if (sprite.affineEnded) done();
  };
};

/** AnimSludgeProjectile / AnimAcidPoisonBubble: an arc from the attacker to the target (args[3] 0: the hit frame). */
const sludge =
  (useOffsets: boolean): AnimSpriteTemplate["init"] =>
  (sprite, run, args, done) => {
    if (!args[3]) sprite.startAnim(2);
    sprite.x = run.center(AnimBattler.Attacker)[0] + flip(run, args[0]);
    sprite.y = run.center(AnimBattler.Attacker)[1] + args[1];
    const [x, y] = run.center(AnimBattler.Target);
    const to: [number, number] = useOffsets ? [x + flip(run, args[4]), y + args[5]] : [x, y];
    runSprite(
      sprite,
      (function* () {
        yield;
        yield* arc(sprite, args[2], to[0], to[1], -30);
      })(),
      done,
    );
  };

export const POISON_TEMPLATES: Record<string, AnimSpriteTemplate> = {
  gSludgeProjectileSpriteTemplate: { ...PROJECTILE, affineAnims: PROJECTILE_AFFINE, init: sludge(false) },
  gAcidPoisonBubbleSpriteTemplate: { ...PROJECTILE, affineAnims: PROJECTILE_AFFINE, init: sludge(true) },

  /** AnimSludgeBombHitParticle: flies off by (args[0], args[1]) in args[2], slowing to a stop. */
  gSludgeBombHitParticleSpriteTemplate: {
    ...PROJECTILE,
    affine: false,
    affineNormal: true,
    affineAnims: [[A(0xec, 0xec, 0, 0), END]],
    init(sprite, _run, args, done) {
      sprite.startAnim(2);
      let stepX = Math.trunc((args[0] << 8) / args[2]);
      let stepY = Math.trunc((args[1] << 8) / args[2]);
      const slowX = Math.trunc(stepX / args[2]);
      const slowY = Math.trunc(stepY / args[2]);
      let [x, y, left] = [0, 0, args[2]];
      sprite.callback = () => {
        left--;
        x += stepX;
        y += stepY;
        sprite.x2 = x >> 8;
        sprite.y2 = y >> 8;
        stepX -= slowX;
        stepY -= slowY;
        if (left <= 0) done();
      };
    },
  },

  /** AnimAcidPoisonDroplet: falls on the target, offset by args[0], args[1], in args[4] frames. */
  gAcidPoisonDropletSpriteTemplate: {
    ...PROJECTILE,
    affineAnims: DROPLET_AFFINE,
    init(sprite, run, args, done) {
      sprite.startAnim(1);
      sprite.x += flip(run, args[0]);
      sprite.y += args[1];
      flyTo(sprite, args[4], sprite.x + args[2], sprite.y + args[4], done);
    },
  },

  gPoisonBubbleSpriteTemplate: {
    tag: "ANIM_TAG_POISON_BUBBLE",
    width: 16,
    height: 16,
    affineNormal: true,
    anims: POISON_ANIMS,
    affineAnims: BUBBLE_AFFINE,
    init: bubbleEffect,
  },
  gWaterBubbleSpriteTemplate: {
    tag: "ANIM_TAG_SMALL_BUBBLES",
    width: 16,
    height: 16,
    affineNormal: true,
    blend: true,
    anims: WATER_BUBBLE_ANIMS,
    affineAnims: BUBBLE_AFFINE,
    init: bubbleEffect,
  },

  /** AnimSpriteOnMonPos on the target. */
  gToxicBubbleSpriteTemplate: {
    tag: "ANIM_TAG_TOXIC_BUBBLE",
    width: 16,
    height: 32,
    anims: [[F(0, 5), F(8, 5), F(16, 5), F(24, 5), END]],
    init: spriteOnMon,
  },
};
