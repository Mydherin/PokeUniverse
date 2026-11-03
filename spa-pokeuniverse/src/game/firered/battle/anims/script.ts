// Move animations (plans/battles D9): a script is data, a list of FireRed's battle animation
// commands (battle_anim.c); the sprite templates and visual tasks it names are behaviors written
// here (behaviors.ts). A script whose behaviors aren't all written plays the generic animation
// of its move's type and category (generic.ts).

import type { AffineCmd, AnimCmd, Sprite } from "../../../gba/sprites";
import type { AnimArtFiles, Graphic, SoundId } from "../../manifest";
import type { Flow } from "../../flow";

/** Who a command points at (ANIM_ATTACKER, ANIM_TARGET). */
export const enum AnimBattler {
  Attacker = 0,
  Target = 1,
}

/**
 * One command of a script, as the games' macros (asm/macros/battle_anim_script.inc), converted by
 * infra/battle/anims.mjs. Labels name another block of the same program; `battler` is an
 * AnimBattler; `args` are gBattleAnimArgs; `pan` is SOUND_PAN_* (-64 attacker … 63 target).
 */
export type AnimCommand =
  | { op: "loadspritegfx" | "unloadspritegfx" | "unloadspritepal"; tag: string }
  | { op: "createsprite"; template: string; battler: number; subpriority: number; args: number[] }
  | { op: "createspriteontargets" | "createspriteontargets_onpos"; template: string; battler: number; subpriority: number; battlerargindex: number; args: number[] }
  | { op: "createvisualtask"; task: string; priority: number; args: number[]; se?: SoundId }
  | { op: "createvisualtaskontargets"; task: string; priority: number; battlerargindex: number; args: number[] }
  | { op: "createsoundtask"; task: string; args: number[]; se?: SoundId }
  | { op: "delay"; frames: number }
  | { op: "waitforvisualfinish" | "waitsound" | "end" | "return" | "stopsound" | "blendoff" | "restorebg" | "waitbgfadein" | "waitbgfadeout" }
  | { op: "splitbgprio_all" }
  | { op: "monbg" | "clearmonbg" | "monbg_static" | "clearmonbg_static" | "splitbgprio" | "splitbgprio_foes"; battler: number }
  | { op: "invisible" | "visible" | "teamattack_moveback" | "teamattack_movefwd"; battler: number }
  | { op: "playse"; se: SoundId }
  | { op: "playsewithpan"; se: SoundId; pan: number }
  | { op: "waitplaysewithpan"; se: SoundId; pan: number; wait: number }
  | { op: "loopsewithpan"; se: SoundId; pan: number; wait: number; times: number }
  | { op: "panse" | "panse_adjustnone" | "panse_adjustall"; se: SoundId; currentPan: number; targetPan: number; incrementPan: number; delay: number }
  | { op: "setpan"; pan: number }
  | { op: "setalpha"; eva: number; evb: number }
  | { op: "setbldcnt"; bldcnt: number }
  | { op: "fadetobg" | "changebg"; bg: number }
  | { op: "fadetobgfromset"; bgOpponent: number; bgPlayer: number; bgContest: number }
  | { op: "goto" | "call" | "jumpifcontest" | "jumprettrue" | "jumpretfalse"; label: string }
  | { op: "choosetwoturnanim"; first: string; second: string }
  | { op: "jumpifmoveturn"; value: number; label: string }
  | { op: "jumpreteq"; value: number; label: string }
  | { op: "jumpargeq"; argId: number; value: number; label: string }
  | { op: "setarg"; argId: number; value: number };

export type AnimScript = readonly AnimCommand[];

/** The art scripts load (art.json): each ANIM_TAG_*'s sheet, and the game's move backgrounds by BG_*. */
export interface AnimArt {
  readonly tags: Readonly<Record<string, AnimArtFiles>>;
  readonly backgrounds: readonly (AnimArtFiles | null)[];
}

/** A script and the blocks it reaches: label → commands; it starts at `entry`. */
export interface AnimProgram {
  readonly scripts: Readonly<Record<string, AnimScript>>;
  readonly entry: string;
  readonly art: AnimArt;
}

/** The battle's backgrounds as the scripts change them (fadetobg, changebg, restorebg, gBattle_BG3_X/Y). */
export interface AnimBackdrop {
  showMoveBackground(art: Graphic): void;
  drawTerrain(split?: boolean): void;
  /** The background's scroll in pixels. */
  scrollX: number;
  scrollY: number;
}

/** A battler on the field: its side and its Pokémon's sprite (none once it fainted). */
export interface AnimMon {
  foe: boolean;
  sprite: Sprite | null;
  /** Its national number, for its cry. */
  species?: number;
  /** Out of sight (Fly, Dig…): scripts that hide and show the others leave it alone. */
  hidden?: boolean;
  behindSubstitute?: boolean;
  /** The sprite shows this art (the substitute doll), or its own picture again with null. */
  dress?(art: Graphic | null): void;
}

/** What a script plays with: the battlers, and the move's color for the generic animations. */
export interface AnimContext {
  readonly flow: Flow;
  readonly attacker: AnimMon;
  readonly target: AnimMon;
  /** The battler across from the attacker (the target may be the attacker itself). */
  readonly opponent?: AnimMon;
  /** gWeatherMoveAnim as ANIM_WEATHER_* (none 0, sun 1, rain 2, sandstorm 3, hail 4). */
  readonly weather?: number;
  readonly backdrop: AnimBackdrop;
  /** BGR555; the generic animations tint their sprites and blends with it. */
  readonly color: number;
  /** gAnimMovePower, gAnimMoveDmg: how strong the move is and what it did, for the tasks that shake by them. */
  readonly movePower?: number;
  readonly moveDamage?: number;
  /** GetRolloutCounter: the hit of a Rollout run (1-5). */
  readonly rolloutHit?: number;
  /** gAnimMoveTurn: the turn of a two-turn move (0 charging, 1 striking). */
  readonly turn?: number;
  /** A general animation's argument (animationData->animArg: a stat change's kind…). */
  readonly animArg?: number;
  /** A status condition's animation (statusAnimActive): its sounds play at its battler's side. */
  readonly statusAnim?: boolean;
}

/** A sprite template's behavior (its callback): starts the sprite from the command's args. */
export interface AnimSpriteTemplate {
  /** The ANIM_TAG_* whose art it shows; none for an invisible sprite that moves a battler. */
  tag?: string;
  /** The ANIM_TAG_* whose colors it wears, when not its art's (.paletteTag: the expansion's recolors). */
  paletteTag?: string;
  /** Semi-transparent (ST_OAM_OBJ_BLEND), blended as setalpha says. */
  blend?: boolean;
  width: number;
  height: number;
  /** Scaled or rotated (ST_OAM_AFFINE_DOUBLE; with `affineNormal`, ST_OAM_AFFINE_NORMAL). */
  affine?: boolean;
  affineNormal?: boolean;
  anims?: AnimCmd[][];
  affineAnims?: AffineCmd[][];
  /** Runs once at creation; `done` destroys it (DestroyAnimSprite). */
  init(sprite: Sprite, run: AnimRun, args: readonly number[], done: () => void): void;
}

/** A visual or sound task: one generator step per frame until it returns; `se` when args[0] is a sound. */
export type AnimTask = (run: AnimRun, args: readonly number[], se?: SoundId) => Generator<void, void, void>;

/** A script being played: the context plus the battlers' positions. */
export interface AnimRun extends AnimContext {
  readonly opponent: AnimMon;
  /** gAnimCustomPanning: where Confuse Ray's and Will-O-Wisp's orbs sound (SoundTask_AdjustPanningVar). */
  customPan: number;
  /** The battler a command means (ANIM_ATTACKER / ANIM_TARGET). */
  mon(which: AnimBattler): AnimMon;
  /** Its picture's center (GetBattlerSpriteCoord X_2, Y_PIC_OFFSET). */
  center(which: AnimBattler): [number, number];
  /** gBattleAnimArgs: the last command's args; tasks answer in [7] (ARG_RET_ID). */
  readonly args: Int16Array;
  /** BattleAnimAdjustPanning: a script's pan (SOUND_PAN_*) for this attacker and target. */
  pan(pan: number): number;
  /** BattleAnimAdjustPanning2: mirrored for the foe's moves. */
  pan2(pan: number): number;
  /** PlaySE12WithPanning at an adjusted pan (on another player: PlaySE1/2WithPanning). */
  play(se: SoundId, pan?: number, player?: string): void;
  /** A behavior's own art (behaviors.ts TASK_ART), loaded before the script started. */
  art(name: string): Graphic | undefined;
  /** CreateSprite from a behavior: started like a script's sprite (its tag's art loaded), not waited for. */
  createSprite(template: AnimSpriteTemplate, x: number, y: number, subpriority: number, args?: readonly number[]): Sprite | null;
  /** TryLoadPal: a tag's art and colors, from what the script loaded before it started (needs). */
  loadTag(tag: string): void;
  /** gBattleAnimTarget = …: the battler the script targets from now on. */
  retarget(mon: AnimMon): void;
  /** Runs a task (CreateTask) beside the script, not waited for: it ends itself, or with the script. */
  spawn(task: Generator<void, void, void>): void;
}
