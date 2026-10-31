// The OPTION menu (option_menu.c), opened from the START menu: the button hints at the top,
// "OPTION" in a standard frame, and the options in the player's own frame, the chosen value of
// each in red. UP/DOWN pick a row (wrapping), LEFT/RIGHT switch its value (wrapping), and the
// picked row shows brighter than the others. A or B closes it, saving the options; the game
// plays no sound here. A new frame shows around the options at once; the rest applies on closing.

import { create } from "@bufbuild/protobuf";
import { OptionsSchema } from "@pokeuniverse/contracts/trainer/v1/trainer";
import { Button } from "../gba/input";
import { PALETTES_ALL } from "../gba/palette";
import { decimalText, FontId, joinText, NumberMode, Window, type Text, type WindowTemplate } from "../gba/text";
import { Effect, Layer, RGB_BLACK, WIN_EFFECTS, type Background, type Color } from "../gba/video";
import { fillBgRect, initBg } from "./common";
import type { Flow } from "./flow";
import { userFrame, type TextId } from "./manifest";
import { copyTiles, printDefault } from "./menu";
import { OPTION_COUNTS, setOption, type OptionField, type Options } from "./options";

/** The rows, top to bottom: each option with its values' names (the frame's are "TYPE" and its number), then CANCEL. */
const ROWS: readonly { name: TextId; field: OptionField | null; values: readonly TextId[] | null }[] = [
  { name: "gText_TextSpeed", field: "textSpeed", values: ["gText_TextSpeedSlow", "gText_TextSpeedMid", "gText_TextSpeedFast"] },
  { name: "gText_BattleScene", field: "battleScene", values: ["gText_BattleSceneOn", "gText_BattleSceneOff"] },
  { name: "gText_BattleStyle", field: "battleStyle", values: ["gText_BattleStyleShift", "gText_BattleStyleSet"] },
  { name: "gText_Sound", field: "sound", values: ["gText_SoundMono", "gText_SoundStereo"] },
  { name: "gText_ButtonMode", field: "buttonMode", values: ["gText_ButtonTypeHelp", "gText_ButtonTypeLR", "gText_ButtonTypeLEqualsA"] },
  { name: "gText_Frame", field: "frame", values: null },
  { name: "gText_OptionMenuCancel", field: null, values: null },
];

/** BG0, BG1 and BG2 share their tiles: the windows', then the user's frame and the standard frame. */
const FRAME_TILE = 0x1aa;
const STD_FRAME_TILE = 0x1b3;
const FRAME_TILES = 9;
const SHARED_TILES = STD_FRAME_TILE + FRAME_TILES;

const OPTION_PALETTE = 1;
const FRAME_PALETTE = 2;
const STD_FRAME_PALETTE = 3;
const TOP_BAR_PALETTE = 15;

const WINDOWS = {
  /** "OPTION", on BG1. */
  header: { left: 2, top: 3, width: 26, height: 2, palette: OPTION_PALETTE, baseBlock: 0x002 },
  /** The options, on BG0. */
  options: { left: 2, top: 7, width: 26, height: 12, palette: OPTION_PALETTE, baseBlock: 0x036 },
  /** The button hints, on BG2. */
  topBar: { left: 0, top: 0, width: 30, height: 2, palette: TOP_BAR_PALETTE, baseBlock: 0x16e },
} satisfies Record<string, WindowTemplate>;

/** Rows are a letter's height minus one apart. */
const ROW_HEIGHT = 13;
const NAME_X = 8;
const VALUE_X = 130;
const VALUE_WIDTH = 70;
const VALUE_COLORS = [0, 5, 4] as const;
/** The picked row's window: 2 tiles in from each side, from 58 pixels down. */
const SELECTION_TOP = 58;
const SELECTION_LEFT = 16;
const SELECTION_RIGHT = 224;
/** The other rows darken by 2/16. */
const UNPICKED_DARKEN = 2;
const TOP_BAR_RIGHT = 228;

/** Frames on black before the fade in: CB2_OptionMenu's setup steps, then the task's first frame. */
const SETUP_FRAMES = 16;

const enum State {
  Setup,
  FadeIn,
  Input,
  FadeOut,
  Close,
}

/**
 * Shows the menu over `backdrop` (the color 0 the screen it came from left: the game doesn't set
 * its own), then `done` once it faded out with the options saved.
 */
export function startOptionMenu(flow: Flow, backdrop: Color, done: () => void): void {
  new OptionMenu(flow, backdrop, done);
}

class OptionMenu {
  private readonly bgs: Background[];
  private readonly options: Options;
  private readonly win: Window;
  private cursor = 0;
  private state = State.Setup;
  private wait = SETUP_FRAMES;

  constructor(
    private readonly flow: Flow,
    backdrop: Color,
    private readonly done: () => void,
  ) {
    const { gba, assets } = flow;
    this.options = create(OptionsSchema, flow.options);
    gba.setVBlank(null);
    gba.reset();
    const { video, palettes } = gba;
    this.bgs = video.bgs;
    const [bg0, bg1, bg2] = this.bgs;
    initBg(bg0, 0, 1);
    initBg(bg1, 0, 0);
    initBg(bg2, 0, 2);
    bg0.tiles = bg1.tiles = bg2.tiles = new Uint8Array(SHARED_TILES * 64);
    for (const bg of [bg0, bg1, bg2]) bg.visible = true;

    // InitOptionMenuBg: WIN0 shows the picked row as it is; outside it BG0 darkens.
    video.win0On = true;
    video.winIn0 = Layer.BG0;
    video.winOut = Layer.BG0 | Layer.BG1 | Layer.BG2 | WIN_EFFECTS;
    video.effect = Effect.Darken;
    video.target1 = Layer.BG0;
    video.evy = UNPICKED_DARKEN;

    // LoadOptionMenuPalette.
    palettes.load([backdrop], 0, 1);
    this.loadFrame();
    palettes.load(assets.get("optionMenuPal").palette, OPTION_PALETTE * 16);
    palettes.load(assets.get("textWindowPal2").palette, TOP_BAR_PALETTE * 16, 16);
    copyTiles(bg1, assets.get("stdWindowFrame").tiles, STD_FRAME_TILE, FRAME_TILES);
    palettes.load(assets.get("textWindowPal3").palette, STD_FRAME_PALETTE * 16, 16);

    this.printHeader(new Window(bg1, WINDOWS.header));
    this.drawFrames(bg1);
    this.win = new Window(bg0, WINDOWS.options);
    this.win.fill(1);
    ROWS.forEach((row, i) => this.win.print(flow.fonts[FontId.Normal], NAME_X, i * ROW_HEIGHT + 2, [1, 2, 3], assets.text(row.name)));
    ROWS.forEach((_, i) => this.printValue(i));
    this.showSelection();
    this.printTopBar(new Window(bg2, WINDOWS.topBar));

    gba.tasks.create(() => this.update(), 0);
    gba.setMain(gba.runFrame);
  }

  private update(): void {
    const { gba } = this.flow;
    switch (this.state) {
      case State.Setup:
        if (--this.wait > 0) return;
        gba.palettes.beginFade(PALETTES_ALL, 0, 16, 0, RGB_BLACK);
        gba.setVBlank(gba.standardVBlank);
        this.state = State.FadeIn;
        return;
      case State.FadeIn:
        if (!gba.palettes.fadeActive) this.state = State.Input;
        return;
      case State.Input:
        this.processInput();
        return;
      case State.FadeOut:
        gba.palettes.beginFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
        this.state = State.Close;
        return;
      case State.Close:
        if (gba.palettes.fadeActive) return;
        this.close();
    }
  }

  /** OptionMenu_ProcessInput: RIGHT, LEFT, UP, DOWN (with key repeat), then A or B. */
  private processInput(): void {
    const { input } = this.flow.gba;
    if (input.isRepeated(Button.Right)) this.switchValue(1);
    else if (input.isRepeated(Button.Left)) this.switchValue(-1);
    else if (input.isRepeated(Button.Up)) this.moveCursor(-1);
    else if (input.isRepeated(Button.Down)) this.moveCursor(1);
    else if (input.isPressed(Button.A | Button.B)) this.state = State.FadeOut;
  }

  private switchValue(delta: number): void {
    const { field } = ROWS[this.cursor];
    if (field) {
      const count = OPTION_COUNTS[field];
      setOption(this.options, field, ((this.options[field] - 1 + delta + count) % count) + 1);
      if (field === "frame") this.loadFrame();
    }
    this.printValue(this.cursor);
  }

  private moveCursor(delta: number): void {
    this.cursor = (this.cursor + delta + ROWS.length) % ROWS.length;
    this.showSelection();
  }

  /** CloseAndSaveOptionMenu: the options kept (and saved) when they changed, back to the START menu. */
  private close(): void {
    const { flow } = this;
    const before = flow.options;
    if ((Object.keys(OPTION_COUNTS) as OptionField[]).some((f) => this.options[f] !== before[f])) flow.setOptions(this.options);
    flow.gba.tasks.reset();
    this.done();
  }

  /** The user's frame in the chosen type: its tiles and colors. */
  private loadFrame(): void {
    const frame = this.flow.assets.get(userFrame(this.options.frame));
    copyTiles(this.bgs[1], frame.tiles, FRAME_TILE, FRAME_TILES);
    this.flow.gba.palettes.load(frame.palette, FRAME_PALETTE * 16, 16);
  }

  /** PrintOptionMenuHeader. */
  private printHeader(win: Window): void {
    win.fill(1);
    printDefault(this.flow, win, FontId.Normal, this.flow.assets.text("gText_Option"), 8, 1);
    win.putTilemap();
  }

  /** DrawOptionMenuBg: the standard frame around the header, the user's frame around the options. */
  private drawFrames(bg: Background): void {
    const s = STD_FRAME_TILE;
    const p = STD_FRAME_PALETTE;
    fillBgRect(bg, s, 1, 2, 1, 1, p);
    fillBgRect(bg, s + 1, 2, 2, 27, 1, p);
    fillBgRect(bg, s + 2, 28, 2, 1, 1, p);
    fillBgRect(bg, s + 3, 1, 3, 1, 2, p);
    fillBgRect(bg, s + 5, 28, 3, 1, 2, p);
    fillBgRect(bg, s + 6, 1, 5, 1, 1, p);
    fillBgRect(bg, s + 7, 2, 5, 27, 1, p);
    fillBgRect(bg, s + 8, 28, 5, 1, 1, p);
    const f = FRAME_TILE;
    const q = FRAME_PALETTE;
    fillBgRect(bg, f, 1, 6, 1, 1, q);
    fillBgRect(bg, f + 1, 2, 6, 26, 1, q);
    fillBgRect(bg, f + 2, 28, 6, 1, 1, q);
    fillBgRect(bg, f + 3, 1, 7, 1, 16, q);
    fillBgRect(bg, f + 5, 28, 7, 1, 16, q);
    fillBgRect(bg, f + 6, 1, 19, 1, 1, q);
    fillBgRect(bg, f + 7, 2, 19, 26, 1, q);
    fillBgRect(bg, f + 8, 28, 19, 1, 1, q);
  }

  /** BufferOptionMenuString: a row's value in red, over its blank. */
  private printValue(row: number): void {
    const y = row * ROW_HEIGHT + 2;
    const font = this.flow.fonts[FontId.Normal];
    this.win.fillRect(1, VALUE_X, y, VALUE_WIDTH, font.maxLetterHeight);
    const value = this.valueText(row);
    if (value) this.win.print(font, VALUE_X, y, VALUE_COLORS, value);
    this.win.putTilemap();
    this.win.copyToVram();
  }

  private valueText(row: number): Text | null {
    const { field, values } = ROWS[row];
    if (!field) return null;
    const { assets } = this.flow;
    const value = this.options[field];
    if (values) return assets.text(values[value - 1]);
    return joinText(assets.text("gText_FrameType"), decimalText(value, NumberMode.LeftAlign, 2));
  }

  /** UpdateSettingSelectionDisplay: WIN0 over the picked row. */
  private showSelection(): void {
    const { win0 } = this.flow.gba.video;
    const top = this.cursor * ROW_HEIGHT + SELECTION_TOP;
    Object.assign(win0, { left: SELECTION_LEFT, right: SELECTION_RIGHT, top, bottom: top + this.flow.fonts[FontId.Normal].maxLetterHeight });
  }

  /** OptionMenu_PickSwitchCancel: the button hints, right-aligned. */
  private printTopBar(win: Window): void {
    const small = this.flow.fonts[FontId.Small];
    const text = this.flow.assets.text("gText_PickSwitchCancel");
    win.fill(15);
    win.print(small, TOP_BAR_RIGHT - small.width(text), 0, [15, 1, 2], text);
    win.putTilemap();
    win.copyToVram();
  }
}
