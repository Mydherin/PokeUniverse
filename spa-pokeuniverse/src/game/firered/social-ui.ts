// The social panel's own pieces (phase-9 D12-D14), in the chat panel's style: a chat line's
// player actions (Phase 8 D24, phase-9 D4) and the notices (a toast at the panel's top on PC, a
// ticker line on phones). Strings come from the game's string table (ours, FireRed's charset).

import { Relation } from "@pokeuniverse/contracts/social/v1/social";
import { h } from "../../ui/dom";
import { decodeText, expandPlaceholders, PLACEHOLDER_STR_VAR_1, type Charmap, type Text } from "../gba/text";
import type { ChatLine } from "../world/chat";
import type { AddFriendResult, SocialState } from "../world/social";
import type { TextId } from "./manifest";

const RESULT_TEXTS: Record<AddFriendResult, TextId> = {
  sent: "PU_Text_SentFriendRequest",
  friends: "PU_Text_NowFriends",
  already: "PU_Text_AlreadyRequested",
  failed: "PU_Text_FriendRequestFailed",
};

/** A table string as plain text (line breaks as spaces), `{STR_VAR_1}` filled with `name`. */
export function socialText(charmap: Charmap, text: (id: TextId) => Text, id: TextId, name = ""): string {
  const filled = expandPlaceholders(text(id), { [PLACEHOLDER_STR_VAR_1]: [...name].map((c) => charmap.encode[c] ?? charmap.encode[" "]) });
  return decodeText(charmap, filled).replace(/\s*(\\[nlp]|\n)\s*/g, " ");
}

export interface LineActionsHooks {
  /** MESSAGE: the conversation with that player (M5; until then the chat opens). */
  message(id: bigint): void;
  /** What an action did, shown as a notice. */
  notice(text: string): void;
  /** INVITE's choices: the channels the player owns, each inviting that friend (M6). */
  inviteTo(id: bigint): { name: string; go: () => void }[];
}

/** The menu of a chat line's player: ADD FRIEND or MESSAGE and INVITE (a friend, with a channel owned, M6), CANCEL. */
export class LineActions {
  private el: HTMLElement | null = null;
  private readonly onDown = (e: PointerEvent) => {
    if (this.el && !this.el.contains(e.target as Node)) this.close();
  };
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && this.el) {
      e.preventDefault();
      e.stopPropagation();
      this.close();
    }
  };

  constructor(
    private readonly social: SocialState,
    private readonly charmap: Charmap,
    private readonly text: (id: TextId) => Text,
    private readonly hooks: LineActionsHooks,
  ) {}

  get isOpen(): boolean {
    return this.el !== null;
  }

  open(line: ChatLine, box: HTMLElement): void {
    this.close();
    if (line.own) return;
    const say = (id: TextId) => socialText(this.charmap, this.text, id, line.name);
    const relation = this.social.relation(line.id);
    const entry = (label: string, act: () => void) =>
      h("button", { type: "button", class: "chat-action", on: { click: () => (this.close(), act()) } }, label);
    const entries: HTMLElement[] = [];
    if (relation === Relation.FRIEND) entries.push(entry(say("PU_Text_Message"), () => this.hooks.message(line.id)));
    const invites = relation === Relation.FRIEND ? this.hooks.inviteTo(line.id) : [];
    if (invites.length) {
      // INVITE: the owned channels in the same box, then CANCEL.
      const b = h("button", { type: "button", class: "chat-action" }, "INVITE");
      b.addEventListener("click", () => {
        const choices = invites.map((i) => entry(i.name, i.go));
        this.el?.replaceChildren(h("p", { class: "chat-actions-name" }, "INVITE TO"), ...choices, entry(say("gFameCheckerText_Cancel"), () => {}));
        (choices[0] as HTMLButtonElement).focus({ preventScroll: true });
      });
      entries.push(b);
    }
    else if (relation !== Relation.REQUEST_SENT)
      entries.push(entry(say("PU_Text_AddFriend"), () => void this.social.addFriend(line.id).then((r) => this.hooks.notice(say(RESULT_TEXTS[r])))));
    const note = relation === Relation.REQUEST_SENT ? h("p", { class: "chat-actions-note" }, say("PU_Text_AlreadyRequested")) : null;
    entries.push(entry(say("gFameCheckerText_Cancel"), () => {}));
    this.el = h("div", { class: "chat-actions", role: "menu", "aria-label": line.name }, h("p", { class: "chat-actions-name" }, line.name), ...(note ? [note] : []), ...entries);
    box.append(this.el);
    (entries[0] as HTMLButtonElement).focus({ preventScroll: true });
    window.addEventListener("pointerdown", this.onDown, true);
    window.addEventListener("keydown", this.onKey, true);
  }

  close(): void {
    this.el?.remove();
    this.el = null;
    window.removeEventListener("pointerdown", this.onDown, true);
    window.removeEventListener("keydown", this.onKey, true);
  }
}

const NOTICE_MS = 5000;

/** A notice that shows for a while, then hides: the PC toast or the phone's ticker line. */
export class Notice {
  readonly el = h("div", { class: "social-notice", role: "status", hidden: true });
  private timer: number | undefined;

  show(text: string, onHide: () => void = () => {}): void {
    this.el.textContent = text;
    this.el.hidden = false;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.el.hidden = true;
      onHide();
    }, NOTICE_MS);
  }

  destroy(): void {
    window.clearTimeout(this.timer);
    this.el.remove();
  }
}
