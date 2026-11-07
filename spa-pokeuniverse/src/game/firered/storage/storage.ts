// The box screen (pokemon_storage_system_tasks.c, _data.c): setup, the state machine and input.
// Read-only for now (phase-6 M6): A on a Pokémon offers only SUMMARY and CANCEL.

import { create } from "@bufbuild/protobuf";
import type { BoxView } from "@pokeuniverse/contracts/party/v1/box";
import type { BoxAction } from "../../../realtime/box-action";
import { PartySchema, type Pokemon } from "@pokeuniverse/contracts/party/v1/party";
import { ButtonMode } from "@pokeuniverse/contracts/trainer/v1/trainer";
import { Button } from "../../gba/input";
import { PALETTES_ALL } from "../../gba/palette";
import type { Task } from "../../gba/tasks";
import { expandDynamic, FontId, Window, type Text, type WindowTemplate } from "../../gba/text";
import { RGB_BLACK, type Background } from "../../gba/video";
import { initBg } from "../common";
import type { Flow } from "../flow";
import { userFrame, type Graphic } from "../manifest";
import { clearStdWindowAndFrameToTransparent, copyTiles, CursorMenu, drawStdFrame, MENU_NOTHING_CHOSEN, printDefault, YesNoMenu } from "../menu";
import { monName, type PartyHost } from "../party-menu";
import { beginPcScreenTurnOff, beginPcScreenTurnOn } from "../pc-screen-effect";
import { BillsEntry } from "../players-pc";
import { startSummary } from "../summary";
import { PartyState } from "../../world/party";
import { BOX_COUNT, BoxArea, loadBoxArt } from "./box-view";
import { Area, BOX_COLUMNS, BOX_ROWS, BOX_SLOTS, PARTY_CLOSE, STORAGE_SPRITE_PALETTE, StorageCursor, type CursorMove } from "./cursor";
import { DisplayMon } from "./display-mon";
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
const YES = 0;
const SUMMARY_ROW = 0;
/** Half a pixel a frame, on both axes. */
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

/** Back from the summary: the box already known, the hand where it was. */
interface Resume {
  view: BoxView;
  area: Area;
  pos: number;
  panelShown: boolean;
  savedBoxPos: number;
  prevPartyPos: number;
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
  private effect: Task | null = null;
  private step: () => void = () => {};
  /** The box position the hand goes back to when the party hides. */
  private savedBoxPos: number;
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
    this.prevPartyPos = resume?.prevPartyPos ?? 1;
    this.display = new DisplayMon(flow, this.bg1, DISPLAY_TEXT_TILE);
    this.box = new BoxArea(flow, this.bg2, view, wallpaper);
    this.panel = new PartyPanel(flow, this.bg1, this.party, panelShown);
    this.cursor = new StorageCursor(flow, resume?.area ?? (deposit ? Area.Party : Area.Box), resume?.pos ?? 0);
    if (this.cursor.area === Area.Title) this.box.setArrowsBouncing(true);
    this.display.show(this.monUnderCursor());

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
    const { area, pos } = this.cursor;
    if (area === Area.Box) return this.box.monAt(pos);
    return area === Area.Party ? (this.party[pos] ?? null) : null;
  }

  /** Task_PokeStorageMain. */
  private main(): void {
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
    this.cursor.moveTo(to);
    this.step = () => {
      if (!this.cursor.update()) return;
      if (this.cursor.area === Area.Title) this.box.setArrowsBouncing(true);
      this.display.show(this.monUnderCursor());
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
      this.hideParty();
    } else if (input.isPressed(Button.A)) {
      if (pos !== PARTY_CLOSE) return this.openSelection();
      if (deposit) this.promptClose();
      else this.hideParty();
    } else if (input.isPressed(Button.B)) {
      if (deposit) this.promptContinue();
      else this.hideParty();
    }
  }

  /** A box's slide: mic-core's answer and the art come first, then it runs as FireRed's. */
  private scrollBox(direction: number): void {
    const { flow } = this;
    const next = ((this.box.view.box - 1 + direction + BOX_COUNT) % BOX_COUNT) + 1;
    flow.play("se_select");
    this.step = () => {};
    const back = () => {
      this.step = () => this.main();
    };
    const load = async () => {
      const view = await this.host.askBox(next);
      if (view.box === 0) return back();
      const wallpaper = await loadBoxArt(flow, view);
      this.box.startScroll(view, wallpaper, direction);
      this.step = () => {
        if (this.box.update()) return;
        if (this.cursor.area !== Area.Title) this.box.setArrowsBouncing(false);
        this.display.show(this.monUnderCursor());
        back();
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

  /** The party's button outside MOVE POKéMON and MOVE ITEMS: a message until any press (Task_PokeStorageMain's state 3). */
  private tellWhichOne(): void {
    const { flow } = this;
    const { input } = flow.gba;
    this.showMessage(flow.assets.text("gText_WhichOneWillYouTake"));
    this.step = () => {
      if (![Button.A, Button.B, Button.Up, Button.Down, Button.Left, Button.Right].some((b) => input.isPressed(b))) return;
      this.clearMessage();
      this.step = () => this.main();
    };
  }

  /** The panel slides up, then the hand goes back to the box. */
  private hideParty(): void {
    this.panel.startHide();
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

  /** AddMenu, for a Pokémon: `gText_PkmnIsSelected`, SUMMARY and CANCEL. */
  private openSelection(): void {
    const { flow, bg0 } = this;
    const mon = this.monUnderCursor();
    if (!mon) return;
    flow.play("se_select");
    const { assets } = flow;
    this.showMessage(expandDynamic(assets.text("gText_PkmnIsSelected"), [monName(flow, mon)]));
    const entries = [assets.text("gPCText_Summary"), assets.text("gPCText_Cancel")];
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
      this.clearMessage();
      if (chosen === SUMMARY_ROW) this.openSummary();
      else this.step = () => this.main();
    };
  }

  /** The summary pages through the box without its gaps; a box Pokémon's moves stay as they are until M7. */
  private openSummary(): void {
    const { flow, host, cursor, panel } = this;
    const { gba } = flow;
    const inBox = cursor.area === Area.Box;
    const { slots, mons } = this.box.present();
    const partyHost: PartyHost = inBox ? { ...host.partyHost, party: new PartyState(create(PartySchema, { pokemon: mons })), movesLocked: true } : host.partyHost;
    const start = inBox ? slots.indexOf(cursor.pos) : cursor.pos;
    gba.palettes.beginFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
    this.step = () => {
      if (gba.palettes.fadeActive) return;
      gba.tasks.reset();
      startSummary(flow, partyHost, start, (last) =>
        startStorage(flow, host, this.entry, this.done, {
          view: this.box.view,
          area: cursor.area,
          pos: inBox ? slots[last] : last,
          panelShown: panel.shown,
          savedBoxPos: this.savedBoxPos,
          prevPartyPos: this.prevPartyPos,
        }),
      );
    };
  }

  /** Task_OnCloseBoxPressed: YES leaves. */
  private promptClose(): void {
    this.flow.play("se_select");
    this.ask(this.flow.assets.text("gText_ExitFromBox"), (yes) => yes);
  }

  /** Task_OnBPressed: YES stays; NO or B leaves. */
  private promptContinue(): void {
    this.flow.play("se_select");
    this.ask(this.flow.assets.text("gText_ContinueBoxOperations"), (yes) => !yes);
  }

  /** ShowYesNoWindow: the cursor starts on NO. */
  private ask(text: Text, leaves: (yes: boolean) => boolean): void {
    const { flow, bg0 } = this;
    this.showMessage(text);
    const menu = new YesNoMenu(flow, bg0, YES_NO_WINDOW, FontId.NormalCopy1, 0, 2, 1, USER_FRAME_TILE, USER_FRAME_PALETTE);
    this.step = () => {
      const chosen = menu.processInput();
      if (chosen === MENU_NOTHING_CHOSEN) return;
      this.clearMessage();
      if (leaves(chosen === YES)) this.close();
      else this.step = () => this.main();
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
