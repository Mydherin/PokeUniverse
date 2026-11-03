// The behaviors scripts name (plans/battles D9): sprite templates (their callbacks) and visual
// tasks, written from FireRed's behavior, a file per family (behaviors/). Keyed by the game's
// names, so converted scripts find them; the generic animations' own behaviors are named
// `Generic*`. Grows family by family (M9, M10).

import type { AnimArtFiles } from "../../manifest";
import type { AnimSpriteTemplate, AnimTask } from "./script";
import { BG_TASKS } from "./behaviors/bg";
import { BUG_TEMPLATES } from "./behaviors/bug";
import { BLEND_TASKS, BLEND_TEMPLATES } from "./behaviors/blend";
import { DRAGON_TASKS, DRAGON_TEMPLATES } from "./behaviors/dragon";
import { GHOST_TASKS, GHOST_TEMPLATES } from "./behaviors/ghost";
import { FIGHT_TASKS, FIGHT_TEMPLATES } from "./behaviors/fight";
import { ROCK_TASK_SOUNDS, ROCK_TASKS, ROCK_TEMPLATES } from "./behaviors/rock";
import { FLYING_TASKS, FLYING_TEMPLATES } from "./behaviors/flying";
import { DARK_ART, DARK_TASK_ART, DARK_TASKS, DARK_TEMPLATES } from "./behaviors/dark";
import { EFFECT_TASKS, EFFECT_TEMPLATES } from "./behaviors/effects";
import { EFFECTS_2_ART, EFFECTS_2_TASK_ART, EFFECTS_2_TASK_SOUNDS, EFFECTS_2_TASKS, EFFECTS_2_TEMPLATES } from "./behaviors/effects-2";
import { EFFECTS_3_ART, EFFECTS_3_TASK_ART, EFFECTS_3_TASK_SOUNDS, EFFECTS_3_TASKS, EFFECTS_3_TEMPLATES } from "./behaviors/effects-3";
import { EFFECTS_1_TASK_SOUNDS, EFFECTS_1_TASKS, EFFECTS_1_TEMPLATES } from "./behaviors/effects-1";
import { ICE_ART, ICE_TASK_ART, ICE_TASKS, ICE_TEMPLATES } from "./behaviors/ice";
import { WATER_ART, WATER_TASK_ART, WATER_TASKS, WATER_TEMPLATES } from "./behaviors/water";
import { PSYCHIC_TASK_SOUNDS, PSYCHIC_TASKS, PSYCHIC_TEMPLATES } from "./behaviors/psychic";
import { ELECTRIC_TASK_SOUNDS, ELECTRIC_TASKS, ELECTRIC_TEMPLATES } from "./behaviors/electric";
import { FIRE_TASK_SOUNDS, FIRE_TASKS, FIRE_TEMPLATES } from "./behaviors/fire";
import { GROUND_TASKS, GROUND_TEMPLATES } from "./behaviors/ground";
import { MON_MOVEMENT_TASKS, MON_MOVEMENT_TEMPLATES } from "./behaviors/mon-movement";
import { POISON_TEMPLATES } from "./behaviors/poison";
import { PARTICLE_TEMPLATES } from "./behaviors/particles";
import { SOUND_TASK_SOUNDS, SOUND_TASKS, SOUND_VISUAL_TASKS } from "./behaviors/sound";
import { STATUS_ART, STATUS_TASK_ART, STATUS_TASKS, STATUS_TEMPLATES } from "./behaviors/status";
import { GENERAL_ART, GENERAL_TASK_ART, GENERAL_TASK_SOUNDS, GENERAL_TASKS, GENERAL_TEMPLATES } from "./behaviors/general";
import { UTILITY_ART, UTILITY_TASK_ART, UTILITY_TASKS, UTILITY_TEMPLATES } from "./behaviors/utility";
import { WEATHER_ART, WEATHER_TASK_ART, WEATHER_TASKS, WEATHER_TEMPLATES } from "./behaviors/weather";

export const TEMPLATES: Record<string, AnimSpriteTemplate> = {
  ...MON_MOVEMENT_TEMPLATES,
  ...BLEND_TEMPLATES,
  ...PARTICLE_TEMPLATES,
  ...STATUS_TEMPLATES,
  ...WEATHER_TEMPLATES,
  ...POISON_TEMPLATES,
  ...BUG_TEMPLATES,
  ...DRAGON_TEMPLATES,
  ...GROUND_TEMPLATES,
  ...ROCK_TEMPLATES,
  ...FIGHT_TEMPLATES,
  ...FLYING_TEMPLATES,
  ...EFFECT_TEMPLATES,
  ...DARK_TEMPLATES,
  ...ICE_TEMPLATES,
  ...WATER_TEMPLATES,
  ...FIRE_TEMPLATES,
  ...ELECTRIC_TEMPLATES,
  ...GHOST_TEMPLATES,
  ...PSYCHIC_TEMPLATES,
  ...EFFECTS_1_TEMPLATES,
  ...EFFECTS_2_TEMPLATES,
  ...EFFECTS_3_TEMPLATES,
  ...UTILITY_TEMPLATES,
  ...GENERAL_TEMPLATES,
};

export const TASKS: Record<string, AnimTask> = {
  ...MON_MOVEMENT_TASKS,
  ...BLEND_TASKS,
  ...BG_TASKS,
  ...SOUND_VISUAL_TASKS,
  ...STATUS_TASKS,
  ...WEATHER_TASKS,
  ...DRAGON_TASKS,
  ...GROUND_TASKS,
  ...ROCK_TASKS,
  ...FIGHT_TASKS,
  ...FLYING_TASKS,
  ...EFFECT_TASKS,
  ...DARK_TASKS,
  ...WATER_TASKS,
  ...GHOST_TASKS,
  ...FIRE_TASKS,
  ...ICE_TASKS,
  ...PSYCHIC_TASKS,
  ...EFFECTS_1_TASKS,
  ...EFFECTS_2_TASKS,
  ...EFFECTS_3_TASKS,
  ...ELECTRIC_TASKS,
  ...UTILITY_TASKS,
  ...GENERAL_TASKS,
};

/** Art a behavior draws besides its tag's (masks, backgrounds of its own), by name. */
export const ART: Record<string, AnimArtFiles> = { ...STATUS_ART, ...WEATHER_ART, ...DARK_ART, ...ICE_ART, ...WATER_ART, ...EFFECTS_2_ART, ...EFFECTS_3_ART, ...UTILITY_ART, ...GENERAL_ART };

/** The art each task needs, loaded before a script that creates it starts. */
export const TASK_ART: Record<string, readonly string[]> = { ...STATUS_TASK_ART, ...WEATHER_TASK_ART, ...DARK_TASK_ART, ...ICE_TASK_ART, ...WATER_TASK_ART, ...EFFECTS_2_TASK_ART, ...EFFECTS_3_TASK_ART, ...UTILITY_TASK_ART, ...GENERAL_TASK_ART };

/** The sounds a task or sprite template plays by name (not in the script), loaded before it starts. */
export const TASK_SOUNDS: Record<string, readonly string[]> = { ...ROCK_TASK_SOUNDS, ...FIRE_TASK_SOUNDS, ...ELECTRIC_TASK_SOUNDS, ...PSYCHIC_TASK_SOUNDS, ...EFFECTS_1_TASK_SOUNDS, ...EFFECTS_2_TASK_SOUNDS, ...EFFECTS_3_TASK_SOUNDS, ...SOUND_TASK_SOUNDS, ...GENERAL_TASK_SOUNDS };

/** Sound tasks (createsoundtask: SoundTask_*), run beside the visual tasks; waitsound waits for them. */
export { SOUND_TASKS };
