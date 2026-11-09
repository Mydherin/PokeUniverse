// The general animations' own behaviors (battle_anim_special.c, parts of battle_anim_effects_1.c
// and _3.c): the substitute doll, items flying off, Snatch, Focus Band, Doom Desire's beam. The C's
// tasks that pick the battlers do nothing here: playback already passes the right ones.

import { Move } from "@pokeuniverse/contracts/move/v1/catalog";
import { ObjMode, type Sprite } from "../../../../gba/sprites";
import { Effect, Layer } from "../../../../gba/video";
import { initBg } from "../../../common";
import type { AnimArtFiles, SoundId } from "../../../manifest";
import { AnimBattler, type AnimRun, type AnimSpriteTemplate, type AnimTask } from "../script";
import { monBlend } from "./dark";
import { A, battlerCoords, END, F, frames, J, monSprite, placeAtTarget, runSprite, sin } from "./util";

/** BG_ANIM 1's palette (status.ts). */
const ANIM_PALETTE = 8;
const OFF_LEFT = -32;
const OFF_RIGHT = 240 + 32;

/** sDoomDesireLightBeamCoordTable (the fifth read falls on the next table's 0), and the wait after each beam. */
const DOOM_BEAM_X = [0x78, 0x50, 0x28, 0, 0];
const DOOM_BEAM_WAIT = [0, 0, 0, 50];

const TRAP_ANIM: Partial<Record<number, number>> = { [Move.FIRE_SPIN]: 1, [Move.MAGMA_STORM]: 1, [Move.WHIRLPOOL]: 2, [Move.CLAMP]: 3, [Move.SAND_TOMB]: 4 };

const ITEM_BAG: Omit<AnimSpriteTemplate, "init"> = {
  tag: "ANIM_TAG_ITEM_BAG",
  width: 32,
  height: 32,
  affineNormal: true,
  anims: [[F(0, 30), END]],
  affineAnims: [
    [A(0, 0, -4, 10), A(0, 0, 4, 20), A(0, 0, -4, 10), END],
    [A(0, 0, -1, 2), A(0, 0, 1, 4), A(0, 0, -1, 4), A(0, 0, 1, 4), A(0, 0, -1, 4), A(0, 0, 1, 2), END],
  ],
};

/**
 * MoveAlongLinearPath with AnimItemSteal's bounces: `time` frames in a line to (toX, toY), hopping
 * lower each time. `onGround` runs on the frames it touches down.
 */
function* bagLine(sprite: Sprite, toX: number, toY: number, time: number, onGround?: () => void): Generator<void, void, void> {
  const [fromX, fromY] = [sprite.x, sprite.y];
  let [phase, hops] = [0, 0];
  for (let t = 0; t < time; t++) {
    phase += Math.trunc((3 * 128) / 60);
    if (phase >= 128) {
      hops++;
      phase = 0;
    }
    sprite.y2 = sin(phase + 128, 30 - hops * 8);
    if (sprite.y2 === 0) onGround?.();
    sprite.x = fromX + Math.trunc(((toX - fromX) * t) / time);
    sprite.y = fromY + Math.trunc(((toY - fromY) * t) / time);
    yield;
  }
  sprite.y2 = 0;
}

/** AnimItemSteal_Step2: it lies there, shakes, and is gone. */
function* bagRests(sprite: Sprite): Generator<void, void, void> {
  yield* frames(10);
  sprite.startAffineAnim(1);
  yield* frames(41);
}

export const GENERAL_TEMPLATES: Record<string, AnimSpriteTemplate> = {
  /** AnimKnockOffItem: the target's bag hops off its side of the screen. */
  gKnockOffItemSpriteTemplate: {
    ...ITEM_BAG,
    init(sprite, run, _args, done) {
      const y = battlerCoords(run, AnimBattler.Target)[1] + 10;
      const foe = run.target.foe;
      runSprite(
        sprite,
        (function* () {
          yield;
          yield* bagLine(sprite, foe ? OFF_RIGHT : OFF_LEFT, y, 40);
          if (!foe) yield* bagRests(sprite);
        })(),
        done,
      );
    },
  },

  /** AnimItemSteal: the bag hops from the target to the attacker. */
  gItemStealSpriteTemplate: {
    ...ITEM_BAG,
    init(sprite, run, args, done) {
      placeAtTarget(sprite, run, args, false);
      const [x, y] = battlerCoords(run, AnimBattler.Attacker);
      const hop = "se_m_bubble2" as SoundId;
      runSprite(
        sprite,
        (function* () {
          yield;
          yield* bagLine(sprite, x, y + 10, 60, () => run.play(hop, run.pan(63)));
          run.play(hop, run.pan(-64));
          yield* bagRests(sprite);
        })(),
        done,
      );
    },
  },

  /** AnimSmokeBallEscapeCloud: a cloud on the attacker for args[3] frames. */
  gSmokeBallEscapeCloudSpriteTemplate: {
    tag: "ANIM_TAG_PINK_CLOUD",
    width: 32,
    height: 32,
    affine: true,
    affineAnims: [
      [A(0x80, 0x80, 0, 0), A(-4, -6, 0, 16), A(4, 6, 0, 16), J(0)],
      [A(0xc0, 0xc0, 0, 0), A(4, 6, 0, 16), A(-4, -6, 0, 16), J(0)],
      [A(0x100, 0x100, 0, 0), A(4, 6, 0, 16), A(-4, -6, 0, 16), J(0)],
      [A(0x100, 0x100, 0, 0), A(8, 10, 0, 30), A(-8, -10, 0, 16), J(0)],
    ],
    init(sprite, run, args, done) {
      sprite.startAffineAnim(args[0]);
      [sprite.x, sprite.y] = run.center(AnimBattler.Attacker);
      sprite.x += run.target.foe ? -args[1] : args[1];
      sprite.y += args[2];
      runSprite(sprite, frames(args[3]), done);
    },
  },
};

const DOLL: Record<string, AnimArtFiles> = {
  substitute: { png: "battle_anims/sprites/substitute.png", pal: "battle_anims/sprites/substitute.png" },
  substituteBack: { png: "battle_anims/sprites/substitute_back.png", pal: "battle_anims/sprites/substitute.png" },
};
const DOLL_NAMES = Object.keys(DOLL);

export const GENERAL_ART: Record<string, AnimArtFiles> = DOLL;
export const GENERAL_TASK_ART: Record<string, string[]> = {
  AnimTask_SwapMonSpriteToFromSubstitute: DOLL_NAMES,
  AnimTask_MonToSubstitute: DOLL_NAMES,
  AnimTask_DoomDesireLightBeam: ["morningSun"],
};
export const GENERAL_TASK_SOUNDS: Record<string, readonly string[]> = { gItemStealSpriteTemplate: ["se_m_bubble2"] };

/** LoadBattleMonGfxAndAnimate: the attacker shows the doll, or its own picture again. */
export function showDoll(run: AnimRun, doll: boolean): void {
  const mon = run.attacker;
  mon.dress?.(doll ? run.art(mon.foe ? "substitute" : "substituteBack") ?? null : null);
  if (mon.sprite) mon.sprite.invisible = false;
}

const chosenByPlayback: AnimTask = function* () {};

export const GENERAL_TASKS: Record<string, AnimTask> = {
  AnimTask_GetBattlersFromArg: chosenByPlayback,
  AnimTask_SetAnimTargetToBattlerTarget: chosenByPlayback,
  AnimTask_SetTargetToEffectBattler: chosenByPlayback,
  AnimTask_SetAnimAttackerAndTargetForEffectAtk: chosenByPlayback,
  AnimTask_SetAnimAttackerAndTargetForEffectTgt: chosenByPlayback,
  /** AnimTask_CastformGfxChange: only on Castform's skipped branch; forms have no art of their own yet. */
  AnimTask_CastformGfxChange: chosenByPlayback,

  *AnimTask_IsMonInvisible(run) {
    run.args[7] = run.attacker.sprite?.invisible ? 1 : 0;
  },

  *AnimTask_IsTargetSameSide(run) {
    run.args[7] = run.attacker.foe === run.target.foe ? 1 : 0;
  },

  *AnimTask_IsAttackerBehindSubstitute(run) {
    run.args[7] = run.attacker.behindSubstitute ? 1 : 0;
  },

  /** AnimTask_GetTrappedMoveAnimId: which trap hurts (animArg is its move). */
  *AnimTask_GetTrappedMoveAnimId(run) {
    run.args[0] = TRAP_ANIM[run.animArg ?? 0] ?? 0;
  },

  /** AnimTask_SwapMonSpriteToFromSubstitute: off its side of the screen, changes (args[0] 0: to the doll), and back. */
  *AnimTask_SwapMonSpriteToFromSubstitute(run, args) {
    const mon = monSprite(run, AnimBattler.Attacker);
    if (!mon) return;
    const out = run.attacker.foe ? 1 : -1;
    let speed = 0;
    const step = (dir: number) => {
      speed += 0x500;
      mon.x2 += dir * (speed >> 8);
      speed &= 0xff;
    };
    do {
      yield;
      step(out);
    } while (mon.x + mon.x2 + 32 >= 0 && mon.x + mon.x2 + 32 <= 304);
    yield;
    showDoll(run, !args[0]);
    do {
      yield;
      step(-out);
    } while (out > 0 ? mon.x2 > 0 : mon.x2 < 0);
    mon.x2 = 0;
  },

  /** AnimTask_SubstituteFadeToInvisible: the doll fades away. */
  *AnimTask_SubstituteFadeToInvisible(run) {
    const mon = monSprite(run, AnimBattler.Attacker);
    if (!mon) return;
    mon.mode = ObjMode.Blend;
    monBlend(run, 16, 0);
    let [n, wait] = [0, 0];
    while (n < 16) {
      yield;
      if (wait++ <= 1) continue;
      wait = 0;
      n++;
      monBlend(run, 16 - n, n);
    }
    yield;
    mon.invisible = true;
    mon.mode = ObjMode.Normal;
  },

  /** AnimTask_SlideMonForFocusBand: the attacker leans (by args[1], 8.8 a frame, for args[0] frames) trembling, and holds. */
  *AnimTask_SlideMonForFocusBand(run, args) {
    const mon = monSprite(run, AnimBattler.Attacker);
    if (!mon) return;
    const dir = run.attacker.foe ? 1 : -1;
    let [ampX, ampY, shakeX, shakeY, wait, every] = [args[4], args[5], 0, 0, 0, args[6]];
    let [x, y] = [0, 0];
    const tremble = () => {
      if (!args[3] || --wait !== -1) return;
      if (shakeX === 0) {
        shakeX = ampX;
        ampX = -ampX;
      } else shakeX = 0;
      if (shakeY === 0) {
        shakeY = ampY;
        ampY = -ampY;
      } else shakeY = 0;
      wait = every;
    };
    const show = () => {
      mon.x2 = shakeX + dir * (x >> 8);
      mon.y2 = shakeY + dir * (y >> 8);
    };
    for (let n = 0; n < args[0]; n++) {
      yield;
      tremble();
      x += args[1];
      y += args[2];
      show();
    }
    every = 0;
    for (let n = 0; n < 30; n++) {
      yield;
      tremble();
      show();
    }
  },

  /** AnimTask_DoomDesireLightBeam: beams on BG1 strike from afar toward the target. */
  *AnimTask_DoomDesireLightBeam(run) {
    const art = run.art("morningSun");
    if (!art) return;
    const { gba } = run.flow;
    const { video } = gba;
    Object.assign(video, { effect: Effect.Blend, target1: Layer.BG1, target2: Layer.ALL, eva: 3, evb: 13 });
    const bg1 = video.bgs[1];
    initBg(bg1, 0, 1);
    bg1.tiles = art.tiles;
    bg1.map.set(art.map!.subarray(0, bg1.map.length));
    bg1.visible = true;
    gba.palettes.load(art.palette, ANIM_PALETTE * 16, 16);
    const base = run.target.foe ? -135 : -10;
    bg1.x = base * 256;
    bg1.y = 0;
    const beam = (i: number) => (bg1.x = (base + (run.target.foe ? DOOM_BEAM_X[i] : -DOOM_BEAM_X[i])) * 256);
    yield;
    for (let i = 0; i < 4; i++) {
      beam(i);
      yield;
      video.evb = 5;
      yield;
      yield* frames(DOOM_BEAM_WAIT[i] + 1);
      for (let level = 6; level <= 13; level++) {
        video.evb = level;
        yield;
      }
    }
    beam(4);
    yield;
    bg1.visible = false;
    bg1.x = 0;
    video.resetBlend();
  },

  /** AnimTask_SnatchOpposingMonMove: the attacker dashes off, comes through the target's spot from the other side, and returns. */
  *AnimTask_SnatchOpposingMonMove(run) {
    const mon = monSprite(run, AnimBattler.Attacker);
    if (!mon) return;
    const { sprites } = run.flow.gba;
    const foe = run.attacker.foe;
    const forward = foe ? -1 : 1;
    let speed = 0;
    const advance = (s: Sprite, dir: number) => {
      speed += 0x800;
      s.x2 += dir * (speed >> 8);
      speed &= 0xff;
    };
    const offScreen = (s: Sprite) => s.x + s.x2 < OFF_LEFT || s.x + s.x2 > OFF_RIGHT;
    do {
      yield;
      advance(mon, forward);
    } while (!offScreen(mon));
    speed = 0;
    yield;
    // CreateAdditionalMonSpriteForMoveAnim draws its other side's picture: ours mirrors the same one.
    const [targetX, targetY] = battlerCoords(run, AnimBattler.Target);
    const copy = sprites.create({ sheet: "animDummy", palette: "animDummy", width: mon.width, height: mon.height, priority: mon.priority, affine: mon.affine }, foe ? OFF_LEFT : OFF_RIGHT, targetY, (run.target.sprite?.subpriority ?? 30) + (foe ? -1 : 1));
    if (copy) {
      Object.assign(copy, { tiles: mon.tiles, tileNum: mon.tileNum, paletteNum: mon.paletteNum, hFlip: !mon.hFlip, affineAnimPaused: true });
      let signaled = false;
      do {
        yield;
        advance(copy, -forward);
        const x = copy.x + copy.x2;
        if (!signaled && (foe ? x > targetX : x < targetX)) {
          signaled = true;
          run.args[7] = -1;
        }
      } while (!offScreen(copy));
      speed = 0;
      yield;
      sprites.destroy(copy);
    }
    const [homeX] = battlerCoords(run, AnimBattler.Attacker);
    mon.x2 = foe ? OFF_RIGHT - mon.x : OFF_LEFT - mon.x;
    do {
      yield;
      advance(mon, forward);
    } while (foe ? mon.x + mon.x2 > homeX : mon.x + mon.x2 < homeX);
    mon.x2 = 0;
  },

  /** AnimTask_SnatchPartnerMove: the attacker dashes to its partner and back (doubles). */
  *AnimTask_SnatchPartnerMove(run) {
    const mon = monSprite(run, AnimBattler.Attacker);
    if (!mon) return;
    const [fromX] = battlerCoords(run, AnimBattler.Attacker);
    const [toX] = battlerCoords(run, AnimBattler.Target);
    const step = fromX > toX ? -6 : 6;
    const reached = (x: number, by: number) => (by > 0 ? mon.x + mon.x2 >= x : mon.x + mon.x2 <= x);
    do {
      yield;
      mon.x2 += step;
    } while (!reached(toX, step));
    do {
      yield;
      mon.x2 -= step;
    } while (!reached(fromX, -step));
    mon.x2 = 0;
  },
};
