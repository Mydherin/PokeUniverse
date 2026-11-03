// The script interpreter (battle_anim.c's commands): sprites and visual tasks run each frame
// while the script waits on delays and waitforvisualfinish; `end` waits for everything, then
// frees the art and puts the battlers, the terrain and the blend registers back. The art and
// sounds a program can use load before it starts. Our battlers stay sprites, so monbg and
// splitbgprio (moving a battler onto a background) do nothing.

import type { Sprite } from "../../../gba/sprites";
import { ObjMode } from "../../../gba/sprites";
import { Effect, Layer } from "../../../gba/video";
import { Assets, type AnimArtFiles, type Graphic } from "../../manifest";
import { ART, SOUND_TASKS, TASK_ART, TASK_SOUNDS, TASK_TAG_ARG, TASK_TAGS, TASKS, TEMPLATES } from "./behaviors";
import { tagName } from "./behaviors/util";
import { AnimBattler, type AnimCommand, type AnimContext, type AnimMon, type AnimProgram, type AnimRun, type AnimSpriteTemplate } from "./script";

const DUMMY = "animDummy";
/** gBattleAnimArgs[ARG_RET_ID]: where tasks answer. */
const ARG_RET = 7;
/** SOUND_PAN_ATTACKER / SOUND_PAN_TARGET. */
const PAN_ATTACKER = -64;
const PAN_TARGET = 63;
/** Task_FadeToBg's hardware fade (0xE8): the terrain and the backdrop darken. */
const BG_FADE_LAYERS = Layer.BG2 | Layer.BG3 | Layer.BD;

/** Commands the engine doesn't run yet: a script that reaches one plays the generic animation. */
const UNSUPPORTED = new Set<AnimCommand["op"]>();

/** The labels a program's entry reaches (every branch). */
function reachable(program: AnimProgram): string[] {
  const seen = new Set<string>();
  const visit = (label: string) => {
    if (seen.has(label)) return;
    seen.add(label);
    for (const c of program.scripts[label] ?? []) {
      if ("label" in c) visit(c.label);
      if (c.op === "choosetwoturnanim") (visit(c.first), visit(c.second));
    }
  };
  visit(program.entry);
  return [...seen];
}

/** The move backgrounds (BG_*) a command shows. */
function backgroundsOf(c: AnimCommand): number[] {
  if (c.op === "fadetobg" || c.op === "changebg") return [c.bg];
  if (c.op === "fadetobgfromset") return [c.bgOpponent, c.bgPlayer];
  return [];
}

/** Every command, template, task, art and sound a program reaches is written: it can play. */
export function canPlay(program: AnimProgram): boolean {
  const { tags, backgrounds } = program.art;
  return reachable(program).every((label) => {
    const script = program.scripts[label];
    return (
      script !== undefined &&
      script.every((c) => {
        if (UNSUPPORTED.has(c.op)) return false;
        if ("template" in c) {
          const t = TEMPLATES[c.template];
          return t !== undefined && (!t.tag || t.tag in tags) && (!t.paletteTag || t.paletteTag in tags);
        }
        if (c.op === "createsoundtask") return c.task in SOUND_TASKS;
        if ("task" in c) return c.task in TASKS;
        if ("tag" in c) return c.tag in tags;
        return backgroundsOf(c).every((bg) => backgrounds[bg]);
      })
    );
  });
}

/** What a program can load: its sounds, its sprites' art by tag, its move backgrounds, its tasks' own art. */
function needs(program: AnimProgram): { sounds: string[]; tags: string[]; backgrounds: number[]; art: string[] } {
  const sounds = new Set<string>();
  const tags = new Set<string>();
  const backgrounds = new Set<number>();
  const art = new Set<string>();
  for (const label of reachable(program))
    for (const c of program.scripts[label]) {
      if ("se" in c && c.se) sounds.add(c.se);
      if ("tag" in c) tags.add(c.tag);
      const t = "template" in c && TEMPLATES[c.template];
      if (t && t.tag) tags.add(t.tag);
      if (t && t.paletteTag) tags.add(t.paletteTag);
      if ("template" in c) {
        for (const se of TASK_SOUNDS[c.template] ?? []) sounds.add(se);
        for (const tag of TASK_TAGS[c.template] ?? []) tags.add(tag);
      }
      for (const bg of backgroundsOf(c)) backgrounds.add(bg);
      if ("task" in c) {
        for (const name of TASK_ART[c.task] ?? []) art.add(name);
        for (const se of TASK_SOUNDS[c.task] ?? []) sounds.add(se);
        for (const tag of TASK_TAGS[c.task] ?? []) tags.add(tag);
        const tagArg = "args" in c ? tagName(c.args[TASK_TAG_ARG[c.task]]) : undefined;
        if (tagArg) tags.add(tagArg);
      }
    }
  return { sounds: [...sounds], tags: [...tags], backgrounds: [...backgrounds], art: [...art] };
}

/**
 * BattleAnimAdjustPanning: a script's pan is from the player's side attacking; the foe's moves
 * play mirrored, and status animations at their battler's side.
 */
function adjustPan(ctx: AnimContext, pan: number): number {
  const { attacker, target } = ctx;
  if (ctx.statusAnim) pan = attacker.foe ? PAN_TARGET : PAN_ATTACKER;
  else if (!attacker.foe) {
    if (!target.foe) pan = pan === PAN_TARGET ? PAN_ATTACKER : pan === PAN_ATTACKER ? pan : -pan;
  } else if (target.foe) {
    if (pan === PAN_ATTACKER) pan = PAN_TARGET;
  } else pan = -pan;
  return Math.max(PAN_ATTACKER, Math.min(PAN_TARGET, pan));
}

/** BattleAnimAdjustPanning2: mirrored for the foe's moves. */
function adjustPan2(ctx: AnimContext, pan: number): number {
  if (ctx.statusAnim) return ctx.attacker.foe ? PAN_TARGET : PAN_ATTACKER;
  return ctx.attacker.foe ? -pan : pan;
}

/** A game pan (-64 left … 63 right) for Web Audio (-1 … 1). */
const webPan = (pan: number) => Math.max(-1, Math.min(1, pan / 64));

/** Plays a program to its end, a frame per step. */
export function* playAnimation(ctx: AnimContext, program: AnimProgram): Generator<void, void, void> {
  const { gba, assets } = ctx.flow;
  const video = gba.video;
  const args = new Int16Array(16);
  // Tasks a behavior starts on its own (CreateTask): not waited for, stopped with the script.
  let spawned: Generator<void, void, void>[] = [];
  const run: AnimRun = {
    ...ctx,
    opponent: ctx.opponent ?? ctx.target,
    customPan: 0,
    args,
    mon: (which) => (which === AnimBattler.Attacker ? ctx.attacker : run.target),
    center: (which) => {
      const mon = which === AnimBattler.Attacker ? ctx.attacker : run.target;
      return mon.sprite ? [mon.sprite.x, mon.sprite.y] : mon.foe ? [176, 40] : [72, 80];
    },
    pan: (pan) => adjustPan(ctx, pan),
    pan2: (pan) => adjustPan2(ctx, pan),
    play: (se, pan = 0, player = "se") => gba.sound.play(se, player, webPan(pan)),
    art: (name) => behaviorArt.get(name),
    createSprite: () => null,
    loadTag: () => {},
    retarget: (mon) => void ((run as { target: AnimMon }).target = mon),
    spawn: (task) => void spawned.push(task),
  };
  const turn = ctx.turn ?? 0;

  // Its sounds and art first (most sounds are loaded with the battle; the rest, and the art, on first use).
  const need = needs(program);
  const art = new Map<string, Graphic>();
  const backgrounds = new Map<number, Graphic>();
  const behaviorArt = new Map<string, Graphic>();
  const loadArt = (files: AnimArtFiles | null | undefined, put: (g: Graphic) => void) => (files ? assets.animArt(files).then(put) : Promise.resolve());
  let ready = false;
  Promise.all([
    gba.sound.load(need.sounds, Assets.soundUrl),
    ...need.tags.map((tag) => loadArt(program.art.tags[tag], (g) => art.set(tag, g))),
    ...need.backgrounds.map((bg) => loadArt(program.art.backgrounds[bg], (g) => backgrounds.set(bg, g))),
    ...need.art.map((name) => loadArt(ART[name], (g) => behaviorArt.set(name, g))),
  ])
    .catch(() => {})
    .then(() => (ready = true));
  while (!ready) yield;

  // Task_FadeToBg: the terrain darkens, the background changes (-1: the terrain), it lightens.
  // bgFade is sAnimBackgroundFadeState: 1 darkening, 2 dark, 0 done.
  let bgFade = 0;
  let bgTask: Generator<void, void, void> | null = null;
  let moveBackground = false;
  const showBackground = (bg: number) => {
    const g = backgrounds.get(bg);
    if (bg < 0 || !g) {
      ctx.backdrop.drawTerrain();
      moveBackground = false;
    } else {
      ctx.backdrop.showMoveBackground(g);
      moveBackground = true;
    }
  };
  const fadeToBackground = (bg: number) => {
    bgFade = 1;
    bgTask = (function* () {
      video.effect = Effect.Darken;
      video.target1 = BG_FADE_LAYERS;
      for (video.evy = 0; video.evy < 16; video.evy++) yield;
      bgFade = 2;
      yield;
      showBackground(bg);
      for (video.evy = 16; video.evy > 0; video.evy--) yield;
      video.resetBlend();
      bgFade = 0;
    })();
  };

  const loaded = new Set<string>();
  const sprites = new Set<Sprite>();
  let tasks: Generator<void, void, void>[] = [];
  // Sound tasks (loopsewithpan, waitplaysewithpan, createsoundtask): waitsound waits for them.
  let soundTasks: Generator<void, void, void>[] = [];
  const blend = { effect: video.effect, target1: video.target1, target2: video.target2, eva: video.eva, evb: video.evb };
  // Battlers end as they started (one out of sight stays so).
  const startHidden = new Map<Sprite, boolean>();
  for (const mon of [ctx.attacker, ctx.target, run.opponent]) if (mon.sprite) startHidden.set(mon.sprite, mon.sprite.invisible);
  gba.sprites.loadSheet(DUMMY, new Uint8Array(64));
  gba.palettes.loadSpritePalette(DUMMY, new Uint16Array(16));

  // monbg moves the battler to a BG: other sprites blend with it, and its own blended sprite shows over its opaque copy
  // (ours has no copy, so it stays opaque).
  const monOnBg = new Set<Sprite>();

  // One frame of the visual, sound and background tasks (sprites run on their own).
  const step = () => {
    tasks = tasks.filter((t) => !t.next().done);
    soundTasks = soundTasks.filter((t) => !t.next().done);
    spawned = spawned.filter((t) => !t.next().done);
    if (bgTask?.next().done) bgTask = null;
    for (const mon of monOnBg) if (mon.mode === ObjMode.Blend) mon.mode = ObjMode.Normal;
  };
  const busy = () => tasks.length > 0 || sprites.size > 0;
  const wait = function* (until: () => boolean) {
    while (!until()) {
      yield;
      step();
    }
  };
  const loadTag = (tag: string) => {
    const g = art.get(tag);
    if (loaded.has(tag) || !g) return;
    gba.sprites.loadSheet(tag, g.tiles);
    gba.palettes.loadSpritePalette(tag, g.palette);
    loaded.add(tag);
  };
  // gBattleAnimArgs keeps a command's values until another one sets them: behaviors get all eight.
  const setArgs = (from: readonly number[]) => from.forEach((a, i) => (args[i] = a));
  // Sprites a task creates (CreateSprite): not waited for, destroyed with the script.
  const loose = new Set<Sprite>();
  /** A template's sprite, started (its first callback) and destroyed when done. */
  const startSprite = (t: AnimSpriteTemplate, x: number, y: number, subpriority: number, spriteArgs: readonly number[], waited: boolean): Sprite | null => {
    // The expansion's scripts load no art: the template's own tag is loaded on its first sprite.
    if (t.tag) loadTag(t.tag);
    if (t.paletteTag) loadTag(t.paletteTag);
    const sprite = gba.sprites.create(
      {
        sheet: t.tag ?? DUMMY,
        palette: t.paletteTag ?? t.tag ?? DUMMY,
        width: t.width,
        height: t.height,
        priority: 1,
        affine: t.affine,
        affineNormal: t.affineNormal,
        anims: t.anims,
        affineAnims: t.affineAnims,
      },
      x,
      y,
      subpriority,
    );
    if (!sprite) return null;
    if (t.blend) sprite.mode = ObjMode.Blend;
    const set = waited ? sprites : loose;
    set.add(sprite);
    t.init(sprite, run, spriteArgs, () => {
      set.delete(sprite);
      gba.sprites.destroy(sprite);
    });
    return sprite;
  };
  run.createSprite = (t, x, y, subpriority, spriteArgs = []) => startSprite(t, x, y, subpriority, spriteArgs, false);
  run.loadTag = loadTag;
  /** Cmd_createsprite: at the target's picture, in front of or behind its battler (attacker or target). */
  const createSprite = (template: string, battler: number, offset: number, spriteArgs: readonly number[]) => {
    const [x, y] = run.center(AnimBattler.Target);
    const mon = battler === AnimBattler.Target ? run.target : ctx.attacker;
    // GetBattlerSpriteSubpriority (player 30, foe 40); an offset of 64 + n is +n, others in front.
    const subpriority = Math.max(3, (mon.foe ? 40 : 30) + (offset >= 64 ? offset - 64 : -offset));
    startSprite(TEMPLATES[template], x, y, subpriority, spriteArgs, true);
  };

  let label = program.entry;
  let pc = 0;
  const stack: [string, number][] = [];
  const jump = (to: string) => {
    label = to;
    pc = 0;
  };

  try {
    for (;;) {
      const c = program.scripts[label][pc++];
      switch (c.op) {
        case "loadspritegfx":
          loadTag(c.tag);
          break;
        case "unloadspritegfx":
          if (loaded.delete(c.tag)) (gba.sprites.freeSheet(c.tag), gba.palettes.freeSpritePalette(c.tag));
          break;
        case "unloadspritepal":
          break;
        case "createsprite":
        case "createspriteontargets_onpos":
          setArgs(c.args);
          createSprite(c.template, c.battler, c.subpriority, [...args]);
          break;
        case "createspriteontargets": {
          // Singles: the one target is the battler arg.
          const a = [...c.args];
          a[c.battlerargindex] = AnimBattler.Target;
          setArgs(a);
          createSprite(c.template, c.battler, c.subpriority, [...args]);
          break;
        }
        case "createvisualtask":
        case "createvisualtaskontargets": {
          const a = [...c.args];
          if (c.op === "createvisualtaskontargets") a[c.battlerargindex] = AnimBattler.Target;
          setArgs(a);
          // A task starts at once (up to its first yield), as CreateTask's first call does.
          const task = TASKS[c.task](run, [...args], c.op === "createvisualtask" ? c.se : undefined);
          if (!task.next().done) tasks.push(task);
          break;
        }
        case "createsoundtask":
          setArgs(c.args);
          soundTasks.push(SOUND_TASKS[c.task](run, [...args], c.se));
          break;
        case "delay": {
          let frames = c.frames;
          yield* wait(() => frames-- <= 0);
          break;
        }
        case "waitforvisualfinish":
          yield* wait(() => !busy());
          break;
        case "waitsound":
          yield* wait(() => soundTasks.length === 0);
          break;

        // Sounds, panned to the side they come from (stereo only).
        case "playse":
          run.play(c.se, 0);
          break;
        case "playsewithpan":
          run.play(c.se, run.pan(c.pan));
          break;
        case "setpan":
          gba.sound.setPan("se", webPan(adjustPan(ctx, c.pan)));
          break;
        case "panse":
        case "panse_adjustnone":
        case "panse_adjustall": {
          // Task_PanFromInitialToTarget: the pan moves by `incrementPan` every `delay` + 1 frames.
          const adjust = c.op === "panse" ? run.pan : c.op === "panse_adjustall" ? (p: number) => adjustPan2(ctx, p) : (p: number) => p;
          const from = adjust(c.currentPan);
          const to = adjust(c.targetPan);
          const by = c.op === "panse" ? Math.sign(to - from) * Math.abs(c.incrementPan) : adjust(c.incrementPan);
          const delay = c.delay;
          run.play(c.se, from);
          soundTasks.push(
            (function* () {
              for (let pan = from; ; ) {
                for (let i = 0; i <= delay; i++) yield;
                pan += by;
                const done = by === 0 || (from < to ? pan >= to : pan <= to);
                gba.sound.setPan("se", webPan(done ? to : pan));
                if (done) return;
              }
            })(),
          );
          break;
        }
        case "waitplaysewithpan": {
          const { se, wait } = c;
          const pan = run.pan(c.pan);
          soundTasks.push(
            (function* () {
              for (let i = 0; i < wait; i++) yield;
              run.play(se, pan);
            })(),
          );
          break;
        }
        case "loopsewithpan": {
          // Task_LoopAndPlaySE: `times` plays, `wait` frames apart, the first at once.
          const { se, wait, times } = c;
          const pan = run.pan(c.pan);
          soundTasks.push(
            (function* () {
              for (let n = 0; n < times; n++) {
                run.play(se, pan);
                if (n + 1 < times) for (let i = 0; i < wait; i++) yield;
              }
            })(),
          );
          break;
        }
        case "stopsound":
          gba.sound.stop("se");
          break;

        // Move backgrounds (Task_FadeToBg): fadetobgfromset picks by the target's side.
        case "fadetobg":
          fadeToBackground(c.bg);
          break;
        case "fadetobgfromset":
          fadeToBackground(run.target.foe ? c.bgOpponent : c.bgPlayer);
          break;
        case "restorebg":
          fadeToBackground(-1);
          break;
        case "changebg":
          showBackground(c.bg);
          break;
        case "waitbgfadeout":
          yield* wait(() => bgFade === 2 || bgFade === 0);
          break;
        case "waitbgfadein":
          yield* wait(() => bgFade === 0);
          break;

        // Blending: OBJ_BLEND sprites over everything (BLDCNT_TGT2_ALL | BLDCNT_EFFECT_BLEND).
        case "setalpha":
          video.effect = Effect.Blend;
          video.target1 = 0;
          video.target2 = Layer.ALL;
          video.eva = c.eva;
          video.evb = c.evb;
          break;
        case "setbldcnt":
          video.target1 = c.bldcnt & 0x3f;
          video.effect = ((c.bldcnt >> 6) & 3) as Effect;
          video.target2 = (c.bldcnt >> 8) & 0x3f;
          break;
        case "blendoff":
          video.effect = Effect.None;
          video.target1 = video.target2 = video.eva = video.evb = 0;
          break;

        // Battlers on backgrounds: ours stay sprites. Team attacks are doubles only.
        case "monbg":
        case "monbg_static":
        case "clearmonbg":
        case "clearmonbg_static": {
          const sprite = run.mon(c.battler & 1 ? AnimBattler.Target : AnimBattler.Attacker).sprite;
          if (!sprite) break;
          sprite.onBg = c.op.startsWith("monbg");
          if (sprite.onBg) monOnBg.add(sprite);
          else monOnBg.delete(sprite);
          break;
        }
        case "splitbgprio":
        case "splitbgprio_all":
        case "splitbgprio_foes":
        case "teamattack_moveback":
        case "teamattack_movefwd":
          break;
        case "invisible":
        case "visible": {
          const sprite = run.mon(c.battler === AnimBattler.Attacker ? AnimBattler.Attacker : AnimBattler.Target).sprite;
          if (sprite) sprite.invisible = c.op === "invisible";
          break;
        }

        // Flow.
        case "goto":
          jump(c.label);
          break;
        case "call":
          stack.push([label, pc]);
          jump(c.label);
          break;
        case "return": {
          const back = stack.pop();
          if (!back) return;
          [label, pc] = back;
          break;
        }
        case "choosetwoturnanim":
          jump(turn & 1 ? c.second : c.first);
          break;
        case "jumpifmoveturn":
          if (turn === c.value) jump(c.label);
          break;
        case "jumpargeq":
          if (args[c.argId] === c.value) jump(c.label);
          break;
        case "jumpreteq":
          if (args[ARG_RET] === c.value) jump(c.label);
          break;
        case "jumprettrue":
          if (args[ARG_RET]) jump(c.label);
          break;
        case "jumpretfalse":
          if (!args[ARG_RET]) jump(c.label);
          break;
        case "jumpifcontest":
          break;
        case "setarg":
          args[c.argId] = c.value;
          break;
        case "end":
          yield* wait(() => !busy() && soundTasks.length === 0 && !bgTask);
          return;
        default:
          throw new Error(`battle anim: ${(c as AnimCommand).op} isn't supported`);
      }
    }
  } finally {
    for (const s of [...sprites, ...loose]) gba.sprites.destroy(s);
    for (const tag of loaded) {
      gba.sprites.freeSheet(tag);
      gba.palettes.freeSpritePalette(tag);
    }
    gba.sprites.freeSheet(DUMMY);
    gba.palettes.freeSpritePalette(DUMMY);
    for (const mon of monOnBg) mon.onBg = false;
    Object.assign(video, blend, { evy: 0 });
    // The terrain back, in its own colors (palettes 1-3 are the ones scripts blend).
    if (moveBackground) ctx.backdrop.drawTerrain();
    ctx.backdrop.scrollX = ctx.backdrop.scrollY = 0;
    gba.palettes.blendPalette(16, 48, 0, 0);
    // The battlers back in place, shown, unscaled and in their own colors.
    for (const [s, hidden] of startHidden) {
      s.x2 = s.y2 = 0;
      s.invisible = hidden;
      s.mode = ObjMode.Normal;
      if (s.affineAnimPaused) {
        s.setRotScale(0x100, 0x100, 0);
        s.affineAnimPaused = false;
      }
      gba.palettes.blendPalette(256 + s.paletteNum * 16, 16, 0, 0);
    }
  }
}
