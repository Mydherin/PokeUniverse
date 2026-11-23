// The trade menu (trade.c, CB2_CreateTradeMenu and CB2_TradeMenu): both parties' icons over the
// scrolling stripes, the names on top and CANCEL at the bottom right. A on an own Pokémon opens
// SUMMARY/TRADE, A on the partner's shows its summary (read only), CANCEL asks "Cancel trade?".
// mic-core decides (phase-9 D21-D23): once both picked, both Pokémon move up with their moves and
// "Is this trade okay?" asks YES/NO; a NO or a cancel brings both back to choosing, both cancels
// end the menu. After a trade the menu comes back with the new parties (M10 adds the scene).

import { LinkEventSchema, TradeNotice, TradeStage, type LinkEvent, type TradeState } from "@pokeuniverse/contracts/social/v1/social";
import { PartySchema, type Pokemon } from "@pokeuniverse/contracts/party/v1/party";
import { Gender as MonGender } from "@pokeuniverse/contracts/pokemon/v1/pokemon";
import { FieldUse, Item } from "@pokeuniverse/contracts/item/v1/catalog";
import { create } from "@bufbuild/protobuf";
import { toTiles } from "../gba/assets";
import { Button } from "../gba/input";
import { PALETTES_ALL } from "../gba/palette";
import type { AnimCmd, Sprite, SpriteTemplate } from "../gba/sprites";
import { FontId, joinText, Window, type Text, type WindowTemplate } from "../gba/text";
import { RGB_BLACK, type Background } from "../gba/video";
import { itemInfo } from "../world/items";
import { PartyState } from "../world/party";
import { fillBgRect, initBg } from "./common";
import type { Flow } from "./flow";
import { hpBarLevel } from "./hp-bar";
import { userFrame, type TextId } from "./manifest";
import { copyTiles, CursorMenu, drawStdFrame, MENU_B_PRESSED, MENU_NOTHING_CHOSEN, printDefault, YesNoMenu } from "./menu";
import { iconAnimForHp, MonIcon } from "./mon-icon";
import { monName, shownGender, type PartyHost } from "./party-menu";
import { startSummary } from "./summary";

/** What the menu asks mic-core, and the summary's way to a side's Pokémon; the overworld answers. */
export interface TradeMenuHost {
  readonly playerName: Text;
  readonly partnerName: Text;
  /** A read-only party for the summary (PSS_MODE_TRADE). */
  summaryHost(party: PartyState, name: Text): PartyHost;
  offer(slot: number): void;
  confirm(yes: boolean): void;
  cancel(): void;
}

/** Why it closed: both canceled (`ended`), or the link ended under it (`dropped`). */
export type TradeMenuExit = "ended" | "dropped";

/** Opens the menu on mic-core's first CHOOSING; `done` once it faded out. */
export function startTradeMenu(flow: Flow, host: TradeMenuHost, state: TradeState, done: (exit: TradeMenuExit) => void): TradeMenu {
  return new TradeMenu(flow, host, state, done);
}

const PARTY_SIZE = 6;
const CANCEL = PARTY_SIZE * 2;
const PLAYER = 0;
const PARTNER = 1;

/** sCursorMoveDestinations: from each position, UP, DOWN, LEFT and RIGHT's candidates, the first present one taken. */
const MOVES: readonly (readonly (readonly number[])[])[] = [
  [[4, 2, 12, 12, 0, 0], [2, 4, 12, 12, 0, 0], [7, 6, 1, 0, 0, 0], [1, 6, 7, 0, 0, 0]],
  [[5, 3, 12, 12, 0, 0], [3, 5, 12, 12, 0, 0], [0, 7, 6, 1, 0, 0], [6, 7, 0, 1, 0, 0]],
  [[0, 0, 0, 0, 0, 0], [4, 0, 0, 0, 0, 0], [9, 8, 7, 6, 0, 0], [3, 1, 0, 0, 0, 0]],
  [[1, 1, 1, 1, 0, 0], [5, 1, 1, 1, 0, 0], [2, 9, 8, 7, 0, 0], [8, 9, 6, 6, 0, 0]],
  [[2, 2, 2, 2, 0, 0], [0, 0, 0, 0, 0, 0], [11, 10, 9, 8, 7, 6], [5, 3, 1, 0, 0, 0]],
  [[3, 3, 3, 3, 0, 0], [1, 1, 1, 1, 0, 0], [4, 4, 4, 4, 0, 0], [10, 8, 6, 0, 0, 0]],
  [[10, 8, 12, 0, 0, 0], [8, 10, 12, 0, 0, 0], [1, 0, 0, 0, 0, 0], [7, 0, 1, 0, 0, 0]],
  [[12, 0, 0, 0, 0, 0], [9, 12, 0, 0, 0, 0], [6, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]],
  [[6, 0, 0, 0, 0, 0], [10, 6, 0, 0, 0, 0], [3, 2, 1, 0, 0, 0], [9, 7, 0, 0, 0, 0]],
  [[7, 0, 0, 0, 0, 0], [11, 12, 0, 0, 0, 0], [8, 0, 0, 0, 0, 0], [2, 1, 0, 0, 0, 0]],
  [[8, 0, 0, 0, 0, 0], [6, 0, 0, 0, 0, 0], [5, 4, 3, 2, 1, 0], [11, 9, 7, 0, 0, 0]],
  [[9, 0, 0, 0, 0, 0], [12, 0, 0, 0, 0, 0], [10, 0, 0, 0, 0, 0], [4, 2, 0, 0, 0, 0]],
  [[11, 9, 7, 6, 0, 0], [7, 6, 0, 0, 0, 0], [12, 0, 0, 0, 0, 0], [12, 0, 0, 0, 0, 0]],
];
const DIRECTIONS = [Button.Up, Button.Down, Button.Left, Button.Right] as const;

/** sTradeMonSpriteCoords (tiles): each slot's, then CANCEL's. */
const SPRITE_COORDS: readonly (readonly [number, number])[] = [
  [1, 5], [8, 5], [1, 10], [8, 10], [1, 15], [8, 15],
  [16, 5], [23, 5], [16, 10], [23, 10], [16, 15], [23, 15],
  [23, 18],
];
/** sTradeMonLevelCoords and sTradeMonBoxCoords (tiles). */
const LEVEL_COORDS: readonly (readonly [number, number])[] = [
  [5, 4], [12, 4], [5, 9], [12, 9], [5, 14], [12, 14],
  [20, 4], [27, 4], [20, 9], [27, 9], [20, 14], [27, 14],
];
const BOX_COORDS: readonly (readonly [number, number])[] = [
  [1, 3], [8, 3], [1, 8], [8, 8], [1, 13], [8, 13],
  [16, 3], [23, 3], [16, 8], [23, 8], [16, 13], [23, 13],
];
/** sSelectedMonLevelGenderCoords: the level box once only the picked Pokémon shows. */
const SELECTED_BOX: readonly (readonly [number, number])[] = [
  [4, 3],
  [19, 3],
];

/** BG1's level digits and gender symbols (menu.png). */
const TENS_TILE = 0x60;
const ONES_TILE = 0x70;
const NO_GENDER_TILE = 0x83;
const MALE_TILE = 0x84;
const FEMALE_TILE = 0x85;

/** BG0: the user's frame at 1 (palette 14), the standard frame at 0x14 (palette 12). */
const USER_FRAME_TILE = 0x001;
const USER_FRAME_PALETTE = 14;
const STD_FRAME_TILE = 0x014;
const STD_FRAME_PALETTE = 12;
const BG0_TILES = 0x280;

/** sWindowTemplates. */
const MESSAGE_WINDOW: WindowTemplate = { left: 4, top: 7, width: 22, height: 4, palette: 15, baseBlock: 0x01e };
const ACTION_WINDOW: WindowTemplate = { left: 17, top: 15, width: 12, height: 4, palette: 15, baseBlock: 0x076 };
const NICKNAME_LEFT = [0, 7, 0, 7, 0, 7, 15, 22, 15, 22, 15, 22];
const NICKNAME_TOP = [5, 5, 10, 10, 15, 15, 5, 5, 10, 10, 15, 15];
const nicknameWindow = (i: number): WindowTemplate => ({ left: NICKNAME_LEFT[i], top: NICKNAME_TOP[i], width: 8, height: 2, palette: 13, baseBlock: 0x0a6 + i * 0x10 });
/** Windows 14-17: the picked Pokémon's name and moves, by side. */
const SELECTED_NAME_WINDOWS: readonly WindowTemplate[] = [
  { left: 2, top: 5, width: 14, height: 2, palette: 13, baseBlock: 0x166 },
  { left: 17, top: 5, width: 14, height: 2, palette: 15, baseBlock: 0x1da },
];
const SELECTED_MOVES_WINDOWS: readonly WindowTemplate[] = [
  { left: 3, top: 8, width: 11, height: 8, palette: 15, baseBlock: 0x182 },
  { left: 18, top: 8, width: 11, height: 8, palette: 15, baseBlock: 0x1f6 },
];
const YES_NO_WINDOW: WindowTemplate = { left: 21, top: 13, width: 6, height: 4, palette: 15, baseBlock: 0x24e };

/** sTextColor_PartyMonNickname. */
const NICKNAME_COLORS = [0, 1, 2] as const;
/** DrawTextWindowAndBufferTiles: TEXT_DYNAMIC_COLOR_6 on TEXT_DYNAMIC_COLOR_5's shadow. */
const SPRITE_TEXT_COLORS = [0, 15, 14] as const;
const NEWLINE: Text = [0xfe];

/** Frames the picked Pokémon takes to move up (Trade_MoveSelectedMonToTarget). */
const SELECTED_MOVE_FRAMES = 20;
/** CB_InitConfirmTradePrompt: YES/NO opens this long after "Is this trade okay?". */
const CONFIRM_DELAY = 120;
/** QUEUE_DELAY_MSG. */
const MESSAGE_DELAY = 3;
/** After a trade, before the screen fades (M10's scene goes there). */
const AFTER_TRADE_FRAMES = 16;

const CURSOR_TEMPLATE: SpriteTemplate = {
  sheet: "tradeCursor",
  palette: "tradeCursor",
  width: 64,
  height: 32,
  priority: 1,
  anims: [[{ image: 0, duration: 5 }, "end"], [{ image: 32, duration: 5 }, "end"]],
};
const TEXT_ANIMS: AnimCmd[][] = [0, 1, 2, 3, 4, 5].map((i) => [{ image: i * 8, duration: 5 }, "end"]);
const HELD_ITEM_TEMPLATE: SpriteTemplate = {
  sheet: "tradeHeldItem",
  palette: "tradeHeldItem",
  width: 8,
  height: 8,
  priority: 1,
  anims: [[{ image: 0, duration: 1 }, "end"], [{ image: 1, duration: 1 }, "end"]],
};

/** A slot's icon and the held item mark that follows it (SpriteCB_HeldItem). */
interface MonSprites {
  icon: MonIcon;
  item: Sprite | null;
}

/** An icon moving up to the picked Pokémon's place. */
interface Moving {
  side: number;
  slot: number;
  fromX: number;
  fromY: number;
  frame: number;
}

export class TradeMenu {
  private bg0!: Background;
  private bg1!: Background;
  private parties: Pokemon[][];
  private cursor = 0;
  private cursorSprite!: Sprite;
  private sprites: MonSprites[][] = [[], []];
  private bottomRow!: Uint8Array;
  private nicknames: Window[] = [];
  private message!: Window;
  private action!: Window;
  private actionMenu: CursorMenu | null = null;
  private yesNo: YesNoMenu | null = null;
  private step: () => void = () => {};
  private readonly queue: LinkEvent[] = [];
  /** Off in the summary, or set up again: events wait. */
  private away = false;
  private closing = false;
  /** A trade went through: the menu comes back on the CHOOSING after it. */
  private traded = false;
  private next: TradeState | null = null;
  private music = false;

  constructor(
    private readonly flow: Flow,
    private readonly host: TradeMenuHost,
    state: TradeState,
    private readonly done: (exit: TradeMenuExit) => void,
  ) {
    this.parties = [state.ownParty?.pokemon ?? [], state.otherParty?.pokemon ?? []];
    this.open();
  }

  /** A link event: handled once the screen is up (not in the summary, not fading). */
  event(e: LinkEvent): void {
    this.queue.push(e);
  }

  /** The link ended under the menu (a reconnect, a drop): it fades out and closes. */
  abort(): void {
    this.event(create(LinkEventSchema, { event: { case: "ended", value: true } }));
  }

  /** The species' art (icons and summary), then the screen. */
  private open(): void {
    const { assets } = this.flow;
    this.away = true;
    const species = [...this.parties[PLAYER], ...this.parties[PARTNER]].map((p) => p.species);
    void Promise.all(species.map((s) => assets.pokemonArt(s).catch(() => null))).then(() => this.build());
  }

  /** CB2_CreateTradeMenu (and CB2_ReturnToTradeMenuFromSummary): everything set up on black, then the fade in. */
  private build(): void {
    const { flow } = this;
    const { gba, assets } = flow;
    gba.setVBlank(null);
    gba.reset();
    const { video, palettes, sprites } = gba;
    const [bg0, bg1, bg2, bg3] = video.bgs;
    this.bg0 = bg0;
    this.bg1 = bg1;
    initBg(bg0, 0, 0);
    initBg(bg1, 0, 1);
    initBg(bg2, 0, 2);
    initBg(bg3, 0, 3);
    for (const bg of video.bgs) bg.visible = true;

    // InitTradeMenu: the standard menu colors, the frames.
    const stdMenu = assets.get("stdMenuPal").palette;
    palettes.load(stdMenu, 15 * 16, 10);
    palettes.load(stdMenu, 13 * 16, 10);
    bg0.tiles = new Uint8Array(BG0_TILES * 64);
    copyTiles(bg0, assets.get("stdWindowFrame").tiles, STD_FRAME_TILE, 9);
    palettes.load(assets.get("textWindowPal3").palette, STD_FRAME_PALETTE * 16, 16);
    const frame = assets.get(userFrame(flow.options.frame));
    copyTiles(bg0, frame.tiles, USER_FRAME_TILE, 9);
    palettes.load(frame.palette, USER_FRAME_PALETTE * 16, 16);

    // LoadTradeBgGfx: the menu on BG1, the stripes on BG2 and BG3, all three on its tiles.
    const menu = assets.get("tradeMenu");
    palettes.load(menu.palette, 0, 48);
    bg1.tiles = bg2.tiles = bg3.tiles = menu.tiles;
    this.copyRect(bg1, menu.map!, 32, 0, 0, 32, 20);
    bg2.map.set(assets.get("tradeStripes2").map!.subarray(0, 1024));
    bg3.map.set(assets.get("tradeStripes3").map!.subarray(0, 1024));

    this.message = new Window(bg0, MESSAGE_WINDOW);
    this.action = new Window(bg0, ACTION_WINDOW);
    this.nicknames = Array.from({ length: CANCEL }, (_, i) => new Window(bg0, nicknameWindow(i)));

    // The icons with their held item marks.
    const held = assets.get("partyHoldIcons");
    sprites.loadSheet("tradeHeldItem", held.tiles);
    palettes.loadSpritePalette("tradeHeldItem", held.palette);
    this.sprites = [PLAYER, PARTNER].map((side) =>
      this.parties[side].slice(0, PARTY_SIZE).map((mon, i) => {
        const [x, y] = this.home(side, i);
        const icon = new MonIcon(flow, mon.species, x, y, 1, 1);
        icon.setAnim(iconAnimForHp(hpBarLevel(mon.hp, mon.stats?.hp ?? 0)));
        let item: Sprite | null = null;
        if (mon.heldItem !== Item.UNSPECIFIED) {
          item = sprites.create(HELD_ITEM_TEMPLATE, x + 4, y + 10, 0)!;
          item.startAnim(itemInfo(mon.heldItem)?.fieldUse === FieldUse.MAIL ? 1 : 0);
        }
        return { icon, item };
      }),
    );

    // The names, CANCEL and the bottom row, as text sprites.
    palettes.loadSpritePalette("tradeText", assets.get("tradeTextPal").palette);
    this.textSprites("tradePlayerName", this.host.playerName, 3, (i, w) => [Math.trunc((56 - w) / 2) + 48 + i * 32, 9]);
    this.textSprites("tradePartnerName", this.host.partnerName, 3, (i, w) => [Math.trunc((56 - w) / 2) + 168 + i * 32, 9]);
    this.textSprites("tradeCancel", assets.text("gTradeText_Cancel"), 2, (i) => [215 + i * 32, 151]);
    this.bottomRow = this.textSprites("tradeBottomRow", assets.text("gTradeText_ChooseAPokemon"), 6, (i) => [24 + i * 32, 150]);

    const cursor = assets.get("tradeCursor");
    sprites.loadSheet("tradeCursor", cursor.tiles);
    palettes.loadSpritePalette("tradeCursor", cursor.palette);
    this.cursorSprite = sprites.create(CURSOR_TEMPLATE, 0, 0, 2)!;
    if (!this.active(this.cursor)) this.cursor = 0;
    this.placeCursor();

    for (const side of [PLAYER, PARTNER]) {
      this.printNicknames(side);
      this.printLevels(side);
    }
    // The music plays on through the summary.
    if (!this.music) flow.playBgm("mus_game_corner");
    this.music = true;

    gba.tasks.create(() => this.update(), 0);
    palettes.blendPalettes(PALETTES_ALL, 16, RGB_BLACK);
    palettes.beginFade(PALETTES_ALL, 0, 16, 0, RGB_BLACK);
    gba.setVBlank(gba.standardVBlank);
    gba.setMain(() => flow.runFrame());
    this.away = false;
    this.step = () => this.choose();
  }

  /** Each frame: the stripes scroll, the marks follow their icons, an event or the current step. */
  private update(): void {
    const { gba } = this.flow;
    const [, , bg2, bg3] = gba.video.bgs;
    bg2.x = (bg2.x + 1) & 0xff;
    bg3.x = (bg3.x - 1) & 0xff;
    for (const side of this.sprites)
      for (const s of side) {
        if (!s.item) continue;
        s.item.x = s.icon.sprite.x + s.icon.sprite.x2 + 4;
        s.item.y = s.icon.sprite.y + s.icon.sprite.y2 + 10;
        s.item.invisible = s.icon.sprite.invisible;
      }
    if (!this.away && !this.closing && !gba.palettes.fadeActive) {
      const e = this.queue.shift();
      if (e) return this.handle(e);
    }
    this.step();
  }

  // mic-core's answers

  private handle(e: LinkEvent): void {
    const { event } = e;
    if (event.case === "ended") return this.close("dropped");
    if (event.case === "tradeDone") {
      this.closeMenus();
      this.traded = true;
      let frames = AFTER_TRADE_FRAMES;
      this.step = () => {
        if (--frames > 0) return;
        this.flow.gba.palettes.beginFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
        this.step = () => this.afterTrade();
      };
      return;
    }
    if (event.case !== "tradeState") return;
    const s = event.value;
    switch (s.stage) {
      case TradeStage.CHOOSING:
        if (this.traded) this.next = s;
        return;
      case TradeStage.CONFIRMING:
        return this.showSelected(s.ownPick, s.otherPick);
      case TradeStage.CANCELED:
        return this.showCanceled(s.notice);
      case TradeStage.ENDED:
        return this.close("ended");
    }
  }

  /** Back to the menu once black, with the parties mic-core sent after the trade. */
  private afterTrade(): void {
    const next = this.next;
    if (this.flow.gba.palettes.fadeActive || !next) return;
    this.traded = false;
    this.next = null;
    this.parties = [next.ownParty?.pokemon ?? [], next.otherParty?.pokemon ?? []];
    this.cursor = 0;
    this.step = () => {};
    this.open();
  }

  /** CB_SetSelectedMons and DrawSelectedMonScreen: both picked Pokémon move up, with their moves. */
  private showSelected(own: number, other: number): void {
    this.closeMenus();
    this.clearBox(this.message);
    const moving: Moving[] = [
      [PLAYER, own],
      [PARTNER, other],
    ].map(([side, slot]) => {
      for (const s of this.sprites[side]) s.icon.sprite.invisible = true;
      for (let i = 0; i < PARTY_SIZE; i++) this.nicknames[side * PARTY_SIZE + i].clearTilemap();
      const icon = this.sprites[side][slot]?.icon.sprite;
      if (icon) icon.invisible = false;
      this.copyRect(this.bg1, this.flow.assets.get("tradePartyBox").map!, 15, side * 15, 0, 15, 17);
      return { side, slot, fromX: icon?.x ?? 0, fromY: icon?.y ?? 0, frame: 0 };
    });
    this.step = () => {
      let moved = true;
      for (const m of moving) {
        const icon = this.sprites[m.side][m.slot]?.icon.sprite;
        if (!icon || m.frame >= SELECTED_MOVE_FRAMES) continue;
        m.frame++;
        const [x, y] = this.selectedPlace(m.side);
        icon.x = m.fromX + Math.trunc(((x - m.fromX) * m.frame) / SELECTED_MOVE_FRAMES);
        icon.y = m.fromY + Math.trunc(((y - m.fromY) * m.frame) / SELECTED_MOVE_FRAMES);
        moved &&= m.frame >= SELECTED_MOVE_FRAMES;
      }
      if (!moved) return;
      for (const m of moving) this.drawSelected(m.side, m.slot);
      // PrintIsThisTradeOkay, then CB_InitConfirmTradePrompt.
      this.setBottomRow("gText_IsThisTradeOkay");
      let frames = 0;
      this.step = () => {
        if (++frames <= CONFIRM_DELAY) return;
        this.yesNo = this.newYesNo();
        this.step = () => this.confirm();
      };
    };
  }

  /** The picked Pokémon's place: between its side's first two (x), on their row. */
  private selectedPlace(side: number): [number, number] {
    const a = SPRITE_COORDS[side * PARTY_SIZE];
    const b = SPRITE_COORDS[side * PARTY_SIZE + 1];
    return [Math.trunc((a[0] + b[0]) / 2) * 8 + 14, a[1] * 8 - 12];
  }

  /** DrawSelectedMonScreen's states 3 and 4: the moves box, the name, the moves, the level and gender. */
  private drawSelected(side: number, slot: number): void {
    const { flow } = this;
    const mon = this.parties[side][slot];
    this.copyRect(this.bg1, flow.assets.get("tradeMovesBox").map!, 15, side * 15, 0, 15, 17);
    if (!mon) return;
    const small = flow.fonts[FontId.Small];
    const name = monName(flow, mon);
    const nameWin = new Window(this.bg0, SELECTED_NAME_WINDOWS[side]);
    nameWin.fill(0);
    nameWin.print(small, Math.trunc((80 - small.width(name, small.letterSpacing)) / 2), 4, NICKNAME_COLORS, name);
    nameWin.putTilemap();
    nameWin.copyToVram();
    const moves = new Window(this.bg0, SELECTED_MOVES_WINDOWS[side]);
    moves.fill(0);
    const lines: Text[] = [];
    for (let i = 0; i < 4; i++) {
      const move = mon.moves[i]?.move;
      if (move) lines.push(flow.assets.moveName(move));
      lines.push(NEWLINE);
    }
    moves.print(flow.fonts[FontId.NormalCopy1], 0, 0, NICKNAME_COLORS, joinText(...lines), 0, 0);
    moves.putTilemap();
    moves.copyToVram();
    const [left, top] = SELECTED_BOX[side];
    this.printLevel(mon, left + 4, top + 1, left, top);
  }

  /** CB_ProcessConfirmTradeInput: either answer waits on mic-core. */
  private confirm(): void {
    const answer = this.yesNo!.processInput();
    if (answer === MENU_NOTHING_CHOSEN) return;
    this.yesNo = null;
    this.host.confirm(answer === 0);
    this.delayedMessage("gText_Trade_CommunicationStandby", () => {});
  }

  /** The trade is off for now: FireRed's message, A brings both sides back (CB_HandleTradeCanceled). */
  private showCanceled(notice: TradeNotice): void {
    this.closeMenus();
    const text: TextId =
      notice === TradeNotice.FRIEND_WANTS_TO_TRADE ? "gText_FriendWantsToTrade" : notice === TradeNotice.ONLY_MON ? "gText_Trade_OnlyPkmnForBattle" : "gText_TradeHasBeenCanceled";
    this.showMessage(text);
    this.step = () => this.waitCanceled();
  }

  private waitCanceled(): void {
    if (!this.flow.gba.input.isPressed(Button.A)) return;
    this.flow.play("se_select");
    this.clearBox(this.message);
    this.clearBox(this.action);
    for (const t of [...SELECTED_NAME_WINDOWS, ...SELECTED_MOVES_WINDOWS]) this.clearBox(new Window(this.bg0, t));
    this.redrawSide(PLAYER);
    this.redrawSide(PARTNER);
    this.cursorSprite.invisible = false;
    this.step = () => this.choose();
  }

  // The player's input

  /** CB_ProcessMenuInput. */
  private choose(): void {
    const { flow } = this;
    const { input } = flow.gba;
    for (let d = 0; d < DIRECTIONS.length; d++) {
      if (!input.isRepeated(DIRECTIONS[d])) continue;
      this.moveCursor(d);
      break;
    }
    if (!input.isPressed(Button.A)) return;
    flow.play("se_select");
    if (this.cursor < PARTY_SIZE) {
      drawStdFrame(this.action, USER_FRAME_TILE, USER_FRAME_PALETTE);
      for (const [i, id] of (["gText_TradeAction_Summary", "gText_TradeAction_Trade"] as const).entries()) printDefault(flow, this.action, FontId.NormalCopy2, flow.assets.text(id), 8, i * 16);
      this.actionMenu = new CursorMenu(flow, this.action, FontId.NormalCopy2, 0, 0, 16, 2);
      this.step = () => this.selectedMon();
    } else if (this.cursor < CANCEL) this.openSummary();
    else {
      this.yesNo = this.newYesNo();
      this.setBottomRow("gText_CancelTrade");
      this.step = () => this.cancelTrade();
    }
  }

  /** TradeMenuMoveCursor. */
  private moveCursor(direction: number): void {
    const next = MOVES[this.cursor][direction].find((p) => this.active(p)) ?? 0;
    if (next !== this.cursor) this.flow.play("se_select");
    this.cursor = next;
    this.placeCursor();
  }

  private placeCursor(): void {
    const s = this.cursorSprite;
    if (this.cursor === CANCEL) {
      s.startAnim(1);
      s.x = 240 - 16;
      s.y = 160;
    } else {
      s.startAnim(0);
      const [x, y] = SPRITE_COORDS[this.cursor];
      s.x = x * 8 + 32;
      s.y = y * 8;
    }
  }

  /** A slot with a Pokémon, or CANCEL (SetActiveMenuOptions). */
  private active(position: number): boolean {
    if (position === CANCEL) return true;
    return position < CANCEL && this.parties[Math.trunc(position / PARTY_SIZE)][position % PARTY_SIZE] !== undefined;
  }

  /** CB_ProcessSelectedMonInput: SUMMARY or TRADE. */
  private selectedMon(): void {
    const { flow } = this;
    const answer = this.actionMenu!.processInput(false);
    if (answer === MENU_NOTHING_CHOSEN) return;
    this.actionMenu = null;
    if (answer === MENU_B_PRESSED) {
      flow.play("se_select");
      return this.redrawChoose();
    }
    if (answer === 0) return this.openSummary();
    // CanTradeSelectedMon's CANT_TRADE_LAST_MON: no other Pokémon able to battle; nothing is sent.
    const own = this.parties[PLAYER];
    if (!own.some((mon, i) => i !== this.cursor && mon.hp > 0)) {
      return this.delayedMessage("gText_Trade_OnlyPkmnForBattle", () => (this.step = () => this.waitCanceled()));
    }
    // SetReadyToTrade.
    this.showMessage("gText_Trade_CommunicationStandby");
    this.cursorSprite.invisible = true;
    this.host.offer(this.cursor);
    this.step = () => {};
  }

  /** CB_ProcessCancelTradeInput. */
  private cancelTrade(): void {
    const answer = this.yesNo!.processInput();
    if (answer === MENU_NOTHING_CHOSEN) return;
    this.yesNo = null;
    if (answer === 0) {
      this.showMessage("gText_WaitingForFriendToFinish");
      this.host.cancel();
      this.cursorSprite.invisible = true;
      // RestoreNicknamesCoveredByYesNo.
      for (let i = 4; i < this.parties[PARTNER].length && i < PARTY_SIZE; i++) {
        this.nicknames[PARTY_SIZE + i].putTilemap();
      }
      this.step = () => {};
      return;
    }
    this.flow.play("se_select");
    this.redrawChoose();
  }

  /** RedrawChooseAPokemonWindow. */
  private redrawChoose(): void {
    this.clearBox(this.action);
    this.printNicknames(PARTNER);
    this.cursorSprite.invisible = false;
    this.setBottomRow("gTradeText_ChooseAPokemon");
    this.step = () => this.choose();
  }

  /** CB_ShowTradeMonSummaryScreen: either side's, read only; back with the cursor on the last one shown. */
  private openSummary(): void {
    const { flow } = this;
    const side = this.cursor < PARTY_SIZE ? PLAYER : PARTNER;
    flow.gba.palettes.beginFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
    this.step = () => {
      if (flow.gba.palettes.fadeActive) return;
      this.away = true;
      this.step = () => {};
      const party = new PartyState(create(PartySchema, { pokemon: this.parties[side] }));
      const name = side === PLAYER ? this.host.playerName : this.host.partnerName;
      flow.gba.tasks.reset();
      startSummary(flow, this.host.summaryHost(party, name), this.cursor % PARTY_SIZE, (last) => {
        this.cursor = side * PARTY_SIZE + last;
        this.build();
      });
    };
  }

  // Drawing

  /** A slot's icon place (sTradeMonSpriteCoords). */
  private home(side: number, slot: number): [number, number] {
    const [x, y] = SPRITE_COORDS[side * PARTY_SIZE + slot];
    return [x * 8 + 14, y * 8 - 12];
  }

  /** RedrawPartyWindow. */
  private redrawSide(side: number): void {
    this.copyRect(this.bg1, this.flow.assets.get("tradePartyBox").map!, 15, side * 15, 0, 15, 17);
    this.printLevels(side);
    this.printNicknames(side);
    this.sprites[side].forEach((s, i) => {
      const [x, y] = this.home(side, i);
      Object.assign(s.icon.sprite, { invisible: false, x, y, x2: 0, y2: 0 });
    });
    this.setBottomRow("gTradeText_ChooseAPokemon");
  }

  /** PrintPartyNicknames. */
  private printNicknames(side: number): void {
    const { flow } = this;
    const small = flow.fonts[FontId.Small];
    this.parties[side].slice(0, PARTY_SIZE).forEach((mon, i) => {
      const win = this.nicknames[side * PARTY_SIZE + i];
      const name = monName(flow, mon);
      win.fill(0);
      win.print(small, Math.trunc((64 - small.width(name, small.letterSpacing)) / 2), 4, NICKNAME_COLORS, name);
      win.putTilemap();
      win.copyToVram();
    });
  }

  /** PrintPartyLevelsAndGenders. */
  private printLevels(side: number): void {
    this.parties[side].slice(0, PARTY_SIZE).forEach((mon, i) => {
      const j = side * PARTY_SIZE + i;
      this.printLevel(mon, LEVEL_COORDS[j][0], LEVEL_COORDS[j][1], BOX_COORDS[j][0], BOX_COORDS[j][1]);
    });
  }

  /** PrintLevelAndGender: the box, the level's digits and the gender symbol, as BG1 tiles. */
  private printLevel(mon: Pokemon, x: number, y: number, boxLeft: number, boxTop: number): void {
    const bg = this.bg1;
    this.copyRect(bg, this.flow.assets.get("tradeMonBox").map!, 6, boxLeft, boxTop, 6, 3);
    const tens = Math.trunc(mon.level / 10);
    if (tens !== 0) bg.setEntry(x, y, TENS_TILE + tens);
    bg.setEntry(x + 1, y, ONES_TILE + (mon.level % 10));
    const gender = shownGender(mon);
    bg.setEntry(x + 1, y - 1, gender === MonGender.MALE ? MALE_TILE : gender === MonGender.FEMALE ? FEMALE_TILE : NO_GENDER_TILE);
  }

  /** DrawTextWindowAndBufferTiles: `count` 32×16 sprites showing a text; their tiles (to print another text into). */
  private textSprites(tag: string, text: Text, count: number, at: (i: number, width: number) => [number, number]): Uint8Array {
    const { gba } = this.flow;
    const tiles = this.textTiles(text);
    gba.sprites.loadSheet(tag, tiles);
    const width = this.flow.fonts[FontId.NormalCopy1].width(text, 0);
    const template: SpriteTemplate = { sheet: tag, palette: "tradeText", width: 32, height: 16, priority: 1, anims: TEXT_ANIMS };
    for (let i = 0; i < count; i++) {
      const [x, y] = at(i, width);
      gba.sprites.create(template, x, y, 1)!.startAnim(i);
    }
    return tiles;
  }

  private textTiles(text: Text): Uint8Array {
    const buffer = new Window(this.bg0, { left: 0, top: 0, width: 24, height: 2, palette: 0, baseBlock: 0 });
    buffer.print(this.flow.fonts[FontId.NormalCopy1], 0, 2, SPRITE_TEXT_COLORS, text, 0, 0);
    return toTiles({ width: 192, height: 16, pixels: buffer.pixels, palette: null }, [4, 2]);
  }

  /** DrawBottomRowText. */
  private setBottomRow(id: TextId): void {
    this.bottomRow.set(this.textTiles(this.flow.assets.text(id)));
  }

  /** PrintTradeMessage: in the standard frame. */
  private showMessage(id: TextId): void {
    drawStdFrame(this.message, STD_FRAME_TILE, STD_FRAME_PALETTE);
    printDefault(this.flow, this.message, FontId.NormalCopy2, this.flow.assets.text(id), 0, 2);
  }

  private pendingMessage: { id: TextId; frames: number } | null = null;

  /** QueueAction(QUEUE_DELAY_MSG, …): the message a few frames later. */
  private delayedMessage(id: TextId, then: () => void): void {
    this.pendingMessage = { id, frames: MESSAGE_DELAY };
    this.step = () => {
      this.waitDelayed();
      if (!this.pendingMessage) {
        this.step = () => {};
        then();
      }
    };
  }

  private waitDelayed(): void {
    const m = this.pendingMessage;
    if (!m) return;
    if (m.frames-- > 0) return;
    this.pendingMessage = null;
    this.showMessage(m.id);
  }

  private newYesNo(): YesNoMenu {
    return new YesNoMenu(this.flow, this.bg0, YES_NO_WINDOW, FontId.NormalCopy2, 0, 2, 0, USER_FRAME_TILE, USER_FRAME_PALETTE);
  }

  /** What's open on the screen goes when mic-core moves on (the action box stays, as in FireRed). */
  private closeMenus(): void {
    this.yesNo?.close();
    this.yesNo = null;
    this.actionMenu = null;
    this.pendingMessage = null;
  }

  /** rbox_fill_rectangle: a window and its frame back to transparent. */
  private clearBox(win: Window): void {
    const { left, top, width, height } = win.template;
    fillBgRect(this.bg0, 0, left - 1, top - 1, width + 2, height + 2, 0);
  }

  /** CopyToBgTilemapBufferRect_ChangePalette(…, 0): a tilemap's rectangle, in palette 0. */
  private copyRect(bg: Background, map: Uint16Array, mapWidth: number, left: number, top: number, width: number, height: number): void {
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) bg.setEntry(left + x, top + y, (map[y * mapWidth + x] ?? 0) & 0xfff);
  }

  /** Fades out and closes (CB_InitExitCanceledTrade, or the link gone). */
  private close(exit: TradeMenuExit): void {
    const { gba } = this.flow;
    this.closeMenus();
    this.closing = true;
    gba.palettes.beginFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
    this.step = () => {
      if (gba.palettes.fadeActive) return;
      this.step = () => {};
      gba.tasks.reset();
      this.done(exit);
    };
  }
}
