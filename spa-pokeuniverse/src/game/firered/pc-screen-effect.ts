// The PC's screens turning on and off like a CRT monitor (pc_screen_effect.c): a white line
// grows from the screen's center to its width, then opens to its height; turning off closes it
// back to a line, then to nothing. WIN0 shows the screen inside it, the backdrop outside.

import type { Gba } from "../gba/gba";
import { PALETTES_ALL } from "../gba/palette";
import type { Task } from "../gba/tasks";
import { Effect, HEIGHT, Layer, RGB_BLACK, WIDTH, WIN_EFFECTS } from "../gba/video";

/** BeginPCScreenEffect's speeds when none is given: 16 pixels a frame across, 20 down. */
const X_SPEED = 16;
const Y_SPEED = 20;
const CENTER_X = WIDTH / 2;
const CENTER_Y = HEIGHT / 2;

/** BLDCNT_TGT1 of every layer and the backdrop, lightened to white (BLDY 16). */
function lightenAll(gba: Gba): void {
  const v = gba.video;
  v.effect = Effect.Lighten;
  v.target1 = Layer.ALL;
  v.evy = 16;
}

/** WIN0 on at `win`, everything shown inside it with effects, nothing outside. */
function openWindow(gba: Gba, left: number, right: number, top: number, bottom: number): void {
  const v = gba.video;
  v.win0On = true;
  Object.assign(v.win0, { left, right, top, bottom });
  v.winIn0 = Layer.BG0 | Layer.BG1 | Layer.BG2 | Layer.BG3 | Layer.OBJ | WIN_EFFECTS;
  v.winOut = 0;
}

/** BeginPCScreenEffect_TurnOn: runs from now on; `isRunning` says when it ended. */
export function beginPcScreenTurnOn(gba: Gba): Task {
  const v = gba.video;
  let state = 0;
  let saved = { effect: v.effect, target1: v.target1, evy: v.evy };
  const run = (task: Task) => {
    switch (state) {
      case 0:
        openWindow(gba, CENTER_X, CENTER_X, CENTER_Y, CENTER_Y + 1);
        break;
      case 1:
        saved = { effect: v.effect, target1: v.target1, evy: v.evy };
        lightenAll(gba);
        break;
      case 2:
        v.win0.left -= X_SPEED;
        v.win0.right += X_SPEED;
        if (v.win0.left <= 0 || v.win0.right >= WIDTH) {
          v.win0.left = 0;
          v.win0.right = WIDTH;
          Object.assign(v, saved, { evy: 0 });
          gba.palettes.blendPalettes(PALETTES_ALL, 0, RGB_BLACK);
          gba.palettes.faded[0] = RGB_BLACK;
        }
        if (v.win0.left) return;
        break;
      case 3:
        v.win0.top -= Y_SPEED;
        v.win0.bottom += Y_SPEED;
        if (v.win0.top <= 0 || v.win0.bottom >= HEIGHT) {
          v.win0.top = 0;
          v.win0.bottom = HEIGHT;
          v.win0On = false;
        }
        if (v.win0.top) return;
        break;
      default:
        Object.assign(v, { effect: saved.effect, target1: saved.target1 });
        gba.tasks.destroy(task);
        return;
    }
    state++;
  };
  return startNow(gba, run);
}

/** BeginPCScreenEffect_TurnOff: the screen ends black. */
export function beginPcScreenTurnOff(gba: Gba): Task {
  const v = gba.video;
  let state = 0;
  const run = (task: Task) => {
    switch (state) {
      case 0:
        gba.palettes.faded[0] = RGB_BLACK;
        break;
      case 1:
        openWindow(gba, 0, WIDTH, 0, HEIGHT);
        break;
      case 2:
        v.win0.top += Y_SPEED;
        v.win0.bottom -= Y_SPEED;
        if (v.win0.top >= CENTER_Y || v.win0.bottom <= CENTER_Y + 1) {
          v.win0.top = CENTER_Y;
          v.win0.bottom = CENTER_Y + 1;
          lightenAll(gba);
        }
        if (v.win0.top !== CENTER_Y) return;
        break;
      case 3:
        v.win0.left += X_SPEED;
        v.win0.right -= X_SPEED;
        if (v.win0.left >= CENTER_X || v.win0.right <= CENTER_X) {
          v.win0.left = CENTER_X;
          v.win0.right = CENTER_X;
          gba.palettes.blendPalettes(PALETTES_ALL, 16, RGB_BLACK);
          gba.palettes.faded[0] = RGB_BLACK;
        }
        if (v.win0.left !== CENTER_X) return;
        break;
      default:
        v.win0On = false;
        v.resetBlend();
        gba.tasks.destroy(task);
        return;
    }
    state++;
  };
  return startNow(gba, run);
}

/** BeginPCScreenEffect: the task's first step runs at once, the rest one per frame. */
function startNow(gba: Gba, run: (task: Task) => void): Task {
  const task = gba.tasks.create(run, 0);
  run(task);
  return task;
}
