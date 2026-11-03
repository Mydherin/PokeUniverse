// Dark (battle_anim_dark.c): bites and claws, fading battlers and the metal shine.

import { ObjMode } from "../../../../gba/sprites";
import { Effect, Layer } from "../../../../gba/video";
import type { AnimArtFiles } from "../../../manifest";
import { AnimBattler, type AnimRun, type AnimSpriteTemplate, type AnimTask } from "../script";
import { initBg } from "../../../common";
import { A, arc, END, monSprite, cloneMon, PIC_HALF, runSprite } from "./util";

/** BG_ANIM 1's palette (status.ts). */
const ANIM_PALETTE = 8;

/** Rotation of sAffineAnims_Bite, an eighth of a turn each. */
const BITE_AFFINE = [0, 32, 64, 96, -128, -96, -64, -32].map((rotation) => [A(0, 0, rotation, 1), END]);

/** AnimBite: slides by (args[3], args[4]) 8.8 for args[5] frames, then back. */
const bite: AnimSpriteTemplate["init"] = (sprite, _run, args, done) => {
  sprite.x += args[0];
  sprite.y += args[1];
  sprite.startAffineAnim(args[2]);
  let [x, y, n, back] = [0, 0, 0, false];
  sprite.callback = () => {
    if (!back) {
      x += args[3];
      y += args[4];
    } else {
      x -= args[3];
      y -= args[4];
    }
    sprite.x2 = x >> 8;
    sprite.y2 = y >> 8;
    if (!back) {
      if (++n === args[5]) back = true;
    } else if (--n === 0) done();
  };
};

export const DARK_TEMPLATES: Record<string, AnimSpriteTemplate> = {
  gSharpTeethSpriteTemplate: { tag: "ANIM_TAG_SHARP_TEETH", width: 64, height: 64, affineNormal: true, blend: true, affineAnims: BITE_AFFINE, init: bite },
  gClampJawSpriteTemplate: { tag: "ANIM_TAG_CLAMP", width: 64, height: 64, affineNormal: true, blend: true, affineAnims: BITE_AFFINE, init: bite },

  /** AnimTearDrop: falls off a corner of the battler's (args[0]) picture, in one of four spots (args[1]). */
  gTearDropSpriteTemplate: {
    tag: "ANIM_TAG_SMALL_BUBBLES",
    width: 16,
    height: 16,
    affineNormal: true,
    affineAnims: [
      [A(0xc0, 0xc0, 80, 0), A(0, 0, -2, 8), END],
      [A(0xc0, 0xc0, -80, 0), A(0, 0, 2, 8), END],
    ],
    init(sprite, run, args, done) {
      const [x, y] = run.center(args[0] === AnimBattler.Attacker ? AnimBattler.Attacker : AnimBattler.Target);
      sprite.tileNum += 4;
      const [right, left, top] = [x + PIC_HALF, x - PIC_HALF, y - PIC_HALF];
      let dx = 20;
      if (args[1] === 0) [sprite.x, sprite.y] = [right - 8, top + 8];
      else if (args[1] === 1) [sprite.x, sprite.y] = [right - 14, top + 16];
      else {
        [sprite.x, sprite.y] = args[1] === 2 ? [left + 8, top + 8] : [left + 14, top + 16];
        sprite.startAffineAnim(1);
        dx = -20;
      }
      runSprite(
        sprite,
        (function* () {
          yield;
          yield* arc(sprite, 32, sprite.x + dx, sprite.y + 12, -12);
        })(),
        done,
      );
    },
  },
};

export const DARK_ART: Record<string, AnimArtFiles> = {
  metalShine: { png: "battle_anims/masks/metal_shine.png", pal: "battle_anims/masks/metal_shine.png", bin: "battle_anims/masks/metal_shine.bin" },
};
export const DARK_TASK_ART: Record<string, string[]> = { AnimTask_MetallicShine: ["metalShine"] };

/** BLDALPHA on a battler that blends over everything. */
export function monBlend(run: AnimRun, eva: number, evb: number): void {
  const { video } = run.flow.gba;
  video.effect = Effect.Blend;
  video.target1 = 0;
  video.target2 = Layer.ALL;
  video.eva = eva;
  video.evb = evb;
}

/** SetGreyscaleOrOriginalPalette. */
export function setGrayscale(run: AnimRun, offset: number, restore: boolean): void {
  const { faded, unfaded } = run.flow.gba.palettes;
  for (let i = 0; i < 16; i++) {
    const c = unfaded[offset + i];
    if (restore) faded[offset + i] = c;
    else {
      const avg = Math.trunc(((c & 31) + ((c >> 5) & 31) + ((c >> 10) & 31)) / 3);
      faded[offset + i] = avg | (avg << 5) | (avg << 10);
    }
  }
}

/**
 * Memento's shadow: the C stretches a black copy of the battler on a BG by scanlines. Our battlers
 * are sprites: a black copy of the sprite that slides and narrows.
 */
function blackShadow(run: AnimRun, which: AnimBattler) {
  const mon = monSprite(run, which);
  const copy = mon && cloneMon(run, mon);
  if (!copy) return null;
  const { palettes, sprites } = run.flow.gba;
  const tag = "ANIM_TAG_BENT_SPOON";
  copy.paletteNum = palettes.loadSpritePalette(tag, new Uint16Array(16)) & 15;
  return {
    copy,
    end() {
      sprites.destroy(copy);
      palettes.freeSpritePalette(tag);
    },
  };
}

export const DARK_TASKS: Record<string, AnimTask> = {
  /** GetIsDoomDesireHitTurn: answers whether the move's turn is the hit. */
  *GetIsDoomDesireHitTurn(run) {
    if (run.turn === 2) run.args[7] = 1;
    else if ((run.turn ?? 0) < 2) run.args[7] = 0;
  },

  /** AnimTask_InitMementoShadow: the attacker shows again (the C moves it to a BG). */
  *AnimTask_InitMementoShadow(run) {
    const mon = monSprite(run, AnimBattler.Attacker);
    if (mon) mon.invisible = false;
  },

  /** AnimTask_MementoHandleBg: frees that BG; ours has none. */
  *AnimTask_MementoHandleBg() {},

  /** AnimTask_InitAttackerFadeFromInvisible: the blend the fade starts from. */
  *AnimTask_InitAttackerFadeFromInvisible(run) {
    monBlend(run, 0, 16);
  },

  /** AnimTask_MoveAttackerMementoShadow: a black shadow fades in on the attacker, rises and narrows away. */
  *AnimTask_MoveAttackerMementoShadow(run) {
    const shadow = blackShadow(run, AnimBattler.Attacker);
    if (!shadow) return;
    const { copy } = shadow;
    let [a, b, n, wait] = [0, 16, 0, 0];
    monBlend(run, a, b);
    while (a !== 12 || b !== 8) {
      yield;
      if (++wait <= 1) continue;
      wait = 0;
      if (++n & 1) {
        if (a !== 12) a++;
      } else if (b !== 8) b--;
      monBlend(run, a, b);
    }
    let [rise, half] = [0, 32];
    while (half > 0) {
      yield;
      rise += 8;
      copy.y2 = -rise;
      if (copy.y + copy.y2 < -32) {
        half -= 4;
        copy.affineAnimPaused = true;
        copy.setRotScale(Math.min(0x7fff, Math.trunc((0x100 * 32) / Math.max(half, 1))), 0x100, 0);
      }
    }
    shadow.end();
    yield;
    run.flow.gba.video.resetBlend();
  },

  /** AnimTask_MoveTargetMementoShadow: a black shadow falls onto the target, widens and fades out. */
  *AnimTask_MoveTargetMementoShadow(run) {
    const shadow = blackShadow(run, AnimBattler.Target);
    if (!shadow) return;
    const { copy } = shadow;
    let [a, b] = [12, 8];
    monBlend(run, a, b);
    let drop = -(copy.y + 32);
    copy.y2 = drop;
    copy.affineAnimPaused = true;
    while (drop < 0) {
      yield;
      drop = Math.min(0, drop + 8);
      copy.y2 = drop;
    }
    for (let half = 4; half < 32; half += 4) {
      copy.setRotScale(Math.trunc((0x100 * 32) / half), 0x100, 0);
      yield;
    }
    copy.setRotScale(0x100, 0x100, 0);
    let [n, wait] = [0, 0];
    while (a !== 0 || b !== 16) {
      yield;
      if (++wait <= 1) continue;
      wait = 0;
      if (++n & 1) {
        if (a) a--;
      } else if (b < 16) b++;
      monBlend(run, a, b);
    }
    shadow.end();
    yield;
    run.flow.gba.video.resetBlend();
  },

  /** AnimTask_SetGrayscaleOrOriginalPal: a battler's colors gray, or (args[1]) its own; args[0] 4/6 by position. */
  *AnimTask_SetGrayscaleOrOriginalPal(run, args) {
    const which = args[0] === 4 ? run.attacker.foe ? run.target.sprite : run.attacker.sprite : args[0] === 6 ? run.attacker.foe ? run.attacker.sprite : run.target.sprite : monSprite(run, args[0]);
    if (which) setGrayscale(run, 256 + which.paletteNum * 16, !!args[1]);
  },

  /** AnimTask_AttackerFadeToInvisible: the attacker fades out, a step every args[0] + 1 frames, and hides. */
  *AnimTask_AttackerFadeToInvisible(run, args) {
    const mon = monSprite(run, AnimBattler.Attacker);
    if (!mon) return;
    mon.mode = ObjMode.Blend;
    let [a, b, wait] = [16, 0, 0];
    monBlend(run, a, b);
    for (;;) {
      yield;
      if (wait++ !== args[0]) continue;
      wait = 0;
      monBlend(run, --a, ++b);
      if (b === 16) {
        mon.invisible = true;
        return;
      }
    }
  },

  /** AnimTask_AttackerFadeFromInvisible: the attacker fades back in. */
  *AnimTask_AttackerFadeFromInvisible(run, args) {
    const mon = monSprite(run, AnimBattler.Attacker);
    if (!mon) return;
    mon.mode = ObjMode.Blend;
    mon.invisible = false;
    let [a, b, wait] = [0, 16, 0];
    monBlend(run, a, b);
    for (;;) {
      yield;
      if (wait++ !== args[0]) continue;
      wait = 0;
      monBlend(run, ++a, --b);
      if (b === 0) {
        mon.mode = ObjMode.Normal;
        run.flow.gba.video.resetBlend();
        return;
      }
    }
  },

  /** AnimTask_MetallicShine: a band of light crosses the attacker (OBJ window + BG1); gray (args[1] 0) or tinted args[2]. */
  *AnimTask_MetallicShine(run, args) {
    const mon = monSprite(run, AnimBattler.Attacker);
    const art = run.art("metalShine");
    if (!mon || !art) return;
    const { gba } = run.flow;
    const { video } = gba;
    const copy = cloneMon(run, mon, ObjMode.Window);
    if (!copy) return;
    copy.priority = 0;
    const bg1 = video.bgs[1];
    video.objWinOn = true;
    video.winOut = Layer.BG0 | Layer.BG2 | Layer.BG3 | Layer.OBJ | 32;
    video.winObj = Layer.ALL | 32;
    video.effect = Effect.Blend;
    video.target1 = Layer.BG1;
    video.target2 = Layer.ALL;
    video.eva = 8;
    video.evb = 12;
    initBg(bg1, 0, 0);
    bg1.tiles = art.tiles;
    bg1.map.set(art.map!.subarray(0, bg1.map.length));
    bg1.visible = true;
    gba.palettes.load(art.palette, ANIM_PALETTE * 16, 16);
    bg1.x = (-mon.x + 96) * 256;
    bg1.y = (-mon.y + 32) * 256;
    const offset = 256 + mon.paletteNum * 16;
    if (args[1] === 0) setGrayscale(run, offset, false);
    else gba.palettes.blendPalette(offset, 16, 11, args[2]);
    let [n, passes] = [0, 0];
    for (;;) {
      yield;
      n += 4;
      bg1.x -= 4 * 256;
      if (n !== 128) continue;
      n = 0;
      bg1.x += 128 * 256;
      passes++;
      if (passes === 2) {
        if (args[0] === 0) setGrayscale(run, offset, true);
        gba.sprites.destroy(copy);
        bg1.visible = false;
      } else if (passes === 3) {
        bg1.x = bg1.y = 0;
        video.objWinOn = false;
        video.winOut = video.winObj = 0;
        video.resetBlend();
        return;
      }
    }
  },
};
