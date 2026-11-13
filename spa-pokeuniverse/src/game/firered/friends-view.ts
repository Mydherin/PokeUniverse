// The FRIENDS tab (phase-9 M4, D3, D6, D7, D13, D14): REQUESTS (incoming ACCEPT / DECLINE,
// outgoing CANCEL) and FRIENDS (face, name, presence; online first, then by name). Rows are kept
// and updated in place from SocialState, so a presence change only moves the dot. Tap a friend:
// their conversation; long-press, right-click or ⋯: MESSAGE / REMOVE (YES/NO) / CANCEL.

import { Presence, type Friend, type FriendRequest } from "@pokeuniverse/contracts/social/v1/social";
import { Gender } from "@pokeuniverse/contracts/trainer/v1/trainer";
import { h } from "../../ui/dom";
import type { SocialState } from "../world/social";
import type { Graphic } from "./manifest";

/** Pixels of a face: a square portrait (D6). */
export const FACE_SIZE = 32;
const LONG_PRESS_MS = 500;

/**
 * Faces by ID (D6): `face > 0` is a stored face at `/faces/<id>.png`; 0, or one that fails to
 * load, is the trainer's default by gender, cut from Red's or Leaf's front pic (`make graphics`).
 * Each is drawn once into a canvas and cached; `view` copies it into a new pixelated canvas.
 */
export class Faces {
  private readonly cache = new Map<string, HTMLCanvasElement>();
  private readonly waiting = new Map<string, HTMLCanvasElement[]>();

  constructor(private readonly pic: (gender: Gender) => Graphic) {}

  /** FaceView(face, gender): a canvas at an integer scale of 32×32. */
  view(face: number, gender: Gender, className = "social-face"): HTMLCanvasElement {
    const c = h("canvas", { class: className, width: String(FACE_SIZE), height: String(FACE_SIZE), "aria-hidden": "true" });
    this.draw(c, face, gender);
    return c;
  }

  /** Draws the face into a canvas `view` made (a row reused for someone else). */
  draw(c: HTMLCanvasElement, face: number, gender: Gender): void {
    const key = face > 0 ? `id:${face}` : `g:${gender === Gender.GIRL ? "girl" : "boy"}`;
    if (c.dataset.face === key) return;
    c.dataset.face = key;
    const ready = this.cache.get(key);
    if (ready) return paint(c, ready);
    // Until a stored face loads, the default shows.
    paint(c, this.fallback(gender));
    if (face === 0) return;
    const queued = this.waiting.get(key);
    if (queued) return void queued.push(c);
    this.waiting.set(key, [c]);
    const img = new Image();
    const done = (src: HTMLCanvasElement) => {
      this.cache.set(key, src);
      for (const el of this.waiting.get(key) ?? []) if (el.dataset.face === key) paint(el, src);
      this.waiting.delete(key);
    };
    img.onload = () => {
      const src = h("canvas", { width: String(FACE_SIZE), height: String(FACE_SIZE) });
      src.getContext("2d")!.drawImage(img, 0, 0, FACE_SIZE, FACE_SIZE);
      done(src);
    };
    img.onerror = () => done(this.fallback(gender));
    img.src = `/faces/${face}.png`;
  }

  private fallback(gender: Gender): HTMLCanvasElement {
    const key = `g:${gender === Gender.GIRL ? "girl" : "boy"}`;
    let src = this.cache.get(key);
    if (!src) this.cache.set(key, (src = portrait(this.pic(gender))));
    return src;
  }
}

function paint(c: HTMLCanvasElement, src: HTMLCanvasElement): void {
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, FACE_SIZE, FACE_SIZE);
  ctx.drawImage(src, 0, 0);
}

/** The head of a front pic: 32×32 from its top, centered on the drawn pixels of its first rows. */
function portrait(g: Graphic): HTMLCanvasElement {
  const img = g.image!;
  const { width: w, height: hgt, pixels } = img;
  let top = 0;
  while (top < hgt && !pixels.subarray(top * w, top * w + w).some((p) => p !== 0)) top++;
  let left = w;
  let right = 0;
  for (let y = top; y < Math.min(hgt, top + 20); y++)
    for (let x = 0; x < w; x++)
      if (pixels[y * w + x] !== 0) {
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
  const x0 = Math.max(0, Math.min(w - FACE_SIZE, Math.round((left + right + 1) / 2) - FACE_SIZE / 2));
  const y0 = Math.max(0, Math.min(hgt - FACE_SIZE, top - 1));
  const out = h("canvas", { width: String(FACE_SIZE), height: String(FACE_SIZE) });
  const ctx = out.getContext("2d")!;
  const data = ctx.createImageData(FACE_SIZE, FACE_SIZE);
  const px = new Uint32Array(data.data.buffer);
  for (let y = 0; y < FACE_SIZE; y++)
    for (let x = 0; x < FACE_SIZE; x++) {
      const i = pixels[(y0 + y) * w + x0 + x];
      if (i !== 0) px[y * FACE_SIZE + x] = rgba(g.palette[i]);
    }
  ctx.putImageData(data, 0, 0);
  return out;
}

/** BGR555 to the canvas' little-endian RGBA. */
function rgba(c: number): number {
  const r = c & 31;
  const g = (c >> 5) & 31;
  const b = (c >> 10) & 31;
  return (0xff000000 | (((b << 3) | (b >> 2)) << 16) | (((g << 3) | (g >> 2)) << 8) | ((r << 3) | (r >> 2))) >>> 0;
}

/** A presence as the row's dot and text (D7). */
export function presenceText(f: Friend, now = Date.now() / 1000): string {
  switch (f.presence) {
    case Presence.ONLINE:
      return "Online";
    case Presence.BUSY_BATTLE:
      return "In a battle";
    case Presence.BUSY_TRADE:
      return "Trading";
    case Presence.BUSY_LINK:
      return "In a link room";
  }
  const seen = Number(f.lastSeen);
  if (!seen) return "Offline";
  const s = Math.max(0, now - seen);
  if (s < 60) return "Seen just now";
  if (s < 3600) return `Seen ${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `Seen ${Math.floor(s / 3600)}h ago`;
  return `Seen ${Math.floor(s / 86400)}d ago`;
}

function dot(p: Presence): string {
  if (p === Presence.ONLINE) return "online";
  if (p === Presence.BUSY_BATTLE || p === Presence.BUSY_TRADE || p === Presence.BUSY_LINK) return "busy";
  return "offline";
}

const online = (f: Friend) => f.presence !== Presence.OFFLINE && f.presence !== Presence.UNSPECIFIED;

export interface FriendsHooks {
  /** Tap or MESSAGE: the friend's conversation. */
  message(f: Friend): void;
  /** An action failed, or what it did. */
  notice(text: string): void;
  /** A friend's menu opened (phones add a history entry, so the back gesture closes it). */
  menuOpened(): void;
  /** It closed by a choice, a tap outside or Esc; `then` runs once the entry is gone. */
  menuClosed(then?: () => void): void;
  /** INVITE's choices: the channels the player owns (M6). */
  inviteTo(id: bigint): { name: string; go: () => void }[];
}

type Kind = "in" | "out" | "friend";

/** One FRIENDS pane (the PC panel's or the phone sheet's); both read the same SocialState. */
export class FriendsView {
  readonly el: HTMLElement;
  private readonly requestsHead = h("p", { class: "social-section" }, "REQUESTS");
  private readonly friendsHead = h("p", { class: "social-section" }, "FRIENDS");
  private readonly empty = h("p", { class: "social-empty" }, "No friends yet. Face a player and press A to add them.");
  private readonly rowEls = new Map<string, HTMLElement>();
  private menu: HTMLElement | null = null;
  /** Requests being answered: their buttons wait. */
  private readonly busy = new Set<string>();

  constructor(
    private readonly social: SocialState,
    private readonly faces: Faces,
    private readonly hooks: FriendsHooks,
  ) {
    this.el = h("div", { class: "social-friends", role: "list", "aria-label": "Friends" });
    this.hookPress();
  }

  get menuOpen(): boolean {
    return this.menu !== null;
  }

  /** The rows as SocialState has them, updated in place. */
  render(): void {
    const s = this.social;
    const byTime = (a: FriendRequest, b: FriendRequest) => Number(b.sentAt - a.sentAt);
    const incoming = [...s.incoming.values()].sort(byTime);
    const outgoing = [...s.outgoing.values()].sort(byTime);
    const friends = [...s.friends.values()].sort((a, b) => Number(online(b)) - Number(online(a)) || a.name.localeCompare(b.name) || Number(a.id - b.id));
    const want: HTMLElement[] = [];
    const seen = new Set<string>();
    if (incoming.length + outgoing.length) want.push(this.requestsHead);
    for (const r of incoming) if (r.player) want.push(this.row("in", r.player, seen));
    for (const r of outgoing) if (r.player) want.push(this.row("out", r.player, seen));
    if (friends.length) want.push(this.friendsHead);
    for (const f of friends) want.push(this.row("friend", f, seen));
    if (want.length === 0) want.push(this.empty);
    for (const [key, el] of this.rowEls) if (!seen.has(key)) (el.remove(), this.rowEls.delete(key));
    for (const el of [this.requestsHead, this.friendsHead, this.empty]) if (!want.includes(el)) el.remove();
    want.forEach((el, i) => {
      if (this.el.children[i] !== el) this.el.insertBefore(el, this.el.children[i] ?? null);
    });
    // A menu's friend gone (removed by them, or here): the menu goes too.
    if (this.menu && !s.friends.has(BigInt(this.menu.dataset.id!))) this.closeMenu();
  }

  private row(kind: Kind, f: Friend, seen: Set<string>): HTMLElement {
    const key = `${kind}:${f.id}`;
    seen.add(key);
    let el = this.rowEls.get(key);
    if (!el) {
      const actions = h("span", { class: "social-row-actions" });
      if (kind === "in") actions.append(this.button("ACCEPT", "accept"), this.button("DECLINE", "decline"));
      if (kind === "out") actions.append(this.button("CANCEL", "cancel"));
      if (kind === "friend") actions.append(h("button", { type: "button", class: "social-more", "data-act": "menu", "aria-label": "More", tabindex: "-1" }, "⋯"));
      el = h(
        "div",
        { class: "social-row", role: "listitem", "data-kind": kind, "data-id": String(f.id) },
        this.faces.view(f.face, f.gender),
        h("span", { class: "social-row-text" }, h("span", { class: "social-row-title" }), h("span", { class: "social-row-line" }, h("span", { class: "social-dot", "aria-hidden": "true" }), h("span", { class: "social-status" }))),
        actions,
      );
      this.rowEls.set(key, el);
    }
    const [face, text, actions] = el.children as unknown as HTMLElement[];
    const [title, line] = text.children as unknown as HTMLElement[];
    const [dotEl, status] = line.children as unknown as HTMLElement[];
    this.faces.draw(face as HTMLCanvasElement, f.face, f.gender);
    title.textContent = f.name;
    dotEl.hidden = kind !== "friend";
    if (kind === "friend") dotEl.dataset.presence = dot(f.presence);
    status.textContent = kind === "in" ? "Wants to be friends" : kind === "out" ? "Request sent" : presenceText(f);
    for (const b of actions.children) (b as HTMLButtonElement).disabled = this.busy.has(key);
    return el;
  }

  private button(label: string, act: string): HTMLElement {
    return h("button", { type: "button", class: "social-row-button", "data-act": act, tabindex: "-1" }, label);
  }

  /** ACCEPT, DECLINE, CANCEL: the request goes, the row with it (or back if it failed). */
  private async answer(kind: Kind, id: bigint, act: string): Promise<void> {
    const key = `${kind}:${id}`;
    if (this.busy.has(key)) return;
    this.busy.add(key);
    this.render();
    const s = this.social;
    const ok = act === "accept" ? await s.accept(id) : act === "decline" ? await s.decline(id) : await s.cancel(id);
    this.busy.delete(key);
    this.render();
    if (!ok) this.hooks.notice("That didn't go through. Try again.");
  }

  /** Taps and long-presses on the rows (as the CHATS list's, D14). */
  private hookPress(): void {
    let press: { id: number; x: number; y: number; timer: number; fired: boolean } | null = null;
    const rowAt = (e: Event) => (e.target as HTMLElement).closest<HTMLElement>(".social-row");
    const friendOf = (row: HTMLElement | null) => (row?.dataset.kind === "friend" ? this.social.friends.get(BigInt(row.dataset.id!)) : undefined);
    this.el.addEventListener("pointerdown", (e) => {
      const row = rowAt(e);
      if (!row || e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
      const timer = window.setTimeout(() => {
        if (!press) return;
        press.fired = true;
        const f = friendOf(row);
        if (f) this.openMenu(f);
      }, LONG_PRESS_MS);
      press = { id: e.pointerId, x: e.clientX, y: e.clientY, timer, fired: false };
    });
    this.el.addEventListener("pointermove", (e) => {
      if (press?.id === e.pointerId && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) {
        window.clearTimeout(press.timer);
        press = null;
      }
    });
    this.el.addEventListener("pointerup", () => press && window.clearTimeout(press.timer));
    this.el.addEventListener("pointercancel", () => {
      if (press) window.clearTimeout(press.timer);
      press = null;
    });
    this.el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const f = friendOf(rowAt(e));
      if (f && !press?.fired) this.openMenu(f);
    });
    this.el.addEventListener("click", (e) => {
      const fired = press?.fired;
      press = null;
      const row = rowAt(e);
      if (!row || fired) return;
      const id = BigInt(row.dataset.id!);
      const act = (e.target as HTMLElement).closest<HTMLElement>("[data-act]")?.dataset.act;
      const kind = row.dataset.kind as Kind;
      if (act === "menu") {
        const f = this.social.friends.get(id);
        if (f) this.openMenu(f);
      } else if (act) void this.answer(kind, id, act);
      else {
        const f = friendOf(row);
        if (f) this.hooks.message(f);
      }
    });
  }

  /** MESSAGE / REMOVE / CANCEL; REMOVE asks YES/NO in the same box (D3). */
  private openMenu(f: Friend): void {
    const had = this.menu !== null;
    this.menu?.remove();
    const item = (label: string, act: () => void) => {
      const b = h("button", { type: "button", class: "chat-action", role: "menuitem" }, label);
      b.addEventListener("click", act);
      return b;
    };
    const menu = h("div", { class: "chat-actions social-row-menu", role: "menu", "data-id": String(f.id) });
    const show = (...children: HTMLElement[]) => menu.replaceChildren(h("span", { class: "chat-actions-name" }, f.name), ...children);
    show(
      item("MESSAGE", () => this.closeMenu(() => this.hooks.message(f))),
      ...(this.hooks.inviteTo(f.id).length
        ? [
            item("INVITE", () =>
              show(
                h("span", { class: "chat-actions-note" }, "Invite to which channel?"),
                ...this.hooks.inviteTo(f.id).map((i) => item(i.name, () => this.closeMenu(i.go))),
                item("CANCEL", () => this.closeMenu()),
              ),
            ),
          ]
        : []),
      item("REMOVE", () =>
        show(
          h("span", { class: "chat-actions-note" }, `Remove ${f.name} from your friends?`),
          item("YES", () =>
            this.closeMenu(() =>
              void this.social.remove(f.id).then((ok) => {
                if (!ok) this.hooks.notice("That didn't go through. Try again.");
              }),
            ),
          ),
          item("NO", () => this.closeMenu()),
        ),
      ),
      item("CANCEL", () => this.closeMenu()),
    );
    this.menu = menu;
    this.el.parentElement!.append(menu);
    if (!had) this.hooks.menuOpened();
  }

  /** Closes the menu; `then` runs once its history entry (phones) is gone. */
  closeMenu(then?: () => void): void {
    if (!this.menu) return then?.();
    this.menu.remove();
    this.menu = null;
    this.hooks.menuClosed(then);
  }

  /** The back gesture already popped the menu's entry. */
  dropMenu(): void {
    this.menu?.remove();
    this.menu = null;
  }

  contains(n: Node): boolean {
    return this.menu?.contains(n) ?? false;
  }
}
