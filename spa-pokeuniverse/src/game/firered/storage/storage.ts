// The box screen (pokemon_storage_system_tasks.c, _data.c): setup, the state machine and input.
// The hand carries one Pokémon at a time; mic-core keeps it where it was taken from until it's put
// down, so each placing is one MovePokemon (phase-6 M7).

import { create } from "@bufbuild/protobuf";
import type { BoxView } from "@pokeuniverse/contracts/party/v1/box";
import type { BoxAction } from "../../../realtime/box-action";
import { PartySchema, type Pokemon } from "@pokeuniverse/contracts/party/v1/party";
import { ButtonMode } from "@pokeuniverse/contracts/trainer/v1/trainer";
import { Button } from "../../gba/input";
import { SIN } from "../../gba/trig";
import { PALETTES_ALL } from "../../gba/palette";
import type { AffineCmd, Sprite } from "../../gba/sprites";
import type { Task } from "../../gba/tasks";
import { decodeText, expandDynamic, FontId, Window, type Text, type WindowTemplate } from "../../gba/text";
import { Layer, RGB_BLACK, type Background } from "../../gba/video";
import { BagLocation, startBag } from "../bag";
import { initBg } from "../common";
import type { Flow } from "../flow";
import { userFrame, type Graphic, type TextId } from "../manifest";
import { MonIcon } from "../mon-icon";
import { FieldUse } from "@pokeuniverse/contracts/item/v1/catalog";
import { itemInfo } from "../../world/items";
import { clearStdWindowAndFrameToTransparent, copyTiles, CursorMenu, drawStdFrame, MENU_NOTHING_CHOSEN, printDefault, YesNoMenu } from "../menu";
import { startNamingScreen } from "../naming-screen";
import { monName, type PartyHost } from "../party-menu";
import { beginPcScreenTurnOff, beginPcScreenTurnOn } from "../pc-screen-effect";
import { BillsEntry } from "../players-pc";
import { startSummary } from "../summary";
import { PartyState } from "../../world/party";
import { BOX_COUNT, BoxArea, FIRST_FREE, loadBoxArt, sameMon, type Place } from "./box-view";
import { BOX_CANCELED, BOX_NONE_CHOSEN, ChooseBoxMenu } from "./choose-box";
import { ANIM_BOUNCE, ANIM_STILL, Area, BOX_COLUMNS, BOX_ROWS, BOX_SLOTS, HAND_FIST, HAND_OPEN, PARTY_CLOSE, STORAGE_SPRITE_PALETTE, StorageCursor, type CursorMove } from "./cursor";
import { DisplayMon } from "./display-mon";
import { ItemIcons } from "./item-icons";
import { MarkingsMenu } from "./markings-menu";
import { PartyPanel } from "./party-panel";

const BG_TILES = 512;
/** BG 1's tiles: `menu.bin` counts from here, and its window's tiles follow them. */
const MENU_TILE = 0x100;
const DISPLAY_TEXT_TILE = MENU_TILE + 0xc0;
const STD_FRAME_TILE = 2;
const STD_FRAME_PALETTE = 13;
const USER_FRAME_TILE = 0xb;
const USER_FRAME_PALETTE = 14;
const MESSAGE_WINDOW: WindowTemplate = { left: 11, top: 17, width: 18, height: 2, palette: STD_FRAME_PALETTE, baseBlock: 0x14 };
const YES_NO_WINDOW: WindowTemplate = { left: 24, top: 11, width: 5, height: 4, palette: 15, baseBlock: 0x5c };
const SELECTION_BASE_BLOCK = 0x70;
/** The item description window (sWindowTemplates[2]), sliding in from the left. */
const INFO_WINDOW: WindowTemplate = { left: 0, top: 12, width: 25, height: 8, palette: 15, baseBlock: 0x14 };
/** item_info_frame's four tiles on BG 0: top/bottom, right edge, top right, bottom right. */
const INFO_FRAME_TILE = 0x1a4;
const INFO_PALETTE = 15 << 12;
const VFLIP = 0x800;
const YES = 0;
const PARTY_SIZE = 6;
/** ShiftMons: frames the two icons take to trade places. */
const SHIFT_FRAMES = 16;
/** Half a pixel a frame, in the background's 1/256 pixels. */
const BG3_SPEED = 128;

/** What the box screen asks the world for. */
export interface StorageHost {
  readonly partyHost: PartyHost;
  /** OpenBox; `box` 0 is the current one, and a refusal comes back with box 0. */
  askBox(box: number): Promise<BoxView>;
  /** Saves a change the screen already shows; the answer is the box as mic-core kept it. */
  boxAction(action: BoxAction): Promise<BoxView>;
}

/** The Pokémon menu's entries (MENU_TEXT_*). */
const enum Choice {
  Move,
  Shift,
  Place,
  Withdraw,
  Store,
  Summary,
  Mark,
  Release,
  Take,
  Give,
  /** MENU_TEXT_GIVE2: an item from the bag, for a Pokémon holding nothing. */
  GiveFromBag,
  Switch,
  Bag,
  Info,
  Cancel,
}

const CHOICE_TEXT: Record<Choice, TextId> = {
  [Choice.Move]: "gPCText_Move",
  [Choice.Shift]: "gPCText_Shift",
  [Choice.Place]: "gPCText_Place",
  [Choice.Withdraw]: "gPCText_Withdraw",
  [Choice.Store]: "gPCText_Store",
  [Choice.Summary]: "gPCText_Summary",
  [Choice.Mark]: "gPCText_Mark",
  [Choice.Release]: "gPCText_Release",
  [Choice.Take]: "gPCText_Take",
  [Choice.Give]: "gPCText_Give",
  [Choice.GiveFromBag]: "gPCText_Give",
  [Choice.Switch]: "gPCText_Switch",
  [Choice.Bag]: "gPCText_Bag",
  [Choice.Info]: "gPCText_Info",
  [Choice.Cancel]: "gPCText_Cancel",
};

const RELEASE_ANIM_RELEASE = 0;
const RELEASE_ANIM_COME_BACK = 1;
/** sAffineAnims_ReleaseMon: the icon shrinks away, or grows back. */
const RELEASE_ANIMS: AffineCmd[][] = [
  [{ xScale: -2, yScale: -2, duration: 120 }, "end"],
  [{ xScale: 16, yScale: 16, duration: 0 }, { xScale: 16, yScale: 16, duration: 15 }, "end"],
];

/** AddBoxMenu: A on the box's title. */
const BOX_OPTIONS: TextId[] = ["gPCText_Jump", "gPCText_Wallpaper", "gPCText_Name", "gPCText_Cancel"];
const enum BoxOption {
  Jump,
  Wallpaper,
  Name,
}
/** AddWallpaperSetsMenu, then AddWallpapersMenu: four themes of four wallpapers, numbered as FireRed's. */
const WALLPAPER_SETS: TextId[] = ["gPCText_Scenery1", "gPCText_Scenery2", "gPCText_Scenery3", "gPCText_Etcetera"];
const WALLPAPER_NAMES: TextId[] = [
  "gPCText_Forest", "gPCText_City", "gPCText_Desert", "gPCText_Savanna",
  "gPCText_Crag", "gPCText_Volcano", "gPCText_Snow", "gPCText_Cave",
  "gPCText_Beach", "gPCText_Seafloor", "gPCText_River", "gPCText_Sky",
  "gPCText_PolkaDot", "gPCText_Pokecenter", "gPCText_Machine", "gPCText_Simple",
];
const WALLPAPERS_PER_SET = 4;

/** The Pokémon in the hand, still at `from` on mic-core. */
interface Held {
  mon: Pokemon;
  icon: MonIcon;
  from: Place;
}

/** The item in the hand (MOVE ITEMS), still held by the Pokémon at `from` on mic-core. */
interface HeldItem {
  item: number;
  from: Place;
}

function itemIsMail(item: number): boolean {
  return itemInfo(item)?.fieldUse === FieldUse.MAIL;
}

function isMail(mon: Pokemon): boolean {
  return itemIsMail(mon.heldItem);
}

/** Back from the summary: the box already known, the hand where it was. */
interface Resume {
  view: BoxView;
  area: Area;
  pos: number;
  panelShown: boolean;
  savedBoxPos: number;
  prevPartyPos: number;
  held: { mon: Pokemon; from: Place } | null;
  /** MOVE ITEMS' GIVE: the item chosen in the bag, for the Pokémon under the hand. */
  given?: number;
}

export function startStorage(flow: Flow, host: StorageHost, entry: BillsEntry, done: () => void, resume?: Resume): void {
  flow.gba.setMain(() => {});
  const { assets } = flow;
  const open = async () => {
    await assets.loadStorage();
    await Promise.all(host.partyHost.party.pokemon.map((p) => assets.pokemonArt(p.species).catch(() => null)));
    const view = resume?.view ?? (await host.askBox(0));
    if (view.box === 0) return done();
    new Storage(flow, host, entry, view, await loadBoxArt(flow, view), done, resume);
  };
  open().catch(() => done());
}

class Storage {
  private readonly bg0: Background;
  private readonly bg1: Background;
  private readonly bg2: Background;
  private readonly bg3: Background;
  private readonly box: BoxArea;
  private readonly cursor: StorageCursor;
  private readonly display: DisplayMon;
  private readonly panel: PartyPanel;
  private readonly message: Window;
  private held: Held | null = null;
  /** MOVE ITEMS: the item icons, and the item in the hand. */
  private readonly items: ItemIcons | null = null;
  private heldItem: HeldItem | null = null;
  /** A change on its way to mic-core: input waits for the answer. */
  private saving = false;
  private effect: Task | null = null;
  private step: () => void = () => {};
  /** The box position the hand goes back to when the party hides. */
  private savedBoxPos: number;
  /** sDepositBoxId: the box DEPOSIT last stored in, where its popup starts. */
  private depositBox: number;
  /** cursorPrevPartyPos: where Right goes from the party's first slot. */
  private prevPartyPos: number;

  constructor(
    private readonly flow: Flow,
    private readonly host: StorageHost,
    private readonly entry: BillsEntry,
    view: BoxView,
    wallpaper: Graphic,
    private readonly done: () => void,
    resume: Resume | undefined,
  ) {
    const { gba, assets } = flow;
    gba.setVBlank(null);
    gba.reset();
    const { video, palettes } = gba;
    [this.bg0, this.bg1, this.bg2, this.bg3] = video.bgs;
    initBg(this.bg0, 0, 0);
    initBg(this.bg1, 0, 1);
    initBg(this.bg2, 1, 2);
    initBg(this.bg3, 0, 3);
    for (const bg of video.bgs) {
      bg.tiles = new Uint8Array(BG_TILES * 64);
      bg.visible = true;
    }

    // InitPalettesAndSprites.
    palettes.load(assets.get("storageInterfacePal").palette, 0, 16);
    palettes.load(assets.get("storagePartyPal").palette, 16, 16);
    palettes.load(assets.get("storageNoDisplayMonPal").palette, 2 * 16, 16);
    const scrolling = assets.get("storageScrollingBg");
    palettes.load(scrolling.palette, 3 * 16, 16);
    palettes.load(assets.get("storageItemFrame").palette, 15 * 16, 16);
    palettes.loadSpritePalette(STORAGE_SPRITE_PALETTE, assets.get("storageMiscPal").palette);

    copyTiles(this.bg3, scrolling.tiles, 0);
    this.bg3.map.set(scrolling.map!.subarray(0, this.bg3.map.length));
    const menu = assets.get("storageMenu");
    copyTiles(this.bg1, menu.tiles, MENU_TILE);
    this.bg1.map.set(menu.map!.subarray(0, this.bg1.map.length));

    // InitPokeStorageBg0: the windows' frames.
    copyTiles(this.bg0, assets.get("stdWindowFrame").tiles, STD_FRAME_TILE, 9);
    palettes.load(assets.get("textWindowPal3").palette, STD_FRAME_PALETTE * 16, 16);
    const frame = assets.get(userFrame(flow.options.frame));
    copyTiles(this.bg0, frame.tiles, USER_FRAME_TILE, 9);
    palettes.load(frame.palette, USER_FRAME_PALETTE * 16, 16);
    this.message = new Window(this.bg0, MESSAGE_WINDOW);

    const deposit = entry === BillsEntry.Deposit;
    const panelShown = resume ? resume.panelShown : deposit;
    this.savedBoxPos = resume?.savedBoxPos ?? 0;
    this.depositBox = view.box;
    this.prevPartyPos = resume?.prevPartyPos ?? 1;
    this.display = new DisplayMon(flow, this.bg1, DISPLAY_TEXT_TILE);
    const held = resume?.held ?? null;
    this.box = new BoxArea(flow, this.bg2, view, wallpaper, held?.from ?? null);
    this.panel = new PartyPanel(flow, this.bg1, this.partyWithout(held?.from), panelShown);
    this.cursor = new StorageCursor(flow, resume?.area ?? (deposit ? Area.Party : Area.Box), resume?.pos ?? 0);
    if (held) this.hold(held.mon, new MonIcon(flow, held.mon.species, 0, 0, 7, 1), held.from);
    if (this.cursor.area === Area.Title) this.box.setArrowsBouncing(true);
    if (entry === BillsEntry.MoveItems) this.items = this.startItemMode(resume?.given);
    this.showDisplay();

    gba.tasks.create(() => this.tick(), 0);
    if (resume) {
      palettes.blendPalettes(PALETTES_ALL, 16, RGB_BLACK);
      palettes.beginFade(PALETTES_ALL, 0, 16, 0, RGB_BLACK);
    } else {
      // Task_InitPokeStorage: SE_PC_LOGIN and the screen coming on.
      flow.play("se_pc_login");
      this.effect = beginPcScreenTurnOn(gba);
    }
    this.step = () => {
      if (!palettes.fadeActive && !this.effect?.active) this.step = () => this.main();
    };
    gba.setVBlank(gba.standardVBlank);
    gba.setMain(() => flow.runFrame());
  }

  private get party(): readonly Pokemon[] {
    return this.host.partyHost.party.pokemon;
  }

  private tick(): void {
    // VBlankCB_PokeStorage: the background behind the wallpaper never stops.
    this.bg3.x += BG3_SPEED;
    this.bg3.y -= BG3_SPEED;
    this.step();
  }

  private monUnderCursor(): Pokemon | null {
    return this.monAt(this.cursor.area, this.cursor.pos);
  }

  private monAt(area: Area, pos: number): Pokemon | null {
    if (area === Area.Box) return this.box.monAt(pos);
    return area === Area.Party ? (this.panel.mons[pos] ?? null) : null;
  }

  /** TrySetDisplayMonData: the held one stays shown while it's carried. */
  private showDisplay(): void {
    this.display.show(this.held?.mon ?? this.monUnderCursor());
  }

  /** The party as mic-core keeps it, without one held from it. */
  private partyWithout(from: Place | null | undefined): Pokemon[] {
    const party = [...this.party];
    if (from?.box === 0) party.splice(from.slot, 1);
    return party;
  }

  /** A shown party slot's index on mic-core, where the one held from the party still is. */
  private partyIndex(pos: number): number {
    const from = this.held?.from;
    return from?.box === 0 && pos >= from.slot ? pos + 1 : pos;
  }

  /** Where the hand points on mic-core; an empty party slot is past its end. */
  private placeUnderCursor(): Place {
    const { area, pos } = this.cursor;
    if (area === Area.Box) return { box: this.box.view.box, slot: pos };
    if (pos < this.panel.count) return { box: 0, slot: this.partyIndex(pos) };
    return { box: 0, slot: this.panel.count + (this.held?.from.box === 0 ? 1 : 0) };
  }

  /** CountPartyAliveNonEggMonsExcept, on the party as shown. */
  private othersAble(pos: number): number {
    return this.panel.mons.filter((m, i) => m && i !== pos && m.hp > 0).length;
  }

  /** CanMovePartyMon's refusal: the last one able to battle can't leave the party. */
  private isLastAble(): boolean {
    const { area, pos } = this.cursor;
    return area === Area.Party && !this.held && this.othersAble(pos) === 0;
  }

  /** Task_PokeStorageMain. */
  private main(): void {
    if (this.saving) return;
    switch (this.cursor.area) {
      case Area.Box:
        return this.inputBox();
      case Area.Title:
        return this.inputTitle();
      case Area.Buttons:
        return this.inputButtons();
      case Area.Party:
        return this.inputParty();
    }
  }

  private moveCursor(to: CursorMove): void {
    this.flow.play("se_select");
    if (this.cursor.area === Area.Title && to.area !== Area.Title) this.box.setArrowsBouncing(false);
    // InitCursorMove: the item under the hand shrinks away, the next one grows in.
    if (this.items) {
      this.items.hideAt(this.cursor.area, this.cursor.pos);
      this.items.showAt(to.area, to.pos, this.monAt(to.area, to.pos)?.heldItem ?? 0);
    }
    this.cursor.moveTo(to);
    this.step = () => {
      if (!this.cursor.update()) return;
      if (this.cursor.area === Area.Title) this.box.setArrowsBouncing(true);
      this.showDisplay();
      this.step = () => this.main();
    };
  }

  /** The L and R buttons change boxes only in the LR button mode. */
  private scrollInput(): number {
    const { input } = this.flow.gba;
    if (this.flow.options.buttonMode !== ButtonMode.LR) return 0;
    if (input.isHeld(Button.L)) return -1;
    return input.isHeld(Button.R) ? 1 : 0;
  }

  /** HandleInput_InBox. */
  private inputBox(): void {
    const { input } = this.flow.gba;
    const { pos } = this.cursor;
    const column = pos % BOX_COLUMNS;
    if (input.isRepeated(Button.Up)) {
      this.moveCursor(pos < BOX_COLUMNS ? { area: Area.Title, pos: 0 } : { area: Area.Box, pos: pos - BOX_COLUMNS });
    } else if (input.isRepeated(Button.Down)) {
      if (pos < BOX_SLOTS - BOX_COLUMNS) this.moveCursor({ area: Area.Box, pos: pos + BOX_COLUMNS });
      else this.moveCursor({ area: Area.Buttons, pos: Math.trunc((pos + BOX_COLUMNS - BOX_ROWS * BOX_COLUMNS) / 3), wrapY: 1, flip: true });
    } else if (input.isRepeated(Button.Left)) {
      if (column === 0) this.moveCursor({ area: Area.Box, pos: pos + BOX_COLUMNS - 1, wrapX: -1 });
      else this.moveCursor({ area: Area.Box, pos: pos - 1 });
    } else if (input.isRepeated(Button.Right)) {
      if (column === BOX_COLUMNS - 1) this.moveCursor({ area: Area.Box, pos: pos - BOX_COLUMNS + 1, wrapX: 1 });
      else this.moveCursor({ area: Area.Box, pos: pos + 1 });
    } else if (input.isPressed(Button.Start)) {
      this.moveCursor({ area: Area.Title, pos: 0 });
    } else if (input.isPressed(Button.A)) {
      this.openSelection();
    } else if (input.isPressed(Button.B)) {
      this.promptContinue();
    } else {
      const direction = this.scrollInput();
      if (direction) this.scrollBox(direction);
    }
  }

  /** HandleInput_BoxTitle. */
  private inputTitle(): void {
    const { input } = this.flow.gba;
    if (input.isRepeated(Button.Up)) {
      this.moveCursor({ area: Area.Buttons, pos: 0, flip: true });
    } else if (input.isRepeated(Button.Down)) {
      this.moveCursor({ area: Area.Box, pos: 2 });
    } else if (input.isHeld(Button.Left)) {
      this.scrollBox(-1);
    } else if (input.isHeld(Button.Right)) {
      this.scrollBox(1);
    } else if (input.isPressed(Button.A)) {
      this.flow.play("se_select");
      this.box.setArrowsBouncing(false);
      this.boxOptions();
    } else if (input.isPressed(Button.B)) {
      this.promptContinue();
    } else {
      const direction = this.scrollInput();
      if (direction) this.scrollBox(direction);
    }
  }

  /** HandleInput_OnButtons. */
  private inputButtons(): void {
    const { input } = this.flow.gba;
    const { pos } = this.cursor;
    if (input.isRepeated(Button.Up)) {
      this.moveCursor({ area: Area.Box, pos: pos === 0 ? 24 : 29, wrapY: -1, flip: true });
    } else if (input.isRepeated(Button.Down) || input.isPressed(Button.Start)) {
      this.moveCursor({ area: Area.Title, pos: 0, flip: true });
    } else if (input.isRepeated(Button.Left) || input.isRepeated(Button.Right)) {
      this.moveCursor({ area: Area.Buttons, pos: pos ^ 1 });
    } else if (input.isPressed(Button.A)) {
      if (pos !== 0) this.promptClose();
      else if (this.entry === BillsEntry.MovePokemon || this.entry === BillsEntry.MoveItems) this.showParty();
      else this.tellWhichOne();
    } else if (input.isPressed(Button.B)) {
      this.promptContinue();
    }
  }

  /** HandleInput_InParty. */
  private inputParty(): void {
    const { input } = this.flow.gba;
    const { pos } = this.cursor;
    const deposit = this.entry === BillsEntry.Deposit;
    if (input.isRepeated(Button.Up)) {
      this.moveCursor({ area: Area.Party, pos: pos === 0 ? PARTY_CLOSE : pos - 1 });
    } else if (input.isRepeated(Button.Down)) {
      this.moveCursor({ area: Area.Party, pos: pos === PARTY_CLOSE ? 0 : pos + 1 });
    } else if (input.isRepeated(Button.Left)) {
      if (pos === 0) return;
      this.prevPartyPos = pos;
      this.moveCursor({ area: Area.Party, pos: 0 });
    } else if (input.isRepeated(Button.Right)) {
      if (pos === 0) return this.moveCursor({ area: Area.Party, pos: this.prevPartyPos });
      // Task_PokeStorageMain: DEPOSIT keeps the party shown.
      if (deposit) return;
      this.savedBoxPos = 0;
      this.tryHideParty();
    } else if (input.isPressed(Button.A)) {
      if (pos !== PARTY_CLOSE) return this.openSelection();
      if (deposit) this.promptClose();
      else this.tryHideParty();
    } else if (input.isPressed(Button.B)) {
      if (deposit) this.promptContinue();
      else this.tryHideParty();
    }
  }

  /** A box's slide to the next one, or to `next` (JUMP, silent); mic-core's answer and the art come first, then it runs as FireRed's. */
  private scrollBox(direction: number, next?: number): void {
    const { flow } = this;
    if (next === undefined) {
      next = ((this.box.view.box - 1 + direction + BOX_COUNT) % BOX_COUNT) + 1;
      flow.play("se_select");
    }
    const { items, cursor } = this;
    // TryHideItemAtCursor: MOVE ITEMS waits for the item to shrink away first.
    if (items && cursor.area === Area.Box) items.hideAt(Area.Box, cursor.pos);
    this.step = () => {};
    const back = () => {
      this.step = () => this.main();
    };
    const load = async () => {
      const view = await this.host.askBox(next!);
      if (view.box === 0) return back();
      const wallpaper = await loadBoxArt(flow, view);
      this.step = () => {
        if (items?.busy) return;
        this.box.startScroll(view, wallpaper, direction);
        items?.preload(view.pokemon.map((p) => p.pokemon?.heldItem ?? 0));
        this.step = () => {
          if (this.box.update()) return;
          if (cursor.area !== Area.Title) this.box.setArrowsBouncing(false);
          this.hideHeldItem();
          this.showDisplay();
          if (!items) return back();
          // TryShowItemAtCursor.
          if (cursor.area === Area.Box) items.showAt(Area.Box, cursor.pos, this.box.monAt(cursor.pos)?.heldItem ?? 0);
          this.step = () => {
            if (!items.busy) back();
          };
        };
      };
    };
    load().catch(back);
  }

  /** The party's button: the panel slides down, then the hand goes to its first slot. */
  private showParty(): void {
    this.savedBoxPos = 0;
    this.panel.startShow();
    this.step = () => {
      if (this.panel.update()) return;
      this.prevPartyPos = 1;
      this.moveCursor({ area: Area.Party, pos: 0 });
    };
  }

  /** The party's button outside MOVE POKéMON and MOVE ITEMS (Task_PokeStorageMain's state 3). */
  private tellWhichOne(): void {
    this.notice("gText_WhichOneWillYouTake", false);
  }

  /** INPUT_HIDE_PARTY: MAIL can't be carried into the boxes (Task_PrintCantStoreMail). */
  private tryHideParty(): void {
    if (this.held && isMail(this.held.mon)) this.notice("gText_MailCantBeStored", false);
    else this.hideParty();
  }

  /** A message until any press; a refusal sounds SE_FAILURE first. */
  private notice(id: TextId, failure: boolean): void {
    const { flow } = this;
    if (failure) flow.play("se_failure");
    this.showMessage(flow.assets.text(id));
    this.afterPress(() => {
      this.clearMessage();
      this.toMain();
    });
  }

  /** JOY_NEW(A_BUTTON | B_BUTTON | DPAD_ANY), then `then`. */
  private afterPress(then: () => void): void {
    const { input } = this.flow.gba;
    this.step = () => {
      if ([Button.A, Button.B, Button.Up, Button.Down, Button.Left, Button.Right].some((b) => input.isPressed(b))) then();
    };
  }

  private toMain(): void {
    this.step = () => this.main();
  }

  /** The panel slides up, then the hand goes back to the box. */
  private hideParty(): void {
    this.panel.startHide();
    this.items?.hideParty();
    this.step = () => {
      if (this.panel.update()) return;
      this.moveCursor({ area: Area.Box, pos: this.savedBoxPos });
    };
  }

  /** PrintStorageMessage: at once, in the bottom window. */
  private showMessage(text: Text): void {
    const { message, flow } = this;
    drawStdFrame(message, STD_FRAME_TILE, STD_FRAME_PALETTE);
    message.fill(1);
    printDefault(flow, message, FontId.NormalCopy1, text, 0, 2);
    message.putTilemap();
    message.copyToVram();
  }

  private clearMessage(): void {
    clearStdWindowAndFrameToTransparent(this.message);
  }

  /** SetMenuTextsForMon: null when A does nothing there. */
  private choices(): Choice[] | null {
    const mon = this.monUnderCursor();
    const list: Choice[] = [];
    if (this.items) {
      // SetMenuTextsForItem.
      if (!mon) return null;
      if (!this.heldItem) {
        if (!mon.heldItem) list.push(Choice.GiveFromBag);
        else {
          if (!isMail(mon)) list.push(Choice.Take, Choice.Bag);
          list.push(Choice.Info);
        }
      } else if (!mon.heldItem) list.push(Choice.Give);
      else if (isMail(mon)) return null;
      else list.push(Choice.Switch);
      list.push(Choice.Cancel);
      return list;
    }
    if (this.entry === BillsEntry.Withdraw) {
      if (!mon) return null;
      list.push(Choice.Withdraw);
    } else if (this.entry === BillsEntry.MovePokemon) {
      if (this.held) list.push(mon ? Choice.Shift : Choice.Place);
      else if (mon) list.push(Choice.Move);
      else return null;
    } else if (this.entry === BillsEntry.Deposit) {
      if (!mon) return null;
      list.push(Choice.Store);
    } else if (!mon) return null;
    list.push(Choice.Summary);
    if (this.entry === BillsEntry.MovePokemon) list.push(this.cursor.area === Area.Box ? Choice.Withdraw : Choice.Store);
    list.push(Choice.Mark, Choice.Release, Choice.Cancel);
    return list;
  }

  /** AddMenu, for a Pokémon: `gText_PkmnIsSelected` and its entries. */
  private openSelection(): void {
    const { flow } = this;
    const choices = this.choices();
    if (!choices) return;
    const mon = this.held?.mon ?? this.monUnderCursor()!;
    flow.play("se_select");
    const { assets } = flow;
    const item = this.heldItem?.item ?? mon.heldItem;
    // MSG_IS_SELECTED, or MOVE ITEMS' MSG_IS_SELECTED2 (the item's name) and MSG_GIVE_TO_MON.
    if (!this.items) this.showMessage(expandDynamic(assets.text("gText_PkmnIsSelected"), [monName(flow, mon)]));
    else if (item) this.showMessage(expandDynamic(assets.text("gText_PkmnIsSelected"), [assets.itemName(item)]));
    else this.showMessage(assets.text("gText_GiveToAPkmn"));
    this.openMenu(
      choices.map((c) => CHOICE_TEXT[c]),
      (chosen) => {
        this.clearMessage();
        this.choose(chosen < 0 ? Choice.Cancel : choices[chosen]);
      },
    );
  }

  /** AddMenu, HandleMenuInput: the entries in the bottom right corner; `pick` gets the one chosen, or -1 for B. */
  private openMenu(ids: TextId[], pick: (chosen: number) => void): void {
    const { flow, bg0 } = this;
    const entries = ids.map((id) => flow.assets.text(id));
    const width = Math.max(...entries.map((t) => t.length - 1)) + 2;
    const height = 2 * entries.length;
    const win = new Window(bg0, { left: 29 - width, top: 15 - height, width, height, palette: 15, baseBlock: SELECTION_BASE_BLOCK });
    drawStdFrame(win, USER_FRAME_TILE, USER_FRAME_PALETTE);
    win.fill(1);
    entries.forEach((text, i) => printDefault(flow, win, FontId.NormalCopy1, text, 8, 2 + i * 16));
    win.putTilemap();
    const menu = new CursorMenu(flow, win, FontId.NormalCopy1, 0, 2, 16, entries.length);
    win.copyToVram();
    this.step = () => {
      const chosen = menu.processInput(true);
      if (chosen === MENU_NOTHING_CHOSEN) return;
      clearStdWindowAndFrameToTransparent(win);
      pick(chosen);
    };
  }

  /** Task_HandleBoxOptions: B and CANCEL go back with the arrows bouncing again. */
  private boxOptions(): void {
    const { flow } = this;
    this.showMessage(flow.assets.text("gText_WhatDoYouWantToDo"));
    this.openMenu(BOX_OPTIONS, (chosen) => {
      if (chosen === BoxOption.Name) return this.nameBox();
      this.clearMessage();
      if (chosen === BoxOption.Wallpaper) return this.pickWallpaper();
      if (chosen === BoxOption.Jump) return this.jumpBox();
      this.box.setArrowsBouncing(true);
      this.toMain();
    });
  }

  /** Task_HandleWallpapers: a theme, then one of its four; B on the second menu goes back to the first. */
  private pickWallpaper(): void {
    const { flow } = this;
    this.showMessage(flow.assets.text("gText_PleasePickATheme"));
    this.openMenu(WALLPAPER_SETS, (set) => {
      if (set < 0) {
        this.clearMessage();
        this.box.setArrowsBouncing(true);
        return this.toMain();
      }
      const first = set * WALLPAPERS_PER_SET;
      this.showMessage(flow.assets.text("gText_PickTheWallpaper"));
      this.openMenu(WALLPAPER_NAMES.slice(first, first + WALLPAPERS_PER_SET), (chosen) => {
        this.clearMessage();
        if (chosen < 0) this.pickWallpaper();
        else this.changeWallpaper(first + chosen);
      });
    });
  }

  /** SetWallpaperForCurrentBox, DoWallpaperGfxChange: the box fades white while mic-core saves it, then shows the wallpaper it kept. */
  private changeWallpaper(wallpaper: number): void {
    const { flow, box } = this;
    const { palettes } = flow.gba;
    const shown = box.view.box;
    let answer: { view: BoxView; art: Graphic } | null = null;
    const save = async () => {
      const view = await this.host.boxAction({ case: "setBoxWallpaper", value: { box: shown, wallpaper } });
      const kept = view.box === shown ? view : box.view;
      answer = { view: kept, art: await loadBoxArt(flow, kept) };
    };
    const failed = async () => {
      answer = { view: box.view, art: await loadBoxArt(flow, box.view) };
    };
    save().catch(() => failed().catch(() => {}));
    box.startWallpaperChange();
    this.step = () => {
      if (palettes.fadeActive || !answer) return;
      box.endWallpaperChange(answer.view, answer.art);
      this.step = () => {
        if (palettes.fadeActive) return;
        box.setArrowsBouncing(true);
        this.toMain();
      };
    };
  }

  /** Task_JumpBox: the popup on the current box; another one scrolls there, the shorter way round. */
  private jumpBox(): void {
    const { flow, bg0 } = this;
    const current = this.box.view.box;
    this.showMessage(flow.assets.text("gText_JumpToWhichBox"));
    const menu = new ChooseBoxMenu(flow, bg0, this.box.view, current, this.held?.from.box ?? 0);
    this.step = () => {
      const box = menu.update();
      if (box === BOX_NONE_CHOSEN) return;
      this.clearMessage();
      menu.destroy();
      if (box === BOX_CANCELED || box === current) {
        this.box.setArrowsBouncing(true);
        return this.toMain();
      }
      // DetermineBoxScrollDirection.
      const ahead = (box - current + BOX_COUNT) % BOX_COUNT;
      this.scrollBox(ahead < BOX_COUNT / 2 ? 1 : -1, box);
    };
  }

  /** Task_NameBox: the naming screen (empty, as FireRed's); a name with more than spaces goes to mic-core, then the box screen comes back as it was. */
  private nameBox(): void {
    const { flow, host, cursor, panel, held } = this;
    const { gba } = flow;
    const shown = this.box.view.box;
    gba.palettes.beginFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
    this.step = () => {
      if (gba.palettes.fadeActive) return;
      gba.tasks.reset();
      startNamingScreen(flow, "box", host.partyHost.gender, (name) => {
        const back = (view: BoxView) =>
          startStorage(flow, host, this.entry, this.done, {
            view,
            area: cursor.area,
            pos: cursor.pos,
            panelShown: panel.shown,
            savedBoxPos: this.savedBoxPos,
            prevPartyPos: this.prevPartyPos,
            held: held && { mon: held.mon, from: held.from },
          });
        if (!name) return back(this.box.view);
        host
          .boxAction({ case: "renameBox", value: { box: shown, name: decodeText(flow.assets.charmap, name) } })
          .then((view) => back(view.box === shown ? view : this.box.view))
          .catch(() => back(this.box.view));
      });
    };
  }

  /** Task_OnSelectedMon's choices, with FireRed's refusals first (CursorMenu already sounded SE_SELECT). */
  private choose(choice: Choice): void {
    const then = () => {
      this.showDisplay();
      this.step = () => this.main();
    };
    switch (choice) {
      case Choice.Move:
        if (this.isLastAble()) return this.notice("gText_ThatsYourLastPkmn", true);
        return this.grab(then);
      case Choice.Place:
        return this.place(then);
      case Choice.Shift: {
        // CanShiftMon: a fainted one can't take the last able one's place in the party.
        const { area, pos } = this.cursor;
        if (area === Area.Party && this.othersAble(pos) === 0 && this.held!.mon.hp === 0) return this.notice("gText_ThatsYourLastPkmn", true);
        return this.shift();
      }
      case Choice.Withdraw:
        return this.withdraw();
      case Choice.Store:
        // MENU_TEXT_STORE: CanMovePartyMon, then ItemIsMail.
        if (this.isLastAble()) return this.notice("gText_ThatsYourLastPkmn", true);
        if (isMail(this.held?.mon ?? this.monUnderCursor()!)) return this.notice("gText_PleaseRemoveTheMail", true);
        return this.deposit();
      case Choice.Summary:
        return this.openSummary();
      case Choice.Mark:
        this.flow.play("se_select");
        return this.mark();
      case Choice.Release:
        // MENU_TEXT_RELEASE: CanMovePartyMon, then ItemIsMail (no eggs yet).
        if (this.isLastAble()) return this.notice("gText_ThatsYourLastPkmn", true);
        if (isMail(this.held?.mon ?? this.monUnderCursor()!)) return this.notice("gText_PleaseRemoveTheMail", true);
        this.flow.play("se_select");
        return this.release();
      case Choice.Take:
        this.flow.play("se_select");
        return this.takeItem();
      case Choice.Give:
        this.flow.play("se_select");
        return this.giveItem();
      case Choice.Switch:
        return this.switchItem();
      case Choice.Bag:
        return this.itemToBag();
      case Choice.GiveFromBag:
        return this.giveFromBag();
      case Choice.Info:
        return this.showItemInfo();
      case Choice.Cancel:
        this.step = () => this.main();
    }
  }

  /** MOVE ITEMS' setup (InitCursorItemIcon): icons see-through without an item, the item under the hand; back from the bag, the chosen one on the Pokémon under the hand. */
  private startItemMode(given: number | undefined): ItemIcons {
    const { flow, cursor, box, panel, display } = this;
    // SetMonIconTransparency.
    const { video } = flow.gba;
    video.target2 = Layer.ALL;
    video.eva = 7;
    video.evb = 11;
    box.itemMode = panel.itemMode = display.itemMode = true;
    box.refreshBlend();
    panel.refreshBlend();
    copyTiles(this.bg0, flow.assets.get("storageItemFrame").tiles, INFO_FRAME_TILE, 4);
    const items = new ItemIcons(flow, () => cursor.itemPoint());
    items.preload([...this.party, ...box.view.pokemon.map((p) => p.pokemon)].map((p) => p?.heldItem ?? 0));
    if (cursor.area !== Area.Title) items.showAt(cursor.area, cursor.pos, given || (this.monUnderCursor()?.heldItem ?? 0));
    if (given) {
      // GiveChosenBagItem: the Pokémon under the hand holds it, the hand stays empty.
      const place = this.placeUnderCursor();
      this.setItemUnderCursor(given);
      this.saveItem({ case: "giveHeldItem", value: { place, item: given } }, (view) => this.itemAt(place, view) === given);
    }
    return items;
  }

  /** The held item of the Pokémon at a place, as mic-core answered (party: already applied). */
  private itemAt(place: Place, view: BoxView): number {
    if (place.box === 0) return this.party[place.slot]?.heldItem ?? 0;
    return view.box === place.box ? (view.pokemon.find((p) => p.slot === place.slot)?.pokemon?.heldItem ?? 0) : 0;
  }

  /** The hand's item shows as taken from its Pokémon, which still holds it on mic-core. */
  private hideHeldItem(): void {
    const from = this.heldItem?.from;
    if (!from) return;
    if (from.box === 0) this.panel.setItem(from.slot, 0);
    else if (from.box === this.box.view.box) this.box.setItem(from.slot, 0);
  }

  /** The item under the hand changes on the screen at once. */
  private setItemUnderCursor(item: number): void {
    const { area, pos } = this.cursor;
    if (area === Area.Box) this.box.setItem(pos, item);
    else if (area === Area.Party) this.panel.setItem(pos, item);
  }

  /**
   * Sends an item change the screen already shows. Refused (`kept` false, or the call fails): the
   * hand empties and the screen shows mic-core's items.
   */
  private saveItem(action: BoxAction, kept: (view: BoxView) => boolean): void {
    this.saving = true;
    let refused = false;
    const answer = async () => {
      const view = await this.host.boxAction(action);
      refused = !kept(view);
      if (refused) this.dropHeldItem();
      this.sync(view);
    };
    answer()
      .catch(() => {
        refused = true;
        this.dropHeldItem();
      })
      .finally(() => {
        this.saving = false;
        if (refused) this.resetItemIcons();
        this.showDisplay();
      });
  }

  private dropHeldItem(): void {
    if (!this.heldItem) return;
    this.heldItem = null;
    this.items?.dropHand();
    this.cursor.holding = false;
    this.cursor.setHand(ANIM_BOUNCE);
  }

  /** After a refusal: the icon under the hand shows the item its Pokémon holds on mic-core. */
  private resetItemIcons(): void {
    const { items, cursor } = this;
    if (!items) return;
    items.clear();
    items.showAt(cursor.area, cursor.pos, this.monUnderCursor()?.heldItem ?? 0);
  }

  /** Waits for the item icons, then `then`. */
  private afterItems(then: () => void): void {
    this.step = () => {
      if (!this.items!.busy) then();
    };
  }

  /** Task_TakeItemForMoving: to the hand; mic-core hears of it once it's put down. */
  private takeItem(): void {
    const { cursor } = this;
    const mon = this.monUnderCursor()!;
    if (isMail(mon)) return this.notice("gText_MailCantBeStored", false);
    cursor.setHand(HAND_OPEN);
    this.items!.toHand(cursor.area, cursor.pos);
    this.heldItem = { item: mon.heldItem, from: this.placeUnderCursor() };
    this.setItemUnderCursor(0);
    cursor.holding = true;
    this.afterItems(() => {
      cursor.setHand(HAND_FIST);
      this.showDisplay();
      this.toMain();
    });
  }

  /** Task_GiveMovingItemToMon: down to the Pokémon, "is now held"; back on its own Pokémon, nothing to send. */
  private giveItem(): void {
    const { cursor, flow } = this;
    const { item, from } = this.heldItem!;
    const to = this.placeUnderCursor();
    cursor.setHand(HAND_OPEN);
    this.items!.give(cursor.area, cursor.pos);
    this.setItemUnderCursor(item);
    this.heldItem = null;
    cursor.holding = false;
    if (from.box !== to.box || from.slot !== to.slot) this.saveItem({ case: "moveHeldItem", value: { from, to } }, (view) => this.itemAt(to, view) === item);
    this.afterItems(() => {
      cursor.setHand(ANIM_BOUNCE);
      this.showDisplay();
      this.showMessage(expandDynamic(flow.assets.text("gText_ItemIsNowHeld"), [flow.assets.itemName(item)]));
      this.afterPress(() => {
        this.clearMessage();
        this.toMain();
      });
    });
  }

  /** Task_SwitchSelectedItem: the two items pass each other; the hand's new one stays on `from`'s Pokémon on mic-core. */
  private switchItem(): void {
    const { cursor, flow } = this;
    const mon = this.monUnderCursor()!;
    if (isMail(mon)) return this.notice("gText_MailCantBeStored", false);
    const held = this.heldItem!;
    const to = this.placeUnderCursor();
    const given = held.item;
    cursor.setHand(HAND_OPEN);
    this.items!.swap(cursor.area, cursor.pos);
    this.setItemUnderCursor(given);
    held.item = mon.heldItem;
    this.saveItem({ case: "moveHeldItem", value: { from: held.from, to } }, (view) => this.itemAt(to, view) === given);
    this.afterItems(() => {
      cursor.setHand(HAND_FIST);
      this.showDisplay();
      this.showMessage(expandDynamic(flow.assets.text("gText_ChangedToNewItem"), [flow.assets.itemName(held.item)]));
      this.afterPress(() => {
        this.clearMessage();
        this.toMain();
      });
    });
  }

  /** A refused action's answer (no box) fails like a lost call: the box is asked again, nothing changed. */
  private answered(view: BoxView): BoxView {
    if (view.box !== 0) return view;
    this.sync(view);
    throw new Error("refused");
  }

  /** Task_ItemToBag: mic-core decides (AddBagItem's bag full) before it shrinks away. */
  private itemToBag(): void {
    const { cursor, flow } = this;
    const { area, pos } = cursor;
    const place = this.placeUnderCursor();
    this.saving = true;
    this.host
      .boxAction({ case: "storeHeldItem", value: { place } })
      .then((view) => {
        this.sync(this.answered(view));
        if (this.itemAt(place, view)) return this.notice("gText_BagIsFull2", true);
        flow.play("se_select");
        this.items!.toBag(area, pos);
        this.afterItems(() => {
          this.showMessage(flow.assets.text("gText_PlacedItemInBag"));
          this.afterPress(() => {
            this.clearMessage();
            this.showDisplay();
            this.toMain();
          });
        });
      })
      .catch(() => this.notice("gText_BagIsFull2", true))
      .finally(() => (this.saving = false));
    this.step = () => {};
  }

  /** Task_GiveItemFromBag: the bag (ITEMMENULOCATION_PCBOX); the item chosen comes back in the hand. */
  private giveFromBag(): void {
    const { flow, host, cursor, panel } = this;
    const { gba } = flow;
    gba.palettes.beginFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
    this.step = () => {
      if (gba.palettes.fadeActive) return;
      gba.tasks.reset();
      const { partyHost } = host;
      startBag(
        flow,
        partyHost.gender,
        partyHost.bag,
        (exit) =>
          startStorage(flow, host, this.entry, this.done, {
            view: this.box.view,
            area: cursor.area,
            pos: cursor.pos,
            panelShown: panel.shown,
            savedBoxPos: this.savedBoxPos,
            prevPartyPos: this.prevPartyPos,
            held: null,
            given: exit && "chosen" in exit ? exit.chosen : undefined,
          }),
        BagLocation.PcBox,
      );
    };
  }

  /** Task_ShowItemInfo: the description slides in from the left until a press, then back out. */
  private showItemInfo(): void {
    const { flow, bg0 } = this;
    const item = this.heldItem?.item ?? this.monUnderCursor()!.heldItem;
    // PrintItemDescription, InitItemInfoWindow.
    const win = new Window(bg0, INFO_WINDOW);
    win.fill(1);
    printDefault(flow, win, FontId.Normal, flow.assets.itemDescription(item), 2, 0);
    win.copyToVram();
    flow.play("se_win_open");
    let offset = INFO_WINDOW.width;
    this.drawInfoFrame(0);
    const columns = (pos: number) => {
      for (let i = 0; i < pos; i++) {
        for (let row = 0; row < INFO_WINDOW.height; row++) bg0.setEntry(i, INFO_WINDOW.top + row, INFO_PALETTE | (INFO_WINDOW.baseBlock + offset + i + row * INFO_WINDOW.width));
      }
    };
    const clearColumn = (x: number) => {
      for (let y = 11; y < 21; y++) bg0.setEntry(x, y, 0);
    };
    // UpdateItemInfoWindowSlideIn.
    this.step = () => {
      offset--;
      const pos = INFO_WINDOW.width - offset;
      columns(pos);
      this.drawInfoFrame(pos);
      if (offset !== 0) return;
      this.afterPress(() => {
        flow.play("se_win_open");
        // UpdateItemInfoWindowSlideOut.
        this.step = () => {
          if (offset === 0) clearColumn(INFO_WINDOW.width);
          offset++;
          const pos = INFO_WINDOW.width - offset;
          columns(pos);
          this.drawInfoFrame(pos);
          clearColumn(pos);
          if (offset === INFO_WINDOW.width) this.toMain();
        };
      });
    };
  }

  /** DrawItemInfoWindow: the borders over `x` columns and the right edge after them. */
  private drawInfoFrame(x: number): void {
    const { bg0 } = this;
    const top = INFO_WINDOW.top - 1;
    const bottom = INFO_WINDOW.top + INFO_WINDOW.height;
    for (let i = 0; i < x; i++) {
      bg0.setEntry(i, top, INFO_PALETTE | INFO_FRAME_TILE);
      bg0.setEntry(i, bottom, INFO_PALETTE | VFLIP | INFO_FRAME_TILE);
    }
    for (let y = INFO_WINDOW.top; y < bottom; y++) bg0.setEntry(x, y, INFO_PALETTE | (INFO_FRAME_TILE + 1));
    bg0.setEntry(x, top, INFO_PALETTE | (INFO_FRAME_TILE + 2));
    bg0.setEntry(x, bottom, INFO_PALETTE | (INFO_FRAME_TILE + 3));
  }

  /** Task_CloseBoxWhileHoldingItem: YES puts the hand's item in the bag, unless it's full; either way the box stays open. */
  private closeHoldingItem(): void {
    const { flow, cursor } = this;
    flow.play("se_select");
    this.ask(
      flow.assets.text("gText_PutItemInBag"),
      (yes) => {
        if (!yes) return this.toMain();
        const { from } = this.heldItem!;
        this.saving = true;
        this.step = () => {};
        this.host
          .boxAction({ case: "storeHeldItem", value: { place: from } })
          .then((view) => {
            const full = this.itemAt(from, this.answered(view)) !== 0;
            if (full) {
              this.sync(view);
              this.showMessage(flow.assets.text("gText_BagIsFull2"));
              return this.afterPress(() => {
                this.clearMessage();
                this.toMain();
              });
            }
            // MoveItemFromCursorToBag.
            this.heldItem = null;
            this.sync(view);
            this.items!.handToBag();
            this.afterItems(() => {
              cursor.holding = false;
              cursor.setHand(ANIM_BOUNCE);
              this.toMain();
            });
          })
          .catch(() => this.notice("gText_BagIsFull2", false))
          .finally(() => (this.saving = false));
      },
      YES,
    );
  }

  /** The held one: its icon follows the hand (SpriteCB_HeldMon), its place shows empty. */
  private hold(mon: Pokemon, icon: MonIcon, from: Place): void {
    const { cursor } = this;
    this.held = { mon, icon, from };
    this.box.hidden = from;
    cursor.holding = true;
    cursor.setHand(HAND_FIST);
    icon.sprite.subpriority = 7;
    icon.sprite.callback = (s) => {
      [s.x, s.y] = cursor.holdPoint();
      s.priority = cursor.iconPriority;
    };
  }

  /** MonPlaceChange_Grab: the hand opens, reaches down, closes on it and lifts it. */
  private grab(then: () => void): void {
    const { cursor } = this;
    const { area, pos } = cursor;
    cursor.setHand(HAND_OPEN);
    this.step = () => {
      if (cursor.reachDown()) return;
      const mon = this.monUnderCursor()!;
      const from = this.placeUnderCursor();
      const icon = area === Area.Box ? this.box.take(pos) : this.panel.take(pos);
      this.hold(mon, icon!, from);
      this.step = () => {
        if (cursor.reachUp()) return;
        // Task_HandleMovingMonFromParty: the party closes up at once.
        if (area === Area.Party) this.compactParty(then);
        else then();
      };
    };
  }

  /** MonPlaceChange_Place: the hand reaches down, lets go and comes back up. */
  private place(then: () => void): void {
    const { cursor } = this;
    const held = this.held!;
    const { area, pos } = cursor;
    const to = this.placeUnderCursor();
    this.step = () => {
      if (cursor.reachDown()) return;
      cursor.setHand(HAND_OPEN);
      cursor.holding = false;
      this.held = null;
      this.box.hidden = null;
      if (area === Area.Box) this.box.put(pos, held.mon, held.icon);
      else this.panel.put(pos, held.mon, held.icon);
      if (held.from.box !== to.box || held.from.slot !== to.slot) this.save(held.from, to, held.mon);
      this.step = () => {
        if (cursor.reachUp()) return;
        cursor.setHand(ANIM_BOUNCE);
        if (area === Area.Party) this.compactParty(then);
        else then();
      };
    };
  }

  /** MonPlaceChange_Shift, ShiftMons: the two icons swing past each other; the other one ends in the hand. */
  private shift(): void {
    const { cursor } = this;
    const held = this.held!;
    const { area, pos } = cursor;
    const to = this.placeUnderCursor();
    const mon = this.monUnderCursor()!;
    const other = (area === Area.Box ? this.box.take(pos) : this.panel.take(pos))!;
    cursor.setHand(HAND_OPEN);
    held.icon.sprite.callback = () => {};
    let timer = 0;
    this.step = () => {
      timer++;
      const [a, b] = [other.sprite, held.icon.sprite];
      if (timer & 1) {
        a.y--;
        b.y++;
      }
      a.x2 = Math.trunc(SIN[timer * 8] / 16);
      b.x2 = -a.x2;
      if (timer === SHIFT_FRAMES / 2) {
        [b.priority, b.subpriority, a.priority, a.subpriority] = [a.priority, a.subpriority, cursor.iconPriority, 7];
      }
      if (timer < SHIFT_FRAMES) return;
      if (area === Area.Box) this.box.put(pos, held.mon, held.icon);
      else this.panel.put(pos, held.mon, held.icon);
      other.sprite.x2 = 0;
      this.hold(mon, other, held.from);
      this.save(held.from, to, held.mon);
      this.showDisplay();
      this.step = () => this.main();
    };
  }

  /** Task_WithdrawMon: taken, the party opens, put in its first free slot, the party closes. */
  private withdraw(): void {
    if (this.panel.count >= PARTY_SIZE) return this.notice("gText_YourPartysFull", false);
    const { cursor, panel } = this;
    this.savedBoxPos = cursor.pos;
    const toParty = () => {
      panel.startShow();
      this.step = () => {
        if (panel.update()) return;
        // DoShowPartyMenu, SetCursorInParty: to the first free slot.
        cursor.moveTo({ area: Area.Party, pos: panel.count });
        this.step = () => {
          if (cursor.update()) this.place(() => this.hideParty());
        };
      };
    };
    if (this.held) toParty();
    else this.grab(toParty);
  }

  /** Task_DepositMenu: the popup picks a box; a full one says so until any press. */
  private deposit(): void {
    const { flow, bg0 } = this;
    const ask = () => this.showMessage(flow.assets.text("gText_DepositInWhichBox"));
    ask();
    const menu = new ChooseBoxMenu(flow, bg0, this.box.view, this.depositBox, this.held?.from.box ?? 0);
    const choose = () => {
      const box = menu.update();
      if (box === BOX_NONE_CHOSEN) return;
      if (box !== BOX_CANCELED && menu.isFull(box)) {
        this.showMessage(flow.assets.text("gText_BoxIsFull2"));
        this.afterPress(() => {
          ask();
          this.step = choose;
        });
        return;
      }
      this.clearMessage();
      menu.destroy();
      if (box === BOX_CANCELED) this.step = () => this.main();
      else this.store(box);
    };
    this.step = choose;
  }

  /** TryStorePartyMonInBox: the party one (or the held one) goes to the box's first free slot, then the party closes up. */
  private store(box: number): void {
    const { cursor, panel, held } = this;
    this.depositBox = box;
    const from = held?.from ?? this.placeUnderCursor();
    const mon = held?.mon ?? this.monUnderCursor()!;
    const icon = held?.icon ?? panel.take(cursor.pos)!;
    if (held) {
      this.held = null;
      this.box.hidden = null;
      cursor.holding = false;
    }
    const slot = box === this.box.view.box ? this.box.firstFree() : -1;
    if (slot >= 0) this.box.put(slot, mon, icon);
    else this.flow.gba.sprites.destroy(icon.sprite);
    cursor.setHand(ANIM_STILL);
    this.save(from, { box, slot: FIRST_FREE }, mon);
    // Task_DepositMenu states 2-3, ResetSelectionAfterDeposit.
    this.compactParty(() => {
      cursor.setHand(ANIM_BOUNCE);
      this.showDisplay();
      this.step = () => this.main();
    });
  }

  /** Task_ShowMarkMenu: OK saves the marks chosen (SetMonMarkings), shown at once. */
  private mark(): void {
    const { flow } = this;
    const mon = this.held?.mon ?? this.monUnderCursor()!;
    const place = this.held?.from ?? this.placeUnderCursor();
    this.showMessage(flow.assets.text("gText_MarkYourPkmn"));
    const menu = new MarkingsMenu(flow, mon.markings, 176, 16);
    this.step = () => {
      if (menu.update()) return;
      menu.destroy();
      this.clearMessage();
      if (menu.markings !== mon.markings) {
        mon.markings = menu.markings;
        this.saving = true;
        this.host
          .boxAction({ case: "setMarkings", value: { place, markings: menu.markings } })
          .then((view) => this.sync(view))
          .catch(() => {})
          .finally(() => {
            this.saving = false;
            this.showDisplay();
          });
      }
      this.showDisplay();
      this.toMain();
    };
  }

  /**
   * Task_ReleaseMon: YES shrinks the icon away while mic-core decides (RunCanReleaseMon's SURF and
   * DIVE rule needs every box); released, two messages and the party closes up; refused, it comes back.
   */
  private release(): void {
    const { flow, cursor, held } = this;
    const { area, pos } = cursor;
    const mon = held?.mon ?? this.monUnderCursor()!;
    const place = held?.from ?? this.placeUnderCursor();
    const say = (id: TextId) => this.showMessage(expandDynamic(flow.assets.text(id), [monName(flow, mon)]));
    this.ask(flow.assets.text("gText_ReleaseThisPokemon"), (yes) => {
      if (!yes) return this.toMain();
      // InitReleaseMon, DoReleaseMonAnim: the held one's, or the slot's (taken off the screen's state).
      const icon = held?.icon ?? (area === Area.Box ? this.box.take(pos) : this.panel.take(pos))!;
      const sprite = icon.sprite;
      sprite.affine = true;
      sprite.affineDouble = false;
      sprite.affineAnims = RELEASE_ANIMS;
      sprite.startAffineAnim(RELEASE_ANIM_RELEASE);
      let answer: { released: boolean; view: BoxView | null } | null = null;
      this.saving = true;
      this.host
        .boxAction({ case: "releasePokemon", value: { place } })
        .then((view) => {
          const released = place.box === 0 ? !this.party.some((p) => sameMon(p, mon)) : view.box !== place.box || !sameMon(view.pokemon.find((p) => p.slot === place.slot)?.pokemon, mon);
          answer = { released, view };
        })
        .catch(() => (answer = { released: false, view: null }))
        .finally(() => (this.saving = false));
      this.step = () => {
        // TryHideReleaseMon: hidden once the shrink ends; then wait for mic-core.
        if (!sprite.invisible) {
          if (sprite.affineEnded) {
            sprite.invisible = true;
            cursor.setHand(ANIM_BOUNCE);
          }
          return;
        }
        if (!answer) return;
        const { released, view } = answer;
        if (released) this.released(sprite, area, view!, say);
        else this.cameBack(sprite, area, pos, mon, icon, view, say);
      };
    });
  }

  /** Task_ReleaseMon states 3-7: "was released", "Bye-bye", then the party closes up before showing mic-core's. */
  private released(sprite: Sprite, area: Area, view: BoxView, say: (id: TextId) => void): void {
    if (this.held) this.dropHeld();
    else this.flow.gba.sprites.destroy(sprite);
    if (view.box !== 0) this.box.sync(view);
    this.showDisplay();
    say("gText_PkmnWasReleased");
    this.afterPress(() => {
      say("gText_ByeByePkmn");
      this.afterPress(() => {
        this.clearMessage();
        const done = () => {
          this.sync(view);
          this.showDisplay();
          this.toMain();
        };
        if (area === Area.Party) this.compactParty(done);
        else done();
      });
    });
  }

  /** Task_ReleaseMon states 8-13: "was released", "....!", it grows back, "came back", "worried". */
  private cameBack(sprite: Sprite, area: Area, pos: number, mon: Pokemon, icon: MonIcon, view: BoxView | null, say: (id: TextId) => void): void {
    say("gText_PkmnWasReleased");
    this.afterPress(() => {
      this.showMessage(this.flow.assets.text("gText_FourEllipsesExclamation"));
      this.afterPress(() => {
        this.clearMessage();
        sprite.invisible = false;
        sprite.startAffineAnim(RELEASE_ANIM_COME_BACK);
        this.step = () => {
          if (!sprite.affineEnded) return;
          sprite.affine = false;
          if (this.held) this.cursor.setHand(HAND_FIST);
          else if (area === Area.Box) this.box.put(pos, mon, icon);
          else this.panel.put(pos, mon, icon);
          if (view) this.sync(view);
          say("gText_PkmnCameBack");
          this.afterPress(() => {
            this.showMessage(this.flow.assets.text("gText_WasItWorriedAboutYou"));
            this.afterPress(() => {
              this.clearMessage();
              this.toMain();
            });
          });
        };
      });
    });
  }

  /** The screen as mic-core answered: the shown box and the party without the held one. */
  private sync(view: BoxView): void {
    if (view.box !== 0) this.box.sync(view);
    // No box in the answer (the connection dropped meanwhile): the shown box as mic-core has it.
    else
      this.host
        .askBox(this.box.view.box)
        .then((v) => this.box.sync(v))
        .catch(() => {});
    this.panel.sync(this.partyWithout(this.held?.from));
    this.hideHeldItem();
  }

  private compactParty(then: () => void): void {
    this.panel.startCompact();
    this.step = () => {
      if (!this.panel.update()) then();
    };
  }

  /** Sends a change the screen already shows. Refused: the hand empties and the screen shows mic-core's boxes and party as they are. */
  private save(from: Place, to: Place, moved: Pokemon): void {
    this.saving = true;
    const answer = async () => {
      const view = await this.host.boxAction({ case: "movePokemon", value: { from, to } });
      const landed =
        to.box === 0 ? this.party.some((p) => sameMon(p, moved)) : view.box === to.box && sameMon(view.pokemon.find((p) => p.slot === to.slot)?.pokemon, moved);
      if (!landed && to.slot !== FIRST_FREE) this.dropHeld();
      this.sync(view);
    };
    answer()
      .catch(() => this.dropHeld())
      .finally(() => {
        this.saving = false;
        this.showDisplay();
      });
  }

  private dropHeld(): void {
    const { held, cursor } = this;
    if (!held) return;
    this.flow.gba.sprites.destroy(held.icon.sprite);
    this.held = null;
    this.box.hidden = null;
    cursor.holding = false;
    cursor.setHand(ANIM_BOUNCE);
  }

  /** The summary pages through the box without its gaps; a box Pokémon's moves stay as they are until M7. */
  private openSummary(): void {
    const { flow, host, cursor, panel } = this;
    const { gba } = flow;
    const { held } = this;
    const inBox = cursor.area === Area.Box && !held;
    const { slots, mons } = this.box.present();
    const shown = held ? [held.mon] : inBox ? mons : null;
    const partyHost: PartyHost = shown ? { ...host.partyHost, party: new PartyState(create(PartySchema, { pokemon: shown })), movesLocked: true } : host.partyHost;
    const start = held ? 0 : inBox ? slots.indexOf(cursor.pos) : cursor.pos;
    gba.palettes.beginFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
    this.step = () => {
      if (gba.palettes.fadeActive) return;
      gba.tasks.reset();
      startSummary(flow, partyHost, start, (last) =>
        startStorage(flow, host, this.entry, this.done, {
          view: this.box.view,
          area: cursor.area,
          pos: held ? cursor.pos : inBox ? slots[last] : last,
          panelShown: panel.shown,
          savedBoxPos: this.savedBoxPos,
          prevPartyPos: this.prevPartyPos,
          held: held && { mon: held.mon, from: held.from },
        }),
      );
    };
  }

  /** Task_OnCloseBoxPressed: YES leaves. */
  private promptClose(): void {
    if (this.held) return this.notice("gText_YoureHoldingAPkmn", true);
    if (this.heldItem) return this.closeHoldingItem();
    this.flow.play("se_select");
    this.ask(this.flow.assets.text("gText_ExitFromBox"), (yes) => (yes ? this.close() : this.toMain()));
  }

  /** Task_OnBPressed: YES stays; NO or B leaves. */
  private promptContinue(): void {
    if (this.held) return this.notice("gText_YoureHoldingAPkmn", true);
    if (this.heldItem) return this.closeHoldingItem();
    this.flow.play("se_select");
    this.ask(this.flow.assets.text("gText_ContinueBoxOperations"), (yes) => (yes ? this.toMain() : this.close()));
  }

  /** ShowYesNoWindow: the cursor starts on NO unless told; B answers NO. */
  private ask(text: Text, answer: (yes: boolean) => void, initial = 1): void {
    const { flow, bg0 } = this;
    this.showMessage(text);
    const menu = new YesNoMenu(flow, bg0, YES_NO_WINDOW, FontId.NormalCopy1, 0, 2, initial, USER_FRAME_TILE, USER_FRAME_PALETTE);
    this.step = () => {
      const chosen = menu.processInput();
      if (chosen === MENU_NOTHING_CHOSEN) return;
      this.clearMessage();
      answer(chosen === YES);
    };
  }

  /** Task_PokeStorageExit: SE_PC_OFF and the screen going off; then BILL'S PC, on the entry chosen. */
  private close(): void {
    const { flow } = this;
    const { gba } = flow;
    flow.play("se_pc_off");
    this.effect = beginPcScreenTurnOff(gba);
    this.step = () => {
      if (this.effect?.active) return;
      gba.tasks.reset();
      this.done();
    };
  }
}
