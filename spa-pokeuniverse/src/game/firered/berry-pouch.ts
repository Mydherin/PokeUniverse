// The BERRY POUCH (berry_pouch.c), opened with OPEN on the BERRY POUCH in the BAG or with
// SELECT on the field when registered: the pouch on the left, wobbling as the cursor moves;
// the list of berries by number with their quantities, then CLOSE; the selected berry's icon
// and description below. A opens USE, GIVE, TOSS, EXIT; mic-core decides what they do. B or
// CLOSE (and SELECT when opened from the field) fade back where it was opened from.

import { ItemOutcome, type ItemResult } from "@pokeuniverse/contracts/item/v1/bag";
import { Item, Pocket } from "@pokeuniverse/contracts/item/v1/catalog";
import { Gender } from "@pokeuniverse/contracts/trainer/v1/trainer";
import { Button } from "../gba/input";
import { PALETTES_ALL } from "../gba/palette";
import type { AffineCmd, Sprite, SpriteTemplate } from "../gba/sprites";
import { decimalText, EOS, expandPlaceholders, FontId, joinText, NumberMode, PLACEHOLDER_STR_VAR_1, PLACEHOLDER_STR_VAR_2, Window, type Text, type WindowTemplate } from "../gba/text";
import { RGB_BLACK, type Background } from "../gba/video";
import type { BagSlot } from "../world/items";
import type { BagHost } from "./bag";
import { startPartyMenu } from "./party-menu";
import { iconTiles, initBg } from "./common";
import type { Flow } from "./flow";
import { itemMessage, ItemMessagePlayer } from "./item-messages";
import { LIST_CANCEL, LIST_NOTHING_CHOSEN, ListMenu, type ListMenuItem, type ListPosition } from "./list-menu";
import { userFrame, type ItemIcon, type TextId } from "./manifest";
import { clearDialogWindowAndFrameToTransparent, clearStdWindowAndFrameToTransparent, copyTiles, CursorMenu, drawDialogueFrame, drawStdFrame, MENU_B_PRESSED, MENU_NOTHING_CHOSEN, YesNoMenu } from "./menu";
import { textSpeedDelay } from "./options";
import { ScrollArrowPair } from "./scroll-arrows";

/** sStaticCnt: the list's position, kept while the game runs. */
const position: ListPosition = { scroll: 0, row: 0 };

/**
 * Shows the BERRY POUCH, then `done` once it faded out. `fromField`: opened with SELECT on
 * the field, where SELECT also closes it (allowSelect).
 */
export function startBerryPouch(flow: Flow, gender: Gender, host: BagHost, fromField: boolean, done: (picked?: Item) => void, pick = false): void {
  new BerryPouch(flow, gender, host, fromField, done, pick);
}

/** BG0 (priority 1) and BG2 (priority 0) share the windows' tiles; BG1 (priority 2) is the screen. */
const TILES = 0x400;

const WINDOWS = {
  list: { left: 11, top: 1, width: 18, height: 14, palette: 15, baseBlock: 0x027 },
  description: { left: 5, top: 16, width: 25, height: 4, palette: 15, baseBlock: 0x123 },
  title: { left: 1, top: 1, width: 9, height: 2, palette: 15, baseBlock: 0x187 },
} satisfies Record<string, WindowTemplate>;
/** sWindowTemplates_Variable, on BG2, shown on demand. */
const QUANTITY_WINDOW: WindowTemplate = { left: 24, top: 15, width: 5, height: 4, palette: 15, baseBlock: 0x1d1 };
const YES_NO_WINDOW: WindowTemplate = { left: 23, top: 15, width: 6, height: 4, palette: 15, baseBlock: 0x219 };
const MESSAGE_WINDOW: WindowTemplate = { left: 2, top: 15, width: 26, height: 4, palette: 15, baseBlock: 0x231 };
/** Windows 6 to 9: the prompts beside the menus, wider for longer texts. */
const enum Prompt {
  Selected,
  ThrowAway,
  TossHowMany,
  ThrewAway,
}
const PROMPT_WINDOWS: Record<Prompt, WindowTemplate> = {
  [Prompt.Selected]: { left: 6, top: 15, width: 14, height: 4, palette: 12, baseBlock: 0x231 },
  [Prompt.ThrowAway]: { left: 6, top: 15, width: 15, height: 4, palette: 12, baseBlock: 0x269 },
  [Prompt.TossHowMany]: { left: 6, top: 15, width: 16, height: 4, palette: 12, baseBlock: 0x2a5 },
  [Prompt.ThrewAway]: { left: 6, top: 15, width: 23, height: 4, palette: 12, baseBlock: 0x2e5 },
};
/** Windows 10 to 13: the berry's menu, one row per action. */
const CONTEXT_WINDOWS: WindowTemplate[] = [2, 4, 6, 8].map((height) => ({ left: 22, top: 19 - height, width: 7, height, palette: 15, baseBlock: 0x199 }));

/** BerryPouchInitWindows: the user's frame, the message frame and the standard frame. */
const USER_FRAME_TILE = 0x001;
const USER_FRAME_PALETTE = 14;
const MESSAGE_FRAME_TILE = 0x013;
const MESSAGE_FRAME_PALETTE = 13;
const STD_FRAME_TILE = 0x00a;
const STD_FRAME_PALETTE = 12;

/** sTextColors: [fill, text, shadow]. */
const COLORS_LIGHT = [0, 1, 2] as const;
const COLORS_DARK = [0, 2, 3] as const;
const COLORS_GRAY = [0, 3, 2] as const;

const MAX_SHOWED = 7;
const QUANTITY_X = 110;
const SPACE: Text = [0x00, EOS];

const POUCH_AFFINE: AffineCmd[][] = [
  [{ xScale: 0x100, yScale: 0x100, duration: 0 }, "end"],
  [
    { xScale: 0, yScale: 0, rotation: -2, duration: 2 },
    { xScale: 0, yScale: 0, rotation: 2, duration: 4 },
    { xScale: 0, yScale: 0, rotation: -2, duration: 4 },
    { xScale: 0, yScale: 0, rotation: 2, duration: 2 },
    "end",
  ],
];
const POUCH_STILL = 0;
const POUCH_WOBBLE = 1;
const POUCH_TEMPLATE: SpriteTemplate = { sheet: "berryPouch", palette: "berryPouch", width: 64, height: 64, priority: 1, affineNormal: true, affineAnims: POUCH_AFFINE };
const ICON_TEMPLATE: SpriteTemplate = { sheet: "itemIcon", palette: "itemIcon", width: 32, height: 32, priority: 1 };

/** The actions (sContextMenuActions), in the field's order (sOptions_UseGiveTossExit). */
const enum Action {
  Use,
  Give,
  Toss,
  Exit,
}
const ACTIONS: Action[] = [Action.Use, Action.Give, Action.Toss, Action.Exit];
const ACTION_TEXTS: Record<Action, TextId> = {
  [Action.Use]: "gOtherText_Use",
  [Action.Give]: "gOtherText_Give",
  [Action.Toss]: "gOtherText_Toss",
  [Action.Exit]: "gOtherText_Exit",
};

class BerryPouch {
  private readonly bg0: Background;
  private readonly bg1: Background;
  private readonly bg2: Background;
  private readonly list: Window;
  private readonly description: Window;
  private readonly pouch: Sprite;
  /** The pouch's berries by number (SortAndCompactBagPocket). */
  private slots: BagSlot[] = [];
  private menu: ListMenu | null = null;
  private scrollArrows: ScrollArrowPair | null = null;
  private icon: Sprite | null = null;
  /** Bumped by every icon change: an icon that loads late for an older berry is dropped. */
  private iconRequest = 0;
  /** The task function running now, one call a frame. */
  private step: () => void = () => this.handleInput();
  /** The selected berry and its list row while its menu or an action runs. */
  private selected: { slot: BagSlot; index: number } | null = null;
  private contextMenu: CursorMenu | null = null;
  private prompt: Window | null = null;
  private quantityWin: Window | null = null;
  private message: Window | null = null;
  private yesNo: YesNoMenu | null = null;
  private quantity = 1;

  /** RunBerryPouchInit: every step runs in the first frame. */
  constructor(
    private readonly flow: Flow,
    private readonly gender: Gender,
    private readonly host: BagHost,
    private readonly fromField: boolean,
    private readonly done: (picked?: Item) => void,
    /** Opened from the party menu's GIVE: A chooses the item to give. */
    private readonly pick: boolean,
  ) {
    const { gba, assets } = flow;
    gba.setVBlank(null);
    gba.reset();
    const { video, palettes } = gba;
    [this.bg0, this.bg1, this.bg2] = video.bgs;
    initBg(this.bg0, 0, 1);
    initBg(this.bg1, 0, 2);
    initBg(this.bg2, 0, 0);
    this.bg0.tiles = this.bg2.tiles = new Uint8Array(TILES * 64);
    const bg = assets.get("berryPouchBg");
    this.bg1.tiles = bg.tiles;
    this.bg1.map.set(bg.map!.subarray(0, this.bg1.map.length));
    for (const b of [this.bg0, this.bg1, this.bg2]) b.visible = true;
    palettes.load(bg.palette, 0, 48);
    if (gender === Gender.GIRL) palettes.load(assets.get("berryPouchFemalePal").palette, 0, 16);
    gba.sprites.loadSheet("berryPouch", assets.get("berryPouch").tiles);
    palettes.loadSpritePalette("berryPouch", assets.get("berryPouch").palette);

    // BerryPouchInitWindows.
    const frame = assets.get(userFrame(flow.options.frame));
    copyTiles(this.bg0, frame.tiles, USER_FRAME_TILE, 9);
    palettes.load(frame.palette, USER_FRAME_PALETTE * 16, 16);
    copyTiles(this.bg0, assets.get("menuMessageFrame").tiles, MESSAGE_FRAME_TILE, 20);
    palettes.load(assets.get("textWindowPal0").palette, MESSAGE_FRAME_PALETTE * 16, 16);
    copyTiles(this.bg0, assets.get("stdWindowFrame").tiles, STD_FRAME_TILE, 9);
    palettes.load(assets.get("textWindowPal3").palette, STD_FRAME_PALETTE * 16, 16);
    palettes.load(assets.get("stdMenuPal").palette, 15 * 16, 16);
    this.list = new Window(this.bg0, WINDOWS.list);
    this.description = new Window(this.bg0, WINDOWS.description);
    const title = new Window(this.bg2, WINDOWS.title);
    for (const win of [this.list, this.description, title]) {
      win.fill(0);
      win.putTilemap();
      win.copyToVram();
    }

    this.sortSlots();
    fitPosition(this.slots.length, this.maxShowed());
    // PrintBerryPouchHeaderCentered.
    const font = flow.fonts[FontId.NormalCopy1];
    const name = assets.text("gText_BerryPouch");
    title.print(font, Math.trunc((72 - font.width(name)) / 2), 1, COLORS_LIGHT, name, 0, 0);
    title.copyToVram();

    gba.tasks.create(() => this.step(), 0);
    this.openList();
    this.pouch = gba.sprites.create(POUCH_TEMPLATE, 40, 76, 0)!;
    this.createScrollArrows();

    palettes.blendPalettes(PALETTES_ALL, 16, RGB_BLACK);
    palettes.beginFade(PALETTES_ALL, -2, 16, 0, RGB_BLACK);
    gba.setVBlank(gba.standardVBlank);
    gba.setMain(() => flow.runFrame());
  }

  /** SortAndCountBerries: the berries and CLOSE, 7 rows at most. */
  private maxShowed(): number {
    return Math.min(this.slots.length + 1, MAX_SHOWED);
  }

  private sortSlots(): void {
    this.slots = [...this.host.bag.pocket(Pocket.BERRY_POUCH)].sort((a, b) => a.item - b.item);
  }

  // The list

  /** SetUpListMenuTemplate and ListMenuInit: every berry by number, then CLOSE. */
  private openList(): void {
    const { flow } = this;
    const items: ListMenuItem[] = this.slots.map((slot, id) => ({ label: berryLabel(flow, slot.item), id }));
    items.push({ label: flow.assets.text("gText_Close"), id: items.length });
    const template = {
      win: this.list,
      items,
      maxShowed: this.maxShowed(),
      font: FontId.Normal,
      itemX: 9,
      cursorX: 1,
      upTextY: 2,
      itemVerticalPadding: 2,
      letterSpacing: 0,
      colors: COLORS_DARK,
      onMove: (id: number, onInit: boolean) => this.onCursorMove(id, onInit),
      onPrint: (id: number, y: number) => this.printQuantity(id, y),
    };
    this.menu = new ListMenu(flow, template, position);
  }

  /** DestroyListMenuTask: its position kept. */
  private closeList(): void {
    if (this.menu) Object.assign(position, this.menu.position);
    this.menu = null;
  }

  /** The list built again from the bag (SortAndCountBerries, SanitizeListMenuSelectionParams and on). */
  private rebuildList(): void {
    this.closeList();
    this.sortSlots();
    fitPosition(this.slots.length, this.maxShowed());
    this.openList();
  }

  /** BerryPouchMoveCursorFunc: the sound and the pouch's wobble, the icon, the description. */
  private onCursorMove(id: number, onInit: boolean): void {
    if (!onInit) {
      this.flow.play("se_bag_cursor");
      this.wobblePouch();
    }
    const item = this.slots[id]?.item ?? null;
    this.destroyIcon();
    this.createIcon(item);
    this.printDescription(item);
  }

  /** BerryPouchItemPrintFunc: "×n" right of the berry. */
  private printQuantity(id: number, y: number): void {
    const slot = this.slots[id];
    if (!slot) return;
    const { assets, fonts } = this.flow;
    const text = expandPlaceholders(assets.text("gText_TimesStrVar1"), { [PLACEHOLDER_STR_VAR_1]: decimalText(slot.quantity, NumberMode.RightAlign, 3) });
    this.list.print(fonts[FontId.Small], QUANTITY_X, y, COLORS_DARK, text, 0, 0);
  }

  /** PrintSelectedBerryDescription: the berry's, or what CLOSE does. */
  private printDescription(item: Item | null): void {
    const { assets, fonts } = this.flow;
    const text = item === null ? assets.text("gText_TheBerryPouchWillBePutAway") : assets.itemDescription(item);
    this.description.fill(0);
    this.description.print(fonts[FontId.Normal], 0, 2, COLORS_LIGHT, text, 2, 0);
    this.description.copyToVram();
  }

  /** BerryPouchSetArrowCursorFromListMenu: the "▶" at the list's selected row. */
  private printCursor(colors: readonly [number, number, number]): void {
    const { flow } = this;
    this.list.print(flow.fonts[FontId.Normal], 1, this.menu!.cursorY, colors, flow.assets.text("gText_SelectorArrow2"), 0, 0);
    this.list.copyToVram();
  }

  /** SetDescriptionWindowBorderPalette: the description's border darkens while a berry is selected. */
  private setDescriptionBorder(dark: boolean): void {
    const palette = dark ? 2 : 1;
    for (let y = 16; y < 20; y++) for (let x = 0; x < 30; x++) this.bg1.setEntry(x, y, (this.bg1.entry(x, y) & 0x0fff) | (palette << 12));
  }

  /** CreateScrollIndicatorArrows_BerryPouchList. */
  private createScrollArrows(): void {
    const fullyDown = this.slots.length - this.maxShowed() + 1;
    this.scrollArrows = ScrollArrowPair.vertical(this.flow, 160, 8, 120, fullyDown, "berryPouchScrollArrows", () => this.menu?.scroll ?? 0);
  }

  private destroyScrollArrows(): void {
    this.scrollArrows?.destroy();
    this.scrollArrows = null;
  }

  /** Task_BerryPouchMain. */
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
    this.destroyScrollArrows();
    this.setDescriptionBorder(true);
    this.printCursor(COLORS_GRAY);
    this.selected = { slot: this.slots[chosen], index: chosen };
    if (this.pick) this.pickToGive();
    else this.openContextMenu();
  }

  /** Task_CleanUpAndReturnToMain. */
  private returnToList(): void {
    this.selected = null;
    this.setDescriptionBorder(false);
    this.createScrollArrows();
    this.step = () => this.handleInput();
  }

  // The berry's menu

  /** CreateNormalContextMenu: USE, GIVE, TOSS, EXIT, and "<berry> is selected." beside them. */
  private openContextMenu(): void {
    const { flow } = this;
    const font = flow.fonts[FontId.Normal];
    const lineHeight = font.maxLetterHeight + 2;
    const win = new Window(this.bg2, CONTEXT_WINDOWS[ACTIONS.length - 1]);
    drawStdFrame(win, USER_FRAME_TILE, USER_FRAME_PALETTE);
    ACTIONS.forEach((a, i) => win.print(font, 8, 2 + i * lineHeight, [1, 2, 3], flow.assets.text(ACTION_TEXTS[a]), font.letterSpacing));
    this.contextMenu = new CursorMenu(flow, win, FontId.Normal, 0, 2, lineHeight, ACTIONS.length, 0);
    this.showPrompt(Prompt.Selected, expandPlaceholders(flow.assets.text("gText_Var1IsSelected"), { [PLACEHOLDER_STR_VAR_1]: this.selectedLabel() }));
    this.step = () => this.contextMenuInput();
  }

  /** CopySelectedListMenuItemName: the berry's row, "No01 CHERI BERRY". */
  private selectedLabel(): Text {
    return berryLabel(this.flow, this.selected!.slot.item);
  }

  /** Task_NormalContextMenu_HandleInput: B is EXIT. */
  private contextMenuInput(): void {
    const chosen = this.contextMenu!.processInput(false);
    if (chosen === MENU_NOTHING_CHOSEN) return;
    if (chosen === MENU_B_PRESSED) this.flow.play("se_select");
    switch (chosen === MENU_B_PRESSED ? Action.Exit : ACTIONS[chosen]) {
      case Action.Use:
        return this.useAction();
      case Action.Give:
        return this.giveAction();
      case Action.Toss:
        return this.tossAction();
      default:
        return this.exitAction();
    }
  }

  /** DestroyVariableWindow for the menu and its prompt. */
  private hideContextMenu(): void {
    if (this.contextMenu) clearStdWindowAndFrameToTransparent(this.contextMenu.win);
    this.contextMenu = null;
    this.hidePrompt();
  }

  /** Task_BerryPouch_Use: mic-core decides (no Pokémon, "not the time", the party menu to come). */
  private useAction(): void {
    this.hideContextMenu();
    this.list.putTilemap();
    this.description.putTilemap();
    this.ask(this.host.use(this.selected!.slot.item), (r) => this.onResult(r));
  }

  /** Task_BerryPouch_Give: "There is no POKéMON.", or the party menu chooses who holds it (CB2_ChooseMonToGiveItem). */
  private giveAction(): void {
    this.hideContextMenu();
    this.list.putTilemap();
    this.description.putTilemap();
    const item = this.selected!.slot.item;
    this.ask(this.host.give(item), (r) => {
      if (r.outcome !== ItemOutcome.PARTY_MENU) return this.onResult(r);
      const { flow, gender, host, fromField, done, pick } = this;
      this.close(undefined, () => startPartyMenu(flow, host.party, { kind: "give", item, pc: false }, () => startBerryPouch(flow, gender, host, fromField, done, pick)));
    });
  }

  /** Task_ContextMenu_FromPartyGiveMenu: back to the party menu with the berry. */
  private pickToGive(): void {
    this.close(this.selected!.slot.item);
  }

  /** Task_BerryPouch_Exit. */
  private exitAction(): void {
    this.hideContextMenu();
    this.list.putTilemap();
    this.description.putTilemap();
    this.printCursor(COLORS_DARK);
    this.returnToList();
  }

  /** Waits for mic-core's answer; nothing else runs meanwhile. */
  private ask(answer: Promise<ItemResult>, then: (r: ItemResult) => void): void {
    this.step = () => {};
    void answer.then((r) => {
      this.step = () => then(r);
    });
  }

  /**
   * DisplayItemMessageInBerryPouch: the answer's message, then the list built again. USE's
   * PARTY_MENU (a berry used on a Pokémon) comes with items' effects on Pokémon; until then, back to the list.
   */
  private onResult(r: ItemResult): void {
    const msg = itemMessage(this.flow, r, this.host.playerName);
    if (!msg) return this.refreshList();
    const player = new ItemMessagePlayer(
      this.flow,
      msg,
      (text, font) => this.showMessage(text, font),
      () => this.flow.text.isActive(this.message!),
    );
    this.step = () => {
      if (player.update()) this.refreshList();
    };
  }

  /** The message frame at the bottom, printed at the player's text speed. */
  private showMessage(text: Text, font: FontId): void {
    const { flow } = this;
    this.message ??= new Window(this.bg2, MESSAGE_WINDOW);
    this.message.fill(1);
    drawDialogueFrame(this.message, false, MESSAGE_FRAME_TILE, MESSAGE_FRAME_PALETTE);
    const f = flow.fonts[font];
    flow.text.ctx.canABSpeedUpPrint = true;
    flow.text.add(this.message, { font: f, x: 0, y: 1, letterSpacing: f.letterSpacing, lineSpacing: f.lineSpacing, colors: [1, 2, 3] }, textSpeedDelay(flow.options), text);
    this.message.copyToVram();
  }

  /** Task_BerryPouch_DestroyDialogueWindowAndRefreshListMenu. */
  private refreshList(): void {
    this.flow.text.ctx.canABSpeedUpPrint = false;
    if (this.message) {
      clearDialogWindowAndFrameToTransparent(this.message);
      this.description.putTilemap();
      this.message = null;
    }
    this.rebuildList();
    this.printCursor(COLORS_DARK);
    this.returnToList();
  }

  // TOSS

  /** Task_BerryPouch_Toss: how many (when more than one), then YES/NO. */
  private tossAction(): void {
    const { flow } = this;
    const sel = this.selected!;
    this.hideContextMenu();
    this.list.putTilemap();
    this.quantity = 1;
    if (sel.slot.quantity === 1) return this.confirmToss();
    // InitTossQuantitySelectUI.
    this.showPrompt(Prompt.TossHowMany, expandPlaceholders(flow.assets.text("gText_TossOutHowManyStrVar1s"), { [PLACEHOLDER_STR_VAR_1]: this.selectedLabel() }));
    this.quantityWin = new Window(this.bg2, QUANTITY_WINDOW);
    drawStdFrame(this.quantityWin, USER_FRAME_TILE, USER_FRAME_PALETTE);
    this.printTossQuantity();
    this.scrollArrows = ScrollArrowPair.vertical(flow, 212, 120, 152, 2, "berryPouchScrollArrows", () => 1);
    this.step = () => this.selectQuantity();
  }

  /** PrintxQuantityOnWindow: "×nnn". */
  private printTossQuantity(): void {
    const win = this.quantityWin!;
    const text = expandPlaceholders(this.flow.assets.text("gText_TimesStrVar1"), { [PLACEHOLDER_STR_VAR_1]: decimalText(this.quantity, NumberMode.LeadingZeros, 3) });
    win.fill(1);
    win.print(this.flow.fonts[FontId.Small], 4, 10, COLORS_DARK, text, 1, 0);
    win.copyToVram();
  }

  /** Task_Toss_SelectMultiple. */
  private selectQuantity(): void {
    const { flow } = this;
    const { input } = flow.gba;
    if (this.adjustQuantity(this.selected!.slot.quantity)) return this.printTossQuantity();
    if (!input.isPressed(Button.A | Button.B)) return;
    flow.play("se_select");
    this.hidePrompt();
    clearStdWindowAndFrameToTransparent(this.quantityWin!);
    this.quantityWin = null;
    this.destroyScrollArrows();
    if (input.isPressed(Button.A)) return this.confirmToss();
    this.list.putTilemap();
    this.description.putTilemap();
    this.printCursor(COLORS_DARK);
    this.returnToList();
  }

  /** AdjustQuantityAccordingToDPadInput: UP/DOWN by one (wrapping), RIGHT/LEFT by ten. */
  private adjustQuantity(max: number): boolean {
    const { input } = this.flow.gba;
    const before = this.quantity;
    if (input.isRepeated(Button.Up)) this.quantity = before + 1 > max ? 1 : before + 1;
    else if (input.isRepeated(Button.Down)) this.quantity = before - 1 <= 0 ? max : before - 1;
    else if (input.isRepeated(Button.Right)) this.quantity = Math.min(before + 10, max);
    else if (input.isRepeated(Button.Left)) this.quantity = Math.max(before - 10, 1);
    if (this.quantity === before) return false;
    this.flow.play("se_select");
    return true;
  }

  /** Task_AskTossMultiple: "Throw away n of this item?" with YES/NO. */
  private confirmToss(): void {
    const { flow } = this;
    this.showPrompt(Prompt.ThrowAway, expandPlaceholders(flow.assets.text("gText_ThrowAwayStrVar2OfThisItemQM"), { [PLACEHOLDER_STR_VAR_2]: decimalText(this.quantity, NumberMode.LeftAlign, 3) }));
    this.yesNo = new YesNoMenu(flow, this.bg2, YES_NO_WINDOW, FontId.Normal, 0, 2, 0, USER_FRAME_TILE, USER_FRAME_PALETTE);
    this.step = () => {
      const answer = this.yesNo!.processInput();
      if (answer === MENU_NOTHING_CHOSEN) return;
      this.yesNo = null;
      if (answer === MENU_B_PRESSED) this.flow.play("se_select");
      if (answer === 0) return this.tossBerries();
      // Task_TossNo.
      this.hidePrompt();
      this.description.putTilemap();
      this.list.putTilemap();
      this.printCursor(COLORS_DARK);
      this.returnToList();
    };
  }

  /** Task_TossYes: mic-core throws them away; "Threw away n <berry>(s)." until A or B. */
  private tossBerries(): void {
    const { flow } = this;
    const sel = this.selected!;
    this.hidePrompt();
    this.ask(this.host.toss(sel.slot.item, this.quantity), (r) => {
      if (r.outcome !== ItemOutcome.TOSSED) return this.refreshList();
      const text = expandPlaceholders(flow.assets.text("gText_ThrewAwayStrVar2StrVar1s"), {
        [PLACEHOLDER_STR_VAR_1]: this.selectedLabel(),
        [PLACEHOLDER_STR_VAR_2]: decimalText(r.value, NumberMode.LeftAlign, 3),
      });
      this.showPrompt(Prompt.ThrewAway, text);
      this.step = () => {
        if (!flow.gba.input.isPressed(Button.A | Button.B)) return;
        flow.play("se_select");
        this.hidePrompt();
        this.description.putTilemap();
        this.refreshList();
      };
    });
  }

  /** GetOrCreateVariableWindow for a prompt, its text printed at once. */
  private showPrompt(which: Prompt, text: Text): void {
    this.hidePrompt();
    this.prompt = new Window(this.bg2, PROMPT_WINDOWS[which]);
    drawStdFrame(this.prompt, STD_FRAME_TILE, STD_FRAME_PALETTE);
    this.prompt.print(this.flow.fonts[FontId.Normal], 0, 2, COLORS_DARK, text, 1, 2);
    this.prompt.copyToVram();
  }

  private hidePrompt(): void {
    if (this.prompt) clearStdWindowAndFrameToTransparent(this.prompt);
    this.prompt = null;
  }

  // Sprites

  /** StartBerryPouchSpriteWobbleAnim: once the last wobble ended. */
  private wobblePouch(): void {
    const pouch = this.pouch;
    if (!pouch.affineEnded) return;
    pouch.startAffineAnim(POUCH_WOBBLE);
    pouch.callback = (s) => {
      if (!s.affineEnded) return;
      s.startAffineAnim(POUCH_STILL);
      s.callback = () => {};
    };
  }

  /** CreateBerryPouchItemIcon for a berry (null: CLOSE's arrow); a berry's icon shows once loaded. */
  private createIcon(item: Item | null): void {
    const request = ++this.iconRequest;
    if (item === null) return this.showIcon(this.flow.assets.get("itemIconReturn"));
    void this.flow.assets.itemIcon(item).then(
      (icon) => request === this.iconRequest && this.showIcon(icon),
      () => {},
    );
  }

  /** The 24×24 icon in a 32×32 sprite, 3 pixels lower than in the BAG. */
  private showIcon(icon: ItemIcon): void {
    const { gba } = this.flow;
    gba.sprites.loadSheet("itemIcon", iconTiles(icon.image!));
    gba.palettes.loadSpritePalette("itemIcon", icon.palette);
    this.icon = gba.sprites.create(ICON_TEMPLATE, 0, 0, 0);
    if (this.icon) {
      this.icon.x2 = 24;
      this.icon.y2 = 147;
    }
  }

  private destroyIcon(): void {
    const { gba } = this.flow;
    this.iconRequest++;
    gba.sprites.destroy(this.icon);
    gba.sprites.freeSheet("itemIcon");
    gba.palettes.freeSpritePalette("itemIcon");
    this.icon = null;
  }

  /** BerryPouch_StartFadeToExitCallback. */
  private close(picked?: Item, next?: () => void): void {
    this.closeList();
    this.flow.gba.palettes.beginFade(PALETTES_ALL, -2, 0, 16, RGB_BLACK);
    this.step = () => {
      const { gba } = this.flow;
      if (gba.palettes.fadeActive) return;
      this.destroyScrollArrows();
      this.destroyIcon();
      gba.tasks.reset();
      if (next) next();
      else this.done(picked);
    };
  }
}

/** GetBerryNameAndIndexForMenu: "No01 CHERI BERRY", the number in the small font. */
function berryLabel(flow: Flow, item: Item): Text {
  const { assets } = flow;
  const number = decimalText(item - Item.CHERI_BERRY + 1, NumberMode.LeadingZeros, 2);
  return joinText(assets.text("gText_FontSmall"), assets.text("gText_NumberClear01"), number, SPACE, assets.text("gText_FontNormal"), assets.itemName(item));
}

/**
 * SanitizeListMenuSelectionParams and UpdateListMenuScrollOffset: the saved position fitted to
 * the pouch's `count` berries (and CLOSE).
 */
function fitPosition(count: number, maxShowed: number): void {
  const total = count + 1;
  if (position.scroll !== 0 && position.scroll + maxShowed > total) position.scroll = total - maxShowed;
  if (position.scroll + position.row >= total) position.row = total <= 1 ? 0 : total - 1;
  if (position.row > 4)
    for (let i = 0; i <= position.row - 4; position.row--, position.scroll++, i++) if (position.scroll + maxShowed === total) break;
}
