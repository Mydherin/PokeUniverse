// Sound tasks (battle_anim_sound_tasks.c): sounds a script starts as tasks, panned toward the
// side they come from. Their args[0] is the sound, named by the command's `se`.

import { Assets, type SoundId } from "../../../manifest";
import type { AnimBattler, AnimRun, AnimTask } from "../script";

/** CalculatePanIncrement: `by`'s size, toward `to`. */
const panStep = (from: number, to: number, by: number) => Math.sign(to - from) * Math.abs(by);
const clampPan = (pan: number) => Math.max(-64, Math.min(63, pan));

/**
 * PlayCry_ByMode on a battler, at the attacker's side. Only normal and faint cries are rendered
 * (plans/battles D15), so the normal cry stands in for the growl, roar, echo and high pitch modes.
 */
function cry(run: AnimRun, which: AnimBattler): boolean {
  const { species, sprite } = run.mon(which);
  if (!species || !sprite) return false;
  run.play(Assets.cryId(species) as SoundId, run.pan(-64), "cry");
  return true;
}

/** Until the cry player is done, the first two frames not counting (it starts a frame late on the GBA). */
function* crying(run: AnimRun): Generator<void, void, void> {
  yield;
  yield;
  while (run.flow.gba.sound.isPlaying("cry")) yield;
}

/** Plays a cry, then again when it ends (PlayDoubleCry, PlayCryWithEcho). */
function* twice(run: AnimRun, which: AnimBattler): Generator<void, void, void> {
  if (!cry(run, which)) return;
  yield* crying(run);
  cry(run, which);
}

/** Sounds the tasks below name, loaded before their script starts. */
export const SOUND_TASK_SOUNDS: Record<string, readonly string[]> = { SoundTask_FireBlast: ["se_m_flame_wheel", "se_m_flame_wheel2"] };

/** Sound tasks started with createsoundtask (waitsound waits for them). */
export const SOUND_TASKS: Record<string, AnimTask> = {
  /** SoundTask_PlaySeChangingVolume: the sound plays; its volume isn't faded, the task lasts as long as the fade would. */
  *SoundTask_PlaySeChangingVolume(run, args, se) {
    if (se) run.play(se, run.pan(args[1]));
    if (!args[3]) return;
    const rising = args[2] < args[4];
    let [volume, wait] = [args[2], 0];
    for (;;) {
      if (wait++ >= args[5]) {
        wait = 0;
        volume = Math.max(0, Math.min(256, volume + args[3]));
        if (rising ? volume >= args[4] : volume <= args[4]) return;
      }
      yield;
    }
  },

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

  /** SoundTask_FireBlast: flames travel from the attacker to the target (a sound every 11 frames), then two bursts there. */
  *SoundTask_FireBlast(run) {
    const to = run.pan(63);
    let pan = run.pan(-64);
    const by = panStep(pan, to, 2);
    let wait = 10;
    for (let n = 1; n < 111; n++) {
      if (++wait === 11) {
        wait = 0;
        run.play("se_m_flame_wheel" as SoundId, pan);
      }
      pan = clampPan(pan + by);
      yield;
    }
    yield;
    run.play("se_m_flame_wheel2" as SoundId, to);
    for (let n = 0; n < 6; n++) yield;
    run.play("se_m_flame_wheel2" as SoundId, to);
  },
};

/** Sound tasks started with createvisualtask (counted as visual tasks). */
export const SOUND_VISUAL_TASKS: Record<string, AnimTask> = {
  *SoundTask_PlayDoubleCry(run, args) {
    yield* twice(run, args[0] as AnimBattler);
  },

  *SoundTask_PlayCryWithEcho(run) {
    yield* twice(run, 0 as AnimBattler);
  },

  *SoundTask_PlayCryHighPitch(run, args) {
    cry(run, args[0] as AnimBattler);
  },

  *SoundTask_WaitForCry(run) {
    yield* crying(run);
  },

  /** SoundTask_AdjustPanningVar: gAnimCustomPanning moves from args[0] to args[1] by args[2], every args[3] + 1 frames. */
  *SoundTask_AdjustPanningVar(run, args) {
    const to = run.pan(args[1]);
    let pan = run.pan(args[0]);
    const by = panStep(pan, to, args[2]);
    let wait = 0;
    for (;;) {
      if (wait++ === args[3]) {
        wait = 0;
        pan = clampPan(pan + by);
      }
      run.customPan = pan;
      if (pan === to) return;
      yield;
    }
  },

  /** SoundTask_PlaySE1WithPanning: the sound at pan args[1], on the first sound player. */
  *SoundTask_PlaySE1WithPanning(run, args, se) {
    if (se) run.play(se, run.pan(args[1]), "se1");
  },

  /** SoundTask_PlaySE2WithPanning: the same on the second sound player. */
  *SoundTask_PlaySE2WithPanning(run, args, se) {
    if (se) run.play(se, run.pan(args[1]), "se2");
  },
};
