// The PC's WITHDRAW ITEM screen (item_pc.c), opened from ITEM STORAGE: what the PC stores with
// quantities and CANCEL, the selected item's icon and description below. It turns on and off
// like a monitor (pc_screen_effect.c, with SE_PC_LOGIN and SE_PC_OFF). A opens WITHDRAW, GIVE,
// CANCEL; WITHDRAW asks how many (when more than one); SELECT moves an item within the list.
// mic-core decides what every action does; this shows it as FireRed does.

import { ItemOutcome, type ItemResult } from "@pokeuniverse/contracts/item/v1/bag";
import { Pocket, type Item } from "@pokeuniverse/contracts/item/v1/catalog";
import { Button } from "../gba/input";
import { PALETTES_ALL } from "../gba/palette";
import type { Task } from "../gba/tasks";
import { decimalText, expandPlaceholders, FontId, NumberMode, PLACEHOLDER_STR_VAR_1, PLACEHOLDER_STR_VAR_2, Window, type Text, type WindowTemplate } from "../gba/text";
import { RGB_BLACK, type Background } from "../gba/video";
import { itemInfo, type StoredItems } from "../world/items";
import { tmMove } from "../world/moves";
import { initBg } from "./common";
import type { Flow } from "./flow";
import { ItemMenuIcons } from "./item-menu-icons";
import { startPartyMenu, type PartyHost } from "./party-menu";
import { afterMove, fitListPosition, LIST_CANCEL, LIST_NOTHING_CHOSEN, ListMenu, type ListMenuItem, type ListPosition } from "./list-menu";
import { userFrame, type TextId } from "./manifest";
import {
  adjustQuantity,
  clearDialogWindowAndFrameToTransparent,
  clearStdWindowAndFrameToTransparent,
  copyTiles,
  CursorMenu,
  drawDialogueFrame,
  drawStdFrame,
  MENU_B_PRESSED,
  MENU_NOTHING_CHOSEN,
} from "./menu";
import { textSpeedDelay } from "./options";
import { beginPcScreenTurnOff, beginPcScreenTurnOn } from "./pc-screen-effect";
import { ScrollArrowPair } from "./scroll-arrows";

/** What the PC stores and what the screen asks mic-core; the overworld answers. */
export interface ItemPcHost {
  readonly stored: StoredItems;
  withdraw(item: Item, quantity: number): Promise<ItemResult>;
  give(item: Item): Promise<ItemResult>;
  /** Shown at once; mic-core corrects a refused one. */
  move(from: number, to: number): void;
  /** The party menu GIVE opens. */
  readonly party: PartyHost;
}

/**
 * Shows the screen, then `done` once it turned off. `back`: back from the party menu (GIVE) at
 * that list position, faded in instead of turned on (sListMenuState.initialized).
 */
export function startItemPc(flow: Flow, host: ItemPcHost, done: () => void, back?: ListPosition): void {
  new ItemPc(flow, host, done, back);
}

/** sWindowTemplates: the list, the description, the title, the quantity, the actions, the message. */
const WINDOWS = {
  list: { left: 7, top: 1, width: 19, height: 12, palette: 15, baseBlock: 0x2bf },
  description: { left: 5, top: 14, width: 25, height: 6, palette: 13, baseBlock: 0x229 },
  title: { left: 1, top: 1, width: 5, height: 4, palette: 15, baseBlock: 0x215 },
  quantity: { left: 24, top: 15, width: 5, height: 4, palette: 15, baseBlock: 0x201 },
  actions: { left: 22, top: 13, width: 7, height: 6, palette: 15, baseBlock: 0x1d7 },
  message: { left: 2, top: 15, width: 26, height: 4, palette: 11, baseBlock: 0x16f },
} satisfies Record<string, WindowTemplate>;
/** sSubwindowTemplates: the prompts beside the menus, wider for longer texts. */
const PROMPTS: WindowTemplate[] = [
  { left: 6, top: 15, width: 14, height: 4, palette: 12, baseBlock: 0x137 },
  { left: 6, top: 15, width: 16, height: 4, palette: 12, baseBlock: 0x137 },
  { left: 6, top: 15, width: 23, height: 4, palette: 12, baseBlock: 0x09b },
];
const enum Prompt {
  Selected,
  HowMany,
  Done,
}

/** ItemPc_InitWindows: the user's frame, the standard frame and the message frame, with their palettes. */
const USER_FRAME_TILE = 0x3c0;
const USER_FRAME_PALETTE = 14;
const STD_FRAME_TILE = 0x3a3;
const STD_FRAME_PALETTE = 12;
const MESSAGE_FRAME_TILE = 0x3ac;
const MESSAGE_FRAME_PALETTE = 11;
const BG0_TILES = USER_FRAME_TILE + 9;

/** sTextColors: [fill, text, shadow]. */
const COLORS = [
  [0, 1, 2],
  [0, 2, 3],
  [0, 3, 2],
  [0, 10, 2],
] as const;
const enum Color {
  White,
  Dark,
  Gray,
  Description,
}

const MAX_SHOWED = 6;
const QUANTITY_X = 110;
/** FONT_NORMAL's widest letter: the cursor's width. */
const CURSOR_WIDTH = 8;
/** The swap line sits 32 pixels left of the bag's, under this screen's list. */
const SWAP_LINE_X = -32;

/** sItemPcSubmenuOptions. */
const ACTIONS: TextId[] = ["gText_Withdraw", "gOtherText_Give", "gFameCheckerText_Cancel"];
const enum Action {
  Withdraw,
  Give,
  Cancel,
}

interface Selected {
  item: Item;
  index: number;
  quantity: number;
}

class ItemPc {
  private readonly bg0: Background;
  private readonly bg1: Background;
  private readonly list: Window;
  private readonly description: Window;
  private readonly icons: ItemMenuIcons;
  private menu: ListMenu | null = null;
  /** sListMenuState: reset each time the screen opens from the PC. */
  private position: ListPosition = { scroll: 0, row: 0 };
  private scrollArrows: ScrollArrowPair | null = null;
  private effect: Task | null = null;
  /** The task function running now, one call a frame. */
  private step: () => void = () => this.handleInput();
  private selected: Selected | null = null;
  private actions: CursorMenu | null = null;
  private prompt: Window | null = null;
  private quantityWin: Window | null = null;
  private message: Window | null = null;
  private quantity = 1;
  /** The slot being moved with SELECT; -1 when none (moveModeOrigPos). */
  private moving = -1;

  /** ItemPc_DoGfxSetup: every step runs in the first frame. */
  constructor(
    private readonly flow: Flow,
    private readonly host: ItemPcHost,
    private readonly done: () => void,
    back: ListPosition | undefined,
  ) {
    const { gba, assets } = flow;
    if (back) this.position = { ...back };
    gba.setVBlank(null);
    gba.reset();
    const { video, palettes } = gba;
    [this.bg0, this.bg1] = video.bgs;
    initBg(this.bg0, 0, 0);
    initBg(this.bg1, 0, 1);
    this.bg0.tiles = new Uint8Array(BG0_TILES * 64);
    const bg = assets.get("itemPcBg");
    this.bg1.tiles = bg.tiles;
    this.bg1.map.set(bg.map!.subarray(0, this.bg1.map.length));
    this.bg0.visible = this.bg1.visible = true;
    palettes.load(bg.palette, 0, 48);
    this.icons = new ItemMenuIcons(flow);

    // ItemPc_InitWindows.
    const frame = assets.get(userFrame(flow.options.frame));
    copyTiles(this.bg0, frame.tiles, USER_FRAME_TILE, 9);
    palettes.load(frame.palette, USER_FRAME_PALETTE * 16, 16);
    copyTiles(this.bg0, assets.get("stdWindowFrame").tiles, STD_FRAME_TILE, 9);
    palettes.load(assets.get("textWindowPal3").palette, STD_FRAME_PALETTE * 16, 16);
    copyTiles(this.bg0, assets.get("menuMessageFrame").tiles, MESSAGE_FRAME_TILE, 20);
    palettes.load(assets.get("textWindowPal0").palette, MESSAGE_FRAME_PALETTE * 16, 16);
    palettes.load(assets.get("textWindowPal2").palette, 13 * 16, 16);
    palettes.load(assets.get("stdMenuPal").palette, 15 * 16, 16);
    this.list = new Window(this.bg0, WINDOWS.list);
    this.description = new Window(this.bg0, WINDOWS.description);
    const title = new Window(this.bg0, WINDOWS.title);
    for (const win of [this.list, this.description, title]) {
      win.fill(0);
      win.putTilemap();
      win.copyToVram();
    }

    // ItemPc_PrintWithdrawItem.
    title.print(flow.fonts[FontId.Small], 0, 1, COLORS[Color.White], assets.text("gText_WithdrawItem"), 0, 1);
    title.copyToVram();
    this.icons.createSwapLine();
    gba.tasks.create(() => this.step(), 0);
    this.openList();
    this.createArrows();
    if (back) {
      palettes.blendPalettes(PALETTES_ALL, 16, RGB_BLACK);
      palettes.beginFade(PALETTES_ALL, 0, 16, 0, RGB_BLACK);
    } else {
      // BeginPCScreenEffect_TurnOn, with SE_PC_LOGIN.
      this.effect = beginPcScreenTurnOn(gba);
      flow.play("se_pc_login");
    }

    gba.setVBlank(gba.standardVBlank);
    gba.setMain(() => flow.runFrame());
  }

  private get slots() {
    return this.host.stored.slots;
  }

  /** ItemPc_CountPcItems: the items and CANCEL, 6 rows at most. */
  private get maxShowed(): number {
    return Math.min(this.slots.length + 1, MAX_SHOWED);
  }

  // The list

  /** Task_ItemPcMain: once the screen is on. */
  private handleInput(): void {
    const { gba } = this.flow;
    if (gba.palettes.fadeActive || this.effect?.active) return;
    const menu = this.menu!;
    const count = this.slots.length;
    if (gba.input.isPressed(Button.Select) && menu.scroll + menu.row !== count) {
      this.flow.play("se_select");
      return this.beginMoving(menu.scroll + menu.row);
    }
    const chosen = menu.processInput();
    this.position = menu.position;
    if (chosen === LIST_NOTHING_CHOSEN) return;
    this.flow.play("se_select");
    if (chosen === LIST_CANCEL || chosen === count) return this.turnOff();
    const slot = this.slots[chosen];
    this.setMessageBoxPalette(1);
    this.destroyArrows();
    this.selected = { item: slot.item, index: chosen, quantity: slot.quantity };
    this.printCursor(Color.Gray);
    this.openActions();
  }

  /** ItemPc_BuildListMenuTemplate and ListMenuInit: the stored items, then CANCEL. */
  private openList(): void {
    const { assets } = this.flow;
    const items: ListMenuItem[] = this.slots.map((slot, id) => ({ label: assets.itemName(slot.item), id }));
    items.push({ label: assets.text("gFameCheckerText_Cancel"), id: items.length });
    fitListPosition(this.position, items.length, this.maxShowed);
    this.menu = new ListMenu(
      this.flow,
      {
        win: this.list,
        items,
        maxShowed: this.maxShowed,
        font: FontId.Normal,
        itemX: 9,
        cursorX: 1,
        upTextY: 2,
        itemVerticalPadding: 2,
        letterSpacing: 1,
        colors: COLORS[Color.Dark],
        onMove: (id, onInit) => this.onCursorMove(id, onInit),
        onPrint: (id, y) => this.printRowExtras(id, y),
      },
      this.position,
    );
  }

  /** The list built again from what the PC stores now. */
  private rebuildList(): void {
    if (this.menu) this.position = this.menu.position;
    this.openList();
  }

  /** ItemPc_MoveCursorFunc: the sound, the icon and the description (a TM's move; "Return to the PC." on CANCEL). */
  private onCursorMove(id: number, onInit: boolean): void {
    const { flow } = this;
    if (!onInit) flow.play("se_select");
    if (this.moving >= 0) return;
    const slot = this.slots[id];
    this.icons.showIcon(slot?.item ?? null);
    let text: Text = flow.assets.text("gText_ReturnToPC");
    if (slot) text = itemInfo(slot.item)?.pocket === Pocket.TM_CASE ? flow.assets.moveName(tmMove(slot.item)) : flow.assets.itemDescription(slot.item);
    this.printDescription(text, Color.Description, 0);
  }

  private printDescription(text: Text, color: Color, lineSpacing: number): void {
    this.description.fill(0);
    this.description.print(this.flow.fonts[FontId.Normal], 0, 3, COLORS[color], text, 2, lineSpacing);
    this.description.copyToVram();
  }

  /** ItemPc_ItemPrintFunc: while moving, the moved item's gray cursor; "×n" right of every item. */
  private printRowExtras(id: number, y: number): void {
    const { flow } = this;
    if (this.moving >= 0) {
      if (this.moving === id) this.printCursorAt(y, Color.Gray);
      else this.eraseCursorAt(y);
    }
    const slot = this.slots[id];
    if (!slot) return;
    const text = expandPlaceholders(flow.assets.text("gText_TimesStrVar1"), { [PLACEHOLDER_STR_VAR_1]: decimalText(slot.quantity, NumberMode.RightAlign, 3) });
    this.list.print(flow.fonts[FontId.Small], QUANTITY_X, y, COLORS[Color.Dark], text, 0, 0);
  }

  /** ItemPc_PrintOrRemoveCursor: the "▶" at the list's selected row. */
  private printCursor(color: Color): void {
    this.printCursorAt(this.menu!.cursorY, color);
    this.list.copyToVram();
  }

  private printCursorAt(y: number, color: Color): void {
    this.list.print(this.flow.fonts[FontId.Normal], 0, y, COLORS[color], this.flow.assets.text("gText_SelectorArrow2"), 0, 0);
  }

  private eraseCursorAt(y: number): void {
    const font = this.flow.fonts[FontId.Normal];
    this.list.fillRect(0, 0, y, CURSOR_WIDTH, font.maxLetterHeight);
  }

  /** ItemPc_SetMessageWindowPalette: the description box's palette (1 normal, 2 behind a menu). */
  private setMessageBoxPalette(which: number): void {
    for (let y = 14; y < 20; y++)
      for (let x = 0; x < 30; x++) this.bg1.setEntry(x, y, (this.bg1.entry(x, y) & 0x0fff) | ((which + 1) << 12));
  }

  /** ItemPc_PlaceTopMenuScrollIndicatorArrows. */
  private createArrows(): void {
    const fullyDown = this.slots.length - this.maxShowed + 1;
    this.scrollArrows = ScrollArrowPair.vertical(this.flow, 128, 8, 104, fullyDown, "itemPcScrollArrows", () => this.menu?.scroll ?? 0);
  }

  private destroyArrows(): void {
    this.scrollArrows?.destroy();
    this.scrollArrows = null;
  }

  /** ItemPc_ReturnFromSubmenu. */
  private backToList(): void {
    this.selected = null;
    this.setMessageBoxPalette(0);
    this.createArrows();
    this.step = () => this.handleInput();
  }

  // WITHDRAW, GIVE, CANCEL

  /** Task_ItemPcSubmenuInit: the actions, and "<item> is selected." beside them. */
  private openActions(): void {
    const { flow } = this;
    const font = flow.fonts[FontId.Normal];
    const lineHeight = font.maxLetterHeight + 2;
    const win = new Window(this.bg0, WINDOWS.actions);
    drawStdFrame(win, USER_FRAME_TILE, USER_FRAME_PALETTE);
    ACTIONS.forEach((text, i) => win.print(font, 8, 2 + i * lineHeight, [1, 2, 3], flow.assets.text(text)));
    this.actions = new CursorMenu(flow, win, FontId.Normal, 0, 2, lineHeight, ACTIONS.length, 0);
    this.showPrompt(Prompt.Selected, expandPlaceholders(flow.assets.text("gText_Var1IsSelected"), { [PLACEHOLDER_STR_VAR_1]: flow.assets.itemName(this.selected!.item) }), COLORS[Color.Dark], 1);
    this.step = () => this.actionsInput();
  }

  /** Task_ItemPcSubmenuRun. */
  private actionsInput(): void {
    const chosen = this.actions!.processInput(false);
    if (chosen === MENU_NOTHING_CHOSEN) return;
    if (chosen === MENU_B_PRESSED) this.flow.play("se_select");
    if (chosen === Action.Withdraw) return this.withdrawAction();
    if (chosen === Action.Give) return this.giveAction();
    this.cancelAction();
  }

  /** The actions and their prompt gone, the list back (the cursor still gray). */
  private hideActions(): void {
    if (this.actions) clearStdWindowAndFrameToTransparent(this.actions.win);
    this.actions = null;
    this.hidePrompt();
    this.list.putTilemap();
  }

  /** Task_ItemPcCancel. */
  private cancelAction(): void {
    this.hideActions();
    this.description.putTilemap();
    this.printCursor(Color.Dark);
    this.backToList();
  }

  /** Task_ItemPcWithdraw: how many (when more than one), then the withdrawal. */
  private withdrawAction(): void {
    const { flow } = this;
    const sel = this.selected!;
    this.hideActions();
    this.quantity = 1;
    if (sel.quantity === 1) return this.withdraw();
    // ItemPc_WithdrawMultipleInitWindow.
    this.showPrompt(Prompt.HowMany, expandPlaceholders(flow.assets.text("gText_WithdrawHowMany"), { [PLACEHOLDER_STR_VAR_1]: flow.assets.itemName(sel.item) }));
    this.quantityWin = new Window(this.bg0, WINDOWS.quantity);
    drawStdFrame(this.quantityWin, USER_FRAME_TILE, USER_FRAME_PALETTE);
    this.printQuantity();
    this.scrollArrows = ScrollArrowPair.vertical(flow, 212, 120, 152, 2, "itemPcScrollArrows", () => 1);
    this.step = () => this.selectQuantity();
  }

  /** UpdateWithdrawQuantityDisplay: "×nnn". */
  private printQuantity(): void {
    const win = this.quantityWin!;
    const text = expandPlaceholders(this.flow.assets.text("gText_TimesStrVar1"), { [PLACEHOLDER_STR_VAR_1]: decimalText(this.quantity, NumberMode.LeadingZeros, 3) });
    win.fillRect(1, 10, 10, 28, 12);
    win.print(this.flow.fonts[FontId.Small], 8, 10, COLORS[Color.Dark], text, 1, 0);
    win.copyToVram();
  }

  /** Task_ItemPcHandleWithdrawMultiple. */
  private selectQuantity(): void {
    const { flow } = this;
    const { input } = flow.gba;
    const quantity = adjustQuantity(flow, this.quantity, this.selected!.quantity);
    if (quantity !== this.quantity) {
      this.quantity = quantity;
      return this.printQuantity();
    }
    if (!input.isPressed(Button.A | Button.B)) return;
    flow.play("se_select");
    this.hidePrompt();
    this.destroyArrows();
    if (input.isPressed(Button.A)) {
      // The quantity's frame stays until the next message covers it.
      this.quantityWin!.clearTilemap();
      this.quantityWin = null;
      this.printCursor(Color.Dark);
      return this.withdraw();
    }
    clearStdWindowAndFrameToTransparent(this.quantityWin!);
    this.quantityWin = null;
    this.list.putTilemap();
    this.description.putTilemap();
    this.printCursor(Color.Dark);
    this.backToList();
  }

  /** ItemPc_DoWithdraw: mic-core moves them into the bag; "Withdrew n <item>(s)." or no room, until A or B. */
  private withdraw(): void {
    const { flow } = this;
    const sel = this.selected!;
    this.ask(this.host.withdraw(sel.item, this.quantity), (r) => {
      if (r.outcome !== ItemOutcome.WITHDRAWN && r.outcome !== ItemOutcome.BAG_FULL) return this.afterWithdraw();
      const text =
        r.outcome === ItemOutcome.WITHDRAWN
          ? expandPlaceholders(flow.assets.text("gText_WithdrewQuantItem"), {
              [PLACEHOLDER_STR_VAR_1]: flow.assets.itemName(sel.item),
              [PLACEHOLDER_STR_VAR_2]: decimalText(r.value, NumberMode.LeftAlign, 3),
            })
          : flow.assets.text("gText_NoMoreRoomInBag");
      this.showPrompt(Prompt.Done, text);
      this.step = () => {
        if (!flow.gba.input.isPressed(Button.A | Button.B)) return;
        flow.play("se_select");
        this.afterWithdraw();
      };
    });
  }

  /** Task_ItemPcCleanUpWithdraw: the list built again from what the PC stores now. */
  private afterWithdraw(): void {
    this.hidePrompt();
    this.description.putTilemap();
    this.rebuildList();
    this.backToList();
  }

  /**
   * Task_ItemPcGive: the screen fades out to the party menu, which chooses who holds it, and comes
   * back; with no Pokémon, "There is no POKéMON." until A.
   */
  private giveAction(): void {
    const item = this.selected!.item;
    this.ask(this.host.give(item), (r) => {
      if (r.outcome === ItemOutcome.PARTY_MENU) return this.leaveToGive(item);
      if (r.outcome !== ItemOutcome.NO_POKEMON) return this.cancelAction();
      this.hideActions();
      this.showMessage(this.flow.assets.text("gText_ThereIsNoPokemon"));
      this.step = () => {
        const { flow } = this;
        if (flow.text.isActive(this.message!) || !flow.gba.input.isPressed(Button.A)) return;
        flow.play("se_select");
        clearDialogWindowAndFrameToTransparent(this.message!);
        this.message = null;
        flow.text.ctx.canABSpeedUpPrint = false;
        this.description.putTilemap();
        this.printCursor(Color.Dark);
        this.backToList();
      };
    });
  }

  /** Waits for mic-core's answer; nothing else runs meanwhile. */
  private ask(answer: Promise<ItemResult>, then: (r: ItemResult) => void): void {
    this.step = () => {};
    void answer.then((r) => {
      this.step = () => then(r);
    });
  }

  /** ItemPc_GetOrCreateSubwindow with a text printed at once. */
  private showPrompt(which: Prompt, text: Text, colors: readonly [number, number, number] = [1, 2, 3], letterSpacing = 0): void {
    this.hidePrompt();
    this.prompt = new Window(this.bg0, PROMPTS[which]);
    drawStdFrame(this.prompt, STD_FRAME_TILE, STD_FRAME_PALETTE);
    this.prompt.print(this.flow.fonts[FontId.Normal], 0, 2, colors, text, letterSpacing, 0);
    this.prompt.copyToVram();
  }

  private hidePrompt(): void {
    if (this.prompt) clearStdWindowAndFrameToTransparent(this.prompt);
    this.prompt = null;
  }

  /** ItemPc_PrintOnWindow5WithContinueTask: the message frame at the bottom, at the player's text speed. */
  private showMessage(text: Text): void {
    const { flow } = this;
    this.message = new Window(this.bg0, WINDOWS.message);
    drawDialogueFrame(this.message, false, MESSAGE_FRAME_TILE, MESSAGE_FRAME_PALETTE);
    const font = flow.fonts[FontId.Normal];
    flow.text.ctx.canABSpeedUpPrint = true;
    flow.text.add(this.message, { font, x: 0, y: 1, letterSpacing: font.letterSpacing, lineSpacing: font.lineSpacing, colors: [1, 2, 3] }, textSpeedDelay(flow.options), text);
    this.message.copyToVram();
  }

  // Moving with SELECT

  /** ItemPc_MoveItemModeInit: the list draws no cursor; the moved item's stays, gray; the line shows where it goes. */
  private beginMoving(index: number): void {
    const { flow } = this;
    const menu = this.menu!;
    menu.cursorHidden = true;
    this.moving = index;
    const name = flow.assets.itemName(this.slots[index].item);
    this.printDescription(expandPlaceholders(flow.assets.text("gOtherText_WhereShouldTheStrVar1BePlaced"), { [PLACEHOLDER_STR_VAR_1]: name }), Color.White, 3);
    this.icons.updateSwapLine(SWAP_LINE_X, menu.cursorY);
    this.icons.setSwapLineVisible(true);
    this.printCursor(Color.Gray);
    this.step = () => this.movingInput();
  }

  /** Task_ItemPcMoveItemModeRun: A or SELECT puts it there, B puts it back. */
  private movingInput(): void {
    const { input } = this.flow.gba;
    const menu = this.menu!;
    menu.processInput();
    this.position = menu.position;
    this.icons.updateSwapLine(SWAP_LINE_X, menu.cursorY);
    const at = menu.scroll + menu.row;
    if (input.isPressed(Button.A | Button.Select)) {
      this.flow.play("se_select");
      return this.endMoving(at, true);
    }
    if (input.isPressed(Button.B)) {
      this.flow.play("se_select");
      this.endMoving(at, false);
    }
  }

  /** ItemPc_InsertItemIntoNewSlot, or ItemPc_MoveItemModeCancel. */
  private endMoving(to: number, execute: boolean): void {
    const from = this.moving;
    this.moving = -1;
    if (execute && to !== from && to !== from + 1) this.host.move(from, to);
    const pos = this.menu!.position;
    afterMove(pos, from, to);
    this.position = pos;
    this.openList();
    this.icons.setSwapLineVisible(false);
    this.step = () => this.handleInput();
  }

  /** Task_ItemPcTurnOff1 (initialized): a fade out, then the party menu, then back here. */
  private leaveToGive(item: Item): void {
    const { flow, host, done } = this;
    const { gba } = flow;
    const back = this.menu?.position ?? this.position;
    gba.palettes.beginFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
    this.step = () => {
      if (gba.palettes.fadeActive) return;
      this.destroyArrows();
      this.icons.destroyIcon();
      gba.tasks.reset();
      startPartyMenu(flow, host.party, { kind: "give", item, pc: true }, () => startItemPc(flow, host, done, back));
    };
  }

  // Turning off

  /** Task_ItemPcTurnOff1 and 2: the screen turns off (SE_PC_OFF), then back to the field. */
  private turnOff(): void {
    const { gba } = this.flow;
    this.effect = beginPcScreenTurnOff(gba);
    this.flow.play("se_pc_off");
    this.step = () => {
      if (gba.palettes.fadeActive || this.effect?.active) return;
      this.destroyArrows();
      this.icons.destroyIcon();
      gba.tasks.reset();
      this.done();
    };
  }
}
