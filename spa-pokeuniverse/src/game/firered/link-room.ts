// The Wireless Club's leader and member screens (phase-9 D18, union_room.c): a linkRoom step of
// the Direct Corner's script. BECOME LEADER opens a room and waits on Task_TryBecomeLinkLeader's
// screen ("Awaiting communication…", a member asks, YES/NO); JOIN GROUP lists the rooms in range
// on Task_TryJoinLinkGroup's screen (friends first, then by time opened, D19), asks one and waits
// for the answer. mic-core holds the rooms: the screens only send intents and show its events.
// Ours: the member list shows each room's activity (D18), and the leader's list has no ID for the
// member (the MMO has no trainer IDs of others).

import { JoinRefusal, LinkActivity, type LinkEvent, type LinkRoom, type LinkStart } from "@pokeuniverse/contracts/social/v1/social";
import type { LinkRoomStep, ZoneEvents } from "@pokeuniverse/contracts/world/v1/world";
import { getSession } from "../../auth/session";
import { Button } from "../gba/input";
import { decimalText, EOS, expandPlaceholders, FontId, joinText, NumberMode, PLACEHOLDER_STR_VAR_1, PLACEHOLDER_STR_VAR_2, Window, type Text, type WindowTemplate } from "../gba/text";
import { fieldYesNo, type FieldMessage } from "./field-message";
import type { Flow } from "./flow";
import { LIST_CANCEL, LIST_NOTHING_CHOSEN, ListMenu, ListScrollMultiple, type ListMenuTemplate } from "./list-menu";
import type { TextId } from "./manifest";
import { clearStdWindowAndFrameToTransparent, DLG_WINDOW_PALETTE, drawStdFrame, loadStdWindowFrameGfx, MENU_NOTHING_CHOSEN, type YesNoMenu } from "./menu";

/** What the screen ended with: B (the script goes on), the link dropped, or both walk in. */
export type LinkOutcome = "cancel" | "dropped" | LinkStart;

/** sWindowTemplate_BButtonCancel, _List_PossibleGroupMembers, _NumPlayerMode, _GroupList, _PlayerNameAndId. */
const TOP_BAR: WindowTemplate = { left: 0, top: 0, width: 30, height: 2, palette: DLG_WINDOW_PALETTE, baseBlock: 0x008 };
const MEMBERS: WindowTemplate = { left: 1, top: 3, width: 13, height: 10, palette: DLG_WINDOW_PALETTE, baseBlock: 0x044 };
const MODE: WindowTemplate = { left: 16, top: 3, width: 7, height: 4, palette: DLG_WINDOW_PALETTE, baseBlock: 0x0c6 };
const GROUPS: WindowTemplate = { left: 1, top: 3, width: 17, height: 10, palette: DLG_WINDOW_PALETTE, baseBlock: 0x044 };
const NAME_AND_ID: WindowTemplate = { left: 20, top: 3, width: 7, height: 4, palette: DLG_WINDOW_PALETTE, baseBlock: 0x0ee };

/** PrintUnionRoomText's colors, as [fill, text, shadow]: UR_COLOR_DEFAULT, UR_COLOR_CANCEL; gray for another activity (ours). */
const COLOR_DEFAULT = [1, 2, 3] as const;
const COLOR_CANCEL = [2, 1, 3] as const;
const COLOR_OTHER = [1, 3, 1] as const;
/** MAX_RFU_PLAYER_LIST_SIZE: the member list's rows. */
const MAX_ROOMS = 16;
/** The leader's list: normal font + itemVerticalPadding 2. */
const ROW_HEIGHT = 16;
/** Ours: the leader's "OK" stays on screen a moment before both walk in. */
const ACCEPTED_FRAMES = 120;

/** sLinkGroupActivityNameTexts. */
const ACTIVITY_NAMES: Partial<Record<LinkActivity, TextId>> = {
  [LinkActivity.TRADE]: "gText_UR_PokemonTrades",
  [LinkActivity.SINGLE_BATTLE]: "gText_UR_SingleBattle",
  [LinkActivity.DOUBLE_BATTLE]: "gText_UR_DoubleBattle",
};
/** gTexts_UR_ChooseTrainer. */
const CHOOSE_TEXTS: Partial<Record<LinkActivity, TextId>> = {
  [LinkActivity.TRADE]: "sText_ChooseTrainerToTradeWith",
  [LinkActivity.SINGLE_BATTLE]: "sText_ChooseTrainerSingleBattle",
  [LinkActivity.DOUBLE_BATTLE]: "sText_ChooseTrainerDoubleBattle",
};
/** What the member is told when the leader didn't take them. */
const REFUSAL_TEXTS: Partial<Record<JoinRefusal, TextId>> = {
  [JoinRefusal.DECLINED]: "sText_PlayerRepliedNo",
  [JoinRefusal.GONE]: "sText_OtherTrainerUnavailableNow",
  [JoinRefusal.DIFFERENT]: "CableClub_Text_PlayersMadeDifferentSelections",
};

const enum State {
  /** Leader: "Awaiting communication…", B cancels. */
  Awaiting,
  /** Leader: "{NAME} contacted you… Accept?" and its YES/NO. */
  Asked,
  /** Leader: "An OK was sent", waiting for LinkStart. Member: "{NAME} sent back an OK!". */
  Accepted,
  /** Leader: the member stopped waiting ("…doesn't appear to be available now…"). */
  Unavailable,
  /** Member: "Please choose a TRAINER…", then the windows. */
  Choosing,
  /** Member: the list takes input. */
  List,
  /** Member: "Awaiting {NAME}'s response…", B asks to quit. */
  Waiting,
  /** Member: "Quit being a member?" and its YES/NO. */
  Quitting,
  /** Member: the leader said no, or the room is gone or for another activity. */
  Refused,
  Done,
}

export class LinkScreenRun {
  private state: State;
  private outcome: LinkOutcome | null = null;
  private start: LinkStart | null = null;
  private yesNo: YesNoMenu | null = null;
  private topBar: Window | null = null;
  private listWin: Window | null = null;
  private sideWin: Window | null = null;
  private frames = 0;
  /** Leader: the member asking now, and one who asked while the screen was busy. */
  private member: { id: bigint; name: Text } | null = null;
  private pendingAsk: { id: bigint; name: Text } | null = null;
  /** Member: the rooms in range, the list showing them, the leader asked and whether the refusal waits for A. */
  private rooms: LinkRoom[] = [];
  private list: ListMenu | null = null;
  private template: ListMenuTemplate | null = null;
  private leader: LinkRoom | null = null;
  private refusalWaitsA = false;
  private readonly self = getSession()?.account.id ?? 0n;

  constructor(
    private readonly flow: Flow,
    private readonly message: FieldMessage,
    private readonly step: LinkRoomStep,
  ) {
    loadStdWindowFrameGfx(flow, flow.gba.video.bgs[0]);
    if (step.lead) {
      flow.link.link({ intent: { case: "open", value: step.activity } });
      this.drawLeaderWindows();
      this.state = State.Awaiting;
      this.say(this.text("gText_UR_AwaitingCommunication", this.activityName()));
    } else {
      this.state = State.Choosing;
      this.browse();
    }
  }

  /** One frame: what the screen ended with, or null while it runs. */
  update(): LinkOutcome | null {
    if (this.outcome) return this.finish();
    const { input } = this.flow.gba;
    const printing = this.message.printing;
    switch (this.state) {
      case State.Awaiting:
        if (printing) break;
        if (this.pendingAsk) {
          this.ask(this.pendingAsk);
          this.pendingAsk = null;
          break;
        }
        if (input.isPressed(Button.B)) {
          this.consume();
          this.flow.link.link({ intent: { case: "close", value: true } });
          this.outcome = "cancel";
        }
        break;
      case State.Asked: {
        if (printing) break;
        this.yesNo ??= fieldYesNo(this.flow);
        const answer = this.yesNo.processInput();
        if (answer === MENU_NOTHING_CHOSEN) break;
        this.yesNo = null;
        this.consume();
        const accept = answer === 0;
        this.flow.link.link({ intent: { case: "answer", value: { member: this.member!.id, accept } } });
        if (accept) {
          this.state = State.Accepted;
          this.frames = 0;
          this.say(this.text("gText_UR_AnOKWasSentToPlayer", this.member!.name));
        } else {
          // FireRed says nothing on NO: the row goes and the leader waits again.
          this.dropMember();
          this.await();
        }
        break;
      }
      case State.Accepted:
        this.frames++;
        if (printing || !this.start || (this.step.lead && this.frames < ACCEPTED_FRAMES)) break;
        this.outcome = this.start;
        break;
      case State.Unavailable:
        if (!printing) this.await();
        break;
      case State.Choosing:
        if (printing) break;
        if (!this.list) this.drawMemberWindows();
        this.state = State.List;
        break;
      case State.List:
        this.choose();
        break;
      case State.Waiting:
        if (printing || !input.isPressed(Button.B)) break;
        this.consume();
        this.state = State.Quitting;
        this.say(this.flow.assets.text("gText_UR_QuitBeingMember"));
        break;
      case State.Quitting: {
        if (printing) break;
        this.yesNo ??= fieldYesNo(this.flow);
        const answer = this.yesNo.processInput();
        if (answer === MENU_NOTHING_CHOSEN) break;
        this.yesNo = null;
        this.consume();
        if (answer === 0) {
          this.flow.link.link({ intent: { case: "cancelJoin", value: true } });
          this.outcome = "cancel";
        } else this.waitAnswer();
        break;
      }
      case State.Refused:
        if (printing) break;
        if (this.refusalWaitsA) {
          if (!input.isPressed(Button.A | Button.B)) break;
          this.consume();
        }
        // LINKUP_RETRY_ROLE_ASSIGN: choose again.
        this.leader = null;
        this.state = State.Choosing;
        this.browse();
        break;
      case State.Done:
        break;
    }
    return this.outcome ? this.finish() : null;
  }

  /** A link event for this screen. */
  event(e: LinkEvent): void {
    const ev = e.event;
    switch (ev.case) {
      case "joinAsked": {
        if (!this.step.lead || !ev.value.member) return;
        const asking = { id: ev.value.member.id, name: this.flow.encode(ev.value.member.name) };
        if (this.state === State.Awaiting && !this.message.printing) this.ask(asking);
        else this.pendingAsk = asking;
        return;
      }
      case "joinCancelled":
        if (this.pendingAsk?.id === ev.value) this.pendingAsk = null;
        if (this.state !== State.Asked || this.member?.id !== ev.value) return;
        this.yesNo?.close();
        this.yesNo = null;
        this.dropMember();
        this.state = State.Unavailable;
        this.say(this.flow.assets.text("sText_OtherTrainerUnavailableNow"));
        return;
      case "joinAnswered": {
        if (this.step.lead || (this.state !== State.Waiting && this.state !== State.Quitting) || this.leader?.leader?.id !== ev.value.leader) return;
        this.yesNo?.close();
        this.yesNo = null;
        const name = this.flow.encode(this.leader.leader.name);
        if (ev.value.accepted) {
          this.state = State.Accepted;
          this.say(this.text("gText_UR_PlayerSentBackOK", name));
          return;
        }
        const refusal = REFUSAL_TEXTS[ev.value.refusal] ?? "sText_OtherTrainerUnavailableNow";
        this.refusalWaitsA = ev.value.refusal === JoinRefusal.DIFFERENT;
        this.state = State.Refused;
        this.say(this.text(refusal, name));
        return;
      }
      case "start":
        this.start = ev.value;
        return;
      case "ended":
        if (!this.start) this.outcome ??= "dropped";
        return;
      case "rooms":
        if (this.step.lead) return;
        this.rooms = ev.value.rooms.filter((r) => r.leader && r.leader.id !== this.self);
        this.sortRooms();
        return;
      default:
        return;
    }
  }

  /** The zone's rooms opening and closing, live on the member screen (D19). */
  zone(z: ZoneEvents): void {
    if (this.step.lead) return;
    let opened = false;
    let changed = false;
    for (const { event } of z.events) {
      if (event.case === "linkRoomOpened") {
        const room = event.value;
        if (!room.leader || room.leader.id === this.self) continue;
        this.rooms = this.rooms.filter((r) => r.leader?.id !== room.leader!.id);
        this.rooms.push(room);
        opened = changed = true;
      } else if (event.case === "linkRoomClosed") {
        const before = this.rooms.length;
        this.rooms = this.rooms.filter((r) => r.leader?.id !== event.value);
        changed ||= this.rooms.length !== before;
      }
    }
    if (!changed) return;
    // GetNewLeaderCandidate: a new leader in the list chimes.
    if (opened && this.list) this.flow.play("se_pc_login");
    this.sortRooms();
  }

  /** The screen's windows gone (the script ended or the screen did). */
  close(): void {
    this.yesNo?.close();
    this.yesNo = null;
    if (this.topBar) {
      this.topBar.clearTilemap();
      this.topBar.copyToVram();
    }
    if (this.listWin) clearStdWindowAndFrameToTransparent(this.listWin);
    if (this.sideWin) clearStdWindowAndFrameToTransparent(this.sideWin);
    this.topBar = this.listWin = this.sideWin = null;
    this.list = null;
    this.state = State.Done;
  }

  private finish(): LinkOutcome {
    this.close();
    return this.outcome!;
  }

  private consume(): void {
    this.flow.gba.input.pressed &= ~(Button.A | Button.B);
  }

  /** PrintOnTextbox: the field's message box, no A at the end unless the text pages (`\p`). */
  private say(text: Text): void {
    this.message.show(text, false);
  }

  private text(id: TextId, var1: Text, var2?: Text): Text {
    return expandPlaceholders(this.flow.assets.text(id), { [PLACEHOLDER_STR_VAR_1]: var1, ...(var2 ? { [PLACEHOLDER_STR_VAR_2]: var2 } : {}) });
  }

  private activityName(activity = this.step.activity): Text {
    const id = ACTIVITY_NAMES[activity];
    return id ? this.flow.assets.text(id) : [EOS];
  }

  /** "ID" and the trainer's five digits (PrintPlayerNameAndIdOnWindow). */
  private ownId(): Text {
    return joinText(this.flow.assets.text("gText_UR_ID"), decimalText(this.flow.trainer?.idNo ?? 0, NumberMode.LeadingZeros, 5));
  }

  private drawTopBar(hint: TextId): void {
    const win = new Window(this.flow.gba.video.bgs[0], TOP_BAR);
    win.fill(2);
    win.print(this.flow.fonts[FontId.Small], 8, 2, COLOR_CANCEL, this.flow.assets.text(hint), 0, 0);
    win.putTilemap();
    win.copyToVram();
    this.topBar = win;
  }

  // The leader.

  private drawLeaderWindows(): void {
    const { flow } = this;
    const bg = flow.gba.video.bgs[0];
    this.drawTopBar("gText_UR_BButtonCancel");
    const list = new Window(bg, MEMBERS);
    drawStdFrame(list);
    // Row 0: the leader (PrintGroupCandidateOnWindow).
    list.print(flow.fonts[FontId.Normal], 0, 0, COLOR_DEFAULT, flow.encode(flow.trainer?.name ?? ""), 0, 0);
    list.print(flow.fonts[FontId.Small], 71, 0, COLOR_DEFAULT, this.ownId(), 0, 0);
    list.copyToVram();
    this.listWin = list;
    const mode = new Window(bg, MODE);
    drawStdFrame(mode);
    mode.print(flow.fonts[FontId.Normal], 0, 2, COLOR_DEFAULT, flow.assets.text("sText_1PlayerNeeded"), 0, 0);
    mode.copyToVram();
    this.sideWin = mode;
  }

  private await(): void {
    this.state = State.Awaiting;
    this.say(this.text("gText_UR_AwaitingCommunication", this.activityName()));
  }

  /** Leader_SetStateIfMemberListChanged: the member shows in row 1, then the question. */
  private ask(member: { id: bigint; name: Text }): void {
    this.member = member;
    this.flow.play("se_pc_login");
    const win = this.listWin!;
    win.fillRect(1, 0, ROW_HEIGHT, win.stride, ROW_HEIGHT);
    win.print(this.flow.fonts[FontId.Normal], 0, ROW_HEIGHT, COLOR_DEFAULT, member.name, 0, 0);
    win.copyToVram();
    this.state = State.Asked;
    this.say(this.text("gText_UR_PlayerContactedYouForXAccept", this.activityName(), member.name));
  }

  private dropMember(): void {
    this.member = null;
    const win = this.listWin;
    if (!win) return;
    win.fillRect(1, 0, ROW_HEIGHT, win.stride, ROW_HEIGHT);
    win.copyToVram();
  }

  // The member.

  /** The rooms asked again, and "Please choose a TRAINER…". */
  private browse(): void {
    this.flow.link.link({ intent: { case: "browse", value: this.step.activity } });
    this.say(this.flow.assets.text(CHOOSE_TEXTS[this.step.activity] ?? "sText_ChooseTrainerToTradeWith"));
  }

  private drawMemberWindows(): void {
    const { flow } = this;
    const bg = flow.gba.video.bgs[0];
    this.drawTopBar("gText_UR_ChooseJoinCancel");
    const list = new Window(bg, GROUPS);
    drawStdFrame(list);
    this.listWin = list;
    const name = new Window(bg, NAME_AND_ID);
    drawStdFrame(name);
    name.print(flow.fonts[FontId.Normal], 0, 2, COLOR_DEFAULT, flow.encode(flow.trainer?.name ?? ""), 0, 0);
    name.print(flow.fonts[FontId.Small], 0, 16, COLOR_DEFAULT, this.ownId(), 0, 0);
    name.copyToVram();
    this.sideWin = name;
    this.template = {
      win: list,
      items: Array.from({ length: MAX_ROOMS }, (_, id) => ({ label: [EOS], id })),
      maxShowed: 5,
      font: FontId.Normal,
      itemX: 8,
      cursorX: 0,
      upTextY: 0,
      itemVerticalPadding: 2,
      letterSpacing: 0,
      colors: COLOR_DEFAULT,
      onPrint: (id, y) => this.printRoom(id, y),
      scrollMultiple: ListScrollMultiple.Dpad,
    };
    this.list = new ListMenu(flow, this.template, { scroll: 0, row: 0 });
  }

  /** PrintGroupMemberOnWindow: the row's number, then the leader and the room's activity. */
  private printRoom(id: number, y: number): void {
    const { flow } = this;
    const win = this.template!.win;
    const small = flow.fonts[FontId.Small];
    win.print(small, 8, y, COLOR_DEFAULT, joinText(decimalText(id + 1, NumberMode.LeadingZeros, 2), flow.assets.text("gText_UR_Colon")), 0, 0);
    const room = this.rooms[id];
    if (!room?.leader) return;
    const colors = room.activity === this.step.activity ? COLOR_DEFAULT : COLOR_OTHER;
    win.print(flow.fonts[FontId.Normal], 26, y, colors, flow.encode(room.leader.name), 0, 0);
    const activity = this.activityName(room.activity);
    win.print(small, win.stride - small.width(activity), y, colors, activity, 0, 0);
  }

  /** Friends first, then by time opened; the list drawn again where it stood (RedrawListMenu). */
  private sortRooms(): void {
    const friends = this.flow.social.friends;
    const rank = (r: LinkRoom) => (friends.has(r.leader!.id) ? 0 : 1);
    this.rooms.sort((a, b) => rank(a) - rank(b) || Number(a.openedAt - b.openedAt));
    this.rooms.length = Math.min(this.rooms.length, MAX_ROOMS);
    if (this.list && this.template) this.list = new ListMenu(this.flow, this.template, this.list.position);
  }

  private choose(): void {
    const chosen = this.list!.processInput();
    if (chosen === LIST_NOTHING_CHOSEN) return;
    this.consume();
    if (chosen === LIST_CANCEL) {
      this.outcome = "cancel";
      return;
    }
    const room = this.rooms[chosen];
    // Another activity is asked all the same: mic-core answers FireRed's "different selections".
    if (!room?.leader) {
      this.flow.play("se_wall_hit");
      return;
    }
    this.flow.play("se_pokenav_on");
    this.leader = room;
    this.flow.link.link({ intent: { case: "join", value: room.leader.id } });
    this.waitAnswer();
  }

  private waitAnswer(): void {
    this.state = State.Waiting;
    this.say(this.text("gText_UR_AwaitingPlayersResponse", this.flow.encode(this.leader!.leader!.name)));
  }
}
