// New Game as in FireRed: the controls guide (3 pages), the Pikachu pages, then Professor
// Oak's speech: Nidoran♀ out of its Poké Ball, BOY or GIRL, the player's name (naming
// screen), the rival's name (presets or the naming screen) and the shrink into the world.
// Behavior, timings and numbers follow FireRed; the code is our own. Nothing is saved until
// the end: the trainer goes to the server while the player shrinks, and the scene only ends
// once it is saved, going on into the world (the player's room).

import { Gender } from "@pokeuniverse/contracts/trainer/v1/trainer";
import { Button } from "../gba/input";
import { PALETTES_ALL, PALETTES_OBJ } from "../gba/palette";
import { ObjMode, type Sprite, type SpriteTemplate } from "../gba/sprites";
import type { Gba } from "../gba/gba";
import type { Task } from "../gba/tasks";
import { expandPlaceholders, FontId, PLACEHOLDER_PLAYER, PLACEHOLDER_RIVAL, Window, type Text, type WindowTemplate } from "../gba/text";
import { Effect, Layer, RGB_BLACK, RGB_WHITE, WIN_EFFECTS, type Background } from "../gba/video";
import { fillBgRect, initBg } from "./common";
import type { Flow } from "./flow";
import { setBlend } from "./intro";
import {
  clearDialogWindowAndFrame,
  clearStdWindowAndFrameToTransparent,
  createTextCursorSprite,
  CursorMenu,
  destroyTextCursorSprite,
  drawDialogueFrame,
  drawStdFrame,
  loadStdWindowFrameGfx,
  MENU_B_PRESSED,
  STANDARD_TEXT_BOX,
  TopBar,
  YesNoMenu,
} from "./menu";
import type { GraphicId } from "./manifest";
import { startNamingScreen } from "./naming-screen";
import { MON_AFFINE_ANIMS, PokeBalls } from "./pokeball";
import { s16 } from "../gba/trig";

/** Text speed MID: one character every 4 frames. */
const TEXT_SPEED = 4;

const CONTROLS_PAGES = 3;
const CONTROLS_WINDOWS: WindowTemplate[][] = [
  [{ left: 0, top: 7, width: 30, height: 4, palette: 15, baseBlock: 1 }],
  [
    { left: 6, top: 3, width: 24, height: 6, palette: 15, baseBlock: 1 },
    { left: 6, top: 10, width: 24, height: 4, palette: 15, baseBlock: 146 },
    { left: 6, top: 15, width: 24, height: 4, palette: 15, baseBlock: 243 },
  ],
  [
    { left: 6, top: 3, width: 24, height: 4, palette: 15, baseBlock: 1 },
    { left: 6, top: 8, width: 24, height: 4, palette: 15, baseBlock: 98 },
    { left: 6, top: 13, width: 24, height: 6, palette: 15, baseBlock: 195 },
  ],
];
const CONTROLS_STRINGS = [
  "gControlsGuide_Text_DPad",
  "gControlsGuide_Text_AButton",
  "gControlsGuide_Text_BButton",
  "gControlsGuide_Text_StartButton",
  "gControlsGuide_Text_SelectButton",
  "gControlsGuide_Text_LRButtons",
];

const PIKACHU_PAGES = ["gPikachuIntro_Text_Page1", "gPikachuIntro_Text_Page2", "gPikachuIntro_Text_Page3"];
const INTRO_TEXTBOX: WindowTemplate = { left: 1, top: 4, width: 28, height: 15, palette: 15, baseBlock: 1 };
const BOY_GIRL: WindowTemplate = { left: 18, top: 9, width: 9, height: 4, palette: 15, baseBlock: 372 };
const YES_NO: WindowTemplate = { left: 2, top: 2, width: 6, height: 4, palette: 15, baseBlock: 384 };
const NAMES: WindowTemplate = { left: 2, top: 2, width: 12, height: 10, palette: 15, baseBlock: 1 };

const WHITE = [0, 1, 2] as const;
const DARK_GRAY = [0, 2, 3] as const;

const MALE_NAMES = [
  "Red", "Fire", "Ash", "Kene", "Geki", "Jak", "Janne", "Jonn", "Kamon", "Karl",
  "Taylor", "Oscar", "Hiro", "Max", "Jon", "Ralph", "Kay", "Tosh", "Roak",
].map((n) => `gNameChoice_${n}`);
const FEMALE_NAMES = [
  "Red", "Fire", "Omi", "Jodi", "Amanda", "Hillary", "Makey", "Michi", "Paula",
  "June", "Cassie", "Rey", "Seda", "Kiko", "Mina", "Norie", "Sai", "Momo", "Suzi",
].map((n) => `gNameChoice_${n}`);
const RIVAL_NAMES = ["Green", "Gary", "Kaz", "Toru"].map((n) => `gNameChoice_${n}`);

const enum Pic {
  Male,
  Female,
  Rival,
  Oak,
}

const PICS: Record<Pic, { id: GraphicId; palette: number }> = {
  [Pic.Male]: { id: "picRed", palette: 4 },
  [Pic.Female]: { id: "picLeaf", palette: 4 },
  [Pic.Rival]: { id: "picRival", palette: 6 },
  [Pic.Oak]: { id: "picOak", palette: 6 },
};

/** The trainer pictures' tiles start at tile 24 of BG2's 8bpp tiles (VRAM + 0x600). */
const PIC_TILE = 24;

const platformTemplate = (image: number): SpriteTemplate => ({
  sheet: "platform",
  palette: "platform",
  width: 32,
  height: 32,
  priority: 0,
  mode: ObjMode.Blend,
  anims: [[{ image, duration: 0 }, "end"]],
});

/** The Pikachu ears and eyes follow the body's bounce (its frame index is 0 or 1). */
const followBody = (body: Sprite) => (sprite: Sprite) => {
  sprite.y2 = body.animCmdIndex;
};

const PIKACHU_BODY: SpriteTemplate = {
  sheet: "pikachuBody",
  palette: "pikachu",
  width: 32,
  height: 32,
  priority: 0,
  anims: [[{ image: 0, duration: 30 }, { image: 16, duration: 30 }, { jump: 0 }]],
};

const blink = (open: number, closed: number, openTime: number, closedTime: number, waits: number[]) =>
  waits.flatMap((n) => [...Array.from({ length: n }, () => ({ image: open, duration: openTime })), { image: closed, duration: closedTime }, { image: open, duration: closedTime }, { image: closed, duration: closedTime }]);

const PIKACHU_EARS: SpriteTemplate = {
  sheet: "pikachuEars",
  palette: "pikachu",
  width: 32,
  height: 16,
  priority: 0,
  anims: [[...blink(0, 8, 60, 12, [6, 3]), { jump: 0 }]],
};

const PIKACHU_EYES: SpriteTemplate = {
  sheet: "pikachuEyes",
  palette: "pikachu",
  width: 16,
  height: 8,
  priority: 0,
  anims: [[...blink(0, 2, 60, 8, [5, 3]), { jump: 0 }]],
};

const NIDORAN_F: SpriteTemplate = {
  sheet: "nidoranF",
  palette: "nidoranF",
  width: 64,
  height: 64,
  priority: 2,
  affineNormal: true,
  affineAnims: [...MON_AFFINE_ANIMS],
};

export function startNewGame(flow: Flow): void {
  new NewGame(flow).start();
}

/** Oak's speech state that lives through the naming screens (sOakSpeechResources). */
class NewGame {
  private readonly gba: Gba;
  private readonly balls: PokeBalls;
  private func: () => void = () => {};
  private state = 0;
  private task!: Task;

  // sOakSpeechResources
  private hasPlayerBeenNamed = false;
  private currentPage = 0;
  private windows: Window[] = [];
  private gender = Gender.BOY;
  private playerName: Text = [0xff];
  private rivalName: Text = [0xff];
  private textbox!: Window;
  private topBar!: TopBar;
  private saved: Promise<void> | null = null;

  // Task data
  private trainerPicPosX = 0;
  private trainerPicFadeState = false;
  private timer = 0;
  private spriteTimer = 0;
  private delta = 0;
  private blendTarget = 0;
  private nameNotConfirmed = false;
  private nidoranF: Sprite | null = null;
  private pokeBall: Sprite | null = null;
  private textCursor: Sprite | null = null;
  private pikachuOrPlatform: (Sprite | null)[] = [];
  private menu: CursorMenu | null = null;
  private yesNo: YesNoMenu | null = null;
  private introTextbox!: Window;

  constructor(private readonly flow: Flow) {
    this.gba = flow.gba;
    this.balls = new PokeBalls(flow);
  }

  private get bg0() {
    return this.gba.video.bgs[0];
  }

  private get bg1() {
    return this.gba.video.bgs[1];
  }

  private get bg2() {
    return this.gba.video.bgs[2];
  }

  private go(func: () => void): void {
    this.func = func;
  }

  private text(id: string): Text {
    return this.flow.assets.text(id);
  }

  /** StartNewGameScene: the scene task, set up frame by frame (Task_NewGameScene). */
  start(): void {
    const { gba } = this;
    gba.palettes.unfaded[0] = gba.palettes.faded[0] = RGB_BLACK;
    gba.tasks.reset();
    this.task = gba.tasks.create(() => this.func(), 0);
    this.func = () => this.setUp();
    gba.setMain(this.flow.runFrame);
  }

  private setUp(): void {
    const { gba, flow } = this;
    const { video, palettes } = gba;
    switch (this.state) {
      case 0:
        gba.setVBlank(null);
        video.reset();
        video.palette.fill(0, 1);
        palettes.resetFade();
        gba.sprites.reset();
        palettes.freeSpritePalettes();
        break;
      case 2:
        video.resetBlend();
        break;
      case 3:
        this.initBgs();
        break;
      case 4:
        this.initTextBox();
        palettes.load(flow.assets.get("stdMenuPal").palette, 13 * 16, 10);
        palettes.load(flow.assets.get("oakBgTiles").palette, 0, 64);
        palettes.load([flow.assets.get("textWindowPal2").palette[15]], 0, 1);
        break;
      case 5:
        flow.text.ctx.canABSpeedUpPrint = true;
        this.bg1.tiles = flow.assets.get("oakBgTiles").tiles.slice();
        break;
      case 6:
        clearDialogWindowAndFrame(this.textbox);
        fillBgRect(this.bg1, 0, 0, 0, 32, 32, 0);
        break;
      case 7:
        this.topBar = new TopBar(flow, this.bg0, 30, 0, 13, 0x1c4);
        fillRaw(this.bg1, 0xd00f, 0, 0, 30, 2);
        fillRaw(this.bg1, 0xd002, 0, 2, 30, 1);
        fillRaw(this.bg1, 0xd00e, 0, 19, 30, 1);
        this.controlsGuideLoadPage1();
        this.textCursor = createTextCursorSprite(flow, 230, 149, 0, 0);
        palettes.blendPalettes(PALETTES_ALL, 16, RGB_BLACK);
        break;
      case 10:
        palettes.beginFade(PALETTES_ALL, 0, 16, 0, RGB_BLACK);
        video.objOn = true;
        this.bg0.visible = this.bg1.visible = true;
        gba.setVBlank(gba.standardVBlank);
        flow.playBgm("mus_new_game_instruct");
        this.state = 0;
        this.go(() => this.controlsGuideHandleInput());
        return;
    }
    this.state++;
  }

  /** The scene's backgrounds: BG0 text (windows), BG1 the backdrop, BG2 the trainer pictures (affine, 8bpp). */
  private initBgs(): void {
    initBg(this.bg0, 0, 0);
    initBg(this.bg1, 0, 2);
    const bg2 = this.bg2;
    bg2.reset();
    bg2.affine = true;
    initBg(bg2, 1, 1, true);
    bg2.map = new Uint16Array(32 * 32);
    this.gba.sprites.coordOffsetX = this.gba.sprites.coordOffsetY = 0;
  }

  /** InitStandardTextBoxWindows + InitTextBoxGfxAndPrinters. */
  private initTextBox(): void {
    this.bg0.tiles = new Uint8Array(0x21d * 64);
    this.textbox = new Window(this.bg0, STANDARD_TEXT_BOX);
    this.flow.text.reset();
    loadStdWindowFrameGfx(this.flow, this.bg0);
  }

  // Controls guide

  private controlsGuideLoadPage1(): void {
    this.topBar.printTwo(this.text("gText_Controls"), this.text("gText_ABUTTONNext"));
    const win = new Window(this.bg0, CONTROLS_WINDOWS[0][0]);
    this.windows = [win];
    win.putTilemap();
    win.fill(0);
    win.print(this.flow.fonts[FontId.Normal], 2, 0, WHITE, this.text("gControlsGuide_Text_Intro"), 1, 1);
    win.copyToVram();
    fillRaw(this.bg1, 0x3000, 1, 3, 5, 16);
  }

  private controlsGuideLoadPage(): void {
    const { flow } = this;
    if (this.currentPage === 0) this.controlsGuideLoadPage1();
    else {
      this.topBar.print(this.text("gText_ABUTTONNext_BBUTTONBack"));
      this.windows = CONTROLS_WINDOWS[this.currentPage].map((template, i) => {
        const win = new Window(this.bg0, template);
        win.putTilemap();
        win.fill(0);
        win.print(flow.fonts[FontId.Normal], 6, 0, WHITE, this.text(CONTROLS_STRINGS[i + (this.currentPage - 1) * 3]), 1, 1);
        win.copyToVram();
        return win;
      });
      const map = flow.assets.get(this.currentPage === 1 ? "controlsPage2" : "controlsPage3").map!;
      copyRect(this.bg1, map, 1, 3, 5, 16);
    }
    this.gba.palettes.beginFade(PALETTES_OBJ | 0xdfff, -1, 16, 0, this.flow.assets.get("textWindowPal2").palette[15]);
    this.go(() => this.controlsGuideHandleInput());
  }

  private controlsGuideHandleInput(): void {
    const { input, palettes } = this.gba;
    if (palettes.fadeActive || !input.isPressed(Button.A | Button.B)) return;
    const color = this.flow.assets.get("textWindowPal2").palette[15];
    if (input.isPressed(Button.A)) {
      this.delta = 1;
      if (this.currentPage < CONTROLS_PAGES - 1) palettes.beginFade(PALETTES_OBJ | 0xdfff, -1, 0, 16, color);
    } else {
      if (this.currentPage === 0) return;
      this.delta = -1;
      palettes.beginFade(PALETTES_OBJ | 0xdfff, -1, 0, 16, color);
    }
    this.flow.play("se_select");
    this.go(() => this.controlsGuideChangePage());
  }

  private controlsGuideChangePage(): void {
    if (this.gba.palettes.fadeActive) return;
    this.currentPage += this.delta;
    if (this.currentPage < CONTROLS_PAGES) {
      this.removeWindows();
      this.go(() => this.controlsGuideLoadPage());
    } else {
      this.gba.palettes.beginFade(PALETTES_ALL, 2, 0, 16, 0);
      this.go(() => this.controlsGuideClear());
    }
  }

  private removeWindows(): void {
    for (const win of this.windows) {
      win.fill(0);
      win.clearTilemap();
      win.copyToVram();
    }
    this.windows = [];
  }

  private controlsGuideClear(): void {
    if (this.gba.palettes.fadeActive) return;
    this.removeWindows();
    fillBgRect(this.bg1, 0, 0, 2, 30, 18, 0);
    destroyTextCursorSprite(this.flow, this.textCursor);
    this.gba.palettes.load([RGB_BLACK], 0, 1);
    this.timer = 32;
    this.go(() => this.pikachuIntroLoadPage1());
  }

  // Pikachu intro

  private pikachuIntroLoadPage1(): void {
    if (this.timer) {
      this.timer--;
      return;
    }
    const { flow } = this;
    flow.playBgm("mus_new_game_intro");
    this.topBar.clear();
    this.topBar.print(this.text("gText_ABUTTONNext"));
    copyRect(this.bg1, flow.assets.get("pikachuIntroMap").map!, 0, 2, 30, 19);
    this.introTextbox = new Window(this.bg0, INTRO_TEXTBOX);
    this.introTextbox.putTilemap();
    this.introTextbox.fill(0);
    this.introTextbox.copyToVram();
    this.currentPage = 0;
    this.state = 0;
    this.blendTarget = 16;
    this.printPikachuPage();
    this.textCursor = createTextCursorSprite(flow, 226, 145, 0, 0);
    if (this.textCursor) {
      this.textCursor.mode = ObjMode.Blend;
      this.textCursor.priority = 0;
    }
    this.createPikachuOrPlatformSprites(true);
    this.gba.palettes.beginFade(PALETTES_ALL, 2, 16, 0, 0);
    this.go(() => this.pikachuIntroHandleInput());
  }

  private printPikachuPage(): void {
    this.introTextbox.print(this.flow.fonts[FontId.Normal], 3, 5, DARK_GRAY, this.text(PIKACHU_PAGES[this.currentPage]), 1, 0);
    this.introTextbox.copyToVram();
  }

  private pikachuIntroHandleInput(): void {
    const { video, palettes, input } = this.gba;
    switch (this.state) {
      case 0:
        if (!palettes.fadeActive) {
          Object.assign(video.win0, { left: 0, right: 240, top: 16, bottom: 160 });
          video.winIn0 = Layer.BG0 | Layer.BG1 | Layer.BG2 | Layer.BG3 | WIN_EFFECTS | Layer.OBJ;
          video.winOut = Layer.BG0 | Layer.BG1 | Layer.BG2 | Layer.BG3 | Layer.OBJ;
          video.win0On = true;
          this.state = 1;
        }
        break;
      case 1:
        if (!input.isPressed(Button.A | Button.B)) break;
        if (input.isPressed(Button.A)) this.currentPage++;
        else if (this.currentPage !== 0) this.currentPage--;
        else break;
        this.flow.play("se_select");
        if (this.currentPage === PIKACHU_PAGES.length) this.state = 4;
        else {
          setBlend(video, Layer.BG0, Effect.Blend, Layer.BG1);
          // BLDALPHA = (16 - target) | target: EVA 16, EVB 0.
          video.eva = (16 - this.blendTarget) | this.blendTarget;
          video.evb = 0;
          this.state++;
        }
        break;
      case 2:
        this.blendTarget -= 2;
        video.eva = this.blendTarget;
        video.evb = 16 - this.blendTarget;
        if (this.blendTarget <= 0) {
          this.introTextbox.fill(0);
          this.printPikachuPage();
          this.topBar.clear();
          this.topBar.print(this.text(this.currentPage === 0 ? "gText_ABUTTONNext" : "gText_ABUTTONNext_BBUTTONBack"));
          this.state++;
        }
        break;
      case 3:
        this.blendTarget += 2;
        video.eva = this.blendTarget;
        video.evb = 16 - this.blendTarget;
        if (this.blendTarget >= 16) {
          this.blendTarget = 16;
          setBlend(video, 0, Effect.None, 0);
          video.eva = video.evb = 0;
          this.state = 1;
        }
        break;
      case 4:
        destroyTextCursorSprite(this.flow, this.textCursor);
        this.flow.playBgm("mus_new_game_exit");
        this.blendTarget = 24;
        this.state++;
        break;
      default:
        if (this.blendTarget) this.blendTarget--;
        else {
          this.state = 0;
          this.currentPage = 0;
          Object.assign(video.win0, { left: 0, right: 0, top: 0, bottom: 0 });
          video.winIn0 = video.winOut = 0;
          video.win0On = false;
          palettes.beginFade(PALETTES_ALL, 2, 0, 16, RGB_BLACK);
          this.go(() => this.pikachuIntroClear());
        }
    }
  }

  private pikachuIntroClear(): void {
    if (this.gba.palettes.fadeActive) return;
    this.topBar.destroy();
    this.introTextbox.fill(0);
    this.introTextbox.clearTilemap();
    this.introTextbox.copyToVram();
    fillBgRect(this.bg1, 0, 0, 0, 30, 20, 0);
    this.destroyPikachuOrPlatformSprites(true);
    this.timer = 80;
    this.go(() => this.oakSpeechInit());
  }

  // Oak's speech

  private oakSpeechInit(): void {
    if (this.timer) {
      this.timer--;
      return;
    }
    const bg = this.flow.assets.get("oakSpeechBg");
    this.bg1.tiles = bg.tiles.slice();
    copyRect(this.bg1, bg.map!, 0, 0, 32, 20);
    this.createNidoranFSprite();
    this.loadTrainerPic(Pic.Oak);
    this.createPikachuOrPlatformSprites(false);
    this.flow.playBgm("mus_route24");
    this.gba.palettes.beginFade(PALETTES_ALL, 5, 16, 0, RGB_BLACK);
    this.timer = 80;
    this.bg2.visible = true;
    this.go(() => this.welcomeToTheWorld());
  }

  /** OakSpeechPrintMessage: the dialogue box, then the text letter by letter in Oak's font. */
  private printMessage(text: Text, speed = TEXT_SPEED): void {
    drawDialogueFrame(this.textbox);
    const expanded = expandPlaceholders(text, { [PLACEHOLDER_PLAYER]: this.playerName, [PLACEHOLDER_RIVAL]: this.rivalName });
    this.flow.text.add(this.textbox, { font: this.flow.fonts[FontId.Male], x: 0, y: 1, letterSpacing: 1, lineSpacing: 1, colors: [1, 2, 3] }, speed, expanded);
    this.textbox.copyToVram();
  }

  private get printing(): boolean {
    return this.flow.text.isActive(this.textbox);
  }

  private welcomeToTheWorld(): void {
    if (this.gba.palettes.fadeActive) return;
    if (this.timer) this.timer--;
    else {
      this.printMessage(this.text("gOakSpeech_Text_WelcomeToTheWorld"));
      this.go(() => this.thisWorld());
    }
  }

  private thisWorld(): void {
    if (this.printing) return;
    this.printMessage(this.text("gOakSpeech_Text_ThisWorld"));
    this.timer = 30;
    this.go(() => this.releaseNidoranF());
  }

  private releaseNidoranF(): void {
    if (this.printing) return;
    if (this.timer) this.timer--;
    const mon = this.nidoranF!;
    mon.invisible = false;
    mon.data[0] = 0;
    this.balls.release(mon, 100, 66, 0, 0, 32, 0xffff1fff);
    this.go(() => this.isInhabitedFarAndWide());
    this.timer = 0;
  }

  private isInhabitedFarAndWide(): void {
    if (!this.gba.sound.isPlaying("cry") && this.timer >= 96) this.go(() => this.iStudyPokemon());
    if (this.timer < 0x4000) {
      this.timer++;
      if (this.timer === 32) {
        this.printMessage(this.text("gOakSpeech_Text_IsInhabitedFarAndWide"));
        this.flow.play("cry_nidoran_f", "cry");
      }
    }
  }

  private iStudyPokemon(): void {
    if (this.printing) return;
    this.printMessage(this.text("gOakSpeech_Text_IStudyPokemon"));
    this.go(() => this.returnNidoranFToPokeBall());
  }

  private returnNidoranFToPokeBall(): void {
    if (this.printing) return;
    clearDialogWindowAndFrame(this.textbox);
    this.pokeBall = this.balls.takeBack(this.nidoranF!, 100, 66, 0, 0, 32, 0xffff1f3f);
    this.timer = 48;
    this.spriteTimer = 64;
    this.go(() => this.tellMeALittleAboutYourself());
  }

  private tellMeALittleAboutYourself(): void {
    if (this.spriteTimer) {
      if (this.spriteTimer < 24) this.nidoranF!.y--;
      this.spriteTimer--;
      return;
    }
    if (this.timer === 48) {
      this.gba.sprites.destroy(this.nidoranF);
      this.gba.sprites.destroy(this.pokeBall);
    }
    if (this.timer) this.timer--;
    else {
      this.printMessage(this.text("gOakSpeech_Text_TellMeALittleAboutYourself"));
      this.go(() => this.fadeOutOak());
    }
  }

  private fadeOutOak(): void {
    if (this.printing) return;
    clearDialogWindowAndFrame(this.textbox);
    this.createFadeInTask(2);
    this.timer = 48;
    this.go(() => this.askPlayerGender());
  }

  private askPlayerGender(): void {
    if (!this.trainerPicFadeState) return;
    if (this.timer) this.timer--;
    else {
      this.trainerPicPosX = -60;
      this.clearTrainerPic();
      this.printMessage(this.text("gOakSpeech_Text_AskPlayerGender"));
      this.go(() => this.showGenderOptions());
    }
  }

  private showGenderOptions(): void {
    if (this.printing) return;
    const { flow } = this;
    const win = new Window(this.bg0, BOY_GIRL);
    win.putTilemap();
    drawStdFrame(win);
    win.fill(1);
    const font = flow.fonts[FontId.Normal];
    win.print(font, 8, 1, [1, 2, 3], this.text("gText_Boy"));
    win.print(font, 8, 17, [1, 2, 3], this.text("gText_Girl"));
    this.menu = new CursorMenu(flow, win, FontId.Normal, 0, 1, font.maxLetterHeight + 2, 2, 0);
    win.copyToVram();
    this.go(() => this.handleGenderInput());
  }

  private handleGenderInput(): void {
    const input = this.menu!.processInput(false);
    if (input === 0) this.gender = Gender.BOY;
    else if (input === 1) this.gender = Gender.GIRL;
    else return;
    this.go(() => this.clearGenderWindows());
  }

  private clearGenderWindows(): void {
    clearStdWindowAndFrameToTransparent(this.menu!.win);
    this.menu = null;
    clearDialogWindowAndFrame(this.textbox);
    fillBgRect(this.bg0, 0, 0, 0, 30, 20, 0);
    this.go(() => this.loadPlayerPic());
  }

  private loadPlayerPic(): void {
    this.loadTrainerPic(this.gender === Gender.BOY ? Pic.Male : Pic.Female);
    this.createFadeOutTask(2);
    this.timer = 32;
    this.go(() => this.yourNameWhatIsIt());
  }

  private yourNameWhatIsIt(): void {
    if (!this.trainerPicFadeState) return;
    if (this.timer) this.timer--;
    else {
      this.trainerPicPosX = 0;
      this.printMessage(this.text("gOakSpeech_Text_YourNameWhatIsIt"));
      this.go(() => this.fadeOutForPlayerNamingScreen());
    }
  }

  private fadeOutForPlayerNamingScreen(): void {
    if (this.printing) return;
    this.gba.palettes.beginFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
    this.hasPlayerBeenNamed = false;
    this.go(() => this.doNamingScreen());
  }

  private moveRivalDisplayNameOptions(): void {
    if (this.printing) return;
    if (this.trainerPicPosX > -60) {
      this.trainerPicPosX -= 2;
      this.gba.sprites.coordOffsetX += 2;
      this.bg2.x -= 0x200;
    } else {
      this.trainerPicPosX = -60;
      this.printNameChoiceOptions();
      this.go(() => this.handleRivalNameInput());
    }
  }

  private repeatNameQuestion(): void {
    this.printNameChoiceOptions();
    this.printMessage(this.text(this.hasPlayerBeenNamed ? "gOakSpeech_Text_YourRivalsNameWhatWasIt" : "gOakSpeech_Text_YourNameWhatIsIt"), 0);
    this.go(() => this.handleRivalNameInput());
  }

  private handleRivalNameInput(): void {
    const input = this.menu!.processInput(true);
    if (input === 0) {
      this.flow.play("se_select");
      this.gba.palettes.beginFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
      this.go(() => this.doNamingScreen());
    } else if (input >= 1 && input <= 4) {
      this.flow.play("se_select");
      clearStdWindowAndFrameToTransparent(this.menu!.win);
      this.menu = null;
      this.setDefaultName(input - 1);
      this.nameNotConfirmed = true;
      this.go(() => this.confirmName());
    }
  }

  private doNamingScreen(): void {
    if (this.gba.palettes.fadeActive) return;
    this.setDefaultName(0);
    if (this.hasPlayerBeenNamed && this.menu) {
      clearStdWindowAndFrameToTransparent(this.menu.win);
      this.menu = null;
    }
    this.destroyPikachuOrPlatformSprites(false);
    const rival = this.hasPlayerBeenNamed;
    startNamingScreen(this.flow, rival ? "rival" : "player", this.gender, (name) => {
      if (name) {
        if (rival) this.rivalName = name;
        else this.playerName = name;
      }
      this.returnFromNamingScreen();
    });
  }

  private confirmName(): void {
    if (this.gba.palettes.fadeActive) return;
    if (this.nameNotConfirmed) {
      this.printMessage(this.text(this.hasPlayerBeenNamed ? "gOakSpeech_Text_ConfirmRivalName" : "gOakSpeech_Text_SoYourNameIsPlayer"));
      this.nameNotConfirmed = false;
      this.timer = 25;
    } else if (!this.printing) {
      if (this.timer) this.timer--;
      else {
        this.yesNo = new YesNoMenu(this.flow, this.bg0, YES_NO, FontId.Normal, 0, 2, 0);
        this.go(() => this.handleConfirmNameInput());
      }
    }
  }

  private handleConfirmNameInput(): void {
    const input = this.yesNo!.processInput();
    if (input === 0) {
      this.flow.play("se_select");
      this.timer = 40;
      if (!this.hasPlayerBeenNamed) {
        clearDialogWindowAndFrame(this.textbox);
        this.createFadeInTask(2);
        this.go(() => this.fadeOutPlayerPic());
      } else {
        this.printMessage(this.text("gOakSpeech_Text_RememberRivalsName"));
        this.go(() => this.fadeOutRivalPic());
      }
    } else if (input === 1 || input === MENU_B_PRESSED) {
      this.flow.play("se_select");
      if (this.hasPlayerBeenNamed) this.go(() => this.repeatNameQuestion());
      else this.go(() => this.fadeOutForPlayerNamingScreen());
    }
  }

  private fadeOutPlayerPic(): void {
    if (!this.trainerPicFadeState) return;
    this.clearTrainerPic();
    if (this.timer) this.timer--;
    else this.go(() => this.fadeInRivalPic());
  }

  private fadeOutRivalPic(): void {
    if (this.printing) return;
    clearDialogWindowAndFrame(this.textbox);
    this.createFadeInTask(2);
    this.go(() => this.reshowPlayersPic());
  }

  private fadeInRivalPic(): void {
    this.bg2.x = 0;
    this.trainerPicPosX = 0;
    this.gba.sprites.coordOffsetX = 0;
    this.loadTrainerPic(Pic.Rival);
    this.createFadeOutTask(2);
    this.go(() => this.askRivalsName());
  }

  private askRivalsName(): void {
    if (!this.trainerPicFadeState) return;
    this.printMessage(this.text("gOakSpeech_Text_WhatWasHisName"));
    this.hasPlayerBeenNamed = true;
    this.go(() => this.moveRivalDisplayNameOptions());
  }

  private reshowPlayersPic(): void {
    if (!this.trainerPicFadeState) return;
    this.clearTrainerPic();
    if (this.timer) this.timer--;
    else {
      this.loadTrainerPic(this.gender === Gender.BOY ? Pic.Male : Pic.Female);
      this.trainerPicPosX = 0;
      this.gba.sprites.coordOffsetX = 0;
      this.bg2.x = 0;
      this.createFadeOutTask(2);
      this.go(() => this.letsGo());
    }
  }

  private letsGo(): void {
    if (!this.trainerPicFadeState) return;
    this.printMessage(this.text("gOakSpeech_Text_LetsGo"));
    this.timer = 30;
    this.go(() => this.fadeOutBgm());
  }

  private fadeOutBgm(): void {
    if (this.printing) return;
    if (this.timer) this.timer--;
    else {
      this.gba.sound.fadeOutBgm(4);
      this.go(() => this.setUpExitAnimation());
    }
  }

  // The exit: the player's picture shrinks and flashes white, everything fades to black.

  private setUpExitAnimation(): void {
    // Everything is decided: the trainer is saved while the exit plays.
    this.saved = this.flow.saveTrainer({ gender: this.gender, name: this.playerName, rivalName: this.rivalName });
    this.currentPage = 0;
    this.setUpDestroyPlatformSprites();
    this.setUpFadePlayerPicWhite();
    this.setUpShrinkPlayerPic();
  }

  private setUpShrinkPlayerPic(): void {
    // The game also turns BG2's wraparound on here, but only in its BG config: BGCNT is written
    // by ShowBg, which never runs again, so the shrunk picture doesn't repeat around the screen.
    this.task.data[0] = 0;
    this.task.data[2] = 256;
    this.go(() => this.shrinkPlayerPic());
  }

  private shrinkPlayerPic(): void {
    const d = this.task.data;
    this.currentPage++;
    if (this.currentPage % 20 !== 0) return;
    if (this.currentPage === 40) this.flow.play("se_warp_in");
    const old = d[2] & 0xffff;
    d[2] -= 32;
    // Q_8_8_inv: 1 / scale in 8.8.
    const x = s16(Math.trunc(0x10000 / (old - 8)));
    const y = s16(Math.trunc(0x10000 / ((d[2] & 0xffff) - 16)));
    this.bg2.setAffine(0x7800, 0x5400, 120, 84, x, y);
    if (d[2] <= 96) {
      d[0] = 36;
      this.go(() => this.fadePlayerPicToBlack());
    }
  }

  private setUpDestroyPlatformSprites(): void {
    const { gba } = this;
    let bgFadeStarted = false;
    gba.tasks.create((task) => {
      if (gba.palettes.fadeActive) return;
      if (bgFadeStarted) {
        gba.tasks.destroy(task);
        // As in the game, this only destroys sprite 0 (the left platform): the task never
        // got the platforms' sprite ids.
        gba.sprites.destroy(gba.sprites.slots[0]);
      } else {
        bgFadeStarted = true;
        gba.palettes.beginFade(0xf000, 0, 0, 16, RGB_BLACK);
      }
    }, 1);
    gba.palettes.beginFade(PALETTES_OBJ | 0x0fcf, 4, 0, 16, RGB_BLACK);
  }

  private setUpFadePlayerPicWhite(): void {
    const { palettes, tasks } = this.gba;
    let timer = 8;
    let underflowing = 0;
    let secondary = 8;
    let coeff = 0;
    tasks.create((task) => {
      if (timer) {
        timer--;
        return;
      }
      if (underflowing <= 0 && secondary) secondary--;
      palettes.blendPalette(64, 32, coeff, RGB_WHITE);
      coeff++;
      underflowing--;
      timer = secondary;
      if (coeff > 14) {
        palettes.fill(RGB_WHITE, 64, 32);
        tasks.destroy(task);
      }
    }, 2);
  }

  private fadePlayerPicToBlack(): void {
    const d = this.task.data;
    if (d[0]) d[0]--;
    else {
      this.gba.palettes.beginFade(0x0030, 2, 0, 16, RGB_BLACK);
      this.go(() => this.waitForFade());
    }
  }

  private waitForFade(): void {
    if (this.gba.palettes.fadeActive) return;
    this.go(() => {});
    // CB2_NewGame: into the world, where the server put the new trainer.
    void this.saved!.then(() => {
      this.flow.text.ctx.canABSpeedUpPrint = false;
      this.gba.tasks.destroy(this.task);
      this.flow.toOverworld();
    });
  }

  // Back from the naming screen (CB2_ReturnFromNamingScreen): the scene is rebuilt.

  private returnFromNamingScreen(): void {
    const { gba, flow } = this;
    const { video, palettes } = gba;
    gba.setMain(() => {
      switch (gba.state) {
        case 0:
          gba.setVBlank(null);
          video.reset();
          video.palette.fill(RGB_BLACK);
          palettes.resetFade();
          gba.sprites.reset();
          palettes.freeSpritePalettes();
          break;
        case 1:
          this.initBgs();
          break;
        case 2:
          Object.assign(video.win0, { left: 0, right: 0, top: 0, bottom: 0 });
          video.winIn0 = video.winOut = 0;
          video.resetBlend();
          break;
        case 3:
          this.initTextBox();
          palettes.load(flow.assets.get("oakBgTiles").palette, 0, 64);
          break;
        case 4:
          this.bg1.tiles = flow.assets.get("oakSpeechBg").tiles.slice();
          break;
        case 5:
          fillBgRect(this.bg1, 0, 0, 0, 30, 20, 0);
          copyRect(this.bg1, flow.assets.get("oakSpeechBg").map!, 0, 0, 32, 20);
          this.bg2.map.fill(0);
          break;
        case 6:
          gba.tasks.reset();
          this.resetTaskData();
          this.task = gba.tasks.create(() => this.func(), 0);
          this.go(() => this.confirmName());
          this.loadTrainerPic(this.hasPlayerBeenNamed ? Pic.Rival : this.gender === Gender.BOY ? Pic.Male : Pic.Female);
          this.trainerPicPosX = -60;
          gba.sprites.coordOffsetX += 60;
          this.bg2.x = -0x3c00;
          this.createPikachuOrPlatformSprites(false);
          this.nameNotConfirmed = true;
          break;
        case 7:
          palettes.beginFade(PALETTES_ALL, 0, 16, 0, RGB_BLACK);
          video.objOn = true;
          this.bg0.visible = this.bg1.visible = this.bg2.visible = true;
          gba.setVBlank(gba.standardVBlank);
          flow.text.ctx.canABSpeedUpPrint = true;
          gba.setMain(flow.runFrame);
          return;
      }
      gba.state++;
    });
  }

  /** The naming screen ran its own tasks: the scene's task starts again from zero. */
  private resetTaskData(): void {
    this.trainerPicPosX = this.timer = this.spriteTimer = this.delta = this.blendTarget = 0;
    this.trainerPicFadeState = this.nameNotConfirmed = false;
    this.nidoranF = this.pokeBall = this.textCursor = null;
    this.pikachuOrPlatform = [];
    this.menu = null;
    this.yesNo = null;
  }

  // Pictures and sprites

  private createNidoranFSprite(): void {
    const { gba, assets } = this.flow;
    const pic = assets.get("nidoranF");
    gba.sprites.loadSheet("nidoranF", pic.tiles);
    gba.palettes.loadSpritePalette("nidoranF", pic.palette);
    const sprite = gba.sprites.create(NIDORAN_F, 96, 96, 1)!;
    sprite.priority = 1;
    sprite.invisible = true;
    this.nidoranF = sprite;
  }

  private createPikachuOrPlatformSprites(pikachu: boolean): void {
    const { gba, assets } = this.flow;
    const { sprites, palettes } = gba;
    if (pikachu) {
      sprites.loadSheet("pikachuBody", assets.get("pikachuBody").tiles);
      sprites.loadSheet("pikachuEars", assets.get("pikachuEars").tiles);
      sprites.loadSheet("pikachuEyes", assets.get("pikachuEyes").tiles);
      palettes.loadSpritePalette("pikachu", assets.get("pikachuPal").palette);
      const body = sprites.create(PIKACHU_BODY, 16, 17, 2)!;
      body.priority = 0;
      const ears = sprites.create({ ...PIKACHU_EARS, callback: followBody(body) }, 16, 9, 3)!;
      ears.priority = 0;
      const eyes = sprites.create({ ...PIKACHU_EYES, callback: followBody(body) }, 24, 13, 1)!;
      eyes.priority = 0;
      this.pikachuOrPlatform = [body, ears, eyes];
    } else {
      const platform = assets.get("platform");
      sprites.loadSheet("platform", platform.tiles);
      palettes.loadSpritePalette("platform", platform.palette);
      this.pikachuOrPlatform = [0, 16, 32].map((image, i) => {
        const s = sprites.create(platformTemplate(image), i * 32 + 88, 112, 1)!;
        s.priority = 2;
        s.animPaused = true;
        s.coordOffsetEnabled = true;
        return s;
      });
    }
  }

  private destroyPikachuOrPlatformSprites(pikachu: boolean): void {
    const { sprites, palettes } = this.gba;
    for (const s of this.pikachuOrPlatform) sprites.destroy(s);
    this.pikachuOrPlatform = [];
    if (pikachu) {
      for (const tag of ["pikachuEyes", "pikachuEars", "pikachuBody"]) sprites.freeSheet(tag);
      palettes.freeSpritePalette("pikachu");
    } else {
      sprites.freeSheet("platform");
      palettes.freeSpritePalette("platform");
    }
  }

  /** LoadTrainerPic: its palette, its tiles after tile 24 of BG2, and its 8×12 tiles at (11, 2). */
  private loadTrainerPic(which: Pic): void {
    const { id, palette } = PICS[which];
    const pic = this.flow.assets.get(id);
    this.gba.palettes.load(pic.palette, palette * 16, 32);
    const tiles = new Uint8Array((PIC_TILE + 96) * 64);
    tiles.set(pic.tiles.subarray(0, 96 * 64), PIC_TILE * 64);
    this.bg2.tiles = tiles;
    this.bg2.map.fill(0);
    for (let i = 0; i < 0x60; i++) this.bg2.setEntry(11 + (i % 8), 2 + Math.floor(i / 8), PIC_TILE + i);
  }

  /** ClearTrainerPic: as in the game, it clears rows 1 to 12, one row above the picture's top. */
  private clearTrainerPic(): void {
    for (let y = 1; y < 13; y++) for (let x = 11; x < 19; x++) this.bg2.setEntry(x, y, 0);
  }

  private printNameChoiceOptions(): void {
    const { flow } = this;
    const win = new Window(this.bg0, NAMES);
    win.putTilemap();
    drawStdFrame(win);
    win.fill(1);
    const font = flow.fonts[FontId.Normal];
    win.print(font, 8, 1, [1, 2, 3], this.text("gOtherText_NewName"));
    const choices = this.hasPlayerBeenNamed ? RIVAL_NAMES : this.gender === Gender.BOY ? MALE_NAMES : FEMALE_NAMES;
    for (let i = 0; i < RIVAL_NAMES.length; i++) win.print(font, 8, 16 * (i + 1) + 1, [1, 2, 3], this.text(choices[i]));
    this.menu = new CursorMenu(flow, win, FontId.Normal, 0, 1, 16, 5, 0);
    win.copyToVram();
  }

  /** GetDefaultName: a random preset for the player, the chosen preset for the rival. */
  private setDefaultName(choice: number): void {
    if (!this.hasPlayerBeenNamed) {
      const names = this.gender === Gender.BOY ? MALE_NAMES : FEMALE_NAMES;
      this.playerName = this.text(names[Math.floor(Math.random() * names.length)]);
    } else this.rivalName = this.text(RIVAL_NAMES[choice]);
  }

  /** CreateFadeInTask: the trainer picture fades out over BG1 (the game's name); platforms hide halfway. */
  private createFadeInTask(delay: number): void {
    const { video, tasks } = this.gba;
    setBlend(video, Layer.BG2, Effect.Blend, Layer.BG1 | Layer.OBJ);
    video.eva = 16;
    video.evb = 0;
    video.evy = 0;
    this.trainerPicFadeState = false;
    const platforms = this.pikachuOrPlatform;
    let target1 = 16;
    let target2 = 0;
    let fadeTimer = delay;
    tasks.create((task) => {
      if (target1 === 0) {
        this.trainerPicFadeState = true;
        tasks.destroy(task);
        for (const s of platforms) if (s) s.invisible = true;
        return;
      }
      if (fadeTimer) {
        fadeTimer--;
        return;
      }
      fadeTimer = delay;
      target1--;
      target2++;
      if (target1 === 8) for (const s of platforms) if (s) s.invisible = !s.invisible;
      video.eva = target1;
      video.evb = target2;
    }, 0);
  }

  /** CreateFadeOutTask: the trainer picture fades in over BG1; platforms show halfway. */
  private createFadeOutTask(delay: number): void {
    const { video, tasks, palettes } = this.gba;
    setBlend(video, Layer.BG2, Effect.Blend, Layer.BG1 | Layer.OBJ);
    video.eva = 0;
    video.evb = 16;
    video.evy = 0;
    this.trainerPicFadeState = false;
    const platforms = this.pikachuOrPlatform;
    let target1 = 0;
    let target2 = 16;
    let fadeTimer = delay;
    tasks.create((task) => {
      if (target1 === 16) {
        if (!palettes.fadeActive) {
          this.trainerPicFadeState = true;
          tasks.destroy(task);
        }
        return;
      }
      if (fadeTimer) {
        fadeTimer--;
        return;
      }
      fadeTimer = delay;
      target1 += 2;
      target2 -= 2;
      if (target1 === 8) for (const s of platforms) if (s) s.invisible = !s.invisible;
      video.eva = target1;
      video.evb = target2;
    }, 0);
  }
}

/** FillBgTilemapBufferRect_Palette0: raw tilemap entries (tile, flips and palette). */
function fillRaw(bg: Background, entry: number, left: number, top: number, width: number, height: number): void {
  for (let y = top; y < top + height; y++) for (let x = left; x < left + width; x++) bg.setEntry(x, y, entry);
}

/** CopyToBgTilemapBufferRect: a width×height block of entries at (left, top); missing entries are 0. */
function copyRect(bg: Background, map: Uint16Array, left: number, top: number, width: number, height: number): void {
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) bg.setEntry(left + x, top + y, map[y * width + x] ?? 0);
}

