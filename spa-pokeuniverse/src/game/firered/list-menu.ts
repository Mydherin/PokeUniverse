// The scrolling list menus (list_menu.c): rows printed in a window, the "▶" cursor, and a
// view of `maxShowed` rows that scrolls as the cursor nears its edges. The bag uses it, and so
// will the PC's item storage and the shops. Rows can't be headers: no list we use has any.

import { Button } from "../gba/input";
import type { FontId, Text, Window } from "../gba/text";
import type { Flow } from "./flow";

export const LIST_NOTHING_CHOSEN = -1;
export const LIST_CANCEL = -2;

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
  cursorX: number;
  upTextY: number;
  itemVerticalPadding: number;
  letterSpacing: number;
  /** [fill, text, shadow]. */
  colors: readonly [number, number, number];
  /** The selected row changed (on init too). */
  onMove?: (id: number, onInit: boolean) => void;
  /** Before each row's label is printed, at the row's y. */
  onPrint?: (id: number, y: number) => void;
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
    if (input.isRepeated(Button.Up)) this.changeSelection(false);
    else if (input.isRepeated(Button.Down)) this.changeSelection(true);
    return LIST_NOTHING_CHOSEN;
  }

  /** ListMenuChangeSelection by one row: the cursor moves inside the view, or the view scrolls. */
  private changeSelection(down: boolean): void {
    const oldRow = this.row;
    const change = this.step(down);
    if (change === 0) return;
    this.eraseCursor(oldRow);
    if (change === 2) this.scrollView(down);
    this.drawCursor();
    this.t.onMove?.(this.selectedId, false);
    this.t.win.copyToVram();
  }

  /**
   * ListMenuUpdateSelectedRowIndexAndScrollOffset: the cursor moves toward the view's middle
   * row, then the view scrolls; at either end of the list the cursor goes on to the last row.
   * 0: nothing moved, 1: the cursor moved, 2: the view scrolled.
   */
  private step(down: boolean): number {
    const { maxShowed } = this;
    const half = (maxShowed >> 1) + (maxShowed & 1);
    if (!down) {
      const middle = maxShowed === 1 ? 0 : maxShowed - half - 1;
      if (this.scroll === 0 || this.row > middle) {
        if (this.row === 0) return 0;
        this.row--;
        return 1;
      }
      this.scroll--;
      this.row = middle;
      return 2;
    }
    const middle = maxShowed === 1 ? 0 : half;
    if (this.scroll === this.t.items.length - maxShowed || this.row < middle) {
      if (this.row >= maxShowed - 1) return 0;
      this.row++;
      return 1;
    }
    this.scroll++;
    this.row = middle;
    return 2;
  }

  /** ListMenuScroll by one row: the window's pixels move and the new row is printed. */
  private scrollView(down: boolean): void {
    const { win, colors, upTextY } = this.t;
    const { rowHeight, maxShowed } = this;
    if (maxShowed <= 1) {
      win.fill(colors[0]);
      this.printRows(this.scroll, 0, maxShowed);
      return;
    }
    if (!down) {
      win.scrollDown(rowHeight, colors[0]);
      this.printRows(this.scroll, 0, 1);
      const y = maxShowed * rowHeight + upTextY;
      win.fillRect(colors[0], 0, y, win.stride, win.rows - y);
    } else {
      win.scroll(rowHeight, colors[0]);
      this.printRows(this.scroll + maxShowed - 1, maxShowed - 1, 1);
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
      t.onPrint?.(item.id, y);
      t.win.print(font, t.itemX, y, t.colors, item.label, t.letterSpacing, 0);
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
