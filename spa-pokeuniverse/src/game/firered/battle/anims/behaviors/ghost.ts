// Ghost (battle_anim_ghost.c): shadows, clones and confuse rays.

import { SIN } from "../../../../gba/trig";
import { ObjMode } from "../../../../gba/sprites";
import { Effect, Layer } from "../../../../gba/video";
import type { SoundId } from "../../../manifest";
import { AnimBattler, type AnimRun, type AnimSpriteTemplate, type AnimTask } from "../script";
import { monBlend } from "./dark";
import { A, battlerCoords, cloneMon, cos, END, F, flipTarget, J, monSprite, paletteMask, placeAtAttacker, PIC_HALF, placeAtTarget, runSprite, selectedPalettes, sin, slideAt } from "./util";

/** UpdateConfuseRayBallBlend: the ball's alpha breathes one step every 256 frames, 16 → 0 → 16…, a wait at 0. */
function confuseRayBlend(run: Parameters<AnimSpriteTemplate["init"]>[1]) {
  let [level, counter] = [16, 0];
  return {
    get level() {
      return level;
    },
    step() {
      if (level > 0xff) {
        if (++level === 0x10d) level = 0;
        return;
      }
      const old = counter++;
      if ((old & 0xff) !== 0) return;
      counter &= 0xff00;
      level += counter & 0x100 ? 1 : -1;
      monBlend(run, level, 16 - level);
      if (level === 0 || level === 16) counter ^= 0x100;
      if (level === 0) level = 0x100;
    },
  };
}

/** The flames of Grudge and the white shadow of Destiny Bond: created by their tasks. */
const WHITE_SHADOW = { tag: "ANIM_TAG_WHITE_SHADOW", width: 64, height: 32, blend: true } as const;

export const GHOST_TEMPLATES: Record<string, AnimSpriteTemplate> = {
  /** AnimConfuseRayBallBounce: weaves to the target and on past it while it fades, with its sound. */
  gConfuseRayBallBounceSpriteTemplate: {
    tag: "ANIM_TAG_YELLOW_BALL",
    width: 16,
    height: 16,
    affine: true,
    affineAnims: [[A(0x1e, 0x1e, 10, 5), A(-0x1e, -0x1e, 10, 5), J(0)]],
    init(sprite, run, args, done) {
      placeAtAttacker(sprite, run, args);
      const [tx, ty] = run.center(AnimBattler.Target);
      let steps = Math.trunc((Math.abs(tx - sprite.x) << 8) / args[2]);
      const axis = (d: number) => {
        const step = (((Math.abs(d) << 8) & 0xffff) / steps) & 0xffff;
        return d < 0 ? step | 1 : step & ~1;
      };
      const [stepX, stepY] = [axis(tx - sprite.x), axis(ty - sprite.y)];
      const blend = confuseRayBlend(run);
      run.flow.gba.video.effect = Effect.Blend;
      run.flow.gba.video.target1 = 0;
      run.flow.gba.video.target2 = Layer.ALL;
      run.flow.gba.video.eva = 16;
      run.flow.gba.video.evb = 0;
      let [x, y, phase] = [0, 0, 0];
      sprite.callback = () => {
        const end = steps <= 0;
        if (!end) {
          blend.step();
          steps--;
        }
        x = (x + stepX) & 0xffff;
        y = (y + stepY) & 0xffff;
        sprite.x2 = (stepX & 1 ? -(x >> 8) : x >> 8) + sin(phase, 10);
        sprite.y2 = (stepY & 1 ? -(y >> 8) : y >> 8) + cos(phase, 15);
        const old = phase;
        phase = (phase + 5) & 0xff;
        if ((old === 0 || old > 196) && phase > 0) run.play("se_m_confuse_ray" as SoundId, run.customPan);
        if (!end) return;
        if (blend.level === 0) {
          sprite.invisible = true;
          run.flow.gba.video.resetBlend();
          done();
        } else blend.step();
      };
    },
  },

  /** AnimConfuseRayBallSpiral: circles the target going down, behind it for half the turn, 61 frames. */
  gConfuseRayBallSpiralSpriteTemplate: {
    tag: "ANIM_TAG_YELLOW_BALL",
    width: 16,
    height: 16,
    blend: true,
    init(sprite, run, args, done) {
      placeAtTarget(sprite, run, args);
      let [phase, fall, n] = [0, 0, 0];
      const step = () => {
        sprite.x2 = sin(phase, 32);
        sprite.y2 = cos(phase, 8);
        sprite.priority = ((phase - 65) & 0xffff) <= 130 ? 2 : 1;
        phase = (phase + 19) & 0xff;
        fall += 80;
        sprite.y2 += fall >> 8;
        if (++n === 61) done();
      };
      sprite.callback = step;
      step();
    },
  },

  /** AnimShadowBall: rises from the attacker to its spot in args[0] × 2, waits args[1], flies to the target in args[2]. */
  gShadowBallSpriteTemplate: {
    tag: "ANIM_TAG_SHADOW_BALL",
    width: 32,
    height: 32,
    affineNormal: true,
    affineAnims: [[A(0, 0, 10, 1), J(0)]],
    init(sprite, run, args, done) {
      const [oldX, oldY] = [sprite.x, sprite.y];
      [sprite.x, sprite.y] = run.center(AnimBattler.Attacker);
      const leg = function* (toX: number, toY: number, div: number, steps: number) {
        const stepX = Math.trunc(((toX - sprite.x) << 4) / div);
        const stepY = Math.trunc(((toY - sprite.y) << 4) / div);
        let [x, y] = [sprite.x << 4, sprite.y << 4];
        for (let left = steps; left > 0; left--) {
          x += stepX;
          y += stepY;
          sprite.x = x >> 4;
          sprite.y = y >> 4;
          yield;
        }
      };
      runSprite(
        sprite,
        (function* () {
          yield;
          yield* leg(oldX, oldY, args[0] << 1, Math.max(args[0], 1));
          for (let left = args[1] - 1; left > 0; left--) yield;
          const [tx, ty] = run.center(AnimBattler.Target);
          yield;
          yield* leg(tx, ty, args[2], Math.max(args[2], 1));
          [sprite.x, sprite.y] = [tx, ty];
          yield;
        })(),
        done,
      );
    },
  },

  /** AnimLick: the tongue's animation, then it flickers: 5 toggles every 3 frames, 5 every 5. */
  gLickSpriteTemplate: {
    tag: "ANIM_TAG_LICK",
    width: 16,
    height: 32,
    anims: [[F(0, 2), F(8, 2), F(16, 2), F(24, 2), F(32, 2), END]],
    init(sprite, run, args, done) {
      placeAtTarget(sprite, run, args);
      let [stage, wait, toggles] = [0, 0, 0];
      sprite.callback = () => {
        if (!sprite.animEnded) return;
        if (!sprite.invisible) sprite.invisible = true;
        if (stage > 1) return done();
        if (wait !== (stage === 0 ? 2 : 4)) {
          wait++;
          return;
        }
        sprite.invisible = !sprite.invisible;
        wait = 0;
        if (++toggles === 5) {
          toggles = 0;
          stage++;
        }
      };
    },
  },

  /** AnimCurseNail: hammered into the attacker in three blows, then it fades out. */
  gCurseNailSpriteTemplate: {
    tag: "ANIM_TAG_NAIL",
    width: 32,
    height: 16,
    blend: true,
    init(sprite, run, args, done) {
      placeAtAttacker(sprite, run, args);
      const player = !run.attacker.foe;
      sprite.x += player ? 24 : -24;
      sprite.hFlip = player;
      const step = player ? -2 : 2;
      runSprite(
        sprite,
        (function* () {
          for (let blow = 0; blow < 3; blow++) {
            for (let wait = blow === 0 ? 60 : 40; wait >= 0; wait--) yield;
            for (;;) {
              sprite.x2 += step;
              if (((sprite.x2 + 7) & 0xffff) > 14) break;
              yield;
            }
            sprite.x += sprite.x2;
            sprite.x2 = 0;
            sprite.tileNum += 8;
            yield;
          }
          for (let wait = 30; wait > 0; wait--) yield;
          monBlend(run, 16, 0);
          for (let level = 1; level <= 16; level++) {
            for (let wait = 0; wait < 3; wait++) yield;
            monBlend(run, 16 - level, level);
          }
          sprite.invisible = true;
          yield;
          run.flow.gba.video.resetBlend();
        })(),
        done,
      );
    },
  },

};

/** AnimTask_DestinyBondWhiteShadow: a white shadow slides from the attacker to the foe and fades after args[0]. */
function* whiteShadow(run: AnimRun, args: readonly number[], paletteTag?: string): Generator<void, void, void> {
  monBlend(run, 0, 16);
  const [baseX, baseY] = [run.center(AnimBattler.Attacker)[0], run.center(AnimBattler.Attacker)[1] + PIC_HALF];
  const [x, y] = [run.center(AnimBattler.Target)[0], run.center(AnimBattler.Target)[1] + PIC_HALF];
  const steps = args[1];
  const shadow = run.target.sprite?.invisible
    ? null
    : run.createSprite(
        {
          ...WHITE_SHADOW,
          paletteTag,
          init(sprite) {
            const stepX = Math.trunc(((x - baseX) << 4) / steps);
            const stepY = Math.trunc(((y - baseY) << 4) / steps);
            let [px, py, left] = [baseX << 4, baseY << 4, steps];
            sprite.callback = () => {
              if (!left) return;
              px += stepX;
              py += stepY;
              sprite.x = px >> 4;
              sprite.y = py >> 4;
              left--;
            };
          },
        },
        baseX,
        baseY,
        55,
      );
  let [wait, stage, a, b, n, hold] = [0, 0, 0, 16, 0, args[0]];
  let faded = false;
  for (;;) {
    yield;
    if (stage === 0) {
      if (!faded && ++wait > 1) {
        wait = 0;
        n++;
        if (n & 1) {
          if (a < 16) a++;
        } else if (b) b--;
        monBlend(run, a, b);
        if (n >= 24) {
          n = 0;
          faded = true;
        }
      }
      if (hold) hold--;
      else if (faded) stage = 1;
    } else {
      if (++wait <= 1) continue;
      wait = 0;
      n++;
      if (n & 1) {
        if (a) a--;
      } else if (b < 16) b++;
      monBlend(run, a, b);
      if (a === 0 && b === 16) break;
    }
  }
  run.flow.gba.sprites.destroy(shadow);
  yield;
  yield;
  run.flow.gba.video.resetBlend();
}

export const GHOST_TASKS: Record<string, AnimTask> = {
  /** AnimTask_NightShadeClone: the attacker, doubled and faint, shrinks back after args[0] frames. */
  *AnimTask_NightShadeClone(run, args) {
    const mon = monSprite(run, AnimBattler.Attacker);
    if (!mon) return;
    monBlend(run, 0, 16);
    mon.mode = ObjMode.Blend;
    mon.affineAnimPaused = true;
    mon.setRotScale(128, 128, 0);
    mon.invisible = false;
    let [a, b] = [0, 16];
    while (a !== 9) {
      yield;
      yield;
      yield;
      monBlend(run, ++a, --b);
    }
    for (let wait = args[0]; wait > 0; wait--) yield;
    for (let scale = 136; scale <= 0xff; scale += 8) {
      mon.setRotScale(scale, scale, 0);
      yield;
    }
    mon.setRotScale(0x100, 0x100, 0);
    mon.affineAnimPaused = false;
    mon.mode = ObjMode.Normal;
    run.flow.gba.video.resetBlend();
  },

  /** AnimTask_NightmareClone: a copy of the target drifts off and fades. */
  *AnimTask_NightmareClone(run) {
    const mon = monSprite(run, AnimBattler.Target);
    const copy = mon && cloneMon(run, mon);
    if (!copy) return;
    let [a, b, n] = [15, 2, 0];
    monBlend(run, a, b);
    run.spawn(slideAt(copy, 80, flipTarget(run, 144), flipTarget(run, -112)));
    while (b !== 16 || a !== 0 || n <= 80) {
      yield;
      n++;
      if ((n & 3) === 1 && a > 0) a--;
      if ((n & 3) === 3 && b <= 15) b++;
      monBlend(run, a, b);
    }
    run.flow.gba.sprites.destroy(copy);
    yield;
    yield;
    run.flow.gba.video.resetBlend();
  },

  /**
   * AnimTask_SpiteTargetShadow: the target's purple shadow waves over it. Our battlers are sprites:
   * the shadow is a tinted copy that sways; its alpha follows half a sine.
   */
  *AnimTask_SpiteTargetShadow(run) {
    const mon = monSprite(run, AnimBattler.Target);
    if (!mon) return;
    const { palettes, video, sprites } = run.flow.gba;
    const copy = cloneMon(run, mon);
    if (!copy) return;
    const own = 256 + mon.paletteNum * 16;
    const tag = "ANIM_TAG_BENT_SPOON";
    const slot = palettes.loadSpritePalette(tag, palettes.unfaded.slice(own, own + 16));
    copy.paletteNum = slot & 15;
    palettes.blendPalette(256 + copy.paletteNum * 16, 16, 10, 13 | (15 << 10));
    let [a, b] = [0, 16];
    monBlend(run, a, b);
    for (let n = 1; n <= 128; n++) {
      if (n & 1) b = 16 - Math.trunc(SIN[n] / 18);
      else a = Math.trunc(SIN[n] / 18);
      monBlend(run, a, b);
      copy.x2 = mon.x2 + sin(n * 12, 4);
      yield;
    }
    sprites.destroy(copy);
    palettes.freeSpritePalette(tag);
    video.resetBlend();
  },

  *AnimTask_DestinyBondWhiteShadow(run, args) {
    yield* whiteShadow(run, args);
  },

  /** The expansion's Dark Void: the shadow in another palette, a black hole (a move check in its C; a task here). */
  *AnimTask_DarkVoidBlackHole(run, args) {
    yield* whiteShadow(run, args, "ANIM_TAG_QUICK_GUARD_HAND");
  },

  /** AnimTask_CurseStretchingBlackBg: a black box grows from the attacker's corner over the background. */
  *AnimTask_CurseStretchingBlackBg(run) {
    const { video, palettes } = run.flow.gba;
    const startX = run.attacker.foe ? 40 : 200;
    const startY = 40;
    video.win0On = true;
    video.winIn0 = Layer.ALL | 32;
    video.winOut = Layer.ALL;
    video.effect = Effect.Darken;
    video.target1 = Layer.BG3;
    video.evy = 16;
    const box = (left: number, right: number, top: number, bottom: number) => Object.assign(video.win0, { left, right, top, bottom });
    box(startX, startX, startY, startY);
    for (let step = 0; step < 16; step++) {
      yield;
      box(Math.trunc(startX - startX * 0.0625 * step), Math.trunc(startX + (240 - startX) * 0.0625 * step), Math.trunc(startY - startY * 0.0625 * step), Math.trunc(startY + 72 * 0.0625 * step));
    }
    yield;
    box(0, 240, 0, 112);
    palettes.beginFade(paletteMask(run, selectedPalettes(run, 1)), 0, 16, 16, 0);
    do yield;
    while (palettes.fadeActive);
    box(0, 0, 0, 0);
    video.win0On = false;
    video.winIn0 = video.winOut = 0;
    video.resetBlend();
  },

  /** AnimTask_GrudgeFlames: six purple flames circle the attacker, blending in and out. */
  *AnimTask_GrudgeFlames(run) {
    const mon = monSprite(run, AnimBattler.Attacker);
    const x = run.center(AnimBattler.Attacker)[0];
    const y = battlerCoords(run, AnimBattler.Attacker)[1];
    const radius = PIC_HALF + 8;
    const priority = mon?.priority ?? 2;
    const sub = (mon?.subpriority ?? 2) - 2;
    const state = { end: false };
    const clockwise = !run.attacker.foe;
    const flames = [0, 1, 2, 3, 4, 5].map((i) =>
      run.createSprite(
        {
          tag: "ANIM_TAG_PURPLE_FLAME",
          width: 16,
          height: 32,
          blend: true,
          anims: [[F(0, 4), F(8, 4), F(16, 4), F(24, 4), J(0)]],
          init(sprite, _run, _args, done) {
            let [phase, n] = [(i * 42) & 0xff, i * 6];
            sprite.callback = () => {
              phase = (phase + (clockwise ? -2 : 2)) & 0xff;
              sprite.x2 = sin(phase, radius);
              sprite.priority = ((phase - 65) & 0xffff) < 127 ? priority + 1 : priority;
              n++;
              sprite.y2 = sin((n * 8) & 0xff, 7);
              if (state.end) done();
            };
          },
        },
        x,
        y,
        sub,
      ),
    );
    monBlend(run, 0, 16);
    let [a, b, n] = [0, 16, 16];
    yield;
    while (a !== 14 || b !== 4) {
      yield;
      if (++n & 1) {
        if (a < 14) a++;
      } else if (b > 4) b--;
      monBlend(run, a, b);
    }
    for (let wait = 0; wait <= 30; wait++) yield;
    n = 0;
    while (a !== 0 || b !== 16) {
      yield;
      if (++n & 1) {
        if (a > 0) a--;
      } else if (b < 16) b++;
      monBlend(run, a, b);
    }
    state.end = true;
    yield;
    yield;
    void flames;
    run.flow.gba.video.resetBlend();
  },
};
