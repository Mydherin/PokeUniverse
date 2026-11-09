// The expansion's moves (355-467, phase-5 M10): most of its templates are FireRed's behaviors
// in new art (`skin`), the rest are its new callbacks and tasks, written here from their behavior.

import type { AffineCmd, AnimCmd, Sprite } from "../../../../gba/sprites";
import { ObjMode } from "../../../../gba/sprites";
import type { SoundId } from "../../../manifest";
import { AnimBattler, type AnimSpriteTemplate, type AnimTask } from "../script";
import { monAffine } from "./effects";
import { basicHit, HANDS_AND_FEET } from "./particles";
import { BASIC_FIRE } from "./rock";
import { MUSIC_NOTES_ANIMS } from "./effects-1";
import { A, affineEnd, arc, arcTan2Neg, battlerCoords, cos, ellipse, END, F, flip, flipTarget, flyTo, frames, goneAtAffineEnd, goneAtAnimEnd, J, placeAtAttacker, placeAtTarget, random, rotScale, runSprite, sin, slide, travel } from "./util";

type Init = AnimSpriteTemplate["init"];
type Look = Omit<AnimSpriteTemplate, "init">;

/** A sprite that stands still for a moment after it's created: its first step runs next frame. */
const later = (sprite: Sprite, steps: () => Generator<void, void, void>, done: () => void) =>
  runSprite(
    sprite,
    (function* () {
      yield;
      yield* steps();
    })(),
    done,
  );

// ---------- Frame and affine tables ----------

/** gRazorLeafParticleAnimTable. */
const LEAF_PARTICLE: AnimCmd[][] = [[F(0, 5), F(4, 5), F(8, 5), F(12, 5), F(16, 5), F(20, 5), F(16, 5), F(12, 5), F(8, 5), F(4, 5), J(0)], [F(24, 5), F(28, 5), F(32, 5), END]];
/** gExplosionAnimTable. */
const EXPLOSION: AnimCmd[][] = [[F(0, 5), F(16, 5), F(32, 5), F(48, 5), END]];
/** sAnims_PoisonProjectile from its droplet on. */
const POISON_DROPLET: AnimCmd[][] = [[F(4, 1), END], [F(8, 1), END]];
/** gKnockOffAquaTailAnim, gDragonRushAnimTable. */
const SWING_ANIMS: AnimCmd[][] = [[F(0, 4), F(64, 4), END]];
/** gKnockOffAquaTailAffineAnim, gDragonRushAffineAnimTable. */
const SWING_AFFINE: AffineCmd[][] = [[A(0x100, 0x100, 0, 0), A(0, 0, -4, 8), END], [A(-0x100, 0x100, 0, 0), A(0, 0, 4, 8), END]];
/** gAquaTailHitAffineAnims, gForcePalmAffineAnims, gPunishmentImpactAffineAnim, gSuckerPunchImpactAffineAnim. */
const HIT_AFFINE: AffineCmd[][] = [[A(0, 0, 0, 8), END], [A(0xd8, 0xd8, 0, 0), A(0, 0, 0, 8), END], [A(0xb0, 0xb0, 0, 0), A(0, 0, 0, 8), END], [A(0x80, 0x80, 0, 0), A(0, 0, 0, 8), END]];
/** gAffineAnims_SpinningBone. */
const SPINNING: AffineCmd[][] = [[A(0, 0, 20, 1), J(0)]];
/** gSuckerPunchAnim, gRazorLeafCutterAnimTable. */
const TUMBLE: AnimCmd[][] = [[F(0, 3), F(0, 3, "h"), F(0, 3, "hv"), F(0, 3, "v"), J(0)]];
/** gNightSlashLeftAnimTable. */
const NIGHT_SLASH_LEFT: AnimCmd[][] = [[F(0, 4), F(16, 4), F(32, 4), F(48, 4), END], [F(48, 4), END]];
/** gNightSlashRightAnimTable. */
const NIGHT_SLASH_RIGHT: AnimCmd[][] = [[F(0, 4, "hv"), F(16, 4, "hv"), F(32, 4, "hv"), F(48, 4, "hv"), END], [F(48, 4, "hv"), END]];
/** A sheet's pictures, each its own one-frame animation (sPowerSwapGuardSwapAnimTable, sTrumpCardAnims). */
const pictures = (count: number, step: number): AnimCmd[][] => Array.from({ length: count }, (_, i) => [F(i * step, 0), END]);
/** gRockPolishStreak_AffineAnimCmds: sixteen turns. */
const STREAK_AFFINE: AffineCmd[][] = Array.from({ length: 16 }, (_, i) => [A(0x100, 0x100, i * 0x10, 0), END]);
/** gWoodHammerHammerAffineAnims: the wind-up (5 scale, 2 turn a frame for 40), both ways; the punch back, both ways. */
const WOOD_HAMMER_AFFINE: AffineCmd[][] = [
  [A(5, 5, 2, 40), END],
  [A(-0x100, 0x100, 0, 0), A(-5, 5, -2, 40), END],
  [A(0x100 + 200, 0x100 + 200, 80, 0), A(0, 0, -16, 7), END],
  [A(-0x100 - 200, 0x100 + 200, -80, 0), A(0, 0, 16, 7), END],
];

// ---------- New callbacks ----------

/** RunStoredCallbackWhenAffineAnimEnds at the target, as the expansion's zooms. */
const zoomOnTarget: Init = (sprite, run, args, done) => {
  placeAtTarget(sprite, run, args);
  goneAtAffineEnd(sprite, done);
};

/** AnimMoveAccupressure: to the target's spot in args[2], then a turn. */
const acupressure: Init = (sprite, run, args, done) => {
  placeAtTarget(sprite, run, args);
  const [x, y] = battlerCoords(run, AnimBattler.Target);
  later(
    sprite,
    function* () {
      yield* travel(sprite, args[2], x, y);
      sprite.startAffineAnim(1);
      yield* affineEnd(sprite);
    },
    done,
  );
};

/** AnimKnockOffAquaTail, AnimDragonRush: a swing around the target until its frames end. */
const swing: Init = (sprite, run, args, done) => {
  const toPlayer = !run.target.foe;
  sprite.x += toPlayer ? -args[0] : args[0];
  sprite.y += args[1];
  if (toPlayer) sprite.startAffineAnim(1);
  const by = toPlayer ? -11 : 11;
  let phase = 192;
  sprite.callback = () => {
    phase = (phase + by) & 0xff;
    sprite.x2 = cos(phase, 20);
    sprite.y2 = sin(phase, 20);
    if (sprite.animEnded) done();
  };
};

/** AvalancheAnim_Step: drops from above in four frames, then bounces aside by args[2]. */
const avalanche: Init = (sprite, run, args, done) => {
  if (args[3]) [sprite.x, sprite.y] = battlerCoords(run, AnimBattler.Target);
  sprite.x += args[0];
  sprite.y += 14;
  sprite.startAnim(args[1]);
  runSprite(
    sprite,
    (function* () {
      yield* ellipse(sprite, 4, 0, 16, -70, 0);
      sprite.x += args[2];
      yield* ellipse(sprite, 4, 192, 32, -24, args[2]);
    })(),
    done,
  );
};

/** AnimDracoMeteorRock: from an offset of the target to another (mirrored for a target on the player's side) in args[4]. */
const meteorRock: Init = (sprite, run, args, done) => {
  const [x0, x1] = [sprite.x + flipTarget(run, args[0]), sprite.x + flipTarget(run, args[2])];
  const [y0, y1] = [sprite.y + args[1], sprite.y + args[3]];
  [sprite.x, sprite.y] = [x0, y0];
  let n = 0;
  sprite.callback = () => {
    sprite.x2 = Math.trunc(((x1 - x0) * n) / args[4]);
    sprite.y2 = Math.trunc(((y1 - y0) * n) / args[4]);
    if (n++ === args[4]) done();
  };
};

/** AnimMoveFeintSwipe: 64 px to the right in args[2] and back. */
const feintSwipe: Init = (sprite, run, args, done) => {
  placeAtTarget(sprite, run, [flip(run, args[0]), args[1]]);
  later(
    sprite,
    function* () {
      yield* travel(sprite, args[2], sprite.x + 64, sprite.y);
      sprite.x2 = 0;
      sprite.x += 64;
      yield* travel(sprite, args[2], sprite.x - 64, sprite.y);
    },
    done,
  );
};

/** AnimGrassKnot, AnimSuckerPunch: along the target by args[2] in args[3], bobbing args[5] at args[4] 1/256 a frame. */
const bobbing: Init = (sprite, run, args, done) => {
  placeAtTarget(sprite, run, args);
  const steps = travel(sprite, args[3], sprite.x + flip(run, args[2]), sprite.y);
  let phase = 0;
  sprite.callback = () => {
    if (steps.next().done) return done();
    sprite.y2 += sin(phase >> 8, args[5]);
    phase += args[4];
  };
};

/** AnimGunkShotParticles: from the attacker to the target in 30, swaying args[3], its phase from gBattleAnimArgs[7]. */
const gunkParticle: Init = (sprite, run, args, done) => {
  placeAtAttacker(sprite, run, args);
  const steps = travel(sprite, 30, ...run.center(AnimBattler.Target));
  const speed = Math.trunc(0xd200 / 30);
  const start = args[7] & 0xffff;
  let phase = (start > 127 ? start - 127 : start) * 256;
  let amplitude = start > 127 ? -args[3] : args[3];
  const step = () => {
    if (steps.next().done) return done();
    sprite.y2 += sin(phase >> 8, amplitude);
    if ((phase + speed) >> 8 > 127) {
      phase = 0;
      amplitude = -amplitude;
    } else phase += speed;
  };
  sprite.callback = step;
  step();
};

/** SpriteCB_MaxFlutterby: from the attacker's spot; next frame it grows, sounds and arcs to the target in 16, height args[2]. */
const iceShard: Init = (sprite, run, args, done) => {
  placeAtAttacker(sprite, run, args, false);
  const [x, y] = run.center(AnimBattler.Target);
  later(
    sprite,
    function* () {
      run.play("se_m_sand_attack" as SoundId);
      sprite.startAffineAnim(1);
      yield;
      yield* arc(sprite, 16, x, y, args[2]);
    },
    done,
  );
};

/** AnimLavaPlumeOrbitScatter: out of the attacker in the direction of args[0] until off screen. */
const lavaPlume: Init = (sprite, run, args, done) => {
  [sprite.x, sprite.y] = run.center(AnimBattler.Attacker);
  const [dx, dy] = [sin(args[0], 10), cos(args[0], 7)];
  sprite.callback = () => {
    sprite.x2 += dx;
    sprite.y2 += dy;
    const [x, y] = [sprite.x + sprite.x2, sprite.y + sprite.y2];
    if (x < -16 || x > 256 || y > 160 || y < -16) done();
  };
};

/** AnimPluck: flies from the target at (args[4], args[3]) for args[2] frames, slowing upward. */
const pluck: Init = (sprite, run, args, done) => {
  placeAtTarget(sprite, run, args);
  sprite.x += args[0];
  sprite.y += args[1];
  let [left, up] = [args[2], args[3]];
  sprite.callback = () => {
    if (left <= 0) return done();
    sprite.y -= up;
    sprite.x += args[4];
    if (left % 7 === 0) up--;
    left--;
  };
};

/** AnimPoisonJabProjectile: from the target's offset to its center in args[2], turned along the way. */
const poisonJab: Init = (sprite, run, args, done) => {
  placeAtTarget(sprite, run, args);
  const [x, y] = run.center(AnimBattler.Target);
  rotScale(sprite, 0x100, 0x100, arcTan2Neg(x - sprite.x, y - sprite.y));
  flyTo(sprite, args[2], x, y, done);
};

/** AnimMovePowerSwapGuardSwap: picture args[2] arcs between the battlers (args[3]: from the target) in args[4], height args[5]. */
const swapOrb: Init = (sprite, run, args, done) => {
  sprite.startAnim(args[2]);
  if (args[3]) placeAtTarget(sprite, run, args);
  else placeAtAttacker(sprite, run, args);
  const [x, y] = battlerCoords(run, args[3] ? AnimBattler.Attacker : AnimBattler.Target);
  later(sprite, () => arc(sprite, args[4], x, y, args[5]), done);
};

/** SpriteCB_SpriteOnMonForDuration: on a battler's spot (args[0]) for args[3] frames, then shakes for args[4]. */
const onMonForDuration: Init = (sprite, run, args, done) => {
  const which = args[0] ? AnimBattler.Target : AnimBattler.Attacker;
  if (!run.mon(which).sprite || run.mon(which).sprite?.invisible) return done();
  [sprite.x, sprite.y] = battlerCoords(run, which);
  sprite.x += args[1];
  sprite.y += args[2];
  later(
    sprite,
    function* () {
      yield* frames(args[3] - 1);
      if (!args[4]) return;
      let wait = 0;
      let flipped = 0;
      for (let left = args[4]; left > 0; left--) {
        if (++wait > 1) {
          wait = 0;
          flipped++;
          sprite.x2 = flipped & 1 ? 2 : -2;
        }
        yield;
      }
    },
    done,
  );
};

/** AnimPsychoCut: from the attacker to the target's offset in args[4], the blade turned along the way. */
const psychoCut: Init = (sprite, run, args, done) => {
  const foe = run.attacker.foe;
  placeAtAttacker(sprite, run, [args[0], foe ? -args[1] : args[1]]);
  const [tx, ty] = run.center(AnimBattler.Target);
  const [x, y] = [tx + flip(run, args[2]), ty + (foe ? -args[3] : args[3])];
  rotScale(sprite, 0x100, 0x100, (arcTan2Neg(x - sprite.x, y - sprite.y) + 0xc000) & 0xffff);
  flyTo(sprite, args[4], x, y, done);
};

/** AnimRockPolishSparkle: at the attacker until its frames end. */
const sparkle: Init = (sprite, run, args, done) => {
  placeAtAttacker(sprite, run, args);
  goneAtAnimEnd(sprite, done);
};

/** AnimRockPolishStreak: at the attacker at a random turn until its frames end. */
const streak: Init = (sprite, run, args, done) => {
  placeAtAttacker(sprite, run, args);
  sprite.startAffineAnim(random(STREAK_AFFINE.length));
  goneAtAnimEnd(sprite, done);
};

/** AnimMoveSmallCloud: drifts from the target by (args[3], args[4]) a frame while variant args[2] shrinks. */
const smallCloud: Init = (sprite, run, args, done) => {
  placeAtTarget(sprite, run, args);
  sprite.startAffineAnim(args[2] + 1);
  sprite.callback = () => {
    sprite.x2 += args[3];
    sprite.y2 += args[4];
    if (sprite.affineEnded) done();
  };
};

/** AnimStealthRock: arcs from the attacker to the target's spot in args[4], waits 30 and flickers away. */
const stealthRock: Init = (sprite, run, args, done) => {
  placeAtAttacker(sprite, run, args);
  const [x, y] = battlerCoords(run, AnimBattler.Target);
  later(
    sprite,
    function* () {
      yield* arc(sprite, args[4], x + flip(run, args[2]), y + args[3], -50);
      yield* frames(30);
      for (let n = 0; n < 16; n++) {
        if (n & 1) sprite.invisible = !sprite.invisible;
        yield;
      }
    },
    done,
  );
};

/** AnimMoveTrumpCardParticle: picture args[2], turn args[6], flies at (args[4], args[5]) for args[3], slowing. */
const trumpParticle: Init = (sprite, run, args, done) => {
  placeAtTarget(sprite, run, [flip(run, args[0]), args[1]]);
  sprite.startAnim(args[2]);
  sprite.startAffineAnim(args[6]);
  const slower = (v: number) => v - Math.sign(v);
  let [left, vx, vy] = [args[3], args[4], args[5]];
  sprite.callback = () => {
    if (left <= 0) return done();
    sprite.y -= vy;
    sprite.x += vx;
    if (left % 2 === 0) [vx, vy] = [slower(vx), slower(vy)];
    left--;
  };
};

/** AnimMoveTrumpCard: picture args[2], 80 px left along the target in args[3], on an arc. */
const trumpCard: Init = (sprite, run, args, done) => {
  placeAtTarget(sprite, run, [flip(run, args[0]), args[1]]);
  sprite.startAnim(args[2]);
  const steps = travel(sprite, args[3], sprite.x - 80, sprite.y);
  const by = Math.trunc(128 / args[3]);
  let phase = 128;
  sprite.callback = () => {
    if (steps.next().done) return done();
    sprite.y2 = sin(phase, -20);
    phase -= by;
  };
};

/** AnimWoodHammerHammer: winds up beside the target, trembles 37 frames and strikes. */
const woodHammer: Init = (sprite, run, _args, done) => {
  const foe = run.attacker.foe;
  sprite.x += foe ? 40 : -40;
  sprite.startAffineAnim(foe ? 1 : 0);
  later(
    sprite,
    function* () {
      yield* affineEnd(sprite);
      for (let n = 36; n >= 0; n--) {
        if (n & 1) sprite.x2 += (n >> 1) & 1 ? 1 : -1;
        yield;
      }
      sprite.startAffineAnim(foe ? 3 : 2);
      yield;
      yield* affineEnd(sprite);
    },
    done,
  );
};

/** AnimWoodHammerSmall: chip args[5], from an offset of the target, by (args[2], args[3]) in args[4]. */
const woodChip: Init = (sprite, run, args, done) => {
  sprite.startAnim(args[5]);
  sprite.x += flip(run, args[0]);
  sprite.y += args[1];
  later(sprite, () => slide(sprite, args[4], args[2], args[3]), done);
};

/** AnimMoveWorrySeed: arcs from the attacker to the target's spot in args[2], height args[3]. */
const worrySeed: Init = (sprite, run, args, done) => {
  placeAtAttacker(sprite, run, args);
  const [x, y] = battlerCoords(run, AnimBattler.Target);
  later(sprite, () => arc(sprite, args[2], x, y, args[3]), done);
};

/** AnimMoveWringOut: circles the target args[3] times, radius args[4], a lap in args[2] frames (args[5]: blended). */
const wringOut: Init = (sprite, run, args, done) => {
  placeAtTarget(sprite, run, args);
  if (args[5] === 1) sprite.mode = ObjMode.Blend;
  const speed = Math.trunc(256 / args[2]);
  let [phase, laps] = [64, args[3]];
  sprite.callback = () => {
    sprite.x2 = cos(phase, args[4]);
    sprite.y2 = sin(phase, args[4]);
    if (laps > 0) {
      if (phase + speed >= 256) laps--;
      phase = (phase + speed) % 256;
    } else if (phase < 64) phase += speed;
    else done();
  };
};

/** AnimateZenHeadbutt: under a battler's picture (args[0]) until its pulse ends. */
const zenHeadbutt: Init = (sprite, run, args, done) => {
  [sprite.x, sprite.y] = run.center(args[0] ? AnimBattler.Target : AnimBattler.Attacker);
  sprite.y += 18;
  goneAtAffineEnd(sprite, done);
};

// ---------- Templates ----------

/** The templates that wear a FireRed behavior, named by its template in `base`, or are new. */
export function gen4Templates(base: Record<string, AnimSpriteTemplate>): Record<string, AnimSpriteTemplate> {
  /**
   * A FireRed template's behavior in the expansion's art: frames and turns stay unless `look` gives
   * its own (undefined: none); its size and sprite mode are always `look`'s.
   */
  const skin = (from: string, look: Look): AnimSpriteTemplate => {
    const { init, anims, affineAnims } = base[from];
    return { anims, affineAnims, ...look, init };
  };
  const HAND32 = { width: 32, height: 32 } as const;
  const ORB16 = { width: 16, height: 16 } as const;
  return {
    // FireRed's behaviors.
    gAttackOrderParticleSpriteTemplate: skin("gTwisterRockSpriteTemplate", { tag: "ANIM_TAG_ATTACK_ORDER", ...ORB16, anims: LEAF_PARTICLE, affineAnims: undefined }),
    gAuraSphereBlast: skin("gSuperpowerFireballSpriteTemplate", { tag: "ANIM_TAG_IMPACT_2", ...HAND32, affineNormal: true }),
    gBattleAnimSpriteTemplate_LeafStorm: skin("gAirWaveCrescentSpriteTemplate", { tag: "ANIM_TAG_RAZOR_LEAF", width: 32, height: 16 }),
    gBattleAnimSpriteTemplate_LeafStorm2: skin("gNeedleArmSpikeSpriteTemplate", {
      tag: "ANIM_TAG_LEAF",
      ...ORB16,
      affine: true,
      anims: LEAF_PARTICLE,
      affineAnims: [[A(0x160, 0x160, 0, 0), A(-10, -10, 0, 10), A(10, 10, 0, 10), J(0)]],
    }),
    gChatterSingNotesTemplate: skin("gIceCrystalHitLargeSpriteTemplate", { tag: "ANIM_TAG_MUSIC_NOTES", ...ORB16, affine: true, anims: MUSIC_NOTES_ANIMS }),
    gContinentalCrushGrowingRockSpriteTemplate: skin("gGrowingChargeOrbSpriteTemplate", { tag: "ANIM_TAG_REALLY_BIG_ROCK", width: 64, height: 64, affineNormal: true }),
    gContinentalCrushNeedleArmSpriteTemplate: skin("gNeedleArmSpikeSpriteTemplate", { tag: "ANIM_TAG_ROCKS", ...HAND32, anims: [[F(32, 1), END], [F(48, 1), END], [F(64, 1), END]], affineAnims: undefined }),
    gCrushGripExplosionTemplate: skin("gOctazookaSmokeSpriteTemplate", { tag: "ANIM_TAG_EXPLOSION", ...HAND32, anims: EXPLOSION }),
    gCrushGripHandTemplate: skin("gRockBlastRockSpriteTemplate", { tag: "ANIM_TAG_PURPLE_HAND_OUTLINE", paletteTag: "ANIM_TAG_ACUPRESSURE", ...HAND32, affineNormal: true, affineAnims: [[A(0, 0, 0, 1), END], [A(0, 0, 96, 1), END]] }),
    gDarkPulseSpriteTemplate: skin("gShadowBallSpriteTemplate", { tag: "ANIM_TAG_PURPLE_RING", width: 16, height: 32, affine: true, affineAnims: SPINNING }),
    gDarkVoidPurpleStarsTemplate: skin("gGrantingStarsSpriteTemplate", { tag: "ANIM_TAG_SPARKLE_2", paletteTag: "ANIM_TAG_POISON_BUBBLE", ...HAND32 }),
    gDragonPulseSpriteTemplate: skin("gOctazookaBallSpriteTemplate", { tag: "ANIM_TAG_DRAGON_PULSE", width: 16, height: 32 }),
    gEnergyBallSpriteTemplate: skin("gShadowBallSpriteTemplate", { tag: "ANIM_TAG_ENERGY_BALL", ...HAND32, affineNormal: true }),
    gFlashCannonBallMovementTemplate: skin("gShadowBallSpriteTemplate", { tag: "ANIM_TAG_FLASH_CANNON_BALL", ...HAND32, affineNormal: true }),
    gFlashCannonGrayChargeTemplate: skin("gGrowingChargeOrbSpriteTemplate", { tag: "ANIM_TAG_CIRCLE_OF_LIGHT", paletteTag: "ANIM_TAG_HANDS_AND_FEET", width: 64, height: 64, affineNormal: true, blend: true }),
    gGreenPoisonBubble: skin("gAcidPoisonBubbleSpriteTemplate", { tag: "ANIM_TAG_GREEN_POISON_BUBBLE", ...ORB16, affine: true }),
    gGreenPoisonDrip: skin("gAcidPoisonDropletSpriteTemplate", { tag: "ANIM_TAG_GREEN_POISON_BUBBLE", ...ORB16, affine: true, anims: POISON_DROPLET }),
    gIceHammerPunchStompTemplate: skin("gStompFootSpriteTemplate", { tag: "ANIM_TAG_HORSESHOE_SIDE_FIST", ...HAND32, anims: HANDS_AND_FEET }),
    gJudgmentBlackChargeTemplate: skin("gGrowingChargeOrbSpriteTemplate", {
      tag: "ANIM_TAG_CIRCLE_OF_LIGHT",
      paletteTag: "ANIM_TAG_HANDS_AND_FEET",
      width: 64,
      height: 64,
      affineNormal: true,
      blend: true,
      affineAnims: [[A(16, 16, 0, 0), A(8, 8, 0, 15), A(0, 0, 0, 120), A(24, 24, 0, 5), A(0, 0, 0, 10), A(-16, -16, 0, 15), END]],
    }),
    gJudgmentGrayInwardOrbsTemplate: skin("gNeedleArmSpikeSpriteTemplate", { tag: "ANIM_TAG_ORBS", paletteTag: "ANIM_TAG_HANDS_AND_FEET", ...ORB16, affineNormal: true, blend: true, anims: [[F(8, 1), END]] }),
    gJudgmentGrayOutwardSpikesTemplate: skin("gNeedleArmSpikeSpriteTemplate", { tag: "ANIM_TAG_GREEN_SPIKE", paletteTag: "ANIM_TAG_GUST", ...ORB16, affineNormal: true }),
    gLuckyChantBigStarsSpriteTemplate: skin("gPetalDanceBigFlowerSpriteTemplate", { tag: "ANIM_TAG_GOLD_STARS", ...ORB16 }),
    gLuckyChantSmallStarsSpriteTemplate: skin("gPetalDanceSmallFlowerSpriteTemplate", { tag: "ANIM_TAG_GOLD_STARS", width: 8, height: 8 }),
    // The callback starts anim 2; the C's dummy table has none, so the sprite keeps its one frame.
    gMudBombSplash: skin("gSludgeBombHitParticleSpriteTemplate", { tag: "ANIM_TAG_MUD_SAND", width: 8, height: 8, anims: [[F(0, 1), END], [F(0, 1), END], [F(0, 1), END]], affineAnims: undefined }),
    gMudBombToss: skin("gWaterGunProjectileSpriteTemplate", { tag: "ANIM_TAG_MUD_SAND", ...ORB16, anims: [[F(1, 1), END]] }),
    gNightSlashLeftSpriteTemplate: skin("gSlashSliceSpriteTemplate", { tag: "ANIM_TAG_SLASH", ...HAND32, anims: NIGHT_SLASH_LEFT }),
    gNightSlashRightSpriteTemplate: skin("gSlashSliceSpriteTemplate", { tag: "ANIM_TAG_SLASH", ...HAND32, anims: NIGHT_SLASH_RIGHT }),
    gPalmSpriteTemplate: skin("gFistFootSpriteTemplate", { tag: "ANIM_TAG_PURPLE_HAND_OUTLINE", ...HAND32 }),
    gPowerGemOrbScatterSpriteTemplate: skin("gHiddenPowerOrbScatterSpriteTemplate", { tag: "ANIM_TAG_POWER_GEM", ...ORB16, affine: true }),
    gPowerGemOrbSpriteTemplate: skin("gHiddenPowerOrbSpriteTemplate", { tag: "ANIM_TAG_POWER_GEM", ...ORB16, affineNormal: true }),
    gPowerOrbs_Float: skin("gSporeParticleSpriteTemplate", { tag: "ANIM_TAG_RED_ORB", ...ORB16 }),
    gPsychoCutSpiralSpriteTemplate: skin("gOctazookaSmokeSpriteTemplate", { tag: "ANIM_TAG_SPIRAL", paletteTag: "ANIM_TAG_PSYCHO_CUT", width: 64, height: 64, affineNormal: true, blend: true, anims: undefined, affineAnims: [[A(0x100, 0x100, 0, 0), A(-2, -2, -10, 120), END]] }),
    gPunishmentSpriteTemplate: skin("gOctazookaSmokeSpriteTemplate", { tag: "ANIM_TAG_SCRATCH", paletteTag: "ANIM_TAG_POISON_BUBBLE", ...HAND32, affineNormal: true, anims: [[F(0, 4), F(16, 4), F(32, 4), F(48, 4), F(64, 4), END]] }),
    gReallyBigRockBlastRockSpriteTemplate: skin("gRockBlastRockSpriteTemplate", { tag: "ANIM_TAG_REALLY_BIG_ROCK", width: 64, height: 64, affine: true, anims: undefined, affineAnims: [[A(0x100, 0x100, 0, 0), END], [A(0x100, 0x100, 0, 0), END]] }),
    gRedHeartCharmSpriteTemplate: skin("gMagentaHeartSpriteTemplate", { tag: "ANIM_TAG_RED_HEART", ...ORB16 }),
    gRoarOfTimeBombTemplate: skin("gOctazookaSmokeSpriteTemplate", { tag: "ANIM_TAG_EXPLOSION", paletteTag: "ANIM_TAG_WATER_GUN", ...HAND32, anims: EXPLOSION }),
    gSeedFlareGreenChargeTemplate: skin("gGrowingChargeOrbSpriteTemplate", { tag: "ANIM_TAG_CIRCLE_OF_LIGHT", paletteTag: "ANIM_TAG_LEAF", width: 64, height: 64, affineNormal: true, blend: true }),
    gSeedFlareGreenCirclesTemplate: skin("gPowerAbsorptionOrbSpriteTemplate", { tag: "ANIM_TAG_ORBS", paletteTag: "ANIM_TAG_RAZOR_LEAF", ...ORB16, affineNormal: true, blend: true }),
    gSeedFlareGreenWavesTemplate: skin("gFlyingSandCrescentSpriteTemplate", { tag: "ANIM_TAG_FLYING_DIRT", paletteTag: "ANIM_TAG_LEAF", width: 32, height: 16 }),
    gShadowSneakImpactSpriteTemplate: skin("gIceCrystalHitLargeSpriteTemplate", { tag: "ANIM_TAG_IMPACT", paletteTag: "ANIM_TAG_HANDS_AND_FEET", ...HAND32, affineNormal: true, blend: true, anims: undefined }),
    gShakeMonOrPlatformSpriteTemplate: base.gShakeMonOrTerrainSpriteTemplate,
    gSpacialRendBladesTemplate: skin("gFireSpiralOutwardSpriteTemplate", { tag: "ANIM_TAG_PUNISHMENT_BLADES", paletteTag: "ANIM_TAG_PINK_HEART_2", ...HAND32, anims: BASIC_FIRE }),
    gSpacialRendBladesTemplate2: skin("gFireSpreadSpriteTemplate", { tag: "ANIM_TAG_PUNISHMENT_BLADES", paletteTag: "ANIM_TAG_PINK_HEART_2", ...HAND32 }),
    gSparkBeamSpriteTemplate: skin("gHydroPumpOrbSpriteTemplate", { tag: "ANIM_TAG_SPARK_2", ...ORB16, anims: [[F(0, 8), F(4, 8), F(8, 8), J(0)]] }),
    gSpinningVineSpriteTemplate: skin("gSpinningBoneSpriteTemplate", { tag: "ANIM_TAG_PUNISHMENT_BLADES", paletteTag: "ANIM_TAG_LEAF", ...HAND32, affineNormal: true }),
    gStoneEdgeSpriteTemplate: skin("gSwirlingDirtSpriteTemplate", { tag: "ANIM_TAG_STONE_EDGE", ...HAND32, anims: BASIC_FIRE }),
    gToxicSpikesSpriteTemplate: skin("gSpikesSpriteTemplate", { tag: "ANIM_TAG_TOXIC_SPIKES", ...ORB16 }),
    gUTurnBallBackSpriteTemplate: skin("gAbsorptionOrbSpriteTemplate", { tag: "ANIM_TAG_SMALL_BUBBLES", paletteTag: "ANIM_TAG_RAZOR_LEAF", ...ORB16, anims: undefined, affineAnims: undefined }),
    gUTurnBallSpriteTemplate: skin("gShadowBallSpriteTemplate", { tag: "ANIM_TAG_SMALL_BUBBLES", paletteTag: "ANIM_TAG_RAZOR_LEAF", ...ORB16, affineAnims: undefined }),

    // New callbacks.
    gAcupressureSpriteTemplate: { tag: "ANIM_TAG_ACUPRESSURE", ...HAND32, affine: true, affineAnims: [[A(256, 256, 0, 0), END], [A(0, 0, 1, 20), A(0, 0, -1, 40), END]], init: acupressure },
    gAquaTailHitSpriteTemplate: { tag: "ANIM_TAG_IMPACT", paletteTag: "ANIM_TAG_WATER_IMPACT", ...HAND32, affineNormal: true, blend: true, affineAnims: HIT_AFFINE, init: basicHit },
    gAquaTailKnockOffSpriteTemplate: { tag: "ANIM_TAG_SLAM_HIT_2", paletteTag: "ANIM_TAG_WATER_IMPACT", width: 64, height: 64, affineNormal: true, anims: SWING_ANIMS, affineAnims: SWING_AFFINE, init: swing },
    gAvalancheSpriteTemplate: { tag: "ANIM_TAG_ROCKS", paletteTag: "ANIM_TAG_ICE_CHUNK", ...HAND32, anims: [[F(32, 1), END], [F(48, 1), END], [F(64, 1), END]], init: avalanche },
    gDracoMeteorRocksSpriteTemplate: { tag: "ANIM_TAG_ROCKS", paletteTag: "ANIM_TAG_FAIRY_LOCK_CHAINS", ...HAND32, affineNormal: true, init: meteorRock },
    gDracoMeteorTailSpriteTemplate: { tag: "ANIM_TAG_WATER_GUN", ...ORB16, affine: true, blend: true, affineAnims: [[A(16, 16, 0, 16), END]], init: meteorRock },
    gDragonRushSpriteTemplate: { tag: "ANIM_TAG_SLAM_HIT_2", paletteTag: "ANIM_TAG_RED_HEART", width: 64, height: 64, affineNormal: true, anims: SWING_ANIMS, affineAnims: SWING_AFFINE, init: swing },
    gFeintSwipeSpriteTemplate: { tag: "ANIM_TAG_FEINT", width: 64, height: 64, affineNormal: true, init: feintSwipe },
    gFeintZoomSpriteTemplate: { tag: "ANIM_TAG_FEINT", width: 64, height: 64, affineNormal: true, affineAnims: [[A(0x200, 0x200, 0, 0), A(-30, -30, 0, 10), END]], init: zoomOnTarget },
    gForcePalmSpriteTemplate: { tag: "ANIM_TAG_IMPACT", paletteTag: "ANIM_TAG_SHADOW_BALL", ...HAND32, affineNormal: true, blend: true, affineAnims: HIT_AFFINE, init: basicHit },
    gGrassKnotSpriteTemplate: { tag: "ANIM_TAG_RAZOR_LEAF", width: 32, height: 16, anims: TUMBLE, init: bobbing },
    gGunkShoParticlesSpriteTemplate: { tag: "ANIM_TAG_WATER_ORB", paletteTag: "ANIM_TAG_POISON_BUBBLE", ...ORB16, blend: true, anims: [[F(0, 1), F(4, 1), F(8, 1), F(12, 1), J(0)]], init: gunkParticle },
    gGunkShotImpactSpriteTemplate: { tag: "ANIM_TAG_WATER_IMPACT", paletteTag: "ANIM_TAG_POISON_BUBBLE", ...HAND32, affineNormal: true, blend: true, affineAnims: HIT_AFFINE, init: basicHit },
    gIceShardSpriteTemplate: {
      tag: "ANIM_TAG_ICE_CRYSTALS",
      width: 8,
      height: 8,
      affine: true,
      blend: true,
      anims: [[F(6, 1), END]],
      affineAnims: [[A(16, 16, 0, 4), A(-16, -16, 0, 4), J(0)], [A(8, 8, 0, 16), END]],
      init: iceShard,
    },
    gLavaPlumeSpriteTemplate: { tag: "ANIM_TAG_FIRE_PLUME", ...HAND32, anims: [[F(0, 5), F(16, 5), F(32, 5), F(48, 5), F(64, 5), J(0)]], init: lavaPlume },
    gPluckParticleSpriteTemplate: { tag: "ANIM_TAG_SEED_BROWN", ...ORB16, init: pluck },
    gPoisonJabProjectileSpriteTemplate: { tag: "ANIM_TAG_PURPLE_JAB", width: 32, height: 16, affine: true, blend: true, init: poisonJab },
    gPowerSwapGuardSwapSpriteTemplate: { tag: "ANIM_TAG_COLORED_ORBS", ...ORB16, anims: pictures(6, 4), init: swapOrb },
    gPowerTrickSpriteTemplate: { tag: "ANIM_TAG_POWER_TRICK", width: 64, height: 64, affineNormal: true, affineAnims: SPINNING, init: onMonForDuration },
    gPsychoCutSpriteTemplate: { tag: "ANIM_TAG_PSYCHO_CUT", ...HAND32, affineNormal: true, init: psychoCut },
    gPunishmentImpactSpriteTemplate: { tag: "ANIM_TAG_IMPACT", paletteTag: "ANIM_TAG_POISON_BUBBLE", ...HAND32, affineNormal: true, affineAnims: HIT_AFFINE, init: basicHit },
    gRockPolishSparkleSpriteTemplate: { tag: "ANIM_TAG_SPARKLE_3", ...ORB16, anims: [[F(0, 7), F(4, 7), F(8, 7), F(12, 7), END]], init: sparkle },
    gRockPolishStreakSpriteTemplate: {
      tag: "ANIM_TAG_WHITE_STREAK",
      width: 32,
      height: 8,
      affine: true,
      blend: true,
      anims: [[F(0, 1), F(4, 2), F(8, 3), F(12, 15), F(8, 3), F(4, 2), F(0, 1), END]],
      affineAnims: STREAK_AFFINE,
      init: streak,
    },
    gSmallCloudTemplate: {
      tag: "ANIM_TAG_SMALL_CLOUD",
      ...ORB16,
      affineNormal: true,
      affineAnims: [[A(0x100, 0x100, 0, 0), END], [A(0x100, 0x100, 0, 0), A(-10, -10, 0, 15), END], [A(0x180, 0x180, 0, 0), A(-18, -18, 0, 21), END], [A(0xc0, 0xc0, 0, 0), A(-6, -6, 0, 15), END]],
      init: smallCloud,
    },
    gStealthRockSpriteTemplate: { tag: "ANIM_TAG_STEALTH_ROCK", ...ORB16, init: stealthRock },
    gSuckerPunchSpriteTemplate: { tag: "ANIM_TAG_POISON_JAB", ...ORB16, affineNormal: true, anims: TUMBLE, init: bobbing },
    gTrumpCardParticleSpriteTempalte: {
      tag: "ANIM_TAG_TRUMP_CARD_PARTICLES",
      width: 8,
      height: 8,
      affine: true,
      anims: pictures(3, 1),
      affineAnims: [[A(0xc0, 0xc0, 30, 0), END], [A(0xa0, 0xa0, 40, 0), END], [A(0xd0, 0xd0, -20, 0), END], [A(0xe0, 0xe0, 40, 0), END], [A(0xf0, 0xf0, 60, 0), END]],
      init: trumpParticle,
    },
    gTrumpCardSpriteTemplate: { tag: "ANIM_TAG_TRUMP_CARD", ...ORB16, affine: true, anims: pictures(3, 4), init: trumpCard },
    gWoodHammerHammerSpriteTemplate: { tag: "ANIM_TAG_WOOD_HAMMER_HAMMER", width: 64, height: 64, affine: true, affineAnims: WOOD_HAMMER_AFFINE, init: woodHammer },
    gWoodHammerSmallSpriteTemplate: { tag: "ANIM_TAG_WOOD_HAMMER", ...HAND32, anims: [[F(48, 1), END], [F(64, 1), END], [F(80, 1), END]], init: woodChip },
    gWorrySeedSpriteTemplate: { tag: "ANIM_TAG_WORRY_SEED", ...ORB16, init: worrySeed },
    gWringOutHandSpriteTemplate: { tag: "ANIM_TAG_WRING_OUT", ...HAND32, affine: true, init: wringOut },
    gZenHeadbuttSpriteTemplate: {
      tag: "ANIM_TAG_CIRCLE_OF_LIGHT",
      paletteTag: "ANIM_TAG_WATER_IMPACT",
      width: 64,
      height: 64,
      affineNormal: true,
      blend: true,
      affineAnims: [[A(0x10, 0x10, 0, 0), A(8, 8, 0, 18), { loop: 0 }, A(-5, -5, 0, 8), A(5, 5, 0, 8), { loop: 5 }, END]],
      init: zenHeadbutt,
    },
  };
}

// ---------- Tasks ----------

export const GEN4_TASKS: Record<string, AnimTask> = {
  /** AnimTask_BlendNightSlash: the slash's colors turn red. */
  *AnimTask_BlendNightSlash(run) {
    const { palettes } = run.flow.gba;
    run.loadTag("ANIM_TAG_SLASH");
    palettes.blendPalette(256 + (palettes.spritePaletteSlot("ANIM_TAG_SLASH") & 15) * 16, 16, 6, 0x001f);
  },

  /** AnimTask_CompressTargetHorizontally: the target narrows, holds and widens again. */
  *AnimTask_CompressTargetHorizontally(run) {
    const mon = run.target.sprite;
    if (mon) yield* monAffine(mon, [A(64, 0, 0, 16), A(0, 0, 0, 64), A(-64, 0, 0, 16), END]);
  },

  /** AnimTask_SquishTarget: the target flattens, holds and rises again. */
  *AnimTask_SquishTarget(run) {
    const mon = run.target.sprite;
    if (mon) yield* monAffine(mon, [A(0, 64, 0, 16), A(0, 0, 0, 64), A(0, -64, 0, 16), END]);
  },

  /** AnimTask_SetAnimTargetToAttackerOpposite: from here on the script aims across from the attacker. */
  *AnimTask_SetAnimTargetToAttackerOpposite(run) {
    run.retarget(run.opponent);
  },
};

/** The sounds these templates play on their own. */
export const GEN4_TASK_SOUNDS: Record<string, readonly string[]> = { gIceShardSpriteTemplate: ["se_m_sand_attack"] };

/** The tags these tasks and templates draw on their own (TryLoadSpriteAssets, TryLoadPal in the expansion's C). */
export const GEN4_TASK_TAGS: Record<string, readonly string[]> = {
  gFistFootRandomPosSpriteTemplate: ["ANIM_TAG_IMPACT"],
  AnimTask_BlendNightSlash: ["ANIM_TAG_SLASH"],
  AnimTask_BrineRain: ["ANIM_TAG_GLOWY_BLUE_ORB", "ANIM_TAG_WATER_IMPACT"],
  AnimTask_DarkVoidBlackHole: ["ANIM_TAG_WHITE_SHADOW", "ANIM_TAG_QUICK_GUARD_HAND"],
  AnimTask_DestinyBondWhiteShadow: ["ANIM_TAG_WHITE_SHADOW"],
  AnimTask_ElectricChargingParticles: ["ANIM_TAG_ELECTRIC_ORBS"],
  AnimTask_FlashCannonCharge: ["ANIM_TAG_ELECTRIC_ORBS", "ANIM_TAG_GUST"],
  AnimTask_HeartSwap: ["ANIM_TAG_PINKVIO_ORB"],
};
