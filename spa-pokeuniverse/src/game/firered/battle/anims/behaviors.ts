// The behaviors scripts name (plans/battles D9): sprite templates (their callbacks) and visual
// tasks, written from FireRed's behavior, a file per family (behaviors/). Keyed by the game's
// names, so converted scripts find them; the generic animations' own behaviors are named
// `Generic*`. Grows family by family (M9, M10).

import type { AnimArtFiles } from "../../manifest";
import type { AnimSpriteTemplate, AnimTask } from "./script";
import { BG_TASKS } from "./behaviors/bg";
import { BLEND_TASKS, BLEND_TEMPLATES } from "./behaviors/blend";
import { MON_MOVEMENT_TASKS, MON_MOVEMENT_TEMPLATES } from "./behaviors/mon-movement";
import { PARTICLE_TEMPLATES } from "./behaviors/particles";
import { SOUND_TASKS, SOUND_VISUAL_TASKS } from "./behaviors/sound";
import { STATUS_ART, STATUS_TASK_ART, STATUS_TASKS, STATUS_TEMPLATES } from "./behaviors/status";
import { WEATHER_ART, WEATHER_TASK_ART, WEATHER_TASKS, WEATHER_TEMPLATES } from "./behaviors/weather";

export const TEMPLATES: Record<string, AnimSpriteTemplate> = {
  ...MON_MOVEMENT_TEMPLATES,
  ...BLEND_TEMPLATES,
  ...PARTICLE_TEMPLATES,
  ...STATUS_TEMPLATES,
  ...WEATHER_TEMPLATES,
};

export const TASKS: Record<string, AnimTask> = {
  ...MON_MOVEMENT_TASKS,
  ...BLEND_TASKS,
  ...BG_TASKS,
  ...SOUND_VISUAL_TASKS,
  ...STATUS_TASKS,
  ...WEATHER_TASKS,
};

/** Art a behavior draws besides its tag's (masks, backgrounds of its own), by name. */
export const ART: Record<string, AnimArtFiles> = { ...STATUS_ART, ...WEATHER_ART };

/** The art each task needs, loaded before a script that creates it starts. */
export const TASK_ART: Record<string, readonly string[]> = { ...STATUS_TASK_ART, ...WEATHER_TASK_ART };

/** Sound tasks (createsoundtask: SoundTask_*), run beside the visual tasks; waitsound waits for them. */
export { SOUND_TASKS };
