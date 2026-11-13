// The social panel's conversations as the client keeps them (phase-9 D12-D14): the zone's chat
// pinned first, then direct messages and rooms (M5, M6) by their last line. Each has its own log;
// a muted one (this session only) counts no unread and sends no notice.

import { ChatLog, type ChatLine } from "./chat";

export type ConversationKind = "zone" | "direct" | "room";

export class Conversation {
  readonly log = new ChatLog();
  muted = false;
  /** When its last line came, to order the list. */
  last = 0;

  constructor(
    readonly id: string,
    readonly kind: ConversationKind,
    public title: string,
    /** The face shown on its row (a friend's, M4); null: the kind's own. */
    public face: string | null = null,
  ) {}

  get lastLine(): ChatLine | undefined {
    return this.log.lines.at(-1);
  }

  get unread(): number {
    return this.muted ? 0 : this.log.unread;
  }
}

/** Lines kept for the phone's ticker, from every conversation. */
const RECENT = 2;

export class Conversations {
  readonly zone = new Conversation("zone", "zone", "Zone");
  /** The conversation the thread shows (T opens it again, D13). */
  current: Conversation = this.zone;
  /** The newest lines of every unmuted conversation, oldest first. */
  readonly recent: { conversation: Conversation; line: ChatLine }[] = [];
  private readonly others = new Map<string, Conversation>();
  private readonly listeners = new Set<() => void>();
  private readonly offs = new Map<Conversation, () => void>();

  constructor() {
    this.watch(this.zone);
  }

  /** Zone first, then the rest by their last line. */
  get list(): Conversation[] {
    return [this.zone, ...[...this.others.values()].sort((a, b) => b.last - a.last)];
  }

  get(id: string): Conversation | undefined {
    return id === this.zone.id ? this.zone : this.others.get(id);
  }

  /** Adds a conversation, or returns the one with that ID. */
  open(id: string, kind: ConversationKind, title: string, face: string | null = null): Conversation {
    const had = this.get(id);
    if (had) return had;
    const c = new Conversation(id, kind, title, face);
    this.others.set(id, c);
    this.watch(c);
    this.changed();
    return c;
  }

  remove(id: string): void {
    const c = this.others.get(id);
    if (!c) return;
    this.others.delete(id);
    this.offs.get(c)?.();
    this.offs.delete(c);
    if (this.current === c) this.current = this.zone;
    this.changed();
  }

  add(c: Conversation, line: ChatLine): void {
    c.last = performance.now();
    if (!c.muted) {
      this.recent.push({ conversation: c, line });
      if (this.recent.length > RECENT) this.recent.splice(0, this.recent.length - RECENT);
    }
    c.log.add(line);
  }

  /** A new map or a reconnect: the zone's lines go (phase-8 D13). */
  clearZone(): void {
    for (let i = this.recent.length - 1; i >= 0; i--) if (this.recent[i].conversation === this.zone) this.recent.splice(i, 1);
    this.zone.log.clear();
  }

  setMuted(c: Conversation, muted: boolean): void {
    c.muted = muted;
    this.changed();
  }

  /** Every unmuted conversation's unread lines. */
  get unread(): number {
    return this.list.reduce((n, c) => n + c.unread, 0);
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private watch(c: Conversation): void {
    this.offs.set(c, c.log.onChange(() => this.changed()));
  }

  private changed(): void {
    for (const fn of this.listeners) fn();
  }
}
