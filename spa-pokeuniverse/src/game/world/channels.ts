// Private channels as the client keeps them (phase-9 D16, M6): each one a "room" conversation
// keyed by its server ID, the pending invites, the owner's and members' actions over HTTP, and the
// live channel events. Their lines go through DirectMessages like a direct conversation's.

import { create, fromJson, toJson } from "@bufbuild/protobuf";
import {
  ChannelInviteClosedReason,
  ChannelInviteRequestSchema,
  ChannelMemberChange,
  ChannelMembersSchema,
  ChannelNameSchema,
  ChannelSchema,
  type Channel,
  type ChannelInvite,
  type ChannelMembers,
  type SocialEvent,
} from "@pokeuniverse/contracts/social/v1/social";
import { api, ApiError } from "../../api/client";
import { getSession } from "../../auth/session";
import type { Conversation, Conversations } from "./conversations";

/** D16: a channel's name, 1-16 characters in FireRed's charset. */
export const CHANNEL_NAME_MAX = 16;

export function channelKey(id: bigint): string {
  return `channel:${id}`;
}

/** What a refused change says (the panel's own texts). */
const REFUSED: Record<number, string> = {
  403: "Only the owner can do that.",
  404: "That channel is gone.",
  409: "Already in it or invited.",
  422: "That can't be done: a limit was reached or the name isn't allowed.",
};

function refused(e: unknown): string {
  return (e instanceof ApiError && REFUSED[e.status]) || "That didn't go through. Try again.";
}

const json = (body: string): RequestInit => ({ headers: { "Content-Type": "application/json" }, body });

export class Channels {
  /** Pending invites to the player, by channel ID. */
  readonly invites = new Map<bigint, ChannelInvite>();
  /** The player is out of a channel (left, removed, deleted): its conversation is gone. No change: found gone on a reload (no notice). */
  gone: (c: Conversation, change?: ChannelMemberChange) => void = () => {};
  /** A notice for the panel (an invite came, someone joined or left). */
  notice: (text: string, c: Conversation | null) => void = () => {};
  /** Members changed: an open members view reads them again. */
  membersChanged: (c: Conversation) => void = () => {};
  private readonly listeners = new Set<() => void>();

  constructor(private readonly conversations: Conversations) {}

  get me(): bigint {
    return getSession()?.account.id ?? 0n;
  }

  /** The channel's conversation, made or updated. */
  conversation(ch: Channel): Conversation {
    const c = this.conversations.open(channelKey(ch.id), "room", ch.name, "#");
    c.title = ch.name;
    c.serverId = ch.id;
    c.channel = { owner: ch.owner, members: ch.members };
    return c;
  }

  /** Channels the player owns (INVITE's choice). */
  get owned(): Conversation[] {
    return this.conversations.list.filter((c) => c.kind === "room" && c.channel?.owner === this.me);
  }

  /** The conversation list's invites (every snapshot). */
  setInvites(list: ChannelInvite[]): void {
    this.invites.clear();
    for (const i of list) if (i.channel) this.invites.set(i.channel.id, i);
    this.changed();
  }

  /** The channels the list no longer has (left or deleted while offline). */
  prune(kept: Set<bigint>): void {
    for (const c of this.conversations.list)
      if (c.kind === "room" && !kept.has(c.serverId)) {
        this.conversations.remove(c.id);
        this.gone(c);
      }
  }

  apply(e: SocialEvent): void {
    const ev = e.event;
    switch (ev.case) {
      case "channelInvite": {
        const ch = ev.value.channel;
        if (!ch) return;
        this.invites.set(ch.id, ev.value);
        this.notice(`${ev.value.from?.name ?? ""} invites you to ${ch.name}.`, null);
        return this.changed();
      }
      case "channelInviteClosed": {
        const v = ev.value;
        if (v.player === this.me) this.invites.delete(v.channel);
        else if (v.reason === ChannelInviteClosedReason.DECLINED) {
          const c = this.conversations.get(channelKey(v.channel));
          if (c) this.membersChanged(c);
        }
        return this.changed();
      }
      case "channelUpdated": {
        const c = this.conversation(ev.value);
        this.membersChanged(c);
        return this.changed();
      }
      case "channelMember": {
        const v = ev.value;
        const c = this.conversations.get(channelKey(v.channel));
        if (!c || v.player?.id === this.me) return;
        const name = v.player?.name ?? "";
        const said =
          v.change === ChannelMemberChange.JOINED ? `${name} joined ${c.title}.` : v.change === ChannelMemberChange.LEFT ? `${name} left ${c.title}.` : `${name} was removed from ${c.title}.`;
        this.notice(said, c);
        this.membersChanged(c);
        return;
      }
      case "channelGone": {
        const c = this.conversations.get(channelKey(ev.value.channel));
        if (!c) return;
        this.conversations.remove(c.id);
        this.gone(c, ev.value.change);
        return this.changed();
      }
    }
  }

  /** NEW CHANNEL: the new conversation, or what went wrong. */
  async create(name: string): Promise<Conversation | string> {
    try {
      const res = await api("/api/social/channels", { method: "POST", ...json(JSON.stringify(toJson(ChannelNameSchema, create(ChannelNameSchema, { name })))) });
      return this.conversation(fromJson(ChannelSchema, await res.json(), { ignoreUnknownFields: true }));
    } catch (e) {
      return refused(e);
    }
  }

  async rename(c: Conversation, name: string): Promise<string | null> {
    return this.call(`/api/social/channels/${c.serverId}`, "PATCH", toJson(ChannelNameSchema, create(ChannelNameSchema, { name })), (res) =>
      res.json().then((j) => void this.conversation(fromJson(ChannelSchema, j, { ignoreUnknownFields: true }))),
    );
  }

  async remove(c: Conversation): Promise<string | null> {
    return this.call(`/api/social/channels/${c.serverId}`, "DELETE");
  }

  async invite(c: Conversation, friend: bigint): Promise<string | null> {
    return this.call(`/api/social/channels/${c.serverId}/invites`, "POST", toJson(ChannelInviteRequestSchema, create(ChannelInviteRequestSchema, { id: friend })));
  }

  async accept(id: bigint): Promise<Conversation | string> {
    try {
      const res = await api(`/api/social/channels/${id}/accept`, { method: "POST" });
      this.invites.delete(id);
      const c = this.conversation(fromJson(ChannelSchema, await res.json(), { ignoreUnknownFields: true }));
      this.changed();
      return c;
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) (this.invites.delete(id), this.changed());
      return refused(e);
    }
  }

  async decline(id: bigint): Promise<string | null> {
    const r = await this.call(`/api/social/channels/${id}/decline`, "POST");
    this.invites.delete(id);
    this.changed();
    return r;
  }

  async leave(c: Conversation): Promise<string | null> {
    return this.call(`/api/social/channels/${c.serverId}/leave`, "POST");
  }

  async kick(c: Conversation, player: bigint): Promise<string | null> {
    return this.call(`/api/social/channels/${c.serverId}/members/${player}`, "DELETE");
  }

  async members(c: Conversation): Promise<ChannelMembers | null> {
    try {
      const res = await api(`/api/social/channels/${c.serverId}/members`);
      const m = fromJson(ChannelMembersSchema, await res.json(), { ignoreUnknownFields: true });
      if (m.channel) this.conversation(m.channel);
      return m;
    } catch {
      return null;
    }
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private async call(path: string, method: string, body?: unknown, then?: (res: Response) => Promise<void>): Promise<string | null> {
    try {
      const res = await api(path, { method, ...(body === undefined ? {} : json(JSON.stringify(body))) });
      await then?.(res);
      return null;
    } catch (e) {
      return refused(e);
    }
  }

  private changed(): void {
    for (const fn of this.listeners) fn();
  }
}
