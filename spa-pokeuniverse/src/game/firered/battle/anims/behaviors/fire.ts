// Fire (battle_anim_fire.c): flames that spread, spiral and rise, and Eruption's rocks.

import type { SoundId } from "../../../manifest";
import { AnimBattler, type AnimSpriteTemplate, type AnimTask } from "../script";
import { BASIC_FIRE, weatherBallDown } from "./rock";
import { A, cos, END, F, growingCircle, J, monSprite, pixelLine, placeAtAttacker, resetMonScale, runSprite, sideX, sin, slideAt, speedSteps, squash, toTargetLocation, travel } from "./util";

const ANIM_PALETTE = 8;
const SPIRAL_SPREAD = [[F(16, 4), F(32, 4), F(48, 4), J(0)], [F(16, 4, "hv"), F(32, 4, "hv"), F(48, 4, "hv"), J(0)]];
const LARGE_FLAME = [[F(0, 3), F(16, 3), F(32, 3), F(48, 3), F(64, 3), F(80, 3), F(96, 3), F(112, 3), J(0)]];
const EMBER = { tag: "ANIM_TAG_SMALL_EMBER", width: 32, height: 32 } as const;
const FIRE = { tag: "ANIM_TAG_FIRE", width: 32, height: 32 } as const;

/** AnimLargeFlame_Step: moves (dx, dy) a frame for `moves` frames, gone after `life`. */
function flameStep(sprite: Parameters<AnimSpriteTemplate["init"]>[0], life: number, dx: number, dy: number, moves: number, done: () => void) {
  let n = 0;
  sprite.callback = () => {
    if (++n < moves) {
      sprite.x2 += dx;
      sprite.y2 += dy;
    }
    if (n === life) done();
  };
}

/** AnimLargeFlame: from where it starts, offset away from the attacker. */
const largeFlame: AnimSpriteTemplate["init"] = (sprite, run, args, done) => {
  sprite.x += sideX(run, args[0]);
  sprite.y += args[1];
  flameStep(sprite, args[2], sideX(run, -args[4]), args[5], args[3], done);
};

export const FIRE_TEMPLATES: Record<string, AnimSpriteTemplate> = {
  /** AnimFireSpread: by (args[2], args[3]) 8.8 a frame for args[4] frames. */
  gFireSpreadSpriteTemplate: {
    ...EMBER,
    anims: SPIRAL_SPREAD,
    init(sprite, run, args, done) {
      sprite.x += sideX(run, args[0]);
      sprite.y += args[1];
      runSprite(
        sprite,
        (function* () {
          yield;
          yield* slideAt(sprite, args[4], args[2], args[3]);
        })(),
        done,
      );
    },
  },

  /** AnimFireSpiralInward: a shrinking circle on the target. */
  gFireSpiralInwardSpriteTemplate: {
    ...EMBER,
    anims: SPIRAL_SPREAD,
    init(sprite, _run, args, done) {
      runSprite(sprite, growingCircle(sprite, 60, args[0], 30, 9, -0x200), done);
    },
  },

  gLargeFlameSpriteTemplate: { ...FIRE, affineNormal: true, anims: LARGE_FLAME, affineAnims: [[A(0x32, 0x100, 0, 0), A(0x20, 0, 0, 7), END]], init: largeFlame },
  gLargeFlameScatterSpriteTemplate: { ...FIRE, anims: LARGE_FLAME, init: largeFlame },

  /** AnimFirePlume: from the attacker, toward the target. */
  gFirePlumeSpriteTemplate: {
    tag: "ANIM_TAG_FIRE_PLUME",
    width: 32,
    height: 32,
    anims: [[F(0, 5), F(16, 5), F(32, 5), F(48, 5), F(64, 5), J(0)]],
    init(sprite, run, args, done) {
      [sprite.x, sprite.y] = run.center(AnimBattler.Attacker);
      sprite.x += sideX(run, args[0]);
      sprite.y += args[1];
      flameStep(sprite, args[2], sideX(run, args[4]), args[5], args[3], done);
    },
  },

  gEmberSpriteTemplate: { ...EMBER, init: toTargetLocation },
  /** AnimEmberFlare: AnimTravelDiagonally. */
  gEmberFlareSpriteTemplate: { ...EMBER, anims: BASIC_FIRE, init: toTargetLocation },

  /** AnimFireRing: circles the attacker, circles on to the target, circles there. */
  gFireBlastRingSpriteTemplate: {
    ...EMBER,
    anims: BASIC_FIRE,
    init(sprite, run, args, done) {
      placeAtAttacker(sprite, run, args);
      let phase = args[2];
      const ring = () => {
        const off = [sin(phase, 28), cos(phase, 28)];
        phase = (phase + 20) & 0xff;
        return off;
      };
      runSprite(
        sprite,
        (function* () {
          yield;
          for (let n = 0; n < 0x12; n++) {
            [sprite.x2, sprite.y2] = ring();
            yield;
          }
          const [tx, ty] = run.center(AnimBattler.Target);
          const line = travel(sprite, 0x19, tx, ty);
          while (!line.next().done) {
            const [x, y] = ring();
            sprite.x2 += x;
            sprite.y2 += y;
            yield;
          }
          [sprite.x, sprite.y] = [tx, ty];
          for (let n = 0; n < 0x1f; n++) {
            [sprite.x2, sprite.y2] = ring();
            yield;
          }
        })(),
        done,
      );
    },
  },

  /** AnimFireCross: straight by (args[3], args[4]) a frame for args[2] frames. */
  gFireBlastCrossSpriteTemplate: {
    ...EMBER,
    anims: [[F(32, 6), F(48, 6), J(0)]],
    init(sprite, _run, args, done) {
      sprite.x += args[0];
      sprite.y += args[1];
      runSprite(
        sprite,
        (function* () {
          yield;
          yield* pixelLine(sprite, args[2], args[3], args[4]);
        })(),
        done,
      );
    },
  },

  /** AnimFireSpiralOutward: after args[3] frames, a growing spiral from the attacker. */
  gFireSpiralOutwardSpriteTemplate: {
    ...EMBER,
    anims: BASIC_FIRE,
    init(sprite, run, args, done) {
      placeAtAttacker(sprite, run, args);
      sprite.invisible = true;
      runSprite(
        sprite,
        (function* () {
          for (let wait = args[3]; wait >= 0; wait--) yield;
          sprite.invisible = false;
          let [phase, radius] = [0, 0];
          for (let left = args[2]; left >= 0; left--) {
            sprite.x2 = sin(phase, radius >> 8);
            sprite.y2 = cos(phase, radius >> 8);
            phase = (phase + 10) & 0xff;
            radius += 0xd0;
            yield;
          }
        })(),
        done,
      );
    },
  },

  gWeatherBallFireDownSpriteTemplate: { ...EMBER, anims: BASIC_FIRE, init: weatherBallDown },

  /** AnimEruptionFallingRock: at (args[0], args[1]), after args[2] falls to args[3] and rattles. */
  gEruptionFallingRockSpriteTemplate: {
    tag: "ANIM_TAG_WARM_ROCK",
    width: 32,
    height: 32,
    init(sprite, _run, args, done) {
      sprite.x = args[0];
      sprite.y = args[1];
      sprite.tileNum += args[4] * 16;
      runSprite(
        sprite,
        (function* () {
          yield;
          for (let wait = args[2]; wait > 0; wait--) yield;
          for (;;) {
            sprite.y += 8;
            if (sprite.y >= args[3]) break;
            yield;
          }
          sprite.y = args[3];
          yield;
          let [timer, dir, n] = [0, 0, 0];
          for (;;) {
            if (++timer > 1) {
              timer = 0;
              sprite.y2 = ++dir & 1 ? -3 : 3;
            }
            if (++n > 16) return;
            yield;
          }
        })(),
        done,
      );
    },
  },

  /** AnimWillOWispOrb: sinks at the attacker, swaying, then weaves to the target; the first (args[2] 0) sounds. */
  gWillOWispOrbSpriteTemplate: {
    tag: "ANIM_TAG_WISP_ORB",
    width: 16,
    height: 16,
    anims: [[F(0, 5), F(4, 5), F(8, 5), F(12, 5), J(0)], [F(16, 5), END], [F(20, 5), END], [F(20, 5), END]],
    init(sprite, run, args, done) {
      placeAtAttacker(sprite, run, args, false);
      sprite.startAnim(args[2]);
      const foe = run.attacker.foe;
      sprite.priority = run.target.sprite?.priority ?? sprite.priority;
      runSprite(
        sprite,
        (function* () {
          let phase = 0;
          const sway = foe ? 4 : -4;
          yield;
          sprite.y2 = foe ? -(192 >> 8) : 192 >> 8;
          sprite.x2 = sin(phase, sway);
          phase = (phase + 4) & 0xff;
          yield;
          for (let n = 0; n < 31; n++) {
            sprite.x2 = sin(phase, sway);
            phase = (phase + 4) & 0xff;
            if (n < 30) yield;
          }
          sprite.x += sprite.x2;
          sprite.y += sprite.y2;
          sprite.x2 = sprite.y2 = 0;
          yield;
          const [tx, ty] = run.center(AnimBattler.Target);
          const line = travel(sprite, speedSteps(tx - sprite.x, 256), tx, ty);
          let wave = 0;
          while (!line.next().done) {
            sprite.x2 += sin(wave, 16);
            const old = wave;
            wave = (wave + 4) & 0xff;
            if ((old === 0 || old > 196) && wave > 0 && args[2] === 0) run.play("se_m_flame_wheel" as SoundId, run.customPan);
            yield;
          }
        })(),
        done,
      );
    },
  },

  /** AnimWillOWispFire: spirals out around the target, flickers at the end. */
  gWillOWispFireSpriteTemplate: {
    tag: "ANIM_TAG_WISP_FIRE",
    width: 32,
    height: 32,
    anims: [[F(0, 5), F(16, 5), F(32, 5), F(48, 5), J(0)]],
    init(sprite, run, args, done) {
      const base = run.target.sprite?.priority ?? 2;
      let [phase, rx, ry, n] = [args[0], 0, 0, 0];
      sprite.callback = () => {
        rx += 0xc0 * 2;
        ry += 0xa0;
        sprite.x2 = sin(phase, rx >> 8);
        sprite.y2 = cos(phase, ry >> 8);
        phase = (phase + 7) & 0xff;
        sprite.priority = phase < 64 || phase > 195 ? base : base + 1;
        if (++n > 0x14) sprite.invisible = !sprite.invisible;
        if (n === 0x1e) done();
      };
    },
  },
};

export const FIRE_TASK_SOUNDS: Record<string, readonly string[]> = { gWillOWispOrbSpriteTemplate: ["se_m_flame_wheel"] };

/** sEruptionLaunchRockSpeeds. */
const ROCK_SPEEDS = [[-2, -5], [-1, -1], [3, -6], [4, -2], [2, -8], [-5, -5], [4, -7]];

const SHAKE_PATTERNS = [
  [-1, -1, 0, 1, 1, 0, 0, -1, -1, 1, 1, 0, 0, -1, 0, 1],
  [-1, 0, 1, 0, -1, 1, 0, -1, 0, 1, 0, -1, 0, 1, 0, 1],
];

export const FIRE_TASKS: Record<string, AnimTask> = {
  /** AnimTask_ShakeTargetInPattern: args[0] frames, offset args[1], vertically if args[2], pattern args[3]. */
  *AnimTask_ShakeTargetInPattern(run, args) {
    const mon = run.target.sprite;
    if (!mon) return;
    for (let n = 1; ; n++) {
      const dir = SHAKE_PATTERNS[args[3] ? 1 : 0][n % 10];
      if (args[2] === 1) mon.y2 = Math.abs(args[1] * dir);
      else mon.x2 = args[1] * dir;
      if (n === args[0]) break;
      yield;
    }
    mon.x2 = mon.y2 = 0;
  },

  /** AnimTask_MoveHeatWaveTargets: the target is pushed back shaking, held, and returns. */
  *AnimTask_MoveHeatWaveTargets(run) {
    const mon = run.target.sprite;
    if (!mon) return;
    const side = run.attacker.foe ? -1 : 1;
    let [push, shake, wait, flips] = [0, 0, 0, 0];
    const leg = function* (frames: number, every: number, by: number) {
      for (let n = 0; n < frames; n++) {
        push += by;
        if (++wait >= every) {
          wait = 0;
          shake = ++flips & 1 ? 2 : -2;
        }
        mon.x2 = push + shake;
        yield;
      }
    };
    yield;
    yield* leg(16, 2, side * 2);
    yield* leg(96, 5, 0);
    yield* leg(16, 2, -side * 2);
    mon.x2 = 0;
  },

  /** AnimTask_BlendBackground: the animations' BG palette toward args[1], args[0] of 16. */
  *AnimTask_BlendBackground(run, args) {
    run.flow.gba.palettes.blendPalette(ANIM_PALETTE * 16, 16, args[0], args[1]);
  },

  /** AnimTask_EruptionLaunchRocks: the attacker squashes shaking, stretches and throws rocks up. */
  *AnimTask_EruptionLaunchRocks(run) {
    const mon = monSprite(run, AnimBattler.Attacker);
    if (!mon) return;
    const foe = run.attacker.foe;
    const startY = mon.y;
    let active = 0;
    yield;
    let [t1, t2, t3] = [0, 0, 0];
    const first = squash(mon, 0x100, 0x100, 0xe0, 0x200, 32);
    while (!first.next().done) {
      if (++t1 > 1) {
        t1 = 0;
        mon.x2 = ++t2 & 1 ? 3 : -3;
      }
      if (foe && ++t3 > 4) {
        t3 = 0;
        mon.y++;
      }
      yield;
    }
    mon.x2 = 0;
    for (let n = 0; n < 5; n++) yield;
    const yTall = foe ? 0xf0 : 0xc0;
    yield* squash(mon, 0xe0, 0x200, 0x180, yTall, 6);
    const y = mon.y + mon.y2 - 32 + (foe ? 44 : 74);
    const x = mon.x + (foe ? 16 : -12);
    const sign = foe ? -1 : 1;
    ROCK_SPEEDS.forEach(([speedX, speedY], i) => {
      active++;
      run.createSprite(
        {
          tag: "ANIM_TAG_WARM_ROCK",
          width: 16,
          height: 16,
          init(sprite, _run, _args, done) {
            sprite.tileNum += (i % 5) * 4 + 0x40;
            let [delay, stage, px, py] = [0, 0, sprite.x * 8, sprite.y * 8];
            sprite.callback = () => {
              if (++delay > 2) {
                delay = 0;
                stage++;
                py += stage * stage;
              }
              px += speedX * sign * 8;
              sprite.x = px >> 3;
              py += speedY * 8;
              sprite.y = py >> 3;
              if (sprite.x < -8 || sprite.x > 248 || sprite.y < -8 || sprite.y > 120) {
                active--;
                done();
              }
            };
          },
        },
        x,
        y,
        2,
      );
    });
    [t1, t2, t3] = [0, 0, 0];
    for (;;) {
      if (++t1 > 1) {
        t1 = 0;
        mon.y2 += ++t2 & 1 ? 3 : -3;
      }
      if (++t3 > 24) break;
      yield;
    }
    if (t2 & 1) mon.y2 -= 3;
    const last = squash(mon, 0x180, yTall, 0x100, 0x100, 8);
    while (!last.next().done) {
      if (foe) mon.y--;
      yield;
    }
    mon.y = startY;
    resetMonScale(mon);
    while (active > 0) yield;
  },
};
