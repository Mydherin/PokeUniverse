// The player's friends and pending requests as the client knows them (phase-9 D3): read once over
// HTTP on entering the world, then kept by the live SocialEvents (D9). The world menu on a player
// (D4), the chat line actions and the notices read it.

import { create, fromJson, toJson } from "@bufbuild/protobuf";
import {
  FriendSchema,
  FriendsListSchema,
  Relation,
  SendFriendRequestResultSchema,
  SendFriendRequestSchema,
  type Friend,
  type FriendRequest,
  type SocialEvent,
} from "@pokeuniverse/contracts/social/v1/social";
import { api, ApiError } from "../../api/client";

/** What ADD FRIEND did: a request sent, now friends (they had asked), already pending or friends, or refused. */
export type AddFriendResult = "sent" | "friends" | "already" | "failed";

export class SocialState {
  readonly friends = new Map<bigint, Friend>();
  readonly incoming = new Map<bigint, FriendRequest>();
  readonly outgoing = new Map<bigint, FriendRequest>();
  /** Incoming requests not looked at yet: the FRIENDS badge (M4 clears it when listed). */
  unseen = 0;
  private readonly listeners = new Set<() => void>();
  private readonly noticeListeners = new Set<(r: FriendRequest) => void>();

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** A new incoming request, live: the toast or ticker line (D13, D14). */
  onRequest(fn: (r: FriendRequest) => void): () => void {
    this.noticeListeners.add(fn);
    return () => this.noticeListeners.delete(fn);
  }

  /** Reads the lists again (on entering the world and after a reconnect). */
  async load(): Promise<void> {
    try {
      const res = await api("/api/social/friends");
      const list = fromJson(FriendsListSchema, await res.json(), { ignoreUnknownFields: true });
      this.friends.clear();
      this.incoming.clear();
      this.outgoing.clear();
      for (const f of list.friends) this.friends.set(f.id, f);
      for (const r of list.incoming) if (r.player) this.incoming.set(r.player.id, r);
      for (const r of list.outgoing) if (r.player) this.outgoing.set(r.player.id, r);
      this.unseen = this.incoming.size;
      this.changed();
    } catch {
      // Offline or signed out: the live events and the next load fill it in.
    }
  }

  relation(id: bigint): Relation {
    if (this.friends.has(id)) return Relation.FRIEND;
    if (this.outgoing.has(id)) return Relation.REQUEST_SENT;
    if (this.incoming.has(id)) return Relation.REQUEST_RECEIVED;
    return Relation.NONE;
  }

  /** ADD FRIEND: a request, or a friendship when they had asked (D3). */
  async addFriend(id: bigint): Promise<AddFriendResult> {
    try {
      const res = await api("/api/social/friends/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toJson(SendFriendRequestSchema, create(SendFriendRequestSchema, { id }))),
      });
      const result = fromJson(SendFriendRequestResultSchema, await res.json(), { ignoreUnknownFields: true });
      if (result.result.case === "friend") {
        this.dropIncoming(id);
        this.friends.set(id, result.result.value);
        this.changed();
        return "friends";
      }
      if (result.result.case === "request" && result.result.value.player) this.outgoing.set(id, result.result.value);
      this.changed();
      return "sent";
    } catch (e) {
      return e instanceof ApiError && e.status === 409 ? "already" : "failed";
    }
  }

  /** ACCEPT on an incoming request: now friends (D3). */
  async accept(id: bigint): Promise<boolean> {
    try {
      const res = await api(`/api/social/friends/requests/${id}/accept`, { method: "POST" });
      const friend = fromJson(FriendSchema, await res.json(), { ignoreUnknownFields: true });
      this.dropIncoming(id);
      this.friends.set(id, friend);
      this.changed();
      return true;
    } catch {
      return false;
    }
  }

  /** DECLINE an incoming request, CANCEL an outgoing one, REMOVE a friend: gone on both sides (D3). */
  async decline(id: bigint): Promise<boolean> {
    return this.drop(`/api/social/friends/requests/${id}/decline`, "POST", () => this.dropIncoming(id));
  }

  async cancel(id: bigint): Promise<boolean> {
    return this.drop(`/api/social/friends/requests/${id}`, "DELETE", () => this.outgoing.delete(id));
  }

  async remove(id: bigint): Promise<boolean> {
    return this.drop(`/api/social/friends/${id}`, "DELETE", () => this.friends.delete(id));
  }

  private async drop(path: string, method: string, done: () => void): Promise<boolean> {
    try {
      await api(path, { method });
    } catch (e) {
      // Already gone (the other side acted first): the row goes all the same.
      if (!(e instanceof ApiError && e.status === 404)) return false;
    }
    done();
    this.changed();
    return true;
  }

  apply(e: SocialEvent): void {
    const ev = e.event;
    switch (ev.case) {
      case "requestReceived":
        if (!ev.value.player) return;
        if (!this.incoming.has(ev.value.player.id)) this.unseen++;
        this.incoming.set(ev.value.player.id, ev.value);
        for (const fn of this.noticeListeners) fn(ev.value);
        break;
      case "friendAdded":
        this.dropIncoming(ev.value.id);
        this.outgoing.delete(ev.value.id);
        this.friends.set(ev.value.id, ev.value);
        break;
      case "requestClosed":
        this.dropIncoming(ev.value.id);
        this.outgoing.delete(ev.value.id);
        break;
      case "friendRemoved":
        this.friends.delete(ev.value);
        break;
      case "presence": {
        const f = this.friends.get(ev.value.id);
        if (f) {
          f.presence = ev.value.presence;
          f.lastSeen = ev.value.lastSeen;
        }
        break;
      }
      default:
        return;
    }
    this.changed();
  }

  private dropIncoming(id: bigint): void {
    if (this.incoming.delete(id) && this.unseen > 0) this.unseen--;
  }

  private changed(): void {
    for (const fn of this.listeners) fn();
  }
}
