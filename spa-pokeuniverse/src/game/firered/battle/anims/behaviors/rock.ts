// Rock (battle_anim_rock.c): falling and flying rocks, vortices, Rollout and Seismic Toss's sky.

import type { AnimCmd, AffineCmd } from "../../../../gba/sprites";
import type { SoundId } from "../../../manifest";
import { AnimBattler, type AnimRun, type AnimSpriteTemplate, type AnimTask } from "../script";
import { A, arc, battlerCoords, cos, ellipse, END, F, flip, flyTo, J, monSprite, placeAtAttacker, placeAtTarget, runSprite, sin, slide, toTargetLocation } from "./util";

const ARG_RET = 7;
const ROCK = { tag: "ANIM_TAG_ROCKS", width: 32, height: 32 } as const;
const FLYING_ROCK: AnimCmd[][] = [[F(32, 1), END], [F(48, 1), END], [F(64, 1), END]];
/** sAnims_BasicRock: biggest to smallest. */
const BASIC_ROCK: AnimCmd[][] = [0, 16, 32, 48, 64, 80].map((image) => [F(image, 1), END]);
const ROCK_AFFINE: AffineCmd[][] = [[A(0, 0, -5, 5), J(0)], [A(0, 0, 5, 5), J(0)]];
/** gAnims_BasicFire. */
export const BASIC_FIRE: AnimCmd[][] = [[F(0, 4), F(16, 4), F(32, 4), F(48, 4), F(64, 4), J(0)]];
/** gAnims_WaterMudOrb. */
export const WATER_MUD_ORB: AnimCmd[][] = [[F(0, 1), F(4, 1), F(8, 1), F(12, 1), J(0)]];

/** AnimParticleInVortex: rises at args[2] 1/256 from the battler's spot (args[6]), swaying args[5] wide at args[4], args[3] + 1 frames. */
const vortex: AnimSpriteTemplate["init"] = (sprite, run, args, done) => {
  if (args[6] === 0) placeAtAttacker(sprite, run, args, false);
  else placeAtTarget(sprite, run, args, false);
  let [rise, phase, left] = [0, 0, args[3]];
  sprite.callback = () => {
    rise += args[2];
    sprite.y2 = -(rise >> 8);
    sprite.x2 = sin(phase, args[5]);
    phase = (phase + args[4]) & 0xff;
    if (--left === -1) done();
  };
};

/**
 * AnimMoveTwisterParticle: circles the target low (args[3] wide) for args[0] frames at args[2], twice
 * as fast while args[0] is under args[4]; rises 2 a frame while args[1] lasts (0xFF: always).
 */
export const twisterParticle: AnimSpriteTemplate["init"] = (sprite, _run, args, done) => {
  sprite.y += 32;
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
    sprite.priority = phase < 0x80 ? 1 : 3;
    if (--left === 0) done();
  };
};

/** AnimWeatherBallDown: falls from above onto the target. */
export const weatherBallDown: AnimSpriteTemplate["init"] = (sprite, run, args, done) => {
  const toX = sprite.x + args[4];
  const toY = sprite.y + args[5];
  if (!run.target.foe) {
    sprite.x += args[4] + 30;
    sprite.y = args[5] - 20;
  } else {
    sprite.x += args[4] - 30;
    sprite.y = args[5] - 80;
  }
  flyTo(sprite, args[2], toX, toY, done);
};

/** gRolloutMudSpriteTemplate / gRolloutRockSpriteTemplate: AnimRolloutParticle. */
const ROLLOUT_MUD: AnimSpriteTemplate = {
  tag: "ANIM_TAG_MUD_SAND",
  width: 8,
  height: 8,
  init(sprite, _run, args, done) {
    runSprite(sprite, arc(sprite, args[0], args[1], args[2], args[3]), done);
  },
};
const ROLLOUT_ROCK: AnimSpriteTemplate = { ...ROLLOUT_MUD, tag: "ANIM_TAG_ROCKS", width: 32, height: 32 };

/** GetRolloutCounter: the hit of the run (1-5); the first when no one says. */
const rolloutCounter = (run: AnimRun) => run.rolloutHit ?? 1;

export const ROCK_TEMPLATES: Record<string, AnimSpriteTemplate> = {
  /** AnimFallingRock: falls in two arcs, the second args[2] pixels to its side. */
  gFallingRockSpriteTemplate: {
    ...ROCK,
    anims: FLYING_ROCK,
    init(sprite, run, args, done) {
      if (args[3] !== 0) [sprite.x, sprite.y] = battlerCoords(run, AnimBattler.Target);
      sprite.x += args[0];
      sprite.y += 14;
      sprite.startAnim(args[1]);
      runSprite(
        sprite,
        (function* () {
          yield* ellipse(sprite, 16, 0, 0, -70, 4);
          sprite.x += args[2];
          yield* ellipse(sprite, 32, 192, args[2], -24, 4);
        })(),
        done,
      );
    },
  },

  /** AnimRockFragment: flies off by (args[2], args[3]) in args[4]. */
  gRockFragmentSpriteTemplate: {
    ...ROCK,
    anims: FLYING_ROCK,
    init(sprite, run, args, done) {
      sprite.startAnim(args[5]);
      sprite.x += flip(run, args[0]);
      sprite.y += args[1];
      runSprite(
        sprite,
        (function* () {
          yield;
          yield* slide(sprite, args[4], args[2], args[3]);
        })(),
        done,
      );
    },
  },

  gSwirlingDirtSpriteTemplate: { tag: "ANIM_TAG_MUD_SAND", width: 8, height: 8, init: vortex },
  gWhirlpoolSpriteTemplate: {
    tag: "ANIM_TAG_WATER_ORB",
    width: 16,
    height: 16,
    affineNormal: true,
    blend: true,
    anims: WATER_MUD_ORB,
    affineAnims: [[A(0xc0, 0xc0, 0, 0), A(2, -3, 0, 5), A(-2, 3, 0, 5), J(1)]],
    init: vortex,
  },
  gFireSpinSpriteTemplate: { tag: "ANIM_TAG_SMALL_EMBER", width: 32, height: 32, anims: BASIC_FIRE, init: vortex },

  /** AnimRaiseSprite: rises from the attacker's spot by args[2] in args[3] (Ancient Power). */
  gAncientPowerRockSpriteTemplate: {
    ...ROCK,
    anims: BASIC_ROCK,
    init(sprite, run, args, done) {
      sprite.startAnim(args[4]);
      placeAtAttacker(sprite, run, args, false);
      flyTo(sprite, args[3], sprite.x, sprite.y + args[2], done);
    },
  },

  /** AnimRockTomb: falls from above, accelerating, onto args[1], stays args[3] frames. */
  gRockTombRockSpriteTemplate: {
    ...ROCK,
    anims: BASIC_ROCK,
    init(sprite, _run, args, done) {
      sprite.startAnim(args[4]);
      sprite.x2 = args[0];
      let [fall, speed, left] = [-args[2], 3, args[3]];
      sprite.invisible = true;
      sprite.callback = () => {
        sprite.invisible = false;
        if (fall !== 0) {
          sprite.y2 = args[1] + fall;
          fall += speed++;
          if (fall > 0) fall = 0;
        } else if (--left === 0) done();
      };
    },
  },

  /** AnimRockBlastRock: TranslateAnimSpriteToTargetMonLocation, spinning the other way for the foe. */
  gRockBlastRockSpriteTemplate: {
    ...ROCK,
    affineNormal: true,
    anims: BASIC_ROCK,
    affineAnims: ROCK_AFFINE,
    init(sprite, run, args, done) {
      if (run.attacker.foe) sprite.startAffineAnim(1);
      toTargetLocation(sprite, run, args, done);
    },
  },

  /** AnimRockScatter: bursts from the target's spot in a small hop. */
  gRockScatterSpriteTemplate: {
    ...ROCK,
    affineNormal: true,
    anims: BASIC_ROCK,
    affineAnims: ROCK_AFFINE,
    init(sprite, run, args, done) {
      [sprite.x, sprite.y] = battlerCoords(run, AnimBattler.Target);
      sprite.x += args[0];
      sprite.y += args[1];
      sprite.startAnim(args[3]);
      let [t, ox, oy] = [0, 0, 0];
      sprite.callback = () => {
        t += 8;
        ox += args[0];
        oy += args[1];
        sprite.x2 += Math.trunc(ox / 40);
        sprite.y2 -= sin(t, args[2]);
        if (t > 140) done();
      };
    },
  },

  gTwisterRockSpriteTemplate: { ...ROCK, anims: BASIC_ROCK.slice(4), init: twisterParticle },
  gWeatherBallRockDownSpriteTemplate: { ...ROCK, affineNormal: true, anims: BASIC_ROCK.slice(2), affineAnims: ROCK_AFFINE, init: weatherBallDown },
};

export const ROCK_TASK_SOUNDS: Record<string, readonly string[]> = { AnimTask_Rollout: ["se_m_headbutt", "se_m_dig"] };

export const ROCK_TASKS: Record<string, AnimTask> = {
  /** AnimTask_Rollout: the attacker rolls at the target and back, throwing dirt or rocks by the hit of the run. */
  *AnimTask_Rollout(run) {
    const mon = monSprite(run, AnimBattler.Attacker);
    if (!mon) return;
    const [fromX] = run.center(AnimBattler.Attacker);
    const fromY = battlerCoords(run, AnimBattler.Attacker)[1] + 24;
    const [toX] = run.center(AnimBattler.Target);
    const toY = battlerCoords(run, AnimBattler.Target)[1] + 24;
    const hit = rolloutCounter(run);
    let total = hit === 1 ? 32 : 48 - hit * 8;
    const every = (total >> 3) - 1;
    const stepX = Math.trunc(((toX - fromX) * 8) / total);
    const stepY = Math.trunc(((toY - fromY) * 8) / total);
    const panFrom = run.pan(-64);
    const panStep = Math.trunc((run.pan(63) - panFrom) / total);
    let pan = panFrom;
    let [ox, oy, n] = [0, 0, 0];
    yield;
    // Back up, a thud each frame.
    do {
      ox -= stepX;
      oy -= stepY;
      mon.x2 = ox >> 3;
      mon.y2 = oy >> 3;
      run.play("se_m_headbutt" as SoundId, pan);
      yield;
    } while (++n !== 10);
    for (let left = 20; --left > 0; ) yield;
    while (--n !== 0) {
      ox += stepX;
      oy += stepY;
      mon.x2 = ox >> 3;
      mon.y2 = oy >> 3;
      yield;
    }
    mon.x2 = mon.y2 = 0;
    yield;
    // Across the field, leaving particles behind.
    let [x, y, side] = [fromX * 8, fromY * 8, 1];
    const tiles = hit === 4 ? 64 : hit === 5 ? 48 : 80;
    while (total-- > 0) {
      x += stepX;
      y += stepY;
      if (++n >= every) {
        n = 0;
        const px = (x >> 3) + side * 4;
        const py = y >> 3;
        const size = hit === 1 ? ROLLOUT_MUD : ROLLOUT_ROCK;
        const s = run.createSprite(size, px, py, 35, [18, side * 20 + px + hit * 3, py, -16 - hit * 2]);
        if (s && hit !== 1) s.tileNum += tiles;
        side = -side;
        pan += panStep;
        run.play("se_m_dig" as SoundId, pan);
      }
      yield;
    }
    // The last particles land (18 frames each).
    for (let left = 18; left > 0; left--) yield;
  },

  /** AnimTask_GetSeismicTossDamageLevel: 0 small, 1 medium, 2 large. */
  *AnimTask_GetSeismicTossDamageLevel(run) {
    const dmg = run.moveDamage ?? 0;
    run.args[ARG_RET] = dmg < 33 ? 0 : dmg < 66 ? 1 : 2;
  },

  /** AnimTask_MoveSeismicTossBg: the background flies by, slowing, 120 frames. */
  *AnimTask_MoveSeismicTossBg(run) {
    let speed = 200;
    for (let t = 0; t <= 120; t++) {
      run.backdrop.scrollY += Math.trunc(speed / 10);
      speed -= 3;
      if (t === 120) return;
      yield;
    }
  },

  /** AnimTask_SeismicTossBgAccelerateDownAtEnd: the background shakes until the script sets args[7] to 0xFFF. */
  *AnimTask_SeismicTossBgAccelerateDownAtEnd(run) {
    const start = run.backdrop.scrollY;
    let phase = 0;
    for (;;) {
      phase = (phase + 80) & 0xff;
      run.backdrop.scrollY = start + cos(4, phase);
      if (run.args[ARG_RET] === 0xfff) {
        run.backdrop.scrollY = 0;
        return;
      }
      yield;
    }
  },
};
