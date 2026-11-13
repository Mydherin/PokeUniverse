// Direct messages as the client keeps them (phase-9 D8-D11, M5): the conversations read over HTTP
// on every snapshot (entering, a reconnect), the live ConversationMessages on the inbox, the own
// lines shown sending until their saved copy comes back (matched by client_id), failed ones kept
// for a retry, older pages read on scrolling up, and the read marker sent while a thread is seen.

import { fromJson } from "@bufbuild/protobuf";
import {
  ConversationKind,
  ConversationsListSchema,
  MessagesPageSchema,
  SendFailedReason,
  type ConversationMessage,
  type SendFailed,
  type SocialEvent,
} from "@pokeuniverse/contracts/social/v1/social";
import { api } from "../../api/client";
import type { WorldLink } from "../../realtime/connection";
import type { ChatLine } from "./chat";
import type { Conversation, Conversations } from "./conversations";
import type { SocialState } from "./social";

/** A line not confirmed in this long is marked failed (the retry sends it with the same client_id). */
const SEND_TIMEOUT_MS = 10_000;

export function friendKey(id: bigint): string {
  return `friend:${id}`;
}

export class DirectMessages {
  /** The own name the lines are printed under. */
  ownName: () => string = () => "";
  /** A line came live: its log, then the notices (ChatWindow.arrived). */
  arrived: (c: Conversation, line: ChatLine) => void = () => {};
  /** A send was refused (the hint). */
  refused: (reason: SendFailedReason) => void = () => {};
  private readonly timers = new Map<string, number>();
  /** Lines the server refused: sent again only by a tap. Others that failed (no answer) go again on reconnect. */
  private readonly refusedIds = new Set<string>();
  private loading = new Set<Conversation>();

  constructor(
    private readonly conversations: Conversations,
    private readonly social: SocialState,
    private readonly link: WorldLink,
  ) {
    const check = () => this.markRead();
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    conversations.onChange(check);
  }

  /** A friend's conversation, made on the client when missing. */
  conversation(friend: bigint, name?: string): Conversation {
    const f = this.social.friends.get(friend);
    const c = this.conversations.open(friendKey(friend), "direct", name ?? f?.name ?? "");
    if (f) {
      c.title = f.name;
      c.who = { id: f.id, face: f.face, gender: f.gender };
    } else if (!c.who) c.who = { id: friend, face: 0, gender: 0 };
    return c;
  }

  /**
   * Every snapshot: the conversations with their unread counts, the new lines of the loaded ones
   * (seq dedupes, D10), and the own lines still sending sent again (client_id dedupes).
   */
  async load(): Promise<void> {
    let list;
    try {
      const res = await api("/api/social/conversations");
      list = fromJson(ConversationsListSchema, await res.json(), { ignoreUnknownFields: true });
    } catch {
      return; // Offline: the next snapshot reads it.
    }
    for (const s of list.conversations) {
      if (s.kind !== ConversationKind.DIRECT || !s.friend) continue;
      const c = this.conversation(s.friend.id, s.friend.name);
      c.who = { id: s.friend.id, face: s.friend.face, gender: s.friend.gender };
      c.title = s.friend.name;
      c.serverId = s.id;
      c.readSent = Math.max(c.readSent, Number(s.lastReadSeq));
      if (s.last) c.last = Math.max(c.last, Number(s.last.sentAt));
      if (c.more === undefined || c.log.lastSeq === 0) {
        c.more = undefined;
        // Not opened yet: the last line for its row, the rest read when opened.
        if (s.last) this.conversations.add(c, this.line(s.last));
      } else await this.newer(c);
      c.log.setUnread(Number(s.lastSeq) - Number(s.lastReadSeq));
    }
    for (const c of this.conversations.list) {
      for (const l of c.log.lines) {
        if (!l.clientId || l.seq !== undefined || l.state === undefined || this.refusedIds.has(l.clientId)) continue;
        l.state = "sending";
        c.log.touched();
        this.transmit(c, l);
      }
    }
    this.markRead();
  }

  /** The thread was opened: its last page, once. */
  opened(c: Conversation): void {
    if (c.kind === "direct" && c.more === undefined) void this.older(c);
  }

  /** The page before the first loaded line (D10); the newest page when nothing is loaded. */
  async older(c: Conversation): Promise<void> {
    if (c.kind !== "direct" || c.more === false || this.loading.has(c)) return;
    if (c.serverId === 0n) {
      c.more = false;
      return;
    }
    this.loading.add(c);
    try {
      const first = c.more === undefined ? undefined : c.log.firstSeq;
      const q = first === undefined ? "" : `?before=${first}`;
      const res = await api(`/api/social/conversations/${c.serverId}/messages${q}`);
      const page = fromJson(MessagesPageSchema, await res.json(), { ignoreUnknownFields: true });
      const lines = page.messages.map((m) => this.line(m));
      // The first page may hold the row's last line already, or lines newer than it.
      c.log.prepend(lines);
      const last = c.log.lastSeq;
      for (const l of lines) if (l.seq! > last) this.conversations.add(c, l);
      c.more = page.more;
    } catch {
      // Offline: scrolling up again tries again.
    } finally {
      this.loading.delete(c);
    }
  }

  /** After a reconnect: the lines after the newest loaded one. */
  private async newer(c: Conversation): Promise<void> {
    if (c.serverId === 0n) return;
    for (;;) {
      let page;
      try {
        const res = await api(`/api/social/conversations/${c.serverId}/messages?after=${c.log.lastSeq}`);
        page = fromJson(MessagesPageSchema, await res.json(), { ignoreUnknownFields: true });
      } catch {
        return;
      }
      for (const m of page.messages) this.conversations.add(c, this.line(m));
      if (!page.more || !page.messages.length) return;
    }
  }

  /** A live social event: messages and refused sends; the rest is SocialState's. */
  apply(e: SocialEvent): void {
    if (e.event.case === "message") this.received(e.event.value);
    else if (e.event.case === "sendFailed") this.failed(e.event.value);
  }

  private received(m: ConversationMessage): void {
    if (m.friend === 0n) return; // Channels: M6.
    const c = this.conversation(m.friend);
    c.serverId = m.conversation;
    if (m.clientId) {
      window.clearTimeout(this.timers.get(m.clientId));
      this.timers.delete(m.clientId);
    }
    const line = this.line(m);
    // Its first message made the conversation: its history starts here.
    if (c.more === undefined && c.log.lines.every((l) => l.seq === undefined)) c.more = false;
    this.arrived(c, line);
    this.markRead();
  }

  private failed(f: SendFailed): void {
    const found = this.pending(f.clientId);
    if (!found) return;
    window.clearTimeout(this.timers.get(f.clientId));
    this.timers.delete(f.clientId);
    found.line.state = "failed";
    this.refusedIds.add(f.clientId);
    found.c.log.touched();
    this.refused(f.reason);
  }

  /** Sends an own line (already cleaned) to the friend's conversation; it shows as sending. */
  send(c: Conversation, text: string): void {
    if (!c.who) return;
    const line: ChatLine = { id: 0n, name: this.ownName(), text, own: true, clientId: crypto.randomUUID(), state: "sending" };
    this.conversations.add(c, line);
    this.transmit(c, line);
  }

  /** A failed line sent again, with its client_id (saved once). */
  retry(c: Conversation, line: ChatLine): void {
    if (line.state !== "failed") return;
    this.refusedIds.delete(line.clientId!);
    line.state = "sending";
    c.log.touched();
    this.transmit(c, line);
  }

  private transmit(c: Conversation, line: ChatLine): void {
    const id = line.clientId!;
    window.clearTimeout(this.timers.get(id));
    this.timers.set(
      id,
      window.setTimeout(() => {
        this.timers.delete(id);
        if (line.state !== "sending") return;
        line.state = "failed";
        c.log.touched();
      }, SEND_TIMEOUT_MS),
    );
    this.link.sendMessage(c.serverId, c.who!.id, line.text, id);
  }

  private pending(clientId: string): { c: Conversation; line: ChatLine } | null {
    for (const c of this.conversations.list) {
      const line = c.log.lines.find((l) => l.seq === undefined && l.clientId === clientId);
      if (line) return { c, line };
    }
    return null;
  }

  /** The read marker of every open thread, while the tab is seen and focused (D10). */
  private markRead(): void {
    if (document.visibilityState !== "visible" || !document.hasFocus()) return;
    for (const c of this.conversations.list) {
      if (c.kind !== "direct" || !c.log.open || c.serverId === 0n) continue;
      const seq = c.log.lastSeq;
      if (seq > c.readSent) {
        c.readSent = seq;
        this.link.markRead(c.serverId, seq);
      }
    }
  }

  private line(m: ConversationMessage): ChatLine {
    const own = m.sender !== m.friend;
    const name = own ? this.ownName() : (this.social.friends.get(m.friend)?.name ?? this.conversations.get(friendKey(m.friend))?.title ?? "");
    return { id: m.sender, name, text: m.text, own, seq: Number(m.seq), clientId: m.clientId || undefined };
  }
}
