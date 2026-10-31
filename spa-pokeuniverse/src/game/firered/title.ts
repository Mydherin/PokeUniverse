// The title screen: Charizard flashes in, the logo slides into view, flames rise and
// "PRESS START" blinks. A, B or Start skips the animation; A or Start then goes to the
// main menu, and after 2700 frames the intro plays again. Behavior from FireRed; the code is our own.

import type { Gba } from "../gba/gba";
import { Button } from "../gba/input";
import { PALETTES_ALL, PALETTES_BG, tintGrayScale, type Palettes } from "../gba/palette";
import { ObjMode, type Sprite, type SpriteTemplate } from "../gba/sprites";
import type { Task, Tasks } from "../gba/tasks";
import { randomize } from "../gba/trig";
import { Effect, Layer, RGB_BLACK, RGB_WHITE, rgb, WIDTH, WIN_EFFECTS, type Video } from "../gba/video";
import { initBg, loadBg, resetBgPositions } from "./common";
import type { Flow } from "./flow";
import { setBlend } from "./intro";

const enum Scene {
  Init,
  FlashSprite,
  FadeIn,
  Run,
  Restart,
  Cry,
}

const WHITE_BLUE = rgb(30, 30, 31);
const TIMEOUT = 2700;

const FLAME_ANIM = [{ image: 0, duration: 3 }, ...[4, 8, 12, 16, 20, 24, 28, 32, 36].map((image) => ({ image, duration: 6 })), "end" as const];
const FLAME: SpriteTemplate = { sheet: "flame", palette: "flame", width: 16, height: 16, priority: 3, anims: [FLAME_ANIM] };
const BLANK_FLAME: SpriteTemplate = { ...FLAME, sheet: "blankFlame" };
const BLANK_SPRITE: SpriteTemplate = { sheet: "blank", palette: "slash", width: 32, height: 64, priority: 0 };
const SLASH: SpriteTemplate = { sheet: "slash", palette: "slash", width: 64, height: 64, priority: 0, mode: ObjMode.Window };
const FLAME_XS = [4, 16, 26, 32, 48, 200, 216, 224, 232, 60, 76, 92, 108, 128, 144];

export function startTitle(flow: Flow): void {
  new Title(flow).start();
}

class Title {
  private readonly gba: Gba;
  private readonly video: Video;
  private readonly palettes: Palettes;
  private readonly tasks: Tasks;
  private timerTask: Task | null = null;
  /** Per-scanline BLDY (the scanline effect); stops at the next VBlank once asked. */
  private readonly scanline = new Int16Array(160);
  private scanlineState = 0;
  private scene = Scene.Init;
  private state = 0;
  private counter = 0;
  private hasBlankSprite = false;
  private slash: Sprite | null = null;

  constructor(private readonly flow: Flow) {
    this.gba = flow.gba;
    this.video = flow.gba.video;
    this.palettes = flow.gba.palettes;
    this.tasks = flow.gba.tasks;
  }

  start(): void {
    const { gba, video, palettes, flow } = this;
    const { assets } = flow;
    gba.setMain(() => {
      switch (gba.state) {
        case 0:
          gba.setVBlank(null);
          gba.tasks.reset();
          gba.sprites.reset();
          palettes.freeSpritePalettes();
          palettes.resetFade();
          video.reset();
          video.palette.fill(0);
          initBg(video.bgs[0], 0, 0, true);
          initBg(video.bgs[1], 0, 1);
          initBg(video.bgs[2], 0, 2);
          initBg(video.bgs[3], 0, 3);
          break;
        case 1:
          palettes.load(assets.get("titleLogo").palette, 0, 13 * 16);
          loadBg(video.bgs[0], assets.get("titleLogo"));
          palettes.load(assets.get("titleBoxArt").palette, 13 * 16, 16);
          loadBg(video.bgs[1], assets.get("titleBoxArt"));
          palettes.load(assets.get("titleBackground").palette, 15 * 16, 16);
          loadBg(video.bgs[2], assets.get("titlePressStart"));
          palettes.load(assets.get("titleBackground").palette, 14 * 16, 16);
          loadBg(video.bgs[3], assets.get("titleBorder"));
          gba.sprites.loadSheet("flame", assets.get("titleFlames").tiles);
          gba.sprites.loadSheet("blankFlame", assets.get("titleBlankFlames").tiles);
          gba.sprites.loadSheet("blank", assets.get("titleBlankSprite").tiles);
          gba.sprites.loadSheet("slash", assets.get("titleSlash").tiles);
          palettes.loadSpritePalette("flame", assets.get("titleFlames").palette);
          palettes.loadSpritePalette("slash", assets.get("titleSlash").palette);
          break;
        case 2:
          palettes.blendPalettes(PALETTES_BG, 16, RGB_BLACK);
          gba.tasks.create(() => this.main(), 4);
          this.timerTask = gba.tasks.create((task) => {
            if (task.data[0] >= TIMEOUT) {
              this.timerTask = null;
              gba.tasks.destroy(task);
            }
          }, 2);
          gba.setVBlank(() => this.vblank());
          gba.setMain(gba.runFrame);
          flow.playBgm("mus_title");
          return;
      }
      gba.state++;
    });
  }

  private vblank(): void {
    this.gba.standardVBlank();
    if (this.scanlineState === 3) this.scanlineState = 0;
    this.video.evyLines = this.scanlineState ? this.scanline : null;
    if (this.timerTask) this.timerTask.data[0]++;
  }

  private setScene(scene: Scene): void {
    this.scene = scene;
    this.state = 0;
  }

  private main(): void {
    if (this.gba.input.isPressed(Button.A | Button.B | Button.Start) && this.scene !== Scene.Run && this.scene !== Scene.Restart && this.scene !== Scene.Cry) {
      this.stopScanlineEffect();
      this.loadPalettesAndResetBgs();
      if (this.hasBlankSprite) this.palettes.load(this.flow.assets.get("titleSlash").palette, 256 + this.palettes.spritePaletteSlot("slash") * 16, 16);
      else this.createBlankSprite();
      this.setScene(Scene.Run);
      return;
    }
    [this.init, this.flashSprite, this.fadeIn, this.run, this.restart, this.cry][this.scene].call(this);
  }

  private init(): void {
    const [logo, boxArt, pressStart, border] = this.video.bgs;
    logo.visible = false;
    boxArt.visible = pressStart.visible = border.visible = true;
    this.scanline.fill(0);
    this.scanlineState = 1;
    this.setScene(Scene.FlashSprite);
  }

  /** A band of light sweeps up over Charizard. */
  private flashSprite(): void {
    switch (this.state) {
      case 0:
        setBlend(this.video, Layer.BG1, Effect.Lighten, 0);
        this.video.evy = 0;
        this.counter = 128;
        this.updateScanline(this.counter);
        this.state++;
        break;
      case 1:
        this.counter -= 4;
        this.updateScanline(this.counter);
        if (this.counter < 0) {
          this.scanlineState = 3;
          this.state++;
        }
        break;
      case 2:
        setBlend(this.video, 0, Effect.None, 0);
        this.video.evy = 0;
        this.setScene(Scene.FadeIn);
        break;
    }
  }

  /** Full brightness at line y, fading out over 16 lines on each side. */
  private updateScanline(y: number): void {
    const buf = this.scanline;
    buf.fill(0);
    if (y >= 0) buf[y] = 16;
    for (let i = 0; i < 16; i++) {
      if (y + i >= 0 && y + i < 160) buf[y + i] = 15 - i;
      if (y - i >= 0 && y - i < 160) buf[y - i] = 15 - i;
    }
  }

  private stopScanlineEffect(): void {
    if (this.scanlineState) this.scanlineState = 3;
    setBlend(this.video, 0, Effect.None, 0);
    this.video.evy = 0;
  }

  private fadeIn(): void {
    const { palettes, video, flow } = this;
    const blends = this.gba.blends;
    switch (this.state) {
      case 0:
        this.counter = 0;
        this.state++;
        break;
      case 1:
        if (++this.counter > 10) {
          // Charizard fades in from black in gray, then flashes twice before its colors return.
          tintGrayScale(palettes.unfaded, 13 * 16, 16);
          palettes.beginFade(1 << 13, 9, 16, 0, RGB_BLACK);
          this.state++;
        }
        break;
      case 2:
        if (!palettes.fadeActive) {
          this.counter = 0;
          this.state++;
        }
        break;
      case 3:
        if (++this.counter > 36) {
          this.tasks.create(slideWin0(this.flow), 3);
          blends.start(1 << 13, -4, 1, 16, WHITE_BLUE, 0, 0);
          this.counter = 0;
          this.state++;
        }
        break;
      case 4:
        if (!blends.isActive(0)) {
          blends.start(1 << 13, -4, 15, 0, WHITE_BLUE, 0, 0);
          this.state++;
        }
        break;
      case 5:
        if (++this.counter > 20) {
          this.counter = 0;
          blends.start(1 << 13, -4, 1, 16, WHITE_BLUE, 0, 0);
          this.state++;
        }
        break;
      case 6:
        if (!blends.isActive(0)) {
          blends.start(1 << 13, -4, 15, 0, WHITE_BLUE, 0, 0);
          this.state++;
        }
        break;
      case 7:
        if (++this.counter > 20) {
          this.counter = 0;
          blends.start(1 << 13, -3, 0, 16, WHITE_BLUE, 0, 0);
          this.state++;
        }
        break;
      case 8:
        if (!blends.isActive(0)) {
          this.hasBlankSprite = true;
          const mask = ((PALETTES_BG & ~(1 << 13) & ~(1 << 14) & ~(1 << 15)) | (0x10000 << this.createBlankSprite())) >>> 0;
          palettes.blendPalettes(mask, 16, WHITE_BLUE);
          palettes.beginFade(mask, 1, 16, 0, WHITE_BLUE);
          video.bgs[0].visible = true;
          palettes.unfaded.set(flow.assets.get("titleBoxArt").palette.subarray(0, 16), 13 * 16);
          blends.start(1 << 13, 1, 15, 0, WHITE_BLUE, 0, 0);
          this.state++;
        }
        break;
      case 9:
        if (!blends.isActive(0) && !palettes.fadeActive) this.setScene(Scene.Run);
        break;
    }
  }

  private createBlankSprite(): number {
    this.gba.sprites.create(BLANK_SPRITE, 24, 144, 0);
    return this.palettes.spritePaletteSlot("slash");
  }

  private loadPalettesAndResetBgs(): void {
    const { tasks, palettes, video, flow } = this;
    tasks.destroy(tasks.find(slideWin0Fn));
    this.gba.blends.destroyAll();
    palettes.resetFade();
    const { assets } = flow;
    palettes.load(assets.get("titleLogo").palette, 0, 13 * 16);
    palettes.load(assets.get("titleBoxArt").palette, 13 * 16, 16);
    palettes.load(assets.get("titleBackground").palette, 15 * 16, 16);
    palettes.load(assets.get("titleBackground").palette, 14 * 16, 16);
    resetBgPositions(this.gba);
    video.win0On = video.win1On = video.objWinOn = false;
    for (const bg of video.bgs) bg.visible = true;
  }

  private run(): void {
    const { video, gba } = this;
    if (this.state === 0) {
      gba.tasks.create(blinkPressStart(this.flow), 0);
      gba.tasks.create(flameSpawner(this.flow), 5);
      // The slash shines on the logo through the OBJ window.
      video.objWinOn = true;
      video.winOut = Layer.BG0 | Layer.BG1 | Layer.BG2 | Layer.BG3 | Layer.OBJ;
      video.winObj = Layer.ALL;
      setBlend(video, Layer.BG0, Effect.Lighten, 0);
      video.evy = 13;
      this.slash = gba.sprites.create(SLASH, -32, 27, 1);
      if (this.slash) {
        this.slash.callback = slashCallback;
        this.slash.data[SLASH_TIMER] = 540;
      }
      this.state++;
    }
    // (The save-clear and berry-fix button combinations are left out.)
    if (gba.input.isPressed(Button.A | Button.Start)) this.setScene(Scene.Cry);
    else if (!this.timerTask) this.setScene(Scene.Restart);
  }

  private slashActive(): boolean {
    return this.slash ? this.slash.data[SLASH_STATE] !== 2 : false;
  }

  private deactivateSlash(): void {
    if (this.slash) this.slash.data[SLASH_DEACTIVATE] = 1;
  }

  /** The timer ran out: fade to black, then the intro again. */
  private restart(): void {
    const { palettes, tasks, gba } = this;
    switch (this.state) {
      case 0:
        this.deactivateSlash();
        this.state++;
        break;
      case 1:
        if (!palettes.fadeActive && !this.slashActive()) {
          gba.sound.fadeOutBgm(10);
          palettes.beginFade(PALETTES_ALL, 3, 0, 16, RGB_BLACK);
          signalBlinkEnd(this.flow);
          this.state++;
        }
        break;
      case 2:
        if (gba.sound.bgmStopped && !palettes.fadeActive) {
          tasks.destroy(tasks.find(blinkPressStartFn));
          this.counter = 0;
          this.state++;
        }
        break;
      case 3:
        if (++this.counter >= 20) {
          tasks.destroy(tasks.find(blinkPressStartFn));
          this.state++;
        }
        break;
      case 4:
        this.flow.toCopyright();
        break;
    }
  }

  /** A or Start: Charizard's cry, then a fade to white into the main menu. */
  private cry(): void {
    const { palettes, gba } = this;
    switch (this.state) {
      case 0:
        if (!palettes.fadeActive) {
          this.flow.play("cry_charizard", "cry");
          this.deactivateSlash();
          this.counter = 0;
          this.state++;
        }
        break;
      case 1:
        if (this.counter < 90) this.counter++;
        else if (!this.slashActive()) {
          // OBJ palettes 12-15 keep their colors.
          palettes.beginFade((PALETTES_ALL & ~(0xf << 28)) >>> 0, 0, 0, 16, RGB_WHITE);
          signalBlinkEnd(this.flow);
          gba.sound.fadeOutBgm(4);
          this.state++;
        }
        break;
      case 2:
        if (!palettes.fadeActive) this.flow.toMainMenu();
        break;
    }
  }
}

// The logo window slides open to the right, then the "PRESS START" layer slides in from the left.
let slideWin0Fn: (task: Task) => void = () => {};

function slideWin0(flow: Flow): (task: Task) => void {
  const { video, palettes } = flow.gba;
  slideWin0Fn = (task) => {
    const d = task.data;
    switch (d[0]) {
      case 0:
        video.win0On = true;
        video.winIn0 = Layer.ALL;
        video.winOut = Layer.BG0 | Layer.BG1 | Layer.BG2 | Layer.OBJ | WIN_EFFECTS;
        Object.assign(video.win0, { left: 0, right: 0, top: 0, bottom: 160 });
        palettes.blendPalettes(1 << 14, 0, RGB_BLACK);
        d[0]++;
        break;
      case 1:
        d[1] += 24 << 4;
        d[2] = d[1] >> 4;
        if (d[2] >= WIDTH) {
          d[2] = WIDTH;
          d[0]++;
        }
        video.win0.left = 0;
        video.win0.right = d[2];
        break;
      case 2:
        if (++d[3] >= 10) {
          d[3] = 0;
          d[0]++;
        }
        break;
      case 3:
        video.winOut = Layer.BG0 | Layer.BG1 | Layer.BG3 | Layer.OBJ | WIN_EFFECTS;
        video.win0.left = video.win0.right = WIDTH;
        video.bgs[2].x = -0xf000;
        palettes.blendPalettes(1 << 15, 0, RGB_BLACK);
        d[1] = (10 * 24) << 4;
        d[0]++;
        break;
      case 4:
        d[1] -= 24 << 4;
        d[2] = d[1] >> 4;
        if (d[2] <= 0) {
          d[2] = 0;
          d[0]++;
        }
        video.bgs[2].x = -d[2] << 8;
        video.win0.left = d[2];
        video.win0.right = WIDTH;
        break;
      case 5:
        video.win0On = false;
        flow.gba.tasks.destroy(task);
        break;
    }
  };
  return slideWin0Fn;
}

// "PRESS START" blinks: palette 15 colors 1-5 swap every 60 (off) / 30 (on) frames.
let blinkPressStartFn: (task: Task) => void = () => {};

function blinkPressStart(flow: Flow): (task: Task) => void {
  const { palettes, tasks } = flow.gba;
  const colors = flow.assets.get("titleBackground").palette;
  blinkPressStartFn = (task) => {
    const d = task.data;
    // Once the end signal comes, it follows the fade until the fade is over.
    if (d[15] && palettes.fadeActive) d[14] = 1;
    if (d[14] && !palettes.fadeActive) {
      tasks.destroy(task);
      return;
    }
    d[2] = d[1] ? 30 : 60;
    if (++d[0] < d[2]) return;
    d[0] = 0;
    d[1] ^= 1;
    for (let i = 0; i < 5; i++) {
      const c = d[1] ? colors[6] : colors[1 + i];
      palettes.unfaded[15 * 16 + 1 + i] = palettes.faded[15 * 16 + 1 + i] = c;
    }
    if (d[14]) palettes.blendPalettes(1 << 15, palettes.fadeY, palettes.fadeColor);
  };
  return blinkPressStartFn;
}

function signalBlinkEnd(flow: Flow): void {
  const task = flow.gba.tasks.find(blinkPressStartFn);
  if (task) task.data[15] = 1;
}

// Flames rise from the bottom: a row of 16 every 18 frames.
function flameSpawner(flow: Flow): (task: Task) => void {
  const STATE = 0;
  const TIMER = 1;
  const DELAY = 2;
  const SEED = 3;
  const OFFSET_X = 5;
  const sprites = flow.gba.sprites;
  const rand = (task: Task) => {
    const seed = randomize(task.word(SEED));
    task.setWord(SEED, seed);
    return seed >>> 16;
  };
  const create = (x: number, y: number, xSpeed: number, ySpeed: number, flame: boolean) => {
    const s = sprites.create(flame ? FLAME : BLANK_FLAME, x, y, 0);
    if (!s) return;
    s.data[0] = x * 16;
    s.data[1] = xSpeed;
    s.data[2] = y * 16;
    s.data[3] = ySpeed;
    s.data[5] = (xSpeed * ySpeed) % 16;
    s.data[6] = flame ? 1 : 0;
    s.callback = flameCallback;
  };
  const flameCallback = (s: Sprite) => {
    const d = s.data;
    d[0] -= d[1];
    s.x = d[0] >> 4;
    if (s.x < -8) return sprites.destroy(s);
    d[2] += d[3];
    s.y = d[2] >> 4;
    if (s.y < 16 || s.y > 200 || s.animEnded) return sprites.destroy(s);
  };
  return (task) => {
    const d = task.data;
    if (d[STATE] === 0) {
      task.setWord(SEED, 30840);
      d[STATE]++;
      return;
    }
    if (++d[TIMER] < d[DELAY]) return;
    d[TIMER] = 0;
    rand(task);
    d[DELAY] = 18;
    let xSpeed = (rand(task) % 4) - 2;
    let ySpeed = (rand(task) % 8) - 16;
    const y = (rand(task) % 3) + 116;
    const x = rand(task) % WIDTH;
    create(x, y, xSpeed, ySpeed, rand(task) % 16 >= 8);
    for (const fx of FLAME_XS) {
      create(d[OFFSET_X] + fx, y, xSpeed, ySpeed, true);
      xSpeed = (rand(task) % 4) - 2;
      ySpeed = (rand(task) % 8) - 16;
    }
    if (++d[OFFSET_X] > 3) d[OFFSET_X] = 0;
  };
}

const SLASH_STATE = 0;
const SLASH_TIMER = 1;
const SLASH_DEACTIVATE = 2;

/** Every 540 frames a slash of light crosses the logo (as the OBJ window). */
function slashCallback(s: Sprite): void {
  const d = s.data;
  switch (d[SLASH_STATE]) {
    case 0:
      if (d[SLASH_DEACTIVATE]) {
        s.invisible = true;
        d[SLASH_STATE] = 2;
      }
      if (--d[SLASH_TIMER] === 0) {
        s.invisible = false;
        d[SLASH_STATE] = 1;
      }
      break;
    case 1:
      s.x += 9;
      if (s.x === 67) s.y -= 7;
      if (s.x === 148) s.y += 7;
      if (s.x > WIDTH + 32) {
        s.invisible = true;
        if (d[SLASH_DEACTIVATE]) d[SLASH_STATE] = 2;
        else {
          s.x = -32;
          d[SLASH_TIMER] = 540;
          d[SLASH_STATE] = 0;
        }
      }
      break;
  }
}
