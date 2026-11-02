// What the behaviors share (battle_anim_mons.c): battlers' spots, sprite placement, linear moves,
// palette selections and the sine table, written from FireRed's helpers.

import type { Sprite } from "../../../../gba/sprites";
import { SIN } from "../../../../gba/trig";
import { AnimBattler, type AnimMon, type AnimRun } from "../script";

/** sBattlerCoords (singles): BATTLER_COORD_X / Y, without the picture's offsets. */
const BATTLER_COORDS = { player: [72, 80], foe: [176, 40] } as const;

/** Sin(index, amplitude), Cos(index, amplitude): the sine table at 256 steps per turn. */
export const sin = (index: number, amplitude: number) => (SIN[index & 0xff] * amplitude) >> 8;
export const cos = (index: number, amplitude: number) => (SIN[(index & 0xff) + 64] * amplitude) >> 8;

/** gBattleAnimAttacker / gBattleAnimTarget's battler ID in singles (player 0, foe 1). */
export const battlerId = (mon: AnimMon) => (mon.foe ? 1 : 0);

/** GetBattlerSpriteCoord(…, BATTLER_COORD_X / Y): the battler's spot. */
export function battlerCoords(run: AnimRun, which: AnimBattler): [number, number] {
  const [x, y] = run.mon(which).foe ? BATTLER_COORDS.foe : BATTLER_COORDS.player;
  return [x, y];
}

/** GetAnimBattlerSpriteId(ANIM_ATTACKER / ANIM_TARGET): its sprite, none for a partner (singles). */
export function monSprite(run: AnimRun, which: number): Sprite | null {
  return which === AnimBattler.Attacker || which === AnimBattler.Target ? run.mon(which).sprite : null;
}

/** SetAnimSpriteInitialXOffset: an X offset toward the target (mirrored when the foe attacks). */
export function sideX(run: AnimRun, dx: number): number {
  return run.attacker.foe ? -dx : dx;
}

/** InitSpritePosToAnimAttacker: at the attacker (its picture's center, or its spot), offset by args[0], args[1]. */
export function placeAtAttacker(sprite: Sprite, run: AnimRun, args: readonly number[], picture = true): void {
  [sprite.x, sprite.y] = picture ? run.center(AnimBattler.Attacker) : battlerCoords(run, AnimBattler.Attacker);
  sprite.x += sideX(run, args[0]);
  sprite.y += args[1];
}

/** InitSpritePosToAnimTarget: at the target (where sprites start, or its spot), offset by args[0], args[1]. */
export function placeAtTarget(sprite: Sprite, run: AnimRun, args: readonly number[], picture = true): void {
  if (!picture) [sprite.x, sprite.y] = battlerCoords(run, AnimBattler.Target);
  sprite.x += sideX(run, args[0]);
  sprite.y += args[1];
}

/**
 * InitSpriteDataForLinearTranslation + TranslateSpriteLinearByIdFixedPoint: `frames` steps from
 * (x1, y1) to (x2, y2) in 8.8, as offsets; `move` gets each step's offset in whole pixels.
 */
export function* linear(frames: number, dx: number, dy: number, move: (x: number, y: number) => void, startX = 0, startY = 0): Generator<void, void, void> {
  const stepX = Math.trunc(((dx << 8) << 16 >> 16) / frames);
  const stepY = Math.trunc(((dy << 8) << 16 >> 16) / frames);
  let x = startX;
  let y = startY;
  for (let left = frames; left > 0; left--) {
    x += stepX;
    y += stepY;
    move(x >> 8, y >> 8);
    yield;
  }
}

/**
 * A sprite's callbacks as a generator: the first step is the creation call (up to the first
 * yield), then one step a frame; `done` when it returns.
 */
export function runSprite(sprite: Sprite, steps: Generator<void, void, void>, done: () => void): void {
  const step = () => {
    if (steps.next().done) done();
  };
  sprite.callback = step;
  step();
}

/**
 * StartAnimLinearTranslation (InitAnimLinearTranslation + AnimTranslateLinear): the sprite moves
 * from its spot to (toX, toY) over `frames` steps as x2/y2, the first at once; returns on the next.
 */
export function* travel(sprite: Sprite, frames: number, toX: number, toY: number): Generator<void, void, void> {
  const axis = (d: number) => {
    const step = (((Math.abs(d) << 8) & 0xffff) / frames) & 0xffff;
    return d < 0 ? step | 1 : step & ~1;
  };
  const [stepX, stepY] = [axis(toX - sprite.x), axis(toY - sprite.y)];
  let [x, y] = [0, 0];
  for (let left = frames; left > 0; left--) {
    x = (x + stepX) & 0xffff;
    y = (y + stepY) & 0xffff;
    sprite.x2 = stepX & 1 ? -(x >> 8) : x >> 8;
    sprite.y2 = stepY & 1 ? -(y >> 8) : y >> 8;
    yield;
  }
}

/**
 * GetBattlePalettesMask by UnpackSelectedBattlePalettes' selector bits: 1 the battle background
 * (palettes 1-3), 2 the attacker, 4 the target (partners and the anim backgrounds: doubles and
 * monbg only). As a game mask: BG palettes in bits 0-15, battler N's sprite palette in bit 16 + N.
 */
export function selectedPalettes(run: AnimRun, selector: number): number {
  let mask = selector & 1 ? 0xe : 0;
  if (selector & 2) mask |= 1 << (16 + battlerId(run.attacker));
  if (selector & 4) mask |= 1 << (16 + battlerId(run.target));
  return mask >>> 0;
}

/** GetBattleMonSpritePalettesMask(playerLeft, playerRight, foeLeft, foeRight) in singles. */
export function monPalettes(run: AnimRun, playerLeft: boolean, foeLeft: boolean): number {
  let mask = 0;
  for (const mon of [run.attacker, run.target]) {
    if (!mon.sprite || mon.sprite.invisible) continue;
    if ((mon.foe && foeLeft) || (!mon.foe && playerLeft)) mask |= 1 << (16 + battlerId(mon));
  }
  return mask >>> 0;
}

/** A game palette mask as ours: battler N's bit becomes its sprite's own palette slot. */
export function paletteMask(run: AnimRun, mask: number): number {
  let out = mask & 0xffff;
  for (const mon of [run.attacker, run.target]) if (mon.sprite && (mask >>> (16 + battlerId(mon))) & 1) out |= 1 << (16 + mon.sprite.paletteNum);
  return out >>> 0;
}

/** The palettes (first color) a game mask names, in our palette RAM. */
export function paletteOffsets(run: AnimRun, mask: number): number[] {
  const ours = paletteMask(run, mask);
  const offsets: number[] = [];
  for (let i = 0; i < 32; i++) if ((ours >>> i) & 1) offsets.push(i * 16);
  return offsets;
}
