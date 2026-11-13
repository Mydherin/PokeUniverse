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
  /** A saved message's place in its conversation (direct and room lines, phase-9 D8); none for zone lines. */
  seq?: number;
  /** The own line's SendMessage.client_id, until its saved copy replaces it. */
  readonly clientId?: string;
  /** An own line not saved yet: sending, or refused and waiting for a retry (phase-9 M5). */
  state?: "sending" | "failed";
}

/** The send rule (D17): one line per 2 s, bursts of 4, as mic-core's limiter per connection. */
const RATE_PER_MS = 0.5 / 1000;
const BURST = 4;

export class ChatLog {
  readonly lines: ChatLine[] = [];
  /** Lines kept: the zone's 50 (D13); a saved conversation keeps what it has loaded. */
  constructor(private readonly max = MAX_LINES) {}

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

  /**
   * Adds a line; false when it was already there. A saved line (seq) goes in seq order and once:
   * its own pending copy (same clientId) is replaced in place, a second copy (a reconnect's
   * refetch) is dropped (phase-9 D10). Pending lines stay last.
   */
  add(line: ChatLine): boolean {
    if (line.seq !== undefined) {
      if (line.clientId !== undefined) {
        const i = this.lines.findIndex((l) => l.seq === undefined && l.clientId === line.clientId);
        if (i >= 0) {
          this.lines.splice(i, 1);
          this.place(line);
          this.changed();
          return false;
        }
      }
      if (this.lines.some((l) => l.seq === line.seq)) return false;
      this.place(line);
    } else this.lines.push(line);
    if (this.lines.length > this.max) this.lines.splice(0, this.lines.length - this.max);
    if (!this.open && !line.own) this.unread++;
    this.changed();
    return true;
  }

  /** A saved line before the pending ones, after every lower seq. */
  private place(line: ChatLine): void {
    let i = this.lines.length;
    while (i > 0 && (this.lines[i - 1].seq === undefined || this.lines[i - 1].seq! > line.seq!)) i--;
    this.lines.splice(i, 0, line);
  }

  /** An older page of history, oldest first (phase-9 D10): put before the rest, nothing unread. */
  prepend(lines: ChatLine[]): void {
    const first = this.lines.find((l) => l.seq !== undefined)?.seq ?? Infinity;
    const older = lines.filter((l) => l.seq !== undefined && l.seq < first);
    if (!older.length) return;
    this.lines.unshift(...older);
    this.changed();
  }

  /** The first saved line's seq (the next older page ends before it). */
  get firstSeq(): number | undefined {
    return this.lines.find((l) => l.seq !== undefined)?.seq;
  }

  /** The newest saved line's seq. */
  get lastSeq(): number {
    for (let i = this.lines.length - 1; i >= 0; i--) if (this.lines[i].seq !== undefined) return this.lines[i].seq!;
    return 0;
  }

  /** The server's unread count for this conversation (phase-9 D10). */
  setUnread(n: number): void {
    this.unread = this.open ? 0 : Math.max(0, n);
    this.changed();
  }

  /** A pending line's state changed (phase-9 M5). */
  touched(): void {
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
