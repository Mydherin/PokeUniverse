// The evolution scene (evolution_scene.c, evolution_graphics.c): "What? <MON> is evolving!", the
// sparkles, the two sprites growing and shrinking in turns with the moving background behind, and
// "Congratulations!" once mic-core saved it. B held during the cycle stops it, and so does a
// species past Kanto's without the National Pokédex.

import type { PendingEvolution, PokemonEvolved } from "@pokeuniverse/contracts/party/v1/party";
import { toTiles } from "../../gba/assets";
import { Button } from "../../gba/input";
import { PALETTES_ALL } from "../../gba/palette";
import type { Sprite, SpriteCallback, SpriteTemplate } from "../../gba/sprites";
import type { Task } from "../../gba/tasks";
import { expandPlaceholders, type Text } from "../../gba/text";
import { Effect, Layer, RGB_BLACK, RGB_WHITE } from "../../gba/video";
import { initBg } from "../common";
import type { Flow } from "../flow";
import { sin, cos } from "./anims/behaviors/util";
import { askToLearnMove } from "./learn";
import { wait } from "./playback";
import type { BattleScene } from "./scene";
import type { BattleTexts } from "./text";

const STR_VAR_1 = 0x02;
const STR_VAR_2 = 0x03;
const KANTO_LAST = 151;
/** The terrain's BG palettes. */
const TERRAIN = 0x1c;
/** The BG palettes the flash whitens: the terrain's and 8-11 (the moving background's among them). */
const FLASH = 0x0f1c;
const BG_PALETTE = 10 * 16;

/** sEvolutionSparkleMatrixScales: matrices 20 to 31. */
const SPARKLE_SCALES = [0x3c0, 0x380, 0x340, 0x300, 0x2c0, 0x280, 0x240, 0x200, 0x1c0, 0x180, 0x140, 0x100];

/** sBgAnim_PaletteControl: first and last row, cycles, delay. */
const BG_STAGES = [
  [0, 12, 1, 6],
  [13, 36, 5, 2],
  [13, 24, 1, 2],
  [37, 49, 1, 6],
];

/** sBgAnim_PalIndexes: a triangle wave of the 14 colors, moving a color per row, then fading out (without the table's one stray 0). */
function bgPalIndex(row: number, col: number): number {
  if (col < 1 || col > 13) return 0;
  if (row >= 37) return Math.max(0, 13 - col - (row - 37));
  const at = col + row - 12;
  if (at < 1) return 0;
  const k = (at - 1) % 24;
  return k < 13 ? k + 1 : 25 - k;
}

/** What the scene needs from the battle screen. */
export interface EvolutionHost {
  readonly flow: Flow;
  readonly texts: BattleTexts;
  readonly nationalDex: boolean;
  /** A new scene, with the terrain as the evolution has it. */
  newScene(): BattleScene;
  fadeIn(): void;
  /** Its name now, in the party. */
  monName(slot: number): Text;
  /** What it is now, in the party. */
  mon(slot: number): { species: number; shiny: boolean } | undefined;
  /** The move in that slot now, in the party. */
  moveAt(slot: number, moveSlot: number): number;
  /** Sends EvolvePokemon; the answer comes once it's saved. */
  evolve(slot: number): Promise<PokemonEvolved>;
  learnMove(slot: number, move: number, forget: number): void;
  /** The forget screen: fades out, and back through `redraw`. */
  forgetScreen(slot: number, move: number, pick: (row: number) => void, redraw: () => void): Generator<void, void, void>;
}

export function* evolutionScene(host: EvolutionHost, pending: PendingEvolution): Generator<void, void, void> {
  yield* new Evolution(host, pending).run();
}

class Evolution {
  private readonly flow: Flow;
  private readonly slot: number;
  private readonly from: number;
  private readonly to: number;
  private readonly shiny: boolean;
  private scene!: BattleScene;
  private pre!: Sprite;
  private post!: Sprite;
  /** The two mon sprites' OBJ palettes, as a fade mask. */
  private monMask = 0;
  private bg: MovingBg | null = null;
  private readonly fromName: Text;

  constructor(
    private readonly host: EvolutionHost,
    pending: PendingEvolution,
  ) {
    this.flow = host.flow;
    this.slot = pending.slot;
    this.to = pending.species;
    const mon = host.mon(pending.slot);
    this.from = mon?.species ?? 0;
    this.shiny = mon?.shiny ?? false;
    this.fromName = host.monName(pending.slot);
  }

  *run(): Generator<void, void, void> {
    const { flow, host } = this;
    const { gba, assets } = flow;
    let ready = false;
    const done = () => (ready = true);
    void Promise.all([assets.pokemonArt(this.from), assets.pokemonArt(this.to)]).then(done, done);
    while (!ready) yield;

    // The battle's sprites and windows go; the scene starts from nothing (EvolutionScene).
    gba.setVBlank(null);
    gba.reset();
    this.draw(this.from);
    host.fadeIn();
    while (gba.palettes.fadeActive) yield;

    yield* this.scene.message(this.vars("gText_PkmnIsEvolving"), 0);
    yield* this.cry(this.from);
    gba.sound.play("mus_evolution_intro");
    while (gba.sound.isPlaying("se")) yield;
    gba.sound.playBgm("mus_evolution");
    gba.palettes.beginFade(TERRAIN, 4, 0, 16, RGB_BLACK);
    while (gba.palettes.fadeActive) yield;

    const saved = gba.palettes.unfaded.slice(2 * 16, 5 * 16);
    this.bg = new MovingBg(flow);
    yield* this.spiralUp();
    yield* this.arcDown();
    const outcome = yield* this.cycle();
    if (outcome !== "evolved") return yield* this.stopped(outcome === "locked");

    yield* this.circleIn();
    yield* this.spray();
    flow.play("se_exp");
    yield;
    gba.sound.stopAll();
    gba.palettes.unfaded.set(saved, 2 * 16);
    this.bg?.restore();
    this.bg = null;
    gba.palettes.beginFade(TERRAIN, 0, 16, 0, RGB_BLACK);
    while (gba.palettes.fadeActive) yield;
    yield* this.cry(this.to);

    // Saved before it's shown: the party changes with this answer.
    let answer: PokemonEvolved | null = null;
    void host.evolve(this.slot).then((a) => (answer = a));
    while (!answer) yield;
    const evolved: PokemonEvolved = answer;
    if (evolved.failed) {
      yield* this.scene.message(flow.assets.text("gText_EllipsisQuestionMark"), 0);
      return yield* this.fadeOut();
    }
    gba.sound.playBgm("mus_evolved");
    yield* this.scene.message(this.vars("gText_CongratsPkmnEvolved"), 0);

    for (const move of evolved.learned) yield* this.learned(move);
    for (const move of evolved.toLearn) yield* this.tryToLearn(move);
    yield* this.fadeOut();
  }

  /** The scene's video: at its start with the old sprite, after the forget screen with the new one. */
  private draw(shown: number): void {
    const { flow, host } = this;
    const { gba, assets } = flow;
    this.scene = host.newScene();
    this.scene.drawTerrain();
    this.scene.scrollX = 256;
    gba.sprites.loadSheet("evolutionSparkle", assets.get("evolutionSparkle").tiles);
    gba.palettes.loadSpritePalette("evolutionSparkle", assets.get("evolutionSparkle").palette);
    this.pre = this.monSprite("evolutionPre", this.from);
    this.post = this.monSprite("evolutionPost", this.to);
    this.pre.invisible = shown !== this.from;
    this.post.invisible = shown !== this.to;
    const obj = (s: Sprite) => 1 << (16 + s.paletteNum);
    this.monMask = obj(this.pre) | obj(this.post);
  }

  private monSprite(tag: string, species: number): Sprite {
    const { gba, assets } = this.flow;
    const art = assets.loadedPokemonArt(species);
    gba.sprites.freeSheet(tag);
    gba.sprites.loadSheet(tag, art ? toTiles(art.front) : new Uint8Array(0));
    gba.palettes.freeSpritePalette(tag);
    gba.palettes.loadSpritePalette(tag, (this.shiny ? art?.shinyPalette : art?.frontPalette) ?? new Uint16Array(16));
    const sprite = gba.sprites.create({ sheet: tag, palette: tag, width: 64, height: 64, priority: 2, affineNormal: true }, 120, 64, 30)!;
    sprite.affineAnimPaused = true;
    return sprite;
  }

  private vars(id: "gText_PkmnIsEvolving" | "gText_CongratsPkmnEvolved" | "gText_PkmnStoppedEvolving"): number[] {
    const { assets } = this.flow;
    return expandPlaceholders(assets.text(id), { [STR_VAR_1]: this.fromName, [STR_VAR_2]: assets.species(this.to).name });
  }

  private *cry(species: number): Generator<void, void, void> {
    this.flow.playCry(species);
    yield;
    while (this.flow.gba.sound.isPlaying("cry")) yield;
  }

  private sparkle(x: number, y: number, subpriority: number, matrix: number, callback: (s: Sprite) => void): void {
    const { sprites } = this.flow.gba;
    const template: SpriteTemplate = { sheet: "evolutionSparkle", palette: "evolutionSparkle", width: 8, height: 8, priority: 1, affineNormal: true };
    const s = sprites.create(template, x, y, subpriority);
    if (!s) return;
    s.affineAnimPaused = true;
    setMatrix(s, matrix);
    s.callback = callback as SpriteCallback;
  }

  private kill(s: Sprite): void {
    this.flow.gba.sprites.destroy(s);
  }

  /** EvolutionSparkles_SpiralUpward: the Pokémon turns white as the sparkles rise around it. */
  private *spiralUp(): Generator<void, void, void> {
    const { flow } = this;
    flow.gba.palettes.beginFade(this.monMask, 10, 0, 16, RGB_WHITE);
    flow.play("se_m_mega_kick");
    for (let t = 0; t < 64; t++) {
      if ((t & 7) === 0) for (let i = 0; i < 4; i++) this.spiralSparkle(2 * (t & 0x78) + 64 * i);
      yield;
    }
    yield* wait(96);
  }

  /** SpriteCB_PreEvoSparkleSet1. */
  private spiralSparkle(angle: number): void {
    let radius = 48;
    let turn = angle;
    let t = 0;
    this.sparkle(120, 88, 0, 31, (s) => {
      if (s.y <= 8) return this.kill(s);
      s.y = 88 - Math.trunc((t * t) / 80);
      s.y2 = Math.trunc(sin(turn & 0xff, radius) / 4);
      s.x2 = cos(turn & 0xff, radius);
      turn += 4;
      if (t & 1) radius--;
      t++;
      s.subpriority = s.y2 > 0 ? 1 : 20;
      setMatrix(s, Math.min(31, Math.trunc(radius / 4) + 20));
    });
  }

  /** EvolutionSparkles_ArcDown. */
  private *arcDown(): Generator<void, void, void> {
    this.flow.play("se_m_bubble_beam2");
    for (let t = 0; t < 96; t++) {
      if (t < 6) for (let i = 0; i < 9; i++) this.arcSparkle(16 * i);
      yield;
    }
  }

  /** SpriteCB_PreEvoSparkleSet2. */
  private arcSparkle(angle: number): void {
    let radius = 8;
    let t = 0;
    this.sparkle(120, 8, 1, 25, (s) => {
      if (s.y >= 88) return this.kill(s);
      s.y = 8 + Math.trunc((t * t) / 5);
      s.y2 = Math.trunc(sin(angle & 0xff, radius) / 4);
      s.x2 = cos(angle & 0xff, radius);
      radius = sin((t * 4) & 0xff, 40) + 8;
      t++;
    });
  }

  /**
   * CycleEvolutionMonSprite: both white, each growing as the other shrinks, faster each time, till
   * the new one stays. B held stops it with the old one; so does a species it can't become yet.
   */
  private *cycle(): Generator<void, "evolved" | "stopped" | "locked", void> {
    const { flow, pre, post, host } = this;
    const { palettes } = flow.gba;
    const setScale = (s: Sprite, scale: number) => {
      const m = Math.trunc(0x10000 / scale);
      s.setRotScale(m, m, 0);
    };
    let preScale = 256;
    let postScale = 16;
    setScale(pre, preScale);
    setScale(post, postScale);
    pre.invisible = post.invisible = false;
    for (const s of [pre, post]) palettes.faded.fill(RGB_WHITE, 256 + s.paletteNum * 16, 256 + (s.paletteNum + 1) * 16);
    const end = (stayed: Sprite, gone: Sprite) => {
      setScale(stayed, 256);
      setScale(gone, 256);
      stayed.invisible = false;
      gone.invisible = true;
    };
    if (!host.nationalDex && this.to > KANTO_LAST) {
      end(pre, post);
      return "locked";
    }
    let toPost = false;
    for (let speed = 10; speed <= 128; speed += 2) {
      toPost = !toPost;
      let settled = 0;
      while (settled < 2) {
        if (flow.gba.input.isHeld(Button.B)) {
          end(pre, post);
          return "stopped";
        }
        settled = 0;
        let grow = toPost ? postScale : preScale;
        let shrink = toPost ? preScale : postScale;
        if (grow < 0x100 - speed) grow += speed;
        else {
          grow = 0x100;
          settled++;
        }
        if (shrink > 0x10 + speed) shrink -= speed;
        else {
          shrink = 0x10;
          settled++;
        }
        [postScale, preScale] = toPost ? [grow, shrink] : [shrink, grow];
        setScale(pre, preScale);
        setScale(post, postScale);
        yield;
      }
    }
    end(post, pre);
    return "evolved";
  }

  /** EvolutionSparkles_CircleInward. */
  private *circleIn(): Generator<void, void, void> {
    this.flow.play("se_shiny");
    for (let t = 0; t < 48; t++) {
      if (t === 0 || t === 32) for (let i = 0; i < 16; i++) this.circleSparkle(i * 16, t === 0 ? 4 : 8);
      yield;
    }
  }

  /** SpriteCB_PostEvoSparkleSet1. */
  private circleSparkle(angle: number, speed: number): void {
    let radius = 120;
    let turn = angle;
    this.sparkle(120, 56, 1, 31, (s) => {
      if (radius <= 8) return this.kill(s);
      s.y2 = sin(turn & 0xff, radius);
      s.x2 = cos(turn & 0xff, radius);
      radius -= speed;
      turn += 4;
    });
  }

  /** EvolutionSparkles_SprayAndFlash: everything goes white and comes back, with the new Pokémon. */
  private *spray(): Generator<void, void, void> {
    const { flow } = this;
    const { palettes } = flow.gba;
    this.bg?.pause();
    palettes.unfaded.set(palettes.faded.subarray(2 * 16, 5 * 16), 2 * 16);
    palettes.beginFade((0xffff0000 & ~this.monMask) | FLASH, 0, 0, 16, RGB_WHITE);
    flow.play("se_m_petal_dance");
    for (let t = 0; t < 128; t++) {
      if (t === 0) for (let i = 0; i < 8; i++) this.spraySparkle();
      else if (t === 32) palettes.beginFade(0xffff0000 | FLASH, 16, 16, 0, RGB_WHITE);
      else if (t < 50) this.spraySparkle();
      yield;
    }
    while (palettes.fadeActive) yield;
  }

  /** SpriteCB_PostEvoSparkleSet2. */
  private spraySparkle(): void {
    const drift = 3 - Math.floor(Math.random() * 7);
    const height = 48 + Math.floor(Math.random() * 64);
    let turn = 0;
    let t = 0;
    this.sparkle(120, 56, 20, 31, (s) => {
      if (turn >= 128) return this.kill(s);
      if ((t & 3) === 0) s.y++;
      s.y2 = -sin(turn, height);
      s.x = 120 + Math.trunc((drift * t) / 3);
      turn++;
      s.invisible = false;
      if (turn > 64) s.subpriority = 1;
      else {
        s.subpriority = 20;
        if (turn > 112 && turn & 1) s.invisible = true;
      }
      setMatrix(s, Math.max(20, 31 - Math.trunc((turn * 12) / 128)));
      t++;
    });
  }

  /** EVOSTATE_CANCEL: the screen back from white, its cry and its message. */
  private *stopped(locked: boolean): Generator<void, void, void> {
    const { flow } = this;
    const { gba } = flow;
    this.bg?.stop();
    this.bg = null;
    gba.sound.stopAll();
    gba.palettes.beginFade(this.monMask | TERRAIN, 0, 16, 0, RGB_WHITE);
    while (gba.palettes.fadeActive) yield;
    yield* this.cry(this.from);
    yield* this.scene.message(locked ? flow.assets.text("gText_EllipsisQuestionMark") : this.vars("gText_PkmnStoppedEvolving"), 0);
    yield* this.fadeOut();
  }

  /** EVOSTATE_LEARNED_MOVE: the fanfare, and a little time for it. */
  private *learned(move: number): Generator<void, void, void> {
    const { flow, host, scene } = this;
    flow.gba.sound.playFanfare("mus_level_up");
    yield* scene.message(host.texts.format("sText_PkmnLearnedMove", { buff1: host.monName(this.slot), buff2: host.texts.moveName(move) }), 0x40);
  }

  /** EVOSTATE_REPLACE_MOVE. The summary leaves, so the scene is drawn again after it. */
  private *tryToLearn(move: number): Generator<void, void, void> {
    const { host, slot } = this;
    const name = host.monName(slot);
    const forget = yield* askToLearnMove(() => this.scene, host.texts, name, move, (pick) => host.forgetScreen(slot, move, pick, () => this.draw(this.to)));
    if (forget === null) return;
    const gone = host.moveAt(slot, forget);
    host.learnMove(slot, move, forget);
    yield* this.scene.message(host.texts.format("sText_123Poof"), 0);
    yield* this.scene.message(host.texts.format("sText_PkmnForgotMove", { buff1: name, buff2: host.texts.moveName(gone) }), 0);
    yield* this.scene.message(host.texts.format("sText_AndEllipsis"), 0);
    yield* this.learned(move);
  }

  private *fadeOut(): Generator<void, void, void> {
    const { gba } = this.flow;
    gba.palettes.beginFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
    while (gba.palettes.fadeActive) yield;
    gba.sound.stopBgm();
  }
}

function setMatrix(s: Sprite, matrix: number): void {
  const scale = SPARKLE_SCALES[matrix - 20];
  s.setRotScale(scale, scale, 0);
}

/**
 * StartBgAnimation: BG1 and BG2 share the moving background's tiles, blended half and half,
 * swaying in opposite circles while palette 10 cycles (Task_UpdateBgPalette, Task_AnimateBg).
 */
class MovingBg {
  private readonly tasks: Task[] = [];
  private paused = false;

  constructor(private readonly flow: Flow) {
    const { gba, assets } = flow;
    const { video, palettes, tasks } = gba;
    const [, bg1, bg2] = video.bgs;
    const art = assets.get("evolutionBg");
    const map2 = assets.get("evolutionBg2").bytes!;
    palettes.fill(RGB_BLACK, BG_PALETTE, 16);
    initBg(bg1, 0, 2);
    initBg(bg2, 0, 2);
    bg1.tiles = bg2.tiles = art.tiles;
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const at = (y * 32 + x) * 2;
        bg1.setEntry(x, y, art.map![y * 32 + x]);
        bg2.setEntry(x, y, map2[at] | (map2[at + 1] << 8));
      }
    }
    bg1.visible = bg2.visible = true;
    Object.assign(video, { effect: Effect.Blend, target1: Layer.BG1, target2: Layer.BG2, eva: 8, evb: 8 });

    const colors = assets.get("evolutionPal").palette;
    const loadRow = (row: number) => {
      const out = new Array<number>(16);
      for (let col = 0; col < 16; col++) out[col] = colors[bgPalIndex(row, col)];
      palettes.load(out, BG_PALETTE, 16);
    };
    let startTimer = 0;
    let cycleTimer = 0;
    let row = 0;
    let stage = 0;
    let cycles = 0;
    this.tasks.push(
      tasks.create(() => {
        if (this.paused || startTimer++ < 20 || stage >= BG_STAGES.length) return;
        const [first, last, count, delay] = BG_STAGES[stage];
        if (cycleTimer++ <= delay) return;
        if (row === last) {
          if (++cycles === count) {
            cycles = 0;
            stage++;
          }
          row = first;
        } else {
          loadRow(row);
          cycleTimer = 0;
          row++;
        }
      }, 5),
    );
    let angle = 0;
    this.tasks.push(
      tasks.create(() => {
        if (stage >= BG_STAGES.length) return;
        angle = (angle + 5) & 0xff;
        const other = (angle + 0x80) & 0xff;
        bg1.x = (cos(angle, 4) + 8) << 8;
        bg1.y = (sin(angle, 4) + 16) << 8;
        bg2.x = (cos(other, 4) + 8) << 8;
        bg2.y = (sin(other, 4) + 16) << 8;
      }, 7),
    );
  }

  /** IsMovingBackgroundTaskRunning: the colors stop, black. */
  pause(): void {
    this.paused = true;
    this.flow.gba.palettes.fill(RGB_BLACK, BG_PALETTE, 16);
  }

  /** StopBgAnimation. */
  stop(): void {
    this.flow.gba.palettes.fill(RGB_BLACK, BG_PALETTE, 16);
    this.restore();
  }

  /** RestoreBgAfterAnim. */
  restore(): void {
    const { tasks, video } = this.flow.gba;
    for (const t of this.tasks) tasks.destroy(t);
    const [, bg1, bg2] = video.bgs;
    bg1.visible = bg2.visible = false;
    bg1.x = bg1.y = bg2.x = bg2.y = 0;
    Object.assign(video, { effect: Effect.None, target1: 0, target2: 0 });
  }
}
