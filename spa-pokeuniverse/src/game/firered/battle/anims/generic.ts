// The generic animations (plans/battles D9): what a move plays until its own script can. By
// category: physical is FireRed's Tackle (lunge, impact, shake); special sends an orb in the
// type's color at the target; status flashes the type's color on whoever it affects. Each
// type has its color and a sound from a FireRed move of that type.

import { Category, Target, type MoveInfo } from "@pokeuniverse/contracts/move/v1/catalog";
import { Type } from "@pokeuniverse/contracts/species/v1/catalog";
import { rgb } from "../../../gba/video";
import type { SoundId } from "../../manifest";
import { AnimBattler, type AnimScript } from "./script";

/** SOUND_PAN_ATTACKER / SOUND_PAN_TARGET. */
const PAN_ATTACKER = -64;
const PAN_TARGET = 63;

const TYPES: Partial<Record<Type, { color: number; se: SoundId }>> = {
  [Type.NORMAL]: { color: rgb(26, 26, 22), se: "se_m_swift" },
  [Type.FIGHTING]: { color: rgb(24, 6, 4), se: "se_m_mega_kick" },
  [Type.FLYING]: { color: rgb(20, 18, 31), se: "se_m_gust" },
  [Type.POISON]: { color: rgb(20, 8, 20), se: "se_m_toxic" },
  [Type.GROUND]: { color: rgb(28, 24, 12), se: "se_m_sand_attack" },
  [Type.ROCK]: { color: rgb(22, 20, 8), se: "se_m_rock_throw" },
  [Type.BUG]: { color: rgb(20, 24, 4), se: "se_m_absorb" },
  [Type.GHOST]: { color: rgb(14, 10, 20), se: "se_m_lick" },
  [Type.STEEL]: { color: rgb(22, 22, 26), se: "se_m_harden" },
  [Type.FIRE]: { color: rgb(31, 14, 4), se: "se_m_flame_wheel" },
  [Type.WATER]: { color: rgb(8, 16, 31), se: "se_m_bubble" },
  [Type.GRASS]: { color: rgb(10, 26, 8), se: "se_m_razor_wind2" },
  [Type.ELECTRIC]: { color: rgb(31, 28, 4), se: "se_m_thunderbolt" },
  [Type.PSYCHIC]: { color: rgb(31, 10, 18), se: "se_m_psybeam" },
  [Type.ICE]: { color: rgb(18, 28, 31), se: "se_m_icy_wind" },
  [Type.DRAGON]: { color: rgb(14, 8, 31), se: "se_m_dragon_rage" },
  [Type.DARK]: { color: rgb(10, 8, 8), se: "se_m_bite" },
};

const DEFAULT = TYPES[Type.NORMAL]!;

/** The type's color for the generic animations. */
export function typeColor(type: Type): number {
  return (TYPES[type] ?? DEFAULT).color;
}

/** Move_TACKLE. */
const PHYSICAL: AnimScript = [
  { op: "loadspritegfx", tag: "ANIM_TAG_IMPACT" },
  { op: "monbg", battler: AnimBattler.Target },
  { op: "setalpha", eva: 12, evb: 8 },
  { op: "createsprite", template: "gHorizontalLungeSpriteTemplate", battler: AnimBattler.Attacker, subpriority: 2, args: [4, 4] },
  { op: "delay", frames: 6 },
  { op: "createsprite", template: "gBasicHitSplatSpriteTemplate", battler: AnimBattler.Attacker, subpriority: 2, args: [0, 0, AnimBattler.Target, 2] },
  { op: "createvisualtask", task: "AnimTask_ShakeMon", priority: 2, args: [AnimBattler.Target, 3, 0, 6, 1] },
  { op: "playsewithpan", se: "se_m_comet_punch", pan: PAN_TARGET },
  { op: "waitforvisualfinish" },
  { op: "clearmonbg", battler: AnimBattler.Target },
  { op: "blendoff" },
  { op: "end" },
];

function special(se: SoundId): AnimScript {
  return [
    { op: "loadspritegfx", tag: "ANIM_TAG_ORB" },
    { op: "loadspritegfx", tag: "ANIM_TAG_IMPACT" },
    { op: "playsewithpan", se, pan: PAN_ATTACKER },
    { op: "createsprite", template: "GenericOrbSpriteTemplate", battler: AnimBattler.Attacker, subpriority: 2, args: [16] },
    { op: "waitforvisualfinish" },
    { op: "setalpha", eva: 12, evb: 8 },
    { op: "createsprite", template: "gBasicHitSplatSpriteTemplate", battler: AnimBattler.Attacker, subpriority: 2, args: [0, 0, AnimBattler.Target, 1] },
    { op: "createvisualtask", task: "AnimTask_ShakeMon", priority: 2, args: [AnimBattler.Target, 3, 0, 6, 1] },
    { op: "waitforvisualfinish" },
    { op: "blendoff" },
    { op: "end" },
  ];
}

function status(se: SoundId, on: AnimBattler): AnimScript {
  return [
    { op: "playsewithpan", se, pan: on === AnimBattler.Attacker ? PAN_ATTACKER : PAN_TARGET },
    { op: "createvisualtask", task: "GenericBlendMon", priority: 2, args: [on, 2] },
    { op: "waitforvisualfinish" },
    { op: "end" },
  ];
}

/** Moves aimed at the user's own side play on the attacker. */
const ON_SELF = new Set([Target.SELF, Target.ADJACENT_ALLY_OR_SELF, Target.ALLIES, Target.ALLY_SIDE, Target.ALLY_TEAM]);

/** The generic animation for a move's type and category. */
export function genericAnimation(move: MoveInfo, hasTarget: boolean): AnimScript {
  const { se } = TYPES[move.type] ?? DEFAULT;
  if (move.category === Category.PHYSICAL && hasTarget) return PHYSICAL;
  if (move.category === Category.SPECIAL && hasTarget) return special(se);
  return status(se, hasTarget && !ON_SELF.has(move.target) ? AnimBattler.Target : AnimBattler.Attacker);
}
