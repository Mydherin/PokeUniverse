// The TM CASE (tm_case.c), opened with OPEN on the TM CASE in the BAG or with SELECT on the
// field when registered: the case on the left with the selected disc rising out of it, tinted
// by its move's type (an HM's disc is its own shape); the list of HMs then TMs with their
// moves, a TM's quantity and an HM's mark; below, the move's type, power, accuracy and PP and
// the item's description. A opens USE, GIVE, EXIT; mic-core decides what they do. B or CLOSE
// (and SELECT when opened from the field) fade back where it was opened from.

import type { ItemResult } from "@pokeuniverse/contracts/item/v1/bag";
import { Item, Pocket } from "@pokeuniverse/contracts/item/v1/catalog";
import { Gender } from "@pokeuniverse/contracts/trainer/v1/trainer";
import { Button } from "../gba/input";
import { PALETTES_ALL } from "../gba/palette";
import type { Sprite, SpriteTemplate } from "../gba/sprites";
import { decimalText, EOS, expandPlaceholders, FontId, joinText, NumberMode, PLACEHOLDER_STR_VAR_1, Window, type Text, type WindowTemplate } from "../gba/text";
import { rgb, RGB_BLACK, type Background } from "../gba/video";
import { itemInfo, type BagSlot } from "../world/items";
import { moveInfo, tmMove } from "../world/moves";
import type { BagHost } from "./bag";
import { initBg } from "./common";
import type { Flow } from "./flow";
import { itemMessage, ItemMessagePlayer } from "./item-messages";
import { LIST_CANCEL, LIST_NOTHING_CHOSEN, ListMenu, type ListMenuItem, type ListPosition } from "./list-menu";
import { userFrame, type TextId } from "./manifest";
import { clearDialogWindowAndFrameToTransparent, clearStdWindowAndFrameToTransparent, copyTiles, CursorMenu, drawDialogueFrame, drawStdFrame, MENU_B_PRESSED, MENU_NOTHING_CHOSEN } from "./menu";
import { textSpeedDelay } from "./options";
import { ScrollArrowPair } from "./scroll-arrows";

/** sTMCaseStaticResources: the list's position, kept while the game runs. */
const position: ListPosition = { scroll: 0, row: 0 };

/**
 * Shows the TM CASE, then `done` once it faded out. `fromField`: opened with SELECT on the
 * field, where SELECT also closes it (allowSelectClose).
 */
export function startTmCase(flow: Flow, gender: Gender, host: BagHost, fromField: boolean, done: () => void): void {
  new TmCase(flow, gender, host, fromField, done);
}

/** BG0 (priority 1) and BG1 (priority 0, the case) share their tiles, like BG2 (the screen): one char base. */
const TILES = 0x400;
const CASE_TILES = 91;

const WINDOWS = {
  list: { left: 10, top: 1, width: 19, height: 10, palette: 15, baseBlock: 0x081 },
  description: { left: 12, top: 12, width: 18, height: 8, palette: 10, baseBlock: 0x13f },
  title: { left: 0, top: 1, width: 10, height: 2, palette: 15, baseBlock: 0x235 },
  moveInfoLabels: { left: 1, top: 13, width: 5, height: 6, palette: 12, baseBlock: 0x249 },
  moveInfo: { left: 7, top: 13, width: 5, height: 6, palette: 12, baseBlock: 0x267 },
} satisfies Record<string, WindowTemplate>;
/** On BG1: "<TM> is selected." beside the menu, the messages, the menu (USE, GIVE, EXIT). */
const SELECTED_WINDOW: WindowTemplate = { left: 5, top: 15, width: 15, height: 4, palette: 13, baseBlock: 0x1f9 };
const MESSAGE_WINDOW: WindowTemplate = { left: 2, top: 15, width: 26, height: 4, palette: 11, baseBlock: 0x285 };
const CONTEXT_WINDOW: WindowTemplate = { left: 22, top: 13, width: 7, height: 6, palette: 15, baseBlock: 0x1cf };

/** InitWindowTemplatesAndPals: the user's frame, the message frame and the standard frame. */
const USER_FRAME_TILE = 0x05b;
const USER_FRAME_PALETTE = 14;
const MESSAGE_FRAME_TILE = 0x064;
const MESSAGE_FRAME_PALETTE = 11;
const STD_FRAME_TILE = 0x078;
const STD_FRAME_PALETTE = 13;
/** sPal3Override: colors 6 and 7 of palettes 15 and 13 (the selected row's cursor). */
const PAL3_OVERRIDE = [rgb(8, 8, 8), rgb(30, 16, 6)];

/** sTextColors: [fill, text, shadow]. */
const COLORS_LIGHT = [0, 1, 2] as const;
const COLORS_DARK = [0, 2, 3] as const;
const COLORS_CURSOR_SELECTED = [0, 3, 6] as const;
const COLORS_MOVE_INFO = [0, 14, 10] as const;

const MAX_SHOWED = 5;
const QUANTITY_X = 126;
/** {CLEAR_TO 18} (sText_ClearTo18): an HM's number lines up with a TM's second digit. */
const CLEAR_TO_18: Text = [0xfc, 0x13, 18, EOS];
const SPACE: Text = [0x00, EOS];

/** sMenuInfoIcons: the move info labels and type icons, by tile in menu_info's 16-tile-wide sheet. */
const INFO_LABELS = { type: 0xa8, power: 0xc0, accuracy: 0xc8, pp: 0xe0 };
const INFO_LABEL_WIDTH = 40;
const INFO_HEIGHT = 12;
/** By FireRed's type number (TYPE_NORMAL 0 to TYPE_DARK 17). */
const TYPE_ICONS = [0x20, 0x64, 0x60, 0x80, 0x48, 0x44, 0x6c, 0x68, 0x88, 0xa4, 0x24, 0x28, 0x2c, 0x40, 0x84, 0x4c, 0xa0, 0x8c];
const TYPE_ICON_WIDTH = 32;

/** The disc (sSpriteTemplate_Disc): a TM's or an HM's shape, behind the case. */
const DISC_TEMPLATE: SpriteTemplate = {
  sheet: "tmDisc",
  palette: "tmDisc",
  width: 32,
  height: 32,
  priority: 2,
  anims: [[{ image: 0, duration: 0 }, "end"], [{ image: 16, duration: 0 }, "end"]],
};
const DISC_TM = 0;
const DISC_HM = 1;
const DISC_BASE_X = 41;
const DISC_BASE_Y = 46;
/** How far a disc sinks into the case, and how far it moves a frame. */
const DISC_CASE_DISTANCE = 20;
const DISC_Y_MOVE = 10;
const NUM_TMS = 50;
const NUM_HMS = 8;
/** sTMSpritePaletteOffsetByType: each type's colors in disc_types_1 (then disc_types_2 at 0x100). */
const DISC_TYPE_PALETTE = [0x000, 0x090, 0x080, 0x0c0, 0x060, 0x050, 0x0b0, 0x0a0, 0x0e0, 0x000, 0x010, 0x020, 0x030, 0x040, 0x0d0, 0x070, 0x100, 0x0f0];

/** The actions (sMenuActions), in the field's order. */
const ACTIONS: TextId[] = ["gOtherText_Use", "gOtherText_Give", "gOtherText_Exit"];
const enum Action {
  Use,
  Give,
  Exit,
}

class TmCase {
  private readonly bg0: Background;
  private readonly bg1: Background;
  private readonly bg2: Background;
  private readonly list: Window;
  private readonly description: Window;
  private readonly moveInfoLabels: Window;
  private readonly moveInfo: Window;
  private readonly disc: Sprite;
  private readonly discPalettes: Uint16Array;
  /** The pocket in the case's order: HMs first, then TMs (SortPocketAndPlaceHMsFirst). */
  private slots: BagSlot[] = [];
  private menu: ListMenu | null = null;
  private scrollArrows: ScrollArrowPair | null = null;
  /** The task function running now, one call a frame. */
  private step: () => void = () => this.handleInput();
  private selected: BagSlot | null = null;
  private contextMenu: CursorMenu | null = null;
  private selectedMsg: Window | null = null;
  private message: Window | null = null;

  /** DoSetUpTMCaseUI: every step runs in the first frame. */
  constructor(
    private readonly flow: Flow,
    gender: Gender,
    private readonly host: BagHost,
    private readonly fromField: boolean,
    private readonly done: () => void,
  ) {
    const { gba, assets } = flow;
    gba.setVBlank(null);
    gba.reset();
    const { video, palettes } = gba;
    [this.bg0, this.bg1, this.bg2] = video.bgs;
    initBg(this.bg0, 0, 1);
    initBg(this.bg1, 0, 0);
    initBg(this.bg2, 0, 2);
    const tiles = new Uint8Array(TILES * 64);
    for (const bg of [this.bg0, this.bg1, this.bg2]) {
      bg.tiles = tiles;
      bg.visible = true;
    }
    const tmCase = assets.get("tmCase");
    copyTiles(this.bg0, tmCase.tiles, 0, CASE_TILES);
    this.bg1.map.set(tmCase.map!.subarray(0, this.bg1.map.length));
    this.bg2.map.set(assets.get("tmCaseMenuMap").map!.subarray(0, this.bg2.map.length));
    palettes.load(assets.get(gender === Gender.GIRL ? "tmCaseFemalePal" : "tmCaseMalePal").palette, 0, 64);

    // InitWindowTemplatesAndPals.
    const frame = assets.get(userFrame(flow.options.frame));
    copyTiles(this.bg0, frame.tiles, USER_FRAME_TILE, 9);
    palettes.load(frame.palette, USER_FRAME_PALETTE * 16, 16);
    copyTiles(this.bg0, assets.get("menuMessageFrame").tiles, MESSAGE_FRAME_TILE, 20);
    palettes.load(assets.get("textWindowPal0").palette, MESSAGE_FRAME_PALETTE * 16, 16);
    copyTiles(this.bg0, assets.get("stdWindowFrame").tiles, STD_FRAME_TILE, 9);
    palettes.load(assets.get("textWindowPal3").palette, STD_FRAME_PALETTE * 16, 16);
    palettes.load(assets.get("stdMenuPal").palette, 15 * 16, 16);
    palettes.load(assets.get("stdMenuPal").palette, 10 * 16, 16);
    palettes.load(PAL3_OVERRIDE, 15 * 16 + 6, 2);
    palettes.load(PAL3_OVERRIDE, 13 * 16 + 6, 2);
    palettes.load(assets.get("pokemonTypesPal").palette, 12 * 16, 16);
    this.list = new Window(this.bg0, WINDOWS.list);
    this.description = new Window(this.bg0, WINDOWS.description);
    const title = new Window(this.bg0, WINDOWS.title);
    const labels = new Window(this.bg0, WINDOWS.moveInfoLabels);
    this.moveInfoLabels = labels;
    this.moveInfo = new Window(this.bg0, WINDOWS.moveInfo);
    for (const win of [this.list, this.description, title, labels, this.moveInfo]) {
      win.fill(0);
      win.putTilemap();
      win.copyToVram();
    }

    // The discs' sheet and type colors (LoadDiscTypePalettes), tinted when a disc shows.
    gba.sprites.loadSheet("tmDisc", assets.get("tmDisc").tiles);
    this.discPalettes = new Uint16Array(0x110);
    this.discPalettes.set(assets.get("tmDiscTypes1").palette.subarray(0, 0x100));
    this.discPalettes.set(assets.get("tmDiscTypes2").palette.subarray(0, 16), 0x100);
    palettes.loadSpritePalette("tmDisc", new Uint16Array(16));

    this.sortSlots();
    fitPosition(this.slots.length, this.maxShowed());
    // DrawMoveInfoLabels.
    const info = assets.get("menuInfo").image!;
    Object.values(INFO_LABELS).forEach((tile, i) => labels.blitRect(info, (tile % 16) * 8, (tile >> 4) * 8, 0, i * INFO_HEIGHT, INFO_LABEL_WIDTH, INFO_HEIGHT));
    labels.copyToVram();
    // PrintTitle: centered over the case.
    const font = flow.fonts[FontId.NormalCopy1];
    const name = assets.text("gText_TMCase");
    title.print(font, Math.trunc((72 - font.width(name)) / 2), 1, COLORS_LIGHT, name, 0, 0);
    title.copyToVram();

    gba.tasks.create(() => this.step(), 0);
    this.openList();
    this.createScrollArrows();
    this.disc = this.createDisc(this.slots[position.scroll + position.row]?.item ?? null);

    palettes.blendPalettes(PALETTES_ALL, 16, RGB_BLACK);
    palettes.beginFade(PALETTES_ALL, 0, 16, 0, RGB_BLACK);
    gba.setVBlank(gba.standardVBlank);
    gba.setMain(() => flow.runFrame());
  }

  /** TMCaseSetup_GetTMCount: the items and CLOSE, 5 rows at most. */
  private maxShowed(): number {
    return Math.min(this.slots.length + 1, MAX_SHOWED);
  }

  /** SortPocketAndPlaceHMsFirst: HMs, then TMs, each by number. */
  private sortSlots(): void {
    const hm = (s: BagSlot) => (s.item >= Item.HM01 ? 0 : 1);
    this.slots = [...this.host.bag.pocket(Pocket.TM_CASE)].sort((a, b) => hm(a) - hm(b) || a.item - b.item);
  }

  // The list

  /** InitTMCaseListMenuItems and ListMenuInit: every TM and HM with its move, then CLOSE. */
  private openList(): void {
    const { flow } = this;
    const items: ListMenuItem[] = this.slots.map((slot, id) => ({ label: tmLabel(flow, slot.item), id }));
    items.push({ label: flow.assets.text("gText_Close"), id: items.length });
    const template = {
      win: this.list,
      items,
      maxShowed: this.maxShowed(),
      font: FontId.Normal,
      itemX: 8,
      cursorX: 0,
      upTextY: 2,
      itemVerticalPadding: 2,
      letterSpacing: 0,
      colors: COLORS_DARK,
      onMove: (id: number, onInit: boolean) => this.onCursorMove(id, onInit),
      onPrint: (id: number, y: number) => this.printRowExtras(id, y),
    };
    this.menu = new ListMenu(flow, template, position);
  }

  /** DestroyListMenuTask: its position kept. */
  private closeList(): void {
    if (this.menu) Object.assign(position, this.menu.position);
    this.menu = null;
  }

  /** List_MoveCursorFunc: the sound and the disc swap, the description and the move's info. */
  private onCursorMove(id: number, onInit: boolean): void {
    const item = this.slots[id]?.item ?? null;
    if (!onInit) {
      this.flow.play("se_select");
      this.swapDisc(item);
    }
    this.printDescription(item);
    this.printMoveInfo(item);
  }

  /** List_ItemPrintFunc: "×n" for a TM, the HM mark for an HM. */
  private printRowExtras(id: number, y: number): void {
    const slot = this.slots[id];
    if (!slot) return;
    if (itemInfo(slot.item)?.important) return this.placeHmMark(this.list, 8, y);
    const { assets, fonts } = this.flow;
    const text = expandPlaceholders(assets.text("gText_TimesStrVar1"), { [PLACEHOLDER_STR_VAR_1]: decimalText(slot.quantity, NumberMode.RightAlign, 3) });
    this.list.print(fonts[FontId.Small], QUANTITY_X, y, COLORS_DARK, text, 0, 0);
  }

  /** PlaceHMTileInWindow. */
  private placeHmMark(win: Window, x: number, y: number): void {
    win.blitRect(this.flow.assets.get("tmCaseHm").image!, 0, 0, x, y, 16, 12);
  }

  /** PrintDescription: the item's, or what CLOSE does. */
  private printDescription(item: Item | null): void {
    const { assets, fonts } = this.flow;
    const text = item === null ? assets.text("gText_TMCaseWillBePutAway") : assets.itemDescription(item);
    this.description.fill(0);
    this.description.print(fonts[FontId.Normal], 2, 3, COLORS_LIGHT, text, 1, 0);
    this.description.copyToVram();
  }

  /** PrintMoveInfo: the type's icon, power, accuracy and PP; "---" for none of them. */
  private printMoveInfo(item: Item | null): void {
    const { assets, fonts } = this.flow;
    const win = this.moveInfo;
    const font = fonts[FontId.NormalCopy2];
    const hyphens = assets.text("gText_ThreeHyphens");
    const print = (text: Text, row: number) => win.print(font, 7, INFO_HEIGHT * row, COLORS_MOVE_INFO, text, 0, 0);
    win.fillRect(0, 0, 0, 40, 48);
    const move = item === null ? undefined : moveInfo(tmMove(item));
    if (!move?.type) {
      for (let i = 0; i < 4; i++) print(hyphens, i);
    } else {
      // The catalog's types are FireRed's TYPE_ numbers plus one.
      const icon = TYPE_ICONS[move.type - 1] ?? TYPE_ICONS[0];
      win.blitRect(assets.get("menuInfo").image!, (icon % 16) * 8, (icon >> 4) * 8, 0, 0, TYPE_ICON_WIDTH, INFO_HEIGHT);
      print(move.power < 2 ? hyphens : decimalText(move.power, NumberMode.RightAlign, 3), 1);
      print(move.accuracy === 0 ? hyphens : decimalText(move.accuracy, NumberMode.RightAlign, 3), 2);
      print(decimalText(move.pp, NumberMode.RightAlign, 3), 3);
    }
    win.copyToVram();
  }

  /** PrintListCursor: the "▶" at the list's selected row. */
  private printCursor(colors: readonly [number, number, number]): void {
    const { flow } = this;
    this.list.print(flow.fonts[FontId.Normal], 0, this.menu!.cursorY, colors, flow.assets.text("gText_SelectorArrow2"), 0, 0);
    this.list.copyToVram();
  }

  /** SetDescriptionWindowShade: the blue around the description darkens while an item is selected. */
  private setDescriptionShade(dark: boolean): void {
    const palette = dark ? 3 : 1;
    for (let y = 12; y < 20; y++) for (let x = 0; x < 30; x++) this.bg2.setEntry(x, y, (this.bg2.entry(x, y) & 0x0fff) | (palette << 12));
  }

  /** CreateListScrollArrows. */
  private createScrollArrows(): void {
    const fullyDown = this.slots.length - this.maxShowed() + 1;
    this.scrollArrows = ScrollArrowPair.vertical(this.flow, 160, 8, 88, fullyDown, "tmCaseScrollArrows", () => this.menu?.scroll ?? 0);
  }

  private removeScrollArrows(): void {
    this.scrollArrows?.destroy();
    this.scrollArrows = null;
  }

  /** Task_HandleListInput. */
  private handleInput(): void {
    const { flow } = this;
    if (flow.gba.palettes.fadeActive) return;
    const menu = this.menu!;
    const chosen = menu.processInput();
    Object.assign(position, menu.position);
    if (flow.gba.input.isPressed(Button.Select) && this.fromField) {
      flow.play("se_select");
      return this.close();
    }
    if (chosen === LIST_NOTHING_CHOSEN) return;
    flow.play("se_select");
    if (chosen === LIST_CANCEL || chosen === this.slots.length) return this.close();
    this.setDescriptionShade(true);
    this.removeScrollArrows();
    this.printCursor(COLORS_CURSOR_SELECTED);
    this.selected = this.slots[chosen];
    this.openContextMenu();
  }

  /** ReturnToList. */
  private returnToList(): void {
    this.selected = null;
    this.setDescriptionShade(false);
    this.createScrollArrows();
    this.step = () => this.handleInput();
  }

  // The item's menu

  /** Task_SelectedTMHM_Field: USE, GIVE, EXIT, and "<TM> is selected." beside them. */
  private openContextMenu(): void {
    const { flow } = this;
    const { item } = this.selected!;
    const font = flow.fonts[FontId.Normal];
    this.selectedMsg = new Window(this.bg1, SELECTED_WINDOW);
    drawStdFrame(this.selectedMsg, STD_FRAME_TILE, STD_FRAME_PALETTE);
    const win = new Window(this.bg1, CONTEXT_WINDOW);
    drawStdFrame(win, USER_FRAME_TILE, USER_FRAME_PALETTE);
    const lineHeight = font.maxLetterHeight + 2;
    ACTIONS.forEach((a, i) => win.print(font, 8, 2 + i * lineHeight, [1, 2, 3], flow.assets.text(a), 0));
    this.contextMenu = new CursorMenu(flow, win, FontId.Normal, 0, 2, lineHeight, ACTIONS.length, 0);
    win.copyToVram();
    // GetTMNumberAndMoveString, then gText_Var1IsSelected without its {STR_VAR_1}.
    const text = expandPlaceholders(flow.assets.text("gText_Var1IsSelected"), { [PLACEHOLDER_STR_VAR_1]: tmLabel(flow, item) });
    this.selectedMsg.print(font, 0, 2, COLORS_DARK, text, 1, 0);
    if (itemInfo(item)?.important) this.placeHmMark(this.selectedMsg, 0, 2);
    this.selectedMsg.copyToVram();
    this.step = () => this.contextMenuInput();
  }

  /** Task_ContextMenu_HandleInput: B runs the last action, EXIT. */
  private contextMenuInput(): void {
    const chosen = this.contextMenu!.processInput(false);
    if (chosen === MENU_NOTHING_CHOSEN) return;
    if (chosen === MENU_B_PRESSED) this.flow.play("se_select");
    const action = chosen === MENU_B_PRESSED ? Action.Exit : (chosen as Action);
    switch (action) {
      case Action.Use:
        return this.useAction();
      case Action.Give:
        return this.giveAction();
      default:
        return this.exitAction();
    }
  }

  /** RemoveContextMenu, and the "is selected." window cleared. */
  private hideContextMenu(): void {
    if (this.contextMenu) clearStdWindowAndFrameToTransparent(this.contextMenu.win);
    this.contextMenu = null;
    if (this.selectedMsg) clearStdWindowAndFrameToTransparent(this.selectedMsg);
    this.selectedMsg = null;
  }

  /** Action_Use: mic-core decides (no Pokémon: "There is no POKéMON."; else the party menu, to come). */
  private useAction(): void {
    this.hideContextMenu();
    this.list.putTilemap();
    this.ask(this.host.use(this.selected!.item));
  }

  /** Action_Give: an HM can't be held; a TM needs a Pokémon. */
  private giveAction(): void {
    this.hideContextMenu();
    this.putInfoTilemaps();
    this.ask(this.host.give(this.selected!.item));
  }

  /** Action_Exit. */
  private exitAction(): void {
    this.hideContextMenu();
    this.list.putTilemap();
    this.printCursor(COLORS_DARK);
    this.putInfoTilemaps();
    this.returnToList();
  }

  private putInfoTilemaps(): void {
    for (const win of [this.description, this.moveInfoLabels, this.moveInfo]) win.putTilemap();
  }

  /** Waits for mic-core's answer, then shows it; nothing else runs meanwhile. */
  private ask(answer: Promise<ItemResult>): void {
    this.step = () => {};
    void answer.then((r) => {
      this.step = () => this.onResult(r);
    });
  }

  /** PrintMessageWithFollowupTask: the answer's message, then back to the list. */
  private onResult(r: ItemResult): void {
    // PARTY_MENU: the party menu comes with the party (phase 8); until then, back to the list.
    const msg = itemMessage(this.flow, r, this.host.playerName);
    if (!msg) return this.closeMessageAndReturn();
    const player = new ItemMessagePlayer(
      this.flow,
      msg,
      (text, font) => this.showMessage(text, font),
      () => this.flow.text.isActive(this.message!),
    );
    this.step = () => {
      if (player.update()) this.closeMessageAndReturn();
    };
  }

  /** DisplayMessageAndContinueTask: the message frame at the bottom, at the player's text speed. */
  private showMessage(text: Text, font: FontId): void {
    const { flow } = this;
    this.message ??= new Window(this.bg1, MESSAGE_WINDOW);
    this.message.fill(1);
    drawDialogueFrame(this.message, false, MESSAGE_FRAME_TILE, MESSAGE_FRAME_PALETTE);
    const f = flow.fonts[font];
    flow.text.ctx.canABSpeedUpPrint = true;
    flow.text.add(this.message, { font: f, x: 0, y: 1, letterSpacing: f.letterSpacing, lineSpacing: f.lineSpacing, colors: [1, 2, 3] }, textSpeedDelay(flow.options), text);
    this.message.copyToVram();
  }

  /** CloseMessageAndReturnToList: the list built again from the bag, the message gone. */
  private closeMessageAndReturn(): void {
    this.flow.text.ctx.canABSpeedUpPrint = false;
    this.closeList();
    this.sortSlots();
    fitPosition(this.slots.length, this.maxShowed());
    this.openList();
    this.printCursor(COLORS_DARK);
    if (this.message) clearDialogWindowAndFrameToTransparent(this.message);
    this.message = null;
    this.putInfoTilemaps();
    this.returnToList();
  }

  // The disc

  /** CreateDiscSprite: the item's disc out of the case, or none (sunk in, at the case's back). */
  private createDisc(item: Item | null): Sprite {
    const disc = this.flow.gba.sprites.create(DISC_TEMPLATE, DISC_BASE_X, DISC_BASE_Y, 0)!;
    if (item === null) this.placeDisc(disc, null);
    else this.showDisc(disc, item);
    return disc;
  }

  /** The disc's shape, type colors and place for an item. */
  private showDisc(disc: Sprite, item: Item): void {
    disc.startAnim(item >= Item.HM01 ? DISC_HM : DISC_TM);
    this.tintDisc(item);
    this.placeDisc(disc, item);
  }

  /** TintDiscpriteByType. */
  private tintDisc(item: Item): void {
    const { palettes } = this.flow.gba;
    const type = Math.max(0, moveInfo(tmMove(item)).type - 1);
    const offset = DISC_TYPE_PALETTE[type] ?? 0;
    palettes.load(this.discPalettes.subarray(offset, offset + 16), 256 + palettes.spritePaletteSlot("tmDisc") * 16, 16);
  }

  /** SetDiscSpritePosition: HMs then TMs fan out across the case, back to front. */
  private placeDisc(disc: Sprite, item: Item | null): void {
    if (item === null) {
      disc.x = 27;
      disc.y = 54;
      disc.y2 = DISC_CASE_DISTANCE;
      return;
    }
    const index = item >= Item.HM01 ? item - Item.HM01 : item - Item.TM01 + NUM_HMS;
    const total = NUM_TMS + NUM_HMS;
    disc.x = DISC_BASE_X - (Math.trunc((14 * index * 256) / total) >> 8);
    disc.y = DISC_BASE_Y + (Math.trunc((8 * index * 256) / total) >> 8);
  }

  /** SwapDisc: the old disc sinks into the case, then the new one rises out of it. */
  private swapDisc(item: Item | null): void {
    let rising = false;
    this.disc.callback = (s) => {
      if (!rising) {
        if (s.y2 < DISC_CASE_DISTANCE) {
          s.y2 += DISC_Y_MOVE;
          return;
        }
        if (item === null) {
          s.callback = () => {};
          return;
        }
        rising = true;
        this.showDisc(s, item);
        return;
      }
      if (s.y2 <= 0) s.callback = () => {};
      else s.y2 -= DISC_Y_MOVE;
    };
  }

  /** Task_BeginFadeOutFromTMCase. */
  private close(): void {
    this.closeList();
    this.flow.gba.palettes.beginFade(PALETTES_ALL, -2, 0, 16, RGB_BLACK);
    this.step = () => {
      const { gba } = this.flow;
      if (gba.palettes.fadeActive) return;
      this.removeScrollArrows();
      gba.tasks.reset();
      this.done();
    };
  }
}

/**
 * GetTMNumberAndMoveString: "No01 MOVE" for a TM, "No1 MOVE" for an HM (one digit further
 * right), the number in the small font.
 */
function tmLabel(flow: Flow, item: Item): Text {
  const { assets } = flow;
  const hm = item >= Item.HM01;
  const number = hm ? decimalText(item - Item.HM01 + 1, NumberMode.LeadingZeros, 1) : decimalText(item - Item.TM01 + 1, NumberMode.LeadingZeros, 2);
  const move = assets.moveName(tmMove(item));
  return joinText(assets.text("gText_FontSmall"), hm ? CLEAR_TO_18 : [EOS], assets.text("gText_NumberClear01"), number, SPACE, assets.text("gText_FontNormal"), move);
}

/**
 * TMCaseSetup_InitListMenuPositions and TMCaseSetup_UpdateVisualMenuOffset: the saved position
 * fitted to the case's `count` items (and CLOSE).
 */
function fitPosition(count: number, maxShowed: number): void {
  const total = count + 1;
  if (position.scroll !== 0 && position.scroll + maxShowed > total) position.scroll = total - maxShowed;
  if (position.scroll + position.row >= total) position.row = total < 2 ? 0 : count;
  if (position.row > 3)
    for (let i = 0; i <= position.row - 3 && position.scroll + maxShowed !== total; i++) {
      position.row--;
      position.scroll++;
    }
}
