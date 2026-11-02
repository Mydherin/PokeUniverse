// Sprites with art that appear on a battler (battle_anim_normal.c, battle_anim_fight.c): impacts,
// fists and feet, and the generic animations' orb. Sprites start at the target's picture.

import type { AffineCmd, AnimCmd } from "../../../../gba/sprites";
import { AnimBattler, type AnimSpriteTemplate } from "../script";
import { placeAtAttacker, placeAtTarget } from "./util";

/** sAffineAnims_HitSplat: full size, or smaller (0xD8, 0xB0, 0x80), for 8 frames. */
const HIT_SPLAT_AFFINE: AffineCmd[][] = [
  [{ xScale: 0, yScale: 0, duration: 8 }, "end"],
  ...[0xd8, 0xb0, 0x80].map((scale): AffineCmd[] => [{ xScale: scale, yScale: scale, duration: 0 }, { xScale: 0, yScale: 0, duration: 8 }, "end"]),
];

/** sAnims_HandsAndFeet (32×32 frames): fist, wide foot, tall foot, left hand, right hand. */
const HANDS_AND_FEET: AnimCmd[][] = [
  [{ image: 0, duration: 1 }, "end"],
  [{ image: 16, duration: 1 }, "end"],
  [{ image: 32, duration: 1 }, "end"],
  [{ image: 48, duration: 1 }, "end"],
  [{ image: 48, duration: 1, hFlip: true }, "end"],
];

export const PARTICLE_TEMPLATES: Record<string, AnimSpriteTemplate> = {
  /**
   * AnimHitSplatBasic: the impact at the attacker (args[2] 0) or the target, offset by args[0]
   * and args[1], at the size of affine anim args[3]; gone when it ends.
   */
  gBasicHitSplatSpriteTemplate: {
    tag: "ANIM_TAG_IMPACT",
    width: 32,
    height: 32,
    affine: true,
    blend: true,
    affineAnims: HIT_SPLAT_AFFINE,
    init(sprite, run, args, done) {
      sprite.startAffineAnim(args[3]);
      if (args[2] === 0) placeAtAttacker(sprite, run, args);
      else placeAtTarget(sprite, run, args);
      sprite.callback = (s) => {
        if (s.affineEnded) done();
      };
    },
  },

  /**
   * AnimBasicFistOrFoot: a fist, foot or hand (anim args[4]) at the attacker (args[3] 0) or the
   * target, offset by args[0] and args[1], for args[2] frames.
   */
  gFistFootSpriteTemplate: {
    tag: "ANIM_TAG_HANDS_AND_FEET",
    width: 32,
    height: 32,
    anims: HANDS_AND_FEET,
    init(sprite, run, args, done) {
      sprite.startAnim(args[4]);
      if (args[3] === 0) placeAtAttacker(sprite, run, args);
      else placeAtTarget(sprite, run, args);
      let frames = args[2];
      sprite.callback = () => {
        if (frames > 0) frames--;
        else done();
      };
    },
  },

  /** Generic special move: an orb in the move's color flies from the attacker to the target in args[0] frames. */
  GenericOrbSpriteTemplate: {
    tag: "ANIM_TAG_ORB",
    width: 16,
    height: 16,
    anims: [
      [
        { image: 0, duration: 3 },
        { image: 4, duration: 3 },
        { image: 8, duration: 3 },
        { image: 12, duration: 3 },
        { jump: 0 },
      ],
    ],
    init(sprite, run, args, done) {
      const [fromX, fromY] = run.center(AnimBattler.Attacker);
      const [toX, toY] = run.center(AnimBattler.Target);
      const frames = args[0];
      let t = 0;
      sprite.x = fromX;
      sprite.y = fromY;
      const pal = 256 + sprite.paletteNum * 16;
      run.flow.gba.palettes.blendPalette(pal, 16, 10, run.color);
      sprite.callback = (s) => {
        t++;
        s.x = fromX + Math.trunc(((toX - fromX) * t) / frames);
        s.y = fromY + Math.trunc(((toY - fromY) * t) / frames);
        if (t >= frames) done();
      };
    },
  },
};
