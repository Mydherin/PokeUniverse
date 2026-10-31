// The bedroom PC's menus on the field (player_pc.c): "What would you like to do?" with ITEM
// STORAGE, MAILBOX and TURN OFF; ITEM STORAGE's WITHDRAW ITEM, DEPOSIT ITEM and CANCEL, each
// described in the message box. The overworld opens the screens the menu asks for and brings
// the menu back when they close. The PC's screen on the map flickers on and goes off with it.

import { Direction } from "@pokeuniverse/contracts/map/v1/map";
import { Pc } from "@pokeuniverse/contracts/world/v1/world";
import type { Gba } from "../gba/gba";
import { Button } from "../gba/input";
import type { Task } from "../gba/tasks";
import { FontId, Window, type WindowTemplate } from "../gba/text";
import type { FieldMessage } from "./field-message";
import type { Flow } from "./flow";
import type { TextId } from "./manifest";
import { clearStdWindowAndFrameToTransparent, CursorMenu, drawStdFrame, MENU_B_PRESSED, MENU_NOTHING_CHOSEN, printDefault } from "./menu";

/** Each PC's screen tiles (FireRed's metatile numbers): METATILE_GenericBuilding1_PlayersPCOn / Off. */
export const PC_SCREEN_TILES: Partial<Record<Pc, { on: number; off: number }>> = {
  [Pc.PLAYERS]: { on: 0x28a, off: 0x28f },
};

/** PcTurnOnUpdateMetatileId: the PC's cell from the player's, by where the player faces. */
export function pcScreenOffset(facing: Direction): readonly [number, number] {
  if (facing === Direction.NORTH) return [0, -1];
  if (facing === Direction.WEST) return [-1, -1];
  if (facing === Direction.EAST) return [1, -1];
  return [0, 0];
}

/** Frames between flickers, and how many tile changes (on, off, on, off, on). */
const FLICKER_FRAMES = 6;
const FLICKER_CHANGES = 5;

/** AnimatePcTurnOn: the screen flickers on, `show(on)` drawing each change. */
export function beginPcScreenFlicker(gba: Gba, show: (on: boolean) => void): Task {
  let timer = 0;
  let changes = 0;
  return gba.tasks.create((task) => {
    if (timer === FLICKER_FRAMES) {
      show((changes & 1) === 0);
      timer = 0;
      if (++changes === FLICKER_CHANGES) gba.tasks.destroy(task);
    }
    timer++;
  }, 8);
}

/** What the overworld does next. */
export const enum PcChoice {
  None,
  Withdraw,
  Deposit,
  TurnOff,
}

/** The ITEM STORAGE entries; returning from WITHDRAW or DEPOSIT puts the cursor back on it. */
export const enum StorageEntry {
  Withdraw,
  Deposit,
  Cancel,
}

const TOP_MENU: WindowTemplate = { left: 1, top: 1, width: 13, height: 6, palette: 15, baseBlock: 0x008 };
const STORAGE_MENU: WindowTemplate = { left: 1, top: 1, width: 14, height: 6, palette: 15, baseBlock: 0x008 };
const TOP_ENTRIES: TextId[] = ["gText_ItemStorage", "gText_Mailbox", "gText_TurnOff"];
const STORAGE_ENTRIES: TextId[] = ["gText_WithdrawItem2", "gText_DepositItem2", "gFameCheckerText_Cancel"];
const STORAGE_DESCRIPTIONS: TextId[] = ["gText_TakeOutItemsFromThePC", "gText_StoreItemsInThePC", "gText_GoBackToThePreviousMenu"];
const enum TopEntry {
  ItemStorage,
  Mailbox,
  TurnOff,
}
/** Entries start after the "▶" (GetMenuCursorDimensionByFont), 2 pixels down, 16 apart. */
const CURSOR_WIDTH = 8;
const TOP_Y = 2;
const LINE_HEIGHT = 16;

const enum State {
  /** A message prints; `afterMessage` runs once it is done. */
  Message,
  Top,
  Storage,
}

export class PlayersPcMenu {
  private state = State.Message;
  private afterMessage: () => void = () => {};
  private menu: CursorMenu | null = null;

  /**
   * BedroomPC. `message` is the field's current message box (it is set up again on returning
   * from a screen); `storedCount` how many slots the PC holds.
   */
  constructor(
    private readonly flow: Flow,
    private readonly message: () => FieldMessage,
    private readonly storedCount: () => number,
  ) {
    this.returnToTop();
  }

  /** One frame: what the overworld must do now. */
  update(): PcChoice {
    switch (this.state) {
      case State.Message:
        if (!this.message().printing) this.afterMessage();
        return PcChoice.None;
      case State.Top:
        return this.topInput();
      case State.Storage:
        return this.storageInput();
    }
  }

  /** CB2_ReturnFromWithdrawMenu / CB2_ReturnFromDepositMenu: ITEM STORAGE drawn again, under the black screen. */
  resumeStorage(cursor: StorageEntry): void {
    this.openStorage(cursor);
  }

  /** The menu's window gone, when the PC stops early (a reconnect). */
  close(): void {
    this.closeMenu();
  }

  /** DisplayItemMessageOnField: prints at the text speed, then `next`. */
  private say(text: TextId, next: () => void): void {
    this.message().show(this.flow.assets.text(text), false);
    this.state = State.Message;
    this.afterMessage = next;
  }

  /** Task_ReturnToTopMenu. */
  private returnToTop(): void {
    this.say("gText_WhatWouldYouLikeToDo", () => this.openTop());
  }

  /** Task_DrawPlayerPcTopMenu. */
  private openTop(): void {
    this.menu = this.drawMenu(TOP_MENU, TOP_ENTRIES, 0);
    this.state = State.Top;
  }

  /** Task_CreateItemStorageSubmenu: the submenu, and its entry's description in the message box. */
  private openStorage(cursor: StorageEntry): void {
    this.menu = this.drawMenu(STORAGE_MENU, STORAGE_ENTRIES, cursor);
    this.describe();
    this.state = State.Storage;
  }

  private drawMenu(template: WindowTemplate, entries: TextId[], cursor: number): CursorMenu {
    const { flow } = this;
    const win = new Window(flow.gba.video.bgs[0], template);
    drawStdFrame(win);
    entries.forEach((entry, i) => printDefault(flow, win, FontId.Normal, flow.assets.text(entry), CURSOR_WIDTH, TOP_Y + i * LINE_HEIGHT));
    return new CursorMenu(flow, win, FontId.Normal, 0, TOP_Y, LINE_HEIGHT, entries.length, cursor);
  }

  /** The menu's window and frame gone (ClearStdWindowAndFrameToTransparent). */
  private closeMenu(): void {
    if (this.menu) clearStdWindowAndFrameToTransparent(this.menu.win);
    this.menu = null;
  }

  /** PrintStringOnWindow0WithDialogueFrame: at once. */
  private describe(): void {
    this.message().show(this.flow.assets.text(STORAGE_DESCRIPTIONS[this.menu!.cursorPos]), false, FontId.Normal, true);
  }

  /** Task_TopMenuHandleInput. */
  private topInput(): PcChoice {
    const chosen = this.menu!.processInput(false);
    if (chosen === MENU_NOTHING_CHOSEN) return PcChoice.None;
    if (chosen === MENU_B_PRESSED) this.flow.play("se_select");
    this.closeMenu();
    if (chosen === TopEntry.ItemStorage) this.openStorage(StorageEntry.Withdraw);
    else if (chosen === TopEntry.Mailbox) this.say("gText_TheresNoMailHere", () => this.returnToTop());
    else return PcChoice.TurnOff;
    return PcChoice.None;
  }

  /** Task_TopMenu_ItemStorageSubmenu_HandleInput: no wrapping, the description follows the cursor. */
  private storageInput(): PcChoice {
    const { flow } = this;
    const { input } = flow.gba;
    const menu = this.menu!;
    if (input.isRepeated(Button.Up)) {
      if (menu.cursorPos === StorageEntry.Withdraw) return PcChoice.None;
      flow.play("se_select");
      menu.moveCursor(-1);
      this.describe();
      return PcChoice.None;
    }
    if (input.isRepeated(Button.Down)) {
      if (menu.cursorPos === StorageEntry.Cancel) return PcChoice.None;
      flow.play("se_select");
      menu.moveCursor(1);
      this.describe();
      return PcChoice.None;
    }
    let chosen: StorageEntry;
    if (input.isPressed(Button.A)) chosen = menu.cursorPos;
    else if (input.isPressed(Button.B)) chosen = StorageEntry.Cancel;
    else return PcChoice.None;
    flow.play("se_select");
    if (chosen === StorageEntry.Deposit) return PcChoice.Deposit;
    if (chosen === StorageEntry.Withdraw && this.storedCount() > 0) return PcChoice.Withdraw;
    this.closeMenu();
    if (chosen === StorageEntry.Withdraw) this.say("gText_ThereAreNoItems", () => this.openStorage(StorageEntry.Withdraw));
    else this.returnToTop();
    return PcChoice.None;
  }
}
