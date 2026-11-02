// Sound tasks (battle_anim_sound_tasks.c): sounds a script starts as tasks, panned toward the
// side they come from. Their args[0] is the sound, named by the command's `se`.

import type { AnimTask } from "../script";

/** CalculatePanIncrement: `by`'s size, toward `to`. */
const panStep = (from: number, to: number, by: number) => Math.sign(to - from) * Math.abs(by);

/** Sound tasks started with createsoundtask (waitsound waits for them). */
export const SOUND_TASKS: Record<string, AnimTask> = {
  /**
   * SoundTask_LoopSEAdjustPanning: the sound plays args[4] times, args[6] + 1 frames apart (the
   * first at once), its pan moving from args[1] toward args[2] by args[3] every args[5] + 1 frames.
   */
  *SoundTask_LoopSEAdjustPanning(run, args, se) {
    if (!se) return;
    const to = run.pan(args[2]);
    let pan = run.pan(args[1]);
    const by = panStep(pan, to, args[3]);
    let [plays, panWait, playWait] = [args[4], 0, args[6]];
    for (;;) {
      if (playWait++ === args[6]) {
        playWait = 0;
        run.play(se, pan);
        if (--plays === 0) return;
      }
      if (panWait++ === args[5]) {
        panWait = 0;
        pan = Math.max(-64, Math.min(63, pan + by));
      }
      yield;
    }
  },
};

/** Sound tasks started with createvisualtask (counted as visual tasks). */
export const SOUND_VISUAL_TASKS: Record<string, AnimTask> = {
  /** SoundTask_PlaySE1WithPanning: the sound at pan args[1], on the first sound player. */
  *SoundTask_PlaySE1WithPanning(run, args, se) {
    if (se) run.play(se, run.pan(args[1]), "se1");
  },

  /** SoundTask_PlaySE2WithPanning: the same on the second sound player. */
  *SoundTask_PlaySE2WithPanning(run, args, se) {
    if (se) run.play(se, run.pan(args[1]), "se2");
  },
};
