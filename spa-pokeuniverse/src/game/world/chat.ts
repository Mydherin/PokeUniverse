// The zone's chat as the client keeps it, the same for every art style (phase-8 D13, D17, D24):
// the last lines said on this map, nothing replayed, and the input rules mic-core checks again.

/** Lines kept on this map. */
export const MAX_LINES = 50;
/** A line's length in characters once cleaned (mic-core's chat.MaxLength). */
export const MAX_LENGTH = 64;

/**
 * The printable characters of FireRed's Latin charmap, the font's glyphs: a copy of mic-core's
 * `chat.Chars` (internal/chat/chat.go). Change both together.
 */
export const CHARS = new Set(
  " ÀÁÂÇÈÉÊËÌÎÏÒÓÔŒÙÚÛÑßàáçèéêëìîïòóôœùúûñºª&+=;¿¡Í%()âí<>0123456789!?.-·…“”‘’'♂♀¥,×/" + "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz:ÄÖÜäöü",
);

/** What is typed, kept to the font's characters and MAX_LENGTH; `dropped` when something was taken out. */
export function filterInput(text: string): { text: string; dropped: boolean } {
  const kept = [...text].filter((c) => CHARS.has(c));
  const dropped = kept.length < [...text].length || kept.length > MAX_LENGTH;
  return { text: kept.slice(0, MAX_LENGTH).join(""), dropped };
}

/** As mic-core's chat.Clean: trimmed, runs of spaces as one; null when it can't be said. */
export function cleanLine(text: string): string | null {
  const chars = [...text.replace(/^ +| +$/g, "").replace(/ {2,}/g, " ")];
  if (!chars.length || chars.length > MAX_LENGTH || chars.some((c) => !CHARS.has(c))) return null;
  return chars.join("");
}

/** A line said on this map. */
export interface ChatLine {
  /** The player's trainer ID, for the line's actions (Phase 9). */
  readonly id: bigint;
  /** The name it was said under, kept after the player leaves. */
  readonly name: string;
  readonly text: string;
  readonly own: boolean;
}

/** The send rule (D17): one line per 2 s, bursts of 4, as mic-core's limiter per connection. */
const RATE_PER_MS = 0.5 / 1000;
const BURST = 4;

export class ChatLog {
  readonly lines: ChatLine[] = [];
  /** Lines that came while the chat was closed. */
  unread = 0;
  /** The chat window is open (the PC input or the phone sheet). */
  open = false;
  private tokens = BURST;
  private last = performance.now();
  private readonly listeners = new Set<() => void>();

  /** Called whenever the lines or the unread count change. */
  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  add(line: ChatLine): void {
    this.lines.push(line);
    if (this.lines.length > MAX_LINES) this.lines.splice(0, this.lines.length - MAX_LINES);
    if (!this.open) this.unread++;
    this.changed();
  }

  /** A new map or a reconnect: nothing is replayed (D13). */
  clear(): void {
    this.lines.length = 0;
    this.unread = 0;
    this.changed();
  }

  setOpen(open: boolean): void {
    this.open = open;
    if (open) this.unread = 0;
    this.changed();
  }

  /** Takes one send from the burst; false when over the rate (the line isn't sent, nothing is said). */
  allowSend(now = performance.now()): boolean {
    this.tokens = Math.min(BURST, this.tokens + (now - this.last) * RATE_PER_MS);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens--;
    return true;
  }

  private changed(): void {
    for (const fn of this.listeners) fn();
  }
}
