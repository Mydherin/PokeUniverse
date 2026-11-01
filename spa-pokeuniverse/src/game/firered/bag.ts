// The BAG (item_menu.c, bag.c, item_menu_icons.c), opened from the START menu: the bag on the
// left, shaking as the cursor moves and showing the open pocket; the pocket's name above it;
// the item list with its last row, CANCEL; the selected item's description and icon below.
// LEFT and RIGHT switch between ITEMS, KEY ITEMS and POKé BALLS, the list revealed row by row.
// A opens the item's menu (USE, GIVE, TOSS, REGISTER…; OPEN on the TM CASE and BERRY POUCH fades
// into them and back), SELECT moves the item within its pocket.
// Opened from the PC (DEPOSIT ITEM, ITEMMENULOCATION_ITEMPC) it shows only the ITEMS pocket under
// a "DEPOSIT ITEM" box: A deposits the item (how many, when more than one). Opened from the party
// menu's GIVE (ITEMMENULOCATION_PARTY) A chooses the item to give, from the TM CASE and BERRY
// POUCH too; GIVE in the bag itself opens the party menu to choose who holds it.
// mic-core decides what every action does; this shows it as FireRed does. The screen opens
// with a black curtain rising and closes with it falling.

import { create } from "@bufbuild/protobuf";
import { ItemOutcome, ItemResultSchema, type ItemResult } from "@pokeuniverse/contracts/item/v1/bag";
import { FieldUse, Item, Pocket as ItemPocket } from "@pokeuniverse/contracts/item/v1/catalog";
import { Gender } from "@pokeuniverse/contracts/trainer/v1/trainer";
import { Button } from "../gba/input";
import { PALETTES_ALL } from "../gba/palette";
import type { AffineCmd, AnimCmd, Sprite, SpriteTemplate } from "../gba/sprites";
import type { Task } from "../gba/tasks";
import { decimalText, expandPlaceholders, FontId, NumberMode, PLACEHOLDER_STR_VAR_1, PLACEHOLDER_STR_VAR_2, Window, type Text, type WindowTemplate } from "../gba/text";
import { HEIGHT, Layer, RGB_BLACK, WIDTH, WIN_EFFECTS, type Background } from "../gba/video";
import { itemInfo, type BagState } from "../world/items";
import { initBg } from "./common";
import type { Flow } from "./flow";
import { itemMessage, ItemMessagePlayer } from "./item-messages";
import { startPartyMenu, type PartyHost } from "./party-menu";
import { afterMove, fitListPosition, LIST_CANCEL, LIST_NOTHING_CHOSEN, ListMenu, type ListMenuItem, type ListPosition } from "./list-menu";
import { ItemMenuIcons } from "./item-menu-icons";
import type { TextId } from "./manifest";
import { userFrame } from "./manifest";
import { adjustQuantity, clearDialogWindowAndFrameToTransparent, clearStdWindowAndFrameToTransparent, copyTiles, CursorMenu, drawDialogueFrame, drawStdFrame, MENU_B_PRESSED, MENU_NOTHING_CHOSEN, YesNoMenu } from "./menu";
import { textSpeedDelay } from "./options";
import { ScrollArrow, ScrollArrowPair } from "./scroll-arrows";
import { startBerryPouch } from "./berry-pouch";
import { startTmCase } from "./tm-case";

export const enum Pocket {
  Items,
  KeyItems,
  PokeBalls,
}
const POCKETS = [Pocket.Items, Pocket.KeyItems, Pocket.PokeBalls] as const;
const POCKET_NAMES: Record<Pocket, TextId> = {
  [Pocket.Items]: "gText_Items2",
  [Pocket.KeyItems]: "gText_KeyItems2",
  [Pocket.PokeBalls]: "gText_PokeBalls2",
};
/** The bag's pockets as the catalog names them. */
const ITEM_POCKETS: Record<Pocket, ItemPocket> = {
  [Pocket.Items]: ItemPocket.ITEMS,
  [Pocket.KeyItems]: ItemPocket.KEY_ITEMS,
  [Pocket.PokeBalls]: ItemPocket.POKE_BALLS,
};

/** The trainer's items and what the bag asks mic-core; the overworld answers. */
export interface BagHost {
  readonly bag: BagState;
  readonly playerName: Text;
  use(item: Item): Promise<ItemResult>;
  give(item: Item): Promise<ItemResult>;
  toss(item: Item, quantity: number): Promise<ItemResult>;
  /** Shown at once; mic-core corrects a refused one. */
  register(item: Item): void;
  move(pocket: ItemPocket, from: number, to: number): void;
  /** Stores items in the PC (the bag opened from it). */
  deposit(item: Item, quantity: number): Promise<ItemResult>;
  /** The party menu GIVE opens. */
  readonly party: PartyHost;
}

/** Where the bag was opened from (gBagMenuState.location). */
export const enum BagLocation {
  /** The START menu, or back from a screen it opened. */
  Field,
  /** The PC's DEPOSIT ITEM. */
  ItemPc,
  /** The party menu's GIVE: an item to give is chosen. */
  Party,
}

/** How the bag closed: back (null), to the field where an item works, or with the item to give (from the party menu). */
export type BagExit = { field: ItemResult } | { chosen: Item } | null;

/** gBagMenuState: the open pocket and each pocket's list position, kept while the game runs. */
const state = {
  pocket: Pocket.Items as Pocket,
  positions: POCKETS.map((): ListPosition => ({ scroll: 0, row: 0 })),
};

/** Shows the bag, then `done` once it faded out. */
export function startBag(flow: Flow, gender: Gender, host: BagHost, done: (exit: BagExit) => void, location = BagLocation.Field): void {
  new Bag(flow, gender, host, done, location);
}

/**
 * FieldUseFunc_TmCase and FieldUseFunc_BerryPouch: the screen an item opens (OPEN), from the
 * bag or with SELECT on the field (`fromField`), then `done` once it faded out. False when the
 * item opens no screen yet (TOWN MAP, FAME CHECKER, TEACHY TV and mail come later). `pick`: opened
 * from the party menu's GIVE, A chooses the item to give (`done` with it).
 */
export function openItemScreen(flow: Flow, gender: Gender, host: BagHost, item: Item, fromField: boolean, done: (picked?: Item) => void, pick = false): boolean {
  if (item === Item.TM_CASE) startTmCase(flow, gender, host, fromField, done, pick);
  else if (item === Item.BERRY_POUCH) startBerryPouch(flow, gender, host, fromField, done, pick);
  else return false;
  return true;
}

/** CB2_ChooseMonToGiveItem: the party menu to give the item, then `back` (the screen it was chosen in). */
export function giveToParty(flow: Flow, host: PartyHost, item: Item, pc: boolean, back: () => void): void {
  startPartyMenu(flow, host, { kind: "give", item, pc }, back);
}

const WINDOWS = {
  list: { left: 11, top: 1, width: 18, height: 12, palette: 15, baseBlock: 0x08a },
  description: { left: 5, top: 14, width: 25, height: 6, palette: 15, baseBlock: 0x162 },
  pocketName: { left: 1, top: 1, width: 9, height: 2, palette: 15, baseBlock: 0x1f8 },
} satisfies Record<string, WindowTemplate>;
/** sDefaultBagWindowsDeposit: the "DEPOSIT ITEM" box takes the pocket name's place. */
const DEPOSIT_BOX: WindowTemplate = { left: 1, top: 1, width: 8, height: 2, palette: 12, baseBlock: 0x1f8 };

/** bag.c's sWindowTemplates, shown on demand (ShowBagWindow: the first one plus the rows it needs). */
const QUANTITY_WINDOW: WindowTemplate = { left: 24, top: 15, width: 5, height: 4, palette: 15, baseBlock: 0x242 };
const YES_NO_WINDOW: WindowTemplate = { left: 23, top: 15, width: 6, height: 4, palette: 15, baseBlock: 0x28a };
const MESSAGE_WINDOW: WindowTemplate = { left: 2, top: 15, width: 26, height: 4, palette: 15, baseBlock: 0x2a2 };
/** Window 6: the prompts beside the menus, wider for longer texts. */
const PROMPT_WINDOWS: WindowTemplate[] = [
  { left: 6, top: 15, width: 14, height: 4, palette: 12, baseBlock: 0x2a2 },
  { left: 6, top: 15, width: 15, height: 4, palette: 12, baseBlock: 0x2da },
  { left: 6, top: 15, width: 16, height: 4, palette: 12, baseBlock: 0x316 },
  { left: 6, top: 15, width: 23, height: 4, palette: 12, baseBlock: 0x356 },
];
/** Window 10: the item's menu, one row per action. */
const CONTEXT_WINDOWS: WindowTemplate[] = [2, 4, 6, 8].map((height) => ({ left: 22, top: 19 - height, width: 7, height, palette: 15, baseBlock: 0x20a }));
/** BG0's tiles: the windows', the last one ending at 0x3b2. */
const BG0_TILES = 0x3b2;

/** InitBagWindows: the user's frame, the message frame and the standard frame, with their palettes. */
const USER_FRAME_TILE = 0x064;
const USER_FRAME_PALETTE = 14;
const MESSAGE_FRAME_TILE = 0x06d;
const MESSAGE_FRAME_PALETTE = 13;
const STD_FRAME_TILE = 0x081;
const STD_FRAME_PALETTE = 12;

/** sTextColors: [fill, text, shadow]. */
const COLORS_WHITE = [0, 1, 2] as const;
const COLORS_DARK = [0, 2, 3] as const;
const COLORS_GRAY = [0, 3, 2] as const;

const MAX_SHOWED = 6;
/** The list's background (list.bin), 18×12 tiles at (11, 1), redrawn row by row on switching. */
const LIST_TILES_WIDTH = 18;
const LIST_TILES_HEIGHT = 12;
const LIST_BLANK_TILE = 0x02d;
const QUANTITY_X = 0x6e;
const SELECT_BUTTON_X = 0x70;
const CURSOR_WIDTH = 8;

/** The bag's frames in its sheet: closed, then the POKé BALLS, ITEMS and KEY ITEMS pockets open. */
const BAG_FRAME: Record<Pocket, number> = { [Pocket.Items]: 0x80, [Pocket.KeyItems]: 0xc0, [Pocket.PokeBalls]: 0x40 };
const BAG_ANIMS: AnimCmd[][] = POCKETS.map((p) => [{ image: 0, duration: 5 }, { image: BAG_FRAME[p], duration: 0 }, "end"]);
const BAG_IDLE = 0;
const BAG_SHAKE = 1;
const BAG_AFFINE: AffineCmd[][] = [
  [{ xScale: 0x100, yScale: 0x100, duration: 0 }, "end"],
  [
    { xScale: 0, yScale: 0, rotation: -2, duration: 2 },
    { xScale: 0, yScale: 0, rotation: 2, duration: 4 },
    { xScale: 0, yScale: 0, rotation: -2, duration: 4 },
    { xScale: 0, yScale: 0, rotation: 2, duration: 2 },
    "end",
  ],
];
const BAG_TEMPLATE: SpriteTemplate = { sheet: "bag", palette: "bag", width: 64, height: 64, priority: 1, affineNormal: true, anims: BAG_ANIMS, affineAnims: BAG_AFFINE };

/** The black curtain (Task_AnimateWin0v): WIN0's bottom moves 16 lines a frame. */
const CURTAIN_STEP = 16;

/** The item menu's actions (sItemMenuContextActions). */
const enum Action {
  Use,
  Toss,
  Register,
  Give,
  Cancel,
  Check,
  Open,
  Deselect,
}
const ACTION_TEXTS: Record<Action, TextId> = {
  [Action.Use]: "gOtherText_Use",
  [Action.Toss]: "gOtherText_Toss",
  [Action.Register]: "gOtherText_Register",
  [Action.Give]: "gOtherText_Give",
  [Action.Cancel]: "gFameCheckerText_Cancel",
  [Action.Check]: "gOtherText_Check",
  [Action.Open]: "gOtherText_Open",
  [Action.Deselect]: "gOtherText_Deselect",
};

/** The selected item while its menu or an action runs. */
interface Selected {
  item: Item;
  index: number;
  quantity: number;
}

class Bag {
  private readonly bg0: Background;
  private readonly bg1: Background;
  private readonly list: Window;
  private readonly description: Window;
  private readonly pocketName: Window;
  private readonly bag: Sprite;
  private readonly icons: ItemMenuIcons;
  private menu: ListMenu | null = null;
  private scrollArrows: ScrollArrowPair | null = null;
  private switchArrows: ScrollArrowPair | null = null;
  private curtain: Task | null = null;
  /** The task function running now (FireRed's task func), one call a frame. */
  private step: () => void = () => this.handleInput();
  private switchDir = 0;
  private switchRow = 0;
  private selected: Selected | null = null;
  private contextMenu: CursorMenu | null = null;
  private actions: Action[] = [];
  private prompt: Window | null = null;
  private quantityWin: Window | null = null;
  private message: Window | null = null;
  private yesNo: YesNoMenu | null = null;
  private quantity = 1;
  /** The slot being moved with SELECT; -1 when none (itemOriginalLocation). */
  private moving = -1;

  /** LoadBagMenuGraphics: every step runs in the first frame. */
  constructor(
    private readonly flow: Flow,
    private readonly gender: Gender,
    private readonly host: BagHost,
    private readonly done: (exit: BagExit) => void,
    private readonly location: BagLocation,
  ) {
    const { gba, assets } = flow;
    this.icons = new ItemMenuIcons(flow);
    // GoToBagMenu(ITEMMENULOCATION_ITEMPC, OPEN_BAG_ITEMS): the ITEMS pocket, kept for later.
    if (location === BagLocation.ItemPc) state.pocket = Pocket.Items;
    gba.setVBlank(null);
    gba.reset();
    const { video, palettes } = gba;
    [this.bg0, this.bg1] = video.bgs;
    initBg(this.bg0, 0, 0);
    initBg(this.bg1, 0, 1);
    this.bg0.tiles = new Uint8Array(BG0_TILES * 64);
    const bg = assets.get("bagBg");
    this.bg1.tiles = bg.tiles;
    const map = location === BagLocation.ItemPc ? assets.get("bagBgItemPcMap").map! : bg.map!;
    this.bg1.map.set(map.subarray(0, this.bg1.map.length));
    this.bg0.visible = this.bg1.visible = true;

    palettes.load(bg.palette, 0, 48);
    const girl = this.gender === Gender.GIRL;
    if (girl) palettes.load(assets.get("bagBgFemalePal").palette, 0, 16);
    gba.sprites.loadSheet("bag", assets.get(girl ? "bagFemale" : "bagMale").tiles);
    palettes.loadSpritePalette("bag", assets.get("bagPal").palette);

    // InitBagWindows.
    const frame = assets.get(userFrame(flow.options.frame));
    copyTiles(this.bg0, frame.tiles, USER_FRAME_TILE, 9);
    palettes.load(frame.palette, USER_FRAME_PALETTE * 16, 16);
    copyTiles(this.bg0, assets.get("menuMessageFrame").tiles, MESSAGE_FRAME_TILE, 20);
    palettes.load(assets.get("textWindowPal0").palette, MESSAGE_FRAME_PALETTE * 16, 16);
    copyTiles(this.bg0, assets.get("stdWindowFrame").tiles, STD_FRAME_TILE, 9);
    palettes.load(assets.get("textWindowPal3").palette, STD_FRAME_PALETTE * 16, 16);
    palettes.load(assets.get("bagWindowPal").palette, 15 * 16, 16);
    this.list = new Window(this.bg0, WINDOWS.list);
    this.description = new Window(this.bg0, WINDOWS.description);
    this.pocketName = new Window(this.bg0, location === BagLocation.ItemPc ? DEPOSIT_BOX : WINDOWS.pocketName);
    for (const win of [this.list, this.description, this.pocketName]) {
      win.fill(0);
      win.putTilemap();
      win.copyToVram();
    }

    for (const p of POCKETS) fitListPosition(state.positions[p], this.count(p) + 1, this.maxShowed(p));
    if (location === BagLocation.ItemPc) this.drawDepositBox();
    else this.printPocketName();
    gba.tasks.create(() => this.step(), 0);
    this.openList();
    this.bag = gba.sprites.create(BAG_TEMPLATE, 40, 68, 0)!;
    this.icons.createSwapLine();
    this.showPocket(state.pocket);
    this.createArrows();

    // ShowBagOrBeginWin0OpenTask: a black backdrop, nothing shown inside WIN0, the curtain rising.
    palettes.load([RGB_BLACK], 0, 1);
    video.win0On = true;
    Object.assign(video.win0, { left: 0, right: WIDTH, top: 0, bottom: HEIGHT });
    video.winIn0 = 0;
    video.winOut = Layer.BG0 | Layer.BG1 | Layer.BG2 | Layer.BG3 | Layer.OBJ | WIN_EFFECTS;
    palettes.blendPalettes(PALETTES_ALL, 16, RGB_BLACK);
    palettes.beginFade(PALETTES_ALL, 0, 16, 0, RGB_BLACK);
    this.moveCurtain(HEIGHT + 2 * CURTAIN_STEP, -CURTAIN_STEP);

    gba.setVBlank(gba.standardVBlank);
    gba.setMain(() => flow.runFrame());
  }

  private slots(pocket: Pocket) {
    return this.host.bag.pocket(ITEM_POCKETS[pocket]);
  }

  private count(pocket: Pocket): number {
    return this.slots(pocket).length;
  }

  /** Pocket_CalculateNItemsAndMaxShowed: the items and CANCEL, 6 rows at most. */
  private maxShowed(pocket: Pocket): number {
    return Math.min(this.count(pocket) + 1, MAX_SHOWED);
  }

  // Browsing

  /** Task_BagMenu_HandleInput. */
  private handleInput(): void {
    const { gba } = this.flow;
    if (gba.palettes.fadeActive || this.curtain) return;
    const dir = this.pocketSwitchInput(state.pocket);
    if (dir) return this.switchPockets(dir, false);
    const menu = this.menu!;
    if (gba.input.isPressed(Button.Select) && this.location === BagLocation.Field && menu.selectedId !== this.count(state.pocket)) {
      this.flow.play("se_select");
      return this.beginMoving(menu.selectedId);
    }
    const chosen = menu.processInput();
    state.positions[state.pocket] = menu.position;
    if (chosen === LIST_NOTHING_CHOSEN) return;
    this.flow.play("se_select");
    if (chosen === LIST_CANCEL || chosen === this.count(state.pocket)) return this.close(true, null);
    const slot = this.slots(state.pocket)[chosen];
    this.destroyArrows();
    this.printCursor(COLORS_GRAY);
    this.selected = { item: slot.item, index: chosen, quantity: slot.quantity };
    this.setMessageBoxPalette(1);
    if (this.location === BagLocation.ItemPc) this.depositAction();
    else if (this.location === BagLocation.Party) this.chooseToGive();
    else this.openContextMenu();
  }

  /** ProcessPocketSwitchInput: -1 or 1 (with its sound) when LEFT or RIGHT can switch from `pocket`; never from the PC. */
  private pocketSwitchInput(pocket: Pocket): number {
    const { input } = this.flow.gba;
    if (this.location === BagLocation.ItemPc) return 0;
    if (input.isPressed(Button.Left) && pocket > Pocket.Items) {
      this.flow.play("se_bag_pocket");
      return -1;
    }
    if (input.isPressed(Button.Right) && pocket < Pocket.PokeBalls) {
      this.flow.play("se_bag_pocket");
      return 1;
    }
    return 0;
  }

  /** SwitchPockets: the list, its texts, the icon and arrows go; the list's background is blanked. */
  private switchPockets(dir: number, again: boolean): void {
    this.step = () => this.animateSwitch();
    this.switchDir = dir;
    this.switchRow = 0;
    if (!again) {
      for (const win of [this.list, this.description, this.pocketName]) win.clearTilemap();
      this.closeList();
      this.icons.destroyIcon();
      this.destroyArrows();
    }
    for (let y = 1; y < 1 + LIST_TILES_HEIGHT; y++) for (let x = 11; x < 11 + LIST_TILES_WIDTH; x++) this.bg1.setEntry(x, y, LIST_BLANK_TILE);
    this.showPocket(state.pocket + dir);
  }

  /** Task_AnimateSwitchPockets: another switch can start at once; the list shows from its bottom row up. */
  private animateSwitch(): void {
    const next = this.pocketSwitchInput(state.pocket + this.switchDir);
    if (next) {
      state.pocket += this.switchDir;
      return this.switchPockets(next, true);
    }
    if (this.switchRow < LIST_TILES_HEIGHT) {
      this.drawListRow(++this.switchRow);
      return;
    }
    state.pocket += this.switchDir;
    this.printPocketName();
    this.openList();
    this.description.putTilemap();
    this.pocketName.putTilemap();
    this.createArrows();
    this.step = () => this.handleInput();
  }

  /** DrawItemListRow: row 1 is the list's bottom row, row 12 its top. */
  private drawListRow(row: number): void {
    const map = this.flow.assets.get("bagListMap").map!;
    const from = LIST_TILES_HEIGHT - row;
    for (let x = 0; x < LIST_TILES_WIDTH; x++) this.bg1.setEntry(11 + x, 1 + from, map[from * LIST_TILES_WIDTH + x]);
  }

  /** Bag_BuildListMenuTemplate and ListMenuInit: the pocket's items, then CANCEL. */
  private openList(): void {
    const { assets } = this.flow;
    const pocket = state.pocket;
    const items: ListMenuItem[] = this.slots(pocket).map((slot, id) => ({ label: assets.itemName(slot.item), id }));
    items.push({ label: assets.text("gFameCheckerText_Cancel"), id: items.length });
    const template = {
      win: this.list,
      items,
      maxShowed: this.maxShowed(pocket),
      font: FontId.Normal,
      itemX: 9,
      cursorX: 1,
      upTextY: 2,
      itemVerticalPadding: 2,
      letterSpacing: 0,
      colors: COLORS_DARK,
      onMove: (id: number, onInit: boolean) => this.onCursorMove(id, onInit),
      onPrint: (id: number, y: number) => this.printRowExtras(id, y),
    };
    this.menu = new ListMenu(this.flow, template, state.positions[pocket]);
  }

  private closeList(): void {
    if (this.menu) state.positions[state.pocket] = this.menu.position;
    this.menu = null;
  }

  /** The pocket's list built again from the bag, after it changed (Pocket_CalculateNItemsAndMaxShowed and on). */
  private rebuildList(): void {
    this.closeList();
    const pocket = state.pocket;
    fitListPosition(state.positions[pocket], this.count(pocket) + 1, this.maxShowed(pocket));
    this.openList();
  }

  /** BagListMenuMoveCursorFunc: the sound and the bag's shake, the icon, the description. */
  private onCursorMove(id: number, onInit: boolean): void {
    if (!onInit) {
      this.flow.play("se_bag_cursor");
      this.shakeBag();
    }
    const slot = this.slots(state.pocket)[id];
    if (this.moving < 0) {
      this.icons.showIcon(slot?.item ?? null);
      this.printDescription(slot ? this.flow.assets.itemDescription(slot.item) : this.flow.assets.text("gText_CloseBag"));
    }
  }

  private printDescription(text: Text): void {
    this.description.fill(0);
    this.description.print(this.flow.fonts[FontId.Normal], 0, 3, COLORS_WHITE, text, 2, 0);
    this.description.copyToVram();
  }

  /**
   * BagListMenuItemPrintFunc: while moving, the moved item's gray cursor; "×n" right of the
   * name, except for important items and in the KEY ITEMS pocket, where the registered item
   * shows the SELECT mark instead.
   */
  private printRowExtras(id: number, y: number): void {
    if (this.moving >= 0) {
      if (this.moving === id) this.printCursorAt(y, COLORS_GRAY);
      else this.list.fillRect(0, 1, y, CURSOR_WIDTH, this.flow.fonts[FontId.Normal].maxLetterHeight);
    }
    const slot = this.slots(state.pocket)[id];
    if (!slot) return;
    const { assets, fonts } = this.flow;
    if (state.pocket !== Pocket.KeyItems && !itemInfo(slot.item)?.important) {
      const text = expandPlaceholders(assets.text("gText_TimesStrVar1"), { [PLACEHOLDER_STR_VAR_1]: decimalText(slot.quantity, NumberMode.RightAlign, 3) });
      this.list.print(fonts[FontId.Small], QUANTITY_X, y, COLORS_DARK, text, 0, 0);
    } else if (this.host.bag.registered !== Item.UNSPECIFIED && this.host.bag.registered === slot.item) {
      this.list.blit(assets.get("bagSelectButton").image!, SELECT_BUTTON_X, y);
    }
  }

  /** bag_menu_print_cursor_: the "▶" at the list's selected row, in the given colors. */
  private printCursor(colors: readonly [number, number, number]): void {
    this.printCursorAt(this.menu!.cursorY, colors);
    this.list.copyToVram();
  }

  private printCursorAt(y: number, colors: readonly [number, number, number]): void {
    this.list.print(this.flow.fonts[FontId.Normal], 1, y, colors, this.flow.assets.text("gText_SelectorArrow2"), 0, 0);
  }

  /** Bag_FillMessageBoxWithPalette: the description box's palette (1 normal, 2 behind a menu). */
  private setMessageBoxPalette(which: number): void {
    for (let y = 14; y < 20; y++)
      for (let x = 0; x < 30; x++) this.bg1.setEntry(x, y, (this.bg1.entry(x, y) & 0x0fff) | ((which + 1) << 12));
  }

  /** Task_RedrawArrowsAndReturnToBagMenuSelect. */
  private backToList(): void {
    this.selected = null;
    this.setMessageBoxPalette(0);
    this.createArrows();
    this.step = () => this.handleInput();
  }

  // The item's menu

  /** OpenContextMenu: the actions for the pocket and item, and "<item> is selected." beside them. */
  private openContextMenu(): void {
    const { flow } = this;
    const { item } = this.selected!;
    const field = itemInfo(item)?.fieldUse;
    switch (state.pocket) {
      case Pocket.Items:
        this.actions = field === FieldUse.MAIL ? [Action.Check, Action.Give, Action.Toss, Action.Cancel] : [Action.Use, Action.Give, Action.Toss, Action.Cancel];
        break;
      case Pocket.KeyItems: {
        const opens = item === Item.TM_CASE || item === Item.BERRY_POUCH;
        this.actions = [opens ? Action.Open : Action.Use, this.host.bag.registered === item ? Action.Deselect : Action.Register, Action.Cancel];
        break;
      }
      case Pocket.PokeBalls:
        this.actions = [Action.Give, Action.Toss, Action.Cancel];
        break;
    }
    const font = flow.fonts[FontId.Normal];
    const lineHeight = font.maxLetterHeight + 2;
    const win = new Window(this.bg0, CONTEXT_WINDOWS[this.actions.length - 1]);
    drawStdFrame(win, USER_FRAME_TILE, USER_FRAME_PALETTE);
    this.actions.forEach((a, i) => win.print(font, CURSOR_WIDTH, 2 + i * lineHeight, [1, 2, 3], flow.assets.text(ACTION_TEXTS[a]), 0));
    this.contextMenu = new CursorMenu(flow, win, FontId.Normal, 0, 2, lineHeight, this.actions.length, 0);
    this.showPrompt(0, expandPlaceholders(flow.assets.text("gText_Var1IsSelected"), { [PLACEHOLDER_STR_VAR_1]: flow.assets.itemName(item) }));
    this.step = () => this.contextMenuInput();
  }

  /** Task_FieldItemContextMenuHandleInput. */
  private contextMenuInput(): void {
    const chosen = this.contextMenu!.processInput(false);
    if (chosen === MENU_NOTHING_CHOSEN) return;
    if (chosen === MENU_B_PRESSED) {
      this.flow.play("se_select");
      return this.cancelAction();
    }
    switch (this.actions[chosen]) {
      case Action.Use:
      case Action.Check:
      case Action.Open:
        return this.useAction();
      case Action.Give:
        return this.giveAction();
      case Action.Toss:
        return this.tossAction();
      case Action.Register:
      case Action.Deselect:
        return this.registerAction();
      default:
        return this.cancelAction();
    }
  }

  /** HideBagWindow(10), HideBagWindow(6): the menu and its prompt gone, the list and description back. */
  private hideContextMenu(): void {
    if (this.contextMenu) clearStdWindowAndFrameToTransparent(this.contextMenu.win);
    this.contextMenu = null;
    this.hidePrompt();
    this.list.putTilemap();
    this.description.putTilemap();
  }

  /** Task_ItemMenuAction_Cancel. */
  private cancelAction(): void {
    this.hideContextMenu();
    this.printCursor(COLORS_DARK);
    this.backToList();
  }

  /** Task_ItemMenuAction_Use: mic-core decides (no Pokémon, not now, the item's effect). */
  private useAction(): void {
    if (!itemInfo(this.selected!.item)?.fieldUse) return; // No USE: nothing happens, the menu stays.
    this.hideContextMenu();
    this.ask(this.host.use(this.selected!.item), (r) => this.onResult(r));
  }

  /** Task_ItemMenuAction_Give: mic-core checks it can be held, then the party menu chooses who (CB2_ChooseMonToGiveItem). */
  private giveAction(): void {
    this.hideContextMenu();
    const item = this.selected!.item;
    this.ask(this.host.give(item), (r) => {
      if (r.outcome !== ItemOutcome.PARTY_MENU) return this.onResult(r);
      const { flow, gender, host, done } = this;
      this.close(false, null, () => giveToParty(flow, host.party, item, false, () => startBag(flow, gender, host, done)));
    });
  }

  /**
   * Task_ItemContext_FieldGive: the item chosen to give, back to the party menu; the TM CASE and
   * BERRY POUCH open to choose in them; key items and other important ones can't be held.
   */
  private chooseToGive(): void {
    const { flow, gender, host, done } = this;
    const { item } = this.selected!;
    if (item === Item.TM_CASE || item === Item.BERRY_POUCH) {
      const back = (picked?: Item) => (picked ? done({ chosen: picked }) : startBag(flow, gender, host, done, BagLocation.Party));
      return this.close(false, null, () => openItemScreen(flow, gender, host, item, false, back, true));
    }
    if (state.pocket !== Pocket.KeyItems && !itemInfo(item)?.important) return this.close(true, { chosen: item });
    this.onResult(create(ItemResultSchema, { outcome: ItemOutcome.CANT_BE_HELD, item }));
  }

  /** Task_ItemMenuAction_ToggleSelect: the list shows the SELECT mark at once. */
  private registerAction(): void {
    this.host.register(this.selected!.item);
    this.rebuildList();
    this.cancelAction();
  }

  /** Waits for mic-core's answer; nothing else runs meanwhile. */
  private ask(answer: Promise<ItemResult>, then: (r: ItemResult) => void): void {
    this.step = () => {};
    void answer.then((r) => {
      this.step = () => then(r);
    });
  }

  /**
   * What an action did: a message in the bag, back to the field, the screen the item opens
   * (ItemMenu_StartFadeToExitCallback, then back into the bag), or (screens to come) back to the list.
   */
  private onResult(r: ItemResult): void {
    if (r.outcome === ItemOutcome.NO_RESPONSE || r.outcome === ItemOutcome.ON_FIELD) return this.close(false, { field: r });
    if (r.outcome === ItemOutcome.OPEN) {
      const { flow, gender, host, done } = this;
      return this.close(false, null, () => {
        if (!openItemScreen(flow, gender, host, r.item, false, () => startBag(flow, gender, host, done))) startBag(flow, gender, host, done);
      });
    }
    const msg = itemMessage(this.flow, r, this.host.playerName);
    if (!msg) return this.returnFromContext();
    const player = new ItemMessagePlayer(
      this.flow,
      msg,
      (text, font) => this.showMessage(text, font),
      () => this.flow.text.isActive(this.message!),
    );
    this.step = () => {
      if (player.update()) this.returnFromContext();
    };
  }

  /** DisplayItemMessageInBag: the message frame at the bottom, printed at the player's text speed. */
  private showMessage(text: Text, font: FontId): void {
    const { flow } = this;
    this.message ??= new Window(this.bg0, MESSAGE_WINDOW);
    this.message.fill(1);
    drawDialogueFrame(this.message, false, MESSAGE_FRAME_TILE, MESSAGE_FRAME_PALETTE);
    const f = flow.fonts[font];
    flow.text.ctx.canABSpeedUpPrint = true;
    flow.text.add(this.message, { font: f, x: 0, y: 1, letterSpacing: f.letterSpacing, lineSpacing: f.lineSpacing, colors: [1, 2, 3] }, textSpeedDelay(flow.options), text);
    this.message.copyToVram();
  }

  /** Task_ReturnToBagFromContextMenu: the message closed, the list built again from the bag. */
  private returnFromContext(): void {
    if (this.message) {
      clearDialogWindowAndFrameToTransparent(this.message);
      this.description.putTilemap();
      this.message = null;
    }
    this.flow.text.ctx.canABSpeedUpPrint = false;
    this.rebuildList();
    this.backToList();
  }

  // TOSS

  /** Task_ItemMenuAction_Toss: how many (when more than one), then YES/NO. */
  private tossAction(): void {
    this.hideContextMenu();
    this.quantity = 1;
    if (this.selected!.quantity === 1) return this.confirmToss();
    this.beginQuantity("gText_TossOutHowManyStrVar1s", () => this.confirmToss());
  }

  /** InitQuantityToTossOrDeposit: "<text> <item>?" with "×001" beside it, then `chosen` on A. */
  private beginQuantity(prompt: TextId, chosen: () => void): void {
    const { flow } = this;
    this.showPrompt(2, expandPlaceholders(flow.assets.text(prompt), { [PLACEHOLDER_STR_VAR_1]: flow.assets.itemName(this.selected!.item) }));
    this.quantityWin = new Window(this.bg0, QUANTITY_WINDOW);
    drawStdFrame(this.quantityWin, USER_FRAME_TILE, USER_FRAME_PALETTE);
    this.printQuantity();
    this.scrollArrows = ScrollArrowPair.vertical(flow, 212, 120, 152, 2, "bagScrollArrows", () => 1);
    this.step = () => this.selectQuantity(chosen);
  }

  /** UpdateQuantityToTossOrDeposit: "×nnn". */
  private printQuantity(): void {
    const win = this.quantityWin!;
    const text = expandPlaceholders(this.flow.assets.text("gText_TimesStrVar1"), { [PLACEHOLDER_STR_VAR_1]: decimalText(this.quantity, NumberMode.LeadingZeros, 3) });
    win.fill(1);
    win.print(this.flow.fonts[FontId.Small], 4, 10, COLORS_DARK, text, 1, 0);
    win.copyToVram();
  }

  /** Task_SelectQuantityToToss and Task_SelectQuantityToDeposit. */
  private selectQuantity(chosen: () => void): void {
    const { input } = this.flow.gba;
    const quantity = adjustQuantity(this.flow, this.quantity, this.selected!.quantity);
    if (quantity !== this.quantity) {
      this.quantity = quantity;
      return this.printQuantity();
    }
    if (!input.isPressed(Button.A | Button.B)) return;
    this.flow.play("se_select");
    this.hidePrompt();
    clearStdWindowAndFrameToTransparent(this.quantityWin!);
    this.quantityWin = null;
    this.scrollArrows?.destroy();
    this.scrollArrows = null;
    if (input.isPressed(Button.A)) return chosen();
    this.list.putTilemap();
    this.description.putTilemap();
    this.printCursor(COLORS_DARK);
    this.backToList();
  }

  /** Task_ConfirmTossItems: "Throw away n of this item?" with YES/NO. */
  private confirmToss(): void {
    const { flow } = this;
    this.showPrompt(1, expandPlaceholders(flow.assets.text("gText_ThrowAwayStrVar2OfThisItemQM"), { [PLACEHOLDER_STR_VAR_2]: decimalText(this.quantity, NumberMode.LeftAlign, 3) }));
    this.yesNo = new YesNoMenu(flow, this.bg0, YES_NO_WINDOW, FontId.Normal, 0, 2, 0, USER_FRAME_TILE, USER_FRAME_PALETTE);
    this.step = () => {
      const answer = this.yesNo!.processInput();
      if (answer === MENU_NOTHING_CHOSEN) return;
      this.yesNo = null;
      if (answer === MENU_B_PRESSED) this.flow.play("se_select");
      if (answer === 0) return this.tossItems();
      this.hidePrompt();
      this.description.putTilemap();
      this.printCursor(COLORS_DARK);
      this.backToList();
    };
  }

  /** Task_TossItem_Yes: mic-core throws them away; "Threw away n <item>(s)." until A or B. */
  private tossItems(): void {
    const sel = this.selected!;
    this.hidePrompt();
    this.ask(this.host.toss(sel.item, this.quantity), (r) => {
      if (r.outcome !== ItemOutcome.TOSSED) return this.returnFromContext();
      this.showDone("gText_ThrewAwayStrVar2StrVar1s", r);
    });
  }

  /**
   * Task_WaitAB_RedrawAndReturnToBag: "<done> n <item>(s)." beside the list until A or B, then
   * the list built again from the bag.
   */
  private showDone(text: TextId, r: ItemResult): void {
    const { flow } = this;
    this.showPrompt(
      3,
      expandPlaceholders(flow.assets.text(text), {
        [PLACEHOLDER_STR_VAR_1]: flow.assets.itemName(this.selected!.item),
        [PLACEHOLDER_STR_VAR_2]: decimalText(r.value, NumberMode.LeftAlign, 3),
      }),
    );
    this.step = () => {
      if (!flow.gba.input.isPressed(Button.A | Button.B)) return;
      flow.play("se_select");
      this.hidePrompt();
      this.description.putTilemap();
      this.returnFromContext();
    };
  }

  // DEPOSIT ITEM

  /** Task_ItemContext_Deposit: how many (when more than one), then the deposit. */
  private depositAction(): void {
    this.quantity = 1;
    if (this.selected!.quantity === 1) return this.deposit();
    this.beginQuantity("gText_DepositHowManyStrVars1", () => this.deposit());
  }

  /** Task_TryDoItemDeposit: mic-core stores them, or says the PC has no room. */
  private deposit(): void {
    this.ask(this.host.deposit(this.selected!.item, this.quantity), (r) => {
      if (r.outcome === ItemOutcome.DEPOSITED) this.showDone("gText_DepositedStrVar2StrVar1s", r);
      else this.onResult(r);
    });
  }

  /** BagDrawDepositItemTextBox: "DEPOSIT ITEM" in a standard frame, centered over the bag. */
  private drawDepositBox(): void {
    const { flow } = this;
    const font = flow.fonts[FontId.Small];
    const text = flow.assets.text("gText_DepositItem");
    drawStdFrame(this.pocketName, STD_FRAME_TILE, STD_FRAME_PALETTE);
    this.pocketName.fill(0);
    this.pocketName.print(font, Math.trunc((0x40 - font.width(text, 0)) / 2), 1, [1, 2, 3], text);
    this.pocketName.copyToVram();
  }

  /** ShowBagWindow(6, size) with a text printed at once (BagPrintTextOnWindow). */
  private showPrompt(size: number, text: Text): void {
    this.hidePrompt();
    this.prompt = new Window(this.bg0, PROMPT_WINDOWS[size]);
    drawStdFrame(this.prompt, STD_FRAME_TILE, STD_FRAME_PALETTE);
    this.prompt.print(this.flow.fonts[FontId.Normal], 0, 2, COLORS_DARK, text, 1, 0);
    this.prompt.copyToVram();
  }

  private hidePrompt(): void {
    if (this.prompt) clearStdWindowAndFrameToTransparent(this.prompt);
    this.prompt = null;
  }

  // Moving with SELECT

  /** BeginMovingItemInPocket: the list draws no cursor; the moved item's stays, gray; the line shows where it goes. */
  private beginMoving(index: number): void {
    const { flow } = this;
    const menu = this.menu!;
    menu.cursorHidden = true;
    this.moving = index;
    const name = flow.assets.itemName(this.slots(state.pocket)[index].item);
    this.printDescription(expandPlaceholders(flow.assets.text("gOtherText_WhereShouldTheStrVar1BePlaced"), { [PLACEHOLDER_STR_VAR_1]: name }));
    this.icons.updateSwapLine(0, menu.cursorY);
    this.icons.setSwapLineVisible(true);
    this.switchArrows?.destroy();
    this.switchArrows = null;
    this.printCursor(COLORS_GRAY);
    this.step = () => this.movingInput();
  }

  /** Task_MoveItemInPocket_HandleInput. */
  private movingInput(): void {
    const menu = this.menu!;
    const chosen = menu.processInput();
    state.positions[state.pocket] = menu.position;
    this.icons.updateSwapLine(0, menu.cursorY);
    const at = menu.scroll + menu.row;
    if (this.flow.gba.input.isPressed(Button.Select)) {
      this.flow.play("se_select");
      return this.endMoving(at, true);
    }
    if (chosen === LIST_NOTHING_CHOSEN) return;
    this.flow.play("se_select");
    this.endMoving(chosen === LIST_CANCEL ? at : chosen, chosen !== LIST_CANCEL);
  }

  /** ExecuteMoveItemInPocket, or AbortMovingItemInPocket: the cursor stays on the moved item. */
  private endMoving(to: number, execute: boolean): void {
    const from = this.moving;
    this.moving = -1;
    if (execute && to !== from && to !== from + 1) this.host.move(ITEM_POCKETS[state.pocket], from, to);
    const pos = state.positions[state.pocket];
    afterMove(pos, from, to);
    this.closeList();
    state.positions[state.pocket] = pos;
    this.openList();
    this.icons.setSwapLineVisible(false);
    this.createSwitchArrows();
    this.step = () => this.handleInput();
  }

  // Sprites

  /** PrintBagPocketName: centered over the bag. */
  private printPocketName(): void {
    const font = this.flow.fonts[FontId.NormalCopy1];
    const name = this.flow.assets.text(POCKET_NAMES[state.pocket]);
    this.pocketName.fill(0);
    this.pocketName.print(font, Math.trunc((0x48 - font.width(name)) / 2), 1, COLORS_WHITE, name);
    this.pocketName.copyToVram();
  }

  /** SetBagVisualPocketId: the bag drops in 5 pixels, opening the pocket. */
  private showPocket(pocket: Pocket): void {
    const bag = this.bag;
    bag.y2 = -5;
    bag.callback = (s) => {
      if (s.y2 !== 0) s.y2++;
      else s.callback = () => {};
    };
    bag.startAnim(pocket);
  }

  /** ShakeBagSprite: once the last shake ended. */
  private shakeBag(): void {
    const bag = this.bag;
    if (!bag.affineEnded) return;
    bag.startAffineAnim(BAG_SHAKE);
    bag.callback = (s) => {
      if (!s.affineEnded) return;
      s.startAffineAnim(BAG_IDLE);
      s.callback = () => {};
    };
  }

  /** CreatePocketScrollArrowPair and CreatePocketSwitchArrowPair. */
  private createArrows(): void {
    const { flow } = this;
    const pocket = state.pocket;
    const fullyDown = this.count(pocket) - this.maxShowed(pocket) + 1;
    this.scrollArrows = ScrollArrowPair.vertical(flow, 160, 8, 104, fullyDown, "bagScrollArrows", () => this.menu?.scroll ?? 0);
    this.createSwitchArrows();
  }

  /** Not in the PC's bag, which doesn't switch pockets. */
  private createSwitchArrows(): void {
    if (this.location === BagLocation.ItemPc) return;
    const t = { first: ScrollArrow.Left, firstX: 8, firstY: 72, second: ScrollArrow.Right, secondX: 72, secondY: 72, fullyUp: Pocket.Items, fullyDown: Pocket.PokeBalls, tag: "bagSwitchArrows" };
    this.switchArrows = new ScrollArrowPair(this.flow, t, () => state.pocket);
  }

  /** BagDestroyPocketScrollArrowPair: both pairs. */
  private destroyArrows(): void {
    this.scrollArrows?.destroy();
    this.switchArrows?.destroy();
    this.scrollArrows = this.switchArrows = null;
  }

  /**
   * Bag_BeginCloseWin0Animation (back to the START menu: the curtain falls) or not (an item
   * works on the field or opens a screen: `next`), and ItemMenu_StartFadeToExitCallback.
   */
  private close(curtain: boolean, exit: BagExit, next?: () => void): void {
    this.closeList();
    if (curtain) this.moveCurtain(-CURTAIN_STEP, CURTAIN_STEP);
    this.flow.gba.palettes.beginFade(PALETTES_ALL, -2, 0, 16, RGB_BLACK);
    this.step = () => {
      const { gba } = this.flow;
      if (gba.palettes.fadeActive || this.curtain) return;
      this.icons.destroyIcon();
      gba.tasks.reset();
      if (next) next();
      else this.done(exit);
    };
  }

  /** Task_AnimateWin0v: WIN0 (black) covers the lines above `bottom`, up to the whole screen. */
  private moveCurtain(start: number, step: number): void {
    const { gba } = this.flow;
    let bottom = start;
    this.curtain = gba.tasks.create((task) => {
      bottom += step;
      gba.video.win0.top = 0;
      gba.video.win0.bottom = Math.min(bottom, HEIGHT);
      if ((step > 0 && bottom === HEIGHT) || (step < 0 && bottom === 0)) {
        gba.tasks.destroy(task);
        this.curtain = null;
      }
    }, 0);
  }
}
