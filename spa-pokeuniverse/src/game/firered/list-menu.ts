// The scrolling list menus (list_menu.c): rows printed in a window, the "▶" cursor, and a
// view of `maxShowed` rows that scrolls as the cursor nears its edges. The bag and the PC's
// WITHDRAW ITEM screen use it, and so will the shops. Header rows (LIST_HEADER) print at
// `headerX` and the cursor skips them; a list can also jump a view at a time (scrollMultiple).

import { Button } from "../gba/input";
import type { FontId, Text, Window } from "../gba/text";
import type { Flow } from "./flow";

export const LIST_NOTHING_CHOSEN = -1;
export const LIST_CANCEL = -2;
/** A row that only titles the rows under it: never selected. */
export const LIST_HEADER = -3;

/** LIST_MULTIPLE_SCROLL_*: what jumps a whole view. */
export const enum ListScrollMultiple {
  None,
  Dpad,
  LR,
}

export interface ListMenuItem {
  label: Text;
  /** What choosing the row returns. */
  id: number;
}

export interface ListMenuTemplate {
  win: Window;
  items: readonly ListMenuItem[];
  maxShowed: number;
  font: FontId;
  itemX: number;
  /** Where header rows print; itemX when unset. */
  headerX?: number;
  cursorX: number;
  upTextY: number;
  itemVerticalPadding: number;
  letterSpacing: number;
  /** [fill, text, shadow]. */
  colors: readonly [number, number, number];
  /** The selected row changed (on init too). */
  onMove?: (id: number, onInit: boolean) => void;
  /** Before each row's label is printed, at the row's y; may return its colors (ListMenuOverrideSetColors). */
  onPrint?: (id: number, y: number) => readonly [number, number, number] | void;
  /** LEFT/RIGHT (or L/R) move a view's worth of rows. */
  scrollMultiple?: ListScrollMultiple;
}

/** The view's position: the first row shown (`scroll`) and the selected row in the view (`row`). */
export interface ListPosition {
  scroll: number;
  row: number;
}

export class ListMenu {
  private readonly maxShowed: number;
  private readonly rowHeight: number;
  scroll: number;
  row: number;
  /** LISTFIELD_CURSORKIND 1: the list draws no cursor (its owner draws its own). */
  cursorHidden = false;

  /** ListMenuInit: the rows from `at`, the cursor, then the selection callback; the window shown. */
  constructor(
    private readonly flow: Flow,
    private readonly t: ListMenuTemplate,
    at: ListPosition,
  ) {
    this.maxShowed = Math.min(t.maxShowed, t.items.length);
    this.rowHeight = flow.fonts[t.font].maxLetterHeight + t.itemVerticalPadding;
    this.scroll = at.scroll;
    this.row = at.row;
    t.win.fill(t.colors[0]);
    this.printRows(this.scroll, 0, this.maxShowed);
    this.drawCursor();
    this.t.onMove?.(this.selectedId, true);
    t.win.putTilemap();
    t.win.copyToVram();
  }

  get position(): ListPosition {
    return { scroll: this.scroll, row: this.row };
  }

  get selectedId(): number {
    return this.t.items[this.scroll + this.row].id;
  }

  /** ListMenuGetYCoordForPrintingArrowCursor. */
  get cursorY(): number {
    return this.row * this.rowHeight + this.t.upTextY;
  }

  /** ListMenu_ProcessInput: the chosen row's id, LIST_CANCEL (B) or LIST_NOTHING_CHOSEN. */
  processInput(): number {
    const { input } = this.flow.gba;
    if (input.isPressed(Button.A)) return this.selectedId;
    if (input.isPressed(Button.B)) return LIST_CANCEL;
    if (input.isRepeated(Button.Up)) this.changeSelection(false, 1);
    else if (input.isRepeated(Button.Down)) this.changeSelection(true, 1);
    else {
      const multiple = this.t.scrollMultiple ?? ListScrollMultiple.None;
      const [back, forward] = multiple === ListScrollMultiple.Dpad ? [Button.Left, Button.Right] : multiple === ListScrollMultiple.LR ? [Button.L, Button.R] : [0, 0];
      if (back && input.isRepeated(back)) this.changeSelection(false, this.t.maxShowed);
      else if (forward && input.isRepeated(forward)) this.changeSelection(true, this.t.maxShowed);
    }
    return LIST_NOTHING_CHOSEN;
  }

  private isHeader(index: number): boolean {
    return this.t.items[index]?.id === LIST_HEADER;
  }

  /**
   * ListMenuChangeSelection by `count` rows, over header rows: the cursor moves inside the
   * view, or the view scrolls (by the rows it scrolled).
   */
  private changeSelection(down: boolean, count: number): void {
    const oldRow = this.row;
    let change = 0;
    let scrolled = 0;
    for (let i = 0; i < count; i++) {
      for (;;) {
        const r = this.step(down);
        change |= r;
        if (r !== 2) break;
        scrolled++;
        if (!this.isHeader(this.scroll + this.row)) break;
      }
    }
    if (change === 0) return;
    this.eraseCursor(oldRow);
    if (change & 2) this.scrollView(down, scrolled);
    this.drawCursor();
    this.t.onMove?.(this.selectedId, false);
    this.t.win.copyToVram();
  }

  /**
   * ListMenuUpdateSelectedRowIndexAndScrollOffset: the cursor moves toward the view's middle
   * row (skipping headers), then the view scrolls; at either end of the list the cursor goes on
   * to the last row. 0: nothing moved, 1: the cursor moved, 2: the view scrolled.
   */
  private step(down: boolean): number {
    const { maxShowed } = this;
    const half = (maxShowed >> 1) + (maxShowed & 1);
    let row = this.row;
    if (!down) {
      const middle = maxShowed === 1 ? 0 : maxShowed - half - 1;
      const floor = this.scroll === 0 ? 0 : middle;
      while (row > floor) {
        row--;
        if (!this.isHeader(this.scroll + row)) {
          this.row = row;
          return 1;
        }
      }
      if (this.scroll === 0) return 0;
      this.scroll--;
      this.row = middle;
      return 2;
    }
    const middle = maxShowed === 1 ? 0 : half;
    const atEnd = this.scroll === this.t.items.length - maxShowed;
    const ceiling = atEnd ? maxShowed - 1 : middle;
    while (row < ceiling) {
      row++;
      if (!this.isHeader(this.scroll + row)) {
        this.row = row;
        return 1;
      }
    }
    if (atEnd) return 0;
    this.scroll++;
    this.row = middle;
    return 2;
  }

  /** ListMenuScroll by `count` rows: the window's pixels move and the new rows are printed. */
  private scrollView(down: boolean, count: number): void {
    const { win, colors, upTextY } = this.t;
    const { rowHeight, maxShowed } = this;
    if (count >= maxShowed) {
      win.fill(colors[0]);
      this.printRows(this.scroll, 0, maxShowed);
      return;
    }
    if (!down) {
      win.scrollDown(count * rowHeight, colors[0]);
      this.printRows(this.scroll, 0, count);
      const y = maxShowed * rowHeight + upTextY;
      win.fillRect(colors[0], 0, y, win.stride, win.rows - y);
    } else {
      win.scroll(count * rowHeight, colors[0]);
      this.printRows(this.scroll + maxShowed - count, maxShowed - count, count);
      win.fillRect(colors[0], 0, 0, win.stride, upTextY);
    }
  }

  /** ListMenuPrintEntries. */
  private printRows(start: number, at: number, count: number): void {
    const { t } = this;
    const font = this.flow.fonts[t.font];
    for (let i = 0; i < count; i++) {
      const item = t.items[start + i];
      const y = (at + i) * this.rowHeight + t.upTextY;
      const colors = t.onPrint?.(item.id, y) ?? t.colors;
      const x = item.id === LIST_HEADER ? (t.headerX ?? t.itemX) : t.itemX;
      t.win.print(font, x, y, colors, item.label, t.letterSpacing, 0);
    }
  }

  private drawCursor(): void {
    const { t } = this;
    if (this.cursorHidden) return;
    t.win.print(this.flow.fonts[t.font], t.cursorX, this.cursorY, t.colors, this.flow.assets.text("gText_SelectorArrow2"), t.letterSpacing, 0);
  }

  private eraseCursor(row: number): void {
    const { t } = this;
    if (this.cursorHidden) return;
    t.win.fillRect(t.colors[0], t.cursorX, row * this.rowHeight + t.upTextY, 8, this.flow.fonts[t.font].maxLetterHeight);
  }
}

/**
 * A saved list position fitted to what the list holds now (`total` rows, CANCEL included), as
 * the bag (PocketCalculateInitialCursorPosAndItemsAbove, UpdatePocketScrollPositions) and the
 * PC (ItemPc_SetCursorPosition, ItemPc_SetScrollPosition) do before showing it again.
 */
export function fitListPosition(pos: ListPosition, total: number, maxShowed: number): void {
  if (pos.scroll !== 0 && pos.scroll + maxShowed > total) pos.scroll = total - maxShowed;
  if (pos.scroll + pos.row >= total) pos.row = total < 2 ? 0 : total - 1;
  if (pos.row > 3)
    for (let j = 0; j <= pos.row - 3; pos.row--, pos.scroll++, j++) if (pos.scroll + maxShowed === total) break;
  pos.row = Math.min(pos.row, maxShowed - 1);
}

/**
 * ExecuteMoveItemInPocket and AbortMovingItemInPocket (and the PC's): the cursor stays on the
 * moved item, one row up when it went down the list.
 */
export function afterMove(pos: ListPosition, from: number, to: number): void {
  if (from >= to) return;
  if (pos.row > 0) pos.row--;
  else if (pos.scroll > 0) pos.scroll--;
}
