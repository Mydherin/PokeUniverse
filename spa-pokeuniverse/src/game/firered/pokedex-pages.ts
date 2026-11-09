// The POKéDEX's pages (pokedex_screen.c): the habitat pages (1 to 4 Pokémon in round windows,
// each with its name card, the blinking selection and the red outline, the page flip), the entry
// page (picture, No., name, category, height, weight, footprint, description, and its zoom frame
// out of the habitat page) and the area page (Kanto's map, icon, types, the size comparison with
// the trainer, "AREA UNKNOWN"). The screen (pokedex.ts) decides when each one shows.

import { Gender } from "@pokeuniverse/contracts/trainer/v1/trainer";
import { toTiles, type IndexedImage } from "../gba/assets";
import type { Sprite, SpriteTemplate } from "../gba/sprites";
import { decimalText, EOS, FontId, NumberMode, Window, type Text, type WindowTemplate } from "../gba/text";
import { rgb, type Background } from "../gba/video";
import { KANTO_COUNT, speciesInfo, type PokedexState } from "../world/pokedex";
import { fillBgRect } from "./common";
import type { Flow } from "./flow";
import type { PokemonArt } from "./manifest";
import { blitMenuInfoIcon, MENU_INFO_CAUGHT, typeIcon } from "./menu-info";
import HABITATS from "./pokedex-habitats.json";

/** The habitats (DEX_CATEGORY_*), each a list of pages of national numbers (ours: FireRed's 386 and Gen 4's). */
export const CATEGORIES = HABITATS as number[][][];
export const CATEGORY_COUNT = 9;

/** The habitats' names (sDexCategoryNamePtrs). */
export const CATEGORY_NAMES = [
  "gText_DexCategory_GrasslandPkmn",
  "gText_DexCategory_ForestPkmn",
  "gText_DexCategory_WatersEdgePkmn",
  "gText_DexCategory_SeaPkmn",
  "gText_DexCategory_CavePkmn",
  "gText_DexCategory_MountainPkmn",
  "gText_DexCategory_RoughTerrainPkmn",
  "gText_DexCategory_UrbanPkmn",
  "gText_DexCategory_RarePkmn",
];

/** DexScreen_AddTextPrinterParameterized's colors: [fill, text, shadow]. */
const COLORS: readonly (readonly [number, number, number])[] = [
  [0, 1, 3],
  [0, 5, 1],
  [0, 15, 14],
  [0, 11, 1],
  [0, 1, 2],
];

export const enum Align {
  Left,
  Center,
  Right,
}

/** sCategoryPageIconCoords: per page size, each slot's round window and name card, in tiles. */
const PAGE_COORDS: readonly (readonly (readonly [number, number, number, number])[])[] = [
  [[11, 3, 11, 11]],
  [
    [3, 3, 11, 3],
    [18, 9, 10, 11],
  ],
  [
    [1, 2, 9, 2],
    [11, 9, 3, 11],
    [21, 3, 21, 11],
  ],
  [
    [0, 2, 6, 3],
    [7, 10, 0, 12],
    [15, 10, 22, 11],
    [22, 2, 15, 4],
  ],
];

/** sDexScreen_CategoryCursorPals: the page's colors, then the selected Pokémon's blink. */
const CURSOR_PALS = [
  rgb(24, 22, 17), rgb(26, 24, 20),
  rgb(26, 20, 15), rgb(27, 23, 19),
  rgb(28, 18, 15), rgb(28, 22, 19),
  rgb(30, 16, 13), rgb(29, 21, 18),
  rgb(28, 18, 15), rgb(28, 22, 19),
  rgb(26, 20, 15), rgb(27, 23, 19),
];

/** sDexScreenPageTurnColumns: per step of the flip, which column of the new page each screen column shows (30: blank). */
const PAGE_TURN_COLUMNS: readonly number[][] = [
  Array(30).fill(30),
  [5, 11, 17, 23, 29, ...Array(25).fill(30)],
  [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, ...Array(20).fill(30)],
  [2, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, ...Array(15).fill(30)],
  [2, 4, 5, 7, 8, 10, 11, 13, 14, 16, 17, 19, 20, 22, 23, 25, 26, 28, 29, ...Array(11).fill(30)],
  [1, 2, 3, 4, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 19, 20, 21, 23, 24, 25, 27, 28, 29, ...Array(7).fill(30)],
  [1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 21, 22, 23, 25, 26, 27, 28, 29, 30, 30, 30, 30],
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 30, 30],
  [...Array.from({ length: 29 }, (_, i) => i + 1), 30],
  Array.from({ length: 30 }, (_, i) => i),
];

const PAGE_TILE = 0x002;
const BLANK_PAGE_TILE = 0x00c;

// The windows (sWindowTemplate_*).
const CATEGORY_MON_ICON: WindowTemplate = { left: 0, top: 0, width: 8, height: 8, palette: 0, baseBlock: 0 };
const CATEGORY_MON_INFO: WindowTemplate = { left: 0, top: 0, width: 8, height: 5, palette: 0, baseBlock: 0 };
const ENTRY_PIC: WindowTemplate = { left: 19, top: 3, width: 8, height: 8, palette: 9, baseBlock: 0x1a8 };
const ENTRY_STATS: WindowTemplate = { left: 2, top: 3, width: 13, height: 8, palette: 0, baseBlock: 0x1e8 };
const ENTRY_FLAVOR: WindowTemplate = { left: 0, top: 11, width: 30, height: 7, palette: 0, baseBlock: 0x250 };
const AREA_ICON: WindowTemplate = { left: 1, top: 2, width: 4, height: 4, palette: 10, baseBlock: 0x1a8 };
const AREA_NAME: WindowTemplate = { left: 5, top: 2, width: 8, height: 3, palette: 0, baseBlock: 0x1b8 };
const AREA_SIZE: WindowTemplate = { left: 2, top: 7, width: 10, height: 2, palette: 0, baseBlock: 0x1d0 };
const AREA_AREA: WindowTemplate = { left: 18, top: 2, width: 10, height: 2, palette: 0, baseBlock: 0x1e4 };
const AREA_TYPES: WindowTemplate = { left: 5, top: 5, width: 8, height: 2, palette: 11, baseBlock: 0x1f8 };
const AREA_KANTO: WindowTemplate = { left: 17, top: 4, width: 12, height: 9, palette: 0, baseBlock: 0x208 };
/** The Kanto map's vertical offset in tiles: 0 once a Sevii island past Three Island is unlocked (none yet). */
const KANTO_MAP_VOFF = 4;

/** The red outline (sCursorStruct_CategoryPage): 64×40 around a name card, OBJ palette 4. */
const OUTLINE_WIDTH = 64;
const OUTLINE_HEIGHT = 40;
const OUTLINE_PALETTE = 4;
/** The size comparison's silhouettes: OBJ palette 2. */
const SILHOUETTE_PALETTE = 2;

const CHAR_0 = 0xa1;
const CHAR_SPACE = 0x00;
const CHAR_QUESTION_MARK = 0xac;
const CHAR_PERIOD = 0xad;
const CHAR_DBL_QUOTE_RIGHT = 0xb2;
const CHAR_SGL_QUOTE_RIGHT = 0xb4;
const CHAR_SLASH = 0xba;
/** {MIN_LETTER_SPACING n}. */
const minLetterSpacing = (n: number) => [0xfc, 0x14, n];

/** What the pages share with the screen. */
export interface DexContext {
  readonly flow: Flow;
  readonly pokedex: PokedexState;
  readonly gender: Gender;
  /** BG0 (priority 0) and BG3 (3) share the Pokédex's tiles; BG1 (1) and BG2 (2) the windows'. */
  readonly bgs: readonly [Background, Background, Background, Background];
  /** The title bar (window 0) and the controls bar (window 1), on BG0. */
  readonly header: Window;
  readonly footer: Window;
  /** The Pokédex's colors as loaded (Kanto's or the National's). */
  readonly palette: Uint16Array;
}

export class DexPages {
  category = 0;
  pageNum = 0;
  firstPage = 0;
  /** One past the last page shown (lastPageInCategory). */
  lastPage = 0;
  pageSpecies: number[] = [];
  cursorPos = 0;
  /** The species of the entry and area pages. */
  dexSpecies = 0;
  /** The flip's steps (data[0], data[1]). */
  private flipState = 0;
  private flipStep = 0;
  private savedMaps: Uint16Array[] = [];
  private cursorTimer = 0;
  private readonly monWindows: (Window | null)[] = [null, null, null, null];
  private readonly infoWindows: (Window | null)[] = [null, null, null, null];
  private outline: Sprite[] = [];
  private areaSprites: Sprite[] = [];

  constructor(private readonly c: DexContext) {}

  private get flow(): Flow {
    return this.c.flow;
  }

  // Text

  /** DexScreen_AddTextPrinterParameterized. */
  print(win: Window, font: FontId, text: Text, x: number, y: number, color: number): void {
    win.print(this.flow.fonts[font], x, y, COLORS[color], text, font === FontId.Small ? 0 : 1, 0);
  }

  /** DexScreen_PrintStringWithAlignment: in the title bar. */
  printTitle(text: Text, align: Align = Align.Center): void {
    const width = this.flow.fonts[FontId.Normal].width(text, 0);
    const x = align === Align.Left ? 8 : align === Align.Center ? Math.trunc((240 - width) / 2) : 232 - width;
    this.print(this.c.header, FontId.Normal, text, x, 2, 4);
  }

  /** DexScreen_PrintControlInfo: right-aligned in the controls bar. */
  printControls(text: Text): void {
    this.print(this.c.footer, FontId.Small, text, 236 - this.flow.fonts[FontId.Small].width(text, 0), 2, 4);
  }

  /** DexScreen_PrintMonDexNo: "No." then the number with leading zeros. */
  printDexNo(win: Window, font: FontId, species: number, x: number, y: number): void {
    this.print(win, font, this.flow.assets.text("gText_PokedexNo"), x, y, 0);
    this.print(win, font, num3(species, false), x + 9, y, 0);
  }

  /** BlitMenuInfoIcon: the caught ball. */
  blitCaught(win: Window, x: number, y: number): void {
    blitMenuInfoIcon(this.flow, win, MENU_INFO_CAUGHT, x, y);
  }

  /** BlitMenuInfoIcon: a type's icon. */
  blitType(win: Window, type: number, x: number, y: number): void {
    blitMenuInfoIcon(this.flow, win, typeIcon(type), x, y);
  }

  // Habitats

  /** DexScreen_CanShowMonInDex: before the National Pokédex, only Kanto's species. */
  canShow(species: number): boolean {
    return this.c.pokedex.national || species <= KANTO_COUNT;
  }

  private shown(species: number): boolean {
    return this.canShow(species) && this.c.pokedex.seen(species);
  }

  /** DexScreen_IsPageUnlocked: a page shows once one of its Pokémon was seen. */
  isPageUnlocked(category: number, page: number): boolean {
    return (CATEGORIES[category]?.[page] ?? []).some((s) => this.shown(s));
  }

  /** DexScreen_IsCategoryUnlocked. */
  isCategoryUnlocked(category: number): boolean {
    return CATEGORIES[category].some((_, page) => this.isPageUnlocked(category, page));
  }

  /** DexScreen_GetPageLimitsForCategory: the first and (one past) the last unlocked page. */
  pageLimits(category: number): void {
    const unlocked = CATEGORIES[category].map((_, i) => i).filter((i) => this.isPageUnlocked(category, i));
    this.firstPage = unlocked[0] ?? 0;
    this.lastPage = unlocked.length ? unlocked[unlocked.length - 1] + 1 : 0;
  }

  /** The seen Pokémon of a page, in its order (DexScreen_CreateCategoryPageSpeciesList). */
  speciesOn(category: number, page: number): number[] {
    return (CATEGORIES[category]?.[page] ?? []).filter((s) => this.shown(s));
  }

  /** DexScreen_LookUpCategoryBySpecies: the habitat, page and slot of a species; false when none has it. */
  lookUpCategory(species: number): boolean {
    for (let i = 0; i < CATEGORIES.length; i++)
      for (let j = 0; j < CATEGORIES[i].length; j++) {
        let pos = 0;
        for (const s of CATEGORIES[i][j]) {
          if (s === species) {
            this.category = i;
            this.pageNum = j;
            this.cursorPos = pos;
            return true;
          }
          if (this.shown(s)) pos++;
        }
      }
    return false;
  }

  /** DexScreen_PageNumberToRenderablePages: the page's number counting unlocked pages only. */
  private renderablePage(page: number): number {
    let count = 0;
    for (let i = 0; i < page; i++) if (this.isPageUnlocked(this.category, i)) count++;
    return count + 1;
  }

  /** DexScreen_CreateCategoryListGfx: the page's background, its Pokémon, the title and controls. */
  drawCategoryPage(justRegistered: boolean): void {
    const [, bg1, bg2, bg3] = this.c.bgs;
    const { assets } = this.flow;
    fillBgRect(bg3, PAGE_TILE, 0, 0, 30, 20, 0);
    fillBgRect(bg2, 0, 0, 0, 32, 20, 0);
    fillBgRect(bg1, 0, 0, 0, 32, 20, 0);
    this.pageSpecies = this.speciesOn(this.category, this.pageNum);
    const name = assets.text(CATEGORY_NAMES[this.category]);
    this.c.header.fill(15);
    if (justRegistered) this.printTitle(name, Align.Center);
    else {
      this.printTitle(name, Align.Left);
      // DexScreen_PrintCategoryPageNumbers: "PAGE n/m", right-aligned.
      const num2 = (n: number) => decimalText(n, NumberMode.RightAlign, 2).slice(0, -1);
      const pages = [...assets.text("gText_Page").slice(0, -1), ...num2(this.renderablePage(this.pageNum)), CHAR_SLASH, ...num2(this.renderablePage(this.lastPage - 1)), EOS];
      this.printTitle(pages, Align.Right);
    }
    this.c.header.copyToVram();
    this.c.footer.fill(15);
    if (!justRegistered) this.printControls(assets.text("gText_PickFlipPageCheckCancel"));
    this.c.footer.copyToVram();
    this.pageSpecies.forEach((s, slot) => this.drawCategoryMon(s, slot, this.pageSpecies.length));
  }

  /** DexScreen_DrawMonPicInCategoryPage: the round window and picture, then the name card. */
  private drawCategoryMon(species: number, slot: number, count: number): void {
    const [, bg1, bg2, bg3] = this.c.bgs;
    const { assets } = this.flow;
    const [circleX, circleY, cardX, cardY] = PAGE_COORDS[count - 1][slot];
    // CopyToBgTilemapBufferRect_ChangePalette: the round window in the slot's colors.
    const map = assets.get("dexPageIconMap").map!;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bg3.setEntry(circleX + x, circleY + y, (map[y * 8 + x] & 0x0fff) | ((slot + 5) << 12));
    let pic = this.monWindows[slot];
    if (!pic) {
      pic = new Window(bg2, { ...CATEGORY_MON_ICON, left: circleX, top: circleY, palette: slot + 1, baseBlock: slot * 64 + 8 });
      this.monWindows[slot] = pic;
      pic.fill(0);
      this.loadMonPic(pic, species, slot + 1);
      pic.putTilemap();
      pic.copyToVram();
    } else pic.putTilemap();
    let card = this.infoWindows[slot];
    if (!card) {
      card = new Window(bg1, { ...CATEGORY_MON_INFO, left: cardX, top: cardY, baseBlock: slot * 40 + 0x108 });
      this.infoWindows[slot] = card;
      copyImage(card, assets.get("dexMiniPage").image!);
      this.printDexNo(card, FontId.Small, species, 12, 0);
      this.print(card, FontId.Normal, assets.species(species).name, 2, 13, 0);
      if (this.c.pokedex.caught(species)) card.blitRect(assets.get("dexCaughtMarker").image!, 0, 0, 2, 3, 8, 8);
      card.putTilemap();
      card.copyToVram();
    } else card.putTilemap();
  }

  /** DexScreen_DestroyCategoryPageMonIconAndInfoWindows. */
  destroyCategoryWindows(): void {
    this.monWindows.fill(null);
    this.infoWindows.fill(null);
  }

  /**
   * DexScreen_CreateCategoryPageSelectionCursor: the selected Pokémon's round window and the red
   * outline blink, a step a frame; null puts every window back in the page's colors.
   */
  blinkSelection(pos: number | null): void {
    const { palettes } = this.flow.gba;
    const set = (offset: number, color: number) => palettes.load([color], offset, 1);
    if (pos === null) {
      for (let i = 0; i < 4; i++) {
        set((i + 5) * 16 + 2, CURSOR_PALS[0]);
        set((i + 5) * 16 + 8, CURSOR_PALS[1]);
      }
      set(256 + OUTLINE_PALETTE * 16 + 1, CURSOR_PALS[0]);
      this.cursorTimer = 0;
      return;
    }
    this.cursorTimer = (this.cursorTimer + 1) % 16;
    const blink = this.cursorTimer >> 2;
    for (let i = 0; i < 4; i++) {
      set((i + 5) * 16 + 2, i === pos ? CURSOR_PALS[2 * blink + 2] : CURSOR_PALS[0]);
      set((i + 5) * 16 + 8, i === pos ? CURSOR_PALS[2 * blink + 3] : CURSOR_PALS[1]);
    }
    set(256 + OUTLINE_PALETTE * 16 + 1, CURSOR_PALS[2 * blink + 2]);
  }

  /** ListMenuAddRedOutlineCursorObject: corners and edges of 8×8 tiles around a 64×40 box. */
  addOutline(): void {
    const { gba, assets } = this.flow;
    gba.sprites.loadSheet("dexOutline", assets.get("selectorOutline").tiles);
    gba.palettes.load(assets.get("redArrowPal").palette, 256 + OUTLINE_PALETTE * 16, 16);
    const pieces: [number, number, number][] = [
      [0, 0, 0],
      [1, OUTLINE_WIDTH - 8, 0],
      [6, 0, OUTLINE_HEIGHT - 8],
      [7, OUTLINE_WIDTH - 8, OUTLINE_HEIGHT - 8],
    ];
    for (let i = 8; i < OUTLINE_WIDTH - 8; i += 8) pieces.push([2, i, 0], [5, i, OUTLINE_HEIGHT - 8]);
    for (let j = 8; j < OUTLINE_HEIGHT - 8; j += 8) pieces.push([3, 0, j], [4, OUTLINE_WIDTH - 8, j]);
    this.outline = [];
    for (const [tile, dx, dy] of pieces) {
      const template: SpriteTemplate = { sheet: "dexOutline", palette: "dexOutline", width: 8, height: 8, priority: 0, anims: [[{ image: tile, duration: 0 }, "end"]] };
      const s = gba.sprites.create(template, 0, 0, 0);
      if (!s) continue;
      s.paletteNum = OUTLINE_PALETTE;
      s.data[0] = dx;
      s.data[1] = dy;
      this.outline.push(s);
    }
    this.moveOutline(0, 160);
  }

  /** ListMenuUpdateRedOutlineCursorObject: the box's top left corner. */
  moveOutline(x: number, y: number): void {
    for (const s of this.outline) {
      s.x = x + s.data[0] + 4;
      s.y = y + s.data[1] + 4;
    }
  }

  /** DexScreen_UpdateCategoryPageCursorObject: around the selected Pokémon's name card. */
  outlineSelected(): void {
    const [, , cardX, cardY] = PAGE_COORDS[Math.max(0, this.pageSpecies.length - 1)][this.cursorPos] ?? PAGE_COORDS[0][0];
    this.moveOutline(cardX * 8, cardY * 8);
  }

  removeOutline(): void {
    const { gba } = this.flow;
    for (const s of this.outline) gba.sprites.destroy(s);
    this.outline = [];
    gba.sprites.freeSheet("dexOutline");
  }

  /**
   * DexScreen_FlipCategoryPageInDirection, one step a frame; true once done. Left: the page
   * fades to its paper color and the new one unrolls from the left. Right: the page rolls away to
   * the left and the new one fades in.
   */
  flipPage(right: boolean): boolean {
    const { palettes } = this.flow.gba;
    const color = this.c.palette[7];
    const [, bg1, bg2, bg3] = this.c.bgs;
    const blank = () => {
      fillBgRect(bg3, BLANK_PAGE_TILE, 0, 0, 30, 20, 0);
      fillBgRect(bg2, 0, 0, 0, 32, 20, 0);
      fillBgRect(bg1, 0, 0, 0, 32, 20, 0);
    };
    const save = () => (this.savedMaps = [bg3.map.slice(), bg2.map.slice(), bg1.map.slice()]);
    switch (this.flipState) {
      case 0:
        this.flipState = right ? 6 : 2;
        break;
      case 1:
        this.flipState = 0;
        return true;
      // Left
      case 2:
        palettes.beginFade(0x7fff, 0, 0, 16, color);
        this.flipState++;
        break;
      case 3:
        blank();
        this.flipState++;
        break;
      case 4:
        palettes.beginFade(0x7fff, 0, 0, 0, color);
        this.drawCategoryPage(false);
        save();
        blank();
        this.flipStep = 0;
        this.flipState++;
        this.flow.play("se_ball_tray_enter");
        break;
      case 5:
        if (this.flipStep < 10) this.turnPage(this.flipStep++);
        else this.flipState = 1;
        break;
      // Right
      case 6:
        save();
        this.flipStep = 9;
        this.flipState++;
        this.flow.play("se_ball_tray_enter");
        break;
      case 7:
        if (this.flipStep !== 0) this.turnPage(this.flipStep--);
        else {
          // The game turns to step 7 here (its flip state, not 0), as it plays.
          this.turnPage(this.flipState);
          palettes.beginFade(0x7fff, 0, 16, 16, color);
          this.flipState++;
        }
        break;
      case 8:
        this.drawCategoryPage(false);
        this.flipState++;
        break;
      case 9:
        palettes.beginFade(0x7fff, 0, 16, 0, color);
        this.flipState = 1;
        break;
    }
    return false;
  }

  /** The species the flip draws next (state 4 or 8): its art must be loaded first. */
  get flipDrawsPage(): boolean {
    return this.flipState === 4 || this.flipState === 8;
  }

  /** DexScreen_TurnCategoryPage_BgEffect: each screen column shows a column of the saved page, or blank paper. */
  private turnPage(step: number): void {
    const [, bg1, bg2, bg3] = this.c.bgs;
    const [map3, map2, map1] = this.savedMaps;
    for (let col = 0; col < 30; col++) {
      const src = PAGE_TURN_COLUMNS[step][col];
      for (let y = 0; y < 20; y++) {
        const at = y * 32 + col;
        if (src === 30) {
          bg1.map[at] = 0;
          bg2.map[at] = 0;
          bg3.map[at] = BLANK_PAGE_TILE;
        } else {
          bg1.map[at] = map1[y * 32 + src];
          bg2.map[at] = map2[y * 32 + src];
          bg3.map[at] = map3[y * 32 + src];
        }
      }
    }
  }

  // Entry page

  /**
   * DexScreen_DexPageZoomEffectFrame: the page's frame grown from the selected Pokémon's name card
   * (scale 0) to the whole page (6), with its divider.
   */
  zoomFrame(bg: Background, scale: number): void {
    const coords = PAGE_COORDS[Math.max(0, this.pageSpecies.length - 1)][this.cursorPos] ?? PAGE_COORDS[0][0];
    const [, , tileLeft, tileTop] = this.pageSpecies.length ? coords : PAGE_COORDS[0][0];
    const width = Math.min(28, 6 + scale * 4);
    const height = Math.min(14, 3 + scale * 2);
    let left = tileLeft - (scale * 4) / 2;
    let top = tileTop - (scale * 2) / 2;
    if (left + width + 2 >= 30) left -= left + width + 2 - 30;
    else if (left < 0) left = 0;
    if (top + height + 2 >= 18) top -= top + height + 2 - 18;
    else if (top < 2) top = 2;
    const divY = top + 1 + (Math.trunc(height / 2) + 1);
    const H = 0x400;
    const right = left + 1 + width;
    const bottom = top + 1 + height;
    fillBgRect(bg, 4, left, top, 1, 1, 0);
    fillBgRect(bg, 5, left + 1, top, width, 1, 0);
    fillBgRect(bg, 4 | H, right, top, 1, 1, 0);
    fillBgRect(bg, 10, left, bottom, 1, 1, 0);
    fillBgRect(bg, 11, left + 1, bottom, width, 1, 0);
    fillBgRect(bg, 10 | H, right, bottom, 1, 1, 0);
    fillBgRect(bg, 6, left, top + 1, 1, divY - top - 1, 0);
    fillBgRect(bg, 7, left, divY, 1, 1, 0);
    fillBgRect(bg, 9, left, divY + 1, 1, top + height - divY, 0);
    fillBgRect(bg, 6 | H, right, top + 1, 1, divY - top - 1, 0);
    fillBgRect(bg, 7 | H, right, divY, 1, 1, 0);
    fillBgRect(bg, 9 | H, right, divY + 1, 1, top + height - divY, 0);
    fillBgRect(bg, 1, left + 1, top + 1, width, divY - top - 1, 0);
    fillBgRect(bg, 8, left + 1, divY, width, 1, 0);
    fillBgRect(bg, 2, left + 1, divY + 1, width, top + height - divY, 0);
  }

  /** DexScreen_DrawMonDexPage: the picture; No., name, category, height, weight, footprint; the description; the controls. */
  drawEntryPage(justRegistered: boolean): void {
    const [bg0, bg1, bg2, bg3] = this.c.bgs;
    const { assets } = this.flow;
    const species = this.dexSpecies;
    this.zoomFrame(bg3, 6);
    fillBgRect(bg2, 0, 0, 0, 30, 20, 0);
    fillBgRect(bg1, 0, 0, 0, 30, 20, 0);
    fillBgRect(bg0, 0, 0, 2, 30, 16, 0);

    const pic = new Window(bg1, ENTRY_PIC);
    pic.fill(0);
    this.loadMonPic(pic, species, ENTRY_PIC.palette);
    pic.putTilemap();
    pic.copyToVram();

    const stats = new Window(bg1, ENTRY_STATS);
    stats.fill(0);
    this.printDexNo(stats, FontId.Small, species, 0, 8);
    this.print(stats, FontId.Normal, assets.species(species).name, 28, 8, 0);
    this.printCategory(stats, species, 0, 24);
    this.printHeight(stats, species, 0, 36);
    this.printWeight(stats, species, 0, 48);
    if (this.c.pokedex.caught(species)) {
      const footprint = assets.loadedPokemonArt(species)?.footprint;
      if (footprint) stats.blitRect(footprint, 0, 0, 88, 40, 16, 16);
    }
    stats.putTilemap();
    stats.copyToVram();

    const flavor = new Window(bg1, ENTRY_FLAVOR);
    flavor.fill(0);
    if (this.c.pokedex.caught(species)) {
      // DexScreen_PrintMonFlavorText: centered by its widest line.
      const text = assets.species(species).description;
      const x = Math.max(0, Math.trunc((240 - this.flow.fonts[FontId.Normal].width(text, 0)) / 2));
      flavor.print(this.flow.fonts[FontId.Normal], x, 8, [0, 1, 2], text, 1, 0);
    }
    flavor.putTilemap();
    flavor.copyToVram();

    this.c.footer.fill(15);
    if (!justRegistered) {
      this.print(this.c.footer, FontId.Small, assets.text("gText_Cry"), 8, 2, 4);
      this.printControls(assets.text("gText_NextDataCancel"));
    } else this.printControls(assets.text("gText_Next"));
    this.c.footer.putTilemap();
    this.c.footer.copyToVram();
  }

  /**
   * DexScreen_PrintMonCategory: "<category> POKéMON", question marks until caught. The whole
   * category shows (revision 1; revision 0 stops at its first space).
   */
  private printCategory(win: Window, species: number, x: number, y: number): void {
    const category = this.c.pokedex.caught(species) ? this.flow.assets.species(species).category.slice(0, -1).slice(0, 11) : Array(11).fill(CHAR_QUESTION_MARK);
    const text = [...category, EOS];
    this.print(win, FontId.Small, text, x, y, 0);
    this.print(win, FontId.Small, this.flow.assets.text("gText_PokedexPokemon"), x + this.flow.fonts[FontId.Small].width(text, 0), y, 0);
  }

  /** DexScreen_PrintMonHeight: decimeters in feet and inches (rounded), e.g. " 2'04\"". */
  private printHeight(win: Window, species: number, x: number, y: number): void {
    const out = [...minLetterSpacing(5), CHAR_SPACE];
    if (this.c.pokedex.caught(species)) {
      let inches = Math.trunc((10000 * speciesInfo(species).height) / 254);
      if (inches % 10 >= 5) inches += 10;
      const feet = Math.trunc(inches / 120);
      inches = Math.trunc((inches - feet * 120) / 10);
      if (Math.trunc(feet / 10) === 0) out.push(CHAR_SPACE, CHAR_0 + feet);
      else out.push(CHAR_0 + Math.trunc(feet / 10), CHAR_0 + (feet % 10));
      out.push(CHAR_SGL_QUOTE_RIGHT, CHAR_0 + Math.trunc(inches / 10), CHAR_0 + (inches % 10), CHAR_DBL_QUOTE_RIGHT);
    } else out.push(CHAR_QUESTION_MARK, CHAR_QUESTION_MARK, CHAR_SGL_QUOTE_RIGHT, CHAR_QUESTION_MARK, CHAR_QUESTION_MARK, CHAR_DBL_QUOTE_RIGHT);
    out.push(EOS);
    this.print(win, FontId.Small, this.flow.assets.text("gText_HT"), x, y, 0);
    this.print(win, FontId.Small, out, x + 30, y, 0);
  }

  /** DexScreen_PrintMonWeight: hectograms in pounds to a tenth (rounded), leading zeros as spaces. */
  private printWeight(win: Window, species: number, x: number, y: number): void {
    const out = [...minLetterSpacing(5)];
    if (this.c.pokedex.caught(species)) {
      let lbs = Math.trunc((speciesInfo(species).weight * 100000) / 4536);
      if (lbs % 10 >= 5) lbs += 10;
      let leading = true;
      for (const unit of [100000, 10000, 1000]) {
        const d = Math.trunc(lbs / unit);
        lbs %= unit;
        if (d === 0 && leading) out.push(CHAR_SPACE);
        else {
          leading = false;
          out.push(CHAR_0 + d);
        }
      }
      out.push(CHAR_0 + Math.trunc(lbs / 100));
      lbs %= 100;
      out.push(CHAR_PERIOD, CHAR_0 + Math.trunc(lbs / 10));
    } else out.push(CHAR_QUESTION_MARK, CHAR_QUESTION_MARK, CHAR_QUESTION_MARK, CHAR_QUESTION_MARK, CHAR_PERIOD, CHAR_QUESTION_MARK);
    out.push(CHAR_SPACE, ...minLetterSpacing(0), ...this.flow.assets.text("gText_Lbs"));
    this.print(win, FontId.Small, this.flow.assets.text("gText_WT"), x, y, 0);
    this.print(win, FontId.Small, out, x + 30, y, 0);
  }

  // Area page

  /**
   * DexScreen_DrawMonAreaPage: the frames, Kanto's map, the icon, No. and name, SIZE and AREA,
   * the types and the size comparison once caught, and "AREA UNKNOWN" (no wild encounters yet).
   */
  drawAreaPage(): void {
    const [bg0, bg1, bg2, bg3] = this.c.bgs;
    const { assets, gba } = this.flow;
    const { pokedex } = this.c;
    const species = this.dexSpecies;
    const caught = pokedex.caught(species);
    frame(bg3, [4, 5, 6], 0, 2, 28, 14, 1);
    fillBgRect(bg0, 0, 0, 2, 30, 16, 0);
    frame(bg0, [29, 30, 31], 1, 9, 10, 6, null);
    fillBgRect(bg2, 0, 0, 0, 30, 20, 0);
    fillBgRect(bg1, 0, 0, 0, 30, 20, 0);

    const map = new Window(bg2, { ...AREA_KANTO, top: AREA_KANTO.top + KANTO_MAP_VOFF });
    copyImage(map, assets.get("dexMapKanto").image!);
    map.putTilemap();

    const name = new Window(bg2, AREA_NAME);
    const size = new Window(bg2, AREA_SIZE);
    const area = new Window(bg2, { ...AREA_AREA, top: AREA_AREA.top + KANTO_MAP_VOFF });
    const icon = new Window(bg2, AREA_ICON);
    const types = new Window(bg2, AREA_TYPES);

    // ListMenu_LoadMonIconPalette and ListMenu_DrawMonIconGraphics: the icon's first frame.
    icon.fill(0);
    const art = assets.loadedPokemonArt(species);
    if (art) {
      gba.palettes.load(art.iconPalette, AREA_ICON.palette * 16, 16);
      icon.blitRect(art.icon, 0, 0, 0, 0, 32, 32);
    }
    icon.putTilemap();
    icon.copyToVram();

    const small = this.flow.fonts[FontId.Small];
    for (const [win, label, template] of [
      [size, "gText_Size", AREA_SIZE],
      [area, "gText_Area", AREA_AREA],
    ] as const) {
      win.fill(0);
      const text = assets.text(label);
      this.print(win, FontId.Small, text, Math.trunc((template.width * 8 - small.width(text, 0)) / 2), 4, 0);
      win.putTilemap();
      win.copyToVram();
    }

    name.fill(0);
    this.printDexNo(name, FontId.Small, species, 0, 0);
    this.print(name, FontId.Normal, assets.species(species).name, 3, 12, 0);
    name.putTilemap();
    name.copyToVram();

    types.fill(0);
    gba.palettes.load(assets.get("pokemonTypesPal").palette, AREA_TYPES.palette * 16, 16);
    if (caught) {
      const { type1, type2 } = speciesInfo(species);
      this.blitType(types, type1, 0, 1);
      if (type1 !== type2) this.blitType(types, type2, 32, 1);
    }
    types.putTilemap();
    types.copyToVram();

    // The size comparison: the Pokémon and the trainer as silhouettes, each scaled by its entry.
    gba.palettes.load(assets.get("dexSilhouettePal").palette, 256 + SILHOUETTE_PALETTE * 16, 16);
    if (caught && art) {
      const [pokemonScale, pokemonOffset, trainerScale, trainerOffset] = assets.species(species).scale;
      const trainer = assets.get(this.c.gender === Gender.GIRL ? "picLeafFront" : "picRedFront").tiles;
      this.areaSprites = [this.silhouette("dexAreaMon", frontTiles(art.front), 40, 104, pokemonScale, pokemonOffset), this.silhouette("dexAreaTrainer", trainer, 80, 104, trainerScale, trainerOffset)].filter((s): s is Sprite => s !== null);
    }

    // No markers yet (wild encounters come later): "AREA UNKNOWN" over the map.
    map.blitRect(assets.get("dexWideEllipse").image!, 0, 0, 4, 28, 88, 16);
    const unknown = assets.text("gText_AreaUnknown");
    this.print(map, FontId.Small, unknown, Math.trunc((96 - small.width(unknown, 0)) / 2), 29, 0);
    map.copyToVram();

    this.c.footer.fill(15);
    this.print(this.c.footer, FontId.Small, assets.text("gText_Cry"), 8, 2, 4);
    this.printControls(assets.text("gText_CancelPreviousData"));
    this.c.footer.putTilemap();
    this.c.footer.copyToVram();
  }

  /** CreateMonPicSprite / CreateTrainerPicSprite in the silhouette's colors, scaled by an OAM matrix. */
  private silhouette(tag: string, tiles: Uint8Array, x: number, y: number, scale: number, offset: number): Sprite | null {
    const { gba } = this.flow;
    gba.sprites.loadSheet(tag, tiles);
    const s = gba.sprites.create({ sheet: tag, palette: tag, width: 64, height: 64, priority: 1, affineNormal: true }, x, y, 0);
    if (!s) return null;
    s.paletteNum = SILHOUETTE_PALETTE;
    s.matrixA = s.matrixD = scale;
    s.matrixB = s.matrixC = 0;
    s.y2 = offset;
    return s;
  }

  /** DexScreen_DestroyAreaScreenResources: the size comparison's sprites. */
  destroyAreaPage(): void {
    const { gba } = this.flow;
    for (const s of this.areaSprites) gba.sprites.destroy(s);
    this.areaSprites = [];
    gba.sprites.freeSheet("dexAreaMon");
    gba.sprites.freeSheet("dexAreaTrainer");
  }

  /** LoadMonPicInWindow: the front picture's first frame and its colors in BG palette `palette`. */
  private loadMonPic(win: Window, species: number, palette: number): void {
    const art: PokemonArt | null = this.flow.assets.loadedPokemonArt(species);
    if (!art) return;
    this.flow.gba.palettes.load(art.frontPalette, palette * 16, 16);
    win.blitRect(art.front, 0, 0, 0, 0, 64, 64);
  }
}

/** A frame of corner, edge and side tiles (flipped for the other sides) around a box, its inside filled or left. */
function frame(bg: Background, [corner, edge, side]: [number, number, number], left: number, top: number, width: number, height: number, inside: number | null): void {
  const H = 0x400;
  const V = 0x800;
  const right = left + 1 + width;
  const bottom = top + 1 + height;
  fillBgRect(bg, corner, left, top, 1, 1, 0);
  fillBgRect(bg, corner | H, right, top, 1, 1, 0);
  fillBgRect(bg, corner | V, left, bottom, 1, 1, 0);
  fillBgRect(bg, corner | H | V, right, bottom, 1, 1, 0);
  fillBgRect(bg, edge, left + 1, top, width, 1, 0);
  fillBgRect(bg, edge | V, left + 1, bottom, width, 1, 0);
  fillBgRect(bg, side, left, top + 1, 1, height, 0);
  fillBgRect(bg, side | H, right, top + 1, 1, height, 0);
  if (inside !== null) fillBgRect(bg, inside, left + 1, top + 1, width, height, 0);
}

/** CopyToWindowPixelBuffer: a picture as the window's pixels, color 0 included. */
export function copyImage(win: Window, image: IndexedImage): void {
  for (let y = 0; y < Math.min(win.rows, image.height); y++)
    for (let x = 0; x < Math.min(win.stride, image.width); x++) win.pixels[y * win.stride + x] = image.pixels[y * image.width + x] & 15;
}

/** A front picture's first 64×64 frame as sprite tiles. */
function frontTiles(front: IndexedImage): Uint8Array {
  const top = { width: 64, height: 64, pixels: front.pixels.subarray(0, 64 * 64), palette: null };
  return toTiles(top);
}

/** DexScreen_PrintNum3LeadingZeroes, or DexScreen_PrintNum3RightAlign (leading zeros as spaces). */
export function num3(n: number, rightAlign: boolean): number[] {
  const digits = [Math.trunc(n / 100) % 10, Math.trunc(n / 10) % 10, n % 10].map((d) => CHAR_0 + d);
  if (rightAlign)
    for (let i = 0; i < 3; i++) {
      if (digits[i] !== CHAR_0) break;
      digits[i] = CHAR_SPACE;
    }
  return [...digits, EOS];
}
