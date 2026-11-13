// A facing another player (phase-9 D4): their name in the message box and a multichoice of what
// fits (FireRed's DrawVerticalMultichoiceMenu, script_menu.c): ADD FRIEND, or MESSAGE once
// friends (INVITE when the player owns a channel, M6), and CANCEL. FireRed shows the trainer card
// here (CableClub_EventScript_ReadTrainerCard); the MMO needs these actions instead (D2).

import { Relation } from "@pokeuniverse/contracts/social/v1/social";
import type { PlayerMenu } from "@pokeuniverse/contracts/world/v1/world";
import { Button } from "../gba/input";
import { expandPlaceholders, FontId, PLACEHOLDER_STR_VAR_1, Window, type Text } from "../gba/text";
import type { AddFriendResult } from "../world/social";
import type { FieldMessage } from "./field-message";
import type { Flow } from "./flow";
import type { TextId } from "./manifest";
import { clearStdWindowAndFrameToTransparent, CursorMenu, DLG_WINDOW_PALETTE, drawStdFrame, MENU_B_PRESSED, MENU_NOTHING_CHOSEN, printDefault } from "./menu";

const enum Entry {
  AddFriend,
  Message,
  Invite,
  Cancel,
}
const ENTRY_TEXTS: Record<Entry, TextId> = {
  [Entry.AddFriend]: "PU_Text_AddFriend",
  [Entry.Message]: "PU_Text_Message",
  [Entry.Invite]: "PU_Text_Invite",
  [Entry.Cancel]: "gFameCheckerText_Cancel",
};
const RESULT_TEXTS: Record<AddFriendResult, TextId> = {
  sent: "PU_Text_SentFriendRequest",
  friends: "PU_Text_NowFriends",
  already: "PU_Text_AlreadyRequested",
  failed: "PU_Text_FriendRequestFailed",
};
/** GetMCWindowHeight. */
const MC_HEIGHTS = [1, 2, 4, 6, 7, 9, 11, 13, 14];
/** Right of the screen (left + width ≤ 28), just above the message box's frame, as the field's YES/NO. */
const MC_LEFT = 28;
const MC_BOTTOM = 13;
const MC_BASE_BLOCK = 0x125;

const enum State {
  Name,
  Choose,
  Waiting,
  Result,
  Done,
}

export class PlayerMenuRun {
  private state = State.Name;
  private menu: CursorMenu | null = null;
  private entries: Entry[];
  private result: AddFriendResult | null = null;
  private readonly name: Text;

  constructor(
    private readonly flow: Flow,
    private readonly message: FieldMessage,
    private readonly target: PlayerMenu,
  ) {
    this.name = flow.encode(target.name);
    // The relation the client knows now may be newer than the server's (a live event).
    const relation = flow.social.friends.has(target.id) ? Relation.FRIEND : target.relation;
    const first = relation === Relation.FRIEND ? [Entry.Message, ...(target.ownsChannel ? [Entry.Invite] : [])] : [Entry.AddFriend];
    this.entries = [...first, Entry.Cancel];
    if (relation === Relation.REQUEST_SENT) {
      // Already asked: nothing to choose, only what stands.
      this.say("PU_Text_AlreadyRequested");
      return;
    }
    message.show(this.name, false);
  }

  /** One frame; true once the menu is closed. */
  update(): boolean {
    const { input } = this.flow.gba;
    switch (this.state) {
      case State.Name:
        if (this.message.printing) return false;
        this.openMenu();
        return false;
      case State.Choose:
        return this.choose();
      case State.Waiting:
        if (this.result === null) return false;
        this.say(RESULT_TEXTS[this.result]);
        return false;
      case State.Result:
        if (this.message.printing || !input.isPressed(Button.A | Button.B)) return false;
        input.pressed &= ~(Button.A | Button.B);
        this.state = State.Done;
        return true;
      case State.Done:
        return true;
    }
  }

  /** The menu's window gone, when the script stops early. */
  close(): void {
    if (this.menu) clearStdWindowAndFrameToTransparent(this.menu.win);
    this.menu = null;
  }

  private say(text: TextId): void {
    this.message.show(expandPlaceholders(this.flow.assets.text(text), { [PLACEHOLDER_STR_VAR_1]: this.name }), false);
    this.state = State.Result;
  }

  /** DrawVerticalMultichoiceMenu: as wide as its longest entry, items 14 pixels apart. */
  private openMenu(): void {
    const { flow } = this;
    const font = flow.fonts[FontId.Normal];
    const texts = this.entries.map((e) => flow.assets.text(ENTRY_TEXTS[e]));
    const strWidth = Math.max(...texts.map((t) => font.width(t)));
    const width = Math.floor((strWidth + 9) / 8) + 1;
    const height = MC_HEIGHTS[this.entries.length];
    const win = new Window(flow.gba.video.bgs[0], { left: MC_LEFT - width, top: MC_BOTTOM - height, width, height, palette: DLG_WINDOW_PALETTE, baseBlock: MC_BASE_BLOCK });
    drawStdFrame(win);
    texts.forEach((t, i) => printDefault(flow, win, FontId.Normal, t, 8, 2 + i * 14));
    this.menu = new CursorMenu(flow, win, FontId.Normal, 0, 2, 14, this.entries.length, 0);
    this.state = State.Choose;
  }

  private choose(): boolean {
    const chosen = this.menu!.processInput(false);
    if (chosen === MENU_NOTHING_CHOSEN) return false;
    const { input } = this.flow.gba;
    input.pressed &= ~(Button.A | Button.B);
    if (chosen === MENU_B_PRESSED) this.flow.play("se_select");
    this.close();
    const entry = chosen === MENU_B_PRESSED ? Entry.Cancel : this.entries[chosen];
    if (entry === Entry.AddFriend) {
      this.state = State.Waiting;
      void this.flow.social.addFriend(this.target.id).then((r) => (this.result = r));
      return false;
    }
    if (entry === Entry.Message) this.flow.chat.openWith(this.target.id);
    // INVITE: the channels' invites come with M6 (D16).
    this.state = State.Done;
    return true;
  }
}
