// The Trainer Card (trainer_card.c), opened from the START menu: FireRed's card on its blue
// screen (the girl's has its own colors), with the player's name, ID No., money, Pokédex and
// play time on the front, the player's picture, and the back with the records. A flips it,
// squashing it on the screen line by line; B (or A on the back) closes it.
// Badges, stars and the back's records (Hall of Fame, link battles, trades, Berry Crush, Union
// Room, Pokémon icons, stickers) come with what earns them; until then the game shows none.

import { Gender, type TrainerSummary } from "@pokeuniverse/contracts/trainer/v1/trainer";
import { Button } from "../gba/input";
import { FadeStatus, PALETTES_ALL } from "../gba/palette";
import type { Task } from "../gba/tasks";
import { decimalText, FontId, joinText, NumberMode, Window, type Text, type WindowTemplate } from "../gba/text";
import { Effect, HEIGHT, Layer, RGB_BLACK, WIDTH, WIN_EFFECTS, type Background } from "../gba/video";
import { initBg } from "./common";
import type { Flow } from "./flow";
import { loadStdWindowFrameGfx } from "./menu";

/** BG0 (the card), BG2 (the screen) and BG3 share their tiles: the card's, then BG3's from tile 192. */
const BG3_BASE_TILE = 192;
const SHARED_TILES = 1024;

const WINDOWS = {
  /** The text, on BG1 over everything. */
  text: { left: 1, top: 1, width: 27, height: 18, palette: 15, baseBlock: 0x001 },
  /** The player's picture, on BG3. */
  pic: { left: 19, top: 5, width: 9, height: 10, palette: 8, baseBlock: BG3_BASE_TILE + 0x150 },
} satisfies Record<string, WindowTemplate>;

const TEXT_COLORS = [0, 2, 3] as const;
const PIC_X = 13;
const PIC_Y = 4;
const TIME_X = 101;
const TIME_COLON_X = 119;
const TIME_MINUTES_X = 124;
const TIME_Y = 88;
/** The play time's colon blinks every 60 frames. */
const COLON_BLINK_FRAMES = 60;

/** Frames on black before the fade in: CB2_InitTrainerCard's steps, then the task drawing the card. */
const SETUP_FRAMES = 34;

/** The flip: the card squashes 7 lines a frame to 77 from each edge, then opens 5 a frame. */
const FLIP_DOWN_STEP = 7;
const FLIP_UP_STEP = 5;
const FLIP_MOST = 77;

const enum State {
  Setup,
  FadeIn,
  Front,
  FlipToBack,
  Back,
  FlipToFront,
  Close,
}

/** Shows the card, then `done` once it faded out (the overworld returns with the menu open). */
export function startTrainerCard(flow: Flow, trainer: TrainerSummary, name: Text, done: () => void): void {
  new TrainerCard(flow, trainer, name, done);
}

class TrainerCard {
  private readonly bgs: Background[];
  private readonly text: Window;
  private readonly pic: Window;
  private state = State.Setup;
  private wait = SETUP_FRAMES;
  private onBack = false;
  /** Starts at the play time's frames, so the colon blinks with the seconds. */
  private colonTimer: number;
  private colonInvisible = false;
  private colonNeedsDraw = false;
  /** The flip's BG0 vertical offset per line: computed (buffer 0), then shown (buffer 1). */
  private readonly lines = [new Int16Array(HEIGHT), new Int16Array(HEIGHT)];
  private allowLinesCopy = false;
  private flipping = false;

  constructor(
    private readonly flow: Flow,
    private readonly trainer: TrainerSummary,
    private readonly name: Text,
    private readonly done: () => void,
  ) {
    const { gba, assets } = flow;
    this.colonTimer = flow.playTime.frames;
    gba.setVBlank(null);
    gba.reset();
    const { video } = gba;
    this.bgs = video.bgs;
    const [bg0, bg1, bg2, bg3] = this.bgs;
    initBg(bg0, 2, 2);
    initBg(bg1, 0, 0);
    initBg(bg2, 0, 3);
    initBg(bg3, 0, 1);
    const shared = new Uint8Array(SHARED_TILES * 64);
    bg0.tiles = bg2.tiles = bg3.tiles = shared;
    bg1.tiles = new Uint8Array(0x241 * 64);
    this.text = new Window(bg1, WINDOWS.text);
    this.pic = new Window(bg3, WINDOWS.pic);

    // Palettes and tiles (LoadStdWindowFrameGfx, SetTrainerCardBgsAndPals).
    loadStdWindowFrameGfx(flow, bg1);
    shared.set(assets.get("tcTiles").tiles.subarray(0, BG3_BASE_TILE * 64));
    gba.palettes.load(assets.get("tcBluePal").palette, 0, 48);
    if (trainer.gender === Gender.GIRL) gba.palettes.load(assets.get("tcFemaleBgPal").palette, 16, 16);

    // HandleGpuRegs: WIN0 over the whole screen; BG0 can darken inside it, and only shows there.
    for (const bg of this.bgs) bg.visible = true;
    video.win0On = true;
    Object.assign(video.win0, { left: 0, right: WIDTH, top: 0, bottom: HEIGHT });
    video.winIn0 = Layer.BG0 | Layer.BG1 | Layer.BG2 | Layer.BG3 | Layer.OBJ | WIN_EFFECTS;
    video.winOut = Layer.BG1 | Layer.BG2 | Layer.BG3 | Layer.OBJ;
    video.effect = Effect.Darken;
    video.target1 = Layer.BG0;
    video.evy = 0;

    // Task_TrainerCard's first steps: the front printed, the picture, the screen and the card.
    this.text.fill(0);
    this.runAll(this.frontSteps());
    this.showText();
    this.drawPic();
    this.showPic();
    this.drawMap(bg2, assets.get("tcBg").map!);
    this.drawMap(bg0, assets.get("tcFront").map!);

    gba.tasks.create(() => this.update(), 0);
    gba.setMain(() => {
      gba.tasks.run();
      gba.sprites.animate();
      gba.sprites.buildOam();
      gba.palettes.updateFade();
    });
  }

  private update(): void {
    const { gba } = this.flow;
    const { input, palettes } = gba;
    switch (this.state) {
      case State.Setup:
        if (--this.wait > 0) return;
        palettes.beginFade(PALETTES_ALL, 0, 16, 0, RGB_BLACK);
        gba.setVBlank(() => this.vblank());
        this.state = State.FadeIn;
        return;
      case State.FadeIn:
        if (palettes.updateFade() !== FadeStatus.Done) return;
        this.flow.play("se_card_open");
        this.state = State.Front;
        return;
      case State.Front:
        if (this.colonNeedsDraw) {
          this.printTime();
          this.showText();
          this.colonNeedsDraw = false;
        }
        if (input.isPressed(Button.A)) {
          this.flip();
          this.flow.play("se_card_flip");
          this.state = State.FlipToBack;
        } else if (input.isPressed(Button.B)) this.close();
        return;
      case State.FlipToBack:
      case State.FlipToFront:
        if (this.flipping) return;
        this.flow.play("se_card_open");
        this.state = this.state === State.FlipToBack ? State.Back : State.Front;
        return;
      case State.Back:
        if (input.isPressed(Button.B)) {
          this.flip();
          this.flow.play("se_card_flip");
          this.state = State.FlipToFront;
        } else if (input.isPressed(Button.A)) this.close();
        return;
      case State.Close:
        if (palettes.updateFade() === FadeStatus.Done) {
          gba.tasks.reset();
          this.done();
        }
    }
  }

  private close(): void {
    this.flow.gba.palettes.beginFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
    this.state = State.Close;
  }

  /** VBlankCB_TrainerCard: palettes, the colon's blink, the flip's lines for the next frame. */
  private vblank(): void {
    this.flow.gba.standardVBlank();
    if (++this.colonTimer > COLON_BLINK_FRAMES) {
      this.colonTimer = 0;
      this.colonInvisible = !this.colonInvisible;
      this.colonNeedsDraw = true;
    }
    if (this.allowLinesCopy) this.lines[1].set(this.lines[0]);
    // HBlank sets BG0VOFS from the buffer for the line after: line n shows offset n - 1.
    const bg0 = this.bgs[0];
    if (this.flipping) {
      const y = (bg0.yLines ??= new Int16Array(HEIGHT));
      y[0] = 0;
      y.set(this.lines[1].subarray(0, HEIGHT - 1), 1);
    } else bg0.yLines = null;
  }

  // Printing, one step a frame like the game (PrintAllOnCardFront / PrintAllOnCardBack).

  private frontSteps(): (() => void)[] {
    const { assets } = this.flow;
    const { trainer } = this;
    return [
      () => this.print(20, 29, joinText(assets.text("gText_TrainerCardName"), this.name)),
      () => this.print(142, 10, joinText(assets.text("gText_TrainerCardIDNo"), decimalText(trainer.idNo, NumberMode.LeadingZeros, 5))),
      () => {
        const money = joinText(assets.text("gText_TrainerCardYen"), decimalText(trainer.money, NumberMode.LeftAlign, 6));
        this.print(20, 56, assets.text("gText_TrainerCardMoney"));
        this.print((-122 - 6 * (money.length - 1)) & 0xff, 56, money);
      },
      () => {
        if (trainer.pokedexCaught === undefined) return;
        const caught = decimalText(trainer.pokedexCaught, NumberMode.LeftAlign, 3);
        this.print(20, 72, assets.text("gText_TrainerCardPokedex"));
        this.print((-120 - 6 * (caught.length - 1)) & 0xff, 72, caught);
      },
      () => this.printTime(),
      // The profile phrase shows on link players' cards only.
      () => {},
    ];
  }

  private backSteps(): (() => void)[] {
    return [
      () => this.print(138, 11, this.name),
      // Hall of Fame debut, link battles, trades, Berry Crush, Union Room, Pokémon icons, stickers.
      ...Array.from({ length: 7 }, () => () => {}),
    ];
  }

  private printTime(): void {
    const { hours, minutes } = this.flow.playTime;
    this.text.fillRect(0, TIME_X, TIME_Y, 50, 12);
    this.print(20, TIME_Y, this.flow.assets.text("gText_TrainerCardTime"));
    this.print(TIME_X, TIME_Y, decimalText(hours, NumberMode.RightAlign, 3));
    if (!this.colonInvisible) this.print(TIME_COLON_X, TIME_Y, this.flow.assets.text("gText_Colon2"));
    this.print(TIME_MINUTES_X, TIME_Y, decimalText(minutes, NumberMode.LeadingZeros, 2));
  }

  private print(x: number, y: number, text: Text): void {
    this.text.print(this.flow.fonts[FontId.Normal], x, y, TEXT_COLORS, text);
  }

  private runAll(steps: (() => void)[]): void {
    for (const step of steps) step();
  }

  /** DrawTrainerCardWindow. */
  private showText(): void {
    this.text.putTilemap();
    this.text.copyToVram();
  }

  private showPic(): void {
    this.pic.putTilemap();
    this.pic.copyToVram();
  }

  /** CreateTrainerCardTrainerPic: Red or Leaf's picture into its window, with its palette. */
  private drawPic(): void {
    const pic = this.flow.assets.get(this.trainer.gender === Gender.GIRL ? "picLeafFront" : "picRedFront");
    this.pic.fill(0);
    this.pic.blit(pic.image!, PIC_X, PIC_Y);
    this.flow.gba.palettes.load(pic.palette, 8 * 16, 16);
  }

  /** DrawCardScreenBackground / DrawCardFrontOrBack: a 30×20 tilemap; columns 30 and 31 repeat its first entry. */
  private drawMap(bg: Background, map: Uint16Array): void {
    for (let y = 0; y < 20; y++) for (let x = 0; x < 32; x++) bg.setEntry(x, y, x < 30 ? map[30 * y + x] : map[0]);
  }

  // The flip (Task_DoCardFlipTask): one step a frame.

  private flip(): void {
    this.flipping = true;
    const steps = [
      this.beginFlip,
      this.squash,
      this.drawFlippedSide(),
      this.setFlipped,
      this.unsquash,
      this.endFlip,
    ];
    const fn = (task: Task) => {
      while (steps[task.data[0]](task));
    };
    const task = this.flow.gba.tasks.create(fn, 0);
    fn(task);
  }

  private readonly beginFlip = (task: Task): boolean => {
    this.bgs[1].visible = false;
    this.bgs[3].visible = false;
    this.lines[0].fill(0);
    this.lines[1].fill(0);
    task.data[0]++;
    return false;
  };

  private readonly squash = (task: Task): boolean => {
    task.data[1] = Math.min(task.data[1] + FLIP_DOWN_STEP, FLIP_MOST);
    this.setFlipLines(task.data[1], true);
    if (task.data[1] >= FLIP_MOST) task.data[0]++;
    return false;
  };

  private readonly unsquash = (task: Task): boolean => {
    task.data[1] = task.data[1] <= FLIP_UP_STEP ? 0 : task.data[1] - FLIP_UP_STEP;
    this.setFlipLines(task.data[1], false);
    if (task.data[1] <= 0) task.data[0]++;
    return false;
  };

  /**
   * Task_AnimateCardFlipDown / Up: the card shows between `top` and 160 - `top`, darker the
   * flatter it is, its 160 lines squeezed in with 16.16 steps that shrink (down) or grow (up).
   */
  private setFlipLines(top: number, down: boolean): void {
    this.allowLinesCopy = false;
    const { video } = this.flow.gba;
    const blendY = Math.trunc((top + 40) / 10);
    video.evy = blendY <= 4 ? 0 : blendY;
    video.win0.top = top;
    video.win0.bottom = HEIGHT - top;
    const out = this.lines[0];
    const bottom = HEIGHT - top;
    const span = bottom - top;
    let pos = (-top << 16) >>> 0;
    let step = (Math.floor(0xa00000 / span) - 0x10000) >>> 0;
    const end = (pos + step * span) >>> 0;
    const delta = Math.floor(step / span);
    step = down ? (step * 2) >>> 0 : Math.floor(step / 2);
    let i = 0;
    for (; i < top; i++) out[i] = -i;
    for (; i < bottom; i++) {
      out[i] = pos >>> 16;
      pos = (pos + step) >>> 0;
      step = (down ? step - delta : step + delta) >>> 0;
    }
    for (; i < HEIGHT; i++) out[i] = end >>> 16;
    this.allowLinesCopy = true;
  }

  /** Task_DrawFlippedCardSide: the other side printed one step a frame, then its tilemap. */
  private drawFlippedSide(): (task: Task) => boolean {
    let state = 0;
    let steps: (() => void)[] = [];
    let printed = 0;
    return (task) => {
      this.allowLinesCopy = false;
      for (;;) {
        switch (state) {
          case 0:
            this.text.fill(0);
            this.bgs[3].map.fill(0);
            steps = this.onBack ? this.frontSteps() : this.backSteps();
            printed = 0;
            break;
          case 1:
            // Each frame one step; the frame after the last one ends the printing.
            if (printed < steps.length) {
              steps[printed++]();
              return false;
            }
            break;
          case 2:
            if (!this.onBack) this.drawMap(this.bgs[0], this.flow.assets.get("tcBack").map!);
            else this.showText();
            break;
          case 3:
            // The back's records marks come with the records; turning to the front clears the picture.
            if (this.onBack) this.pic.fill(0);
            break;
          case 4:
            if (this.onBack) this.drawPic();
            break;
          default:
            state = 0;
            task.data[0]++;
            this.allowLinesCopy = true;
            return false;
        }
        state++;
      }
    };
  }

  private readonly setFlipped = (task: Task): boolean => {
    this.allowLinesCopy = false;
    if (this.onBack) {
      this.showPic();
      this.drawMap(this.bgs[2], this.flow.assets.get("tcBg").map!);
      this.drawMap(this.bgs[0], this.flow.assets.get("tcFront").map!);
    }
    this.showText();
    this.onBack = !this.onBack;
    task.data[0]++;
    this.allowLinesCopy = true;
    this.flow.play("se_card_flipping");
    return false;
  };

  private readonly endFlip = (task: Task): boolean => {
    this.bgs[1].visible = true;
    this.bgs[3].visible = true;
    this.flipping = false;
    this.flow.gba.tasks.destroy(task);
    return false;
  };
}
