// A private channel's members and settings (phase-9 M6, D16), over its thread: the members with
// their faces and the owner's mark, the players invited (owner), and INVITE, RENAME, LEAVE and
// DELETE. The owner's long-press (or right-click) on a member offers REMOVE. One per pane (the PC
// panel's and the phone sheet's), as FriendsView.

import type { ChannelMembers, Friend } from "@pokeuniverse/contracts/social/v1/social";
import { h } from "../../ui/dom";
import { CHANNEL_NAME_MAX, type Channels } from "../world/channels";
import { cleanLine, filterInput } from "../world/chat";
import type { Conversation } from "../world/conversations";
import type { SocialState } from "../world/social";
import type { Faces } from "./friends-view";

const LONG_PRESS_MS = 500;

export interface ChannelViewHooks {
  notice(text: string): void;
  /** CLOSE or the channel gone. */
  close(): void;
}

/** A channel name field: FireRed's characters only, 16 at most (D16). */
export function nameField(value = ""): HTMLInputElement {
  const input = h("input", { type: "text", class: "chat-input social-name-input", maxlength: String(CHANNEL_NAME_MAX), autocomplete: "off", "aria-label": "Channel name", enterkeyhint: "done" }) as HTMLInputElement;
  input.value = value;
  input.addEventListener("input", () => {
    const { text } = filterInput(input.value);
    const cut = text.slice(0, CHANNEL_NAME_MAX);
    if (cut !== input.value) input.value = cut;
  });
  return input;
}

/** The field's name as D16 allows it, or null. */
export function channelName(input: HTMLInputElement): string | null {
  const name = cleanLine(input.value);
  return name && [...name].length <= CHANNEL_NAME_MAX ? name : null;
}

export class ChannelView {
  readonly el = h("div", { class: "social-channel", hidden: true, role: "dialog", "aria-label": "Channel" });
  /** The channel shown, or null. */
  channel: Conversation | null = null;
  private data: ChannelMembers | null = null;
  /** A sub-form (rename, invite, a YES/NO) replaces the actions while open. */
  private mode: { kind: "rename" | "invite" | "leave" | "delete" } | { kind: "remove"; who: Friend } | null = null;

  constructor(
    private readonly channels: Channels,
    private readonly social: SocialState,
    private readonly faces: Faces,
    private readonly hooks: ChannelViewHooks,
  ) {
    let press: { timer: number; fired: boolean } | null = null;
    const memberAt = (e: Event) => (e.target as HTMLElement).closest<HTMLElement>(".social-row[data-member]");
    const offer = (row: HTMLElement) => {
      const who = this.data?.members.find((m) => String(m.player?.id) === row.dataset.member)?.player;
      if (who && this.isOwner && who.id !== this.channels.me) (this.mode = { kind: "remove", who }), this.render();
    };
    this.el.addEventListener("pointerdown", (e) => {
      const row = memberAt(e);
      if (!row || e.button !== 0) return;
      press = { fired: false, timer: window.setTimeout(() => press && ((press.fired = true), offer(row)), LONG_PRESS_MS) };
    });
    const cancel = () => press && window.clearTimeout(press.timer);
    this.el.addEventListener("pointerup", cancel);
    this.el.addEventListener("pointercancel", cancel);
    this.el.addEventListener("pointermove", (e) => {
      if (press && (Math.abs(e.movementX) > 4 || Math.abs(e.movementY) > 4)) cancel();
    });
    this.el.addEventListener("contextmenu", (e) => {
      const row = memberAt(e);
      if (!row) return;
      e.preventDefault();
      if (!press?.fired) offer(row);
    });
  }

  get isOwner(): boolean {
    return this.channel?.channel?.owner === this.channels.me;
  }

  show(c: Conversation): void {
    this.channel = c;
    this.mode = null;
    this.el.hidden = false;
    this.render();
    void this.refresh();
  }

  hide(): void {
    this.channel = null;
    this.data = null;
    this.mode = null;
    this.el.hidden = true;
  }

  /** Members read again (an event changed them). */
  async refresh(): Promise<void> {
    const c = this.channel;
    if (!c) return;
    const data = await this.channels.members(c);
    if (this.channel !== c) return;
    this.data = data;
    this.render();
  }

  private render(): void {
    const c = this.channel;
    if (!c) return;
    const owner = c.channel?.owner ?? 0n;
    const members = this.data?.members ?? [];
    const button = (label: string, act: string, fn: () => void) => {
      const b = h("button", { type: "button", class: "social-row-button", "data-act": act, tabindex: "-1" }, label);
      b.addEventListener("click", fn);
      return b;
    };
    const row = (f: Friend, note: string, attrs: Record<string, string> = {}) =>
      h(
        "div",
        { class: "social-row", ...attrs },
        this.faces.view(f.face, f.gender),
        h("span", { class: "social-row-text" }, h("span", { class: "social-row-title" }, f.name || "?"), h("span", { class: "social-row-line" }, note)),
      );
    const head = h(
      "div",
      { class: "social-channel-head" },
      h("span", { class: "social-title" }, `${c.title} · ${c.channel?.members ?? members.length}/50`),
      button("CLOSE", "close", () => this.hooks.close()),
    );
    const list = h("div", { class: "social-channel-list" }, h("p", { class: "social-section" }, "MEMBERS"));
    for (const m of members) {
      if (!m.player) continue;
      const mark = m.player.id === owner ? "★ OWNER" : m.player.id === this.channels.me ? "You" : "";
      list.append(row(m.player, mark, { "data-member": String(m.player.id), "data-owner": m.player.id === owner ? "true" : "" }));
    }
    if (this.isOwner && this.data?.invited.length) {
      list.append(h("p", { class: "social-section" }, "INVITED"));
      for (const f of this.data.invited) list.append(row(f, "Invited"));
    }
    if (this.isOwner && members.length > 1) list.append(h("p", { class: "social-empty social-channel-tip" }, "Hold a member to remove them."));
    this.el.replaceChildren(head, list, this.actions(c, button));
  }

  private actions(c: Conversation, button: (label: string, act: string, fn: () => void) => HTMLElement): HTMLElement {
    const bar = h("div", { class: "social-channel-actions" });
    const back = () => ((this.mode = null), this.render());
    const done = (r: string | null, ok: string) => {
      this.hooks.notice(r ?? ok);
      this.mode = null;
      void this.refresh();
    };
    const mode = this.mode;
    if (!mode) {
      if (this.isOwner) bar.append(button("INVITE", "invite", () => ((this.mode = { kind: "invite" }), this.render())), button("RENAME", "rename", () => ((this.mode = { kind: "rename" }), this.render())));
      bar.append(button("LEAVE", "leave", () => ((this.mode = { kind: "leave" }), this.render())));
      if (this.isOwner) bar.append(button("DELETE", "delete", () => ((this.mode = { kind: "delete" }), this.render())));
      return bar;
    }
    const ask = (text: string, yes: () => void) => bar.append(h("span", { class: "social-channel-note" }, text), button("YES", "yes", yes), button("NO", "cancel", back));
    switch (mode.kind) {
      case "rename": {
        const input = nameField(c.title);
        const go = () => {
          const name = channelName(input);
          if (!name) return this.hooks.notice("Names are 1-16 letters, numbers or marks.");
          void this.channels.rename(c, name).then((r) => done(r, `Renamed to ${name}.`));
        };
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") (e.preventDefault(), go());
          else if (e.key === "Escape") (e.preventDefault(), e.stopPropagation(), back());
        });
        bar.append(input, button("OK", "ok", go), button("CANCEL", "cancel", back));
        queueMicrotask(() => input.focus({ preventScroll: true }));
        break;
      }
      case "invite": {
        const taken = new Set([...(this.data?.members ?? []).map((m) => m.player?.id), ...(this.data?.invited ?? []).map((f) => f.id)]);
        const friends = [...this.social.friends.values()].filter((f) => !taken.has(f.id));
        const pick = h("div", { class: "social-channel-pick" });
        if (!friends.length) pick.append(h("span", { class: "social-channel-note" }, "No friends left to invite."));
        for (const f of friends) pick.append(button(f.name, "pick", () => void this.channels.invite(c, f.id).then((r) => done(r, `Invited ${f.name} to ${c.title}.`))));
        bar.append(pick, button("CANCEL", "cancel", back));
        break;
      }
      case "leave":
        ask(this.isOwner && (c.channel?.members ?? 0) > 1 ? `Leave ${c.title}? The longest member will own it.` : `Leave ${c.title}?`, () => void this.channels.leave(c).then((r) => r && this.hooks.notice(r)));
        break;
      case "delete":
        ask(`Delete ${c.title} for everyone?`, () => void this.channels.remove(c).then((r) => r && this.hooks.notice(r)));
        break;
      case "remove": {
        const who = mode.who;
        ask(`Remove ${who.name} from ${c.title}?`, () => void this.channels.kick(c, who.id).then((r) => done(r, `${who.name} was removed.`)));
        break;
      }
    }
    return bar;
  }
}
