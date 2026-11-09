// The POKéDEX (pokedex_screen.c), opened from the START menu: the table of contents (POKéMON
// LIST, POKéMON HABITATS, SEARCH; habitats nobody was seen in grayed), the selected row's picture
// and the SEEN / OWNED counts (Kanto's, and the National's once enabled); the numerical lists
// (No., name or "-----", caught ball and types); the searches (A to Z of the seen, type, lightest
// and smallest of the caught) leading to their habitat page; the habitat pages; the entry page and
// the area page. Every screen fades through white; the species' art and cries load on demand.
// The Pokédex is mic-core's (PokedexState): this screen only shows it.

import type { Gender } from "@pokeuniverse/contracts/trainer/v1/trainer";
import { ButtonMode } from "@pokeuniverse/contracts/trainer/v1/trainer";
import { Button } from "../gba/input";
import { PALETTES_ALL } from "../gba/palette";
import { decodeText, FontId, Window, type Text, type WindowTemplate } from "../gba/text";
import { RGB_BLACK, RGB_WHITE, type Background } from "../gba/video";
import { KANTO_COUNT, NATIONAL_COUNT, speciesInfo, type PokedexState } from "../world/pokedex";
import { fillBgRect, initBg } from "./common";
import type { Flow } from "./flow";
import { LIST_CANCEL, LIST_HEADER, LIST_NOTHING_CHOSEN, ListMenu, ListScrollMultiple, type ListMenuItem, type ListMenuTemplate, type ListPosition } from "./list-menu";
import type { GraphicId, TextId } from "./manifest";
import { Align, CATEGORY_COUNT, CATEGORY_NAMES, copyImage, DexPages, num3, type DexContext } from "./pokedex-pages";
import { ScrollArrow, ScrollArrowPair } from "./scroll-arrows";

/** Shows the POKéDEX, then `done` once it faded out to black. */
export function startPokedex(flow: Flow, gender: Gender, pokedex: PokedexState, done: () => void): void {
  new Pokedex(flow, gender, pokedex, done);
}

/**
 * DexScreen_RegisterMonToPokedex: a just-caught species' habitat page, then its entry, then `done`
 * once faded to black. Before the National Pokédex, a species past Kanto's shows nothing.
 */
export function registerMonToPokedex(flow: Flow, gender: Gender, pokedex: PokedexState, species: number, done: () => void): void {
  if (!pokedex.national && species > KANTO_COUNT) return done();
  new Pokedex(flow, gender, pokedex, done, species);
}

/** DEX_ORDER_*: the lists. */
const enum Order {
  NumericalKanto,
  AtoZ,
  Type,
  Lightest,
  Smallest,
  NumericalNational,
}
/** DEX_MODE(order): a list's row in the table of contents (the habitats are rows 0 to 8). */
const mode = (order: Order) => CATEGORY_COUNT + order;

/** The table of contents' picture for each row (sTopMenuSelectionIconGfxPtrs). */
const ICONS: Record<number, GraphicId> = {
  0: "dexIconGrassland",
  1: "dexIconForest",
  2: "dexIconWatersEdge",
  3: "dexIconSea",
  4: "dexIconCave",
  5: "dexIconMountain",
  6: "dexIconRoughTerrain",
  7: "dexIconUrban",
  8: "dexIconRare",
  [mode(Order.NumericalKanto)]: "dexIconNumerical",
  [mode(Order.AtoZ)]: "dexIconAtoZ",
  [mode(Order.Type)]: "dexIconType",
  [mode(Order.Lightest)]: "dexIconLightest",
  [mode(Order.Smallest)]: "dexIconSmallest",
  [mode(Order.NumericalNational)]: "dexIconNumerical",
  [LIST_CANCEL]: "dexIconCancel",
};

/** sListMenuItems_KantoDexModeSelect / _NatDexModeSelect. */
function topMenuRows(national: boolean): [TextId, number][] {
  return [
    ["gText_PokemonList", LIST_HEADER],
    ...((national
      ? [
          ["gText_NumericalModeKanto", mode(Order.NumericalKanto)],
          ["gText_NumericalModeNational", mode(Order.NumericalNational)],
        ]
      : [["gText_NumericalMode", mode(Order.NumericalKanto)]]) as [TextId, number][]),
    ["gText_PokemonHabitats", LIST_HEADER],
    ...CATEGORY_NAMES.map((name, i) => [name, i] as [TextId, number]),
    ["gText_Search", LIST_HEADER],
    ["gText_AToZMode", mode(Order.AtoZ)],
    ["gText_TypeMode", mode(Order.Type)],
    ["gText_LightestMode", mode(Order.Lightest)],
    ["gText_SmallestMode", mode(Order.Smallest)],
    ["gText_PokedexOther", LIST_HEADER],
    ["gText_ClosePokedex", LIST_CANCEL],
  ];
}

// The tiles: BG0 and BG3 share one char base (the Pokédex's tiles, then the bars), BG1 and BG2 another (the windows).
const TILES = 0x400;
/** sWindowTemplates: the title bar and the controls bar. */
const HEADER: WindowTemplate = { left: 0, top: 0, width: 30, height: 2, palette: 15, baseBlock: 0x3c4 };
const FOOTER: WindowTemplate = { left: 0, top: 18, width: 30, height: 2, palette: 15, baseBlock: 0x388 };
const MODE_SELECT: WindowTemplate = { left: 1, top: 2, width: 20, height: 16, palette: 0, baseBlock: 0x008 };
const SELECTION_ICON: WindowTemplate = { left: 21, top: 11, width: 8, height: 6, palette: 1, baseBlock: 0x148 };
const DEX_COUNTS: WindowTemplate = { left: 21, top: 2, width: 9, height: 9, palette: 0, baseBlock: 0x178 };
const ORDERED_LIST: WindowTemplate = { left: 2, top: 2, width: 23, height: 16, palette: 0, baseBlock: 0x008 };
/** sListMenuRects_OrderedList: the caught ball's colors (palette 1) and the types' (palette 2). */
const ORDERED_LIST_RECTS = [
  { x: 5, width: 2, palette: 1 },
  { x: 15, width: 8, palette: 2 },
];
const TOP_MENU_TILE = 0x00e;
const MAX_SHOWED = 9;
/** Every palette but the bars' (15): what the white fades between the Pokédex's screens cover. */
const ALL_BUT_BARS = ~0x8000 >>> 0;
const RGB_WHITEALPHA = RGB_WHITE;
/** A list row: the species, seen (bit 16) and caught (bit 17), as the game packs it. */
const SEEN_BIT = 1 << 16;
const CAUGHT_BIT = 1 << 17;

type TaskFn = () => void;
/** Each list order's remembered position: Kanto's, the searches' (reset on each search), the National's. */
type PositionKey = "kanto" | "characteristic" | "national";

class Pokedex {
  private readonly bgs: [Background, Background, Background, Background];
  private readonly ctx: DexContext;
  private readonly pages: DexPages;
  private readonly national: boolean;
  /** gPaletteFade.bufferTransferDisabled: the screen keeps its last colors. */
  private transferDisabled = true;
  /** Species art still loading: the screen waits, as for a fade. */
  private loading: Promise<unknown> | null = null;
  private task: TaskFn = () => this.topMenu();
  private state = 0;
  private data0 = 0;
  private data1 = 0;
  private unlocked = 0;
  private readonly counts: { seenKanto: number; ownedKanto: number; seenNational: number; ownedNational: number };
  private scrollArrows: ScrollArrowPair | null = null;
  // The table of contents
  private modeSelect: ListMenu | null = null;
  private modeSelectPos: ListPosition = { scroll: 0, row: 1 };
  private selectionIcon: Window | null = null;
  // The lists
  private order = Order.NumericalKanto;
  private list: ListMenu | null = null;
  private listWindow: Window | null = null;
  private listItems: ListMenuItem[] = [];
  private listCount = 0;
  private readonly positions: Record<PositionKey, ListPosition> = {
    kanto: { scroll: 0, row: 0 },
    characteristic: { scroll: 0, row: 0 },
    national: { scroll: 0, row: 0 },
  };
  /** The row chosen in a list (characteristicMenuInput). */
  private listInput = 0;
  /** The habitat pages were opened from a search (1), or from the table of contents (0). */
  private parentOfCategoryMenu = 0;

  /** DexScreen_LoadResources and CB2_OpenPokedexFromStartMenu. */
  constructor(
    private readonly flow: Flow,
    gender: Gender,
    private readonly pokedex: PokedexState,
    private readonly done: () => void,
    registering = 0,
  ) {
    const { gba, assets } = flow;
    gba.setVBlank(null);
    gba.reset();
    const [bg0, bg1, bg2, bg3] = gba.video.bgs;
    this.bgs = [bg0, bg1, bg2, bg3];
    [0, 1, 2, 3].forEach((i) => initBg(this.bgs[i], 0, i));
    const dexTiles = new Uint8Array(TILES * 64);
    const windowTiles = new Uint8Array(TILES * 64);
    this.national = pokedex.national;
    const art = assets.get(this.national ? "dexNationalBg" : "dexKantoBg");
    dexTiles.set(art.tiles);
    bg0.tiles = bg3.tiles = dexTiles;
    bg1.tiles = bg2.tiles = windowTiles;
    const palette = art.palette.slice(0, 256);
    gba.palettes.load(palette, 0, 256);
    fillBgRect(bg3, 0x001, 0, 0, 32, 32, 0);
    fillBgRect(bg0, 0x003, 0, 0, 32, 2, 15);
    fillBgRect(bg0, 0x003, 0, 18, 32, 2, 15);
    const header = new Window(bg0, HEADER);
    const footer = new Window(bg0, FOOTER);
    this.ctx = { flow, pokedex, gender, bgs: this.bgs, header, footer, palette };
    this.pages = new DexPages(this.ctx);
    this.counts = {
      seenNational: pokedex.count(false, NATIONAL_COUNT),
      ownedNational: pokedex.count(true, NATIONAL_COUNT),
      seenKanto: pokedex.count(false, KANTO_COUNT),
      ownedKanto: pokedex.count(true, KANTO_COUNT),
    };
    if (registering) {
      this.pages.lookUpCategory(registering);
      this.task = () => this.register();
      // Opened from the battle, whose palettes are being sent: the white comes from them.
      this.transferDisabled = false;
      // The battle faded to white: the screen comes in from it.
      gba.palettes.blendPalettes(PALETTES_ALL, 16, RGB_WHITE);
    }
    gba.tasks.create(() => this.task(), 0);
    gba.setVBlank(() => {
      gba.video.objs = gba.sprites.oam;
      if (!this.transferDisabled) gba.palettes.transfer(gba.video);
    });
    // CB2_PokedexScreen: nothing runs while the palettes fade.
    gba.setMain(() => {
      if (this.loading) return;
      if (!gba.palettes.fadeActive) {
        gba.tasks.run();
        flow.text.run();
        gba.sprites.animate();
        gba.sprites.buildOam();
      } else gba.palettes.updateFade();
    });
  }

  /** The species' pictures are loaded, or start loading (the screen waits until they are). */
  private ready(species: number[]): boolean {
    const { assets } = this.flow;
    const missing = species.filter((s) => !assets.loadedPokemonArt(s));
    if (!missing.length) return true;
    this.loading = Promise.all(missing.map((s) => assets.pokemonArt(s).catch(() => null))).finally(() => (this.loading = null));
    return false;
  }

  private show(...ids: number[]): void {
    for (const i of ids) this.bgs[i].visible = true;
  }

  private hide(...ids: number[]): void {
    for (const i of ids) this.bgs[i].visible = false;
  }

  private fadeOut(): void {
    this.flow.gba.palettes.beginFade(ALL_BUT_BARS, 0, 0, 16, RGB_WHITEALPHA);
  }

  private fadeIn(): void {
    this.flow.gba.palettes.beginFade(ALL_BUT_BARS, 0, 16, 0, RGB_WHITEALPHA);
  }

  private removeScrollArrows(): void {
    this.scrollArrows?.destroy();
    this.scrollArrows = null;
  }

  private to(task: TaskFn): void {
    this.task = task;
    this.state = 0;
  }

  private playCry(): void {
    this.flow.playCry(this.pages.dexSpecies);
  }

  /** DexScreen_InputHandler_StartToCry. */
  private startToCry(): void {
    if (this.flow.gba.input.isPressed(Button.Start)) this.playCry();
  }

  // The table of contents

  /** Task_PokedexScreen. */
  private topMenu(): void {
    const { gba } = this.flow;
    switch (this.state) {
      case 0:
        this.unlocked = 0;
        for (let i = 0; i < CATEGORY_COUNT; i++) if (this.pages.isCategoryUnlocked(i)) this.unlocked |= 1 << i;
        this.state = 2;
        break;
      case 1:
        this.removeScrollArrows();
        this.close();
        break;
      case 2:
        this.initTopMenu();
        this.state = 3;
        break;
      case 3:
        this.state = 4;
        break;
      case 4:
        this.show(3, 2, 1, 0);
        if (this.transferDisabled) {
          this.transferDisabled = false;
          gba.palettes.beginFade(PALETTES_ALL, 0, 0, 0, RGB_WHITEALPHA);
        } else this.fadeIn();
        this.state = 5;
        break;
      case 5: {
        const fullyDown = topMenuRows(this.national).length - MAX_SHOWED;
        this.scrollArrows = this.verticalArrows(fullyDown, () => this.modeSelect?.scroll ?? 0);
        this.state = 6;
        break;
      }
      case 6: {
        const chosen = this.modeSelect!.processInput();
        if (chosen === LIST_NOTHING_CHOSEN || chosen === LIST_HEADER) break;
        if (chosen === LIST_CANCEL) {
          this.state = 1;
          break;
        }
        if (chosen < CATEGORY_COUNT) {
          if (!this.pages.isCategoryUnlocked(chosen)) break;
          this.removeScrollArrows();
          this.pages.category = chosen;
          this.fadeOut();
          this.state = 7;
          break;
        }
        const order = (chosen - CATEGORY_COUNT) as Order;
        // An empty list (nothing seen or caught for it yet) doesn't open.
        if (this.countOrdered(order) === 0) break;
        this.removeScrollArrows();
        this.order = order;
        if (order !== Order.NumericalKanto && order !== Order.NumericalNational) this.positions.characteristic = { scroll: 0, row: 0 };
        this.fadeOut();
        this.state = order === Order.NumericalKanto || order === Order.NumericalNational ? 9 : 8;
        break;
      }
      case 7:
        this.closeTopMenu();
        fillBgRect(this.bgs[1], 0, 0, 0, 32, 20, 0);
        this.pages.pageNum = 0;
        this.pages.cursorPos = 0;
        this.parentOfCategoryMenu = 0;
        this.to(() => this.categorySubmenu());
        break;
      case 8:
        this.closeTopMenu();
        this.hide(1);
        this.to(() => this.characteristicOrder());
        break;
      case 9:
        this.closeTopMenu();
        this.hide(1);
        this.to(() => this.numericalOrder());
        break;
    }
  }

  /** DexScreen_InitGfxForTopMenu: the list, the counts, the title and the controls. */
  private initTopMenu(): void {
    const { flow } = this;
    const { assets } = flow;
    const [, bg1, bg2, bg3] = this.bgs;
    fillBgRect(bg3, TOP_MENU_TILE, 0, 0, 30, 20, 0);
    fillBgRect(bg2, 0, 0, 0, 30, 20, 0);
    fillBgRect(bg1, 0, 0, 0, 30, 20, 0);
    const win = new Window(bg1, MODE_SELECT);
    this.selectionIcon = new Window(bg1, SELECTION_ICON);
    const counts = new Window(bg1, DEX_COUNTS);
    const items = topMenuRows(this.national).map(([label, id]) => ({ label: assets.text(label), id }));
    const template: ListMenuTemplate = {
      win,
      items,
      maxShowed: MAX_SHOWED,
      font: FontId.Normal,
      headerX: 0,
      itemX: 12,
      cursorX: 4,
      upTextY: 2,
      itemVerticalPadding: 0,
      letterSpacing: 1,
      colors: [0, 1, 3],
      onMove: (id, onInit) => this.onModeSelectMove(id, onInit),
      // ItemPrintFunc_DexModeSelect: the habitats nobody was seen in, grayed.
      onPrint: (id) => (id >= CATEGORY_COUNT || id < 0 || this.unlocked & (1 << id) ? [0, 1, 3] : [0, 10, 11]),
    };
    this.modeSelect = new ListMenu(flow, template, this.modeSelectPos);
    const p = this.pages;
    counts.fill(0);
    if (this.national) {
      p.print(counts, FontId.Small, assets.text("gText_Seen"), 0, 2, 0);
      p.print(counts, FontId.Small, assets.text("gText_Kanto"), 8, 13, 0);
      p.print(counts, FontId.Small, num3(this.counts.seenKanto, true), 52, 13, 2);
      p.print(counts, FontId.Small, assets.text("gText_National"), 8, 24, 0);
      p.print(counts, FontId.Small, num3(this.counts.seenNational, true), 52, 24, 2);
      p.print(counts, FontId.Small, assets.text("gText_Owned"), 0, 37, 0);
      p.print(counts, FontId.Small, assets.text("gText_Kanto"), 8, 48, 0);
      p.print(counts, FontId.Small, num3(this.counts.ownedKanto, true), 52, 48, 2);
      p.print(counts, FontId.Small, assets.text("gText_National"), 8, 59, 0);
      p.print(counts, FontId.Small, num3(this.counts.ownedNational, true), 52, 59, 2);
    } else {
      p.print(counts, FontId.NormalCopy1, assets.text("gText_Seen"), 0, 9, 0);
      p.print(counts, FontId.NormalCopy1, num3(this.counts.seenKanto, true), 32, 21, 2);
      p.print(counts, FontId.NormalCopy1, assets.text("gText_Owned"), 0, 37, 0);
      p.print(counts, FontId.NormalCopy1, num3(this.counts.ownedKanto, true), 32, 49, 2);
    }
    this.ctx.header.fill(15);
    p.printTitle(assets.text("gText_PokedexTableOfContents"), Align.Center);
    this.ctx.footer.fill(15);
    p.printControls(assets.text("gText_PickOK"));
    for (const w of [this.ctx.header, this.ctx.footer, counts]) {
      w.putTilemap();
      w.copyToVram();
    }
  }

  /** MoveCursorFunc_DexModeSelect: the row's picture and its colors in BG palette 1. */
  private onModeSelectMove(id: number, onInit: boolean): void {
    const { flow } = this;
    if (!onInit) flow.play("se_select");
    const icon = flow.assets.get(ICONS[id] ?? "dexIconCancel");
    const win = this.selectionIcon!;
    copyImage(win, icon.image!);
    flow.gba.palettes.load(icon.palette, 16, 16);
    win.putTilemap();
    win.copyToVram();
  }

  /** DestroyListMenuTask, the windows removed. */
  private closeTopMenu(): void {
    if (this.modeSelect) this.modeSelectPos = this.modeSelect.position;
    this.modeSelect = null;
    this.selectionIcon = null;
  }

  /** CB2_ClosePokedex: a fade to black, then back where it was opened from. */
  private close(): void {
    const { gba } = this.flow;
    gba.palettes.beginFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
    this.task = () => {
      gba.tasks.reset();
      this.done();
    };
  }

  /** The list arrows at the right (sDexOrderScrollArrowsTemplate and the table of contents'). */
  private verticalArrows(fullyDown: number, value: () => number): ScrollArrowPair {
    return ScrollArrowPair.vertical(this.flow, 200, 19, 141, fullyDown, "dexScrollArrows", value);
  }

  // The lists

  /** Task_DexScreen_NumericalOrder. */
  private numericalOrder(): void {
    switch (this.state) {
      case 0:
        this.loadListPalettes();
        this.listCount = this.countOrdered(this.order);
        this.state = 2;
        break;
      case 1:
        this.destroyList();
        this.hide(1);
        this.to(() => this.topMenu());
        break;
      case 2:
        this.initList("gText_PokemonListNoColor");
        this.state = 3;
        break;
      case 3:
        this.state = 4;
        break;
      case 4:
        this.show(1);
        this.fadeIn();
        this.state = 5;
        break;
      case 5:
        this.scrollArrows = this.listArrows();
        this.state = 6;
        break;
      case 6: {
        const chosen = this.list!.processInput();
        if (chosen === LIST_CANCEL) {
          this.removeScrollArrows();
          this.fadeOut();
          this.state = 1;
        } else if (chosen !== LIST_NOTHING_CHOSEN && chosen & SEEN_BIT) {
          this.listInput = chosen;
          this.pages.dexSpecies = chosen & 0xffff;
          this.removeScrollArrows();
          this.fadeOut();
          this.state = 7;
        }
        break;
      }
      case 7:
        this.destroyList();
        fillBgRect(this.bgs[1], 0, 0, 0, 32, 20, 0);
        this.to(() => this.showMonPage());
        break;
    }
  }

  /** Task_DexScreen_CharacteristicOrder: a search; A opens the species' habitat page. */
  private characteristicOrder(): void {
    switch (this.state) {
      case 0:
        this.loadListPalettes();
        this.listCount = this.countOrdered(this.order);
        this.state = 2;
        break;
      case 1:
        this.destroyList();
        this.hide(1);
        this.to(() => this.topMenu());
        break;
      case 2:
        this.initList("gText_SearchNoColor");
        this.state = 3;
        break;
      case 3:
        this.state = 4;
        break;
      case 4:
        this.show(1);
        this.fadeIn();
        this.state = 5;
        break;
      case 5:
        this.scrollArrows = this.listArrows();
        this.state = 6;
        break;
      case 6: {
        const chosen = this.list!.processInput();
        if (chosen === LIST_CANCEL) {
          this.removeScrollArrows();
          this.fadeOut();
          this.state = 1;
        } else if (chosen !== LIST_NOTHING_CHOSEN && chosen & SEEN_BIT && this.pages.lookUpCategory(chosen & 0xffff)) {
          this.removeScrollArrows();
          this.fadeOut();
          this.state = 7;
        }
        break;
      }
      case 7:
        this.destroyList();
        fillBgRect(this.bgs[1], 0, 0, 0, 32, 20, 0);
        this.parentOfCategoryMenu = 1;
        this.to(() => this.categorySubmenu());
        break;
    }
  }

  /** ListMenuLoadStdPalAt: the caught ball's colors in BG palette 1, the types' in 2. */
  private loadListPalettes(): void {
    const { gba, assets } = this.flow;
    gba.palettes.load(assets.get("dexCaughtBallPal").palette, 16, 16);
    gba.palettes.load(assets.get("pokemonTypesPal").palette, 32, 16);
  }

  /**
   * DexScreen_CountMonsInOrderedList: the rows of a list and how many show. The numerical lists
   * have every number up to the last seen one ("-----" for the unseen); A to Z the seen; the
   * others the caught.
   */
  private countOrdered(order: Order): number {
    const { pokedex } = this;
    const { assets } = this.flow;
    const last = pokedex.last;
    const row = (n: number, label: Text = assets.species(n).name): ListMenuItem => ({ label, id: (pokedex.caught(n) ? CAUGHT_BIT : 0) + (pokedex.seen(n) ? SEEN_BIT : 0) + n });
    const all = Array.from({ length: last }, (_, i) => i + 1);
    if (order === Order.NumericalKanto || order === Order.NumericalNational) {
      const upTo = order === Order.NumericalKanto ? KANTO_COUNT : NATIONAL_COUNT;
      const dashes = assets.text("gText_5Dashes");
      this.listItems = Array.from({ length: upTo }, (_, i) => (pokedex.seen(i + 1) ? row(i + 1) : row(i + 1, dashes)));
      let count = 0;
      for (let n = 1; n <= upTo; n++) if (pokedex.seen(n)) count = n;
      return count;
    }
    let shown: number[];
    if (order === Order.AtoZ) {
      const name = (n: number) => decodeText(assets.charmap, assets.species(n).name);
      shown = all.filter((n) => pokedex.seen(n)).sort((a, b) => (name(a) < name(b) ? -1 : name(a) > name(b) ? 1 : a - b));
    } else {
      const caught = all.filter((n) => pokedex.caught(n));
      const info = (n: number) => speciesInfo(n);
      // gPokedexOrder_Type: by first type, the single-typed first, then by second type; gPokedexOrder_Weight / _Height.
      if (order === Order.Type) {
        const second = (n: number) => (info(n).type1 === info(n).type2 ? -1 : info(n).type2);
        shown = caught.sort((a, b) => info(a).type1 - info(b).type1 || second(a) - second(b) || a - b);
      } else if (order === Order.Lightest) shown = caught.sort((a, b) => info(a).weight - info(b).weight || a - b);
      else shown = caught.sort((a, b) => info(a).height - info(b).height || a - b);
    }
    this.listItems = shown.map((n) => row(n));
    return shown.length;
  }

  private positionKey(): PositionKey {
    if (this.order === Order.NumericalKanto) return "kanto";
    if (this.order === Order.NumericalNational) return "national";
    return "characteristic";
  }

  /** DexScreen_InitGfxForNumericalOrderList / DexScreen_CreateCharacteristicListMenu. */
  private initList(title: TextId): void {
    const { flow } = this;
    const [, bg1, , bg3] = this.bgs;
    fillBgRect(bg3, TOP_MENU_TILE, 0, 0, 30, 20, 0);
    fillBgRect(bg1, 0, 0, 0, 32, 32, 0);
    const win = new Window(bg1, ORDERED_LIST);
    this.listWindow = win;
    const template: ListMenuTemplate = {
      win,
      items: this.listItems.slice(0, this.listCount),
      maxShowed: MAX_SHOWED,
      font: FontId.Normal,
      itemX: 56,
      cursorX: 4,
      upTextY: 2,
      itemVerticalPadding: 0,
      letterSpacing: 1,
      colors: [0, 1, 3],
      scrollMultiple: ListScrollMultiple.Dpad,
      onPrint: (id, y) => this.printListRow(id, y),
    };
    this.list = new ListMenu(flow, template, this.positions[this.positionKey()]);
    // ListMenuInitInRect: the ball's and the types' columns in their own colors.
    for (const r of ORDERED_LIST_RECTS)
      for (let ty = 0; ty < ORDERED_LIST.height; ty++)
        for (let tx = r.x; tx < r.x + r.width; tx++) {
          const x = ORDERED_LIST.left + tx;
          const y = ORDERED_LIST.top + ty;
          bg1.setEntry(x, y, (bg1.entry(x, y) & 0x0fff) | (r.palette << 12));
        }
    this.ctx.header.fill(15);
    this.pages.printTitle(flow.assets.text(title), Align.Center);
    this.ctx.footer.fill(15);
    this.pages.printControls(flow.assets.text("gText_PickOKExit"));
    this.ctx.header.copyToVram();
    this.ctx.footer.copyToVram();
  }

  /** ItemPrintFunc_OrderedListMenu: No., and the caught ball and types once caught. */
  private printListRow(id: number, y: number): void {
    const win = this.listWindow!;
    const species = id & 0xffff;
    this.pages.printDexNo(win, FontId.Small, species, 12, y);
    if (!(id & CAUGHT_BIT)) return;
    this.pages.blitCaught(win, 0x28, y);
    const { type1, type2 } = speciesInfo(species);
    this.pages.blitType(win, type1, 0x78, y);
    if (type1 !== type2) this.pages.blitType(win, type2, 0x98, y);
  }

  /** DexScreen_CreateDexOrderScrollArrows. */
  private listArrows(): ScrollArrowPair {
    return this.verticalArrows(this.listCount > MAX_SHOWED ? this.listCount - MAX_SHOWED : 0, () => this.list?.scroll ?? 0);
  }

  /** DexScreen_DestroyDexOrderListMenu: its position kept. */
  private destroyList(): void {
    if (this.list) this.positions[this.positionKey()] = this.list.position;
    this.list = null;
    this.listWindow = null;
  }

  /** DexScreen_TryScrollMonsVertical: the previous (up) or next seen species of the list. */
  private tryScrollVertical(up: boolean): boolean {
    const pos = this.positions[this.positionKey()];
    let i = pos.scroll + pos.row;
    const seen = (k: number) => (this.listItems[k]?.id ?? 0) & SEEN_BIT;
    if (up) {
      if (i === 0) return false;
      do i--;
      while (i >= 0 && !seen(i));
      if (i < 0) return false;
    } else {
      if (i === this.listCount - 1) return false;
      do i++;
      while (i < this.listCount && !seen(i));
      if (i >= this.listCount) return false;
    }
    this.listInput = this.listItems[i].id;
    const count = this.listCount;
    if (count > MAX_SHOWED) {
      if (i < 4) Object.assign(pos, { scroll: 0, row: i });
      else if (i >= count - 4) Object.assign(pos, { scroll: count - MAX_SHOWED, row: i + MAX_SHOWED - count });
      else Object.assign(pos, { scroll: i - 4, row: 4 });
    } else Object.assign(pos, { scroll: 0, row: i });
    return true;
  }

  // The habitat pages

  /** Task_DexScreen_CategorySubmenu. */
  private categorySubmenu(): void {
    const { flow } = this;
    const { input } = flow.gba;
    const p = this.pages;
    const [bg0] = this.bgs;
    switch (this.state) {
      case 0:
        this.hide(3, 2, 1);
        p.pageLimits(p.category);
        if (p.pageNum < p.firstPage) p.pageNum = p.firstPage;
        this.state = 2;
        break;
      case 1:
        p.destroyCategoryWindows();
        this.hide(2, 1);
        this.to(this.parentOfCategoryMenu === 1 ? () => this.characteristicOrder() : () => this.topMenu());
        break;
      case 2:
        if (!this.ready(p.speciesOn(p.category, p.pageNum))) break;
        p.drawCategoryPage(false);
        p.blinkSelection(null);
        this.state = 3;
        break;
      case 3:
        this.fadeIn();
        this.show(3, 2, 1);
        this.state = 4;
        break;
      case 4:
        this.scrollArrows = this.pageArrows();
        p.addOutline();
        this.state = 5;
        break;
      case 5: {
        p.blinkSelection(p.cursorPos);
        p.outlineSelected();
        let flip = 0;
        if (input.isPressed(Button.A) && this.pokedex.seen(p.pageSpecies[p.cursorPos] ?? 0)) {
          this.removeScrollArrows();
          p.removeOutline();
          this.state = 12;
          break;
        }
        if (!input.isHeld(Button.R) && input.isRepeated(Button.Left)) {
          if (p.cursorPos !== 0) {
            p.cursorPos--;
            flow.play("se_select");
            break;
          }
          flip = 1;
        }
        if (!input.isHeld(Button.R) && input.isRepeated(Button.Right)) {
          if (p.cursorPos < p.pageSpecies.length - 1) {
            p.cursorPos++;
            flow.play("se_select");
            break;
          }
          flip = 2;
        }
        if (flip === 0) flip = this.shoulderInput();
        if (flip === 1) {
          this.state = 6;
          while (p.pageNum > p.firstPage) {
            p.pageNum--;
            if (p.isPageUnlocked(p.category, p.pageNum)) {
              this.state = 8;
              break;
            }
          }
        } else if (flip === 2) {
          this.state = 6;
          while (p.pageNum < p.lastPage - 1) {
            p.pageNum++;
            if (p.isPageUnlocked(p.category, p.pageNum)) {
              this.state = 10;
              break;
            }
          }
        }
        if (input.isPressed(Button.B)) this.state = 6;
        break;
      }
      case 6:
      case 7:
        this.removeScrollArrows();
        p.removeOutline();
        this.fadeOut();
        this.state = 1;
        break;
      case 8:
      case 10:
        p.destroyCategoryWindows();
        p.blinkSelection(null);
        p.moveOutline(0, 160);
        this.state++;
        break;
      case 9:
      case 11:
        if (p.flipDrawsPage && !this.ready(p.speciesOn(p.category, p.pageNum))) break;
        if (p.flipPage(this.state === 11)) {
          p.cursorPos = this.state === 9 ? p.pageSpecies.length - 1 : 0;
          this.state = 5;
        }
        break;
      case 12:
        p.dexSpecies = p.pageSpecies[p.cursorPos];
        flow.play("se_select");
        this.state = 14;
        break;
      case 13:
        this.state = 4;
        break;
      case 14:
        if (!this.ready([p.dexSpecies])) break;
        p.drawEntryPage(false);
        this.state = 15;
        break;
      case 15:
        this.data0 = this.data1 = 0;
        this.state = 16;
        this.zoomIn();
        break;
      case 16:
        this.zoomIn();
        break;
      case 17:
        if (input.isPressed(Button.A)) {
          fillBgRect(this.bgs[1], 0, 0, 2, 30, 16, 0);
          this.state = 21;
        } else if (input.isPressed(Button.B)) this.state = 18;
        else this.startToCry();
        break;
      case 18:
        p.drawCategoryPage(false);
        p.zoomFrame(bg0, 6);
        this.state = 19;
        break;
      case 19:
        this.data0 = 0;
        this.data1 = 6;
        this.state = 20;
        this.zoomOut();
        break;
      case 20:
        this.zoomOut();
        break;
      case 21:
        p.drawAreaPage();
        this.state = 22;
        break;
      case 22:
        this.state = 23;
        break;
      case 23: {
        const a = input.isPressed(Button.A);
        if (a || input.isPressed(Button.B)) {
          for (const i of [2, 1, 0]) fillBgRect(this.bgs[i], 0, 0, 2, 30, 16, 0);
          this.state = a ? 26 : 24;
        } else this.startToCry();
        break;
      }
      case 24:
        p.destroyAreaPage();
        this.state = 25;
        break;
      case 25:
        p.drawEntryPage(false);
        this.state = 17;
        break;
      case 26:
        p.destroyAreaPage();
        this.state = 18;
        break;
    }
  }

  /** Task_DexScreen_RegisterMonToPokedex: the habitat page with the new one selected for 30 frames, its entry zooming in, A or B. */
  private register(): void {
    const p = this.pages;
    switch (this.state) {
      case 0:
        p.pageLimits(p.category);
        if (p.pageNum < p.firstPage) p.pageNum = p.firstPage;
        this.hide(3, 2, 1, 0);
        this.state = 3;
        break;
      case 2:
        p.destroyCategoryWindows();
        this.close();
        break;
      case 3:
        if (!this.ready(p.speciesOn(p.category, p.pageNum))) break;
        p.drawCategoryPage(true);
        p.blinkSelection(null);
        this.state = 4;
        break;
      case 4:
        this.flow.gba.palettes.beginFade(PALETTES_ALL, 0, 16, 0, RGB_WHITE);
        this.show(3, 2, 1, 0);
        this.state = 5;
        break;
      case 5:
        this.data0 = 30;
        p.addOutline();
        this.state = 6;
        break;
      case 6:
        p.blinkSelection(p.cursorPos);
        p.outlineSelected();
        if (this.data0) this.data0--;
        else {
          p.removeOutline();
          this.state = 7;
        }
        break;
      case 7:
        p.dexSpecies = p.pageSpecies[p.cursorPos];
        this.state = 8;
        break;
      case 8:
        if (!this.ready([p.dexSpecies])) break;
        p.drawEntryPage(true);
        this.data0 = this.data1 = 0;
        this.state = 10;
        break;
      case 10: {
        const [bg0] = this.bgs;
        if (this.data1 < 6) {
          if (this.data0) {
            p.zoomFrame(bg0, this.data1);
            this.data0 = 4;
            this.data1++;
          } else this.data0--;
          break;
        }
        fillBgRect(bg0, 0, 0, 2, 30, 16, 0);
        this.playCry();
        this.data0 = 0;
        this.state = 11;
        break;
      }
      case 11:
        if (this.flow.gba.input.isPressed(Button.A | Button.B)) this.state = 2;
        break;
    }
  }

  /** States 15-16: the frame grows on BG0 a step every 4 frames, then the page shows and cries. */
  private zoomIn(): void {
    const [bg0] = this.bgs;
    if (this.data1 < 6) {
      if (this.data0) {
        this.pages.zoomFrame(bg0, this.data1);
        this.data0 = 4;
        this.data1++;
      } else this.data0--;
      return;
    }
    fillBgRect(bg0, 0, 0, 2, 30, 16, 0);
    this.playCry();
    this.data0 = 0;
    this.state = 17;
  }

  /** States 19-20: the frame shrinks back to the name card, a step every other frame. */
  private zoomOut(): void {
    const [bg0] = this.bgs;
    if (this.data1) {
      if (this.data0) {
        this.data1--;
        fillBgRect(bg0, 0, 0, 2, 30, 16, 0);
        this.pages.zoomFrame(bg0, this.data1);
        this.data0 = 1;
      } else this.data0--;
      return;
    }
    fillBgRect(bg0, 0, 0, 2, 30, 16, 0);
    this.state = 13;
  }

  /** DexScreen_CreateCategoryMenuScrollArrows: left and right, hidden at the first and last pages. */
  private pageArrows(): ScrollArrowPair {
    const p = this.pages;
    const t = { first: ScrollArrow.Left, firstX: 16, firstY: 80, second: ScrollArrow.Right, secondX: 224, secondY: 80, fullyUp: p.firstPage, fullyDown: p.lastPage - 1, tag: "dexScrollArrows" };
    return new ScrollArrowPair(this.flow, t, () => p.pageNum);
  }

  /** DexScreen_InputHandler_GetShoulderInput: L and R flip pages in the LR mode, R + LEFT/RIGHT in L=A; 1 left, 2 right. */
  private shoulderInput(): number {
    const { input } = this.flow.gba;
    switch (this.flow.options.buttonMode) {
      case ButtonMode.L_EQUALS_A:
        if (input.isHeld(Button.R) && input.isPressed(Button.Left)) return 1;
        if (input.isHeld(Button.R) && input.isPressed(Button.Right)) return 2;
        return 0;
      case ButtonMode.LR:
        if (input.isPressed(Button.L)) return 1;
        if (input.isPressed(Button.R)) return 2;
        return 0;
      default:
        return 0;
    }
  }

  // The entry page, from a numerical list

  /** Task_DexScreen_ShowMonPage: UP and DOWN go to the previous and next seen species of the list. */
  private showMonPage(): void {
    const { input } = this.flow.gba;
    const p = this.pages;
    switch (this.state) {
      case 0:
        this.hide(3, 2, 1);
        this.state = 2;
        break;
      case 1:
        this.hide(2, 1);
        this.to(() => this.numericalOrder());
        break;
      case 2:
        if (!this.ready([p.dexSpecies])) break;
        p.pageSpecies = [p.dexSpecies];
        p.cursorPos = 0;
        p.drawEntryPage(false);
        this.state = 3;
        break;
      case 3:
        this.playCry();
        this.state = 4;
        break;
      case 4:
        this.fadeIn();
        this.show(3, 2, 1);
        this.state = 5;
        break;
      case 5:
        if (input.isPressed(Button.A)) {
          fillBgRect(this.bgs[1], 0, 0, 2, 30, 16, 0);
          this.state = 7;
        } else if (input.isPressed(Button.B)) {
          this.fadeOut();
          this.state = 1;
        } else if ((input.isPressed(Button.Up) && this.tryScrollVertical(true)) || (input.isPressed(Button.Down) && this.tryScrollVertical(false))) {
          this.fadeOut();
          this.state = 6;
        } else this.startToCry();
        break;
      case 6:
        this.hide(2, 1);
        p.dexSpecies = this.listInput & 0xffff;
        this.state = 2;
        break;
      case 7:
        p.drawAreaPage();
        this.state = 8;
        break;
      case 8:
        this.state = 9;
        break;
      case 9:
        if (input.isPressed(Button.A)) {
          this.fadeOut();
          this.state = 12;
        } else if (input.isPressed(Button.B)) {
          for (const i of [2, 1, 0]) fillBgRect(this.bgs[i], 0, 0, 2, 30, 16, 0);
          this.state = 10;
        } else this.startToCry();
        break;
      case 10:
        p.destroyAreaPage();
        this.state = 11;
        break;
      case 11:
        p.drawEntryPage(false);
        this.state = 5;
        break;
      case 12:
        p.destroyAreaPage();
        fillBgRect(this.bgs[0], 0, 0, 2, 30, 16, 0);
        this.state = 1;
        break;
    }
  }
}
