// The thrown Poké Ball (battle_anim_special.c): it flies to the foe, opens, draws the Pokémon in,
// drops and bounces, shakes as many times as the throw's result says, then either clicks shut
// (stars, then it fades away) or breaks open and lets the Pokémon out; a trainer bats it away.
// Playback passes the ball and its result (AnimContext.ballThrow: gLastUsedItem's ball and
// ballThrowCaseId).

import { ObjMode, type Sprite } from "../../../../gba/sprites";
import { Effect, Layer, RGB_BLACK, RGB_WHITE } from "../../../../gba/video";
import { BALLS, BallAffine, BallId, MonAffine, PokeBalls } from "../../../pokeball";
import type { SoundId } from "../../../manifest";
import { AnimBattler, type AnimRun, type AnimTask } from "../script";
import { arc, battlerCoords, cos, resetMonScale } from "./util";

/** ballThrowCaseId: BALL_NO_SHAKES … BALL_3_SHAKES_FAIL (0-3), then these. */
export const enum BallThrowCase {
  Caught = 4,
  TrainerBlock = 5,
  GhostDodge = 6,
}

/** sCaptureStar: where each star lands from the ball, and its arc. */
const CAPTURE_STARS = [
  [10, 2, -3],
  [15, 0, -4],
  [-10, 2, -4],
] as const;

const BOUNCE_SOUNDS: SoundId[] = ["se_ball_bounce_1", "se_ball_bounce_2", "se_ball_bounce_3", "se_ball_bounce_4"];

const throwOf = (run: AnimRun) => run.ballThrow ?? { ball: BallId.Poke, result: 0 };

/** ChangeSpriteAffineAnim: the next animation, from the rotation the ball has now. */
function changeAffine(sprite: Sprite, num: number): void {
  sprite.affineAnimNum = num;
  sprite.affineBeginning = true;
  sprite.affineEnded = false;
}

/** SpriteCB_ThrowBall_TenFrameDelay … _ShrinkMon: the Pokémon shrinks and rises into the ball, then hides. */
function* shrinkMon(run: AnimRun, ball: Sprite, mon: Sprite): Generator<void, void, void> {
  for (let i = 0; i < 10; i++) yield;
  let timer = 0;
  const tick = () => {
    if (++timer === 11) run.flow.play("se_ball_trade");
  };
  // 0: PrepareBattlerSpriteForRotScale and the distance to cover in 28 frames.
  yield;
  tick();
  mon.affineAnimPaused = true;
  mon.mode = ObjMode.Normal;
  let scale = 256;
  const delta = Math.trunc(((mon.y + mon.y2 - (ball.y + ball.y2)) * 256) / 28);
  let rise = 0;
  // 1: smaller and higher each frame.
  for (;;) {
    yield;
    tick();
    scale += 0x20;
    mon.setRotScale(scale, scale, 0);
    rise += delta;
    mon.y2 = -rise >> 8;
    if (scale >= 0x480) break;
  }
  // 2: gone into the ball.
  yield;
  tick();
  resetMonScale(mon);
  mon.invisible = true;
  for (;;) {
    yield;
    tick();
    if (timer > 10) break;
  }
}

/** SpriteCB_ThrowBall_InitialFall + _Bounce: the closed ball drops 40 pixels and bounces four times, lower each time. */
function* bounce(run: AnimRun, ball: Sprite): Generator<void, void, void> {
  ball.startAnim(2);
  while (!ball.animEnded) yield;
  let height = 40;
  let angle = 0;
  ball.y += cos(0, 40);
  ball.y2 = -cos(0, height);
  for (let bounces = 0; bounces < 4; ) {
    yield;
    ball.y2 = -cos(angle, height);
    angle += bounces + 4;
    if (angle < 64) continue;
    height -= 10;
    run.flow.play(BOUNCE_SOUNDS[bounces++]);
    if (bounces === 4) break;
    for (;;) {
      yield;
      ball.y2 = -cos(angle, height);
      angle -= bounces + 4;
      if (angle <= 0) break;
    }
    angle = 0;
  }
  ball.y += cos(64, 40);
  ball.y2 = 0;
}

/**
 * SpriteCB_ThrowBall_InitShake + _DoShake: shakes left and right (one pixel each 0x100 of a
 * 0xB0-a-frame subpixel), 31 frames between shakes; done after `result` shakes, or at the third
 * of a catch.
 */
function* shakes(run: AnimRun, ball: Sprite, result: number): Generator<void, void, void> {
  for (let i = 0; i < 31; i++) yield;
  ball.affineAnimPaused = true;
  ball.startAffineAnim(BallAffine.RotateRight);
  run.flow.play("se_ball");
  let dir = 1;
  let subpx = 0;
  const nudge = () => {
    if (subpx > 0xff) {
      ball.x2 += dir;
      subpx &= 0xff;
    } else subpx += 0xb0;
    ball.affineAnimPaused = false;
  };
  const roll = () => {
    dir = -dir;
    ball.affineAnimPaused = false;
    changeAffine(ball, dir < 0 ? BallAffine.RotateLeft : BallAffine.RotateRight);
  };
  for (let shake = 1; ; shake++) {
    // Case 0: 8 frames one way.
    for (let n = 1; n <= 8; n++) {
      yield;
      nudge();
    }
    subpx = 0;
    // Case 1: turn.
    yield;
    roll();
    // Case 2: 13 frames the other way.
    for (let n = 1; n <= 13; n++) {
      yield;
      nudge();
    }
    subpx = 0;
    // Cases 3 and 4: turn, 5 frames back to the middle.
    yield;
    roll();
    nudge();
    for (let n = 2; n <= 5; n++) {
      yield;
      nudge();
    }
    subpx = 0;
    dir = -dir;
    // Case 5: was that the last?
    yield;
    ball.affineAnimPaused = true;
    if (shake === result || (result === BallThrowCase.Caught && shake === 3)) return;
    // Case 6: 31 frames, then the next shake.
    for (let n = 1; n <= 31; n++) yield;
    ball.startAffineAnim(BallAffine.Reset);
    ball.startAffineAnim(dir < 0 ? BallAffine.RotateLeft : BallAffine.RotateRight);
    run.flow.play("se_ball");
  }
}

/** SpriteCB_ThrowBall_InitClick … _FinishClick: the click, the stars, the fanfare's intro; the Pokémon is caught and the ball fades away. */
function* click(run: AnimRun, ball: Sprite, mon: Sprite): Generator<void, void, void> {
  const { gba } = run.flow;
  yield;
  ball.animPaused = true;
  const ballPalette = 1 << (16 + ball.paletteNum);
  for (let frame = 1; frame <= 315; frame++) {
    yield;
    if (frame === 40) {
      run.flow.play("se_ball_click");
      gba.palettes.blendPalettes(ballPalette, 6, RGB_BLACK);
      stars(run, ball);
    } else if (frame === 60) gba.palettes.beginFade(ballPalette, 2, 6, 0, RGB_BLACK);
    else if (frame === 95) {
      gba.sound.stopAll();
      run.flow.play("mus_caught_intro");
    }
  }
  // The caught Pokémon's sprite goes (playback keeps its spot empty).
  mon.invisible = true;
  yield;
  ball.mode = ObjMode.Blend;
  const { video } = gba;
  video.effect = Effect.Blend;
  video.target1 = 0;
  video.target2 = Layer.ALL;
  video.eva = 16;
  video.evb = 0;
  gba.palettes.beginFade(ballPalette, 0, 0, 16, RGB_WHITE);
  for (let step = 1; step <= 16; ) {
    yield;
    yield;
    video.eva = 16 - step;
    video.evb = step++;
  }
  yield;
  ball.invisible = true;
  do yield;
  while (gba.palettes.fadeActive);
  video.effect = Effect.None;
  video.eva = video.evb = 0;
}

/** CreateStarsWhenBallClicks: three blinking Master Ball stars arc away from the ball. */
function stars(run: AnimRun, ball: Sprite): void {
  const subpriority = ball.subpriority ? ball.subpriority - 1 : 0;
  if (!ball.subpriority) ball.subpriority = 1;
  const balls = new PokeBalls(run.flow);
  for (const [dx, dy, amplitude] of CAPTURE_STARS) {
    let flight: Generator<void, void, void> | undefined;
    balls.particle(BallId.Master, ball.x, ball.y, 0, subpriority, BALLS[BallId.Master].anim, (s) => {
      s.invisible = !s.invisible;
      flight ??= arc(s, 24, ball.x + dx, ball.y + dy, amplitude);
      return !!flight.next().done;
    });
  }
}

/** SpriteCB_ThrowBall_BeginBreakOut + _RunBreakOut: the ball opens and the Pokémon grows back out of it. */
function* breakOut(run: AnimRun, ball: Sprite, mon: Sprite, kind: BallId, monWasInvisible: boolean): Generator<void, void, void> {
  for (let i = 0; i < 32; i++) yield;
  const balls = new PokeBalls(run.flow);
  ball.startAnim(1);
  ball.startAffineAnim(BallAffine.Still);
  balls.particles(ball.x, ball.y - 5, 1, 28, kind);
  balls.fadeMon(mon.paletteNum, 14, kind, true);
  mon.invisible = false;
  mon.affineAnimPaused = false;
  mon.startAffineAnim(MonAffine.Emerge);
  run.flow.gba.sprites.animateSprite(mon);
  let rise = 0x1000;
  for (;;) {
    yield;
    let out = false;
    if (ball.animEnded) ball.invisible = true;
    if (mon.affineEnded) {
      mon.startAffineAnim(MonAffine.Normal);
      out = true;
    } else {
      rise -= 288;
      mon.y2 = rise >> 8;
    }
    if (ball.animEnded && out) break;
  }
  mon.y2 = 0;
  mon.invisible = monWasInvisible;
}

/** TrainerBallBlock: batted away, down and left (8 and 6.5 pixels a frame) until off screen. */
function* blocked(ball: Sprite): Generator<void, void, void> {
  yield;
  ball.x += ball.x2;
  ball.y += ball.y2;
  ball.x2 = ball.y2 = 0;
  let [fy, fx] = [0, 0];
  do {
    yield;
    const dy = fy + 0x800;
    const dx = fx + 0x680;
    ball.x2 -= dx >> 8;
    ball.y2 += dy >> 8;
    fy = dy & 0xff;
    fx = dx & 0xff;
  } while (!(ball.y + ball.y2 > 160 || ball.x + ball.x2 < -8));
}

export const BALL_TASKS: Record<string, AnimTask> = {
  *AnimTask_LoadBallGfx(run) {
    new PokeBalls(run.flow).loadGfx(throwOf(run).ball);
  },

  *AnimTask_FreeBallGfx(run) {
    new PokeBalls(run.flow).freeGfx(throwOf(run).ball);
  },

  /** AnimTask_ThrowBall: from the player's side to the foe, and what follows; ends when the ball is done. */
  *AnimTask_ThrowBall(run) {
    const { ball: kind, result } = throwOf(run);
    const { gba } = run.flow;
    const balls = new PokeBalls(run.flow);
    const ball = balls.sprite(kind, 32, 80, 29);
    const mon = run.target.sprite;
    const monWasInvisible = mon?.invisible ?? true;
    const [x, y] = battlerCoords(run, AnimBattler.Target);
    yield* arc(ball, 34, x, y - 16, -40);
    if (result === BallThrowCase.TrainerBlock || result === BallThrowCase.GhostDodge || !mon) {
      // BallThrowGhostDodged stays unused until Pokémon Tower (Phase 12): it is batted away too.
      yield* blocked(ball);
    } else {
      ball.startAnim(1);
      ball.x += ball.x2;
      ball.y += ball.y2;
      ball.x2 = ball.y2 = 0;
      balls.particles(ball.x, ball.y - 5, 1, 28, kind);
      balls.fadeMon(mon.paletteNum, 14, kind, false);
      yield* shrinkMon(run, ball, mon);
      yield* bounce(run, ball);
      if (result > 0) yield* shakes(run, ball, result);
      if (result === BallThrowCase.Caught) yield* click(run, ball, mon);
      else yield* breakOut(run, ball, mon, kind, monWasInvisible);
    }
    gba.sprites.destroy(ball);
  },

  *AnimTask_IsBallBlockedByTrainerOrDodged(run) {
    const { result } = throwOf(run);
    run.args[7] = result === BallThrowCase.TrainerBlock ? -1 : result === BallThrowCase.GhostDodge ? -2 : 0;
  },
};

export const BALL_TASK_SOUNDS: Record<string, readonly SoundId[]> = {
  AnimTask_ThrowBall: ["se_ball_open", "se_ball_trade", ...BOUNCE_SOUNDS, "se_ball", "se_ball_click", "mus_caught_intro"],
};
