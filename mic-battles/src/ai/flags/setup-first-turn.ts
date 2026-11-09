// AI_SetupFirstTurn: on the battle's first turn, prefer stat, status and screen moves.

import { isStatDown, isStatUp, type Effect } from "../effects.ts";
import type { AiView, Considered } from "../view.ts";

const SETUP = new Set<Effect>([
  "CONVERSION", "LIGHT_SCREEN", "FOCUS_ENERGY", "CONFUSE", "REFLECT", "POISON", "PARALYZE", "SUBSTITUTE", "LEECH_SEED",
  "MINIMIZE", "CURSE", "SWAGGER", "YAWN", "DEFENSE_CURL", "TORMENT", "FLATTER", "WILL_O_WISP", "INGRAIN", "IMPRISON",
  "TICKLE", "COSMIC_POWER", "BULK_UP", "CALM_MIND", "DRAGON_DANCE",
  // Gen 4.
  "STEALTH_ROCK", "SPIKES", "TOXIC_SPIKES", "TAILWIND", "TRICK_ROOM", "AQUA_RING",
]);

export function setupFirstTurn(v: AiView, c: Considered): number {
  if (v.turn() !== 0) return 0;
  if (!SETUP.has(c.effect) && !isStatUp(c.effect) && !isStatDown(c.effect)) return 0;
  return v.chance(80) ? 0 : 2;
}
