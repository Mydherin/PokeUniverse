// The POKéMON summary (pokemon_summary_screen.c), from the party menu's SUMMARY: the Pokémon's
// picture (bouncing more the healthier it is), name, level and gender on the left, and three
// pages stacked like cards: POKéMON INFO (number, species, types, OT, ID No., item, the trainer
// memo with its nature and where it was met), POKéMON SKILLS (HP and its bar, stats, EXP. and its
// bar, ability) and KNOWN MOVES (each move's type and PP). RIGHT slides the top page away, LEFT
// slides it back; UP and DOWN show the party's other Pokémon. A on KNOWN MOVES slides in the
// move details (type, power, accuracy, the Gen 4 category icon (phase-5 D10) and
// description), where A then A again SWITCHes two moves (mic-core saves it). The marks set at the
// PC show under the picture. Eggs and Pokérus come with breeding.

import type { Pokemon } from "@pokeuniverse/contracts/party/v1/party";
import { Nature } from "@pokeuniverse/contracts/pokemon/v1/nature";
import { Gender as MonGender } from "@pokeuniverse/contracts/pokemon/v1/pokemon";
import { Category } from "@pokeuniverse/contracts/move/v1/catalog";
import { Item } from "@pokeuniverse/contracts/item/v1/catalog";
import { ButtonMode } from "@pokeuniverse/contracts/trainer/v1/trainer";
import { toTiles } from "../gba/assets";
import { Button } from "../gba/input";
import { PALETTES_ALL } from "../gba/palette";
import type { AnimCmd, Sprite, SpriteTemplate } from "../gba/sprites";
import type { Task } from "../gba/tasks";
import { decimalText, expandDynamic, FontId, joinText, NumberMode, Window, type Text, type WindowTemplate } from "../gba/text";
import { Layer, RGB_BLACK, type Background } from "../gba/video";
import { isHM, moveInfo } from "../world/moves";
import { speciesInfo } from "../world/pokedex";
import { fillBgRect, initBg } from "./common";
import type { Flow } from "./flow";
import { hpBarLevel, HpBarLevel } from "./hp-bar";
import { BALL_ICONS, type GraphicId, type TextId } from "./manifest";
import { blitMenuInfoIcon, typeIcon } from "./menu-info";
import { MonIcon } from "./mon-icon";
import { ailmentOf, Ailment, monName, shownGender, type PartyHost } from "./party-menu";

/** Shows the summary of the party Pokémon in `slot`; `done` with the one shown last, once it faded out. */
export function startSummary(flow: Flow, host: PartyHost, slot: number, done: (last: number) => void, forget?: ForgetMode): void {
  new Summary(flow, host, slot, done, forget);
}

/**
 * PSS_MODE_SELECT_MOVE: only the move details, the new move in the fifth row; A picks a row (the
 * new move's, or B: FORGET_NONE) and it closes. HMs can't be picked.
 */
export interface ForgetMode {
  move: number;
  pick(row: number): void;
}

/** The new move's row: nothing is forgotten. */
export const FORGET_NONE = 4;

const enum Page {
  Info,
  Skills,
  Moves,
  MovesInfo,
}

/** Right is 1, left 0 (pageFlipDirection). */
const RIGHT = 1;
const LEFT = 0;

/** sWindowTemplates_Permanent_Bg1/Bg2: page name, controls, level and name; on BG1 or BG2, the same tiles. */
const PERMANENT_WINDOWS: WindowTemplate[] = [
  { left: 0, top: 0, width: 13, height: 2, palette: 7, baseBlock: 0x258 },
  { left: 19, top: 0, width: 11, height: 2, palette: 7, baseBlock: 0x272 },
  { left: 0, top: 2, width: 15, height: 2, palette: 7, baseBlock: 0x288 },
];
const PAGE_NAME = 0;
const CONTROLS = 1;
const LVL_NICK = 2;

/** sWindowTemplates_Info/Skills/Moves: windows 3 to 6 on BG0 (null: none). */
const PAGE_WINDOWS: Record<Page, (WindowTemplate | null)[]> = {
  [Page.Info]: [{ left: 15, top: 2, width: 15, height: 12, palette: 6, baseBlock: 0x001 }, { left: 1, top: 14, width: 28, height: 6, palette: 6, baseBlock: 0x0b5 }, null, null],
  [Page.Skills]: [
    { left: 20, top: 2, width: 10, height: 14, palette: 6, baseBlock: 0x001 },
    { left: 6, top: 12, width: 14, height: 4, palette: 6, baseBlock: 0x08d },
    { left: 1, top: 16, width: 29, height: 4, palette: 6, baseBlock: 0x0c5 },
    null,
  ],
  [Page.Moves]: [
    { left: 20, top: 2, width: 10, height: 18, palette: 8, baseBlock: 0x001 },
    { left: 0, top: 7, width: 15, height: 13, palette: 6, baseBlock: 0x0b5 },
    { left: 15, top: 2, width: 5, height: 18, palette: 6, baseBlock: 0x178 },
    { left: 6, top: 4, width: 9, height: 2, palette: 6, baseBlock: 0x1d2 },
  ],
  [Page.MovesInfo]: [],
};
PAGE_WINDOWS[Page.MovesInfo] = PAGE_WINDOWS[Page.Moves];

/** sLevelNickTextColors and sPrintMoveTextColors. */
const COLORS_TEXT = [0, 14, 10] as const;
const COLORS_HEADER = [0, 1, 2] as const;
const COLORS_MALE = [0, 9, 8] as const;
const COLORS_FEMALE = [0, 5, 4] as const;
const MOVE_COLORS = [
  [0, 7, 8],
  [0, 1, 2],
  [0, 3, 4],
  [0, 5, 6],
] as const;

/** PAGE_PROGRESS_BASE_TILE_NUM: the page dots at the top, on BG3. */
const PROGRESS_TILE = 345;
const PROGRESS: Record<Page, [number, number][]> = {
  // Columns 13 to 18: the top row's tiles (the bottom row is 16 further).
  [Page.Info]: [
    [13, 17],
    [14, 16],
    [15, 18],
    [16, 20],
    [17, 18],
    [18, 21],
  ],
  [Page.Skills]: [
    [13, 49],
    [14, 1],
    [15, 17],
    [16, 16],
    [17, 18],
    [18, 21],
  ],
  [Page.Moves]: [
    [13, 49],
    [14, 1],
    [15, 49],
    [16, 1],
    [17, 17],
    [18, 48],
  ],
  [Page.MovesInfo]: [
    [13, 49],
    [14, 1],
    [15, 49],
    [16, 1],
    [17, 50],
    [18, 48],
  ],
};
/** The bottom row's tile for a top one (Info and Skills put tile 19 under tile 1, not 17). */
const progressBottom = (top: number) => (top === 1 ? 19 : top + 16);

/** The summary's 5 background palettes; the shiny ones are its 6th and 7th. */
const BG_PALETTES = 5;

const BAR_TEMPLATE = (sheet: string, palette: string): SpriteTemplate => ({
  sheet,
  palette,
  width: 8,
  height: 8,
  priority: 2,
  anims: Array.from({ length: 12 }, (_, image) => [{ image, duration: 20 }, { jump: 0 }]),
});
const HP_BAR_TILES = 9;
const EXP_BAR_TILES = 11;
const HP_BAR_X = 172;
const EXP_BAR_X = 156;
/** How far the pages and the bars slide each frame. */
const FLIP_STEP = 60;
const FLIP_WIDTH = 240;

const STATUS_TEMPLATE: SpriteTemplate = {
  sheet: "summaryStatus",
  palette: "summaryStatus",
  width: 32,
  height: 8,
  priority: 0,
  anims: [0, 4, 8, 12, 16, 20, 24, 28].map((image) => [{ image, duration: 20 }, { jump: 0 }]),
};
/** The marks (CreateMonMarkingAllCombosSprite): one 32×8 image per combination, anim = markings. */
const MARKS_TEMPLATE: SpriteTemplate = {
  sheet: "summaryMarks",
  palette: "summaryMarks",
  width: 32,
  height: 8,
  priority: 0,
  anims: Array.from({ length: 16 }, (_, i) => [{ image: 4 * i, duration: 5 }, "end"] as AnimCmd[]),
};
const STAR_TEMPLATE: SpriteTemplate = { sheet: "summaryStar", palette: "summaryStar", width: 8, height: 8, priority: 0, anims: [[{ image: 1, duration: 20 }, { jump: 0 }]] };
const CURSOR_TEMPLATE = (sheet: string): SpriteTemplate => ({
  sheet,
  palette: "summaryCursor",
  width: 64,
  height: 32,
  priority: 0,
  anims: [
    [{ image: 0, duration: 20 }, { jump: 0 }],
    [{ image: 0x20, duration: 20 }, { jump: 0 }],
  ],
});
const BALL_TEMPLATE: SpriteTemplate = { sheet: "summaryBall", palette: "summaryBall", width: 16, height: 16, priority: 0 };
const PIC_TEMPLATE: SpriteTemplate = { sheet: "summaryPic", palette: "summaryPic", width: 64, height: 64, priority: 0 };
/** The Gen 4 category of the selected move (D10): physical, special or status, beside POWER and ACCURACY. */
const CATEGORY_TEMPLATE: SpriteTemplate = {
  sheet: "summaryCategory",
  palette: "summaryCategory",
  width: 16,
  height: 16,
  priority: 0,
  anims: [0, 4, 8].map((image) => [{ image, duration: 0 }, "end"]),
};
const CATEGORY_X = 104;
const CATEGORY_Y = 70;

/** sMonPicBounceYDelta_*: by vigor (under 60%, 60-80%, 80-99%, full HP). */
const BOUNCE = [
  [-1, 0, 1],
  [-2, -1, 0, 1, 2],
  [-3, -2, -1, 0, 1, 2, 3],
  [-5, -3, -1, 0, 1, 3, 5],
];

const MOVE_NAME_Y = (i: number) => i * 28 + 5;
const MOVE_PP_Y = (i: number) => i * 28 + 16;
const CURSOR_Y = (i: number) => i * 28 + 34;
/** The move list's last row: CANCEL. */
const CANCEL_ROW = 4;

/** GetNumberRightAlign: right-aligned in a `width`-pixel field, 6 pixels a character. */
const rightAlign = (width: number, text: Text) => width - (text.length - 1) * 6;

class Summary {
  private readonly bg0: Background;
  private readonly bg1: Background;
  private readonly bg2: Background;
  private readonly bg3: Background;
  private header: Window[] = [];
  private pageWins: (Window | null)[] = [];
  private page = Page.Info;
  private slot: number;
  private mon!: Pokemon;
  /** Which of BG1/BG2 slides (whichBgLayerToTranslate) and how far (flipPagesBgHofs). */
  private translate = 0;
  private hofs = 0;
  private flipping = false;
  private dir = RIGHT;
  /** A flip asked for while one runs (lastPageFlipDirection). */
  private queuedFlip: number | null = null;
  private flipTask: Task | null = null;
  private switchTask: Task | null = null;
  private inputHandler: () => void = () => {};
  /** The handler's state (state3270, selectMoveInputHandlerState). */
  private state = 0;
  private cursor = 0;
  private swapCursor = 0;
  private swapping = false;
  // Sprites
  private readonly hpBars: Sprite[] = [];
  private readonly expBars: Sprite[] = [];
  private readonly hpX: number[] = [];
  private readonly expX: number[] = [];
  private readonly cursors: Sprite[] = [];
  private readonly status: Sprite;
  private readonly star: Sprite;
  private readonly marks: Sprite;
  private readonly category: Sprite;
  /** The move details' cursors (and category icon) show. */
  private detailsShown = false;
  private pic: Sprite | null = null;
  private icon: MonIcon | null = null;
  private ball: Sprite | null = null;
  private bounces = 0;
  private bounceDelay = 0;
  private bounceFrame = 0;
  private vigor = 0;

  /** CB2_SetUpPSS: every step runs in the first frame. */
  constructor(
    private readonly flow: Flow,
    private readonly host: PartyHost,
    slot: number,
    private readonly done: (last: number) => void,
    private readonly forget?: ForgetMode,
  ) {
    const { gba, assets } = flow;
    this.slot = slot;
    this.mon = host.party.pokemon[slot];
    if (forget) this.page = Page.MovesInfo;
    gba.setVBlank(null);
    gba.reset();
    const { video, palettes, sprites } = gba;
    [this.bg0, this.bg1, this.bg2, this.bg3] = video.bgs;
    initBg(this.bg0, 1, 0);
    initBg(this.bg2, 1, 1);
    initBg(this.bg3, 0, 3);
    initBg(this.bg1, 1, 2);
    this.bg0.tiles = new Uint8Array(0x200 * 64);
    const bgTiles = new Uint8Array(0x300 * 64);
    bgTiles.set(assets.get("summaryBg").tiles.subarray(0, bgTiles.length));
    for (const bg of [this.bg1, this.bg2, this.bg3]) bg.tiles = bgTiles;
    for (const bg of video.bgs) bg.visible = true;
    // WIN1 shows the sprites only between lines 32 and 135 on the first three pages.
    Object.assign(video.win1, { left: 2, right: 240, top: 32, bottom: 135 });
    video.winIn1 = Layer.OBJ | Layer.BG0 | Layer.BG1 | Layer.BG2 | Layer.BG3;
    video.winOut = Layer.BG0 | Layer.BG1 | Layer.BG2 | Layer.BG3;
    this.updateWin1();

    // PokeSum_HandleLoadBgGfx.
    this.loadBgPalettes();
    palettes.load(assets.get("pokemonTypesPal").palette, 6 * 16, 16);
    palettes.load(assets.get("summaryTextHeaderPal").palette, 7 * 16, 16);
    palettes.load(assets.get("summaryTextMovesPal").palette, 8 * 16, 16);

    // PokeSum_HandleCreateSprites.
    const load = (tag: string, id: GraphicId, palette: Uint16Array = assets.get(id).palette) => {
      sprites.loadSheet(tag, assets.get(id).tiles);
      palettes.loadSpritePalette(tag, palette);
    };
    load("summaryStar", "summaryShinyStar");
    this.star = sprites.create(STAR_TEMPLATE, 106, 40, 0)!;
    // PokeSum_CreateMonMarkingsSprite: the box screen's marks sheet, with the summary's palette.
    load("summaryMarks", "markingCombo", assets.get("summaryMarkingPal").palette);
    this.marks = sprites.create(MARKS_TEMPLATE, 20, 91, 0)!;
    sprites.loadSheet("summaryCursorLeft", assets.get("summaryCursorLeft").tiles);
    sprites.loadSheet("summaryCursorRight", assets.get("summaryCursorRight").tiles);
    palettes.loadSpritePalette("summaryCursor", assets.get("summaryCursorPal").palette);
    for (let i = 0; i < 4; i++) {
      const c = sprites.create(CURSOR_TEMPLATE(i % 2 ? "summaryCursorRight" : "summaryCursorLeft"), 64 * (i % 2) + 152, CURSOR_Y(this.cursor), i % 2)!;
      c.subpriority = i;
      if (i > 1) c.startAnim(1);
      c.callback = () => this.cursorCallback();
      this.cursors.push(c);
    }
    load("summaryStatus", "summaryStatusIcons");
    this.status = sprites.create(STATUS_TEMPLATE, 0, 0, 0)!;
    const expBar = assets.get("summaryExpBar");
    sprites.loadSheet("summaryHpBar", assets.get("summaryHpBar").tiles);
    sprites.loadSheet("summaryExpBar", expBar.tiles);
    palettes.loadSpritePalette("summaryHpBar0", expBar.palette);
    palettes.loadSpritePalette("summaryHpBar1", assets.get("summaryHpBarYellowPal").palette);
    palettes.loadSpritePalette("summaryHpBar2", assets.get("summaryHpBarRedPal").palette);
    palettes.loadSpritePalette("summaryExpBar", expBar.palette);
    for (let i = 0; i < HP_BAR_TILES; i++) {
      this.hpX.push(HP_BAR_X + i * 8);
      this.hpBars.push(sprites.create(BAR_TEMPLATE("summaryHpBar", "summaryHpBar0"), this.hpX[i], 36, 0)!);
    }
    for (let i = 0; i < EXP_BAR_TILES; i++) {
      this.expX.push(EXP_BAR_X + i * 8);
      this.expBars.push(sprites.create(BAR_TEMPLATE("summaryExpBar", "summaryExpBar"), this.expX[i], 132, 0)!);
    }
    load("summaryCategory", "categoryIcons");
    this.category = sprites.create(CATEGORY_TEMPLATE, CATEGORY_X, CATEGORY_Y, 0)!;
    this.category.invisible = true;
    this.createMonSprites();
    this.updateHpBars();
    this.updateExpBars();
    this.showCursors(false);
    this.showBars(true);

    // PokeSum_CreateWindows, then the pages' text.
    this.header = PERMANENT_WINDOWS.map((t) => new Window(this.bg1, t));
    this.addPageWindows();
    this.printRightPane();
    this.printBottomPane();
    this.printAbilityOrMoveTypes();
    this.printMonTypes();
    this.setBg3(assets.get(forget ? "summaryMovesPage" : "summaryMovesInfoPage").map!);
    this.drawProgress();
    this.setMap(this.bg2, forget ? "summaryPageMoves" : "summaryPageInfo");
    this.setMap(this.bg1, forget ? "summaryPageMovesInfo" : "summaryPageSkills");
    palettes.blendPalettes(PALETTES_ALL, 16, RGB_BLACK);
    this.printHeader();
    for (const w of this.header) w.putTilemap();
    for (const w of [...this.header, ...this.pageWins]) w?.copyToVram();
    // Step 15: the first page's sprites.
    if (forget) {
      this.bg1.priority = 1;
      this.bg2.priority = 2;
      this.icon!.sprite.invisible = false;
      this.showCursors(true);
    } else {
      this.pic!.invisible = false;
      this.ball!.invisible = false;
      this.showBars(false);
    }
    this.showMarks(forget !== undefined);
    this.showStatus(false);
    this.showStar(false);

    this.inputHandler = forget ? () => this.forgetInput(forget) : () => this.infoInput();
    gba.tasks.create(() => this.inputHandler(), 0);
    gba.setVBlank(() => {
      gba.standardVBlank();
      this.vblank();
    });
    gba.setMain(() => flow.runFrame());
  }

  // Data

  private get party(): readonly Pokemon[] {
    return this.host.party.pokemon;
  }

  private get maxHp(): number {
    return this.mon.stats?.hp ?? 0;
  }

  /** The background's colors; the shiny ones for a shiny Pokémon. */
  private loadBgPalettes(): void {
    const { palettes } = this.flow.gba;
    const pal = this.flow.assets.get("summaryBg").palette;
    palettes.load(pal.subarray(0, BG_PALETTES * 16), 0, BG_PALETTES * 16);
    const [a, b] = this.mon.shiny ? [6, 5] : [0, 1];
    palettes.load(pal.subarray(a * 16, a * 16 + 16), 0, 16);
    palettes.load(pal.subarray(b * 16, b * 16 + 16), 16, 16);
  }

  private setMap(bg: Background, id: GraphicId): void {
    const map = this.flow.assets.get(id).map!;
    bg.map.fill(0);
    bg.map.set(map.subarray(0, Math.min(map.length, bg.map.length)));
  }

  private setBg3(map: Uint16Array): void {
    this.bg3.map.fill(0);
    this.bg3.map.set(map.subarray(0, Math.min(map.length, this.bg3.map.length)));
  }

  /** PokeSum_UpdateWin1ActiveFlag. */
  private updateWin1(): void {
    this.flow.gba.video.win1On = this.page !== Page.MovesInfo;
  }

  // Windows and text

  /** PokeSum_AddWindows: the permanent windows on the layer that will show, and the page's windows. */
  private addPageWindows(headerOn?: Background): void {
    if (headerOn) this.header = PERMANENT_WINDOWS.map((t) => new Window(headerOn, t));
    this.pageWins = PAGE_WINDOWS[this.page].map((t) => (t ? new Window(this.bg0, t) : null));
  }

  /** The permanent windows' layer for this flip (PokeSum_AddWindows' choice of Bg1 or Bg2). */
  private headerLayer(): Background {
    const higher2 = this.bg2.priority > this.bg1.priority;
    const onTop = (this.dir === RIGHT && this.page !== Page.MovesInfo) || (this.dir === LEFT && this.page === Page.Moves);
    return onTop === higher2 ? this.bg2 : this.bg1;
  }

  private win(i: number): Window | null {
    return this.pageWins[i - 3] ?? null;
  }

  private print(win: Window | null, font: FontId, x: number, y: number, colors: readonly [number, number, number], text: Text): void {
    win?.print(this.flow.fonts[font], x, y, colors, text);
  }

  /** PokeSum_PrintPageHeaderText. */
  private printHeader(): void {
    const page: TextId = this.page === Page.Info ? "gText_PokeSum_PageName_PokemonInfo" : this.page === Page.Skills ? "gText_PokeSum_PageName_PokemonSkills" : "gText_PokeSum_PageName_KnownMoves";
    const controls: TextId =
      this.page === Page.Info
        ? "gText_PokeSum_Controls_PageCancel"
        : this.page === Page.Skills
          ? "gText_PokeSum_Controls_Page"
          : this.page === Page.Moves
            ? "gText_PokeSum_Controls_PageDetail"
            : this.forget
              ? "gText_PokeSum_Controls_PickDelete"
              : "gText_PokeSum_Controls_PickSwitch";
    this.printPageName(page);
    this.printControls(controls);
    this.printLevelNick();
  }

  private printPageName(id: TextId): void {
    const win = this.header[PAGE_NAME];
    win.fill(0);
    this.print(win, FontId.Normal, 4, 1, COLORS_HEADER, this.flow.assets.text(id));
    win.putTilemap();
  }

  private printControls(id: TextId): void {
    const win = this.header[CONTROLS];
    const text = this.flow.assets.text(id);
    win.fill(0);
    this.print(win, FontId.Small, 0x54 - this.flow.fonts[FontId.Small].width(text, 0), 0, COLORS_HEADER, text);
    win.putTilemap();
  }

  /** PrintMonLevelNickOnWindow2: level (not on the move details), name, gender. */
  private printLevelNick(): void {
    const { assets } = this.flow;
    const win = this.header[LVL_NICK];
    const mon = this.mon;
    win.fill(0);
    if (this.page !== Page.MovesInfo) this.print(win, FontId.Normal, 4, 2, COLORS_HEADER, joinText(assets.text("gText_Lv"), decimalText(mon.level, NumberMode.LeftAlign, 3)));
    this.print(win, FontId.Normal, 40, 2, COLORS_HEADER, monName(this.flow, mon));
    const gender = shownGender(mon);
    if (gender === MonGender.FEMALE) this.print(win, FontId.Normal, 105, 2, COLORS_FEMALE, assets.text("gText_FemaleSymbol"));
    else if (gender === MonGender.MALE) this.print(win, FontId.Normal, 105, 2, COLORS_MALE, assets.text("gText_MaleSymbol"));
    win.putTilemap();
  }

  /** PokeSum_PrintRightPaneText. */
  private printRightPane(): void {
    const win = this.win(3);
    win?.fill(0);
    if (this.page === Page.Info) this.printInfo();
    else if (this.page === Page.Skills) this.printSkills();
    else this.printMoves();
    win?.putTilemap();
  }

  /** PrintInfoPage: number, species, OT, ID No., item. */
  private printInfo(): void {
    const { assets } = this.flow;
    const mon = this.mon;
    const win = this.win(3);
    const dex = mon.species > 151 && !this.host.nationalDex ? assets.text("gText_PokeSum_DexNoUnknown") : decimalText(mon.species, NumberMode.LeadingZeros, 3);
    this.print(win, FontId.Normal, 47, 19, COLORS_TEXT, assets.species(mon.species).name);
    this.print(win, FontId.Normal, 47, 5, COLORS_TEXT, dex);
    this.print(win, FontId.Normal, 47, 49, COLORS_TEXT, this.flow.encode(mon.otName));
    this.print(win, FontId.Normal, 47, 64, COLORS_TEXT, decimalText(mon.otIdNo, NumberMode.LeadingZeros, 5));
    const item = mon.heldItem === Item.UNSPECIFIED ? assets.text("gText_PokeSum_Item_None") : assets.itemName(mon.heldItem);
    this.print(win, FontId.Normal, 47, 79, COLORS_TEXT, item);
  }

  /** PrintSkillsPage: HP, stats, EXP. and to the next level, right-aligned. */
  private printSkills(): void {
    const { assets } = this.flow;
    const mon = this.mon;
    const win = this.win(3);
    const s = mon.stats;
    const hp = joinText(decimalText(mon.hp, NumberMode.LeftAlign, 3), assets.text("gText_Slash"), decimalText(this.maxHp, NumberMode.LeftAlign, 3));
    this.print(win, FontId.Normal, 14 + rightAlign(63, hp), 4, COLORS_TEXT, hp);
    [s?.attack, s?.defense, s?.spAttack, s?.spDefense, s?.speed].forEach((v, i) => {
      const text = decimalText(v ?? 0, NumberMode.LeftAlign, 3);
      this.print(win, FontId.Normal, 50 + rightAlign(27, text), 22 + i * 13, COLORS_TEXT, text);
    });
    const exp = decimalText(mon.exp, NumberMode.LeftAlign, 7);
    const toNext = decimalText(mon.level < 100 ? mon.nextLevelExp - mon.exp : 0, NumberMode.LeftAlign, 7);
    this.print(win, FontId.Normal, 15 + rightAlign(63, exp), 87, COLORS_TEXT, exp);
    this.print(win, FontId.Normal, 15 + rightAlign(63, toNext), 100, COLORS_TEXT, toNext);
  }

  /** PrintMovesPage: the four moves (and CANCEL on the details). */
  private printMoves(): void {
    for (let i = 0; i < 4; i++) this.printMove(i);
    if (this.forget) this.printMove(CANCEL_ROW);
    else if (this.page === Page.MovesInfo) this.print(this.win(3), FontId.Normal, 3, MOVE_NAME_Y(CANCEL_ROW), MOVE_COLORS[0], this.flow.assets.text("gFameCheckerText_Cancel"));
  }

  /** A row's move: a known one, or the new one in the forget mode's last row (BufferMonMoveI). */
  private moveAt(row: number): { move: number; pp: number; maxPp: number } | undefined {
    if (row !== CANCEL_ROW || !this.forget) return this.mon.moves[row];
    const pp = moveInfo(this.forget.move).pp;
    return { move: this.forget.move, pp, maxPp: pp };
  }

  /** PokeSum_PrintMoveName: the name, then PP colored by how much is left. */
  private printMove(i: number): void {
    const { assets } = this.flow;
    const win = this.win(3);
    const move = this.moveAt(i);
    if (!move?.move) {
      this.print(win, FontId.Normal, 3, MOVE_NAME_Y(i), MOVE_COLORS[0], assets.text("gText_PokeSum_OneHyphen"));
      this.print(win, FontId.Normal, 36, MOVE_PP_Y(i), MOVE_COLORS[0], assets.text("gText_PokeSum_PP"));
      const none = assets.text("gText_PokeSum_TwoHyphens");
      this.print(win, FontId.Normal, 46 + rightAlign(12, none), MOVE_PP_Y(i), MOVE_COLORS[0], none);
      return;
    }
    const { pp, maxPp } = move;
    let color = 0;
    if (pp === maxPp) color = 0;
    else if (pp === 0) color = 3;
    else if (maxPp === 3) color = pp === 2 ? 2 : pp === 1 ? 1 : 0;
    else if (maxPp === 2) color = pp === 1 ? 1 : 0;
    else if (pp <= Math.trunc(maxPp / 4)) color = 2;
    else if (pp <= Math.trunc(maxPp / 2)) color = 1;
    const colors = MOVE_COLORS[color];
    const cur = decimalText(pp, NumberMode.LeftAlign, 3);
    const max = decimalText(maxPp, NumberMode.LeftAlign, 3);
    this.print(win, FontId.Normal, 3, MOVE_NAME_Y(i), MOVE_COLORS[0], assets.moveName(move.move));
    this.print(win, FontId.Normal, 36, MOVE_PP_Y(i), colors, assets.text("gText_PokeSum_PP"));
    this.print(win, FontId.Normal, 46 + rightAlign(12, cur), MOVE_PP_Y(i), colors, cur);
    this.print(win, FontId.Normal, 58, MOVE_PP_Y(i), colors, assets.text("gText_Slash"));
    this.print(win, FontId.Normal, 64 + rightAlign(12, max), MOVE_PP_Y(i), colors, max);
  }

  /** PokeSum_PrintBottomPaneText: the trainer memo, EXP. labels, or the selected move's stats. */
  private printBottomPane(): void {
    const win = this.win(4);
    win?.fill(0);
    const { assets } = this.flow;
    if (this.page === Page.Info) this.printTrainerMemo();
    else if (this.page === Page.Skills) {
      this.print(win, FontId.Normal, 26, 7, COLORS_TEXT, assets.text("gText_PokeSum_ExpPoints"));
      this.print(win, FontId.Normal, 26, 20, COLORS_TEXT, assets.text("gText_PokeSum_NextLv"));
    } else if (this.page === Page.MovesInfo) this.printMoveStats();
    win?.putTilemap();
  }

  /**
   * PokeSum_PrintTrainerMemo_Mon: its nature, and where and at what level it was met; "Apparently
   * met" when the trainer isn't its OT. Met maps get their names with catching (Phase 7).
   */
  private printTrainerMemo(): void {
    const { flow } = this;
    const { assets } = flow;
    const mon = this.mon;
    const level = decimalText(mon.metLevel || 5, NumberMode.LeftAlign, 3);
    const nature = assets.natureName(mon.nature || Nature.HARDY);
    const ownOt = mon.otIdNo === flow.trainer?.idNo && mon.otName === flow.trainer?.name;
    let text: TextId;
    if (!mon.metMap) text = "gText_PokeSum_FatefulEncounterMet";
    else if (ownOt) text = "gText_PokeSum_Met";
    else text = "gText_PokeSum_ApparentlyMet";
    const memo = expandDynamic(assets.text(text), [nature, level, assets.text("gText_Somewhere")]);
    this.win(4)?.print(flow.fonts[FontId.Normal], 0, 3, COLORS_TEXT, memo, 0, 0);
  }

  /** PokeSum_PrintSelectedMoveStats: power, accuracy and description (none on CANCEL). */
  private printMoveStats(): void {
    const move = this.moveAt(this.cursor)?.move;
    if (!move) return;
    const { assets } = this.flow;
    const info = moveInfo(move);
    const hyphens = assets.text("gText_ThreeHyphens");
    const win = this.win(4);
    this.print(win, FontId.Normal, 57, 1, COLORS_TEXT, info.power <= 1 ? hyphens : decimalText(info.power, NumberMode.RightAlign, 3));
    this.print(win, FontId.Normal, 57, 15, COLORS_TEXT, info.accuracy === 0 ? hyphens : decimalText(info.accuracy, NumberMode.RightAlign, 3));
    win?.print(this.flow.fonts[FontId.Normal], 7, 42, COLORS_TEXT, assets.moveDescription(move), 0, 0);
  }

  /** PokeSum_PrintAbilityDataOrMoveTypes: the ability and its description, or each move's type. */
  private printAbilityOrMoveTypes(): void {
    const win = this.win(5);
    const { flow } = this;
    if (this.page === Page.Skills) {
      win?.fill(0);
      this.print(win, FontId.Normal, 66, 1, COLORS_TEXT, flow.assets.abilityName(this.mon.ability));
      this.print(win, FontId.Normal, 2, 15, COLORS_TEXT, flow.assets.abilityDescription(this.mon.ability));
    } else if (this.page !== Page.Info && win) {
      win.fill(0);
      this.mon.moves.forEach((m, i) => {
        if (m.move) blitMenuInfoIcon(flow, win, typeIcon(moveInfo(m.move).type), 3, MOVE_NAME_Y(i));
      });
      if (this.forget) blitMenuInfoIcon(flow, win, typeIcon(moveInfo(this.forget.move).type), 3, MOVE_NAME_Y(CANCEL_ROW));
    }
    win?.putTilemap();
  }

  /** PokeSum_PrintMonTypeIcons: on INFO and on the move details. */
  private printMonTypes(): void {
    const info = speciesInfo(this.mon.species);
    const [a, b] = [info.type1, info.type2];
    if (this.page === Page.Info) {
      const win = this.win(3);
      if (!win) return;
      blitMenuInfoIcon(this.flow, win, typeIcon(a), 47, 35);
      if (a !== b) blitMenuInfoIcon(this.flow, win, typeIcon(b), 83, 35);
    } else if (this.page === Page.MovesInfo) {
      const win = this.win(6)!;
      win.fill(0);
      blitMenuInfoIcon(this.flow, win, typeIcon(a), 0, 3);
      if (a !== b) blitMenuInfoIcon(this.flow, win, typeIcon(b), 36, 3);
      win.putTilemap();
    }
  }

  /** PokeSum_DrawPageProgressTiles. */
  private drawProgress(): void {
    if (this.forget) {
      fillBgRect(this.bg3, PROGRESS_TILE + 1, 13, 0, 4, 1, 0);
      fillBgRect(this.bg3, PROGRESS_TILE + 19, 13, 1, 4, 1, 0);
      return;
    }
    for (const [x, top] of PROGRESS[this.page]) {
      fillBgRect(this.bg3, PROGRESS_TILE + top, x, 0, 1, 1, 0);
      fillBgRect(this.bg3, PROGRESS_TILE + progressBottom(top), x, 1, 1, 1, 0);
    }
  }

  private copyWindows(): void {
    for (const w of [...this.header, ...this.pageWins]) w?.copyToVram();
  }

  // Sprites

  /** The ball, icon and picture of the Pokémon shown (CreateBallIconObj, PokeSum_CreateMonIconSprite, PokeSum_CreateMonPicSprite). */
  private createMonSprites(): void {
    const { flow } = this;
    const { gba, assets } = flow;
    const mon = this.mon;
    const ballId = BALL_ICONS[mon.ball - 1] ?? "ballPoke";
    gba.sprites.loadSheet("summaryBall", assets.get(ballId).tiles);
    gba.palettes.freeSpritePalette("summaryBall");
    gba.palettes.loadSpritePalette("summaryBall", assets.get(ballId).palette);
    this.ball = gba.sprites.create(BALL_TEMPLATE, 106, 88, 0)!;
    this.ball.invisible = true;

    this.icon = new MonIcon(flow, mon.species, 24, 32, 0, 1);
    this.icon.sprite.callback = () => {};
    this.icon.sprite.hFlip = !assets.species(mon.species).noFlip;
    this.icon.sprite.invisible = true;

    const art = assets.loadedPokemonArt(mon.species);
    gba.sprites.loadSheet("summaryPic", art ? toTiles(art.front) : new Uint8Array(0));
    gba.palettes.freeSpritePalette("summaryPic");
    gba.palettes.loadSpritePalette("summaryPic", (mon.shiny ? art?.shinyPalette : art?.frontPalette) ?? new Uint16Array(16));
    this.pic = gba.sprites.create(PIC_TEMPLATE, 60, 65, 12)!;
    this.pic.hFlip = !assets.species(mon.species).noFlip;
    this.pic.invisible = true;
    this.setPicCallback();
  }

  private destroyMonSprites(): void {
    const { gba } = this.flow;
    gba.sprites.destroy(this.pic);
    this.icon?.destroy(this.flow);
    gba.sprites.destroy(this.ball);
    gba.palettes.freeSpritePalette(`monIcon${this.mon.species}`);
    this.pic = this.ball = null;
    this.icon = null;
  }

  /** PokeSum_SetMonPicSpriteCallback: two bounces, stronger with more HP; none with a status condition. */
  private setPicCallback(): void {
    this.bounces = 0;
    this.bounceDelay = 0;
    this.bounceFrame = 0;
    const ailment = ailmentOf(this.mon);
    if (ailment !== Ailment.None && ailment !== Ailment.Pokerus) return;
    const hp = this.mon.hp;
    const max = this.maxHp;
    this.vigor = hp === max ? 3 : max * 0.8 <= hp ? 2 : max * 0.6 <= hp ? 1 : 0;
    this.pic!.callback = (s) => {
      if (this.bounces >= 2 || this.bounceDelay++ < 2) return;
      const deltas = BOUNCE[this.vigor];
      s.y += deltas[this.bounceFrame++];
      if (this.bounceFrame >= deltas.length) {
        this.bounceFrame = 0;
        this.bounces++;
      }
      this.bounceDelay = 0;
    };
  }

  /** UpdateHpBarObjs: the bar's tiles filled in sixths of a tile, green, yellow or red. */
  private updateHpBars(): void {
    const { palettes } = this.flow.gba;
    const hp = this.mon.hp;
    const max = this.maxHp;
    const level = hpBarLevel(hp, max);
    const color = level === HpBarLevel.Yellow ? 1 : level === HpBarLevel.Red ? 2 : 0;
    for (const s of this.hpBars) s.paletteNum = palettes.spritePaletteSlot(`summaryHpBar${color}`) & 15;
    const perTile = Math.trunc((max * 4) / 6);
    if (hp >= max) for (let i = 2; i < 8; i++) this.hpBars[i].startAnim(8);
    else if (perTile === 0) for (let i = 2; i < 8; i++) this.hpBars[i].startAnim(0);
    else {
      let points = hp * 4;
      let whole = 0;
      while (points > perTile) {
        points -= perTile;
        whole++;
      }
      whole += 2;
      for (let i = 2; i < whole; i++) this.hpBars[i].startAnim(8);
      this.hpBars[whole]?.startAnim(Math.trunc((points * 6) / perTile));
      for (let i = whole + 1; i < 8; i++) this.hpBars[i].startAnim(0);
    }
    this.hpBars[0].startAnim(9);
    this.hpBars[1].startAnim(10);
    this.hpBars[8].startAnim(11);
  }

  /** UpdateExpBarObjs: the way to the next level in eighths of a tile; empty at Lv. 100. */
  private updateExpBars(): void {
    const mon = this.mon;
    const bars = this.expBars;
    if (mon.level < 100) {
      const total = mon.nextLevelExp - mon.levelExp;
      const done = mon.exp - mon.levelExp;
      const perTile = Math.max(1, Math.trunc((total * 4) / 8));
      let points = done * 4;
      let whole = 0;
      while (points > perTile) {
        points -= perTile;
        whole++;
      }
      whole += 2;
      for (let i = 2; i < whole; i++) bars[i].startAnim(8);
      let skip = false;
      if (whole >= 10) {
        if (total === done) skip = true;
        else bars[9].startAnim(7);
      }
      if (!skip) {
        bars[whole]?.startAnim(Math.trunc((points * 8) / perTile));
        for (let i = whole + 1; i < 10; i++) bars[i].startAnim(0);
      }
    } else for (let i = 2; i < 10; i++) bars[i].startAnim(0);
    bars[0].startAnim(9);
    bars[1].startAnim(10);
    bars[10].startAnim(11);
  }

  private showBars(invisible: boolean): void {
    for (const s of [...this.hpBars, ...this.expBars]) s.invisible = invisible;
  }

  /** ShowOrHideStatusIcon: at its place for the page. */
  private showStatus(invisible: boolean): void {
    const ailment = ailmentOf(this.mon);
    this.status.invisible = ailment === Ailment.None || invisible;
    if (ailment !== Ailment.None) this.status.startAnim(ailment - 1);
    this.status.x = 16;
    this.status.y = this.page === Page.MovesInfo ? 45 : 38;
  }

  /** HideShowShinyStar. */
  private showStar(invisible: boolean): void {
    this.star.invisible = !this.mon.shiny || invisible;
    [this.star.x, this.star.y] = this.page === Page.MovesInfo ? [8, 24] : [106, 40];
  }

  /** PokeSum_ShowOrHideMonMarkingsSprite (and PokeSum_UpdateMonMarkingsAnim): never shown without marks. */
  private showMarks(invisible: boolean): void {
    const markings = this.mon.markings;
    this.marks.startAnim(markings);
    this.marks.invisible = markings === 0 || invisible;
  }

  /** ShoworHideMoveSelectionCursor, with the category icon. */
  private showCursors(visible: boolean): void {
    for (const c of this.cursors) c.invisible = !visible;
    this.detailsShown = visible;
    this.updateCategory();
  }

  /** The selected move's category (D10), with the move details' cursor. */
  private updateCategory(): void {
    const move = this.moveAt(this.cursor)?.move;
    const category = move ? moveInfo(move).category : Category.UNSPECIFIED;
    const shown = this.detailsShown && this.page === Page.MovesInfo && category !== Category.UNSPECIFIED;
    this.category.invisible = !shown;
    if (shown) this.category.startAnim(category - 1);
  }

  /** SpriteCB_MoveSelectionCursor: the cursors follow the selection; while switching, the red one blinks. */
  private cursorCallback(): void {
    for (let i = 0; i < 4; i++) if (!(this.swapping && i > 1)) this.cursors[i].y = CURSOR_Y(this.cursor);
    if (!this.swapping) {
      if (this.page === Page.MovesInfo) this.cursors[0].invisible = this.cursors[1].invisible = false;
      return;
    }
    for (let i = 0; i < 2; i++) {
      const s = this.cursors[i];
      s.data[0]++;
      if (s.data[0] > 60) {
        s.invisible = !s.invisible;
        s.data[0] = 0;
      }
    }
  }

  /** PokeSum_HideSpritesBeforePageFlip: what the page left behind stops showing. */
  private hideSpritesBeforeFlip(): void {
    switch (this.leftPage()) {
      case Page.Skills:
        this.showBars(true);
        break;
      case Page.Moves:
        if (this.dir === RIGHT) {
          this.pic!.invisible = true;
          this.showMarks(true);
          this.ball!.invisible = true;
          this.showStatus(true);
          this.showStar(true);
        }
        break;
      case Page.MovesInfo:
        this.showCursors(false);
        this.icon!.sprite.invisible = true;
        this.showStatus(true);
        this.showStar(true);
        break;
    }
  }

  /** PokeSum_ShowSpritesBeforePageFlip. */
  private showSpritesBeforeFlip(): void {
    switch (this.leftPage()) {
      case Page.Info:
        this.showBars(false);
        break;
      case Page.Moves:
        if (this.dir === LEFT) this.showBars(false);
        else {
          this.showCursors(true);
          this.icon!.sprite.invisible = false;
          this.showStar(false);
        }
        break;
      case Page.MovesInfo:
        this.pic!.invisible = false;
        this.showMarks(false);
        this.ball!.invisible = false;
        this.showStatus(false);
        this.showStar(false);
        break;
    }
  }

  /** The page the flip comes from. */
  private leftPage(): Page {
    return this.dir === RIGHT ? this.page - 1 : this.page + 1;
  }

  // Input

  /** Task_InputHandler_Info: fade in, cry, then pages, Pokémon and leaving. */
  private infoInput(): void {
    const { flow } = this;
    const { input, palettes } = flow.gba;
    switch (this.state) {
      case 0:
        palettes.beginFade(PALETTES_ALL, 0, 16, 0, RGB_BLACK);
        this.state = 1;
        return;
      case 1:
        if (palettes.fadeActive) return;
        this.playCry();
        this.state = 2;
        return;
      case 2:
        break;
      case 3:
        palettes.beginFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
        this.state = 4;
        return;
      default:
        if (palettes.fadeActive) return;
        return this.exit();
    }
    if (this.switchTask) return;
    if (this.page !== Page.MovesInfo) {
      for (const dir of [RIGHT, LEFT]) {
        if (!this.isFlipInput(dir)) continue;
        if (this.flipTask) {
          this.queuedFlip = dir;
          return;
        }
        if (dir === RIGHT ? this.page < Page.Moves : this.page > Page.Info) {
          flow.play("se_select");
          this.bg0.visible = false;
          this.dir = dir;
          this.page += dir === RIGHT ? 1 : -1;
          this.flipTask = flow.gba.tasks.create(() => this.flipStep(), 0);
        }
        return;
      }
    }
    if (this.flipTask) return;
    if (input.isPressed(Button.Up)) return this.seekMon(-1);
    if (input.isPressed(Button.Down)) return this.seekMon(1);
    if (input.isPressed(Button.A)) {
      if (this.page === Page.Info) {
        flow.play("se_select");
        this.state = 3;
      } else if (this.page === Page.Moves) {
        flow.play("se_select");
        this.dir = RIGHT;
        this.page = Page.MovesInfo;
        this.flipStepNum = 0;
        this.inputHandler = () => this.flipFromInfoStep();
      }
      return;
    }
    if (input.isPressed(Button.B)) this.state = 3;
  }

  /** IsPageFlipInput: RIGHT or LEFT (and R or L in the LR button mode); a flip asked for during the last one counts. */
  private isFlipInput(dir: number): boolean {
    if (this.queuedFlip === dir) {
      this.queuedFlip = null;
      return true;
    }
    if (this.flipTask && this.dir !== dir) return false;
    const { input } = this.flow.gba;
    const lr = this.flow.options.buttonMode === ButtonMode.LR;
    if (dir === RIGHT) return input.isPressed(Button.Right) || (lr && input.isPressed(Button.R));
    return input.isPressed(Button.Left) || (lr && input.isPressed(Button.L));
  }

  /** Task_HandleInput_SelectMove: the move details' cursor, SWITCH, and back to KNOWN MOVES. */
  private selectMoveInput(): void {
    const { flow } = this;
    const { input } = flow.gba;
    const moves = this.mon.moves;
    const has = (i: number) => !!moves[i]?.move;
    if (this.state === 1) {
      this.state = 0;
      this.flipStepNum = 0;
      this.inputHandler = () => this.backOutStep();
      return;
    }
    if (this.state === 2) {
      this.printRightPane();
      this.printBottomPane();
      this.printAbilityOrMoveTypes();
      this.state = 3;
      return;
    }
    if (this.state === 3) {
      this.copyWindows();
      this.updateCategory();
      this.state = 0;
      return;
    }
    if (input.isPressed(Button.Up)) {
      flow.play("se_select");
      this.state = 2;
      if (this.cursor > 0) {
        for (let i = this.cursor; i > 0; i--) if (has(i - 1)) return void (this.cursor = i - 1);
      } else {
        this.cursor = CANCEL_ROW;
        if (this.swapping) for (let i = this.cursor; i > 0; i--) if (has(i - 1)) return void (this.cursor = i - 1);
      }
    } else if (input.isPressed(Button.Down)) {
      if (this.cursor < CANCEL_ROW) {
        this.state = 2;
        let last = CANCEL_ROW;
        if (this.swapping) {
          if (this.cursor === 3) {
            flow.play("se_select");
            this.cursor = 0;
            return;
          }
          last--;
        }
        flow.play("se_select");
        let i = this.cursor;
        for (; i < last; i++) if (has(i + 1)) return void (this.cursor = i + 1);
        this.cursor = this.swapping ? 0 : i;
      } else {
        this.cursor = 0;
        this.state = 2;
        flow.play("se_select");
      }
    } else if (input.isPressed(Button.A)) {
      flow.play("se_select");
      if (this.cursor === CANCEL_ROW) return this.leaveMoveDetails();
      if (this.host.movesLocked) return;
      if (!this.swapping) {
        this.swapCursor = this.cursor;
        this.swapping = true;
        return;
      }
      this.swapping = false;
      if (this.cursor === this.swapCursor) return;
      this.host.swapMoves(this.slot, this.cursor, this.swapCursor);
      this.mon = this.party[this.slot];
      this.state = 2;
    } else if (input.isPressed(Button.B)) {
      if (this.swapping) {
        this.swapCursor = this.cursor;
        this.swapping = false;
        return;
      }
      this.leaveMoveDetails();
    }
  }

  /** Task_InputHandler_SelectOrForgetMove. */
  private forgetInput(forget: ForgetMode): void {
    const { flow } = this;
    const { gba } = flow;
    const { input, palettes } = gba;
    const known = (i: number) => !!this.mon.moves[i]?.move;
    switch (this.state) {
      case 0:
        palettes.beginFade(PALETTES_ALL, 0, 16, 0, RGB_BLACK);
        this.state = 1;
        return;
      case 1:
        if (palettes.fadeActive) return;
        this.playCry();
        this.state = 2;
        return;
      case 2: {
        if (input.isPressed(Button.Up | Button.Down)) {
          flow.play("se_select");
          this.state = 3;
          const up = input.isPressed(Button.Up);
          let row = this.cursor;
          do row = (row + (up ? CANCEL_ROW : 1)) % (CANCEL_ROW + 1);
          while (row !== CANCEL_ROW && !known(row));
          this.cursor = row;
        } else if (input.isPressed(Button.A)) {
          // PokeSum_CanForgetSelectedMove.
          if (this.cursor < CANCEL_ROW && isHM(this.mon.moves[this.cursor].move)) {
            flow.play("se_failure");
            const win = this.win(4);
            win?.fill(0);
            win?.print(flow.fonts[FontId.Normal], 7, 42, COLORS_TEXT, flow.assets.text("gText_PokeSum_HmMovesCantBeForgotten"), 0, 0);
            this.copyWindows();
            return;
          }
          flow.play("se_select");
          forget.pick(this.cursor);
          this.state = 5;
        } else if (input.isPressed(Button.B)) {
          forget.pick(FORGET_NONE);
          this.state = 5;
        }
        return;
      }
      case 3:
        this.printRightPane();
        this.printBottomPane();
        this.printAbilityOrMoveTypes();
        this.state = 4;
        return;
      case 4:
        this.copyWindows();
        this.updateCategory();
        this.state = 2;
        return;
      case 5:
        palettes.beginFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
        this.state = 6;
        return;
      default:
        if (!palettes.fadeActive) this.exit();
    }
  }

  /** Back to KNOWN MOVES (A on CANCEL or B): the details slide away. */
  private leaveMoveDetails(): void {
    if (this.cursor === CANCEL_ROW) this.cursor = this.swapCursor = 0;
    this.swapping = false;
    this.showCursors(false);
    this.dir = LEFT;
    this.page = Page.Moves;
    this.state = 1;
  }

  // Page flips

  private flipStepNum = 0;

  /** Task_PokeSum_FlipPages: between INFO, SKILLS and KNOWN MOVES. */
  private flipStep(): void {
    switch (this.flipStepNum) {
      case 0:
        this.hideSpritesBeforeFlip();
        this.showSpritesBeforeFlip();
        this.updateWin1();
        this.addPageWindows(this.headerLayer());
        break;
      case 1:
        if (!(this.page === Page.Moves && this.dir === LEFT)) fillBgRect(this.bg0, 0, 0, 0, 30, 20, 0);
        this.clearHeaders();
        break;
      case 2:
        this.copyNewTilemap2();
        this.copyNewTilemap();
        this.drawProgress();
        this.printHeader();
        break;
      case 3:
        this.copyWindows();
        break;
      case 4:
        break;
      case 5:
        this.initFlipCoords();
        this.flipping = true;
        break;
      case 6:
        if (!this.isFlipFinished()) return;
        break;
      case 7:
        this.printRightPane();
        if (this.page !== Page.MovesInfo) this.printBottomPane();
        this.printAbilityOrMoveTypes();
        this.printMonTypes();
        break;
      case 8:
        this.copyWindows();
        break;
      case 9:
        this.bg0.visible = true;
        break;
      default:
        this.flow.gba.tasks.destroy(this.flipTask!);
        this.flipTask = null;
        this.flipStepNum = 0;
        return;
    }
    this.flipStepNum++;
  }

  /** Task_FlipPages_FromInfo: the move details slide in over KNOWN MOVES. */
  private flipFromInfoStep(): void {
    switch (this.flipStepNum) {
      case 0:
        this.addPageWindows(this.headerLayer());
        break;
      case 1:
        this.clearHeaders();
        break;
      case 2:
        this.hideSpritesBeforeFlip();
        this.updateWin1();
        this.copyNewTilemap();
        this.drawProgress();
        this.copyNewTilemap2();
        break;
      case 3:
        this.printPageName("gText_PokeSum_PageName_KnownMoves");
        this.printControls("gText_PokeSum_Controls_PickSwitch");
        break;
      case 4:
      case 5:
        this.copyWindows();
        break;
      case 6:
        this.printRightPane();
        this.printAbilityOrMoveTypes();
        this.copyWindows();
        break;
      case 7:
        this.initFlipCoords();
        this.flipping = true;
        break;
      case 8:
        if (!this.isFlipFinished()) return;
        this.printBottomPane();
        this.copyWindows();
        break;
      case 9:
        this.printMonTypes();
        this.printLevelNick();
        break;
      case 10:
        this.showSpritesBeforeFlip();
        this.copyWindows();
        break;
      case 11:
        break;
      default:
        this.flipStepNum = 0;
        this.state = 0;
        this.inputHandler = () => this.selectMoveInput();
        return;
    }
    this.flipStepNum++;
  }

  /** Task_BackOutOfSelectMove: the move details slide away, KNOWN MOVES is back. */
  private backOutStep(): void {
    const { assets } = this.flow;
    switch (this.flipStepNum) {
      case 0:
        this.addPageWindows(this.headerLayer());
        break;
      case 1:
        this.clearHeaders();
        break;
      case 2:
        this.copyNewTilemap2();
        break;
      case 3:
        this.printRightPane();
        this.printBottomPane();
        this.printAbilityOrMoveTypes();
        this.copyWindows();
        break;
      case 4:
        this.printPageName("gText_PokeSum_PageName_KnownMoves");
        this.printControls("gText_PokeSum_Controls_PageDetail");
        break;
      case 5:
        this.copyWindows();
        break;
      case 6:
        this.initFlipCoords();
        this.flipping = true;
        this.hideSpritesBeforeFlip();
        this.updateWin1();
        this.printMonTypes();
        break;
      case 7:
        break;
      case 8:
        if (!this.isFlipFinished()) return;
        this.printLevelNick();
        break;
      case 9:
        this.copyWindows();
        break;
      case 10:
        this.setBg3(assets.get("summaryMovesInfoPage").map!);
        this.drawProgress();
        this.showSpritesBeforeFlip();
        break;
      default:
        this.flipStepNum = 0;
        this.state = 2;
        this.inputHandler = () => this.infoInput();
        return;
    }
    this.flipStepNum++;
  }

  /** The permanent windows' rows cleared on both page layers. */
  private clearHeaders(): void {
    for (const bg of [this.bg1, this.bg2]) {
      fillBgRect(bg, 0, 0, 0, 30, 2, 0);
      fillBgRect(bg, 0, 0, 2, 15, 2, 0);
    }
  }

  /** PokeSum_CopyNewBgTilemapBeforePageFlip_2: the page layers' tilemaps for the flip. */
  private copyNewTilemap2(): void {
    const skillsBg = this.bg2;
    const infoMovesBg = this.bg1;
    switch (this.leftPage()) {
      case Page.Info:
        this.setMap(infoMovesBg, "summaryPageSkills");
        break;
      case Page.Skills:
        this.setMap(skillsBg, this.dir === RIGHT ? "summaryPageMoves" : "summaryPageInfo");
        break;
      case Page.Moves:
        this.setMap(infoMovesBg, this.dir === RIGHT ? "summaryPageMovesInfo" : "summaryPageSkills");
        break;
      case Page.MovesInfo:
        this.setMap(skillsBg, "summaryPageMoves");
        break;
    }
  }

  /** PokeSum_CopyNewBgTilemapBeforePageFlip: the moves pages' background on BG3. */
  private copyNewTilemap(): void {
    const { assets } = this.flow;
    switch (this.leftPage()) {
      case Page.Info:
        this.setMap(this.bg1, "summaryPageSkills");
        break;
      case Page.Moves:
        this.setBg3(assets.get(this.dir === RIGHT ? "summaryMovesPage" : "summaryMovesInfoPage").map!);
        break;
      case Page.MovesInfo:
        this.setBg3(assets.get("summaryMovesInfoPage").map!);
        break;
    }
  }

  /** PokeSum_InitBgCoordsBeforePageFlips: where the sliding layer starts, the layers' order, the bars' place. */
  private initFlipCoords(): void {
    if (this.page === Page.MovesInfo) {
      this.hofs = FLIP_WIDTH;
      return;
    }
    const delta = this.dir === RIGHT ? -1 : 1;
    if (this.page + delta === Page.MovesInfo) {
      this.updatePriorities(false, false);
      this.hofs = 0;
      this.bg1.x = this.bg2.x = 0;
      return;
    }
    if (this.dir === RIGHT) {
      this.hofs = 0;
      this.bg0.x = this.bg1.x = this.bg2.x = 0;
      this.updatePriorities(true, true);
    } else {
      this.hofs = FLIP_WIDTH;
      if (this.bg1.priority > this.bg2.priority) this.bg1.x = FLIP_WIDTH << 8;
      else this.bg2.x = FLIP_WIDTH << 8;
      this.bg0.x = FLIP_WIDTH << 8;
      this.updatePriorities(true, false);
    }
    if (this.page === Page.Skills) this.setBarsX(this.dir === RIGHT ? 0 : FLIP_WIDTH);
    else if (this.page === Page.Moves) this.setBarsX(0);
  }

  /** PokeSum_SetHpExpBarCoordsFullLeft (0) or FullRight (240). */
  private setBarsX(offset: number): void {
    for (let i = 0; i < EXP_BAR_TILES; i++) this.expBars[i].x = this.expX[i] = EXP_BAR_X + i * 8 + offset;
    for (let i = 0; i < HP_BAR_TILES; i++) this.hpBars[i].x = this.hpX[i] = HP_BAR_X + i * 8 + offset;
  }

  /** PokeSum_UpdateBgPriorityForPageFlip: the sliding layer on top (BG0 under it while sliding right). */
  private updatePriorities(bg0Under: boolean, keepOrder: boolean): void {
    let p0 = this.bg0.priority;
    let p1 = this.bg1.priority;
    let p2 = this.bg2.priority;
    const higher1 = p1 > p2;
    if (this.dir === RIGHT) {
      p0 = bg0Under ? 1 : 0;
      const top = bg0Under ? 0 : 1;
      if (higher1 !== keepOrder) [p1, p2] = [top, 2];
      else [p1, p2] = [2, top];
    } else {
      p0 = 0;
      [p1, p2] = higher1 ? [1, 2] : [2, 1];
    }
    const barPriority = this.page === Page.Skills && this.dir === RIGHT ? p0 : p1;
    for (const s of [...this.hpBars, ...this.expBars]) s.priority = barPriority;
    this.bg0.priority = p0;
    this.bg1.priority = p1;
    this.bg2.priority = p2;
  }

  /** PokeSum_IsPageFlipFinished. */
  private isFlipFinished(): boolean {
    const delta = this.dir === RIGHT ? -1 : 1;
    const finish = (hofs: number, reorder: boolean) => {
      this.hofs = hofs;
      this.translate ^= 1;
      if (reorder) this.updatePriorities(false, false);
      this.flipping = false;
      return true;
    };
    if (this.page === Page.MovesInfo && this.hofs <= 0) return finish(0, true);
    if (this.page + delta === Page.MovesInfo && this.hofs >= FLIP_WIDTH) return finish(FLIP_WIDTH, false);
    if (this.dir === RIGHT) return this.hofs >= FLIP_WIDTH ? finish(FLIP_WIDTH, true) : false;
    return this.hofs <= 0 ? finish(0, false) : false;
  }

  /** VBlankCB_PokemonSummaryScreen: the sliding layer and the bars move while flipping. */
  private vblank(): void {
    if (!this.flipping) return;
    const slideLeft = () => {
      if (this.hofs >= FLIP_WIDTH) return;
      this.hofs = Math.min(this.hofs + FLIP_STEP, FLIP_WIDTH);
      (this.translate === 0 ? this.bg2 : this.bg1).x = -this.hofs << 8;
    };
    const slideRight = () => {
      if (this.hofs < FLIP_STEP) return;
      this.hofs = Math.max(this.hofs - FLIP_STEP, 0);
      (this.translate === 0 ? this.bg1 : this.bg2).x = -this.hofs << 8;
      if (this.page !== Page.MovesInfo) this.bg0.x = -this.hofs << 8;
    };
    if (this.dir === RIGHT) {
      if (this.page !== Page.MovesInfo) slideLeft();
      else slideRight();
    } else if (this.page !== Page.Moves) slideRight();
    else slideLeft();
    // PokeSum_FlipPages_HandleHpExpBarSprites.
    if (this.page === Page.Skills && this.dir === LEFT) this.slideBarsIn();
    if (this.page === Page.Moves && this.dir === RIGHT) this.slideBarsOut();
  }

  private slideBarsOut(): void {
    const move = (bars: Sprite[], xs: number[]) =>
      bars.forEach((s, i) => {
        if (xs[i] < FLIP_WIDTH) {
          xs[i] += FLIP_STEP;
          s.x = xs[i] + FLIP_STEP;
        }
      });
    move(this.expBars, this.expX);
    move(this.hpBars, this.hpX);
  }

  private slideBarsIn(): void {
    const move = (bars: Sprite[], xs: number[], base: number) =>
      bars.forEach((s, i) => {
        const home = base + i * 8;
        if (xs[i] > home) {
          xs[i] = Math.max(xs[i] - FLIP_STEP, home);
          s.x = xs[i];
        }
      });
    move(this.expBars, this.expX, EXP_BAR_X);
    move(this.hpBars, this.hpX, HP_BAR_X);
  }

  // Other Pokémon

  /** PokeSum_SeekToNextMon: the one above or below in the party (no eggs yet to skip). */
  private seekMon(dir: number): void {
    const next = this.slot + dir;
    if (next < 0 || next >= this.party.length) return;
    this.slot = next;
    let step = 0;
    this.switchTask = this.flow.gba.tasks.create(() => {
      if (this.switchMonStep(step++)) {
        this.flow.gba.tasks.destroy(this.switchTask!);
        this.switchTask = null;
      }
    }, 0);
  }

  /** Task_PokeSum_SwitchDisplayedPokemon, one step a frame; true when done. */
  private switchMonStep(step: number): boolean {
    const { flow } = this;
    switch (step) {
      case 0:
        flow.gba.sound.stop("cry");
        this.cursor = this.swapCursor = 0;
        return false;
      case 1:
        this.destroyMonSprites();
        return false;
      case 2:
        this.mon = this.party[this.slot];
        return false;
      case 3:
        fillBgRect(this.bg0, 0, 0, 0, 30, 20, 0);
        this.loadBgPalettes();
        return false;
      case 4:
        if (this.page === Page.Info) {
          this.setMap(this.bg2, "summaryPageInfo");
          this.setMap(this.bg1, "summaryPageSkills");
        }
        return false;
      case 5:
      case 6:
      case 7:
        return false;
      case 8:
        this.addPageWindows();
        this.printRightPane();
        this.printBottomPane();
        this.printAbilityOrMoveTypes();
        return false;
      case 9:
        this.printMonTypes();
        this.drawProgress();
        this.printHeader();
        return false;
      case 10:
        this.copyWindows();
        return false;
      case 11:
        this.createMonSprites();
        this.ball!.invisible = false;
        this.pic!.invisible = false;
        this.showMarks(false);
        this.updateHpBars();
        this.updateExpBars();
        this.showStatus(false);
        this.showStar(false);
        this.playCry();
        return false;
      default:
        return true;
    }
  }

  /** PokeSum_TryPlayMonCry. */
  private playCry(): void {
    this.flow.playCry(this.mon.species);
  }

  /** Task_DestroyResourcesOnExit. */
  private exit(): void {
    const { gba } = this.flow;
    gba.sound.stop("cry");
    gba.tasks.reset();
    gba.setVBlank(gba.standardVBlank);
    this.done(this.slot);
  }
}
