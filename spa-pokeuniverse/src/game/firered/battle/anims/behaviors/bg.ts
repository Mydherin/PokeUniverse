// The battle background moving (battle_anim_utility_funcs.c), and the tasks that only answer a
// script's question in gBattleAnimArgs[7] (ARG_RET_ID).

import type { AnimTask } from "../script";

/** gBattleAnimArgs[ARG_RET_ID]. */
const ARG_RET = 7;

export const BG_TASKS: Record<string, AnimTask> = {
  /**
   * AnimTask_StartSlidingBg: the background scrolls by (args[0], args[1]) 1/256 pixels a frame
   * (mirrored for the foe's moves when args[2] is set) until the script sets args[7] to args[3].
   */
  *AnimTask_StartSlidingBg(run, args) {
    const flip = args[2] && run.attacker.foe ? -1 : 1;
    const [dx, dy, stop] = [args[0] * flip, args[1] * flip, args[3]];
    const { backdrop } = run;
    run.spawn(
      (function* () {
        let [x, y] = [0, 0];
        for (;;) {
          x += dx;
          y += dy;
          backdrop.scrollX += x >> 8;
          backdrop.scrollY += y >> 8;
          x &= 0xff;
          y &= 0xff;
          if (run.args[ARG_RET] === stop) {
            backdrop.scrollX = backdrop.scrollY = 0;
            return;
          }
          yield;
        }
      })(),
    );
  },

  /** AnimTask_IsTargetPlayerSide: 1 when the target is on the player's side. */
  *AnimTask_IsTargetPlayerSide(run) {
    run.args[ARG_RET] = run.target.foe ? 0 : 1;
  },

  /** AnimTask_IsContest: never (no contests). */
  *AnimTask_IsContest(run) {
    run.args[ARG_RET] = 0;
  },

  /** AnimTask_GetAttackerSide: B_SIDE_PLAYER 0, B_SIDE_OPPONENT 1. */
  *AnimTask_GetAttackerSide(run) {
    run.args[ARG_RET] = run.attacker.foe ? 1 : 0;
  },
};
