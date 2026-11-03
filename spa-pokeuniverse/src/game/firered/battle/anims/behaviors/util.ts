// What the behaviors share (battle_anim_mons.c): battlers' spots, sprite placement, linear moves,
// palette selections and the sine table, written from FireRed's helpers.

import type { AffineCmd, AnimCmd, Sprite } from "../../../../gba/sprites";
import { SIN } from "../../../../gba/trig";
import { AnimBattler, type AnimMon, type AnimRun } from "../script";

/** sBattlerCoords (singles): BATTLER_COORD_X / Y, without the picture's offsets. */
const BATTLER_COORDS = { player: [72, 80], foe: [176, 40] } as const;

/** Sin(index, amplitude), Cos(index, amplitude): the sine table at 256 steps per turn. */
export const sin = (index: number, amplitude: number) => (SIN[index & 0xff] * amplitude) >> 8;
export const cos = (index: number, amplitude: number) => (SIN[(index & 0xff) + 64] * amplitude) >> 8;

/** GetBattlerSpriteCoordAttr's opaque box isn't known here: half of a typical picture. */
export const PIC_HALF = 24;

/** gBattleAnimAttacker / gBattleAnimTarget's battler ID. */
export const battlerId = (mon: AnimMon) => (mon.position ?? 0) * 2 + (mon.foe ? 1 : 0);

/** BATTLE_PARTNER: the other one on its side, if the battle has one. */
export function partnerOf(run: AnimRun, mon: AnimMon): AnimMon | undefined {
  return run.field.find((m) => m.foe === mon.foe && (m.position ?? 0) !== (mon.position ?? 0));
}

/** GetBattlerSpriteCoord(…, BATTLER_COORD_X / Y): the battler's spot. */
export function battlerCoords(run: AnimRun, which: AnimBattler): [number, number] {
  const mon = run.mon(which);
  const [x, y] = mon.spot ?? (mon.foe ? BATTLER_COORDS.foe : BATTLER_COORDS.player);
  return [x, y];
}

/** GetAnimBattlerSpriteId: its sprite, or a partner's (2: the attacker's, 3: the target's), if on the field. */
export function monSprite(run: AnimRun, which: number): Sprite | null {
  if (which === 2) return partnerOf(run, run.attacker)?.sprite ?? null;
  if (which === 3) return partnerOf(run, run.target)?.sprite ?? null;
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
 * (palettes 1-3), 2 the attacker, 4 the target, 8 and 16 their partners (the anim backgrounds:
 * monbg only). As a game mask: BG palettes in bits 0-15, battler N's sprite palette in bit 16 + N.
 */
export function selectedPalettes(run: AnimRun, selector: number): number {
  let mask = selector & 1 ? 0xe : 0;
  if (selector & 2) mask |= 1 << (16 + battlerId(run.attacker));
  if (selector & 4) mask |= 1 << (16 + battlerId(run.target));
  for (const [bit, mon] of [[8, run.attacker], [16, run.target]] as const) {
    const partner = selector & bit ? partnerOf(run, mon) : undefined;
    if (partner?.sprite && !partner.sprite.invisible) mask |= 1 << (16 + battlerId(partner));
  }
  return mask >>> 0;
}

/** GetBattleMonSpritePalettesMask by side: the left one's flag stands for the side's partner too. */
export function monPalettes(run: AnimRun, playerLeft: boolean, foeLeft: boolean): number {
  let mask = 0;
  for (const mon of run.field) {
    if (!mon.sprite || mon.sprite.invisible) continue;
    if ((mon.foe && foeLeft) || (!mon.foe && playerLeft)) mask |= 1 << (16 + battlerId(mon));
  }
  return mask >>> 0;
}

/** A game palette mask as ours: battler N's bit becomes its sprite's own palette slot. */
export function paletteMask(run: AnimRun, mask: number): number {
  let out = mask & 0xffff;
  for (const mon of run.field) if (mon.sprite && (mask >>> (16 + battlerId(mon))) & 1) out |= 1 << (16 + mon.sprite.paletteNum);
  return out >>> 0;
}

/** The palettes (first color) a game mask names, in our palette RAM. */
export function paletteOffsets(run: AnimRun, mask: number): number[] {
  const ours = paletteMask(run, mask);
  const offsets: number[] = [];
  for (let i = 0; i < 32; i++) if ((ours >>> i) & 1) offsets.push(i * 16);
  return offsets;
}

/** ANIMCMD_FRAME, ANIMCMD_JUMP, ANIMCMD_LOOP, ANIMCMD_END: frame tables as short as the game's. */
export const F = (image: number, duration: number, flip: "h" | "v" | "hv" | "" = ""): AnimCmd => ({
  image,
  duration,
  ...(flip.includes("h") ? { hFlip: true } : {}),
  ...(flip.includes("v") ? { vFlip: true } : {}),
});
export const J = (jump: number) => ({ jump });
export const L = (loop: number) => ({ loop });
export const END = "end" as const;
/** AFFINEANIMCMD_FRAME. */
export const A = (xScale: number, yScale: number, rotation: number, duration: number): AffineCmd => ({ xScale, yScale, rotation, duration });

/** An invisible sprite that only drives a behavior (gDummyOamData). */
export const INVISIBLE = { width: 8, height: 8 } as const;

/** Random() % n. */
export const random = (n: number) => Math.floor(Math.random() * n);

/** ArcTan2Neg: the angle of (x, y), negated, at 0x10000 per turn. */
export const arcTan2Neg = (x: number, y: number) => -Math.round((Math.atan2(y, x) * 0x10000) / (2 * Math.PI)) & 0xffff;

/** TrySetSpriteRotScale: the sprite's matrix, the affine animation stopped. */
export function rotScale(sprite: Sprite, xScale: number, yScale: number, rotation: number): void {
  sprite.affineAnimPaused = true;
  sprite.setRotScale(xScale, yScale, rotation);
}

/** WaitAnimForDuration: `n` frames. */
export function* frames(n: number): Generator<void, void, void> {
  for (let i = 0; i < n; i++) yield;
}

/** Until a sprite's frame animation ends (RunStoredCallbackWhenAnimEnds). */
export function* animEnd(sprite: Sprite): Generator<void, void, void> {
  while (!sprite.animEnded) yield;
}

/** Until a sprite's affine animation ends (RunStoredCallbackWhenAffineAnimEnds). */
export function* affineEnd(sprite: Sprite): Generator<void, void, void> {
  while (!sprite.affineEnded) yield;
}

/** A sprite's end once its frame animation ends. */
export function goneAtAnimEnd(sprite: Sprite, done: () => void): void {
  sprite.callback = () => {
    if (sprite.animEnded) done();
  };
}

/** A sprite's end once its affine animation ends. */
export function goneAtAffineEnd(sprite: Sprite, done: () => void): void {
  sprite.callback = () => {
    if (sprite.affineEnded) done();
  };
}

/** callback = StartAnimLinearTranslation, then DestroyAnimSprite: from next frame, to (x, y) in `steps`. */
export function flyTo(sprite: Sprite, steps: number, x: number, y: number, done: () => void): void {
  runSprite(
    sprite,
    (function* () {
      yield;
      yield* travel(sprite, steps, x, y);
    })(),
    done,
  );
}

/**
 * InitAnimArcTranslation + TranslateAnimHorizontalArc: `steps` steps to (toX, toY), y2 bent by a
 * half sine of `amplitude`; `each` after every step (AnimMissileArc turns the sprite there).
 */
export function* arc(sprite: Sprite, steps: number, toX: number, toY: number, amplitude: number, each?: () => void): Generator<void, void, void> {
  const axis = (d: number) => {
    const step = (((Math.abs(d) << 8) & 0xffff) / steps) & 0xffff;
    return d < 0 ? step | 1 : step & ~1;
  };
  const [stepX, stepY] = [axis(toX - sprite.x), axis(toY - sprite.y)];
  const wave = Math.trunc(0x8000 / steps);
  let [x, y, phase] = [0, 0, 0];
  for (let left = steps; left > 0; left--) {
    x = (x + stepX) & 0xffff;
    y = (y + stepY) & 0xffff;
    phase = (phase + wave) & 0xffff;
    sprite.x2 = stepX & 1 ? -(x >> 8) : x >> 8;
    sprite.y2 = (stepY & 1 ? -(y >> 8) : y >> 8) + sin((phase >> 8) & 0xff, amplitude);
    each?.();
    yield;
  }
}

/** InitSpriteDataForLinearTranslation + TranslateSpriteLinearFixedPoint: by (dx, dy) as x2/y2 in `steps`. */
export function* slide(sprite: Sprite, steps: number, dx: number, dy: number): Generator<void, void, void> {
  yield* linear(steps, dx, dy, (x, y) => ((sprite.x2 = x), (sprite.y2 = y)));
}

/** TranslateSpriteLinearAndFlicker: steps at (stepX, stepY) 8.8 a frame, invisible toggled every `every` frames. */
export function* flickerLine(sprite: Sprite, steps: number, stepX: number, stepY: number, every: number): Generator<void, void, void> {
  let [x, y] = [0, 0];
  for (let left = steps; left > 0; ) {
    left--;
    sprite.x2 = x >> 8;
    x += stepX;
    sprite.y2 = y >> 8;
    y += stepY;
    if (every && left % every === 0) sprite.invisible = !sprite.invisible;
    yield;
  }
}

/** TranslateSpriteInCircle: `steps` frames around the spot, radius `amplitude`, `speed` of 256 a frame. */
export function* circle(sprite: Sprite, steps: number, phase: number, amplitude: number, speed: number): Generator<void, void, void> {
  yield* ellipse(sprite, steps, phase, amplitude, amplitude, speed);
}

/** TranslateSpriteInEllipse. */
export function* ellipse(sprite: Sprite, steps: number, phase: number, ampX: number, ampY: number, speed: number): Generator<void, void, void> {
  for (let left = steps; left > 0; left--) {
    sprite.x2 = sin(phase, ampX);
    sprite.y2 = cos(phase, ampY);
    phase = (phase + speed) & 0xff;
    yield;
  }
}

/** TranslateSpriteInGrowingCircle: the radius grows by `growth` 1/256 a frame. */
export function* growingCircle(sprite: Sprite, steps: number, phase: number, amplitude: number, speed: number, growth: number, change = 0): Generator<void, void, void> {
  for (let left = steps; left > 0; left--) {
    const r = (change >> 8) + amplitude;
    sprite.x2 = sin(phase, r);
    sprite.y2 = cos(phase, r);
    phase = (phase + speed) & 0xff;
    change += growth;
    yield;
  }
}

/** SetAnimSpriteInitialXOffset / the attacker's side flips an X offset. */
export const flip = (run: AnimRun, x: number) => (run.attacker.foe ? -x : x);

/** The target's flip (GetBattlerSide(gBattleAnimTarget) == B_SIDE_PLAYER). */
export const flipTarget = (run: AnimRun, x: number) => (run.target.foe ? x : -x);

/** AnimSpriteOnMonPos: at the attacker or target (args[2]), offset, gone when its animation ends. */
export function spriteOnMon(sprite: Sprite, run: AnimRun, args: readonly number[], done: () => void): void {
  const picture = !args[3];
  if (!args[2]) placeAtAttacker(sprite, run, args, picture);
  else placeAtTarget(sprite, run, args, picture);
  let first = true;
  sprite.callback = () => {
    if (first) first = false;
    else if (sprite.animEnded || sprite.affineEnded) done();
  };
}

/** TranslateAnimSpriteToTargetMonLocation: from the attacker to the target's spot (args[2], args[3]) in args[4]. */
export function toTargetLocation(sprite: Sprite, run: AnimRun, args: readonly number[], done: () => void): void {
  placeAtAttacker(sprite, run, args, !(args[5] & 0xff00));
  const [x] = run.center(AnimBattler.Target);
  const y = args[5] & 0xff ? battlerCoords(run, AnimBattler.Target)[1] : run.center(AnimBattler.Target)[1];
  flyTo(sprite, args[4], x + flip(run, args[2]), y + args[3], done);
}

/** AnimThrowProjectile: an arc from the attacker to the target (args[2], args[3]) in args[4], height args[5]. */
export function throwProjectile(sprite: Sprite, run: AnimRun, args: readonly number[], done: () => void): void {
  placeAtAttacker(sprite, run, args);
  const [x, y] = run.center(AnimBattler.Target);
  const steps = arc(sprite, args[4], x + flip(run, args[2]), y + args[3], args[5]);
  runSprite(
    sprite,
    (function* () {
      yield;
      yield* steps;
    })(),
    done,
  );
}

/** A copy of a battler's sprite (CloneBattlerSpriteWithBlend), blended; not tied to the script's end. */
export function cloneMon(run: AnimRun, mon: Sprite, mode: number = 1): Sprite | null {
  const copy = run.flow.gba.sprites.create({ sheet: "animDummy", palette: "animDummy", width: mon.width, height: mon.height, priority: mon.priority, affine: mon.affine }, mon.x, mon.y, mon.subpriority);
  if (!copy) return null;
  Object.assign(copy, { tiles: mon.tiles, tileNum: mon.tileNum, paletteNum: mon.paletteNum, x2: mon.x2, y2: mon.y2, hFlip: mon.hFlip, mode });
  Object.assign(copy, { matrixA: mon.matrixA, matrixB: mon.matrixB, matrixC: mon.matrixC, matrixD: mon.matrixD, affineAnimPaused: true });
  return copy;
}

/** ANIM_TAG_* by number, for the scripts that pass a tag as an arg. */
const TAG_BY_ID: Record<number, string> = {
  10005: "ANIM_TAG_SWORD",
  10009: "ANIM_TAG_GUST",
  10013: "ANIM_TAG_YELLOW_BALL",
  10018: "ANIM_TAG_CONVERSION",
  10135: "ANIM_TAG_IMPACT",
  10143: "ANIM_TAG_HANDS_AND_FEET",
  10147: "ANIM_TAG_ORBS",
  10155: "ANIM_TAG_SMALL_BUBBLES",
  10166: "ANIM_TAG_GREEN_LIGHT_WALL",
  10167: "ANIM_TAG_BLUE_LIGHT_WALL",
  10168: "ANIM_TAG_RED_LIGHT_WALL",
  10169: "ANIM_TAG_GRAY_LIGHT_WALL",
  10170: "ANIM_TAG_ORANGE_LIGHT_WALL",
  10244: "ANIM_TAG_GUARD_RING",
  10249: "ANIM_TAG_HOLLOW_ORB",
  10261: "ANIM_TAG_FLYING_DIRT",
  10267: "ANIM_TAG_WHITE_CIRCLE_OF_LIGHT",
  10285: "ANIM_TAG_CROSS_IMPACT",
  10315: "ANIM_TAG_WATER_GUN",
};

/** The ANIM_TAG_* a script's number names. */
export const tagName = (tagId: number): string | undefined => TAG_BY_ID[tagId];

/** IndexOfSpritePaletteTag: the palette RAM offset of a tag's colors. */
export function tagPaletteOffset(run: AnimRun, tagId: number): number {
  const tag = TAG_BY_ID[tagId] ?? "";
  run.loadTag(tag);
  return 256 + (run.flow.gba.palettes.spritePaletteSlot(tag) & 15) * 16;
}

/** SeekSpriteAnim: the frame animation jumps to command `index`. */
export function seekAnim(sprite: Sprite, index: number): void {
  const cmd = sprite.anims[sprite.animNum][index];
  sprite.animCmdIndex = index;
  sprite.animBeginning = false;
  if (typeof cmd === "object" && "image" in cmd) {
    sprite.tileNum = cmd.image;
    sprite.hFlip = cmd.hFlip ?? false;
    sprite.vFlip = cmd.vFlip ?? false;
    sprite.animDelay = cmd.duration ? cmd.duration - 1 : 0;
  }
}

/** TranslateSpriteLinearFixedPoint at a given speed: (stepX, stepY) 8.8 a frame as x2/y2, `steps` frames. */
export function* slideAt(sprite: Sprite, steps: number, stepX: number, stepY: number): Generator<void, void, void> {
  let [x, y] = [0, 0];
  for (let left = steps; left > 0; left--) {
    x += stepX;
    y += stepY;
    sprite.x2 = x >> 8;
    sprite.y2 = y >> 8;
    yield;
  }
}

/** InitAnimLinearTranslationWithSpeed: the steps a linear move takes at `speed` 8.8 a frame. */
export const speedSteps = (dx: number, speed: number) => Math.trunc((Math.abs(dx) << 8) / speed);
/** InitAnimFastLinearTranslationWithSpeed's frames: the fast translation counts in 4 fraction bits. */
export const fastSteps = (dx: number, speed: number) => Math.trunc((Math.abs(dx) << 4) / speed);

/**
 * BattleAnimHelper_SetSpriteSquashParams + RunSpriteSquash: scales a battler from (x0, y0) to
 * (x1, y1) in `steps` frames, its feet on the ground.
 */
export function* squash(mon: Sprite, x0: number, y0: number, x1: number, y1: number, steps: number): Generator<void, void, void> {
  mon.affineAnimPaused = true;
  for (let n = 1; n <= steps; n++) {
    const y = y0 + Math.trunc(((y1 - y0) * n) / steps);
    mon.setRotScale(x0 + Math.trunc(((x1 - x0) * n) / steps), y, 0);
    mon.y2 = Math.trunc(32 - (32 * 256) / y);
    yield;
  }
}

/** ResetSpriteRotScale. */
export function resetMonScale(mon: Sprite): void {
  mon.setRotScale(0x100, 0x100, 0);
  mon.affineAnimPaused = false;
  mon.y2 = 0;
}

/** TranslateSpriteLinear: by (dx, dy) whole pixels a frame, `steps` frames. */
export function* pixelLine(sprite: Sprite, steps: number, dx: number, dy: number): Generator<void, void, void> {
  for (let left = steps; left > 0; left--) {
    sprite.x2 += dx;
    sprite.y2 += dy;
    yield;
  }
}

/** InitAnimFastLinearTranslationWithSpeed: a straight line's step a frame, 8.8, at `speed` along X. */
export function fastLine(dx: number, dy: number, speed: number): [number, number] {
  const steps = Math.max(1, fastSteps(dx, speed));
  return [Math.trunc((dx * 256) / steps), Math.trunc((dy * 256) / steps)];
}

const offScreen = (x: number, y: number) => x > 256 || x < -16 || y > 160 || y < -16;

/** The start of a particle that crosses the screen: the sprite walks back along the line until it's off screen. */
export function backOffScreen(sprite: Sprite, stepX: number, stepY: number): void {
  let [x, y] = [0, 0];
  while (!offScreen(sprite.x + (x >> 8), sprite.y + (y >> 8))) {
    x -= stepX;
    y -= stepY;
  }
  sprite.x += x >> 8;
  sprite.y += y >> 8;
}

/** AnimFastTranslateLinear until off screen; `each` adds to the offsets after every step. */
export function* lineOffScreen(sprite: Sprite, stepX: number, stepY: number, each?: () => void): Generator<void, void, void> {
  let [x, y] = [0, 0];
  for (;;) {
    x += stepX;
    y += stepY;
    sprite.x2 = x >> 8;
    sprite.y2 = y >> 8;
    each?.();
    if (offScreen(sprite.x + sprite.x2, sprite.y + sprite.y2)) return;
    yield;
  }
}
