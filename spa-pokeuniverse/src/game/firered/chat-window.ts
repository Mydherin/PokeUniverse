// The zone's chat drawn in Union Room chat's style (phase-8 D15, D23, D24): every log is a
// canvas printed with FireRed's font at an integer scale, a color per player from
// graphics/union_room_chat/messages.pal, a panel framed like its panel.png. Beside or below the
// GBA screen on PC (input with T), a ticker, a button and a sheet on touch screens.
// Hidden during battles and full-screen menus; lines that come meanwhile are in the log after.

import type { WorldLink } from "../../realtime/connection";
import { h } from "../../ui/dom";
import { KeyboardTracker } from "../../ui/keyboard";
import type { Input } from "../gba/input";
import { fitScreen } from "../screen";
import { encodeText, type Charmap, type Font } from "../gba/text";
import { cleanLine, filterInput, MAX_LENGTH, type ChatLine } from "../world/chat";
import { Conversations, type Conversation } from "../world/conversations";
import type { SocialState } from "../world/social";
import type { Text } from "../gba/text";
import type { TextId } from "./manifest";
import { LineActions, Notice, socialText } from "./social-ui";

/** Palette indexes drawn on the logs. */
const BG = 1;
const FRAME = 10;
const FRAME_DARK = 11;
const SHADOW = 12;
const SELECTED = 13;
/** The scroll bar's track (messages.pal's light grey); its thumb is the frame's blue. */
const TRACK = 3;
const PALETTE: Record<number, [number, number, number]> = {
  // messages.pal: the window's fill, then text and shadow per player (PrintTextOnWin0Colorized).
  1: [246, 246, 255],
  2: [0, 0, 0],
  3: [205, 205, 230],
  4: [49, 213, 0],
  5: [222, 230, 213],
  6: [0, 0, 255],
  7: [205, 213, 222],
  8: [255, 0, 0],
  9: [222, 213, 197],
  // panel.png: the blue frame, its dark edge and the grey shadow.
  10: [41, 131, 222],
  11: [0, 82, 172],
  12: [115, 115, 115],
  13: [230, 230, 255],
};
/** The own lines' color; everyone else gets one of the other three by ID. */
const OWN_COLOR = 0;
/** A row of text (sWork->curLine * 15) and the colon after the name (CLEAR_TO 42). */
const ROW = 15;
const COLON_X = 42;
/** The frame on each side (2 blue, 1 dark) and the shadow at the right and the bottom. */
const BORDER = 3;
const PAD = 2;
/** The scroll bar inside the frame's right edge, and the gap before it. */
const BAR = 5;
const BAR_GAP = 1;
/** Size of a GBA pixel in CSS pixels, rounded to whole device pixels. */
const PC_SCALE = 2;
const PHONE_SCALE = 1.4;
/** The PC panel's least size in GBA pixels: Union Room chat's 21-tile window wide, 5 rows tall. */
const PANEL_WIDTH = 21 * 8 + 2 * (BORDER + PAD);
const PANEL_HEIGHT = 5 * ROW + 2 * (BORDER + PAD) + 34;
const TICKER_ROWS = 2;
const TICKER_FADE_MS = 5000;
const LONG_PRESS_MS = 500;
/** The counter shows from this many characters (D22). */
const COUNTER_FROM = 54;
const HINT_MS = 2500;
/** Rows of the log kept while composing: at least 3 in portrait, 2-3 in landscape (D22). */
const COMPOSE_ROWS = 3;
/** A swipe down this far closes the sheet (D23). */
const SWIPE_CLOSE = 60;
/** The textarea grows to this many lines, then scrolls (D22). */
const INPUT_LINES = 3;

function colorsOf(line: ChatLine): [number, number, number] {
  const c = line.own ? OWN_COLOR : 1 + Number(line.id % 3n);
  return [0, c * 2 + 2, c * 2 + 3];
}

function deviceScale(target: number): number {
  const dpr = window.devicePixelRatio || 1;
  return Math.max(1, Math.round(target * dpr)) / dpr;
}

/** One printed row of a line: the name and colon on its first row, the text wrapped after. */
interface Row {
  line: ChatLine;
  first: boolean;
  /** Glyph IDs; COLON is the colon at x 42 (CLEAR_TO 42, then ':'). */
  glyphs: number[];
}
const COLON = -1;

/** A log canvas: rows from the newest at the bottom up, scrolled by whole rows. */
class LogView {
  readonly el = h("canvas", { class: "chat-log block" }) as HTMLCanvasElement;
  /** Rows scrolled up from the newest. */
  scroll = 0;
  selected: bigint | null = null;
  private rows: Row[] = [];
  private width = 0;
  private height = 0;
  private scale = 1;
  private pixels = new Uint8Array(0);

  constructor(
    private readonly font: Font,
    private readonly charmap: Charmap,
    private readonly target: number,
    /** Rows shown at most (the ticker's 2); 0: as many as fit. */
    private readonly maxRows = 0,
  ) {}

  /** Rows wrapped for a bar: only when they overflow the log (user 2026-11-11); never on the ticker's 2 rows. */
  private overflow = false;

  /** Logs that scroll show a bar while their rows overflow. */
  get hasBar(): boolean {
    return this.maxRows === 0 && this.overflow;
  }

  /** The bar's track in canvas pixels, and its thumb: as tall as the rows shown, at the bottom for the newest. */
  private bar(): { x: number; top: number; height: number; thumbTop: number; thumbHeight: number; max: number } {
    const x = this.width - BORDER - 1 - BAR;
    const top = BORDER + 1;
    const height = Math.max(0, this.height - BORDER - 1 - top);
    const shown = this.visibleRows;
    const total = Math.max(this.rows.length, shown, 1);
    const max = Math.max(0, this.rows.length - shown);
    const thumbHeight = Math.min(height, Math.max(6, Math.round((height * shown) / total)));
    const thumbTop = top + (max ? Math.round((height - thumbHeight) * (1 - this.scroll / max)) : 0);
    return { x, top, height, thumbTop, thumbHeight, max };
  }

  /** Whether a point (CSS pixels from the canvas corner) is on the bar. */
  onBar(x: number): boolean {
    return this.hasBar && x / this.scale >= this.bar().x - 1;
  }

  /** The thumb's height in canvas pixels. */
  get thumbHeight(): number {
    return this.bar().thumbHeight;
  }

  /** Where on the thumb a point is (canvas pixels from its top), or null off the thumb. */
  thumbOffset(y: number): number | null {
    const { thumbTop, thumbHeight } = this.bar();
    const py = y / this.scale;
    return py >= thumbTop && py < thumbTop + thumbHeight ? py - thumbTop : null;
  }

  /** Drags the thumb so `offset` (canvas pixels into it) sits under `y` (CSS pixels). */
  dragThumb(y: number, offset: number): void {
    const { top, height, thumbHeight, max } = this.bar();
    const room = height - thumbHeight;
    if (!max || room <= 0) return;
    const at = Math.max(0, Math.min(1, (y / this.scale - offset - top) / room));
    this.scroll = Math.round(max * (1 - at));
    this.draw();
  }

  /** Fits the canvas in a box of CSS pixels. */
  resize(cssWidth: number, cssHeight: number): void {
    this.scale = deviceScale(this.target);
    this.width = Math.max(0, Math.floor(cssWidth / this.scale));
    const rows = this.maxRows || Math.floor((cssHeight / this.scale - 2 * (BORDER + PAD)) / ROW);
    this.height = Math.max(0, rows) * ROW + 2 * (BORDER + PAD);
    this.el.width = this.width;
    this.el.height = this.height;
    this.el.style.width = `${this.width * this.scale}px`;
    this.el.style.height = `${this.height * this.scale}px`;
  }

  /** One GBA pixel in CSS pixels. */
  get pixel(): number {
    return this.scale;
  }

  get cssHeight(): number {
    return (this.maxRows * ROW + 2 * (BORDER + PAD)) * deviceScale(this.target);
  }

  private get visibleRows(): number {
    return Math.floor((this.height - 2 * (BORDER + PAD)) / ROW);
  }

  /** The rows of `lines` wrapped to the canvas; again with room for the bar if they overflow. */
  layout(lines: readonly ChatLine[]): void {
    this.overflow = false;
    this.wrap(lines);
    if (this.maxRows === 0 && this.rows.length > this.visibleRows) {
      this.overflow = true;
      this.wrap(lines);
    }
    this.scroll = Math.max(0, Math.min(this.scroll, this.rows.length - this.visibleRows));
  }

  /** The name, the colon at 42, the words after. */
  private wrap(lines: readonly ChatLine[]): void {
    const right = this.width - BORDER - PAD - 2 - (this.hasBar ? BAR + BAR_GAP : 0);
    const left = BORDER + PAD;
    const space = this.charmap.encode[" "];
    const advance = (g: number) => this.font.glyphWidth(g) + this.font.letterSpacing;
    const textX = left + COLON_X + advance(this.charmap.encode[":"]);
    this.rows = [];
    for (const line of lines) {
      let row: Row = { line, first: true, glyphs: [...encodeText(this.charmap, line.name).slice(0, -1), COLON] };
      let x = textX;
      const wrap = () => {
        this.rows.push(row);
        row = { line, first: false, glyphs: [] };
        x = textX;
      };
      line.text.split(" ").forEach((word, i) => {
        const glyphs = encodeText(this.charmap, (i ? " " : "") + word).slice(0, -1);
        const width = glyphs.reduce((n, g) => n + advance(g), 0);
        // A word that doesn't fit goes to the next row; one longer than a row is cut.
        if (x + width > right && x > textX) {
          wrap();
          if (glyphs[0] === space) glyphs.shift();
        }
        for (const g of glyphs) {
          if (x + advance(g) > right && x > textX) wrap();
          row.glyphs.push(g);
          x += advance(g);
        }
      });
      this.rows.push(row);
    }
  }

  scrollBy(rows: number): void {
    const max = Math.max(0, this.rows.length - this.visibleRows);
    this.scroll = Math.max(0, Math.min(max, this.scroll + rows));
    this.draw();
  }

  /** The line at a point on the canvas (CSS pixels from its corner) and whether it's on the name. */
  hit(x: number, y: number): { line: ChatLine; name: boolean } | null {
    const px = x / this.scale;
    const index = this.rowIndexAt(y / this.scale);
    const row = index === null ? null : this.rows[index];
    if (!row) return null;
    return { line: row.line, name: row.first && px < BORDER + PAD + COLON_X };
  }

  private rowIndexAt(py: number): number | null {
    const shown = this.visibleRows;
    const last = this.rows.length - this.scroll;
    const first = Math.max(0, last - shown);
    // Bottom-aligned: the newest row sits on the last line.
    const top = BORDER + PAD + (shown - (last - first)) * ROW;
    const i = Math.floor((py - top) / ROW);
    return i < 0 || first + i >= last ? null : first + i;
  }

  draw(): void {
    const { width, height } = this;
    if (!width || !height) return;
    if (this.pixels.length !== width * height) this.pixels = new Uint8Array(width * height);
    const px = this.pixels;
    px.fill(0);
    // The panel: white inside a blue frame with a dark edge, a grey shadow at right and bottom.
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const edge = Math.min(x, y, width - 1 - x, height - 1 - y);
        let c = edge < 2 ? FRAME : edge < BORDER ? FRAME_DARK : BG;
        if ((x === width - 1 || y === height - 1) && edge === 0) c = SHADOW;
        px[y * width + x] = c;
      }
    }
    const shown = this.visibleRows;
    const last = this.rows.length - this.scroll;
    const first = Math.max(0, last - shown);
    let y = BORDER + PAD + (shown - (last - first)) * ROW;
    const colon = this.charmap.encode[":"];
    for (let i = first; i < last; i++, y += ROW) {
      const row = this.rows[i];
      const colors = colorsOf(row.line);
      if (this.selected !== null && row.line.id === this.selected) {
        for (let yy = y; yy < y + ROW && yy < height - BORDER; yy++) px.fill(SELECTED, yy * width + BORDER, (yy + 1) * width - BORDER);
      }
      let x = row.first ? BORDER + PAD : BORDER + PAD + COLON_X + this.font.glyphWidth(colon) + this.font.letterSpacing;
      for (const g of row.glyphs) {
        const glyph = g === COLON ? colon : g;
        if (g === COLON) x = BORDER + PAD + COLON_X;
        this.font.drawGlyph(glyph, px, width, height - BORDER, x, y, colors);
        x += this.font.glyphWidth(glyph) + this.font.letterSpacing;
      }
    }
    if (this.hasBar) {
      // The track, then the thumb: the frame's blue with its dark edge.
      const b = this.bar();
      for (let yy = b.top; yy < b.top + b.height; yy++) {
        const inThumb = yy >= b.thumbTop && yy < b.thumbTop + b.thumbHeight;
        const edgeY = yy === b.thumbTop || yy === b.thumbTop + b.thumbHeight - 1;
        for (let xx = b.x; xx < b.x + BAR; xx++) {
          const edge = edgeY || xx === b.x || xx === b.x + BAR - 1;
          px[yy * width + xx] = inThumb ? (edge ? FRAME_DARK : FRAME) : TRACK;
        }
      }
    }
    const ctx = this.el.getContext("2d")!;
    const image = ctx.createImageData(width, height);
    for (let i = 0; i < px.length; i++) {
      const c = PALETTE[px[i]];
      if (!c) continue;
      image.data.set(c, i * 4);
      image.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
  }
}

type Field = HTMLInputElement | HTMLTextAreaElement;

/**
 * The text field: the font's characters only, 64 at most; Enter sends, Esc closes. On phones a
 * textarea (D22): line breaks become spaces, `onEdit` gets whether something was dropped.
 */
function composer(send: () => void, close: () => void, multiline = false, onEdit: (dropped: boolean) => void = () => {}): Field {
  const attrs = { class: "chat-input min-w-0 flex-1", maxlength: String(MAX_LENGTH), enterkeyhint: "send", autocomplete: "off", "aria-label": "Chat message" };
  const input = (multiline ? h("textarea", { ...attrs, rows: "1", autocorrect: "on", spellcheck: "true" }) : h("input", { ...attrs, type: "text" })) as Field;
  input.addEventListener("input", () => {
    const raw = multiline ? input.value.replace(/\s*[\r\n]+\s*/g, " ") : input.value;
    const { text, dropped } = filterInput(raw);
    if (text !== input.value) {
      const caret = Math.min(input.selectionStart ?? text.length, text.length);
      input.value = text;
      input.setSelectionRange(caret, caret);
    }
    onEdit(dropped && raw !== text);
  });
  // The keyboard's send key: no line break, the line goes (some keyboards send only beforeinput).
  const el: HTMLElement = input;
  el.addEventListener("beforeinput", (e) => {
    if (e.inputType !== "insertLineBreak" && e.inputType !== "insertParagraph") return;
    e.preventDefault();
    send();
  });
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing) {
      e.preventDefault();
      send();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  });
  return input;
}

/** Where the chat goes: the game's layout, its screen cell and the touch controls' right group. */
export interface ChatSlots {
  layout: HTMLElement;
  right: HTMLElement;
}

/** The sheet's layout while the keyboard is up (D22). */
type Compose = "portrait" | "landscape" | null;
type Tab = "chats" | "friends";
/** One pane: the list (or FRIENDS) or a thread (phase-9 D13, D14). */
type View = "list" | "thread";

/** The panel shows two panes from this width in CSS pixels (phase-9 D13). */
const TWO_PANES = 480;
/** A swipe right this far from the thread's left area goes back (phase-9 D14). */
const SWIPE_BACK = 60;
/** The screen's edge is the browser's back gesture; the thread's starts after it. */
const EDGE = 24;

/** The panel's or the sheet's parts that both build the same way. */
interface Panes {
  tabs: HTMLElement;
  friendsBadge: HTMLElement;
  list: HTMLElement;
  friends: HTMLElement;
  body: HTMLElement;
  back: HTMLButtonElement;
  title: HTMLElement;
}

type SheetState = { chatSheet?: boolean; thread?: string } | null;

export class ChatWindow {
  /** The social panel's conversations; the zone's chat is the first (phase-9 M3). */
  readonly conversations = new Conversations();
  /** Phase 9 opens the line actions; Phase 8 only keeps the chosen player. */
  onSelect: (id: bigint) => void = () => {};
  /** A row's LEAVE or REMOVE FRIEND (M4, M6 fill it). */
  onConversationAction: (c: Conversation, action: "leave" | "remove") => void = () => {};
  private shownNow = false;
  /** PC: the input is open; phones: the sheet is. */
  private isOpen = false;
  private tab: Tab = "chats";
  private view: View = "thread";
  private twoPanes = false;
  private readonly touch = window.matchMedia("(pointer: coarse)");
  private readonly panel: HTMLElement;
  private readonly pc: Panes;
  private readonly panelLog: LogView;
  private readonly panelInput: Field;
  private readonly panelCompose: HTMLElement;
  private readonly panelHint: HTMLElement;
  private inWorld = false;
  private readonly ticker: HTMLElement;
  private readonly tickerLabel: HTMLElement;
  private readonly tickerLog: LogView;
  private tickerTimer: number | undefined;
  private readonly button: HTMLButtonElement;
  private readonly badge: HTMLElement;
  private readonly sheet: HTMLElement;
  private readonly phone: Panes;
  private readonly sheetHead: HTMLElement;
  private readonly sheetThread: HTMLElement;
  private readonly sheetLog: LogView;
  private readonly sheetInput: Field;
  private readonly sheetLogBox: HTMLElement;
  private readonly counter: HTMLElement;
  private readonly hint: HTMLElement;
  private hintTimer: number | undefined;
  private readonly keyboard: KeyboardTracker;
  private readonly offKeyboard: () => void;
  private readonly portrait = window.matchMedia("(orientation: portrait)");
  private compose: Compose = null;
  private readonly observer: ResizeObserver;
  private readonly offChange: () => void;
  private readonly actions: LineActions;
  private readonly panelNotice = new Notice();
  private readonly tickerNotice = new Notice();
  /** The conversation the PC toast opens. */
  private toastFor: Conversation | null = null;
  private rowMenu: HTMLElement | null = null;
  private readonly rowEls = new Map<HTMLElement, Map<string, HTMLElement>>();
  private readonly offSocial: (() => void)[];

  constructor(
    private readonly slots: ChatSlots,
    font: Font,
    charmap: Charmap,
    private readonly link: WorldLink,
    private readonly input: Input,
    private readonly social: SocialState,
    text: (id: TextId) => Text,
  ) {
    this.actions = new LineActions(social, charmap, text, { message: (id) => this.openWith(id), notice: (t) => this.notice(t) });
    // PC: the panel beside or below the screen; the list and the thread side by side when wide.
    this.panelLog = new LogView(font, charmap, PC_SCALE);
    this.panelInput = composer(() => this.send(this.panelInput), () => this.escape());
    this.panelCompose = h("div", { class: "chat-compose", hidden: true }, this.panelInput);
    this.panelHint = h("p", { class: "chat-hint" }, "T to chat");
    this.pc = this.panes();
    const panelThread = h(
      "div",
      { class: "social-thread" },
      h("div", { class: "social-thread-head" }, this.pc.back, this.pc.title),
      h("div", { class: "chat-log-box" }, this.panelLog.el),
      this.panelCompose,
      this.panelHint,
    );
    this.pc.body.append(this.pc.list, this.pc.friends, panelThread);
    this.panel = h("section", { class: "chat-panel", "aria-label": "Chat", hidden: true }, this.pc.tabs, this.panelNotice.el, this.pc.body);
    this.panelNotice.el.addEventListener("click", () => {
      if (this.toastFor) this.choose(this.toastFor);
    });
    // Touch: the ticker, the button and the sheet.
    this.tickerLog = new LogView(font, charmap, PHONE_SCALE, TICKER_ROWS);
    this.tickerLabel = h("span", { class: "chat-ticker-label" });
    this.ticker = h("button", { type: "button", class: "chat-ticker", "aria-label": "Open chat", tabindex: "-1", "data-fade": "true" }, h("div", { class: "chat-log-box" }, this.tickerLabel, this.tickerNotice.el, this.tickerLog.el));
    this.badge = h("span", { class: "chat-badge", hidden: true });
    this.button = h("button", { type: "button", class: "chat-button", "aria-label": "Chat", tabindex: "-1" }, bubble(), this.badge) as HTMLButtonElement;
    this.sheetLog = new LogView(font, charmap, PHONE_SCALE);
    this.sheetInput = composer(() => this.send(this.sheetInput), () => this.close(), true, (dropped) => this.edited(dropped));
    const close = h("button", { type: "button", class: "chat-close", "aria-label": "Close chat" }, "×");
    const sendButton = h("button", { type: "button", class: "chat-send", "aria-label": "Send" }, "SEND");
    this.sheetLogBox = h("div", { class: "chat-log-box" }, this.sheetLog.el);
    this.hint = h("span", { class: "chat-status-hint", "aria-live": "polite" });
    this.counter = h("span", { class: "chat-counter" });
    this.phone = this.panes();
    this.sheetThread = h("div", { class: "social-thread" }, this.sheetLogBox, h("div", { class: "chat-compose" }, this.sheetInput, sendButton), h("div", { class: "chat-status" }, this.hint, this.counter));
    this.phone.body.append(this.phone.list, this.phone.friends, this.sheetThread);
    this.sheetHead = h("div", { class: "chat-sheet-head" }, this.phone.back, this.phone.title, this.phone.tabs, close);
    this.sheet = h("section", { class: "chat-sheet", "aria-label": "Chat", hidden: true }, this.sheetHead, this.phone.body);
    // Typing: the own player stops and nothing stays held (ui.md#mobile-keyboard).
    this.sheetInput.addEventListener("focus", () => {
      this.input.suspend(true);
      this.keyboard.refresh();
    });
    this.sheetInput.addEventListener("blur", () => {
      this.input.suspend(false);
      this.keyboard.refresh();
    });
    this.swipeDown();
    this.swipeBack();
    // Pressing ×, SEND or back keeps the field focused: the keyboard going down first would move them.
    for (const b of [close, sendButton, this.phone.back]) b.addEventListener("pointerdown", (e) => e.preventDefault());
    close.addEventListener("click", () => this.close());
    sendButton.addEventListener("click", () => this.send(this.sheetInput));
    this.phone.back.addEventListener("click", () => this.back());
    this.pc.back.addEventListener("click", () => this.back());
    this.ticker.addEventListener("click", () => this.open());
    this.button.addEventListener("click", () => this.open());
    for (const view of [this.panelLog, this.sheetLog]) this.hooks(view);
    this.hooks(this.tickerLog, false);
    this.panelLog.el.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.panelLog.scrollBy(e.deltaY < 0 ? 1 : -1);
    });

    slots.layout.append(this.panel, this.ticker, this.sheet);
    const start = slots.right.lastElementChild;
    slots.right.insertBefore(this.button, start);
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("popstate", this.onPopState);
    window.addEventListener("pointerdown", this.onOutside, true);
    this.keyboard = new KeyboardTracker(slots.layout);
    this.offKeyboard = this.keyboard.onChange(() => this.layout());
    this.portrait.addEventListener("change", this.onPointerChange);
    this.offChange = this.conversations.onChange(() => this.changed());
    this.offSocial = [
      social.onChange(() => this.changed()),
      social.onRequest((r) => this.notice(socialText(charmap, text, "PU_Text_WantsToBeFriends", r.player?.name ?? ""))),
    ];
    this.observer = new ResizeObserver(() => this.layout());
    this.observer.observe(slots.layout);
    this.touch.addEventListener("change", this.onPointerChange);
    this.state();
    this.layout();
  }

  /** The tabs, the list, the FRIENDS pane (M4 fills it) and the thread's back and title. */
  private panes(): Panes {
    const friendsBadge = h("span", { class: "chip-badge", hidden: true });
    const tab = (id: Tab, label: string, ...extra: HTMLElement[]) => {
      const b = h("button", { type: "button", class: `chat-chip social-tab`, role: "tab", "data-tab": id, tabindex: "-1" }, label, ...extra);
      b.addEventListener("click", () => this.setTab(id));
      return b;
    };
    const tabs = h("div", { class: "chat-chips social-tabs", role: "tablist" }, tab("chats", "CHATS"), tab("friends", "FRIENDS", friendsBadge));
    const list = h("div", { class: "social-list", role: "listbox", "aria-label": "Conversations" });
    const friends = h("div", { class: "social-friends" }, h("p", { class: "social-empty" }, "Your friends show here."));
    const body = h("div", { class: "social-body" });
    const back = h("button", { type: "button", class: "social-back", "aria-label": "Back" }, "‹") as HTMLButtonElement;
    const title = h("span", { class: "social-title" });
    this.rows(list);
    return { tabs, friendsBadge, list, friends, body, back, title };
  }

  /** Whether the player is on the field (not in a battle or a full-screen menu); none: not in the world. */
  field: (() => boolean) | null = null;

  /** Every frame: the chat shows only on the field. */
  update(): void {
    this.shown = this.field?.() ?? false;
    // The PC panel takes its room once in the world, and keeps it through battles and menus.
    if (this.inWorld !== (this.field !== null)) {
      this.inWorld = this.field !== null;
      this.layout();
    }
  }

  private set shown(shown: boolean) {
    if (shown === this.shownNow) return;
    this.shownNow = shown;
    if (!shown) this.close();
    this.slots.layout.dataset.chatShown = shown ? "true" : "";
    this.state();
    if (shown) {
      this.changed();
      this.layout();
    }
  }

  /** MESSAGE on a player: their conversation (M5); until then the chat opens. */
  openWith(_id: bigint): void {
    this.open();
  }

  /** A social notice: a toast at the panel's top on PC, a ticker line on phones (D13, D14), in the sheet's status while it's open. */
  notice(text: string, from: Conversation | null = null): void {
    if (!this.touch.matches) {
      this.toastFor = from;
      this.panelNotice.el.dataset.link = from ? "true" : "";
      return this.panelNotice.show(text);
    }
    if (!this.sheet.hidden) return this.showHint(text);
    this.tickerNotice.show(text, () => (this.ticker.dataset.fade = "true"));
    this.ticker.dataset.fade = "";
    window.clearTimeout(this.tickerTimer);
  }

  /** A line came back from the zone. */
  add(line: ChatLine): void {
    this.arrived(this.conversations.zone, line);
  }

  /** A line in any conversation: its log, then a notice unless it's on screen (D13, D14). */
  arrived(c: Conversation, line: ChatLine): void {
    this.conversations.add(c, line);
    if (!this.shownNow || c.muted || line.own || c.log.open) return;
    if (this.touch.matches) {
      if (c.kind === "direct") navigator.vibrate?.(80);
      if (!this.sheet.hidden) return this.showHint(`${c.title} · ${line.name}: ${line.text}`);
      this.ticker.dataset.fade = "";
      window.clearTimeout(this.tickerTimer);
      this.tickerTimer = window.setTimeout(() => (this.ticker.dataset.fade = "true"), TICKER_FADE_MS);
      return;
    }
    this.notice(`${c.title} · ${line.name}: ${line.text}`, c);
  }

  clear(): void {
    this.conversations.clearZone();
    for (const v of [this.panelLog, this.sheetLog, this.tickerLog]) v.scroll = 0;
    this.ticker.dataset.fade = "true";
  }

  destroy(): void {
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("popstate", this.onPopState);
    window.removeEventListener("pointerdown", this.onOutside, true);
    this.touch.removeEventListener("change", this.onPointerChange);
    this.portrait.removeEventListener("change", this.onPointerChange);
    this.offKeyboard();
    this.keyboard.destroy();
    this.input.suspend(false);
    window.clearTimeout(this.hintTimer);
    window.clearTimeout(this.tickerTimer);
    this.observer.disconnect();
    this.offChange();
    for (const off of this.offSocial) off();
    this.actions.close();
    this.closeRowMenu();
    this.panelNotice.destroy();
    this.tickerNotice.destroy();
    this.panel.remove();
    this.ticker.remove();
    this.sheet.remove();
    this.button.remove();
  }

  private readonly onPointerChange = () => {
    this.state();
    this.layout();
  };

  /** The system back gesture: a thread back to the list, the list closes the sheet (D14); the entry is already gone. */
  private readonly onPopState = () => {
    if (this.sheet.hidden) return;
    const s = history.state as SheetState;
    if (!s?.chatSheet) return this.close(true);
    const c = s.thread ? this.conversations.get(s.thread) : undefined;
    if (c) this.conversations.current = c;
    this.sheetInput.blur();
    this.view = c ? "thread" : "list";
    this.state();
    this.layout();
  };

  /** PC: T opens the last conversation (D13); Esc goes back, then closes; Alt+↑/↓ switches. */
  private readonly onKey = (e: KeyboardEvent) => {
    if (!this.shownNow || this.touch.matches || e.ctrlKey || e.metaKey) return;
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      return this.step(e.key === "ArrowUp" ? -1 : 1);
    }
    const t = e.target;
    if (e.altKey || e.repeat || (t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable))) return;
    if (e.key === "Escape" && (this.isOpen || this.rowMenu)) {
      e.preventDefault();
      this.escape();
    } else if (e.code === "KeyT" && (!this.isOpen || this.view === "list")) {
      e.preventDefault();
      this.open();
    }
  };

  /** PC: opens the current thread with the input; phones: the sheet on the list (D14). */
  private open(): void {
    if (!this.shownNow) return;
    this.closeRowMenu();
    if (this.touch.matches) {
      this.sheet.hidden = false;
      this.view = "list";
      // A history entry on the same path: the back gesture closes the sheet, not the page.
      if (!(history.state as SheetState)?.chatSheet) history.pushState({ chatSheet: true }, "");
    } else this.view = "thread";
    this.isOpen = true;
    this.state();
    // After state(): a field in a hidden pane can't take the focus.
    if (!this.touch.matches) this.focusPanel();
    this.layout();
  }

  private focusPanel(): void {
    this.panelCompose.hidden = false;
    this.panelHint.hidden = true;
    this.panelInput.focus();
    this.panelInput.setSelectionRange(this.panelInput.value.length, this.panelInput.value.length);
  }

  /** A conversation chosen on the list or the toast: its thread (D13; on phones a history entry, D14). */
  private choose(c: Conversation): void {
    if (!this.shownNow) return;
    this.closeRowMenu();
    this.conversations.current = c;
    this.tab = "chats";
    this.view = "thread";
    if (this.touch.matches) {
      if (this.sheet.hidden) this.open();
      this.view = "thread";
      history.pushState({ chatSheet: true, thread: c.id }, "");
    } else this.isOpen = true;
    this.panelLog.scroll = this.sheetLog.scroll = 0;
    this.state();
    if (!this.touch.matches) this.focusPanel();
    this.layout();
  }

  /** Alt+↑/↓: the conversation above or below on the list. */
  private step(by: number): void {
    const list = this.conversations.list;
    const i = list.indexOf(this.conversations.current);
    const next = list[Math.max(0, Math.min(list.length - 1, i + by))];
    if (next === this.conversations.current && this.view === "thread") return;
    if (this.isOpen) return this.choose(next);
    this.conversations.current = next;
    this.state();
  }

  /** The thread's back: the list (phones pop their entry). */
  private back(): void {
    if (this.touch.matches) {
      if ((history.state as SheetState)?.thread) history.back();
      return;
    }
    this.view = "list";
    this.isOpen = true;
    this.panelInput.blur();
    this.panelCompose.hidden = true;
    this.panelHint.hidden = true;
    this.state();
    this.layout();
  }

  /** PC's Esc: a row's menu, then back to the list on one pane, then closed (D13). */
  private escape(): void {
    if (this.rowMenu) return this.closeRowMenu();
    if (!this.touch.matches && !this.twoPanes && this.view === "thread" && this.isOpen) return this.back();
    this.close();
  }

  private setTab(tab: Tab): void {
    this.tab = tab;
    if (!this.touch.matches && !this.twoPanes) {
      this.view = "list";
      this.isOpen = true;
      this.panelCompose.hidden = true;
      this.panelHint.hidden = true;
    }
    this.state();
    this.layout();
  }

  /** `fromHistory`: the back gesture already popped the sheet's entries. */
  private close(fromHistory = false): void {
    this.closeRowMenu();
    if (!this.isOpen) return;
    this.isOpen = false;
    if (!fromHistory && !this.sheet.hidden) {
      const s = history.state as SheetState;
      if (s?.thread) history.go(-2);
      else if (s?.chatSheet) history.back();
    }
    this.sheet.style.transform = "";
    this.panelInput.blur();
    this.sheetInput.blur();
    this.panelCompose.hidden = true;
    this.panelHint.hidden = false;
    this.sheet.hidden = true;
    // PC closed: the current thread stays beside the game, as Phase 8's log.
    this.view = this.touch.matches ? "list" : "thread";
    this.tab = "chats";
    this.state();
    this.layout();
  }

  /** The panes shown, the tabs and which logs count unread, from the state. */
  private state(): void {
    const touch = this.touch.matches;
    const current = this.conversations.current;
    this.panel.dataset.panes = this.twoPanes ? "two" : "one";
    this.panel.dataset.view = this.view;
    this.panel.dataset.tab = this.tab;
    this.sheet.dataset.view = this.view;
    this.sheet.dataset.tab = this.tab;
    for (const p of [this.pc, this.phone]) {
      p.title.textContent = current.title;
      for (const t of p.tabs.children) t.setAttribute("aria-selected", String((t as HTMLElement).dataset.tab === this.tab));
    }
    const threadShown = touch ? this.isOpen && this.view === "thread" : this.inWorld && (this.twoPanes || this.view === "thread");
    for (const c of this.conversations.list) {
      const open = this.shownNow && threadShown && c === current;
      if (c.log.open !== open) c.log.setOpen(open);
    }
    this.changed();
  }

  /** Lines, rows and badges changed. */
  private changed(): void {
    const { conversations: cs } = this;
    const lines = cs.current.log.lines;
    const unseen = this.social.unseen;
    const total = cs.unread + unseen;
    this.badge.hidden = total === 0;
    this.badge.textContent = total > 99 ? "99+" : String(total);
    for (const p of [this.pc, this.phone]) {
      p.friendsBadge.hidden = unseen === 0;
      p.friendsBadge.textContent = unseen > 99 ? "99+" : String(unseen);
      this.rows(p.list);
    }
    for (const v of [this.panelLog, this.sheetLog]) {
      v.layout(lines);
      v.draw();
    }
    this.tickerLog.layout(cs.recent.map((r) => r.line));
    this.tickerLog.draw();
    this.tickerLabel.textContent = cs.recent.at(-1)?.conversation.title ?? "";
  }

  /** The conversation rows: face, name, last line, unread badge (D13). */
  private rows(list: HTMLElement): void {
    if (!this.conversations || !this.rowEls) return;
    const current = this.conversations.current;
    // Rows are kept and updated in place: a press on one survives the lines coming in.
    let els = this.rowEls.get(list);
    if (!els) this.rowEls.set(list, (els = new Map()));
    const list_ = this.conversations.list;
    for (const [id, el] of els) if (!this.conversations.get(id)) (el.remove(), els.delete(id));
    list_.forEach((c, i) => {
      let el = els.get(c.id);
      if (!el) {
        el = h(
          "button",
          { type: "button", class: "social-row", role: "option", tabindex: "-1", "data-id": c.id },
          h("span", { class: "social-face", "data-kind": c.kind, "aria-hidden": "true" }),
          h("span", { class: "social-row-text" }, h("span", { class: "social-row-title" }), h("span", { class: "social-row-line" })),
          h("span", { class: "chip-badge" }),
        );
        els.set(c.id, el);
      }
      const [face, text, badge] = el.children as unknown as HTMLElement[];
      const [title, line] = text.children as unknown as HTMLElement[];
      const last = c.lastLine;
      const n = c.unread;
      el.setAttribute("aria-selected", String(c === current));
      el.dataset.muted = c.muted ? "true" : "";
      face.textContent = c.face ?? c.title.slice(0, 1);
      title.textContent = c.title + (c.muted ? " (muted)" : "");
      line.textContent = last ? `${last.name}: ${last.text}` : "No messages yet";
      badge.hidden = n === 0;
      badge.textContent = n > 99 ? "99+" : String(n);
      if (list.children[i] !== el) list.insertBefore(el, list.children[i] ?? null);
    });
    if (list.dataset.hooked) return;
    list.dataset.hooked = "true";
    // Tap a row: its thread; long-press (or right-click): its menu (D14).
    let press: { id: number; x: number; y: number; timer: number; fired: boolean } | null = null;
    const rowAt = (e: Event) => (e.target as HTMLElement).closest<HTMLElement>(".social-row");
    list.addEventListener("pointerdown", (e) => {
      const row = rowAt(e);
      if (!row || e.button !== 0) return;
      const timer = window.setTimeout(() => {
        if (!press) return;
        press.fired = true;
        this.openRowMenu(row.dataset.id!, list);
      }, LONG_PRESS_MS);
      press = { id: e.pointerId, x: e.clientX, y: e.clientY, timer, fired: false };
    });
    list.addEventListener("pointermove", (e) => {
      if (press?.id === e.pointerId && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) {
        window.clearTimeout(press.timer);
        press = null;
      }
    });
    const cancel = () => {
      if (press) window.clearTimeout(press.timer);
    };
    list.addEventListener("pointerup", cancel);
    list.addEventListener("pointercancel", () => {
      cancel();
      press = null;
    });
    list.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const row = rowAt(e);
      if (row && !press?.fired) this.openRowMenu(row.dataset.id!, list);
    });
    list.addEventListener("click", (e) => {
      const fired = press?.fired;
      press = null;
      const row = rowAt(e);
      const c = row && this.conversations.get(row.dataset.id!);
      if (c && !fired) this.choose(c);
    });
  }

  /** A row's menu: MUTE (this session), LEAVE for rooms, REMOVE FRIEND for friends (D14). */
  private openRowMenu(id: string, list: HTMLElement): void {
    const c = this.conversations.get(id);
    if (!c) return;
    this.closeRowMenu();
    const item = (label: string, act: () => void) => {
      const b = h("button", { type: "button", class: "chat-action", role: "menuitem" }, label);
      b.addEventListener("click", () => {
        this.closeRowMenu();
        act();
      });
      return b;
    };
    const items = [item(c.muted ? "UNMUTE" : "MUTE", () => this.conversations.setMuted(c, !c.muted))];
    if (c.kind === "room") items.push(item("LEAVE", () => this.onConversationAction(c, "leave")));
    if (c.kind === "direct") items.push(item("REMOVE FRIEND", () => this.onConversationAction(c, "remove")));
    items.push(item("CANCEL", () => {}));
    this.rowMenu = h("div", { class: "chat-actions social-row-menu", role: "menu" }, h("span", { class: "chat-actions-name" }, c.title), ...items);
    list.parentElement!.append(this.rowMenu);
  }

  private closeRowMenu(): void {
    this.rowMenu?.remove();
    this.rowMenu = null;
  }

  private readonly onOutside = (e: PointerEvent) => {
    if (this.rowMenu && !this.rowMenu.contains(e.target as Node)) this.closeRowMenu();
  };

  /** Enter: the line goes to mic-core and shows when it comes back; over the rate nothing happens. */
  private send(input: Field): void {
    const line = cleanLine(input.value);
    const c = this.conversations.current;
    // Only the zone is said for now; M5 sends direct messages, M6 room lines.
    if (!line || c.kind !== "zone" || !this.link.inWorld || !c.log.allowSend()) return;
    this.link.sendChat(line);
    input.value = "";
    if (input === this.sheetInput) this.edited(false);
  }

  private showHint(text: string, ms = HINT_MS): void {
    this.hint.textContent = text;
    window.clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => (this.hint.textContent = ""), ms);
  }

  /** The sheet's field changed: its height (1-3 lines), the counter, the hint (D22). */
  private edited(dropped: boolean): void {
    const field = this.sheetInput;
    const n = [...field.value].length;
    this.counter.textContent = n >= COUNTER_FROM ? `${n}/${MAX_LENGTH}` : "";
    if (dropped) this.showHint("Not in the game's font");
    const before = field.style.height;
    field.style.height = "auto";
    const style = getComputedStyle(field);
    const frame = field.offsetHeight - field.clientHeight;
    const pad = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const max = INPUT_LINES * parseFloat(style.lineHeight) + pad + frame;
    field.style.height = `${Math.min(field.scrollHeight + frame, max)}px`;
    if (field.style.height !== before && this.compose) this.layout();
  }

  /** A swipe down on the sheet's header closes it (D14). */
  private swipeDown(): void {
    let start: { id: number; y: number } | null = null;
    let dy = 0;
    this.sheetHead.addEventListener("pointerdown", (e) => {
      if ((e.target as HTMLElement).closest("button")) return;
      start = { id: e.pointerId, y: e.clientY };
      dy = 0;
      this.sheetHead.setPointerCapture(e.pointerId);
    });
    this.sheetHead.addEventListener("pointermove", (e) => {
      if (start?.id !== e.pointerId) return;
      dy = Math.max(0, e.clientY - start.y);
      this.sheet.style.transform = dy ? `translateY(${dy}px)` : "";
    });
    const end = (e: PointerEvent) => {
      if (start?.id !== e.pointerId) return;
      start = null;
      this.sheet.style.transform = "";
      if (dy >= SWIPE_CLOSE) this.close();
    };
    this.sheetHead.addEventListener("pointerup", end);
    this.sheetHead.addEventListener("pointercancel", (e) => {
      dy = 0;
      end(e);
    });
  }

  /** A swipe right from the thread's left half (not the screen's edge, the browser's) goes back (D14). */
  private swipeBack(): void {
    let start: { id: number; x: number; y: number } | null = null;
    let dx = 0;
    this.sheetThread.addEventListener(
      "pointerdown",
      (e) => {
        const r = this.sheetThread.getBoundingClientRect();
        if (this.view !== "thread" || (e.target as HTMLElement).closest("textarea, button")) return;
        if (e.clientX < EDGE || e.clientX > r.left + r.width / 2) return;
        start = { id: e.pointerId, x: e.clientX, y: e.clientY };
        dx = 0;
      },
      true,
    );
    this.sheetThread.addEventListener(
      "pointermove",
      (e) => {
        if (start?.id !== e.pointerId) return;
        const x = e.clientX - start.x;
        // Up and down is the log's scroll: a vertical drag isn't a swipe.
        if (!dx && Math.abs(e.clientY - start.y) > Math.abs(x) && Math.abs(e.clientY - start.y) > 8) {
          start = null;
          return;
        }
        dx = Math.max(0, x);
        this.sheetThread.style.transform = dx > 8 ? `translateX(${dx}px)` : "";
      },
      true,
    );
    const end = (e: PointerEvent) => {
      if (start?.id !== e.pointerId) return;
      start = null;
      this.sheetThread.style.transform = "";
      if (dx >= SWIPE_BACK) this.back();
      dx = 0;
    };
    this.sheetThread.addEventListener("pointerup", end, true);
    this.sheetThread.addEventListener("pointercancel", (e) => {
      dx = 0;
      end(e);
    }, true);
  }

  /** Long-press a line or tap its name: that player is chosen (D24). */
  private hooks(view: LogView, select = true): void {
    let press: { x: number; y: number; startY: number; scroll: number; moved: boolean; timer: number } | null = null;
    const choose = (line: ChatLine) => {
      view.selected = line.id;
      view.el.dataset.selected = String(line.id);
      view.draw();
      this.onSelect(line.id);
      this.actions.open(line, view.el.parentElement!);
    };
    let drag: number | null = null;
    view.el.addEventListener("pointerdown", (e) => {
      if (!select) return;
      const r = view.el.getBoundingClientRect();
      const [x, y] = [e.clientX - r.left, e.clientY - r.top];
      view.el.setPointerCapture(e.pointerId);
      // The bar: drag its thumb, or a press on the track brings the thumb's middle there.
      if (view.onBar(x)) {
        drag = view.thumbOffset(y);
        if (drag === null) {
          view.dragThumb(y, view.thumbHeight / 2);
          drag = view.thumbOffset(y) ?? view.thumbHeight / 2;
        }
        return;
      }
      const timer = window.setTimeout(() => {
        const hit = press && !press.moved ? view.hit(x, y) : null;
        if (hit) choose(hit.line);
        press = null;
      }, LONG_PRESS_MS);
      press = { x, y, startY: e.clientY, scroll: view.scroll, moved: false, timer };
    });
    view.el.addEventListener("pointermove", (e) => {
      const r = view.el.getBoundingClientRect();
      if (drag !== null) {
        view.dragThumb(e.clientY - r.top, drag);
        return;
      }
      view.el.style.cursor = !press && view.onBar(e.clientX - r.left) ? "pointer" : "";
      if (!press) return;
      const dy = e.clientY - press.startY;
      if (Math.abs(dy) > 6) press.moved = true;
      // Dragging scrolls: down shows older rows.
      if (press.moved) {
        view.scroll = press.scroll;
        view.scrollBy(Math.round(dy / (ROW * view.pixel)));
      }
    });
    const end = (e: PointerEvent) => {
      drag = null;
      if (!press) return;
      window.clearTimeout(press.timer);
      const r = view.el.getBoundingClientRect();
      const hit = !press.moved ? view.hit(e.clientX - r.left, e.clientY - r.top) : null;
      if (hit?.name) choose(hit.line);
      press = null;
    };
    view.el.addEventListener("pointerup", end);
    view.el.addEventListener("pointercancel", () => {
      drag = null;
      if (press) window.clearTimeout(press.timer);
      press = null;
    });
  }


  /**
   * PC: the panel goes beside the screen when that leaves the screen as big as below it,
   * below otherwise, and takes the room the screen leaves at 3:2 (D15).
   */
  private layout(): void {
    const { layout } = this.slots;
    const touch = this.touch.matches;
    // Out of the world the panel leaves the grid: an area-less item would add tracks.
    this.panel.hidden = touch || !this.inWorld;
    if (touch || !this.inWorld) {
      delete layout.dataset.chat;
      this.layoutCompose(touch);
      if (!touch) return;
      this.ticker.style.height = `${this.tickerLog.cssHeight}px`;
      this.fit(this.tickerLog, this.tickerLog.el.parentElement!);
      if (!this.sheet.hidden) this.fit(this.sheetLog, this.sheetLogBox);
      return;
    }
    const W = layout.clientWidth;
    const H = layout.clientHeight;
    const s = deviceScale(PC_SCALE);
    const side = fitScreen(W - PANEL_WIDTH * s, H).scale;
    const below = fitScreen(W, H - PANEL_HEIGHT * s).scale;
    if (side >= below) {
      layout.dataset.chat = "side";
      const size = Math.max(PANEL_WIDTH * s, Math.min(W - 240 * side, PANEL_WIDTH * s * 1.6));
      layout.style.setProperty("--chat-size", `${Math.floor(size)}px`);
      this.panes2(size >= TWO_PANES);
    } else {
      layout.dataset.chat = "below";
      layout.style.setProperty("--chat-size", `${Math.floor(Math.max(PANEL_HEIGHT * s, H - 160 * below))}px`);
      this.panes2(W >= TWO_PANES);
    }
    this.fit(this.panelLog, this.panelLog.el.parentElement!);
  }

  /**
   * The keyboard is up with the sheet open (D22). Portrait: the GBA screen scaled into what
   * the sheet leaves with 3 rows of log; landscape: the field and the last 2-3 rows over the
   * dimmed game. Normal again when the keyboard goes down.
   */
  private layoutCompose(touch: boolean): void {
    const { layout } = this.slots;
    const compose: Compose = touch && !this.sheet.hidden && this.keyboard.state.open ? (this.portrait.matches ? "portrait" : "landscape") : null;
    this.compose = compose;
    if (!compose) {
      delete layout.dataset.compose;
      layout.style.removeProperty("--compose-screen");
      this.sheetLogBox.style.height = "";
      return;
    }
    layout.dataset.compose = compose;
    const s = deviceScale(PHONE_SCALE);
    const rowsHeight = (rows: number) => (rows * ROW + 2 * (BORDER + PAD)) * s;
    const style = getComputedStyle(layout);
    const room = layout.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    if (compose === "portrait") {
      // What the sheet takes besides its log, then the screen gets the rest.
      this.sheetLogBox.style.height = "";
      const rest = this.sheet.offsetHeight - this.sheetLogBox.offsetHeight;
      const { scale } = fitScreen(layout.clientWidth, room - rest - rowsHeight(COMPOSE_ROWS));
      layout.style.setProperty("--compose-screen", `${Math.max(0, Math.floor(160 * scale))}px`);
    } else {
      // The field and the status first; then 3 rows of log if they fit, else 2.
      this.sheetLogBox.style.height = "0px";
      const rest = this.sheet.offsetHeight;
      const rows = room - rest >= rowsHeight(COMPOSE_ROWS) ? COMPOSE_ROWS : COMPOSE_ROWS - 1;
      this.sheetLogBox.style.height = `${Math.ceil(rowsHeight(rows))}px`;
    }
  }

  /** Two panes from 480 CSS px (D13); narrower, one with a back button. */
  private panes2(two: boolean): void {
    if (two === this.twoPanes) return;
    this.twoPanes = two;
    this.state();
  }

  /** The log fills its box once the grid has placed it. */
  private fit(view: LogView, box: HTMLElement): void {
    requestAnimationFrame(() => {
      view.resize(box.clientWidth, box.clientHeight);
      view.layout(view === this.tickerLog ? this.conversations.recent.map((r) => r.line) : this.conversations.current.log.lines);
      view.draw();
    });
  }
}

/** A speech bubble icon. */
function bubble(): SVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "size-6");
  svg.innerHTML = '<path fill="currentColor" d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/>';
  return svg;
}
