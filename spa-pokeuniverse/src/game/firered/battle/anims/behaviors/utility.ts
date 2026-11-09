// What's left of battle_anim_utility_funcs.c, battle_anim_mons.c, battle_anim_status_effects.c and
// battle_anim_smokescreen.c: effects on a battler's OBJ window, afterimages, and tasks that answer
// questions about the battle.

import type { Sprite } from "../../../../gba/sprites";
import { ObjMode } from "../../../../gba/sprites";
import { Effect, Layer } from "../../../../gba/video";
import { initBg } from "../../../common";
import type { AnimArtFiles, Graphic } from "../../../manifest";
import { AnimBattler, type AnimRun, type AnimSpriteTemplate, type AnimTask } from "../script";
import { weatherBallDown } from "./rock";
import { cloneMon, END, F, flip, goneAtAnimEnd, J, monSprite } from "./util";

/** BG_ANIM 1's palette (status.ts). */
const ANIM_PALETTE = 8;
const SMOKESCREEN = "SMOKESCREEN_IMPACT";

/**
 * A mask on BG1 seen only through the battler's shape (OBJ window) and blended over it, as
 * StartMonScrollingBgMask and StatsChangeAnimation set it up.
 */
function monMask(run: AnimRun, mon: Sprite, art: Graphic, eva: number, evb: number) {
  const { gba } = run.flow;
  const { video } = gba;
  const copy = cloneMon(run, mon, ObjMode.Window);
  const bg1 = video.bgs[1];
  Object.assign(video, { objWinOn: true, winOut: Layer.BG0 | Layer.BG2 | Layer.BG3 | Layer.OBJ | 32, winObj: Layer.ALL | 32, effect: Effect.Blend, target1: Layer.BG1, target2: Layer.ALL, eva, evb });
  initBg(bg1, 0, 0);
  bg1.tiles = art.tiles;
  bg1.map.set(art.map!.subarray(0, bg1.map.length));
  bg1.visible = true;
  return {
    bg1,
    end() {
      if (copy) gba.sprites.destroy(copy);
      bg1.visible = false;
      bg1.x = bg1.y = 0;
      Object.assign(video, { objWinOn: false, winOut: 0, winObj: 0 });
      video.resetBlend();
    },
  };
}

export const UTILITY_TEMPLATES: Record<string, AnimSpriteTemplate> = {
  /** AnimSpinningSparkle: on the attacker, gone with its animation. */
  gSpinningSparkleSpriteTemplate: {
    tag: "ANIM_TAG_SPARKLE_4",
    width: 32,
    height: 32,
    anims: [[F(0, 3), F(16, 3), F(32, 3), F(48, 3), F(64, 3), END]],
    init(sprite, run, args, done) {
      [sprite.x, sprite.y] = run.center(AnimBattler.Attacker);
      sprite.x += flip(run, args[0]);
      sprite.y += args[1];
      goneAtAnimEnd(sprite, done);
    },
  },

  /** AnimWeatherBallUp: rises off the top of the screen from the attacker, slowing down. */
  gWeatherBallUpSpriteTemplate: {
    tag: "ANIM_TAG_WEATHER_BALL",
    width: 32,
    height: 32,
    anims: [[F(0, 3), J(0)]],
    init(sprite, run, _args, done) {
      [sprite.x, sprite.y] = run.center(AnimBattler.Attacker);
      const stepX = run.attacker.foe ? -10 : 5;
      let [stepY, x, y] = [-40, 0, 0];
      sprite.callback = () => {
        x += stepX;
        y += stepY;
        sprite.x2 = Math.trunc(x / 10);
        sprite.y2 = Math.trunc(y / 10);
        if (stepY < -20) stepY++;
        if (sprite.y + sprite.y2 < -32) done();
      };
    },
  },

  gWeatherBallNormalDownSpriteTemplate: { tag: "ANIM_TAG_WEATHER_BALL", width: 32, height: 32, anims: [[F(0, 3), J(0)]], init: weatherBallDown },
};

export const UTILITY_ART: Record<string, AnimArtFiles> = {
  curse: { png: "battle_anims/masks/curse.png", pal: "battle_anims/masks/curse.png", bin: "battle_anims/masks/curse.bin" },
  cureBubbles: { png: "battle_anims/masks/cure_bubbles.png", pal: "battle_anims/masks/cure_bubbles.png", bin: "battle_anims/masks/cure_bubbles.bin" },
  smokescreenImpact: { png: "battle_anims/sprites/smokescreen_impact.png", pal: "battle_anims/sprites/smokescreen_impact.png" },
};
export const UTILITY_TASK_ART: Record<string, string[]> = {
  AnimTask_DrawFallingWhiteLinesOnAttacker: ["curse"],
  AnimTask_StatusClearedEffect: ["cureBubbles"],
  AnimTask_SmokescreenImpact: ["smokescreenImpact"],
};

export const UTILITY_TASKS: Record<string, AnimTask> = {
  /** AnimTask_SmokescreenImpact: four corners of a cloud burst on the target; waited for, so its art is freed with it. */
  *AnimTask_SmokescreenImpact(run) {
    const art = run.art("smokescreenImpact");
    if (!art) return;
    const { sprites, palettes } = run.flow.gba;
    sprites.loadSheet(SMOKESCREEN, art.tiles);
    palettes.loadSpritePalette(SMOKESCREEN, art.palette);
    const [x, y] = run.center(AnimBattler.Target);
    let active = 0;
    const corner: AnimSpriteTemplate = {
      tag: SMOKESCREEN,
      width: 16,
      height: 16,
      anims: (["", "h", "v", "hv"] as const).map((flip) => [F(0, 4, flip), F(4, 4, flip), F(8, 4, flip), END]),
      init(sprite, _run, _args, done) {
        active++;
        goneAtAnimEnd(sprite, () => {
          active--;
          done();
        });
      },
    };
    [[-16, -16], [0, -16], [-16, 0], [0, 0]].forEach(([dx, dy], i) => run.createSprite(corner, x + 8 + dx, y + 8 + dy, 2)?.startAnim(i));
    while (active > 0) yield;
    sprites.freeSheet(SMOKESCREEN);
    palettes.freeSpritePalette(SMOKESCREEN);
  },

  /** AnimTask_StatusClearedEffect: bubbles scroll inside the attacker's shape, fading in and out (StartMonScrollingBgMask). */
  *AnimTask_StatusClearedEffect(run) {
    const mon = monSprite(run, AnimBattler.Attacker);
    const art = run.art("cureBubbles");
    if (!mon || !art) return;
    const mask = monMask(run, mon, art, 0, 16);
    run.flow.gba.palettes.load(art.palette, ANIM_PALETTE * 16, 16);
    const { video } = run.flow.gba;
    const [speed, steps, delay, duration] = [0x1a0, 10, 2, 30];
    let [scroll, level, wait, held] = [0, 0, 0, 0];
    for (let phase = 0; phase < 3; ) {
      yield;
      scroll += speed;
      mask.bg1.y += (scroll >> 8) * 256;
      scroll &= 0xff;
      if (phase === 1) {
        if (++held === duration) phase++;
      } else if (wait++ >= delay) {
        wait = 0;
        level += phase === 0 ? 1 : -1;
        video.eva = level;
        video.evb = 16 - level;
        if (phase === 0 ? level === steps : level === 0) phase++;
      }
    }
    mask.end();
  },

  /** AnimTask_DrawFallingWhiteLinesOnAttacker: Curse's lines fall four times inside the attacker's shape. */
  *AnimTask_DrawFallingWhiteLinesOnAttacker(run) {
    const mon = monSprite(run, AnimBattler.Attacker);
    const art = run.art("curse");
    if (!mon || !art) return;
    const mask = monMask(run, mon, art, 8, 12);
    run.flow.gba.palettes.load(Uint16Array.of(0x7fff), ANIM_PALETTE * 16 + 1, 1);
    mask.bg1.x = (-mon.x + 32) * 256;
    mask.bg1.y = (-mon.y + 32) * 256;
    for (let falls = 0; falls < 4; falls++) {
      for (let n = 4; n <= 64; n += 4) {
        yield;
        mask.bg1.y -= 4 * 256;
      }
      mask.bg1.y += 64 * 256;
    }
    mask.end();
  },

  /** AnimTask_AttackerPunchWithTrace: the attacker lunges and back, leaving copies tinted args[0] at args[1]/16. */
  *AnimTask_AttackerPunchWithTrace(run, args) {
    const mon = monSprite(run, AnimBattler.Attacker);
    if (!mon) return;
    const { sprites, palettes } = run.flow.gba;
    const tag = "ANIM_TAG_BENT_SPOON";
    const src = 256 + mon.paletteNum * 16;
    const slot = palettes.loadSpritePalette(tag, palettes.unfaded.slice(src, src + 16)) & 15;
    palettes.blendPalette(256 + slot * 16, 16, args[1], args[0]);
    const priority = run.attacker.foe ? 2 : 3;
    const speed = run.attacker.foe ? -8 : 8;
    let active = 0;
    const trace = () => {
      const copy = cloneMon(run, mon);
      if (!copy) return;
      copy.priority = priority;
      copy.paletteNum = slot;
      copy.x2 = mon.x2;
      let life = 8;
      active++;
      copy.callback = () => {
        if (--life > 0) return;
        active--;
        sprites.destroy(copy);
      };
    };
    yield;
    for (let n = 0; n < 5; n++) {
      trace();
      mon.x2 += speed;
      yield;
    }
    for (let n = 4; n > 0; n--) {
      trace();
      mon.x2 -= speed;
      yield;
    }
    mon.x2 = 0;
    while (active > 0) yield;
    palettes.freeSpritePalette(tag);
  },

  /** AnimTask_SetAttackerInvisibleWaitForSignal: tells the C's battler-on-BG code to skip it; ours has none. */
  *AnimTask_SetAttackerInvisibleWaitForSignal() {},

  /** AnimTask_SetAllNonAttackersInvisiblity: everyone else hidden (args[0] 1) or shown. */
  *AnimTask_SetAllNonAttackersInvisiblity(run, args) {
    for (const mon of run.field) {
      const isAttacker = mon.foe === run.attacker.foe && (mon.position ?? 0) === (run.attacker.position ?? 0);
      if (!isAttacker && mon.sprite && !mon.hidden) mon.sprite.invisible = !!args[0];
    }
  },

  *AnimTask_GetTargetSide(run) {
    run.args[7] = run.target.foe ? 1 : 0;
  },

  /** AnimTask_GetTargetIsAttackerPartner. */
  *AnimTask_GetTargetIsAttackerPartner(run) {
    run.args[7] = run.target.foe === run.attacker.foe && (run.target.position ?? 0) !== (run.attacker.position ?? 0) ? 1 : 0;
  },

  *AnimTask_GetBattleTerrain(run) {
    run.args[0] = run.backdrop.terrainId;
  },

  /** AnimTask_GetFrustrationPowerLevel: by friendship; the battle doesn't send it, so from the move's power. */
  *AnimTask_GetFrustrationPowerLevel(run) {
    const friendship = 255 - Math.trunc((run.movePower ?? 0) * 2.5);
    run.args[7] = friendship <= 30 ? 0 : friendship <= 100 ? 1 : friendship <= 200 ? 2 : 3;
  },
};
