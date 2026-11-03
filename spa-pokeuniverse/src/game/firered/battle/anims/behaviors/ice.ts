// Ice (battle_anim_ice.c): crystals, snowballs that cross the screen, fog and poison gas clouds.

import { SIN } from "../../../../gba/trig";
import { Effect, Layer } from "../../../../gba/video";
import type { AnimArtFiles } from "../../../manifest";
import { initBg } from "../../../common";
import { AnimBattler, type AnimRun, type AnimSpriteTemplate, type AnimTask } from "../script";
import { weatherBallDown } from "./rock";
import { A, arc, animEnd, backOffScreen, battlerCoords, cos, END, F, fastLine, fastSteps, flip, flyTo, goneAtAnimEnd, growingCircle, J, lineOffScreen, placeAtAttacker, placeAtTarget, random, runSprite, sin, speedSteps, toTargetLocation, travel } from "./util";

const ANIM_PALETTE = 8;
const CRYSTAL_AFFINE = [[A(0xce, 0xce, 0, 0), A(5, 5, 0, 10), A(0, 0, 0, 6), END]];
const CRYSTAL = { tag: "ANIM_TAG_ICE_CRYSTALS" } as const;
const LARGE = [[F(4, 1), END]];
const SMALL = [[F(6, 1), END]];
const SNOWBALL = [[F(7, 1), END]];
const CLOUD = [[F(0, 8), F(8, 8), J(0)]];

/** AnimIceEffectParticle: grows on the target, then flickers for 20 frames. */
const crystal: AnimSpriteTemplate["init"] = (sprite, run, args, done) => {
  placeAtTarget(sprite, run, args);
  let n = 0;
  sprite.callback = () => {
    if (!sprite.affineEnded) return;
    sprite.invisible = !sprite.invisible;
    if (++n === 20) done();
  };
};

/** AnimIcePunchSwirlingParticle. */
const swirling: AnimSpriteTemplate["init"] = (sprite, _run, args, done) => {
  runSprite(sprite, growingCircle(sprite, 60, args[0], 30, 9, -512), done);
};

/** AnimIceBeamParticle: from the attacker to the target's picture, offset by (args[2], args[3]), in args[4]. */
const beamParticle: AnimSpriteTemplate["init"] = (sprite, run, args, done) => {
  placeAtAttacker(sprite, run, args);
  const [x, y] = run.center(AnimBattler.Target);
  flyTo(sprite, args[4], x + flip(run, args[2]), y + args[3], done);
};

/** AnimMoveParticleBeyondTarget: from behind the attacker's side across the screen, wiggling. */
const beyondTarget: AnimSpriteTemplate["init"] = (sprite, run, args, done) => {
  placeAtAttacker(sprite, run, args);
  const [x, y] = run.center(AnimBattler.Target);
  const [stepX, stepY] = fastLine(x + flip(run, args[2]) - sprite.x, y + args[3] - sprite.y, args[4]);
  backOffScreen(sprite, stepX, stepY);
  let phase = 0;
  const wiggle = () => {
    sprite.y2 += sin(phase, args[5]);
    phase = (phase + args[6]) & 0xff;
  };
  runSprite(
    sprite,
    (function* () {
      yield;
      yield* lineOffScreen(sprite, stepX, stepY, wiggle);
    })(),
    done,
  );
};

/** InitSwirlingFogAnim: falls by args[2] in args[3] on a battler (args[4]), swaying and passing behind it. */
const swirlingFog: AnimSpriteTemplate["init"] = (sprite, run, args, done) => {
  const which = args[4] === 0 ? AnimBattler.Attacker : AnimBattler.Target;
  if (which === AnimBattler.Attacker) placeAtAttacker(sprite, run, args, false);
  else placeAtTarget(sprite, run, args, false);
  if (!run.target.foe) sprite.y += 8;
  const base = run.mon(which).sprite?.priority ?? 2;
  const line = travel(sprite, args[3], sprite.x, sprite.y + args[2]);
  let phase = 64;
  const step = () => {
    if (line.next().done) return done();
    sprite.x2 += sin(phase, 0x20);
    sprite.y2 += cos(phase, -6);
    sprite.priority = ((phase - 64) & 0xffff) <= 0x7f ? base : base + 1;
    phase = (phase + 3) & 0xff;
  };
  sprite.callback = step;
  step();
};

/** The target's hit of a Rollout run (GetRolloutCounter), counted from 0. */
const rolloutIndex = (run: AnimRun) => Math.max(0, (run.rolloutHit ?? 1) - 1);

export const ICE_TEMPLATES: Record<string, AnimSpriteTemplate> = {
  gIceCrystalHitLargeSpriteTemplate: { ...CRYSTAL, width: 8, height: 16, affineNormal: true, blend: true, anims: LARGE, affineAnims: CRYSTAL_AFFINE, init: crystal },
  gIceCrystalHitSmallSpriteTemplate: { ...CRYSTAL, width: 8, height: 8, affineNormal: true, blend: true, anims: SMALL, affineAnims: CRYSTAL_AFFINE, init: crystal },
  gIceCrystalSpiralInwardLarge: { ...CRYSTAL, width: 8, height: 16, affine: true, blend: true, anims: LARGE, affineAnims: [[A(0, 0, 40, 1), J(0)]], init: swirling },
  gIceCrystalSpiralInwardSmall: { ...CRYSTAL, width: 8, height: 8, blend: true, anims: SMALL, init: swirling },
  gIceBeamInnerCrystalSpriteTemplate: { ...CRYSTAL, width: 8, height: 16, affineNormal: true, blend: true, anims: LARGE, affineAnims: [[A(0, 0, 10, 1), J(0)]], init: beamParticle },
  gIceBeamOuterCrystalSpriteTemplate: { ...CRYSTAL, width: 8, height: 8, blend: true, anims: SMALL, init: beamParticle },
  gBlizzardIceCrystalSpriteTemplate: { ...CRYSTAL, width: 16, height: 16, anims: [[F(8, 1), END]], init: beyondTarget },
  gPowderSnowSnowballSpriteTemplate: { ...CRYSTAL, width: 8, height: 8, anims: SNOWBALL, init: beyondTarget },

  /** AnimSwirlingSnowball: from off screen to the target, a loop around it, on off screen. */
  gSwirlingSnowballSpriteTemplate: {
    ...CRYSTAL,
    width: 8,
    height: 8,
    anims: SNOWBALL,
    init(sprite, run, args, done) {
      placeAtAttacker(sprite, run, args);
      const [cx, cy] = run.center(AnimBattler.Target);
      const [toX, toY] = [cx + flip(run, args[2]), cy + args[3]];
      const [stepX, stepY] = fastLine(toX - sprite.x, toY - sprite.y, args[4]);
      backOffScreen(sprite, stepX, stepY);
      const radius = run.attacker.foe ? 20 : -20;
      runSprite(
        sprite,
        (function* () {
          yield;
          let [x, y] = [0, 0];
          for (let left = fastSteps(toX - sprite.x, args[4]); left > 0; left--) {
            x += stepX;
            y += stepY;
            sprite.x2 = x >> 8;
            sprite.y2 = y >> 8;
            yield;
          }
          sprite.x += sprite.x2;
          sprite.y += sprite.y2;
          sprite.x2 = sprite.y2 = 0;
          const [baseX, baseY] = [sin(128, radius), cos(128, 15)];
          let phase = 128;
          for (let n = 0; n < 32; n++) {
            sprite.x2 = sin(phase, radius) - baseX;
            sprite.y2 = cos(phase, 15) - baseY;
            phase = (phase + 16) & 0xff;
            yield;
          }
          sprite.x += sprite.x2;
          sprite.y += sprite.y2;
          sprite.x2 = sprite.y2 = 0;
          yield;
          yield* lineOffScreen(sprite, stepX, stepY);
        })(),
        done,
      );
    },
  },

  /** AnimWaveFromCenterOfTarget: a spike on the target's spot, gone at the end of its animation. */
  gIceGroundSpikeSpriteTemplate: {
    tag: "ANIM_TAG_ICE_SPIKES",
    width: 8,
    height: 16,
    blend: true,
    anims: [[F(0, 5), F(2, 5), F(4, 5), F(6, 5), F(4, 5), F(2, 5), F(0, 5), END]],
    init(sprite, run, args, done) {
      placeAtTarget(sprite, run, args, false);
      goneAtAnimEnd(sprite, done);
    },
  },

  gMistCloudSpriteTemplate: { tag: "ANIM_TAG_MIST_CLOUD", width: 32, height: 16, blend: true, anims: CLOUD, init: swirlingFog },
  gSmogCloudSpriteTemplate: { tag: "ANIM_TAG_PURPLE_GAS_CLOUD", width: 32, height: 16, blend: true, anims: CLOUD, init: swirlingFog },

  /** AnimThrowMistBall: TranslateAnimSpriteToTargetMonLocation from the attacker's picture. */
  gMistBallSpriteTemplate: {
    tag: "ANIM_TAG_SMALL_BUBBLES",
    width: 16,
    height: 16,
    init(sprite, run, args, done) {
      [sprite.x, sprite.y] = run.center(AnimBattler.Attacker);
      sprite.callback = () => toTargetLocation(sprite, run, args, done);
    },
  },

  /** InitPoisonGasCloudAnim: weaves to the target, circles down around it, drifts off screen. */
  gPoisonGasCloudSpriteTemplate: {
    tag: "ANIM_TAG_PURPLE_GAS_CLOUD",
    width: 32,
    height: 16,
    blend: true,
    anims: CLOUD,
    init(sprite, run, args, done) {
      const onPlayer = !run.target.foe;
      const [offX, offX2] = onPlayer ? [-args[1], -args[3]] : [args[1], args[3]];
      const base = run.target.sprite?.priority ?? 2;
      const reverse = onPlayer;
      [sprite.x, sprite.y] = run.center(AnimBattler.Attacker);
      const [targetX, targetY] = args[7] ? run.center(AnimBattler.Target) : battlerCoords(run, AnimBattler.Target);
      const startX = sprite.x + offX;
      const startY = sprite.y + args[2];
      sprite.x = startX;
      sprite.y = startY;
      runSprite(
        sprite,
        (function* () {
          yield;
          let wave = 0;
          let line = travel(sprite, args[0], targetX + offX2, targetY + args[4]);
          while (!line.next().done) {
            sprite.x2 += SIN[wave] >> 4;
            wave = (wave + (reverse ? -8 : 8)) & 0xff;
            yield;
          }
          sprite.x = battlerCoords(run, AnimBattler.Target)[0];
          sprite.y += sprite.y2;
          sprite.y2 = 0;
          wave = onPlayer ? 80 : 204;
          sprite.x2 = SIN[wave] >> 3;
          wave = (wave + 2) & 0xff;
          line = travel(sprite, 80, sprite.x, sprite.y + 29);
          while (!line.next().done) {
            sprite.x2 += SIN[wave] >> 3;
            sprite.y2 += (SIN[wave + 0x40] * -3) >> 8;
            sprite.priority = ((wave - 0x40) & 0xffff) <= 0x7f ? base : base + 1;
            wave = (wave + 4) & 0xff;
            yield;
          }
          sprite.x += sprite.x2;
          sprite.y += sprite.y2;
          sprite.x2 = sprite.y2 = 0;
          const toX = onPlayer ? -0x10 : 0x100;
          yield* travel(sprite, speedSteps(toX - sprite.x, 0x300), toX, sprite.y + 4);
        })(),
        done,
      );
    },
  },

  gWeatherBallIceDownSpriteTemplate: { tag: "ANIM_TAG_HAIL", width: 16, height: 16, affineNormal: true, affineAnims: [[A(0x150, 0x150, 0, 0), END]], init: weatherBallDown },

  /** InitIceBallAnim: thrown in an arc, bigger with each hit of the run, and breaks. */
  gIceBallChunkSpriteTemplate: {
    tag: "ANIM_TAG_ICE_CHUNK",
    width: 32,
    height: 32,
    affine: true,
    anims: [[F(0, 1), END], [F(16, 4), F(32, 4), F(48, 4), F(64, 4), END]],
    affineAnims: [0xe0, 0x118, 0x150, 0x180, 0x1c0].map((scale) => [A(scale, scale, 0, 0), END]),
    init(sprite, run, args, done) {
      sprite.startAffineAnim(Math.min(rolloutIndex(run), 4));
      placeAtAttacker(sprite, run, args);
      const [x, y] = run.center(AnimBattler.Target);
      runSprite(
        sprite,
        (function* () {
          yield;
          yield* arc(sprite, args[4], x + flip(run, args[2]), y + args[3], args[5]);
          sprite.startAnim(1);
          yield;
          yield* animEnd(sprite);
        })(),
        done,
      );
    },
  },

  /** InitIceBallParticle: drifts off the target at a random angle, 21 frames. */
  gIceBallImpactShardSpriteTemplate: {
    ...CRYSTAL,
    width: 8,
    height: 8,
    anims: SMALL,
    init(sprite, run, args, done) {
      sprite.tileNum += 8;
      placeAtTarget(sprite, run, args);
      const stepX = (random(256) & 0xff) + 256;
      let stepY = random(512);
      if (stepY > 0xff) stepY = 256 - stepY;
      let [x, y, n] = [0, 0, 0];
      sprite.callback = () => {
        x += stepX;
        y += stepY;
        sprite.x2 = stepX & 1 ? -(x >> 8) : x >> 8;
        sprite.y2 = y >> 8;
        if (++n === 21) done();
      };
    },
  },
};

export const ICE_ART: Record<string, AnimArtFiles> = {
  fog: { png: "weather/fog_horizontal.png", pal: "weather/fog_horizontal.png", bin: "battle_anims/backgrounds/fog.bin" },
};
export const ICE_TASK_ART: Record<string, string[]> = { AnimTask_HazeScrollingFog: ["fog"], AnimTask_MistBallFog: ["fog"] };

const HAZE_LEVELS = [0, 1, 2, 2, 2, 2, 3, 4, 4, 4, 5, 6, 6, 6, 6, 7, 8, 8, 8, 9];
const MIST_LEVELS = [0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 5];

/** Haze's and Mist Ball's fog on BG1: it scrolls left as it fades in, stays and fades out. */
function* fog(run: AnimRun, fadeIn: () => Generator<number, void, void>, total: (level: number) => number): Generator<void, void, void> {
  const art = run.art("fog");
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
  const scroll = () => (bg1.x -= 256);
  let level = 0;
  yield;
  for (const value of fadeIn()) {
    level = value;
    scroll();
    video.eva = level;
    video.evb = total(level);
    yield;
  }
  for (let n = 0; n < 0x51; n++) {
    scroll();
    yield;
  }
  for (;;) {
    for (let wait = 0; wait < 4; wait++) {
      scroll();
      if (wait < 3) yield;
    }
    video.eva = --level;
    video.evb = 16 - level;
    if (level === 0) break;
    yield;
  }
  yield;
  bg1.visible = false;
  bg1.x = 0;
  video.resetBlend();
}

export const ICE_TASKS: Record<string, AnimTask> = {
  /** AnimTask_HazeScrollingFog: fades in a step every 4 frames. */
  *AnimTask_HazeScrollingFog(run) {
    yield* fog(
      run,
      function* () {
        for (let i = 1; i < HAZE_LEVELS.length; i++) {
          for (let wait = 0; wait < 3; wait++) yield HAZE_LEVELS[i - 1];
          yield HAZE_LEVELS[i];
        }
      },
      (level) => 16 - level,
    );
  },

  /** AnimTask_MistBallFog: fades in a step a frame. */
  *AnimTask_MistBallFog(run) {
    yield* fog(
      run,
      function* () {
        yield* MIST_LEVELS.slice(1);
      },
      (level) => 17 - level,
    );
  },

  /** AnimTask_GetRolloutCounter: the hit of a Rollout run, in the arg args[0] names. */
  *AnimTask_GetRolloutCounter(run, args) {
    run.args[args[0]] = rolloutIndex(run);
  },
};
