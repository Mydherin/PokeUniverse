// AI_HPAware: what's worth doing depends on the user's and the target's HP (above 70 %, above
// 30 %, or less).

import { isStatDown, isStatUp, type Effect } from "../effects.ts";
import type { AiView, Considered } from "../view.ts";

const stats = (e: Effect) => isStatUp(e) || isStatDown(e) || ["TICKLE", "COSMIC_POWER", "BULK_UP", "CALM_MIND", "DRAGON_DANCE"].includes(e);

const USER_HIGH = new Set<Effect>(["EXPLOSION", "RESTORE_HP", "REST", "DESTINY_BOND", "FLAIL", "ENDURE", "MORNING_SUN", "MEMENTO", "HEALING_WISH", "OVERHEAT"]);
const USER_MEDIUM = new Set<Effect>(["EXPLOSION", "BIDE", "CONVERSION", "LIGHT_SCREEN", "MIST", "FOCUS_ENERGY", "SAFEGUARD", "BELLY_DRUM"]);
const USER_LOW = new Set<Effect>(["BIDE", "CONVERSION", "LIGHT_SCREEN", "MIST", "FOCUS_ENERGY", "RAGE", "LOCK_ON", "SAFEGUARD", "BELLY_DRUM", "PSYCH_UP", "MIRROR_COAT", "CHARGE", "ERUPTION"]);
const TARGET_MEDIUM = new Set<Effect>(["MIST", "FOCUS_ENERGY", "POISON", "PAIN_SPLIT", "PERISH_SONG", "SAFEGUARD"]);
const TARGET_LOW = new Set<Effect>([
  "SLEEP", "EXPLOSION", "BIDE", "CONVERSION", "TOXIC", "LIGHT_SCREEN", "OHKO", "SUPER_FANG", "MIST", "FOCUS_ENERGY", "CONFUSE",
  "POISON", "PARALYZE", "PAIN_SPLIT", "LOCK_ON", "PERISH_SONG", "SWAGGER", "FURY_CUTTER", "ATTRACT", "SAFEGUARD", "PSYCH_UP",
  "MIRROR_COAT", "WILL_O_WISP", "STEALTH_ROCK", "SPIKES", "TOXIC_SPIKES",
]);

export function hpAware(v: AiView, c: Considered): number {
  const e = c.effect;
  let s = 0;
  const user = v.hp(v.user);
  const userBad = user > 70 ? USER_HIGH.has(e) : user > 30 ? USER_MEDIUM.has(e) || stats(e) : USER_LOW.has(e) || stats(e);
  if (userBad && !v.chance(50)) s -= 2;
  const target = v.hp(v.target);
  const targetBad = target > 70 ? false : target > 30 ? TARGET_MEDIUM.has(e) || stats(e) : TARGET_LOW.has(e) || stats(e);
  if (targetBad && !v.chance(50)) s -= 2;
  return s;
}
