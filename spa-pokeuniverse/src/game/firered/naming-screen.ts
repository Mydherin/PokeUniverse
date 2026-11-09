// FireRed's naming screen, for the player, the rival and a box: three keyboard pages (upper,
// lower, symbols) swapped with a flip animation, the button column (page, BACK, OK), the
// flashing cursor and the text entry with its bouncing underscores. D-pad, A, B, Select
// and Start work as in the game. Behavior, timings and numbers follow FireRed; the code is
// our own. The entered name is returned to Oak's speech, which keeps its default when the
// name is empty or only spaces.

import { Gender } from "@pokeuniverse/contracts/trainer/v1/trainer";
import { Button } from "../gba/input";
import { PALETTES_ALL } from "../gba/palette";
import { ObjMode, type AnimCmd, type Sprite, type SpriteTemplate } from "../gba/sprites";
import type { Task } from "../gba/tasks";
import { EOS, FontId, Window, type Text, type WindowTemplate } from "../gba/text";
import { SIN, s16 } from "../gba/trig";
import { Effect, Layer, RGB_BLACK, type Background } from "../gba/video";
import { initBg } from "./common";
import type { Flow } from "./flow";
import { setBlend } from "./intro";
import { copyTiles, loadStdWindowFrameGfx } from "./menu";
import { MonIcon } from "./mon-icon";
import { textSpeedDelay } from "./options";

const enum Page {
  Symbols,
  Upper,
  Lower,
}

const enum Keyboard {
  Lower,
  Upper,
  Symbols,
}

const enum State {
  FadeIn,
  WaitFadeIn,
  HandleInput,
  MoveToOkButton,
  StartPageSwap,
  WaitPageSwap,
  PressedOk,
  WaitSentToPcMessage,
  FadeOut,
  Exit,
}

const enum InputEvent {
  None,
  Up,
  Down,
  Left,
  Right,
  A,
  B,
  Select,
  Start,
}

const enum KeyRole {
  Char,
  Page,
  Backspace,
  Ok,
}

const enum ButtonId {
  Page,
  Back,
  Ok,
  Count,
}

/** Who is named: the player and the rival take PLAYER_NAME_LENGTH, a box BOX_NAME_LENGTH, a caught Pokémon POKEMON_NAME_LENGTH. */
export type NamingKind = "player" | "rival" | "box" | "caughtMon";
const MAX_CHARS: Record<NamingKind, number> = { player: 7, rival: 7, box: 8, caughtMon: 10 };
const TITLES: Record<NamingKind, string> = { player: "gText_YourName", rival: "gText_RivalsName", box: "gText_BoxName", caughtMon: "gText_PkmnsNickname" };
/** sGenderColors. */
const GENDER_COLORS = { male: [0, 9, 8], female: [0, 5, 4] } as const;

/** NAMING_SCREEN_CAUGHT_MON: the Pokémon named, and the sent-to-PC message when its party was full. */
export interface NamedMon {
  species: number;
  /** Its species' name, before the title. */
  name: Text;
  gender: "male" | "female" | null;
  /** DisplaySentToPCMessage after OK, given the name entered (null: none, the species' name stays). */
  sentToPc?: (name: Text | null) => Text;
}
/** sPCIconOff_Gfx, sPCIconOn_Gfx: 16×24, in a 16×32 sprite with its bottom row empty. */
const PC_ICON_TILES = 8;
const ROWS = 4;

const WINDOWS = {
  kbPage1: { left: 3, top: 10, width: 19, height: 8, palette: 10, baseBlock: 0x030 },
  kbPage2: { left: 3, top: 10, width: 19, height: 8, palette: 10, baseBlock: 0x0c8 },
  textEntry: { left: 8, top: 6, width: 14, height: 2, palette: 10, baseBlock: 0x030 },
  textEntryBox: { left: 9, top: 4, width: 16, height: 2, palette: 10, baseBlock: 0x04c },
  banner: { left: 0, top: 0, width: 30, height: 2, palette: 11, baseBlock: 0x06c },
} satisfies Record<string, WindowTemplate>;

/** What each key types; a missing key is character 0 (a space), as the game's zero-filled table. */
const KEYBOARD_CHARS: Record<Keyboard, string[]> = {
  [Keyboard.Lower]: ["abcdef .", "ghijkl ,", "mnopqrs", "tuvwxyz"],
  [Keyboard.Upper]: ["ABCDEF .", "GHIJKL ,", "MNOPQRS", "TUVWXYZ"],
  [Keyboard.Symbols]: ["01234", "56789", "!?♂♀/-", "…“”‘'"],
};
const KEYBOARD_TEXT: Record<Keyboard, string[]> = {
  [Keyboard.Lower]: ["abcdef", "ghijkl", "mnopqrs", "tuvwxyz"],
  [Keyboard.Upper]: ["ABCDEF", "GHIJKL", "MNOPQRS", "TUVWXYZ"],
  [Keyboard.Symbols]: ["01234", "56789", "Symbols1", "Symbols2"],
};
const COLUMN_COUNTS: Record<Keyboard, number> = { [Keyboard.Lower]: 8, [Keyboard.Upper]: 8, [Keyboard.Symbols]: 6 };
const COLUMN_X: Record<Keyboard, number[]> = {
  [Keyboard.Lower]: [0, 12, 24, 56, 68, 80, 92, 123],
  [Keyboard.Upper]: [0, 12, 24, 56, 68, 80, 92, 123],
  [Keyboard.Symbols]: [0, 22, 44, 66, 88, 110],
};
const FILL: Record<Keyboard, number> = { [Keyboard.Lower]: 14, [Keyboard.Upper]: 13, [Keyboard.Symbols]: 15 };
const KEY_COLORS: Record<Keyboard, [number, number, number]> = { [Keyboard.Lower]: [14, 1, 2], [Keyboard.Upper]: [13, 1, 2], [Keyboard.Symbols]: [15, 1, 2] };

const PAGE_KEYBOARD: Record<Page, Keyboard> = { [Page.Symbols]: Keyboard.Symbols, [Page.Upper]: Keyboard.Upper, [Page.Lower]: Keyboard.Lower };
const PAGE_NEXT_KEYBOARD: Record<Page, Keyboard> = { [Page.Symbols]: Keyboard.Upper, [Page.Upper]: Keyboard.Lower, [Page.Lower]: Keyboard.Symbols };
const PAGE_NEXT_MAP = { [Page.Symbols]: "nsKeyboardUpper", [Page.Upper]: "nsKeyboardLower", [Page.Lower]: "nsKeyboardSymbols" } as const;

/** The page-swap button shows the next page: its label sheet and palette. */
const enum SwapGfx {
  Upper,
  Others,
  Lower,
}
const PAGE_NEXT_GFX: Record<Page, SwapGfx> = { [Page.Symbols]: SwapGfx.Upper, [Page.Upper]: SwapGfx.Lower, [Page.Lower]: SwapGfx.Others };
const SWAP_SHEETS: Record<SwapGfx, string> = { [SwapGfx.Upper]: "nsPageSwapUpper", [SwapGfx.Others]: "nsPageSwapOthers", [SwapGfx.Lower]: "nsPageSwapLower" };
const SWAP_PALETTES: Record<SwapGfx, string> = { [SwapGfx.Upper]: "nsPageSwapUpper", [SwapGfx.Others]: "nsPageSwapOthers", [SwapGfx.Lower]: "nsPageSwapLower" };

const BUTTON_KEY_ROLES = [KeyRole.Page, KeyRole.Backspace, KeyRole.Ok];

const LOOP: AnimCmd[][] = [[{ image: 0, duration: 1 }, { jump: 0 }]];

const template = (sheet: string, palette: string, width: number, height: number, priority = 0, anims = LOOP): SpriteTemplate => ({
  sheet,
  palette,
  width,
  height,
  priority,
  anims,
});

/** Starts the naming screen; `done` gets the entered name, or null to keep the default. */
export function startNamingScreen(flow: Flow, kind: NamingKind, gender: Gender, done: (name: Text | null) => void, mon?: NamedMon): void {
  new NamingScreen(flow, kind, gender, done, mon).start();
}

class NamingScreen {
  private state = State.FadeIn;
  private readonly buffer: number[] = new Array(16).fill(EOS);
  private currentPage = Page.Upper;
  private bg1vOffset = 0;
  private bg2vOffset = 0;
  private bg1Priority = 1;
  private bg2Priority = 2;
  /** Which offset each swap moves: 0 = BG2's, 1 = BG1's. */
  private bgToReveal = 0;
  private bgToHide = 1;
  private readonly maxChars: number;
  private readonly inputCharBaseX: number;
  private windows!: Record<keyof typeof WINDOWS, Window>;
  private cursor!: Sprite;
  private swapFrame!: Sprite;
  private swapText!: Sprite;
  private swapButton!: Sprite;
  // Task_HandleInput
  private inputEnabled = false;
  private event = InputEvent.None;
  private savedButtonRow = 0;
  // Task_UpdateButtonFlash
  private readonly flash = { button: ButtonId.Count, keep: false, allow: false, color: 0, incr: 0, delay: 0, delta: 0 };
  private pageSwapTask: Task | null = null;

  constructor(
    private readonly flow: Flow,
    private readonly kind: NamingKind,
    private readonly gender: Gender,
    private readonly done: (name: Text | null) => void,
    private readonly mon?: NamedMon,
  ) {
    this.maxChars = MAX_CHARS[kind];
    this.inputCharBaseX = (240 - this.maxChars * 8) / 2 + 6;
  }

  private get gba() {
    return this.flow.gba;
  }

  private get keyboard(): Keyboard {
    return PAGE_KEYBOARD[this.currentPage];
  }

  private get columnCount(): number {
    return COLUMN_COUNTS[this.keyboard];
  }

  private text(id: string): Text {
    return this.flow.assets.text(id);
  }

  /** CB2_LoadNamingScreen: one setup step per frame. */
  start(): void {
    const { gba } = this;
    gba.setMain(() => {
      switch (gba.state) {
        case 0:
          gba.setVBlank(null);
          gba.input.repeatStartDelay = 16;
          break;
        case 1:
          this.initBgs();
          break;
        case 2:
          gba.palettes.resetFade();
          break;
        case 3:
          gba.sprites.reset();
          gba.palettes.freeSpritePalettes();
          break;
        case 4:
          gba.tasks.reset();
          break;
        case 5:
          this.loadPalettes();
          break;
        case 6:
          this.loadGfx();
          break;
        case 7:
          this.createSprites();
          gba.palettes.updateFade();
          for (const bg of gba.video.bgs) bg.visible = true;
          break;
        default:
          gba.tasks.create(() => this.handleInputTask(), 1);
          gba.tasks.create(() => this.updateButtonFlash(), 3);
          gba.tasks.create(() => this.mainTask(), 2);
          gba.setMain(gba.runFrame);
          return;
      }
      gba.state++;
    });
  }

  private initBgs(): void {
    const { video } = this.gba;
    video.reset();
    video.palette.fill(0);
    const [bg0, bg1, bg2, bg3] = video.bgs;
    initBg(bg0, 0, 0);
    initBg(bg1, 0, 1);
    initBg(bg2, 0, 2);
    initBg(bg3, 0, 3);
    bg0.tiles = new Uint8Array(0x21d * 64);
    this.flow.text.reset();
    loadStdWindowFrameGfx(this.flow, bg0);
    this.windows = {
      kbPage1: new Window(bg1, WINDOWS.kbPage1),
      kbPage2: new Window(bg2, WINDOWS.kbPage2),
      textEntry: new Window(bg3, WINDOWS.textEntry),
      textEntryBox: new Window(bg3, WINDOWS.textEntryBox),
      banner: new Window(bg0, WINDOWS.banner),
    };
    video.objOn = true;
    // The cursor (semi-transparent) blends over the keyboards.
    setBlend(video, 0, Effect.Blend, Layer.BG1 | Layer.BG2);
    video.eva = 12;
    video.evb = 8;
  }

  private loadPalettes(): void {
    const { assets, gba } = this.flow;
    const menu = ["nsMenu", "nsPageSwapUpperPal", "nsPageSwapLowerPal", "nsPageSwapOthersPal", "nsButtonsPal", "nsCursorPal"] as const;
    menu.forEach((id, i) => gba.palettes.load(assets.get(id).palette, i * 16, 16));
    gba.palettes.load(assets.get("nsKeyboardPal").palette, 10 * 16, 16);
    gba.palettes.load(assets.get("textWindowPal2").palette, 11 * 16, 16);
  }

  private loadGfx(): void {
    const { assets, gba } = this.flow;
    const { sprites, palettes } = gba;
    const tiles = assets.get("nsMenu").tiles;
    for (const bg of gba.video.bgs.slice(1)) copyTiles(bg, tiles, 0, 48);
    const sheet = (tag: string, id: Parameters<typeof assets.get>[0], tileCount: number) => sprites.loadSheet(tag, assets.get(id).tiles.slice(0, tileCount * 64));
    sheet("nsBackButton", "nsBackButton", 15);
    sheet("nsOkButton", "nsOkButton", 15);
    sheet("nsPageSwapFrame", "nsPageSwapFrame", 20);
    sheet("nsPageSwapButton", "nsPageSwapButton", 8);
    sheet("nsPageSwapUpper", "nsPageSwapUpper", 3);
    sheet("nsPageSwapLower", "nsPageSwapLower", 3);
    sheet("nsPageSwapOthers", "nsPageSwapOthers", 3);
    // The cursor, squished and filled sheets follow each other: the animation uses tiles 4 and 8.
    const cursor = new Uint8Array(12 * 64);
    (["nsCursor", "nsCursorSquished", "nsCursorFilled"] as const).forEach((id, i) => cursor.set(assets.get(id).tiles.subarray(0, 4 * 64), i * 4 * 64));
    sprites.loadSheet("nsCursor", cursor);
    sheet("nsInputArrow", "nsInputArrow", 1);
    sheet("nsUnderscore", "nsUnderscore", 1);
    const pal = (tag: string, id: Parameters<typeof assets.get>[0]) => palettes.loadSpritePalette(tag, assets.get(id).palette);
    pal("nsMenu", "nsMenu");
    pal("nsPageSwapUpper", "nsPageSwapUpperPal");
    pal("nsPageSwapLower", "nsPageSwapLowerPal");
    pal("nsPageSwapOthers", "nsPageSwapOthersPal");
    pal("nsPageSwap", "nsButtonsPal");
    pal("nsCursor", "nsCursorPal");
    pal("nsBackButton", "nsButtonsPal");
    pal("nsOkButton", "nsButtonsPal");
  }

  // Sprites

  private createSprites(): void {
    const { sprites } = this.gba;
    // Cursor
    this.cursor = sprites.create(
      {
        ...template("nsCursor", "nsCursor", 16, 16, 0, [LOOP[0], [{ image: 4, duration: 8 }, { image: 8, duration: 8 }, "end"]]),
        callback: (s) => this.cursorCallback(s),
      },
      38,
      88,
      1,
    )!;
    this.setCursorInvisibility(true);
    this.cursor.priority = 1;
    this.cursor.mode = ObjMode.Blend;
    this.cursor.data[6] = 2;
    this.setCursorPos(0, 0);
    // Page swap button: frame, label, button
    this.swapFrame = sprites.create({ ...template("nsPageSwapFrame", "nsPageSwap", 40, 32, 1), callback: (s) => this.pageSwapCallback(s) }, 204, 88, 0)!;
    this.swapFrame.invisible = true;
    this.swapText = sprites.create(template("nsPageSwapUpper", "nsPageSwap", 24, 8, 1), 204, 84, 1)!;
    this.swapText.invisible = true;
    this.swapButton = sprites.create(template("nsPageSwapButton", "nsPageSwapUpper", 32, 16), 204, 83, 2)!;
    this.swapButton.priority = 1;
    this.swapButton.invisible = true;
    // BACK and OK
    sprites.create(template("nsBackButton", "nsBackButton", 40, 24, 1), 204, 116, 0)!.invisible = true;
    sprites.create(template("nsOkButton", "nsOkButton", 40, 24, 1), 204, 140, 0)!.invisible = true;
    // Text entry: the arrow and one underscore per character
    const arrow = sprites.create({ ...template("nsInputArrow", "nsPageSwapOthers", 8, 8), callback: inputArrowCallback }, this.inputCharBaseX - 5, 56, 0)!;
    arrow.priority = 3;
    arrow.invisible = true;
    for (let i = 0; i < this.maxChars; i++) {
      const s = sprites.create({ ...template("nsUnderscore", "nsPageSwapOthers", 8, 8), callback: (u) => this.underscoreCallback(u) }, this.inputCharBaseX + i * 8 + 3, 60, 0)!;
      s.priority = 3;
      s.data[0] = i;
      s.invisible = true;
    }
    this.createIcon();
  }

  /** DisplaySentToPCMessage: in window 0 (the first keyboard page's), as the game draws it. */
  private displaySentToPcMessage(text: Text): void {
    const { flow } = this;
    const win = this.windows.kbPage1;
    win.fill(1);
    const f = flow.fonts[FontId.Normal];
    flow.text.ctx.canABSpeedUpPrint = true;
    flow.text.add(win, { font: f, x: 0, y: 1, letterSpacing: f.letterSpacing, lineSpacing: f.lineSpacing, colors: [2, 1, 3] }, textSpeedDelay(flow.options), text);
    win.copyToVram();
    win.putTilemap();
  }

  /** The player walking south, the rival's icon, the PC's blinking screen, or the Pokémon's icon. */
  private createIcon(): void {
    const { assets, gba } = this.flow;
    const { sprites, palettes } = gba;
    if (this.kind === "caughtMon") {
      // NamingScreen_CreateMonIcon.
      new MonIcon(this.flow, this.mon?.species ?? 0, 56, 40, 0, 3);
    } else if (this.kind === "player") {
      const id = this.gender === Gender.GIRL ? "owGreen" : "owRed";
      sprites.loadSheet("nsIcon", assets.get(id).tiles);
      palettes.loadSpritePalette("nsIcon", assets.get("owPlayerPal").palette);
      // ANIM_STD_GO_SOUTH: frames 3, 0, 4, 0 (8 tiles each).
      const walk: AnimCmd[] = [{ image: 24, duration: 8 }, { image: 0, duration: 8 }, { image: 32, duration: 8 }, { image: 0, duration: 8 }, { jump: 0 }];
      sprites.create(template("nsIcon", "nsIcon", 16, 32, 0, [walk]), 56, 37, 0)!.priority = 3;
    } else if (this.kind === "box") {
      // NamingScreen_CreatePCIcon: its three 16×8 rows from y−12, so a 16×32 sprite 4 lower.
      const sheet = new Uint8Array(2 * PC_ICON_TILES * 64);
      sheet.set(assets.get("nsPcIconOff").tiles.subarray(0, 6 * 64), 0);
      sheet.set(assets.get("nsPcIconOn").tiles.subarray(0, 6 * 64), PC_ICON_TILES * 64);
      sprites.loadSheet("nsIcon", sheet);
      const anim: AnimCmd[] = [{ image: 0, duration: 2 }, { image: PC_ICON_TILES, duration: 2 }, { jump: 0 }];
      sprites.create(template("nsIcon", "nsMenu", 16, 32, 0, [anim]), 56, 45, 0)!.priority = 3;
    } else {
      sprites.loadSheet("nsIcon", assets.get("nsRival").tiles);
      palettes.loadSpritePalette("nsIcon", assets.get("nsRival").palette);
      const anim: AnimCmd[] = [{ image: 0, duration: 10 }, { image: 24, duration: 10 }, { image: 0, duration: 10 }, { image: 32, duration: 10 }, { jump: 0 }];
      sprites.create(template("nsIcon", "nsIcon", 16, 32, 0, [anim]), 56, 37, 0)!.priority = 3;
    }
  }

  private cursorCallback(sprite: Sprite): void {
    const d = sprite.data;
    if (sprite.animEnded) sprite.startAnim(0);
    sprite.invisible = (d[4] & 0xff) !== 0;
    if (d[0] === this.columnCount) sprite.invisible = true;
    const flashing = (d[4] & 0xff00) !== 0;
    if (sprite.invisible || !flashing || d[0] !== d[2] || d[1] !== d[3]) {
      d[5] = 0;
      d[6] = 2;
      d[7] = 2;
    }
    if (--d[7] === 0) {
      d[5] += d[6];
      if (d[5] === 16 || d[5] === 0) d[6] = -d[6];
      d[7] = 2;
    }
    if (flashing) {
      const gb = d[5];
      const r = d[5] >> 1;
      this.multiplyInvertedPalette(256 + this.gba.palettes.spritePaletteSlot("nsCursor") * 16 + 1, r, gb, gb);
    }
  }

  /** MultiplyInvertedPaletteRGBComponents: a color moved toward white by r, g, b sixteenths. */
  private multiplyInvertedPalette(i: number, r: number, g: number, b: number): void {
    const { palettes } = this.gba;
    const c = palettes.unfaded[i];
    let red = c & 31;
    let green = (c >> 5) & 31;
    let blue = (c >> 10) & 31;
    red += ((31 - red) * r) >> 4;
    green += ((31 - green) * g) >> 4;
    blue += ((31 - blue) * b) >> 4;
    palettes.faded[i] = red | (green << 5) | (blue << 10);
  }

  private underscoreCallback(sprite: Sprite): void {
    const d = sprite.data;
    if (this.textEntryPosition() !== d[0]) {
      sprite.y2 = d[1] = d[2] = 0;
      return;
    }
    sprite.y2 = [2, 3, 2, 1][d[1]];
    if (++d[2] > 8) {
      d[1] = (d[1] + 1) & 3;
      d[2] = 0;
    }
  }

  private setCursorPos(x: number, y: number): void {
    const c = this.cursor;
    c.x = x < this.columnCount ? COLUMN_X[this.keyboard][x] + 38 : 0;
    c.y = y * 16 + 88;
    c.data[2] = c.data[0];
    c.data[3] = c.data[1];
    c.data[0] = x;
    c.data[1] = y;
  }

  private moveCursorToOkButton(): void {
    this.setCursorPos(this.columnCount, 2);
  }

  private setCursorInvisibility(invisible: boolean): void {
    this.cursor.data[4] = (this.cursor.data[4] & 0xff00) | (invisible ? 1 : 0);
    this.cursor.startAnim(0);
  }

  private setCursorFlashing(flashing: boolean): void {
    this.cursor.data[4] = (this.cursor.data[4] & 0xff) | (flashing ? 0x100 : 0);
  }

  private keyRoleAtCursor(): KeyRole {
    const [x, y] = [this.cursor.data[0], this.cursor.data[1]];
    return x < this.columnCount ? KeyRole.Char : BUTTON_KEY_ROLES[y];
  }

  /** The page-swap frame's callback: slides the label off and on during a swap. */
  private pageSwapCallback(frame: Sprite): void {
    const d = frame.data;
    const text = this.swapText;
    switch (d[0]) {
      case 0:
        this.setPageSwapButtonGfx(PAGE_NEXT_GFX[this.currentPage]);
        d[0]++;
        break;
      case 2:
        if (++text.y2 > 7) {
          d[0]++;
          text.y2 = -4;
          text.invisible = true;
          this.setPageSwapButtonGfx(PAGE_NEXT_GFX[((d[1] + 1) % 3) as Page]);
        }
        break;
      case 3:
        text.invisible = false;
        if (++text.y2 >= 0) {
          text.y2 = 0;
          d[0] = 1;
        }
        break;
    }
  }

  private setPageSwapButtonGfx(gfx: SwapGfx): void {
    const { sprites, palettes } = this.gba;
    this.swapButton.paletteNum = palettes.spritePaletteSlot(SWAP_PALETTES[gfx]) & 15;
    this.swapText.tiles = sprites.sheet(SWAP_SHEETS[gfx]);
  }

  // Main task

  private mainTask(): void {
    switch (this.state) {
      case State.FadeIn:
        this.fadeIn();
        for (const s of this.gba.sprites.slots) if (s.inUse) s.invisible = false;
        this.setCursorInvisibility(false);
        this.gba.setVBlank(() => this.vblank());
        break;
      case State.WaitFadeIn:
        if (!this.gba.palettes.fadeActive) {
          this.inputEnabled = true;
          this.setCursorFlashing(true);
          this.state++;
        }
        break;
      case State.HandleInput:
        this.handleKeyboardEvent();
        break;
      case State.MoveToOkButton:
        if (this.cursor.animEnded) {
          this.inputEnabled = true;
          this.moveCursorToOkButton();
          this.state = State.HandleInput;
        }
        break;
      case State.StartPageSwap:
        this.inputEnabled = false;
        this.swapFrame.data[0] = 2;
        this.swapFrame.data[1] = this.currentPage;
        this.startPageSwapAnim();
        this.setCursorInvisibility(true);
        this.tryStartButtonFlash(ButtonId.Page, false, true);
        this.flow.play("se_win_open");
        this.state = State.WaitPageSwap;
        break;
      case State.WaitPageSwap:
        this.waitPageSwap();
        break;
      case State.PressedOk:
        this.inputEnabled = false;
        this.setCursorFlashing(false);
        this.tryStartButtonFlash(ButtonId.Count, false, true);
        this.state = State.FadeOut;
        if (this.mon?.sentToPc) {
          this.displaySentToPcMessage(this.mon.sentToPc(this.enteredName()));
          this.state = State.WaitSentToPcMessage;
        }
        break;
      case State.WaitSentToPcMessage:
        this.flow.text.run();
        if (!this.flow.text.isActive(this.windows.kbPage1) && this.gba.input.isPressed(Button.A)) this.state = State.FadeOut;
        break;
      case State.FadeOut:
        this.gba.palettes.beginFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
        this.state++;
        break;
      case State.Exit:
        if (!this.gba.palettes.fadeActive) this.exit();
        break;
    }
  }

  private fadeIn(): void {
    const { assets, gba } = this.flow;
    const [, bg1, bg2, bg3] = gba.video.bgs;
    copyMap(bg3, assets.get("nsBackground").map!);
    this.currentPage = Page.Upper;
    copyMap(bg2, assets.get("nsKeyboardLower").map!);
    copyMap(bg1, assets.get("nsKeyboardUpper").map!);
    this.printKeyboardKeys(this.windows.kbPage2, Keyboard.Lower);
    this.printKeyboardKeys(this.windows.kbPage1, Keyboard.Upper);
    this.drawTextEntry();
    this.drawTextEntryBox();
    this.printControls();
    gba.palettes.blendPalettes(PALETTES_ALL, 16, RGB_BLACK);
    gba.palettes.beginFade(PALETTES_ALL, 0, 16, 0, RGB_BLACK);
    this.state++;
  }

  /** SaveInputText: the name only counts if it has something besides spaces. */
  private exit(): void {
    this.gba.input.repeatStartDelay = 40;
    this.gba.tasks.reset();
    this.done(this.enteredName());
  }

  private enteredName(): Text | null {
    const name = this.buffer.slice(0, this.maxChars);
    return name.some((c) => c !== 0 && c !== EOS) ? [...name, EOS] : null;
  }

  private vblank(): void {
    const { gba } = this;
    gba.standardVBlank();
    const [, bg1, bg2] = gba.video.bgs;
    bg1.y = s16(this.bg1vOffset) * 256;
    bg2.y = s16(this.bg2vOffset) * 256;
    bg1.priority = this.bg1Priority;
    bg2.priority = this.bg2Priority;
  }

  // Keyboard

  private handleKeyboardEvent(): void {
    const input = this.event;
    const role = this.keyRoleAtCursor();
    if (input === InputEvent.Select) this.state = State.StartPageSwap;
    else if (input === InputEvent.B) this.deleteTextCharacter();
    else if (input === InputEvent.Start) this.moveCursorToOkButton();
    else if (role === KeyRole.Char) {
      this.tryStartButtonFlash(ButtonId.Count, false, false);
      if (input === InputEvent.A) {
        const full = this.addTextCharacter();
        this.cursor.startAnim(1);
        if (full) {
          this.inputEnabled = false;
          this.state = State.MoveToOkButton;
        }
      }
    } else if (role === KeyRole.Page) {
      this.tryStartButtonFlash(ButtonId.Page, true, false);
      if (input === InputEvent.A) this.state = State.StartPageSwap;
    } else if (role === KeyRole.Backspace) {
      this.tryStartButtonFlash(ButtonId.Back, true, false);
      if (input === InputEvent.A) this.deleteTextCharacter();
    } else {
      this.tryStartButtonFlash(ButtonId.Ok, true, false);
      if (input === InputEvent.A) {
        this.flow.play("se_select");
        this.state = State.PressedOk;
      }
    }
  }

  private charAt(x: number, y: number): number {
    const c = [...KEYBOARD_CHARS[this.keyboard][y]][x];
    return c === undefined ? 0 : (this.flow.assets.charmap.encode[c] ?? 0);
  }

  /** The first free position, or the last one when the name is full. */
  private textEntryPosition(): number {
    for (let i = 0; i < this.maxChars; i++) if (this.buffer[i] === EOS) return i;
    return this.maxChars - 1;
  }

  private previousCaretPosition(): number {
    for (let i = this.maxChars - 1; i > 0; i--) if (this.buffer[i] !== EOS) return i;
    return 0;
  }

  private deleteTextCharacter(): void {
    const index = this.previousCaretPosition();
    // A space for the redraw, then the end of the name.
    this.buffer[index] = 0;
    this.drawTextEntry();
    this.buffer[index] = EOS;
    const role = this.keyRoleAtCursor();
    if (role === KeyRole.Char || role === KeyRole.Backspace) this.tryStartButtonFlash(ButtonId.Back, false, true);
    this.flow.play("se_ball");
  }

  /** Types the key under the cursor; true when the name is now full. */
  private addTextCharacter(): boolean {
    this.buffer[this.textEntryPosition()] = this.charAt(this.cursor.data[0], this.cursor.data[1]);
    this.drawTextEntry();
    this.flow.play("se_select");
    return this.previousCaretPosition() === this.maxChars - 1;
  }

  private drawTextEntry(): void {
    const win = this.windows.textEntry;
    const font = this.flow.fonts[FontId.Normal];
    const x = this.inputCharBaseX - 0x40;
    win.fill(1);
    for (let i = 0; i < this.maxChars; i++) win.print(font, i * 8 + x, 1, [1, 2, 3], [this.buffer[i], EOS]);
    // DrawGenderIcon.
    const gender = this.mon?.gender;
    if (gender) win.print(font, 0x68, 1, [...GENDER_COLORS[gender]], this.text(gender === "male" ? "gText_MaleSymbol" : "gText_FemaleSymbol"));
    win.copyToVram();
    win.putTilemap();
  }

  private drawTextEntryBox(): void {
    const win = this.windows.textEntryBox;
    win.fill(1);
    // DrawMonTextEntryBox: the species' name before "'s nickname?".
    const title = this.text(TITLES[this.kind]);
    win.print(this.flow.fonts[FontId.NormalCopy1], 1, 1, [1, 2, 3], this.mon ? [...this.mon.name.slice(0, this.mon.name.indexOf(EOS) >>> 0), ...title] : title);
    win.copyToVram();
    win.putTilemap();
  }

  private printKeyboardKeys(win: Window, keyboard: Keyboard): void {
    win.fill(FILL[keyboard]);
    const font = this.flow.fonts[FontId.NormalCopy1];
    for (let i = 0; i < ROWS; i++) win.print(font, 0, i * 16 + 1, KEY_COLORS[keyboard], this.text(`gText_NamingScreenKeyboard_${KEYBOARD_TEXT[keyboard][i]}`));
    win.copyToVram();
    win.putTilemap();
  }

  private printControls(): void {
    const win = this.windows.banner;
    const small = this.flow.fonts[FontId.Small];
    const text = this.text("gText_MoveOkBack");
    win.fill(15);
    win.print(small, 240 - 4 - small.width(text), 0, [15, 1, 2], text);
    win.putTilemap();
    win.copyToVram();
  }

  /** DrawKeyboardPageOnDeck: the page after the new one, on the background now behind. */
  private drawKeyboardPageOnDeck(): void {
    const [, bg1, bg2] = this.gba.video.bgs;
    const back = bg1.priority > bg2.priority;
    copyMap(back ? bg1 : bg2, this.flow.assets.get(PAGE_NEXT_MAP[this.currentPage]).map!);
    this.printKeyboardKeys(back ? this.windows.kbPage1 : this.windows.kbPage2, PAGE_NEXT_KEYBOARD[this.currentPage]);
  }

  // Page swap

  private startPageSwapAnim(): void {
    let state = 0;
    let frames = 0;
    const offsets = (reveal: number, hide: number) => {
      const set = (which: number, v: number) => (which === 0 ? (this.bg2vOffset = v) : (this.bg1vOffset = v));
      set(reveal, sin(frames, 40));
      set(hide, sin((frames + 128) & 0xff, 40));
    };
    const step = (task: Task) => {
      switch (state) {
        case 0:
          this.bg1vOffset = this.bg2vOffset = 0;
          state++;
          break;
        case 1:
          frames += 4;
          offsets(this.bgToReveal, this.bgToHide);
          if (frames >= 64) {
            [this.bg1Priority, this.bg2Priority] = [this.bg2Priority, this.bg1Priority];
            state++;
          }
          break;
        case 2:
          frames += 4;
          offsets(this.bgToReveal, this.bgToHide);
          if (frames >= 128) {
            [this.bgToReveal, this.bgToHide] = [this.bgToHide, this.bgToReveal];
            state++;
          }
          break;
        default:
          this.gba.tasks.destroy(task);
          this.pageSwapTask = null;
      }
    };
    this.pageSwapTask = this.gba.tasks.create(step, 0);
    step(this.pageSwapTask);
  }

  private waitPageSwap(): void {
    if (this.pageSwapTask) return;
    let x = this.cursor.data[0];
    const y = this.cursor.data[1];
    const onLastColumn = x === this.columnCount;
    this.state = State.HandleInput;
    this.currentPage = ((this.currentPage + 1) % 3) as Page;
    if (onLastColumn) x = this.columnCount;
    else if (x >= this.columnCount) x = this.columnCount - 1;
    this.setCursorPos(x, y);
    this.drawKeyboardPageOnDeck();
    this.inputEnabled = true;
    this.setCursorInvisibility(false);
  }

  // Input (Task_HandleInput)

  private handleInputTask(): void {
    this.event = InputEvent.None;
    if (!this.inputEnabled) return;
    const { input } = this.gba;
    if (input.isPressed(Button.A)) this.event = InputEvent.A;
    else if (input.isPressed(Button.B)) this.event = InputEvent.B;
    else if (input.isPressed(Button.Select)) this.event = InputEvent.Select;
    else if (input.isPressed(Button.Start)) this.event = InputEvent.Start;
    else this.handleDpadMovement();
  }

  private handleDpadMovement(): void {
    const { input } = this.gba;
    const dx = [0, 0, 0, -1, 1];
    const dy = [0, -1, 1, 0, 0];
    const keyRowToButtonRow = [0, 1, 1, 2];
    const buttonRowToKeyRow = [0, 0, 3];
    let [x, y] = [this.cursor.data[0], this.cursor.data[1]];
    let dir = InputEvent.None;
    if (input.isRepeated(Button.Up)) dir = InputEvent.Up;
    if (input.isRepeated(Button.Down)) dir = InputEvent.Down;
    if (input.isRepeated(Button.Left)) dir = InputEvent.Left;
    if (input.isRepeated(Button.Right)) dir = InputEvent.Right;
    const prevX = x;
    x += dx[dir];
    y += dy[dir];
    const cols = this.columnCount;
    if (x < 0) x = cols;
    if (x > cols) x = 0;
    if (dx[dir] !== 0) {
      if (x === cols) {
        // Onto the button column: remember the row to come back to.
        this.savedButtonRow = y;
        y = keyRowToButtonRow[y];
      } else if (prevX === cols) {
        y = y === 1 ? this.savedButtonRow : buttonRowToKeyRow[y];
      }
    }
    if (x === cols) {
      if (y < 0) y = ButtonId.Count - 1;
      if (y >= ButtonId.Count) y = 0;
      if (y === 0) this.savedButtonRow = ButtonId.Back;
      else if (y === ButtonId.Count - 1) this.savedButtonRow = ButtonId.Ok;
    } else {
      if (y < 0) y = ROWS - 1;
      if (y >= ROWS) y = 0;
    }
    this.setCursorPos(x, y);
  }

  // Button flash (Task_UpdateButtonFlash)

  private buttonPalOffset(button: ButtonId): number {
    const slot = (tag: string) => 256 + this.gba.palettes.spritePaletteSlot(tag) * 16;
    if (button === ButtonId.Page) return slot("nsPageSwap") + 14;
    if (button === ButtonId.Back) return slot("nsBackButton") + 14;
    if (button === ButtonId.Ok) return slot("nsOkButton") + 14;
    return slot("nsOkButton") + 1;
  }

  private tryStartButtonFlash(button: ButtonId, keepFlashing: boolean, interrupt: boolean): void {
    const f = this.flash;
    if (button === f.button && !interrupt) {
      f.keep = keepFlashing;
      f.allow = true;
      return;
    }
    if (button === ButtonId.Count && !f.keep && !interrupt) return;
    if (f.button !== ButtonId.Count) {
      const i = this.buttonPalOffset(f.button);
      this.gba.palettes.faded[i] = this.gba.palettes.unfaded[i];
    }
    Object.assign(f, { button, keep: keepFlashing, allow: true, color: 4, incr: 2, delay: 0, delta: 4 });
  }

  private updateButtonFlash(): void {
    const f = this.flash;
    if (f.button === ButtonId.Count || !f.allow) return;
    this.multiplyInvertedPalette(this.buttonPalOffset(f.button), f.color, f.color, f.color);
    if (f.delay && --f.delay) return;
    f.delay = 2;
    if (f.incr >= 0) {
      if (f.color < 14) {
        f.color += f.incr;
        f.delta += f.incr;
      } else {
        f.color = 16;
        f.delta++;
      }
    } else {
      f.color += f.incr;
      f.delta += f.incr;
    }
    if (f.color === 16 && f.delta === 22) f.incr = -4;
    else if (f.color === 0) {
      f.allow = f.keep;
      f.incr = 2;
      f.delta = 0;
    }
  }
}

function inputArrowCallback(sprite: Sprite): void {
  const d = sprite.data;
  if (d[0] === 0 || --d[0] === 0) {
    d[0] = 8;
    d[1] = (d[1] + 1) & 3;
  }
  sprite.x2 = [0, -4, -2, -1][d[1]];
}

/** Sin(angle, amplitude) as the games compute it. */
function sin(angle: number, amplitude: number): number {
  return s16(SIN[angle & 0xff] * amplitude) >> 8;
}

/** CopyToBgTilemapBuffer: a 32×20 screen of entries. */
function copyMap(bg: Background, map: Uint16Array): void {
  bg.map.fill(0);
  bg.map.set(map.subarray(0, bg.map.length));
}
