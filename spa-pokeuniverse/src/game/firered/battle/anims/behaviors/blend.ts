// Colors blending (battle_anim_normal.c, battle_anim_utility_funcs.c, battle_anim_mons.c): the
// battlers' and the terrain's palettes fade toward a color and back, through the palette fade
// (BeginNormalPaletteFade, one fade at a time) or blended step by step (BlendPalette).

import { AnimBattler, type AnimRun, type AnimSpriteTemplate, type AnimTask } from "../script";
import { battlerId, monPalettes, monSprite, paletteMask, paletteOffsets, selectedPalettes } from "./util";

const INVISIBLE = { width: 8, height: 8 } as const;

/** BlendPalettes: the selected palettes (a game mask) `coeff`/16 of the way to `color`. */
function blendPalettes(run: AnimRun, mask: number, coeff: number, color: number): void {
  for (const offset of paletteOffsets(run, mask)) run.flow.gba.palettes.blendPalette(offset, 16, coeff, color);
}

/** BeginNormalPaletteFade on a game mask. */
function beginFade(run: AnimRun, mask: number, delay: number, from: number, to: number, color: number): void {
  run.flow.gba.palettes.beginFade(paletteMask(run, mask), delay, from, to, color);
}

const fadeActive = (run: AnimRun) => run.flow.gba.palettes.fadeActive;

/**
 * StartBlendAnimSpriteColor: every args[1] + 1 frames the palettes blend one step from args[2]
 * to args[3] toward color args[4] (the first step at once).
 */
function* blendSteps(run: AnimRun, mask: number, args: readonly number[]): Generator<void, void, void> {
  let wait = 0;
  let coeff = args[2];
  for (;;) {
    if (wait === args[1]) {
      wait = 0;
      blendPalettes(run, mask, coeff, args[4]);
      if (coeff < args[3]) coeff++;
      else if (coeff > args[3]) coeff--;
      else return;
    } else wait++;
    yield;
  }
}

export const BLEND_TEMPLATES: Record<string, AnimSpriteTemplate> = {
  /**
   * AnimSimplePaletteBlend: the palettes args[0] selects fade from args[2] to args[3] toward
   * color args[4], one step every args[1] + 1 frames; gone when the fade ends.
   */
  gSimplePaletteBlendSpriteTemplate: {
    ...INVISIBLE,
    init(sprite, run, args, done) {
      beginFade(run, selectedPalettes(run, args[0]), args[1], args[2], args[3], args[4]);
      sprite.invisible = true;
      sprite.callback = () => {
        if (!fadeActive(run)) done();
      };
    },
  },

  /**
   * AnimComplexPaletteBlend: the palettes args[0] selects flash between color args[3] at
   * args[4]/16 and color args[5] at args[6]/16, args[2] times, args[1] frames apart; then back.
   */
  gComplexPaletteBlendSpriteTemplate: {
    ...INVISIBLE,
    init(sprite, run, args, done) {
      const mask = selectedPalettes(run, args[0]);
      let wait = args[1];
      let toggle = args[1];
      let left = args[2];
      blendPalettes(run, mask, args[4], args[3]);
      sprite.invisible = true;
      sprite.callback = () => {
        if (wait > 0) return void wait--;
        if (fadeActive(run)) return;
        if (left === 0) {
          blendPalettes(run, mask, 0, 0);
          return done();
        }
        if (toggle & 0x100) blendPalettes(run, mask, args[4], args[3]);
        else blendPalettes(run, mask, args[6], args[5]);
        toggle ^= 0x100;
        wait = toggle & 0xff;
        left--;
      };
    },
  },
};

export const BLEND_TASKS: Record<string, AnimTask> = {
  /**
   * AnimTask_BlendBattleAnimPal: the palettes args[0] selects (bits 7-10: the battlers by position)
   * blend from args[2] to args[3] toward color args[4], a step every args[1] + 1 frames.
   */
  *AnimTask_BlendBattleAnimPal(run, args) {
    const mask = selectedPalettes(run, args[0]) | monPalettes(run, !!((args[0] >> 7) & 1), !!((args[0] >> 9) & 1));
    yield* blendSteps(run, mask, args);
  },

  /**
   * AnimTask_BlendBattleAnimPalExclude: the terrain and every battler but args[0]'s (0 attacker,
   * 1 target, 2/3 the same without the terrain, 4 both, 5 none) blend as AnimTask_BlendBattleAnimPal.
   */
  *AnimTask_BlendBattleAnimPalExclude(run, args) {
    const which = args[0];
    let mask = which === 2 || which === 3 || which >= 6 ? 0 : selectedPalettes(run, 1);
    const excluded = which === 0 || which === 2 ? [run.attacker] : which === 1 || which === 3 ? [run.target] : which === 4 ? [run.attacker, run.target] : [];
    for (const mon of [run.attacker, run.target])
      if (mon.sprite && !mon.sprite.invisible && !excluded.some((e) => e.foe === mon.foe)) mask |= 1 << (16 + battlerId(mon));
    yield* blendSteps(run, mask >>> 0, args);
  },

  /**
   * AnimTask_BlendColorCycle: the palettes args[0] selects fade from args[3] to args[4] toward
   * color args[5] and back, args[2] fades in all (the last back to 0), a step every args[1] + 1 frames.
   */
  *AnimTask_BlendColorCycle(run, args) {
    const mask = selectedPalettes(run, args[0]);
    let left = args[2];
    let back = false;
    const fade = (from: number, to: number) => {
      beginFade(run, mask, args[1], from, to, args[5]);
      left--;
      back = !back;
    };
    fade(0, args[4]);
    for (;;) {
      yield;
      if (fadeActive(run)) continue;
      if (left <= 0) return;
      const [from, to] = back ? [args[4], args[3]] : [args[3], args[4]];
      fade(from, left === 1 ? 0 : to);
    }
  },

  /**
   * AnimTask_BlendMonInAndOut: the battler's (args[0]) colors but the transparent one blend toward
   * args[1] up to args[2], a step every args[3] frames, and back, args[4] times.
   */
  *AnimTask_BlendMonInAndOut(run, args) {
    const mon = monSprite(run, args[0]);
    if (!mon) return;
    const offset = 256 + mon.paletteNum * 16 + 1;
    const { palettes } = run.flow.gba;
    let [coeff, wait, back, left] = [0, 0, false, args[4]];
    for (;;) {
      yield;
      if (++wait < args[3]) continue;
      wait = 0;
      if (!back) {
        palettes.blendPalette(offset, 15, ++coeff, args[1]);
        if (coeff === args[2]) back = true;
      } else {
        palettes.blendPalette(offset, 15, --coeff, args[1]);
        if (coeff === 0) {
          if (--left === 0) return;
          back = false;
        }
      }
    }
  },

  /** Generic status move: the battler (args[0]) blends toward the move's color and back, args[1] times. */
  *GenericBlendMon(run, args) {
    const mon = run.mon(args[0] as AnimBattler).sprite;
    if (!mon) return;
    const { palettes } = run.flow.gba;
    const pal = 256 + mon.paletteNum * 16;
    for (let i = 0; i < args[1]; i++) {
      for (const coeff of [2, 4, 6, 8, 10, 8, 6, 4, 2, 0]) {
        palettes.blendPalette(pal, 16, coeff, run.color);
        yield;
        yield;
      }
    }
  },
};
