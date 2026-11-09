// Weather (battle_anim_water.c, battle_anim_fire.c, battle_anim_rock.c, battle_anim_ice.c): rain,
// sunlight, sandstorm and hail, for the weather moves and the weather's turn-end animations.

import type { AffineCmd, AnimCmd } from "../../../../gba/sprites";
import { Effect, Layer } from "../../../../gba/video";
import { initBg } from "../../../common";
import type { AnimArtFiles } from "../../../manifest";
import type { AnimRun, AnimSpriteTemplate, AnimTask } from "../script";
import { battlerId, runSprite, travel } from "./util";

/** BG_ANIM_PAL_1: an animation background's palette. */
const ANIM_PALETTE = 8;

export const WEATHER_ART: Record<string, AnimArtFiles> = {
  sandstorm: { png: "battle_anims/backgrounds/sandstorm_brew.png", pal: "battle_anims/sprites/flying_dirt.png", bin: "battle_anims/backgrounds/sandstorm_brew.bin" },
};

export const WEATHER_TASK_ART: Record<string, string[]> = {
  AnimTask_LoadSandstormBackground: ["sandstorm"],
};

/** gRainDropSpriteTemplate (AnimRainDrop): a drop falls 13 frames as it splashes, gone when its anim ends. */
const RAIN_DROP: AnimSpriteTemplate = {
  tag: "ANIM_TAG_RAIN_DROPS",
  width: 16,
  height: 32,
  anims: [[0, 8, 16, 24, 32, 40, 48].map((image): AnimCmd => ({ image, duration: image === 24 ? 6 : 2 })).concat(["end"])],
  init(sprite, _run, _args, done) {
    let frame = 0;
    sprite.callback = () => {
      if (++frame < 14) {
        sprite.x2 += 1;
        sprite.y2 += 4;
      }
      if (sprite.animEnded) done();
    };
  },
};

/** sAffineAnims_HailParticle: large, medium, small. */
const HAIL_AFFINE: AffineCmd[][] = [0x100, 0xf0, 0xe0].map((scale): AffineCmd[] => [{ xScale: scale, yScale: scale, duration: 0 }, "end"]);

/** gIceCrystalHitLargeSpriteTemplate with AnimHailContinue: the crystal where a hailstone lands, 20 frames. */
const HAIL_HIT: AnimSpriteTemplate = {
  tag: "ANIM_TAG_ICE_CRYSTALS",
  width: 8,
  height: 16,
  affineNormal: true,
  blend: true,
  anims: [[{ image: 4, duration: 1 }, "end"]],
  affineAnims: [[{ xScale: 0xce, yScale: 0xce, duration: 0 }, { xScale: 5, yScale: 5, duration: 10 }, { xScale: 0, yScale: 0, duration: 6 }, "end"]],
  init(sprite, _run, _args, done) {
    let frame = 0;
    sprite.callback = () => {
      if (++frame === 20) done();
    };
  },
};

/** sHailCoordData: where each hailstone lands: x, y, the battler (by battlerId: 0, 2 the player's, 1, 3 the foe's) and how (0/1 off its picture, 2 the spot). */
const HAIL_COORDS = [
  [100, 120, 0, 2],
  [85, 120, 0, 0],
  [242, 120, 1, 1],
  [66, 120, 2, 1],
  [182, 120, 3, 0],
  [60, 120, 0, 2],
  [214, 120, 1, 0],
  [113, 120, 0, 1],
  [210, 120, 3, 1],
  [38, 120, 2, 0],
] as const;

/** GenerateHailParticle: a hailstone (size `size`) falling to its landing spot; `landed` once it is gone. */
function hailstone(run: AnimRun, n: number, size: number, landed: () => void): boolean {
  const [fx, fy, id, how] = HAIL_COORDS[n];
  const mon = run.field.find((m) => battlerId(m) === id)?.sprite;
  const visible = how !== 2 && !!mon && !mon.invisible;
  let [x, y]: number[] = [fx, fy];
  if (visible && mon) {
    // GetBattlerSpriteCoordAttr's width and height: the picture's box (64), a sixth of it.
    const d = how === 0 ? -10 : 10;
    [x, y] = [mon.x + d, mon.y + d];
  }
  const stone: AnimSpriteTemplate = {
    tag: "ANIM_TAG_HAIL",
    width: 16,
    height: 16,
    affineNormal: true,
    affineAnims: HAIL_AFFINE,
    init(sprite, _run, _args, done) {
      sprite.startAffineAnim(size);
      // AnimHailBegin: down and right until past the spot; the large ones leave a crystal.
      sprite.callback = () => {
        sprite.x += 4;
        sprite.y += 8;
        if (sprite.x < x && sprite.y < y) return;
        if (visible && size === 0) {
          if (!run.createSprite({ ...HAIL_HIT, init: (s, r, a, end) => HAIL_HIT.init(s, r, a, () => (end(), landed())) }, x, y, sprite.subpriority)) landed();
        } else landed();
        done();
      };
    },
  };
  return run.createSprite(stone, x - Math.trunc((y + 8) / 2), -8, 18) !== null;
}

export const WEATHER_TEMPLATES: Record<string, AnimSpriteTemplate> = {
  /** AnimSunlight: a ray crosses from the top left to (140, 80) in 60 frames, growing and turning. */
  gSunlightRaySpriteTemplate: {
    tag: "ANIM_TAG_SUNLIGHT",
    width: 32,
    height: 32,
    affineNormal: true,
    blend: true,
    affineAnims: [[{ xScale: 0x50, yScale: 0x50, duration: 0 }, { xScale: 2, yScale: 2, rotation: 10, duration: 1 }, { jump: 1 }]],
    init(sprite, _run, _args, done) {
      sprite.x = sprite.y = 0;
      runSprite(
        sprite,
        (function* () {
          yield;
          yield* travel(sprite, 60, 140, 80);
        })(),
        done,
      );
    },
  },

  /**
   * AnimFlyingSandCrescent: a 64×16 crescent of sand (two 32×16 pieces) crosses the screen at
   * height args[0], by (args[1], args[2]) 1/256 pixels a frame; from the right for the foe when args[3].
   */
  gFlyingSandCrescentSpriteTemplate: {
    tag: "ANIM_TAG_FLYING_DIRT",
    width: 32,
    height: 16,
    init(sprite, run, args, done) {
      const fromRight = args[3] !== 0 && run.attacker.foe;
      const dx = fromRight ? -args[1] : args[1];
      sprite.x = fromRight ? 304 : -64;
      sprite.y = args[0] + 8;
      sprite.hFlip = fromRight;
      // sFlyingSandSubsprites: the second piece beside the first (on its left when flipped).
      const other = run.createSprite({ tag: "ANIM_TAG_FLYING_DIRT", width: 32, height: 16, init: () => {} }, 0, 0, sprite.subpriority);
      const offset = fromRight ? -32 : 32;
      const follow = () => {
        if (!other) return;
        Object.assign(other, { x: sprite.x + offset, y: sprite.y, x2: sprite.x2, y2: sprite.y2, hFlip: sprite.hFlip, tileNum: 8, priority: 1 });
      };
      sprite.priority = 1;
      follow();
      let [x, y] = [0, 0];
      sprite.callback = () => {
        x += dx;
        y += args[2];
        sprite.x2 += x >> 8;
        sprite.y2 += y >> 8;
        x &= 0xff;
        y &= 0xff;
        follow();
        const at = sprite.x + sprite.x2;
        if (fromRight ? at < -32 : at > 272) {
          if (other) run.flow.gba.sprites.destroy(other);
          done();
        }
      };
    },
  },
};

export const WEATHER_TASKS: Record<string, AnimTask> = {
  /** AnimTask_CreateRaindrops: every args[1] frames a drop at a random spot of the upper half, for args[2] frames. */
  *AnimTask_CreateRaindrops(run, args) {
    for (let frame = 1; ; frame++) {
      if (frame % args[1] === 1) run.createSprite(RAIN_DROP, Math.floor(Math.random() * 240), Math.floor(Math.random() * 80), 4);
      if (frame === args[2]) return;
      yield;
    }
  },

  /**
   * AnimTask_LoadSandstormBackground: blowing sand on BG1 scrolls across (the other way for the
   * foe's moves when args[0]), fading in, staying 100 frames, fading out.
   */
  *AnimTask_LoadSandstormBackground(run, args) {
    const art = run.art("sandstorm");
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
    const dx = args[0] && run.attacker.foe ? 6 : -6;
    let [x, y] = [0, 0];
    const scroll = () => {
      x += dx;
      y -= 1;
      bg1.x = x * 256;
      bg1.y = y * 256;
    };
    const fade = function* (from: number, to: number) {
      for (let eva = from, tick = 0; eva !== to; ) {
        yield;
        scroll();
        if (++tick === 4) {
          tick = 0;
          eva += Math.sign(to - from);
          Object.assign(video, { eva, evb: 16 - eva });
        }
      }
    };
    yield;
    yield* fade(0, 7);
    for (let i = 0; i < 101; i++) {
      yield;
      scroll();
    }
    yield* fade(7, 0);
    yield;
    bg1.visible = false;
    yield;
    bg1.x = bg1.y = 0;
    video.resetBlend();
  },

  /** AnimTask_Hail: ten hailstones of three sizes fall on the battlers and around them; done once all landed. */
  *AnimTask_Hail(run) {
    let falling = 0;
    const landed = () => falling--;
    yield;
    for (let n = 0; n < 10; n++) {
      // State 0: 3 frames; state 1: a stone of each size, a frame apart.
      for (let i = 0; i < 3; i++) yield;
      for (let size = 0; size < 3; size++) {
        yield;
        if (hailstone(run, n, size, landed)) falling++;
        if (size < 2) yield;
      }
    }
    while (falling > 0) yield;
  },
};
