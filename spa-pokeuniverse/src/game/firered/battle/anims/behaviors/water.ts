// Water (battle_anim_water.c): bubbles, beams on a sine wave, Surf's wave and Water Spout's drops.

import type { Sprite } from "../../../../gba/sprites";
import { SIN } from "../../../../gba/trig";
import { Effect, Layer } from "../../../../gba/video";
import type { AnimArtFiles } from "../../../manifest";
import { initBg } from "../../../common";
import { AnimBattler, type AnimRun, type AnimSpriteTemplate, type AnimTask } from "../script";
import { MON_MOVEMENT_TASKS } from "./mon-movement";
import { BASIC_HIT_SPLAT } from "./particles";
import { DROPLET_AFFINE } from "./poison";
import { WATER_MUD_ORB, weatherBallDown } from "./rock";
import { A, animEnd, arc, battlerCoords, cos, F, END, flip, flyTo, frames, J, monSprite, placeAtAttacker, placeAtTarget, random, resetMonScale, runSprite, sin, squash, throwProjectile, toTargetLocation, travel } from "./util";

const ARG_RET = 7;
const ANIM_PALETTE = 8;
const SMALL_BUBBLES = { tag: "ANIM_TAG_SMALL_BUBBLES" } as const;
const WATER_ORB = { tag: "ANIM_TAG_WATER_ORB", width: 16, height: 16, blend: true, anims: WATER_MUD_ORB } as const;
/** gGrowingRingAffineAnimTable. */
export const GROWING_RING = [[A(32, 32, 0, 0), A(7, 7, 0, 200), END]];

/** AnimToTargetInSinWave: 30 frames from the attacker to the target, bent by a half sine that restarts. */
const sinWave: AnimSpriteTemplate["init"] = (sprite, run, args, done) => {
  placeAtAttacker(sprite, run, args);
  const [x, y] = run.center(AnimBattler.Target);
  const line = travel(sprite, 30, x, y);
  const speed = Math.trunc(0xd200 / 30);
  let amp = args[3];
  let phase = args[7] * 256;
  if (args[7] > 127) {
    phase = (args[7] - 127) * 256;
    amp = -amp;
  }
  const step = () => {
    if (line.next().done) return done();
    sprite.y2 += sin(phase >> 8, amp);
    if ((phase + speed) >> 8 > 127) {
      phase = 0;
      amp = -amp;
    } else phase += speed;
  };
  sprite.callback = step;
  step();
};

/** The attacker's HP quarter (GetWaterSpoutPowerForAnim): the event comes later, so its power says it (150 at full HP). */
const spoutPower = (run: AnimRun) => Math.min(3, Math.trunc(((run.movePower ?? 150) * 4) / 150));

export const WATER_TEMPLATES: Record<string, AnimSpriteTemplate> = {
  gHydroPumpOrbSpriteTemplate: { ...WATER_ORB, init: sinWave },
  gMudShotOrbSpriteTemplate: { ...WATER_ORB, tag: "ANIM_TAG_BROWN_ORB", init: sinWave },
  gSignalBeamRedOrbSpriteTemplate: { tag: "ANIM_TAG_GLOWY_RED_ORB", width: 8, height: 8, init: sinWave },
  gSignalBeamGreenOrbSpriteTemplate: { tag: "ANIM_TAG_GLOWY_GREEN_ORB", width: 8, height: 8, init: sinWave },
  gFlamethrowerFlameSpriteTemplate: { tag: "ANIM_TAG_SMALL_EMBER", width: 32, height: 32, anims: [[F(16, 2), F(32, 2), F(48, 2), J(0)]], init: sinWave },
  gPsywaveRingSpriteTemplate: { tag: "ANIM_TAG_BLUE_RING", width: 16, height: 32, affine: true, affineAnims: GROWING_RING, init: sinWave },
  gWaterGunProjectileSpriteTemplate: { ...SMALL_BUBBLES, width: 16, height: 16, blend: true, anims: [[F(0, 1), END]], init: throwProjectile },
  gWeatherBallWaterDownSpriteTemplate: { ...SMALL_BUBBLES, width: 16, height: 16, affineNormal: true, anims: [[F(4, 1), END]], affineAnims: [[A(0x150, 0x150, 0, 0), A(0, 0, 0, 15), END]], init: weatherBallDown },

  /** AnimAuroraBeamRings: to the target; bursts when a task sets the last arg (-1). */
  gAuroraBeamRingSpriteTemplate: {
    tag: "ANIM_TAG_RAINBOW_RINGS",
    width: 8,
    height: 16,
    affine: true,
    anims: [[F(0, 1), END], [F(4, 1), END]],
    affineAnims: [[A(0, 0, 0, 1), A(0x60, 0x60, 0, 1), END]],
    init(sprite, run, args, done) {
      placeAtAttacker(sprite, run, args);
      const [x, y] = run.center(AnimBattler.Target);
      const line = travel(sprite, args[4], x + flip(run, args[2]), y + args[3]);
      sprite.affineAnimPaused = true;
      const step = () => {
        if ((run.args[7] & 0xffff) === 0xffff) {
          sprite.startAnim(1);
          sprite.affineAnimPaused = false;
        }
        if (line.next().done) done();
      };
      sprite.callback = step;
      step();
    },
  },

  /** AnimHydroCannonCharge: on the attacker's spot until its affine animation ends. */
  gHydroCannonChargeSpriteTemplate: {
    ...WATER_ORB,
    affine: true,
    affineAnims: [[A(3, 3, 10, 50), A(0, 0, 0, 10), A(-0x14, -0x14, -10, 20), END]],
    init(sprite, run, _args, done) {
      [sprite.x, sprite.y] = battlerCoords(run, AnimBattler.Attacker);
      sprite.y2 = -10;
      const sub = run.attacker.sprite?.subpriority ?? 2;
      sprite.x2 = run.attacker.foe ? -10 : 10;
      sprite.subpriority = run.attacker.foe ? sub - 2 : sub + 2;
      sprite.callback = () => {
        if (sprite.affineEnded) done();
      };
    },
  },

  gHydroCannonBeamSpriteTemplate: { ...WATER_ORB, affine: true, affineAnims: [[A(0x150, 0x150, 0, 0), END]], init: toTargetLocation },

  /** AnimWaterGunDroplet: from the target by args[2], args[4]. */
  gWaterGunDropletSpriteTemplate: {
    ...SMALL_BUBBLES,
    width: 16,
    height: 16,
    affine: true,
    blend: true,
    anims: [[F(4, 1), END]],
    affineAnims: DROPLET_AFFINE,
    init(sprite, run, args, done) {
      placeAtTarget(sprite, run, args);
      flyTo(sprite, args[4], sprite.x + args[2], sprite.y + args[4], done);
    },
  },

  /** AnimWaterPulseBubble: at a fixed spot, rising and swaying, args[5] frames. */
  gWaterPulseBubbleSpriteTemplate: {
    ...SMALL_BUBBLES,
    width: 8,
    height: 8,
    anims: [[F(8, 1), END], [F(9, 1), END]],
    init(sprite, _run, args, done) {
      sprite.x = args[0];
      sprite.y = args[1];
      let [rise, phase, left] = [0, 0, args[5]];
      sprite.callback = () => {
        rise -= args[2];
        sprite.y2 = Math.trunc(rise / 10);
        phase = (phase + args[3]) & 0xff;
        sprite.x2 = sin(phase, args[4]);
        if (--left === 0) done();
      };
    },
  },

  /** AnimSmallDriftingBubbles: drifts off the target at a random angle, 21 frames. */
  gSmallDriftingBubblesSpriteTemplate: {
    tag: "ANIM_TAG_SMALL_BUBBLES",
    width: 8,
    height: 8,
    init(sprite, run, args, done) {
      sprite.tileNum += 8;
      placeAtTarget(sprite, run, args);
      const stepX = random(256) | 256;
      let stepY = random(512);
      if (stepY > 255) stepY = 256 - stepY;
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

  /** AnimWaterBubbleProjectile: weaves to the target for args[6] frames, then pops and stays 10. */
  gWaterBubbleProjectileSpriteTemplate: {
    tag: "ANIM_TAG_BUBBLE",
    width: 16,
    height: 16,
    affineNormal: true,
    blend: true,
    anims: [[F(0, 1), F(4, 5), F(8, 5), END]],
    affineAnims: [[A(-5, -5, 0, 10), A(5, 5, 0, 10), J(0)]],
    init(sprite, run, args, done) {
      const [ax, ay] = run.center(AnimBattler.Attacker);
      const [tx, ty] = run.center(AnimBattler.Target);
      sprite.x = ax + flip(run, args[0]);
      sprite.y = ay + args[1];
      sprite.animPaused = true;
      const ampX = flip(run, args[2]);
      const start = args[4] & 0xff;
      const axis = (d: number) => {
        const step = (((Math.abs(d) << 8) & 0xffff) / args[6]) & 0xffff;
        return d < 0 ? step | 1 : step & ~1;
      };
      const [stepX, stepY] = [axis(tx - sprite.x), axis(ty - sprite.y)];
      sprite.x -= sin(start, ampX);
      sprite.y -= cos(start, args[3]);
      let [x, y, phase, left] = [0, 0, start * 256, args[6]];
      runSprite(
        sprite,
        (function* () {
          while (left-- > 0) {
            x = (x + stepX) & 0xffff;
            y = (y + stepY) & 0xffff;
            sprite.x2 = (stepX & 1 ? -(x >> 8) : x >> 8) + sin((phase >> 8) & 0xff, ampX);
            sprite.y2 = (stepY & 1 ? -(y >> 8) : y >> 8) + cos((phase >> 8) & 0xff, args[3]);
            phase = (phase + args[5]) & 0xffff;
            yield;
          }
          sprite.animPaused = false;
          yield;
          yield* animEnd(sprite);
          yield* frames(10);
        })(),
        done,
      );
    },
  },

  /** AnimSmallBubblePair: rises and sways on the battler (args[3]), args[2] + 1 frames. */
  gSmallBubblePairSpriteTemplate: {
    tag: "ANIM_TAG_ICE_CRYSTALS",
    width: 8,
    height: 8,
    anims: [[F(12, 6), F(13, 6), J(0)]],
    init(sprite, run, args, done) {
      if (args[3] !== AnimBattler.Attacker) placeAtTarget(sprite, run, args);
      else placeAtAttacker(sprite, run, args);
      let [phase, rise, left] = [0, 0, args[2]];
      sprite.callback = () => {
        phase = (phase + 11) & 0xff;
        sprite.x2 = sin(phase, 4);
        rise += 48;
        sprite.y2 = -(rise >> 8);
        if (left-- === 0) done();
      };
    },
  },
};

export const WATER_ART: Record<string, AnimArtFiles> = {
  surfPlayer: { png: "battle_anims/backgrounds/water.png", pal: "battle_anims/backgrounds/water.png", bin: "battle_anims/backgrounds/water_player.bin" },
  surfOpponent: { png: "battle_anims/backgrounds/water.png", pal: "battle_anims/backgrounds/water.png", bin: "battle_anims/backgrounds/water_opponent.bin" },
  muddyPalette: { png: "battle_anims/backgrounds/water.png", pal: "battle_anims/backgrounds/water_muddy.pal" },
};
export const WATER_TASK_ART: Record<string, string[]> = { AnimTask_CreateSurfWave: ["surfPlayer", "surfOpponent", "muddyPalette"] };

/** gSmallWaterOrbSpriteTemplate's shape; each task moves it its own way. */
const smallOrb = (init: (sprite: Sprite, done: () => void) => void): AnimSpriteTemplate => ({
  tag: "ANIM_TAG_GLOWY_BLUE_ORB",
  width: 8,
  height: 8,
  init: (sprite, _run, _args, done) => init(sprite, done),
});

export const WATER_TASKS: Record<string, AnimTask> = {
  /** AnimTask_RotateAuroraRingColors: the rings' first 8 colors turn, args[0] frames. */
  *AnimTask_RotateAuroraRingColors(run, args) {
    const base = 256 + (run.flow.gba.palettes.spritePaletteSlot("ANIM_TAG_RAINBOW_RINGS") & 15) * 16 + 1;
    const { faded } = run.flow.gba.palettes;
    let [wait, n] = [0, 0];
    for (;;) {
      yield;
      if (++wait === 3) {
        wait = 0;
        const first = faded[base];
        for (let i = 1; i < 8; i++) faded[base + i - 1] = faded[base + i];
        faded[base + 7] = first;
      }
      if (++n === args[0]) return;
    }
  },

  /**
   * AnimTask_CreateSurfWave: the wave's BG crosses the screen, its colors turning. FireRed widens
   * the blended lines with a scanline effect; here the whole BG blends (the wave has few other tiles).
   */
  *AnimTask_CreateSurfWave(run, args) {
    const foe = run.attacker.foe;
    const art = run.art(foe ? "surfOpponent" : "surfPlayer");
    if (!art) return;
    const { gba } = run.flow;
    const { video, palettes } = gba;
    Object.assign(video, { effect: Effect.Blend, target1: Layer.BG1, target2: Layer.ALL, eva: 0, evb: 16 });
    const bg1 = video.bgs[1];
    initBg(bg1, 1, 1);
    bg1.tiles = art.tiles;
    bg1.map.set(art.map!.subarray(0, bg1.map.length));
    bg1.visible = true;
    const colors = args[0] === 0 ? art.palette : (run.art("muddyPalette")?.palette ?? art.palette);
    palettes.load(colors, ANIM_PALETTE * 16, 16);
    let [x, y, dx, dy] = foe ? [-224, 256, 2, -1] : [0, -48, -2, 1];
    bg1.x = x * 256;
    bg1.y = y * 256;
    const base = ANIM_PALETTE * 16;
    let [turn, wait, level, count] = [0, 1, 0, 0];
    for (;;) {
      yield;
      x += dx;
      y += dy;
      bg1.x = x * 256;
      bg1.y = y * 256;
      if (++turn === 4) {
        turn = 0;
        const last = palettes.faded[base + 7];
        for (let i = 6; i !== 0; i--) palettes.faded[base + 1 + i] = palettes.faded[base + i];
        palettes.faded[base + 1] = last;
      }
      if (++wait > 1) {
        wait = 0;
        if (++count < 14) {
          video.eva = count;
          video.evb = 16 - count;
          level++;
        }
        if (count > 54) {
          level--;
          video.eva = level;
          video.evb = 16 - level;
        }
      }
      if ((video.eva & 0x1f) === 0) break;
    }
    yield;
    bg1.visible = false;
    bg1.x = bg1.y = 0;
    video.resetBlend();
  },

  /** AnimTask_WaterSpoutLaunch: the attacker squashes shaking and throws drops up, more with more HP. */
  *AnimTask_WaterSpoutLaunch(run) {
    const mon = monSprite(run, AnimBattler.Attacker);
    if (!mon) return;
    const startY = mon.y;
    const power = spoutPower(run);
    let active = 0;
    yield;
    let [wait, flips] = [0, 0];
    const first = squash(mon, 0x100, 0x100, 224, 0x200, 32);
    while (!first.next().done) {
      if (++wait > 1) {
        wait = 0;
        if (++flips & 1) {
          mon.x2 = 3;
          mon.y++;
        } else mon.x2 = -3;
      }
      yield;
    }
    mon.x2 = 0;
    for (let n = 0; n < 5; n++) yield;
    yield* squash(mon, 224, 0x200, 384, 224, 8);
    const [ax, ay] = run.center(AnimBattler.Attacker);
    const sub = (mon.subpriority ?? 2) - 1;
    const increment = Math.max(1, 4 - power);
    let angle = 172;
    for (let i = 0; i < 20; i += increment) {
      const [index, vx0, vy0, skip] = [i, cos(angle, 64), sin(angle, 64), active & 1];
      active++;
      run.createSprite(
        smallOrb((sprite, done) => {
          const vx = vx0 + (index % 6) * 3;
          const vy = vy0 + (index % 3) * 3;
          let [px, py] = [ax * 16, ay * 16];
          const step = () => {
            px += vx;
            py += vy;
            sprite.x = px >> 4;
            sprite.y = py >> 4;
            if (sprite.x < -8 || sprite.x > 248 || sprite.y < -8 || sprite.y > 120) {
              active--;
              done();
            }
          };
          sprite.callback = step;
          if (skip) step();
        }),
        ax,
        ay,
        sub,
      );
      angle = (angle + increment * 2) & 0xff;
    }
    [wait, flips] = [0, 0];
    while (flips !== 10) {
      yield;
      if (++wait > 1) {
        wait = 0;
        mon.y2 += ++flips & 1 ? 2 : -2;
      }
    }
    const last = squash(mon, 384, 224, 0x100, 0x100, 8);
    while (!last.next().done) {
      mon.y--;
      yield;
    }
    resetMonScale(mon);
    mon.y = startY;
    while (active > 0) yield;
  },

  /** AnimTask_WaterSpoutRain: drops fall on the foe's side and splash; the first splash shakes the target. */
  *AnimTask_WaterSpoutRain(run) {
    const player = !run.attacker.foe;
    const [left, top] = player ? [136, 40] : [16, 80];
    const total = spoutPower(run) * 5 + 5;
    let [x, phase, made, active, wait] = [left + 49, 0, 0, 0, 0];
    let [splashed, shaken] = [false, false];
    yield;
    for (;;) {
      if (++wait > 2) {
        wait = 0;
        const stop = ((SIN[phase] + 3) >> 4) + top;
        active++;
        run.createSprite(
          smallOrb((sprite, done) => {
            sprite.callback = () => {
              sprite.y += 8;
              if (sprite.y < stop) return;
              splashed = true;
              run.createSprite(
                {
                  ...BASIC_HIT_SPLAT,
                  tag: "ANIM_TAG_WATER_IMPACT",
                  init(hit, _run, _args, gone) {
                    hit.startAffineAnim(3);
                    let [t, n] = [0, 0];
                    hit.callback = () => {
                      if (++t <= 1) return;
                      t = 0;
                      hit.invisible = !hit.invisible;
                      if (++n === 12) {
                        active--;
                        gone();
                      }
                    };
                  },
                },
                sprite.x,
                sprite.y,
                1,
              );
              done();
            };
          }),
          x,
          0,
          0,
        );
        made++;
        phase = (phase + 39) & 0xff;
        x = random(98) + left;
      }
      if (splashed && !shaken) {
        run.spawn(MON_MOVEMENT_TASKS.AnimTask_HorizontalShake(run, [AnimBattler.Target, 0, 12]));
        shaken = true;
      }
      if (made >= total) break;
      yield;
    }
    while (active > 0) yield;
  },

  /** AnimTask_WaterSport: a stream of drops sweeps across the screen, three times lower each. */
  *AnimTask_WaterSport(run) {
    const [ax, ay] = run.center(AnimBattler.Attacker);
    const dir = run.attacker.foe ? -1 : 1;
    let [toX, toY, wait, active, landed] = [ax + dir * 8, ay - dir * 8, 0, 0, false];
    const drop = () => {
      if (++wait <= 1) return;
      wait = 0;
      active++;
      const [x, y] = [toX, toY];
      run.createSprite(
        smallOrb((sprite, done) => {
          runSprite(
            sprite,
            (function* () {
              yield* arc(sprite, 16, x, y, -32);
              sprite.x += sprite.x2;
              sprite.y += sprite.y2;
              sprite.x2 = sprite.y2 = 0;
              yield* arc(sprite, 6, random(32) - 16 + sprite.x, random(32) - 16 + sprite.y, ~random(8));
              landed = true;
              active--;
            })(),
            done,
          );
        }),
        ax,
        ay,
        10,
      );
    };
    const outOfRange = () => !(toX >= -16 && toX <= 256);
    yield;
    while (!landed) {
      drop();
      yield;
    }
    for (let n = 0; n <= 16; n++) {
      drop();
      yield;
    }
    let sweeps = 0;
    for (;;) {
      while (!outOfRange()) {
        drop();
        toX += dir * 6;
        yield;
      }
      if (++sweeps > 2) break;
      for (let n = 0; n <= 7; n++) {
        drop();
        toY -= dir * 2;
        yield;
      }
      do {
        drop();
        toX -= dir * 6;
        yield;
      } while (!outOfRange());
      sweeps++;
      for (let n = 0; n <= 7; n++) {
        drop();
        toY -= dir * 2;
        yield;
      }
    }
    while (active > 0) yield;
  },

  /** AnimTask_StartSinAnimTimer: args[7] counts by 3 (of 256) for args[0] frames. */
  *AnimTask_StartSinAnimTimer(run, args) {
    run.args[ARG_RET] = 0;
    let left = args[0];
    for (;;) {
      yield;
      run.args[ARG_RET] = (run.args[ARG_RET] + 3) & 0xff;
      if (--left === 0) return;
    }
  },
};
