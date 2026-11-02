// Stat changes and status conditions (battle_anim_status_effects.c, battle_anim_utility_funcs.c):
// the general and status animations' own behaviors.

import { ObjMode, type AffineCmd, type AnimCmd, type Sprite } from "../../../../gba/sprites";
import { Effect, Layer, WIN_EFFECTS } from "../../../../gba/video";
import { initBg } from "../../../common";
import type { AnimArtFiles } from "../../../manifest";
import { AnimBattler, type AnimRun, type AnimSpriteTemplate, type AnimTask } from "../script";
import { battlerCoords, cos, placeAtAttacker, placeAtTarget, runSprite, sin, travel } from "./util";

const MASKS = "battle_anims/masks";
/** gBattleStatMask_Gfx with each stat's colors (gBattleStatMask1-8_Pal) and the arrows' tilemaps. */
export const STATUS_ART: Record<string, AnimArtFiles> = {
  statArrowsUp: { png: `${MASKS}/stat.png`, pal: `${MASKS}/stat1.pal`, bin: `${MASKS}/stat_tilemap_1.bin` },
  statArrowsDown: { png: `${MASKS}/stat.png`, pal: `${MASKS}/stat1.pal`, bin: `${MASKS}/stat_tilemap_2.bin` },
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((n) => [`statColors${n}`, { png: `${MASKS}/stat.png`, pal: `${MASKS}/stat${n}.pal` }])),
};

/** The art each task loads before the script starts (its keys in STATUS_ART). */
export const STATUS_TASK_ART: Record<string, string[]> = {
  AnimTask_StatsChange: ["statArrowsUp", "statArrowsDown", ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `statColors${n}`)],
};

/** STAT_ANIM_PLUS1, MINUS1, PLUS2, MINUS2 (+ STAT_* − 1), and the MULTIPLE_* kinds after them. */
const STAT_ANIM = { plus1: 15, minus1: 22, plus2: 39, minus2: 46, multiplePlus1: 55 } as const;
/** The arrows' colors by FireRed's STAT_* (ATK 1 … EVASION 7), multiple stats last (gBattleStatMask*_Pal). */
const STAT_COLORS = [2, 1, 4, 7, 8, 3, 6];
const MULTIPLE_COLORS = 5;
/** BG_ANIM_PAL_1: the arrows' palette. */
const ARROWS_PALETTE = 8;

/** The stat change's kind (animArg, Cmd_playstatchangeanimation's): what changes, which way, how much. */
function statChange(arg: number): { down: boolean; colors: number; sharply: boolean } | null {
  if (arg >= STAT_ANIM.multiplePlus1 && arg <= STAT_ANIM.multiplePlus1 + 3) {
    const n = arg - STAT_ANIM.multiplePlus1;
    return { down: n >= 2, colors: MULTIPLE_COLORS, sharply: (n & 1) === 1 };
  }
  for (const [base, down, sharply] of [
    [STAT_ANIM.plus1, false, false],
    [STAT_ANIM.minus1, true, false],
    [STAT_ANIM.plus2, false, true],
    [STAT_ANIM.minus2, true, true],
  ] as const) {
    const stat = arg - base + 1;
    if (stat >= 1 && stat <= 7) return { down, colors: STAT_COLORS[stat - 1], sharply };
  }
  return null;
}

export const STATUS_TASKS: Record<string, AnimTask> = {
  /**
   * AnimTask_StatsChange: arrows in the stat's colors scroll up (or down) inside the battler's
   * outline (an OBJ window from a copy of its sprite), fading in on BG1 and out again.
   */
  *AnimTask_StatsChange(run) {
    const change = statChange(run.animArg ?? 0);
    const mon = run.attacker.sprite;
    const arrows = run.art(change?.down ? "statArrowsDown" : "statArrowsUp");
    const colors = change && run.art(`statColors${change.colors}`);
    if (!change || !mon || !arrows || !colors) return;
    const { gba } = run.flow;
    const { video } = gba;
    yield;
    yield;

    // StatsChangeAnimation_Step1/2: the window, the blend and the arrows.
    const copy = gba.sprites.create({ sheet: "animDummy", palette: "animDummy", width: mon.width, height: mon.height, priority: 0, affine: mon.affine }, mon.x, mon.y, mon.subpriority);
    if (!copy) return;
    Object.assign(copy, { tiles: mon.tiles, tileNum: mon.tileNum, x2: mon.x2, y2: mon.y2, hFlip: mon.hFlip, mode: ObjMode.Window });
    Object.assign(copy, { matrixA: mon.matrixA, matrixB: mon.matrixB, matrixC: mon.matrixC, matrixD: mon.matrixD, affineAnimPaused: true });
    video.objWinOn = true;
    video.winOut = Layer.BG0 | Layer.BG2 | Layer.BG3 | Layer.OBJ | WIN_EFFECTS;
    video.winObj = Layer.ALL | WIN_EFFECTS;
    video.effect = Effect.Blend;
    video.target1 = Layer.BG1;
    video.target2 = Layer.ALL;
    video.eva = 0;
    video.evb = 16;
    const bg1 = video.bgs[1];
    initBg(bg1, 0, 0);
    bg1.tiles = arrows.tiles;
    bg1.map.set(arrows.map!.subarray(0, bg1.map.length));
    bg1.visible = true;
    gba.palettes.load(colors.palette, ARROWS_PALETTE * 16, 16);
    let y = 0;
    const speed = change.down ? -3 : 3;
    if (change.down) bg1.x = 64 * 256;
    run.play(change.down ? "se_m_stat_decrease" : "se_m_stat_increase", run.pan2(-64));
    const top = change.sharply ? 13 : 10;
    const hold = change.sharply ? 30 : 20;

    // StatsChangeAnimation_Step3: fade in every other frame, hold, fade out.
    const scroll = () => {
      y += speed;
      bg1.y = y * 256;
    };
    for (let eva = 0, tick = 0; eva < top; ) {
      yield;
      scroll();
      if (tick++ > 0) {
        tick = 0;
        video.eva = ++eva;
        video.evb = 16 - eva;
      }
    }
    for (let i = 1; i <= hold; i++) {
      yield;
      scroll();
    }
    for (let eva = top, tick = 0; eva > 0; ) {
      yield;
      scroll();
      if (tick++ > 0) {
        tick = 0;
        video.eva = --eva;
        video.evb = 16 - eva;
      }
    }
    bg1.visible = false;
    bg1.x = bg1.y = 0;
    yield;
    video.objWinOn = false;
    video.winOut = video.winObj = 0;
    video.resetBlend();
    gba.sprites.destroy(copy);
  },

  AnimTask_FrozenIceCube: frozenIceCube,
};

/** sAnims_ConfusionDuck: waddling one way (the player's side attacking) or the other. */
const DUCK_ANIMS: AnimCmd[][] = [
  [{ image: 0, duration: 8 }, { image: 4, duration: 8 }, { image: 0, duration: 8, hFlip: true }, { image: 8, duration: 8 }, { jump: 0 }],
  [{ image: 0, duration: 8, hFlip: true }, { image: 4, duration: 8 }, { image: 0, duration: 8 }, { image: 8, duration: 8 }, { jump: 0 }],
];

/** gAnims_BasicFire: a 32×32 flame's five frames. */
export const BASIC_FIRE_ANIMS: AnimCmd[][] = [
  [{ image: 0, duration: 4 }, { image: 16, duration: 4 }, { image: 32, duration: 4 }, { image: 48, duration: 4 }, { image: 64, duration: 4 }, { jump: 0 }],
];

/** sSleepLetterZAffineAnimTable: growing while it turns, one way or the other. */
const SLEEP_Z_AFFINE: AffineCmd[][] = [
  [{ xScale: 0x14, yScale: 0x14, rotation: -30, duration: 0 }, { xScale: 8, yScale: 8, rotation: 1, duration: 24 }, "end"],
  [{ xScale: 0x14, yScale: 0x14, rotation: 30, duration: 0 }, { xScale: 8, yScale: 8, rotation: -1, duration: 24 }, "end"],
];

/**
 * AnimTravelDiagonally: from the attacker (args[5] 0) or the target, offset by args[0], args[1]
 * (twice, as the game does), to its spot offset by args[2], args[3], in args[4] frames; args[6]
 * set uses the battler's spot without its picture's offset.
 */
function* travelDiagonally(sprite: Sprite, run: AnimRun, args: number[]): Generator<void, void, void> {
  const picture = !args[6];
  const which = args[5] ? AnimBattler.Target : AnimBattler.Attacker;
  if (which === AnimBattler.Attacker) placeAtAttacker(sprite, run, args, picture);
  else placeAtTarget(sprite, run, args, picture);
  placeAtTarget(sprite, run, args, picture);
  const dx = run.attacker.foe ? -args[2] : args[2];
  const [x] = run.center(which);
  const y = picture ? run.center(which)[1] : battlerCoords(run, which)[1];
  yield;
  yield* travel(sprite, args[4], x + dx, y + args[3]);
}

export const STATUS_TEMPLATES: Record<string, AnimSpriteTemplate> = {
  /**
   * AnimConfusionDuck: a duck circles the battler's head from angle args[2] by args[3] a frame
   * (the other way on the foe's side), offset by args[0], args[1], for args[4] frames; it goes
   * behind the battler on the far half.
   */
  gConfusionDuckSpriteTemplate: {
    tag: "ANIM_TAG_DUCK",
    width: 16,
    height: 16,
    anims: DUCK_ANIMS,
    init(sprite, run, args, done) {
      sprite.x += args[0];
      sprite.y += args[1];
      let angle = args[2];
      const speed = run.attacker.foe ? -args[3] : args[3];
      if (!run.attacker.foe) sprite.startAnim(1);
      let frames = 0;
      runSprite(
        sprite,
        (function* () {
          for (;;) {
            sprite.x2 = cos(angle, 30);
            sprite.y2 = sin(angle, 10);
            sprite.priority = (angle & 0xffff) < 128 ? 1 : 3;
            angle = (angle + speed) & 0xff;
            if (++frames === args[4]) return;
            yield;
          }
        })(),
        done,
      );
    },
  },

  /** AnimBurnFlame: a flame travelling diagonally (AnimTravelDiagonally) the other way. */
  gBurnFlameSpriteTemplate: {
    tag: "ANIM_TAG_SMALL_EMBER",
    width: 32,
    height: 32,
    anims: BASIC_FIRE_ANIMS,
    init(sprite, run, args, done) {
      const a = [...args];
      a[0] = -a[0];
      a[2] = -a[2];
      runSprite(
        sprite,
        (function* () {
          yield;
          yield* travelDiagonally(sprite, run, a);
        })(),
        done,
      );
    },
  },

  /** AnimMagentaHeart: a heart rises from the attacker's spot (offset by args[0], args[1]), swaying, for 60 frames. */
  gMagentaHeartSpriteTemplate: {
    tag: "ANIM_TAG_MAGENTA_HEART",
    width: 16,
    height: 16,
    init(sprite, run, args, done) {
      let [frame, angle, rise] = [0, 0, 0];
      runSprite(
        sprite,
        (function* () {
          for (;;) {
            if (++frame === 1) placeAtAttacker(sprite, run, args, false);
            sprite.x2 = sin(angle, 8);
            sprite.y2 = rise >> 8;
            angle = (angle + 7) & 0xff;
            rise -= 0x80;
            if (frame === 60) return;
            yield;
          }
        })(),
        done,
      );
    },
  },

  /** AnimSleepLetterZ: a Z floats up and away from the attacker (offset by args[0], args[1]), growing, for 60 frames. */
  gSleepLetterZSpriteTemplate: {
    tag: "ANIM_TAG_LETTER_Z",
    width: 32,
    height: 32,
    affineNormal: true,
    affineAnims: SLEEP_Z_AFFINE,
    init(sprite, run, args, done) {
      [sprite.x, sprite.y] = run.center(AnimBattler.Attacker);
      const way = run.attacker.foe ? -1 : 1;
      sprite.x += way * args[0];
      sprite.y += args[1];
      if (run.attacker.foe) sprite.startAffineAnim(1);
      let [rise, speed, drift] = [0, 0, 0];
      sprite.callback = () => {
        sprite.y2 = -Math.trunc(rise / 0x28);
        sprite.x2 = Math.trunc(drift / 10);
        drift += way * 2;
        rise += speed;
        if (++speed > 60) done();
      };
    },
  },

  /** AnimElectricity: a spark (args[3]: 0-2 its shape and flip) at the target's spot offset by args[0], args[1], for args[2] frames. */
  gElectricitySpriteTemplate: {
    tag: "ANIM_TAG_SPARK_2",
    width: 16,
    height: 16,
    init(sprite, run, args, done) {
      placeAtTarget(sprite, run, args, false);
      sprite.tileNum += args[3] * 4;
      sprite.hFlip = args[3] === 1;
      sprite.vFlip = args[3] === 2;
      let frames = args[2];
      sprite.callback = () => {
        if (frames > 0) frames--;
        else done();
      };
    },
  },

  /** AnimGhostStatusSprite: the Curse ghost rises swaying, then fades out after 30 frames. */
  gCurseGhostSpriteTemplate: ghostStatus("ANIM_TAG_GHOSTLY_SPIRIT"),

  /** AnimGhostStatusSprite: the Nightmare devil, the same way. */
  gNightmareDevilSpriteTemplate: ghostStatus("ANIM_TAG_DEVIL"),
};

function ghostStatus(tag: string): AnimSpriteTemplate {
  return {
    tag,
    width: 32,
    height: 32,
    blend: true,
    init(sprite, run, _args, done) {
      const { video } = run.flow.gba;
      let [angle, rise, frame, eva, evb] = [0, 0, 0, 11, 5];
      sprite.callback = () => {
        if (frame > 30 && sprite.invisible) {
          video.resetBlend();
          return done();
        }
        sprite.x2 = sin(angle, 12) * (run.attacker.foe ? -1 : 1);
        angle = (angle + 6) & 0xff;
        rise += 0x100;
        sprite.y2 = -(rise >> 8);
        if (++frame === 1) {
          Object.assign(video, { effect: Effect.Blend, target1: 0, target2: Layer.ALL, eva, evb });
        } else if (frame > 30) {
          evb = Math.min(16, evb + 1);
          eva = Math.max(0, eva - 1);
          Object.assign(video, { eva, evb });
          if (evb === 16 && eva === 0) sprite.invisible = true;
        }
      };
      sprite.callback(sprite);
    },
  };
}

/** sFrozenIceCubeSubsprites: the 96×96 cube's pieces (offset, size, first tile). */
const ICE_CUBE_PIECES = [
  [-16, -16, 64, 64, 0],
  [-16, 48, 64, 32, 64],
  [48, -16, 32, 64, 96],
  [48, 48, 32, 32, 128],
] as const;

/** AnimTask_FrozenIceCube: an ice cube fades in over the target, glints twice, fades out. */
function* frozenIceCube(run: AnimRun): Generator<void, void, void> {
  const { gba } = run.flow;
  const { video, palettes } = gba;
  const [tx, ty] = run.center(AnimBattler.Target);
  const [left, top] = [tx - 32, ty - 36];
  const pieces = ICE_CUBE_PIECES.map(([dx, dy, width, height, tile]) => {
    const piece = gba.sprites.create({ sheet: "ANIM_TAG_ICE_CUBE", palette: "ANIM_TAG_ICE_CUBE", width, height, priority: 2, mode: ObjMode.Blend }, left + dx + width / 2, top + dy + height / 2, 4);
    if (piece) piece.tileNum = tile;
    return piece;
  });
  const alpha = (eva: number) => Object.assign(video, { eva, evb: 16 - eva });
  Object.assign(video, { effect: Effect.Blend, target1: 0, target2: Layer.ALL, eva: 0, evb: 16 });
  const base = 256 + palettes.spritePaletteSlot("ANIM_TAG_ICE_CUBE") * 16;
  // Step 1: fade in.
  for (let i = 1; i < 10; i++) {
    yield;
    alpha(i);
  }
  yield;
  // Step 2: after 14 frames, colors 13-15 rotate every 3 frames, 3 times; twice.
  for (let glint = 0; glint < 2; glint++) {
    for (let i = 0; i < 14; i++) yield;
    for (let n = 0; n < 3; n++) {
      for (let i = 0; i < 3; i++) yield;
      const f = palettes.faded;
      [f[base + 13], f[base + 14], f[base + 15]] = [f[base + 14], f[base + 15], f[base + 13]];
    }
  }
  // Step 3: fade out; step 4: gone.
  for (let i = 8; i >= 0; i--) {
    yield;
    alpha(i);
  }
  for (let i = 0; i < 37; i++) yield;
  for (const piece of pieces) gba.sprites.destroy(piece);
  yield;
  yield;
  video.resetBlend();
}

