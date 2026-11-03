// Colors blending (battle_anim_normal.c, battle_anim_utility_funcs.c, battle_anim_mons.c): the
// battlers' and the terrain's palettes fade toward a color and back, through the palette fade
// (BeginNormalPaletteFade, one fade at a time) or blended step by step (BlendPalette).

import type { Effect } from "../../../../gba/video";
import { AnimBattler, type AnimRun, type AnimSpriteTemplate, type AnimTask } from "../script";
import { battlerId, monPalettes, monSprite, paletteMask, paletteOffsets, selectedPalettes, tagPaletteOffset } from "./util";

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

/** StartBlendAnimSpriteColor on the palette at `offset`. */
function* blendStepsAt(run: AnimRun, offset: number, args: readonly number[]): Generator<void, void, void> {
  let wait = 0;
  let coeff = args[2];
  for (;;) {
    if (wait === args[1]) {
      wait = 0;
      run.flow.gba.palettes.blendPalette(offset, 16, coeff, args[4]);
      if (coeff < args[3]) coeff++;
      else if (coeff > args[3]) coeff--;
      else return;
    } else wait++;
    yield;
  }
}

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

/** AnimTask_BlendMonInAndOut_Step: 15 colors at `offset` blend toward args[1] up to args[2], a step every args[3] frames, and back, args[4] times. */
function* blendInAndOut(run: AnimRun, offset: number, args: readonly number[]): Generator<void, void, void> {
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
}

const backups = new WeakMap<AnimRun, Map<number, Uint16Array>>();
function backupOf(run: AnimRun): Map<number, Uint16Array> {
  let backup = backups.get(run);
  if (!backup) backups.set(run, (backup = new Map()));
  return backup;
}

/** The palette AnimTask_CopyPal* name: 0 the battle background's first (palette 1), 1 the attacker's, 2 the target's. */
function backupOffset(run: AnimRun, which: number): number {
  if (which === 0) return 16;
  const mon = which === 1 ? run.attacker : run.target;
  return 256 + (mon.sprite?.paletteNum ?? 0) * 16;
}

/** BlendColorCycle: fades from args[3] to args[4] toward color args[5] and back, args[2] fades (the last to 0). */
function* colorCycle(run: AnimRun, args: readonly number[], mask: number, ours = false): Generator<void, void, void> {
  let left = args[2];
  let back = false;
  const fade = (from: number, to: number) => {
    if (ours) run.flow.gba.palettes.beginFade(mask >>> 0, args[1], from, to, args[5]);
    else beginFade(run, mask, args[1], from, to, args[5]);
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
    for (const mon of run.field)
      if (mon.sprite && !mon.sprite.invisible && !excluded.some((e) => e.foe === mon.foe && (e.position ?? 0) === (mon.position ?? 0))) mask |= 1 << (16 + battlerId(mon));
    yield* blendSteps(run, mask >>> 0, args);
  },

  /**
   * AnimTask_BlendColorCycle: the palettes args[0] selects fade from args[3] to args[4] toward
   * color args[5] and back, args[2] fades in all (the last back to 0), a step every args[1] + 1 frames.
   */
  *AnimTask_BlendColorCycle(run, args) {
    yield* colorCycle(run, args, selectedPalettes(run, args[0]));
  },

  /** AnimTask_BlendParticle: a tag's palette (args[0]) blends like AnimTask_BlendBattleAnimPal. */
  *AnimTask_BlendParticle(run, args) {
    yield* blendStepsAt(run, tagPaletteOffset(run, args[0]), args);
  },

  /** AnimTask_BlendColorCycleExclude: AnimTask_BlendColorCycle on no battler in singles; args[0] 1 the terrain. */
  *AnimTask_BlendColorCycleExclude(run, args) {
    yield* colorCycle(run, args, args[0] === 1 ? 0xe : 0);
  },

  /** AnimTask_BlendColorCycleByTag: AnimTask_BlendColorCycle on a tag's palette (args[0]). */
  *AnimTask_BlendColorCycleByTag(run, args) {
    yield* colorCycle(run, args, 1 << (16 + ((tagPaletteOffset(run, args[0]) - 256) >> 4)), true);
  },

  /**
   * AnimTask_FlashAnimTagWithColor: a tag's palette (args[0]) switches between color args[3] at
   * args[4] and color args[5] at args[6], args[2] times, args[1] frames apart; then its own.
   */
  *AnimTask_FlashAnimTagWithColor(run, args) {
    const { palettes } = run.flow.gba;
    const offset = tagPaletteOffset(run, args[0]);
    palettes.blendPalette(offset, 16, args[4], args[3]);
    let [wait, toggle, left] = [args[1], args[1], args[2]];
    for (;;) {
      yield;
      if (wait > 0) {
        wait--;
        continue;
      }
      if (left === 0) {
        palettes.blendPalette(offset, 16, 0, 0);
        return;
      }
      if (toggle & 0x100) palettes.blendPalette(offset, 16, args[4], args[3]);
      else palettes.blendPalette(offset, 16, args[6], args[5]);
      toggle ^= 0x100;
      wait = toggle & 0xff;
      left--;
    }
  },

  /** AnimTask_InvertScreenColor: flips the colors of the terrain, attacker, target (bit 0x100 of args[0-2]). */
  *AnimTask_InvertScreenColor(run, args) {
    let mask = args[0] & 0x100 ? 0xe : 0;
    if (args[1] & 0x100) mask |= 1 << (16 + battlerId(run.attacker));
    if (args[2] & 0x100) mask |= 1 << (16 + battlerId(run.target));
    const { faded } = run.flow.gba.palettes;
    for (const offset of paletteOffsets(run, mask >>> 0)) for (let i = 0; i < 16; i++) faded[offset + i] ^= 0x7fff;
  },

  /**
   * AnimTask_BlendMonInAndOut: the battler's (args[0]) colors but the transparent one blend toward
   * args[1] up to args[2], a step every args[3] frames, and back, args[4] times.
   */
  *AnimTask_BlendMonInAndOut(run, args) {
    const mon = monSprite(run, args[0]);
    if (mon) yield* blendInAndOut(run, 256 + mon.paletteNum * 16 + 1, args);
  },

  /** AnimTask_BlendPalInAndOutByTag: the same on the palette of the tag in args[0]. */
  *AnimTask_BlendPalInAndOutByTag(run, args) {
    yield* blendInAndOut(run, tagPaletteOffset(run, args[0]) + 1, args);
  },

  /** AnimTask_SetCamouflageBlend: toward the terrain's color; the building's is white. */
  *AnimTask_SetCamouflageBlend(run, args) {
    yield* blendSteps(run, selectedPalettes(run, args[0]), [args[0], args[1], args[2], args[3], 0x7fff]);
  },

  /** AnimTask_BlendNonAttackerPalettes: the others blend from args[1] to args[2] toward color args[3], every args[0] + 1 frames. */
  *AnimTask_BlendNonAttackerPalettes(run, args) {
    yield* blendSteps(run, (1 << (16 + battlerId(run.opponent))) >>> 0, [0, args[0], args[1], args[2], args[3]]);
  },

  /** AnimTask_Flash: the screen goes white and the battlers black, then back. */
  *AnimTask_Flash(run) {
    const { palettes } = run.flow.gba;
    const { faded } = palettes;
    const mons = paletteOffsets(run, monPalettes(run, true, true));
    const terrain = paletteOffsets(run, selectedPalettes(run, 1));
    for (const offset of mons) faded.fill(0, offset, offset + 16);
    for (const offset of terrain) faded.fill(0x7fff, offset, offset + 16);
    for (let n = 0; n < 7; n++) yield;
    for (let level = 15; level >= 0; level--) {
      yield;
      yield;
      for (const offset of terrain) palettes.blendPalette(offset, 16, level, 0x7fff);
      for (const offset of mons) palettes.blendPalette(offset, 16, level, 0);
    }
  },

  /** AnimTask_HardwarePaletteFade: BLDY steps from args[2] to args[3] on BLDCNT args[0], every args[1] + 1 frames (args[4]: registers cleared at the end). */
  *AnimTask_HardwarePaletteFade(run, args) {
    const { video } = run.flow.gba;
    const down = args[2] >= args[3];
    let [cnt, y, wait, finishing] = [args[0], args[2], args[1], false];
    for (;;) {
      yield;
      if (wait < args[1]) wait++;
      else {
        wait = 0;
        if (down ? y - 1 < args[3] : y + 1 > args[3]) finishing = true;
        else y += down ? -1 : 1;
        if (finishing && args[4] & 1) cnt = y = 0;
      }
      video.target1 = cnt & 0x3f;
      video.effect = ((cnt >> 6) & 3) as Effect;
      video.evy = y;
      if (finishing) return;
    }
  },

  /** AnimTask_AlphaFadeIn: BLDALPHA from (args[0], args[1]) to (args[2], args[3]), one side a step every args[4] + 1 frames. */
  *AnimTask_AlphaFadeIn(run, args) {
    const { video } = run.flow.gba;
    let [a, b, wait, odd] = [args[0], args[1], 0, false];
    video.eva = a;
    video.evb = b;
    while (a !== args[2] || b !== args[3]) {
      yield;
      if (++wait <= args[4]) continue;
      wait = 0;
      odd = !odd;
      if (odd) a += Math.sign(args[2] - a);
      else b += Math.sign(args[3] - b);
      video.eva = a;
      video.evb = b;
    }
  },

  /** The animation's own copy of the palettes it must keep (gMonSpritesGfxPtr->multiUseBuffer). */
  *AnimTask_AllocBackupPalBuffer() {},
  *AnimTask_FreeBackupPalBuffer() {},

  /** AnimTask_CopyPalUnfadedToBackup: a palette (args[0]) into the backup's slot args[1]. */
  *AnimTask_CopyPalUnfadedToBackup(run, args) {
    const offset = backupOffset(run, args[0]);
    backupOf(run).set(args[1], run.flow.gba.palettes.unfaded.slice(offset, offset + 16));
  },

  /** AnimTask_CopyPalUnfadedFromBackup: and back. */
  *AnimTask_CopyPalUnfadedFromBackup(run, args) {
    const saved = backupOf(run).get(args[1]);
    if (saved) run.flow.gba.palettes.unfaded.set(saved, backupOffset(run, args[0]));
  },

  /** AnimTask_CopyPalFadedToUnfaded: the palette's current colors become its own. */
  *AnimTask_CopyPalFadedToUnfaded(run, args) {
    const offset = backupOffset(run, args[0]);
    const { faded, unfaded } = run.flow.gba.palettes;
    unfaded.set(faded.subarray(offset, offset + 16), offset);
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
