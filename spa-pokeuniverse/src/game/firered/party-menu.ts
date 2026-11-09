// The party menu (party_menu.c), single layout: the first Pokémon in the big box on the left,
// the others in the boxes on the right, CANCEL below; each box shows the icon (bouncing while
// selected, faster the more HP it has), the held item's mark, the status, name, level, gender
// and HP. Opened from the START menu (PARTY_MENU_TYPE_FIELD) A opens SUMMARY, SWITCH (the two
// boxes slide out and back in swapped), ITEM (GIVE from the bag, TAKE) and CANCEL; opened to
// give an item (GIVE in the BAG, TM CASE, BERRY POUCH or the PC's WITHDRAW ITEM) A gives it.
// In battle (phase-5 M7) it shows the battle's party: SHIFT, SUMMARY, CANCEL, or A picks
// the Pokémon a bag item is for; after a faint it can't be cancelled. Field moves come with the
// outdoor maps, using items on Pokémon with their effects. mic-core decides every change; this shows it.

import { create } from "@bufbuild/protobuf";
import type { ItemGrowth, ItemResult } from "@pokeuniverse/contracts/item/v1/bag";
import { ItemGrowthSchema, ItemOutcome } from "@pokeuniverse/contracts/item/v1/bag";
import { BattleUse, FieldUse, Item, Pocket, type ItemEffect } from "@pokeuniverse/contracts/item/v1/catalog";
import { Move } from "@pokeuniverse/contracts/move/v1/catalog";
import { FieldMoveOutcome, type FieldMoveResult, type Pokemon } from "@pokeuniverse/contracts/party/v1/party";
import { Gender as MonGender, Status } from "@pokeuniverse/contracts/pokemon/v1/pokemon";
import { Stat, type Stats } from "@pokeuniverse/contracts/pokemon/v1/stats";
import { ButtonMode, type Gender } from "@pokeuniverse/contracts/trainer/v1/trainer";
import { Button } from "../gba/input";
import { PALETTES_ALL } from "../gba/palette";
import type { Sprite, SpriteTemplate } from "../gba/sprites";
import { decimalText, expandPlaceholders, FontId, joinText, NumberMode, PLACEHOLDER_STR_VAR_1, PLACEHOLDER_STR_VAR_2, Window, type Text, type WindowTemplate } from "../gba/text";
import { RGB_BLACK, type Background } from "../gba/video";
import { itemInfo, itemWorksOn } from "../world/items";
import { itemEvolves, MachineAnswer, machineAnswer, tmMove } from "../world/moves";
import type { PartyState } from "../world/party";
import { BagLocation, startBag, type BagExit, type BagHost } from "./bag";
import { fillBgRect, initBg } from "./common";
import type { Flow } from "./flow";
import { hpBarLevel, HpBarLevel, scaledHpFraction } from "./hp-bar";
import type { TextId } from "./manifest";
import { userFrame } from "./manifest";
import { clearStdWindowAndFrameToTransparent, copyTiles, CursorMenu, drawStdFrame, MENU_B_PRESSED, MENU_NOTHING_CHOSEN, printDefault, YesNoMenu } from "./menu";
import { iconAnimForHp, MonIcon } from "./mon-icon";
import { textSpeedDelay } from "./options";
import { levelUpGains, levelUpTotals } from "./battle/level-up";
import { startFieldEvolution, type GrowthHost } from "./field-evolution";
import { FORGET_NONE, startSummary } from "./summary";
import { startUseItemScene } from "./use-item-scene";

/** The trainer's Pokémon and what the party menu asks mic-core; the overworld answers. */
export interface PartyHost {
  readonly party: PartyState;
  readonly playerName: Text;
  /** The trainer's gender: the bag GIVE opens is the boy's or the girl's. */
  readonly gender: Gender;
  /** The National Pokédex is on: the summary shows numbers past 151. */
  readonly nationalDex: boolean;
  /** The bag GIVE opens. */
  readonly bag: BagHost;
  /** A bag item is used on a Pokémon (`moveSlot`: the move, for items that ask). */
  useItem(item: Item, slot: number, moveSlot: number): Promise<ItemResult>;
  /** What a RARE CANDY or an evolution item needs after it; the field's only. */
  readonly growth?: GrowthHost;
  /** A Pokémon holds the item, from the bag or the PC (`pc`). */
  give(item: Item, slot: number, pc: boolean): Promise<ItemResult>;
  take(slot: number): Promise<ItemResult>;
  /** SWITCH: shown at once, mic-core corrects a refused one. */
  swap(a: number, b: number): void;
  /** The summary's SWITCH of two moves: shown at once, like `swap`. */
  swapMoves(slot: number, a: number, b: number): void;
  /** The summary can't switch moves: a box Pokémon's, until phase-6 M7. */
  readonly movesLocked?: boolean;
  /** A field move, then again with its `target` if it asks for one; the field's only. */
  useFieldMove?(slot: number, move: Move, target?: number): Promise<FieldMoveResult>;
}

/**
 * Why the menu is open: from the START menu, to give an item (from the bag or the PC), to use
 * one (phase-6 M1), or in battle (PARTY_MENU_TYPE_IN_BATTLE: the battle's party, the one in battle first). In battle
 * SHIFT (or A, with a bag item to use) calls `choose` with the slot; `forced` (a Pokémon fainted)
 * can't be cancelled.
 */
export type PartyMenuMode =
  | { kind: "field" }
  | { kind: "give"; item: Item; pc: boolean }
  | { kind: "use"; item: Item }
  | {
      kind: "battle";
      forced: boolean;
      item?: Item;
      /** The menu's slot holds a Pokémon on the field. */
      inBattle: (slot: number) => boolean;
      /** The menu's slot the partner is already switching to (doubles). */
      selected?: number;
      choose: (slot: number, moveSlot?: number) => void;
    };

/** What the field menu does once it shows again after a screen it opened (summary, bag). */
type Resume =
  | { slot: number; then: "selection" }
  | { slot: number; then: "give"; item: Item }
  /** Back from the item scene: the effect, already saved, shown from the box as it was. */
  | { slot: number; then: "used"; item: Item; moveSlot: number; hp: number; ailment: Ailment }
  /** Back from a RARE CANDY's scene: the level up, saved already. */
  | { slot: number; then: "leveled"; growth: ItemGrowth; stats: Stats | undefined; level: number; hp: number; ailment: Ailment }
  /** Back from a TM or HM's scene, stopped with B: the move's message and fanfare. */
  | { slot: number; then: "taught"; move: number }
  /** Back from the summary's forget screen: what the player picked, then the moves still waiting. */
  | { slot: number; then: "forgot"; growth: ItemGrowth; move: number; row: number };

/**
 * Loads the party set and every party Pokémon's art on the black screen, then shows the party
 * menu; `done` once it faded out.
 */
export function startPartyMenu(flow: Flow, host: PartyHost, mode: PartyMenuMode, done: () => void, resume?: Resume): void {
  flow.gba.setMain(() => {});
  const { assets } = flow;
  void Promise.all([assets.loadParty(), ...host.party.pokemon.map((p) => assets.pokemonArt(p.species).catch(() => null))]).then(
    () => new PartyMenu(flow, host, mode, done, resume),
    () => done(),
  );
}

const PARTY_SIZE = 6;
const MAX_MOVES = 4;
const SLOT_CONFIRM = PARTY_SIZE;
const SLOT_CANCEL = PARTY_SIZE + 1;

/** gPartyMenu.action. */
const enum Action {
  ChooseMon,
  Switch,
  Switching,
  Give,
  /** PARTY_ACTION_SOFTBOILED: choosing who Milk Drink or Softboiled heals. */
  ShareHp,
}

/** gText_ItemEffect_*: what a vitamin raises. */
const EV_STAT_TEXTS: Partial<Record<Stat, TextId>> = {
  [Stat.HP]: "gText_ItemEffect_HP",
  [Stat.ATTACK]: "gText_ItemEffect_Attack",
  [Stat.DEFENSE]: "gText_ItemEffect_Defense",
  [Stat.SPEED]: "gText_ItemEffect_Speed",
  [Stat.SP_ATTACK]: "gText_ItemEffect_SpAtk",
  [Stat.SP_DEFENSE]: "gText_ItemEffect_SpDef",
};

/** GetMedicineItemEffectMessage, from the item's catalog entry. */
function medicineTextId(e: ItemEffect): TextId {
  if (e.evStat) return "gText_PkmnBaseVar2StatIncreased";
  if (e.ppUp || e.ppMaxUp) return "gText_MovesPPIncreased";
  if (e.pp || e.ppMax) return "gText_PPWasRestored";
  if (e.cures.length > 2) return "gText_PkmnBecameHealthy";
  switch (e.cures[0]) {
    case Status.POISON:
    case Status.TOXIC:
      return "gText_PkmnCuredOfPoison";
    case Status.SLEEP:
      return "gText_PkmnWokeUp2";
    case Status.BURN:
      return "gText_PkmnBurnHealed";
    case Status.FREEZE:
      return "gText_PkmnThawedOut";
    case Status.PARALYSIS:
      return "gText_PkmnCuredOfParalysis";
    default:
      return "gText_WontHaveEffect";
  }
}

/** sPartyBoxInfoRects: where each part of a box goes, in pixels. */
interface BoxRects {
  /** The box's tiles (sSlotTilemap_*), without the HP for a description, and its width in tiles. */
  tiles: "partySlotMain" | "partySlotWide";
  tilesNoHp: "partySlotMainNoHp" | "partySlotWideNoHp";
  width: number;
  height: number;
  nickname: [number, number];
  level: [number, number];
  gender: [number, number];
  hp: [number, number];
  maxHp: [number, number];
  /** x, y, width. */
  hpBar: [number, number, number];
  /** Where ABLE! and the like go. */
  description: [number, number];
}
const LEFT_COLUMN: BoxRects = {
  tiles: "partySlotMain",
  tilesNoHp: "partySlotMainNoHp",
  width: 10,
  height: 7,
  nickname: [24, 11],
  level: [32, 20],
  gender: [64, 20],
  hp: [38, 36],
  maxHp: [53, 36],
  hpBar: [24, 35, 48],
  description: [12, 34],
};
const RIGHT_COLUMN: BoxRects = {
  tiles: "partySlotWide",
  tilesNoHp: "partySlotWideNoHp",
  width: 18,
  height: 3,
  nickname: [22, 3],
  level: [32, 12],
  gender: [64, 12],
  hp: [102, 12],
  maxHp: [117, 12],
  hpBar: [88, 10, 48],
  description: [77, 4],
};

/** sPartyMenuSpriteCoords (single layout): icon, held item, status and Poké Ball. */
const SPRITE_COORDS: readonly (readonly [number, number, number, number, number, number, number, number])[] = [
  [16, 40, 20, 50, 56, 52, 16, 34],
  [104, 18, 108, 28, 144, 27, 102, 25],
  [104, 42, 108, 52, 144, 51, 102, 49],
  [104, 66, 108, 76, 144, 75, 102, 73],
  [104, 90, 108, 100, 144, 99, 102, 97],
  [104, 114, 108, 124, 144, 123, 102, 121],
];

/** sSinglePartyMenuWindowTemplate: a box per slot, then the message window. */
const BOX_WINDOWS: WindowTemplate[] = [
  { left: 1, top: 3, width: 10, height: 7, palette: 3, baseBlock: 0x63 },
  { left: 12, top: 1, width: 18, height: 3, palette: 4, baseBlock: 0xa9 },
  { left: 12, top: 4, width: 18, height: 3, palette: 5, baseBlock: 0xdf },
  { left: 12, top: 7, width: 18, height: 3, palette: 6, baseBlock: 0x115 },
  { left: 12, top: 10, width: 18, height: 3, palette: 7, baseBlock: 0x14b },
  { left: 12, top: 13, width: 18, height: 3, palette: 8, baseBlock: 0x181 },
];
const MESSAGE_WINDOW: WindowTemplate = { left: 1, top: 15, width: 28, height: 4, palette: 14, baseBlock: 0x1df };
const CANCEL_WINDOW: WindowTemplate = { left: 24, top: 17, width: 6, height: 2, palette: 3, baseBlock: 0x1c7 };
/** The std messages' windows (DisplayPartyMenuStdMessage), by message. */
const STD_MESSAGE_WINDOW: WindowTemplate = { left: 1, top: 17, width: 21, height: 2, palette: 15, baseBlock: 0x24f };
const DO_WHAT_WITH_MON_WINDOW: WindowTemplate = { left: 1, top: 17, width: 16, height: 2, palette: 15, baseBlock: 0x279 };
const DO_WHAT_WITH_ITEM_WINDOW: WindowTemplate = { left: 1, top: 17, width: 19, height: 2, palette: 15, baseBlock: 0x299 };
const WHICH_MOVE_WINDOW: WindowTemplate = { left: 1, top: 17, width: 15, height: 2, palette: 15, baseBlock: 0x299 };
const MOVE_SELECT_WINDOW: WindowTemplate = { left: 18, top: 11, width: 11, height: 8, palette: 14, baseBlock: 0x2bf };
const ITEM_GIVE_TAKE_WINDOW: WindowTemplate = { left: 22, top: 13, width: 7, height: 6, palette: 14, baseBlock: 0x373 };
/** sLevelUpStatsWindowTemplate. */
const LEVEL_UP_WINDOW: WindowTemplate = { left: 19, top: 1, width: 10, height: 11, palette: 14, baseBlock: 0x2bf };
const YES_NO_WINDOW: WindowTemplate = { left: 21, top: 9, width: 6, height: 4, palette: 14, baseBlock: 0x2bf };

/** BG0's, BG1's and BG2's shared tiles (one char base), the last window's ending under 0x400. */
const TILES = 0x400;
/** InitPartyMenuWindows: the user's frame (palette 13) and the standard frame (palette 15). */
const USER_FRAME_TILE = 0x4f;
const USER_FRAME_PALETTE = 13;
const STD_FRAME_TILE = 0x58;
const STD_FRAME_PALETTE = 15;

/** sFontColorTable. */
const COLORS_DEFAULT = [0, 3, 2] as const;
const COLORS_GENDER = [0, 11, 12] as const;
const COLORS_ACTIONS = [1, 2, 3] as const;

/** Colors of a box's palette and where they're copied from in the loaded ones (LoadPartyBoxPalette). */
const BOX_PAL_OFFSETS_1 = [4, 5, 6];
const BOX_PAL_OFFSETS_2 = [1, 7, 8];
const GENDER_PAL_OFFSETS = [11, 12];
const HP_BAR_PAL_OFFSETS = [9, 10];
const PALS = {
  male: [59, 60],
  female: [75, 76],
  hpGreen: [57, 58],
  hpYellow: [73, 74],
  hpRed: [89, 90],
  empty1: [52, 53, 54],
  fainted1: [84, 85, 86],
  current1: [116, 117, 118],
  currentFainted: [148, 149, 150],
  action1: [100, 101, 102],
  empty2: [49, 55, 56],
  fainted2: [81, 87, 88],
  current2: [97, 103, 104],
  action2: [161, 167, 168],
};
/** The party background's 11 palettes. */
const BG_PALETTE_COLORS = 11 * 16;

/** The cursor options (sCursorOptions) the field shows. */
const enum Option {
  Shift,
  Summary,
  Switch,
  Cancel1,
  Item,
  Give,
  Take,
  Cancel2,
  /** CURSOR_OPTION_FIELD_MOVES: from here, this plus the move. */
  FieldMoves,
}
const OPTION_TEXTS: Partial<Record<Option, TextId>> = {
  [Option.Shift]: "gText_Shift",
  [Option.Summary]: "gText_Summary5",
  [Option.Switch]: "gText_Switch2",
  [Option.Cancel1]: "gFameCheckerText_Cancel",
  [Option.Item]: "gText_Item",
  [Option.Give]: "gOtherText_Give",
  [Option.Take]: "gText_Take",
  [Option.Cancel2]: "gFameCheckerText_Cancel",
};

/** sFieldMoves: the moves a party Pokémon's menu lists. */
const FIELD_MOVES: ReadonlySet<Move> = new Set([
  Move.FLASH,
  Move.CUT,
  Move.FLY,
  Move.STRENGTH,
  Move.SURF,
  Move.ROCK_SMASH,
  Move.WATERFALL,
  Move.TELEPORT,
  Move.DIG,
  Move.MILK_DRINK,
  Move.SOFT_BOILED,
  Move.SWEET_SCENT,
]);
/** sFontColorTable's field moves: the options in blue. */
const COLORS_FIELD_MOVES = [1, 8, 9] as const;

/** The std messages (sActionStringTable) and their windows. */
const enum Message {
  None,
  ChooseMon,
  MoveToWhere,
  GiveToWhichMon,
  DoWhatWithMon,
  DoWhatWithItem,
  RestoreWhichMove,
  BoostPpWhichMove,
  UseOnWhichMon,
  TeachWhichMon,
  CantUseHere,
  NothingToCut,
  CantSurfHere,
  NotEnoughHp,
}

const STD_MESSAGE_TEXTS: Partial<Record<Message, TextId>> = {
  [Message.MoveToWhere]: "gText_MoveToWhere",
  [Message.GiveToWhichMon]: "gText_GiveToWhichPokemon",
  [Message.DoWhatWithMon]: "gText_DoWhatWithPokemon",
  [Message.DoWhatWithItem]: "gText_DoWhatWithItem",
  [Message.RestoreWhichMove]: "gText_RestoreWhichMove",
  [Message.BoostPpWhichMove]: "gText_BoostPp",
  [Message.UseOnWhichMon]: "gText_UseOnWhichPokemon",
  [Message.TeachWhichMon]: "gText_TeachWhichPokemon",
  [Message.CantUseHere]: "gText_CantUseHere",
  [Message.NothingToCut]: "gText_NothingToCut",
  [Message.CantSurfHere]: "gText_CantSurfHere",
  [Message.NotEnoughHp]: "gText_NotEnoughHp",
};

/** What a field move's refusal says (sFieldMoveCursorCallbacks' msgId). */
const FIELD_MOVE_REFUSALS: Partial<Record<FieldMoveOutcome, Message>> = {
  [FieldMoveOutcome.NOTHING_TO_CUT]: Message.NothingToCut,
  [FieldMoveOutcome.CANT_SURF_HERE]: Message.CantSurfHere,
  [FieldMoveOutcome.NOT_ENOUGH_HP]: Message.NotEnoughHp,
};

const HELD_ITEM_TEMPLATE: SpriteTemplate = {
  sheet: "partyHeldItem",
  palette: "partyHeldItem",
  width: 8,
  height: 8,
  priority: 1,
  anims: [[{ image: 0, duration: 1 }, "end"], [{ image: 1, duration: 1 }, "end"]],
};
const POKEBALL_TEMPLATE: SpriteTemplate = {
  sheet: "partyPokeball",
  palette: "partyPokeball",
  width: 32,
  height: 32,
  priority: 1,
  anims: [[{ image: 0, duration: 0 }, "end"], [{ image: 16, duration: 0 }, "end"]],
};
/** sSpriteTemplate_StatusIcons: PSN, PRZ, SLP, FRZ, BRN, PKRS, FNT. */
export const STATUS_ICON_TEMPLATE: SpriteTemplate = {
  sheet: "statusIcons",
  palette: "statusIcons",
  width: 32,
  height: 8,
  priority: 1,
  anims: [0, 4, 8, 12, 16, 20, 24, 28].map((image) => [{ image, duration: 0 }, "end"]),
};

/** The ailments (AILMENT_*), as the status icons' animations plus one. */
export const enum Ailment {
  None,
  Poison,
  Paralysis,
  Sleep,
  Freeze,
  Burn,
  Pokerus,
  Fainted,
}

/** GetMonAilment: fainted, else its status condition (Pokérus comes with it). */
export function ailmentOf(mon: Pokemon): Ailment {
  if (mon.hp === 0) return Ailment.Fainted;
  switch (mon.status) {
    case Status.POISON:
    case Status.TOXIC:
      return Ailment.Poison;
    case Status.PARALYSIS:
      return Ailment.Paralysis;
    case Status.SLEEP:
      return Ailment.Sleep;
    case Status.FREEZE:
      return Ailment.Freeze;
    case Status.BURN:
      return Ailment.Burn;
    default:
      return Ailment.None;
  }
}

/** GetMonNickname: its nickname, or its species' name. */
export function monName(flow: Flow, mon: Pokemon): Text {
  return mon.nickname ? flow.encode(mon.nickname) : flow.assets.species(mon.species).name;
}

/** NIDORAN♀ and NIDORAN♂ named after their species show no gender symbol: it's in the name. */
const NIDORAN_F = 29;
const NIDORAN_M = 32;

/** The gender symbol it shows: none when genderless or a NIDORAN named after its species. */
export function shownGender(mon: Pokemon): MonGender {
  if ((mon.species === NIDORAN_F || mon.species === NIDORAN_M) && !mon.nickname) return MonGender.UNSPECIFIED;
  return mon.gender === MonGender.MALE || mon.gender === MonGender.FEMALE ? mon.gender : MonGender.UNSPECIFIED;
}

/** A box's sprites. */
interface BoxSprites {
  icon: MonIcon;
  item: Sprite;
  ball: Sprite;
  status: Sprite;
}

/** The slide of SWITCH (Task_SlideSelectedSlotsOffscreen and on), one per box. */
interface Slide {
  slot: number;
  left: number;
  top: number;
  width: number;
  height: number;
  offset: number;
  dir: number;
  /** The box's tilemap, slid along. */
  map: Uint16Array;
}

class PartyMenu {
  private readonly bg0: Background;
  private readonly bg1: Background;
  private readonly bg2: Background;
  private readonly boxes: Window[];
  private readonly sprites: (BoxSprites | null)[] = [];
  private readonly cancelBall: Sprite;
  /** sPartyMenuInternal->palBuffer: the background's colors as loaded, where box colors are copied from. */
  private readonly palBuffer: Uint16Array;
  private action: Action;
  private slotId = 0;
  private slotId2 = 0;
  private lastSelectedSlot = 0;
  /** windowId[0]: the selection window; windowId[1]: the std message. */
  private selection: CursorMenu | null = null;
  private options: Option[] = [];
  /** The move being used while choosing its target (Action.ShareHp). */
  private sharing: Move = Move.UNSPECIFIED;
  private stdMessage: Window | null = null;
  private message: Window;
  private yesNo: YesNoMenu | null = null;
  private slides: Slide[] = [];
  /** The task function running now, one call a frame. */
  private step: () => void = () => this.chooseMonInput();
  /** The screen to open once the menu faded out (sPartyMenuInternal->exitCallback). */
  private exit: (() => void) | null = null;
  /** Back from a screen it opened: PARTY_ACTION_CHOOSE_MON, the boxes as usual. */
  private readonly resumed: boolean;

  constructor(
    private readonly flow: Flow,
    private readonly host: PartyHost,
    private readonly mode: PartyMenuMode,
    private readonly done: () => void,
    resume: Resume | undefined,
  ) {
    const { gba, assets } = flow;
    this.resumed = resume !== undefined;
    this.action = mode.kind === "give" ? Action.Give : Action.ChooseMon;
    if (resume && this.mon(resume.slot)) this.slotId = resume.slot;
    gba.setVBlank(null);
    gba.reset();
    const { video, palettes, sprites } = gba;
    [this.bg0, this.bg1, this.bg2] = video.bgs;
    initBg(this.bg0, 0, 1);
    initBg(this.bg1, 0, 2);
    initBg(this.bg2, 1, 0);
    const tiles = new Uint8Array(TILES * 64);
    for (const bg of [this.bg0, this.bg1, this.bg2]) {
      bg.tiles = tiles;
      bg.visible = true;
    }

    // AllocPartyMenuBgGfx: the background, its colors (palette 3 copied to the boxes' 4 to 8).
    const bg = assets.get("partyBg");
    copyTiles(this.bg1, bg.tiles, 0);
    this.bg1.map.set(bg.map!.subarray(0, this.bg1.map.length));
    palettes.load(bg.palette, 0, BG_PALETTE_COLORS);
    this.palBuffer = Uint16Array.from(bg.palette.subarray(0, BG_PALETTE_COLORS));
    for (let p = 4; p <= 8; p++) palettes.load(bg.palette.subarray(48, 64), p * 16, 16);

    // InitPartyMenuWindows.
    this.boxes = BOX_WINDOWS.map((t) => new Window(this.bg0, t));
    for (const box of this.boxes) box.fill(0);
    const frame = assets.get(userFrame(flow.options.frame));
    copyTiles(this.bg0, frame.tiles, USER_FRAME_TILE, 9);
    palettes.load(frame.palette, USER_FRAME_PALETTE * 16, 16);
    copyTiles(this.bg0, assets.get("stdWindowFrame").tiles, STD_FRAME_TILE, 9);
    palettes.load(assets.get("textWindowPal3").palette, STD_FRAME_PALETTE * 16, 16);
    palettes.load(assets.get("textWindowPal2").palette, 12 * 16, 16);
    palettes.load(assets.get("textWindowPal0").palette, 14 * 16, 16);
    this.message = new Window(this.bg2, MESSAGE_WINDOW);

    // LoadHeldItemIcons, LoadPartyMenuPokeballGfx, LoadPartyMenuAilmentGfx.
    const held = assets.get("partyHoldIcons");
    sprites.loadSheet("partyHeldItem", held.tiles);
    palettes.loadSpritePalette("partyHeldItem", held.palette);
    const ball = assets.get("partyPokeball");
    sprites.loadSheet("partyPokeball", ball.tiles);
    palettes.loadSpritePalette("partyPokeball", ball.palette);
    const status = assets.get("statusIcons");
    sprites.loadSheet("statusIcons", status.tiles);
    palettes.loadSpritePalette("statusIcons", status.palette);

    for (let slot = 0; slot < PARTY_SIZE; slot++) this.sprites.push(this.createSprites(slot));
    for (let slot = 0; slot < PARTY_SIZE; slot++) this.renderBox(slot);
    // CreateCancelConfirmPokeballSprites and CreateCancelConfirmWindows.
    this.cancelBall = sprites.create({ ...POKEBALL_TEMPLATE, priority: 2 }, 198, 148, 8)!;
    this.animateSlot(this.slotId, 1);
    const cancel = new Window(this.bg0, CANCEL_WINDOW);
    cancel.fill(0);
    const small = flow.fonts[FontId.Small];
    const cancelText = assets.text("gFameCheckerText_Cancel");
    cancel.print(small, 3 + Math.trunc((48 - small.width(cancelText, 0)) / 2), 1, COLORS_DEFAULT, cancelText);
    cancel.putTilemap();
    cancel.copyToVram();

    gba.tasks.create(() => this.step(), 0);
    if (mode.kind === "use" && itemInfo(mode.item)?.effect?.allParty) this.step = () => this.useOnWholeParty(mode.item);
    else if (!resume) this.showStdMessage(this.chooseMessage);
    else if (resume.then === "selection") {
      this.showStdMessage(Message.DoWhatWithMon);
      this.openSelection();
    } else if (resume.then === "used") this.showUsed(resume);
    else if (resume.then === "leveled") this.showLeveled(resume);
    else if (resume.then === "taught") this.showTaught(resume.slot, resume.move);
    else if (resume.then === "forgot") this.afterForgetScreen(resume);
    else this.step = () => this.giveFromField(resume.item);

    palettes.blendPalettes(PALETTES_ALL, 16, RGB_BLACK);
    palettes.beginFade(PALETTES_ALL, -2, 16, 0, RGB_BLACK);
    gba.setVBlank(gba.standardVBlank);
    gba.setMain(() => flow.runFrame());
  }

  private get party(): readonly Pokemon[] {
    return this.host.party.pokemon;
  }

  private mon(slot: number): Pokemon | undefined {
    return slot < PARTY_SIZE ? this.party[slot] : undefined;
  }

  // The boxes

  /** CreatePartyMonSprites: the icon, held item mark, Poké Ball and status of a slot with a Pokémon. */
  private createSprites(slot: number): BoxSprites | null {
    const mon = this.mon(slot);
    if (!mon) return null;
    const { flow } = this;
    const { sprites } = flow.gba;
    const c = SPRITE_COORDS[slot];
    const icon = new MonIcon(flow, mon.species, c[0], c[1], 4, 1);
    icon.setAnim(iconAnimForHp(hpBarLevel(mon.hp, mon.stats?.hp ?? 0)));
    const item = sprites.create(HELD_ITEM_TEMPLATE, c[2], c[3], 0)!;
    const ball = sprites.create(POKEBALL_TEMPLATE, c[6], c[7], 8)!;
    const status = sprites.create(STATUS_ICON_TEMPLATE, c[4], c[5], 0)!;
    const box = { icon, item, ball, status };
    this.showHeldItem(box, mon.heldItem);
    this.showAilment(box, ailmentOf(mon));
    return box;
  }

  /** ShowOrHideHeldItemSprite: the item's mark, or MAIL's. */
  private showHeldItem(box: BoxSprites, item: Item): void {
    box.item.invisible = item === Item.UNSPECIFIED;
    if (item !== Item.UNSPECIFIED) box.item.startAnim(itemInfo(item)?.fieldUse === FieldUse.MAIL ? 1 : 0);
  }

  /** UpdatePartyMonAilmentGfx. */
  private showAilment(box: BoxSprites, ailment: Ailment): void {
    box.status.invisible = ailment === Ailment.None || ailment === Ailment.Pokerus;
    if (!box.status.invisible) box.status.startAnim(ailment - 1);
  }

  private rects(slot: number): BoxRects {
    return slot === 0 ? LEFT_COLUMN : RIGHT_COLUMN;
  }

  /** RenderPartyMenuBox: an empty box, or the Pokémon's, its colors as selected or not. */
  private renderBox(slot: number): void {
    const box = this.boxes[slot];
    if (!this.mon(slot)) {
      this.blitBox(box, "partySlotWideEmpty", 18, 18, 3);
      box.copyToVram();
    } else {
      this.displayData(slot);
      this.animateSlot(slot, this.slotId === slot ? 1 : 0);
    }
    box.putTilemap();
  }

  /** BlitBitmapToPartyWindow: the box's tiles, by the layout's tile numbers in the background's. */
  private blitBox(win: Window, layout: "partySlotMain" | "partySlotMainNoHp" | "partySlotWide" | "partySlotWideNoHp" | "partySlotWideEmpty", stride: number, width: number, height: number): void {
    const { assets } = this.flow;
    const numbers = assets.get(layout).bytes!;
    const tiles = assets.get("partyBg").tiles;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) win.copyTile(tiles, numbers[x + y * stride], x, y);
  }

  /** DisplayPartyPokemonData: the box, name, level (unless it has an ailment), gender, HP and its bar. */
  private displayData(slot: number, shownHp?: number, shownAilment?: Ailment, shownLevel?: number): void {
    const { flow } = this;
    const { assets } = flow;
    const mon = this.mon(slot)!;
    const win = this.boxes[slot];
    const r = this.rects(slot);
    const small = flow.fonts[FontId.Small];
    const description = this.description(mon);
    this.blitBox(win, description ? r.tilesNoHp : r.tiles, r.width, r.width, r.height);
    const name = monName(flow, mon);
    win.print(small, r.nickname[0], r.nickname[1], COLORS_DEFAULT, name);
    const ailment = shownAilment ?? ailmentOf(mon);
    if (ailment === Ailment.None || ailment === Ailment.Pokerus)
      win.print(small, r.level[0], r.level[1], COLORS_DEFAULT, joinText(assets.text("gText_Lv"), decimalText(shownLevel ?? mon.level, NumberMode.LeftAlign, 3)));
    const gender = shownGender(mon);
    if (gender !== MonGender.UNSPECIFIED) {
      const male = gender === MonGender.MALE;
      this.loadBoxColors(slot, male ? PALS.male : PALS.female, GENDER_PAL_OFFSETS);
      win.print(small, r.gender[0], r.gender[1], COLORS_GENDER, assets.text(male ? "gText_MaleSymbol" : "gText_FemaleSymbol"));
    }
    if (description) {
      win.print(flow.fonts[FontId.NormalCopy1], r.description[0], r.description[1], COLORS_DEFAULT, assets.text(description));
      return win.copyToVram();
    }
    const maxHp = mon.stats?.hp ?? 0;
    const hp = shownHp ?? mon.hp;
    win.print(small, r.hp[0], r.hp[1], COLORS_DEFAULT, joinText(decimalText(hp, NumberMode.RightAlign, 3), assets.text("gText_Slash")));
    win.print(small, r.maxHp[0], r.maxHp[1], COLORS_DEFAULT, joinText(assets.text("gText_Slash"), decimalText(maxHp, NumberMode.RightAlign, 3)));
    this.displayHpBar(slot, hp, maxHp);
  }

  /** DisplayPartyPokemonDataToTeachMove and PARTYBOX_DESC_NO_USE: what replaces a Pokémon's HP while a TM, an HM or an evolution item is chosen for. */
  private description(mon: Pokemon): TextId | null {
    if (this.mode.kind !== "use" || this.resumed) return null;
    if (itemInfo(this.mode.item)?.fieldUse === FieldUse.EVOLUTION_ITEM) return itemEvolves(mon, this.mode.item) ? null : "gText_NoUse";
    if (this.machine === null) return null;
    const answer = machineAnswer(mon, tmMove(this.machine));
    return answer === MachineAnswer.NotAble ? "gText_NotAble2" : answer === MachineAnswer.Known ? "gText_Learned" : "gText_Able3";
  }

  /** The TM or HM being used; null for anything else. */
  private get machine(): Item | null {
    return this.mode.kind === "use" && itemInfo(this.mode.item)?.fieldUse === FieldUse.TM_HM ? this.mode.item : null;
  }

  /** DisplayPartyPokemonHPBar: green, yellow or red, the rest of its 48 pixels empty. */
  private displayHpBar(slot: number, hp: number, maxHp: number): void {
    const win = this.boxes[slot];
    const [x, y, length] = this.rects(slot).hpBar;
    const level = hpBarLevel(hp, maxHp);
    const colors = level >= HpBarLevel.Green ? PALS.hpGreen : level === HpBarLevel.Yellow ? PALS.hpYellow : PALS.hpRed;
    this.loadBoxColors(slot, colors, HP_BAR_PAL_OFFSETS);
    const filled = scaledHpFraction(hp, maxHp, length);
    win.fillRect(HP_BAR_PAL_OFFSETS[1], x, y, filled, 1);
    win.fillRect(HP_BAR_PAL_OFFSETS[0], x, y + 1, filled, 2);
    if (filled !== length) {
      win.fillRect(0x0d, x + filled, y, length - filled, 1);
      win.fillRect(0x02, x + filled, y + 1, length - filled, 2);
    }
    win.copyToVram();
  }

  /** LOAD_PARTY_BOX_PAL: colors of the loaded palettes into the box's palette. */
  private loadBoxColors(slot: number, ids: readonly number[], offsets: readonly number[]): void {
    const base = BOX_WINDOWS[slot].palette * 16;
    ids.forEach((id, i) => this.flow.gba.palettes.load([this.palBuffer[id]], base + offsets[i], 1));
  }

  /** LoadPartyBoxPalette, with GetPartyBoxPaletteFlags. */
  private loadBoxPalette(slot: number, selected: boolean): void {
    const mon = this.mon(slot)!;
    const set = (a: readonly number[], b: readonly number[]) => {
      this.loadBoxColors(slot, a, BOX_PAL_OFFSETS_1);
      this.loadBoxColors(slot, b, BOX_PAL_OFFSETS_2);
    };
    const toSwitch = (this.action === Action.Switch && (slot === this.slotId || slot === this.slotId2)) || (this.action === Action.ShareHp && slot === this.slotId);
    if (this.action === Action.Switching) set(PALS.action1, PALS.action2);
    else if (toSwitch) set(PALS.action1, selected ? PALS.current2 : PALS.action2);
    else if (mon.hp === 0) set(selected ? PALS.currentFainted : PALS.fainted1, selected ? PALS.current2 : PALS.fainted2);
    else if (selected) set(PALS.current1, PALS.current2);
    else set(PALS.empty1, PALS.empty2);
  }

  /** AnimatePartySlot: a box's colors, icon and Poké Ball as selected (1) or not (0); CANCEL's button. */
  private animateSlot(slot: number, anim: number): void {
    if (slot === SLOT_CANCEL) {
      for (let y = 17; y < 19; y++)
        for (let x = 23; x < 30; x++) this.bg1.setEntry(x, y, (this.bg1.entry(x, y) & 0x0fff) | ((anim ? 2 : 1) << 12));
      this.cancelBall?.startAnim(anim);
      return;
    }
    const box = this.sprites[slot];
    if (!box || !this.mon(slot)) return;
    this.loadBoxPalette(slot, anim === 1);
    this.animateIcon(box.icon, anim);
    box.ball.startAnim(anim);
  }

  /** AnimateSelectedPartyIcon: the selected icon bounces with its frames; the others step back 4 pixels. */
  private animateIcon(icon: MonIcon, anim: number): void {
    const s = icon.sprite;
    if (anim === 0) {
      if (s.x === 16) {
        s.x2 = 0;
        s.y2 = -4;
      } else {
        s.x2 = -4;
        s.y2 = 0;
      }
      icon.onFrame = null;
    } else {
      s.x2 = 0;
      s.y2 = 0;
      // SpriteCB_BouncePartyMonIcon.
      icon.onFrame = (cmd) => {
        if (cmd) s.y2 = cmd & 1 ? -3 : 1;
      };
    }
  }

  // Messages

  /** DisplayPartyMenuStdMessage: the message's own window, in a standard frame; None only removes it. */
  private showStdMessage(message: Message): void {
    this.removeStdMessage();
    if (message === Message.None) return;
    const { flow } = this;
    const template =
      message === Message.DoWhatWithMon ? DO_WHAT_WITH_MON_WINDOW : message === Message.DoWhatWithItem ? DO_WHAT_WITH_ITEM_WINDOW : message === Message.RestoreWhichMove || message === Message.BoostPpWhichMove ? WHICH_MOVE_WINDOW : STD_MESSAGE_WINDOW;
    const id = message === Message.ChooseMon ? (this.shouldUseChooseMonText() ? "gText_ChoosePokemon" : "gText_ChoosePokemonCancel") : STD_MESSAGE_TEXTS[message]!;
    const win = new Window(this.bg2, template);
    drawStdFrame(win, STD_FRAME_TILE, STD_FRAME_PALETTE);
    printDefault(flow, win, FontId.Normal, flow.assets.text(id), 0, 2);
    this.stdMessage = win;
  }

  /** What the menu asks while a Pokémon is chosen. */
  private get chooseMessage(): Message {
    if (this.mode.kind === "give") return Message.GiveToWhichMon;
    if (this.machine !== null) return Message.TeachWhichMon;
    return this.mode.kind === "use" || (this.mode.kind === "battle" && this.mode.item) ? Message.UseOnWhichMon : Message.ChooseMon;
  }

  /** ShouldUseChooseMonText: more than one Pokémon still able to battle. */
  private shouldUseChooseMonText(): boolean {
    return this.party.filter((p) => p.hp > 0).length > 1;
  }

  private removeStdMessage(): void {
    if (this.stdMessage) clearStdWindowAndFrameToTransparent(this.stdMessage);
    this.stdMessage = null;
  }

  /** DisplayPartyMenuMessage: a message in the user's frame, printed at the text speed; `keepOpen` leaves it up once read. */
  private showMessage(text: Text, keepOpen: boolean, then: () => void): void {
    const { flow } = this;
    drawStdFrame(this.message, USER_FRAME_TILE, USER_FRAME_PALETTE);
    flow.text.ctx.canABSpeedUpPrint = true;
    const font = flow.fonts[FontId.Normal];
    flow.text.add(this.message, { font, x: 0, y: 1, letterSpacing: font.letterSpacing, lineSpacing: font.lineSpacing, colors: [1, 2, 3] }, textSpeedDelay(flow.options), text);
    this.step = () => {
      if (flow.text.isActive(this.message)) return;
      if (!keepOpen) this.clearMessage();
      then();
    };
  }

  private clearMessage(): void {
    clearStdWindowAndFrameToTransparent(this.message);
    this.flow.text.ctx.canABSpeedUpPrint = false;
  }

  /** Task_ReturnToChooseMonAfterText. */
  private returnToChooseMon(): void {
    this.clearMessage();
    this.showStdMessage(this.chooseMessage);
    this.step = () => this.chooseMonInput();
  }

  // Choosing a Pokémon

  /** Task_HandleChooseMonInput. */
  private chooseMonInput(): void {
    if (this.flow.gba.palettes.fadeActive) return;
    const pressed = this.buttonHandler();
    if (pressed & Button.A) this.chooseMonSelection();
    else if (pressed & Button.B) this.chooseMonCancel();
  }

  /** The slot moving now: the second one while picking where to SWITCH (GetCurrentPartySlotPtr). */
  private get current(): number {
    return this.action === Action.Switch || this.action === Action.ShareHp ? this.slotId2 : this.slotId;
  }

  private set current(slot: number) {
    if (this.action === Action.Switch || this.action === Action.ShareHp) this.slotId2 = slot;
    else this.slotId = slot;
  }

  /** PartyMenuButtonHandler: moves the cursor, or A (B on CANCEL) or B. */
  private buttonHandler(): number {
    const { input } = this.flow.gba;
    const keys = input.repeated;
    const lr = this.flow.options.buttonMode === ButtonMode.LR;
    let dir = 0;
    if (keys === Button.Up) dir = -1;
    else if (keys === Button.Down) dir = 1;
    else if (keys === Button.Left) dir = -2;
    else if (keys === Button.Right) dir = 2;
    else if (lr && input.isPressed(Button.L)) dir = -1;
    else if (lr && input.isPressed(Button.R)) dir = 1;
    if (dir) {
      this.moveCursor(dir);
      return 0;
    }
    if (input.isPressed(Button.A) && this.current === SLOT_CANCEL) return Button.B;
    return input.pressed & (Button.A | Button.B);
  }

  /** UpdateCurrentPartySelection and UpdatePartySelectionSingleLayout. */
  private moveCursor(dir: number): void {
    const old = this.current;
    const count = this.host.party.count;
    let slot = old;
    switch (dir) {
      case -1:
        slot = old === 0 ? SLOT_CANCEL : old === SLOT_CANCEL ? count - 1 : old - 1;
        break;
      case 1:
        slot = old === SLOT_CANCEL ? 0 : old === count - 1 ? SLOT_CANCEL : old + 1;
        break;
      case 2:
        if (count !== 1 && old === 0) slot = this.lastSelectedSlot === 0 ? 1 : this.lastSelectedSlot;
        break;
      case -2:
        if (old !== 0 && old !== SLOT_CONFIRM && old !== SLOT_CANCEL) {
          this.lastSelectedSlot = old;
          slot = 0;
        }
        break;
    }
    if (slot === old) return;
    this.current = slot;
    this.flow.play("se_select");
    this.animateSlot(old, 0);
    this.animateSlot(slot, 1);
  }

  /** HandleChooseMonSelection. */
  private chooseMonSelection(): void {
    this.flow.play("se_select");
    if (this.mode.kind === "battle" && this.mode.item) return this.chooseInBattle();
    if (this.mode.kind === "use") return this.chooseToUse(this.mode.item);
    if (this.action === Action.Give) return this.tryGive();
    if (this.action === Action.Switch) return this.switchSelected();
    if (this.action === Action.ShareHp) return this.shareHp();
    this.openSelection();
  }

  /** HandleChooseMonCancel: SWITCH stops; otherwise the menu closes. */
  private chooseMonCancel(): void {
    if (this.mode.kind === "battle" && this.mode.forced) return;
    this.flow.play("se_select");
    if (this.action === Action.Switch || this.action === Action.ShareHp) return this.finishTwoMonAction();
    this.slotId = SLOT_CANCEL;
    this.close();
  }

  // The selection window

  /** CreateSelectionWindow (SetPartyMonFieldSelectionActions): SUMMARY, the field moves it knows, SWITCH (with two Pokémon or more), ITEM, CANCEL. */
  private openSelection(): void {
    if (this.mode.kind === "battle") this.options = [Option.Shift, Option.Summary, Option.Cancel1];
    else {
      const moves = this.mon(this.slotId)?.moves ?? [];
      this.options = [Option.Summary, ...moves.filter((m) => FIELD_MOVES.has(m.move)).map((m): Option => Option.FieldMoves + m.move)];
      if (this.party[1]) this.options.push(Option.Switch);
      this.options.push(Option.Item, Option.Cancel1);
    }
    const n = this.options.length;
    this.showSelectionWindow({ left: 19, top: 19 - n * 2, width: 10, height: n * 2, palette: 14, baseBlock: 0x2bf });
    this.showStdMessage(Message.DoWhatWithMon);
  }

  /** DisplaySelectionWindow: the options in the user's frame, 16 pixels apart. */
  private showSelectionWindow(template: WindowTemplate): void {
    this.removeStdMessage();
    const { flow } = this;
    const win = new Window(this.bg2, template);
    drawStdFrame(win, USER_FRAME_TILE, USER_FRAME_PALETTE);
    const font = flow.fonts[FontId.Normal];
    this.options.forEach((o, i) => {
      const fieldMove = o >= Option.FieldMoves;
      const text = fieldMove ? flow.assets.moveName(o - Option.FieldMoves) : flow.assets.text(OPTION_TEXTS[o]!);
      win.print(font, 8, i * 16 + 2, fieldMove ? COLORS_FIELD_MOVES : COLORS_ACTIONS, text, font.letterSpacing, 0);
    });
    this.selection = new CursorMenu(flow, win, FontId.Normal, 0, 2, 16, this.options.length, 0);
    win.copyToVram();
    this.step = () => this.selectionInput();
  }

  /** Task_HandleSelectionMenuInput: B runs the last option (CANCEL). */
  private selectionInput(): void {
    if (this.flow.gba.palettes.fadeActive) return;
    const input = this.selection!.processInput(this.options.length > 3);
    if (input === MENU_NOTHING_CHOSEN) return;
    if (input === MENU_B_PRESSED) this.flow.play("se_select");
    const option = this.options[input === MENU_B_PRESSED ? this.options.length - 1 : input];
    this.flow.play("se_select");
    if (option >= Option.FieldMoves) return this.useFieldMove(option - Option.FieldMoves);
    switch (option) {
      case Option.Shift:
        this.removeSelection();
        return this.chooseInBattle();
      case Option.Summary:
        return this.openSummary();
      case Option.Switch:
        return this.beginSwitch();
      case Option.Item:
        return this.openItemOptions();
      case Option.Give:
        return this.chooseItemToGive();
      case Option.Take:
        return this.take();
      case Option.Cancel2:
        this.removeSelection();
        return this.openSelection();
      default:
        this.removeSelection();
        this.showStdMessage(Message.ChooseMon);
        this.step = () => this.chooseMonInput();
    }
  }

  private removeSelection(): void {
    if (this.selection) clearStdWindowAndFrameToTransparent(this.selection.win);
    this.selection = null;
    this.removeStdMessage();
  }

  /**
   * CursorCB_SendMon (and a bag item's target in battle): a fainted Pokémon or the one in battle
   * can't be sent out (its message, then back to choosing); otherwise the battle gets the slot.
   */
  private chooseInBattle(): void {
    if (this.mode.kind !== "battle") return;
    const slot = this.slotId;
    const mon = this.mon(slot);
    if (!mon) return;
    if (!this.mode.item) {
      const refusal: TextId | null = mon.hp === 0 ? "gText_PkmnHasNoEnergy" : this.mode.inBattle(slot) ? "gText_PkmnAlreadyInBattle" : slot === this.mode.selected ? "gText_PkmnAlreadySelected" : null;
      if (refusal) {
        const text = expandPlaceholders(this.flow.assets.text(refusal), { [PLACEHOLDER_STR_VAR_1]: monName(this.flow, mon) });
        return this.showMessage(text, false, () => this.returnToChooseMon());
      }
    } else if (itemInfo(this.mode.item)?.battleUse === BattleUse.MOVE && mon.hp > 0) {
      const { mode } = this;
      const item = mode.item!;
      return this.chooseMoveForItem(mon, Message.RestoreWhichMove, (moveSlot) => {
        if (!itemWorksOn(item, mon, mode.inBattle(this.slotId), moveSlot)) return this.wontHaveEffect(() => this.returnToChooseMon());
        mode.choose(this.slotId, moveSlot);
        this.close();
      });
    }
    else if (!itemWorksOn(this.mode.item, mon, this.mode.inBattle(slot))) return this.wontHaveEffect(() => this.returnToChooseMon());
    this.mode.choose(slot);
    this.close();
  }

  /** "It won't have any effect." */
  private wontHaveEffect(then: () => void): void {
    this.showMessage(this.flow.assets.text("gText_WontHaveEffect"), false, then);
  }

  /** ShowMoveSelectWindow: an Ether's move. B goes back to the Pokémon. */
  private chooseMoveForItem(mon: Pokemon, message: Message, chosen: (moveSlot: number) => void): void {
    const { flow } = this;
    const font = flow.fonts[FontId.Normal];
    const n = mon.moves.length;
    // First: clearing the wider message before it would erase the part of this window over it.
    this.showStdMessage(message);
    const win = new Window(this.bg2, MOVE_SELECT_WINDOW);
    drawStdFrame(win, USER_FRAME_TILE, USER_FRAME_PALETTE);
    mon.moves.forEach((m, i) => win.print(font, 8, i * 16 + 2, COLORS_ACTIONS, flow.assets.moveName(m.move), font.letterSpacing, 0));
    this.selection = new CursorMenu(flow, win, FontId.Normal, 0, 2, 16, n, 0);
    win.copyToVram();
    this.step = () => {
      const input = this.selection!.processInput(false);
      if (input === MENU_NOTHING_CHOSEN) return;
      this.flow.play("se_select");
      this.removeSelection();
      if (input === MENU_B_PRESSED) return this.returnToChooseMon();
      chosen(input);
    };
  }

  // Using an item

  /** gItemUseCB: the items that act on one move ask which, then mic-core decides. */
  private chooseToUse(item: Item): void {
    const slot = this.slotId;
    const mon = this.mon(slot);
    if (!mon) return;
    const info = itemInfo(item);
    if (info?.fieldUse === FieldUse.TM_HM) return this.teach(item, slot, mon);
    const asksMove = info?.fieldUse === FieldUse.PP_UP ? Message.BoostPpWhichMove : info?.fieldUse === FieldUse.ETHER && !info.effect?.allMoves ? Message.RestoreWhichMove : null;
    if (asksMove === null) return this.useItem(item, slot, 0);
    this.chooseMoveForItem(mon, asksMove, (moveSlot) => this.useItem(item, slot, moveSlot));
  }

  /** ItemUseCB_TMHM: refused here for its message (mic-core has the last word), a free slot at once, otherwise which move goes. */
  private teach(item: Item, slot: number, mon: Pokemon): void {
    const move = tmMove(item);
    const answer = machineAnswer(mon, move);
    if (answer !== MachineAnswer.Able) return this.showMessage(this.moveText(answer === MachineAnswer.Known ? "gText_PkmnAlreadyKnows" : "gText_PkmnCantLearnMove", slot, move), false, () => this.close());
    if (mon.moves.length === MAX_MOVES) return this.askToReplaceMove(slot, move, create(ItemGrowthSchema));
    this.removeStdMessage();
    this.teachAndShow(item, slot, move);
  }

  /** mic-core teaches and saves, then Task_UseTM_NoForget or Task_ForgetMove; a refusal plays no scene. */
  private teachAndShow(item: Item, slot: number, move: number, forget?: number): void {
    const { flow, host, mode, done } = this;
    const mon = this.mon(slot);
    if (!mon) return done();
    const { species, shiny } = mon;
    const name = monName(flow, mon);
    const forgot = forget === undefined ? undefined : mon.moves[forget]?.move;
    const answer = host.useItem(item, slot, forget ?? 0);
    const scene = (closeness: number) => startUseItemScene(flow, { species, shiny, name, item, closeness, machine: { move, forgot } }, (played) => (played ? done() : startPartyMenu(flow, host, mode, done, { slot, then: "taught", move })));
    // After the forget screen the menu is gone: the summary left a black screen.
    if (forget !== undefined) {
      void answer.then((r) => (r.outcome === ItemOutcome.USED_ON_POKEMON ? scene(r.value) : startPartyMenu(flow, host, mode, done)));
      return;
    }
    this.ask(answer, (r) => {
      if (r.outcome !== ItemOutcome.USED_ON_POKEMON) return this.showMessage(flow.assets.text("gText_WontHaveEffect"), true, () => this.close());
      this.exitTo(() => scene(r.value));
    });
  }

  /** ItemUseCB_LearnedMove when the scene was stopped: once the menu is back, its message and fanfare. */
  private showTaught(slot: number, move: number): void {
    this.step = () => {
      if (this.flow.gba.palettes.fadeActive) return;
      this.showLearned(slot, move, create(ItemGrowthSchema));
    };
  }

  /**
   * Task_DoUseItemAnim, CB2_UseItem: mic-core applies it and saves (a refusal plays no scene, phase-6
   * M1b); the menu closes for the item scene and reopens to show the effect from the box as it was.
   */
  private useItem(item: Item, slot: number, moveSlot: number): void {
    this.removeStdMessage();
    const before = this.mon(slot);
    if (!before) return;
    const { hp, level, stats, species, shiny } = before;
    const ailment = ailmentOf(before);
    const name = monName(this.flow, before);
    this.ask(this.host.useItem(item, slot, moveSlot), (r) => {
      const { flow, host, mode, done } = this;
      const scene = { species, shiny, name, item, closeness: r.value };
      if (r.outcome === ItemOutcome.CANT_EVOLVE) return this.exitTo(() => startUseItemScene(flow, { ...scene, cantEvolve: true }, done));
      if (r.outcome !== ItemOutcome.USED_ON_POKEMON || !this.mon(slot)) return this.showMessage(flow.assets.text("gText_WontHaveEffect"), true, () => this.close());
      const { growth } = r;
      if (growth?.evolvedFrom && host.growth) {
        const evolving = host.growth;
        const evolution = { slot, species: this.mon(slot)!.species, from: { species, shiny }, learned: growth.learned, toLearn: growth.toLearn };
        return this.exitTo(() => startUseItemScene(flow, scene, () => startFieldEvolution(flow, host, evolving, evolution, done)));
      }
      const back: Resume = growth ? { slot, then: "leveled", growth, stats, level, hp, ailment } : { slot, then: "used", item, moveSlot, hp, ailment };
      this.exitTo(() => startUseItemScene(flow, scene, () => startPartyMenu(flow, host, mode, done, back)));
    });
  }

  /** Task_SetSacredAshCB, ItemUseCB_Medicine, ItemUseCB_TryRestorePP: once the menu is back, its sound, HP rising and message. */
  private showUsed({ slot, item, moveSlot, hp, ailment }: { slot: number; item: Item; moveSlot: number; hp: number; ailment: Ailment }): void {
    const box = this.sprites[slot];
    if (box) this.showAilment(box, ailment);
    this.displayData(slot, hp, ailment);
    this.step = () => {
      if (this.flow.gba.palettes.fadeActive) return;
      this.playUsed(item);
      this.showRecovered(slot, hp, () => this.usedMessage(item, slot, moveSlot, hp), () => this.close());
    };
  }

  /** ItemUseCB_RareCandyStep: the box as it was until the menu is back; the fanfare, the new level, its message. */
  private showLeveled({ slot, growth, stats, level, hp, ailment }: { slot: number; growth: ItemGrowth; stats: Stats | undefined; level: number; hp: number; ailment: Ailment }): void {
    const { flow } = this;
    this.displayData(slot, hp, ailment, level);
    this.step = () => {
      if (flow.gba.palettes.fadeActive) return;
      const mon = this.mon(slot);
      const box = this.sprites[slot];
      if (!mon || !box) return this.close();
      flow.gba.sound.playFanfare("mus_level_up");
      this.showAilment(box, ailmentOf(mon));
      this.displayData(slot);
      this.animateSlot(slot, 1);
      const text = expandPlaceholders(flow.assets.text("gText_PkmnElevatedToLvVar2"), {
        [PLACEHOLDER_STR_VAR_1]: monName(flow, mon),
        [PLACEHOLDER_STR_VAR_2]: decimalText(mon.level, NumberMode.LeftAlign, 3),
      });
      this.showMessage(text, true, () => this.showLevelUpStats(slot, growth, stats));
    };
  }

  /** Runs `then` on A or B, once the fanfare is over. */
  private afterPress(then: () => void): void {
    const { gba } = this.flow;
    this.step = () => {
      if (!gba.sound.isPlaying("fanfare") && gba.input.isPressed(Button.A | Button.B)) then();
    };
  }

  /** Task_DisplayLevelUpStatsPg1 and 2, Task_TryLearnNewMoves: gains, totals, then what it learns. */
  private showLevelUpStats(slot: number, growth: ItemGrowth, stats: Stats | undefined): void {
    const { flow } = this;
    const after = this.mon(slot)?.stats;
    this.afterPress(() => {
      flow.play("se_select");
      const win = new Window(this.bg2, LEVEL_UP_WINDOW);
      drawStdFrame(win, USER_FRAME_TILE, USER_FRAME_PALETTE);
      win.fill(1);
      levelUpGains(flow, win, stats, after, [1, 2, 3]);
      win.copyToVram();
      this.afterPress(() => {
        flow.play("se_select");
        win.fill(1);
        levelUpTotals(flow, win, after, [1, 2, 3]);
        win.copyToVram();
        this.afterPress(() => {
          clearStdWindowAndFrameToTransparent(win);
          this.learnNext(slot, growth);
        });
      });
    });
  }

  /** Task_TryLearningNextMove: the moves in free slots, those with none, then PartyMenuTryEvolution. */
  private learnNext(slot: number, growth: ItemGrowth): void {
    const { flow, host, done } = this;
    const learned = growth.learned[0];
    if (learned) return this.showLearned(slot, learned, { ...growth, learned: growth.learned.slice(1) });
    const move = growth.toLearn[0];
    if (move) return this.askToReplaceMove(slot, move, { ...growth, toLearn: growth.toLearn.slice(1) });
    if (growth.evolvesTo && host.growth) {
      const evolving = host.growth;
      const evolution = { slot, species: growth.evolvesTo };
      return this.exitTo(() => startFieldEvolution(flow, host, evolving, evolution, done));
    }
    this.close();
  }

  private moveText(id: TextId, slot: number, move: number): Text {
    const { flow } = this;
    return expandPlaceholders(flow.assets.text(id), {
      [PLACEHOLDER_STR_VAR_1]: monName(flow, this.mon(slot)!),
      [PLACEHOLDER_STR_VAR_2]: flow.assets.moveName(move),
    });
  }

  /** Task_LearnedMove: its message, the fanfare, a press. */
  private showLearned(slot: number, move: number, growth: ItemGrowth): void {
    this.showMessage(this.moveText("gText_PkmnLearnedMove3", slot, move), true, () => {
      this.flow.gba.sound.playFanfare("mus_level_up");
      this.afterPress(() => this.learnNext(slot, growth));
    });
  }

  private yesNoQuestion(yes: () => void, no: () => void): void {
    const { flow } = this;
    this.yesNo = new YesNoMenu(flow, this.bg2, YES_NO_WINDOW, FontId.Normal, 0, 2, 0, USER_FRAME_TILE, USER_FRAME_PALETTE);
    this.step = () => {
      const answer = this.yesNo!.processInput();
      if (answer === MENU_NOTHING_CHOSEN) return;
      this.yesNo = null;
      if (answer === MENU_B_PRESSED) flow.play("se_select");
      if (answer === 0) yes();
      else no();
    };
  }

  /** DisplayMonNeedsToReplaceMove, Task_ReplaceMoveYesNo. */
  private askToReplaceMove(slot: number, move: number, growth: ItemGrowth): void {
    const { flow, host, mode, done } = this;
    this.showMessage(this.moveText("gText_PkmnNeedsToReplaceMove", slot, move), true, () =>
      this.yesNoQuestion(
        () =>
          this.showMessage(flow.assets.text("gText_WhichMoveToForget"), true, () =>
            this.exitTo(() => {
              let row = FORGET_NONE;
              const { machine } = this;
              const back = () => (machine !== null && row !== FORGET_NONE ? this.teachAndShow(machine, slot, move, row) : startPartyMenu(flow, host, mode, done, { slot, then: "forgot", growth, move, row }));
              startSummary(flow, host, slot, back, { move, pick: (r) => (row = r) });
            }),
          ),
        () => this.askToStopLearning(slot, move, growth),
      ),
    );
  }

  /** StopLearningMovePrompt: YES moves on without it, NO asks again. */
  private askToStopLearning(slot: number, move: number, growth: ItemGrowth): void {
    this.showMessage(this.moveText("gText_StopLearningMove2", slot, move), true, () =>
      this.yesNoQuestion(
        () => this.showMessage(this.moveText("gText_MoveNotLearned", slot, move), true, () => this.learnNext(slot, growth)),
        () => this.askToReplaceMove(slot, move, growth),
      ),
    );
  }

  /** Task_ReturnToPartyMenuWhileLearningMove: "1, 2, and... Poof!", the move goes, the new one comes. */
  private afterForgetScreen({ slot, growth, move, row }: { slot: number; growth: ItemGrowth; move: number; row: number }): void {
    this.step = () => {
      if (this.flow.gba.palettes.fadeActive) return;
      if (row === FORGET_NONE) return this.askToStopLearning(slot, move, growth);
      const gone = this.mon(slot)?.moves[row]?.move ?? 0;
      this.showMessage(this.moveText("gText_12PoofForgotMove", slot, gone), true, () => {
        const answer = this.host.growth?.learnMove(slot, move, row);
        if (answer) this.ask(answer, (r) => this.showLearned(slot, move, { ...growth, evolvesTo: r.evolvesTo }));
        else this.showLearned(slot, move, growth);
      });
    };
  }

  /** ItemUseCB_SacredAsh: every Pokémon it brought back in turn, or "It won't have any effect." */
  private useOnWholeParty(item: Item): void {
    if (this.flow.gba.palettes.fadeActive) return;
    const before = this.party.map((p) => p.hp);
    this.ask(this.host.useItem(item, 0, 0), (r) => {
      if (r.outcome !== ItemOutcome.USED_ON_POKEMON) return this.showMessage(this.flow.assets.text("gText_WontHaveEffect"), true, () => this.close());
      const next = (slot: number): void => {
        if (slot >= before.length) return this.close();
        if (this.party[slot]?.hp === before[slot]) return next(slot + 1);
        this.playUsed(item);
        this.animateSlot(this.slotId, 0);
        this.slotId = slot;
        this.animateSlot(slot, 1);
        this.showRecovered(slot, before[slot], () => this.hpRestoredText(slot, before[slot]), () => next(slot + 1));
      };
      next(0);
    });
  }

  private playUsed(item: Item): void {
    this.flow.play(itemInfo(item)?.effect?.reusable ? "se_glass_flute" : "se_use_item");
  }

  /** PartyMenuModifyHP: the box's HP rises a point a frame from `from`, its ailment already gone; then the message and `then`. */
  private showRecovered(slot: number, from: number, text: () => Text, then: () => void): void {
    const mon = this.mon(slot);
    const box = this.sprites[slot];
    if (!mon || !box) return then();
    this.showAilment(box, ailmentOf(mon));
    this.displayData(slot);
    this.animateHp(slot, from, () => this.showMessage(text(), true, then));
  }

  /** Task_PartyMenuModifyHP: the box's HP moves a point a frame from `from` to what it is now. */
  private animateHp(slot: number, from: number, then: () => void): void {
    const mon = this.mon(slot);
    if (!mon) return then();
    let shown = from;
    if (shown !== mon.hp) this.displayData(slot, shown);
    this.animateSlot(slot, 1);
    this.step = () => {
      if (shown === mon.hp) return then();
      shown += shown < mon.hp ? 1 : -1;
      this.displayData(slot, shown);
      if (shown === mon.hp) this.animateSlot(slot, 1);
    };
  }

  private hpRestoredText(slot: number, from: number): Text {
    const { flow } = this;
    const mon = this.mon(slot)!;
    return expandPlaceholders(flow.assets.text("gText_PkmnHPRestoredByVar2"), {
      [PLACEHOLDER_STR_VAR_1]: monName(flow, mon),
      [PLACEHOLDER_STR_VAR_2]: decimalText(mon.hp - from, NumberMode.LeftAlign, 3),
    });
  }

  /** Task_DisplayHPRestoredMessage, GetMedicineItemEffectMessage: HP restored, or what else the item did. */
  private usedMessage(item: Item, slot: number, moveSlot: number, from: number): Text {
    const { flow } = this;
    const mon = this.mon(slot)!;
    if (mon.hp > from && !itemInfo(item)?.effect?.evStat) return this.hpRestoredText(slot, from);
    const effect = itemInfo(item)?.effect;
    const vars = {
      [PLACEHOLDER_STR_VAR_1]: effect?.ppUp || effect?.ppMaxUp ? flow.assets.moveName(mon.moves[moveSlot]?.move ?? 0) : monName(flow, mon),
      [PLACEHOLDER_STR_VAR_2]: effect?.evStat ? flow.assets.text(EV_STAT_TEXTS[effect.evStat] ?? "gText_WontHaveEffect") : [],
    };
    return expandPlaceholders(flow.assets.text(effect ? medicineTextId(effect) : "gText_WontHaveEffect"), vars);
  }

  /** CursorCB_Summary: the menu fades out into the summary, and comes back on the Pokémon last shown. */
  private openSummary(): void {
    const { flow, host, mode, done } = this;
    this.exitTo(() =>
      startSummary(flow, host, this.slotId, (last) => startPartyMenu(flow, host, mode, done, { slot: last, then: "selection" })),
    );
  }

  /** CursorCB_Item: GIVE, TAKE, CANCEL. */
  private openItemOptions(): void {
    this.removeSelection();
    this.options = [Option.Give, Option.Take, Option.Cancel2];
    this.showSelectionWindow(ITEM_GIVE_TAKE_WINDOW);
    this.showStdMessage(Message.DoWhatWithItem);
  }

  /** CursorCB_Give: the bag, to choose the item (CB2_SelectBagItemToGive); back here with it or without. */
  private chooseItemToGive(): void {
    const { flow, host, mode, done } = this;
    const slot = this.slotId;
    this.exitTo(() =>
      startBag(
        flow,
        host.gender,
        host.bag,
        (exit: BagExit) => startPartyMenu(flow, host, mode, done, exit && "chosen" in exit ? { slot, then: "give", item: exit.chosen } : { slot, then: "selection" }),
        BagLocation.Party,
      ),
    );
  }

  /** CursorCB_TakeItem: mic-core takes it into the bag; its message, then back to choosing. */
  private take(): void {
    this.removeSelection();
    const slot = this.slotId;
    this.ask(this.host.take(slot), (r) => this.showResult(r, slot, true, () => this.updateHeldItem(slot, () => this.returnToChooseMon())));
  }

  // Giving

  /** CB2_GiveHoldItem: back from the bag with an item; YES/NO first when the Pokémon already holds one. */
  private giveFromField(item: Item): void {
    if (this.flow.gba.palettes.fadeActive) return;
    const slot = this.slotId;
    const held = this.mon(slot)?.heldItem ?? Item.UNSPECIFIED;
    const after = () => this.updateHeldItem(slot, () => this.returnToChooseMon());
    if (held === Item.UNSPECIFIED) return this.give(item, false, slot, after);
    this.askToSwitchItems(slot, held, () => this.give(item, false, slot, after), () => this.returnToChooseMon());
  }

  /** TryGiveItemOrMailToSelectedMon: the item from the bag or the PC; MAIL held must be taken first. */
  private tryGive(): void {
    if (this.mode.kind !== "give") return;
    const { item, pc } = this.mode;
    const slot = this.slotId;
    const held = this.mon(slot)?.heldItem ?? Item.UNSPECIFIED;
    const after = () => this.updateHeldItem(slot, () => this.close());
    if (held === Item.UNSPECIFIED || itemInfo(held)?.fieldUse === FieldUse.MAIL) return this.give(item, pc, slot, after);
    this.askToSwitchItems(slot, held, () => this.give(item, pc, slot, after), after);
  }

  /** DisplayAlreadyHoldingItemSwitchMessage, then YES/NO (Task_SwitchItemsYesNo). */
  private askToSwitchItems(slot: number, held: Item, yes: () => void, no: () => void): void {
    const { flow } = this;
    const text = expandPlaceholders(flow.assets.text("gText_PkmnAlreadyHoldingItemSwitch"), {
      [PLACEHOLDER_STR_VAR_1]: monName(flow, this.mon(slot)!),
      [PLACEHOLDER_STR_VAR_2]: flow.assets.itemName(held),
    });
    this.showMessage(text, true, () => {
      this.yesNo = new YesNoMenu(flow, this.bg2, YES_NO_WINDOW, FontId.Normal, 0, 2, 0, USER_FRAME_TILE, USER_FRAME_PALETTE);
      this.step = () => {
        const answer = this.yesNo!.processInput();
        if (answer === MENU_NOTHING_CHOSEN) return;
        this.yesNo = null;
        if (answer === MENU_B_PRESSED) flow.play("se_select");
        if (answer === 0) yes();
        else no();
      };
    });
  }

  /** mic-core gives the item; its message (left up once read after a switch or about MAIL), then `after`. */
  private give(item: Item, pc: boolean, slot: number, after: () => void): void {
    this.ask(this.host.give(item, slot, pc), (r) => this.showResult(r, slot, r.outcome === ItemOutcome.SWAPPED || r.outcome === ItemOutcome.REMOVE_MAIL, after));
  }

  /** The message for what giving or taking did; nothing (refused, or offline): straight to `after`. */
  private showResult(r: ItemResult, slot: number, keepOpen: boolean, after: () => void): void {
    const text = this.resultText(r, slot);
    if (!text) return after();
    this.showMessage(text, keepOpen, after);
  }

  private resultText(r: ItemResult, slot: number): Text | null {
    const { assets } = this.flow;
    const mon = this.mon(slot);
    const name = mon ? monName(this.flow, mon) : [];
    const expand = (id: TextId, var1: Text, var2: Text = []) => expandPlaceholders(assets.text(id), { [PLACEHOLDER_STR_VAR_1]: var1, [PLACEHOLDER_STR_VAR_2]: var2 });
    switch (r.outcome) {
      case ItemOutcome.GIVEN:
        return expand("gText_PkmnWasGivenItem", name, assets.itemName(r.item));
      case ItemOutcome.SWAPPED:
        return expand("gText_SwitchedPkmnItem", assets.itemName(r.item), assets.itemName(r.value));
      case ItemOutcome.TAKEN:
        return expand("gText_ReceivedItemFromPkmn", name, assets.itemName(r.item));
      case ItemOutcome.NOT_HOLDING:
        return expand("gText_PkmnNotHolding", name);
      case ItemOutcome.REMOVE_MAIL:
        return assets.text("gText_RemoveMailBeforeItem");
      case ItemOutcome.CANT_BE_HELD:
        return expand("gText_ItemCantBeHeld", assets.itemName(r.item));
      case ItemOutcome.BAG_FULL:
        return expand("gText_BagFullCouldNotRemoveItem", this.pocketName(mon?.heldItem ?? Item.UNSPECIFIED));
      default:
        return null;
    }
  }

  /** BufferBagFullCantTakeItemMessage: the BAG, or the TM CASE or BERRY POUCH the held item goes in. */
  private pocketName(item: Item): Text {
    const { assets } = this.flow;
    const pocket = itemInfo(item)?.pocket;
    if (pocket === Pocket.TM_CASE) return assets.itemName(Item.TM_CASE);
    if (pocket === Pocket.BERRY_POUCH) return assets.itemName(Item.BERRY_POUCH);
    return assets.text("gText_MenuBag");
  }

  /** Task_UpdateHeldItemSprite: the mark as the Pokémon holds now, once the message was read. */
  private updateHeldItem(slot: number, then: () => void): void {
    const box = this.sprites[slot];
    const mon = this.mon(slot);
    if (box && mon) this.showHeldItem(box, mon.heldItem);
    then();
  }

  /** Waits for mic-core's answer; nothing else runs meanwhile. */
  private ask<T>(answer: Promise<T>, then: (r: T) => void): void {
    this.step = () => {};
    void answer.then((r) => {
      this.step = () => then(r);
    });
  }

  // Field moves

  /** CursorCB_FieldMove: mic-core says whether it can be used here. */
  private useFieldMove(move: Move): void {
    this.removeSelection();
    const answer = this.host.useFieldMove?.(this.slotId, move);
    if (!answer) return this.refuseFieldMove(FieldMoveOutcome.CANT_USE_HERE);
    this.ask(answer, ({ outcome }) => {
      if (outcome !== FieldMoveOutcome.CHOOSE_TARGET) return this.refuseFieldMove(outcome);
      this.sharing = move;
      this.chooseWhoToHeal();
    });
  }

  /** The move's message, then Task_CancelAfterAorBPress: A or B goes back to choosing. */
  private refuseFieldMove(outcome: FieldMoveOutcome): void {
    this.showStdMessage(FIELD_MOVE_REFUSALS[outcome] ?? Message.CantUseHere);
    this.step = () => {
      if (!(this.flow.gba.input.pressed & (Button.A | Button.B))) return;
      this.flow.play("se_select");
      this.showStdMessage(Message.ChooseMon);
      this.step = () => this.chooseMonInput();
    };
  }

  /** ChooseMonForSoftboiled: "Use on which POKéMON?", the cursor picks the second one. */
  private chooseWhoToHeal(): void {
    this.action = Action.ShareHp;
    this.slotId2 = this.slotId;
    this.animateSlot(this.slotId, 1);
    this.showStdMessage(Message.UseOnWhichMon);
    this.step = () => this.chooseMonInput();
  }

  /** Task_TryUseSoftboiledOnPartyMon: the user's HP falls, then the other's rises and its message. */
  private shareHp(): void {
    const { slotId: user, slotId2: target, sharing: move } = this;
    const fromUser = this.mon(user)?.hp ?? 0;
    const fromTarget = this.mon(target)?.hp ?? 0;
    this.removeStdMessage();
    const answer = this.host.useFieldMove?.(user, move, target);
    if (!answer) return this.finishTwoMonAction();
    this.ask(answer, ({ outcome }) => {
      if (outcome !== FieldMoveOutcome.HP_SHARED) {
        this.flow.play("se_select");
        return this.showMessage(this.flow.assets.text("gText_CantBeUsedOnPkmn"), false, () => {
          this.showStdMessage(Message.UseOnWhichMon);
          this.step = () => this.chooseMonInput();
        });
      }
      this.displayData(target, fromTarget);
      this.flow.play("se_use_item");
      this.animateHp(user, fromUser, () => {
        this.flow.play("se_use_item");
        this.showRecovered(target, fromTarget, () => this.hpRestoredText(target, fromTarget), () => {
          this.clearMessage();
          this.finishTwoMonAction();
        });
      });
    });
  }

  // SWITCH

  /** CursorCB_Switch: "Move to where?", the cursor picks the second Pokémon. */
  private beginSwitch(): void {
    this.action = Action.Switch;
    this.removeSelection();
    this.showStdMessage(Message.MoveToWhere);
    this.animateSlot(this.slotId, 1);
    this.slotId2 = this.slotId;
    this.step = () => this.chooseMonInput();
  }

  /** SwitchSelectedMons: the same one changes nothing; two different ones slide out of the screen. */
  private switchSelected(): void {
    if (this.slotId2 === this.slotId) return this.finishTwoMonAction();
    this.slides = [this.slotId, this.slotId2].map((slot) => {
      const { left, top, width, height } = BOX_WINDOWS[slot];
      const slide: Slide = { slot, left, top, width, height, offset: 0, dir: width === 10 ? -1 : 1, map: new Uint16Array(width * height) };
      this.bufferBox(slide);
      this.boxes[slot].clearTilemap();
      return slide;
    });
    this.action = Action.Switching;
    this.animateSlot(this.slotId, 1);
    this.animateSlot(this.slotId2, 1);
    this.slideBoxes();
    this.step = () => this.slideOut();
  }

  /** CopyToBufferFromBgTilemap: the box's tilemap. */
  private bufferBox(slide: Slide): void {
    for (let y = 0; y < slide.height; y++) for (let x = 0; x < slide.width; x++) slide.map[y * slide.width + x] = this.bg0.entry(slide.left + x, slide.top + y);
  }

  /** SlidePartyMenuBoxOneStep: each box's tilemap one tile further (MoveAndBufferPartySlot). */
  private slideBoxes(): void {
    for (const s of this.slides) {
      if (!s.dir) continue;
      const x = s.left + s.offset;
      const here = visibleColumns(x, s.width);
      if (!here) continue;
      fillBgRect(this.bg0, 0, here.x, s.top, here.width, s.height, 0);
      const next = visibleColumns(x + s.dir, s.width);
      if (!next) continue;
      for (let row = 0; row < s.height; row++)
        for (let col = 0; col < next.width; col++) this.bg0.setEntry(next.x + col, s.top + row, s.map[row * s.width + next.skip + col]);
    }
  }

  /** SlidePartyMenuBoxSpritesOneStep: each box's sprites a tile further. */
  private slideSprites(): void {
    for (const s of this.slides) {
      const box = this.sprites[s.slot];
      if (!s.dir || !box) continue;
      for (const sprite of [box.ball, box.item, box.icon.sprite, box.status]) sprite.x2 += s.dir * 8;
    }
  }

  /** Task_SlideSelectedSlotsOffscreen: once both are out, the Pokémon switch and slide back in. */
  private slideOut(): void {
    this.slideBoxes();
    this.slideSprites();
    for (const s of this.slides) s.offset += s.dir;
    // The positions wrap like the game's u16: off the left edge counts as out too.
    if (!this.slides.every((s) => ((s.left + s.offset) & 0xffff) > 33)) return;
    for (const s of this.slides) s.dir = -s.dir;
    this.switchMons();
    for (const s of this.slides) {
      this.displayData(s.slot);
      this.boxes[s.slot].putTilemap();
      this.bufferBox(s);
      this.boxes[s.slot].clearTilemap();
    }
    this.step = () => this.slideIn();
  }

  /** Task_SlideSelectedSlotsOnscreen. */
  private slideIn(): void {
    this.slideBoxes();
    this.slideSprites();
    if (this.slides.every((s) => s.dir === 0)) {
      for (const s of this.slides) this.boxes[s.slot].putTilemap();
      this.slides = [];
      return this.finishTwoMonAction();
    }
    for (const s of this.slides) {
      s.offset += s.dir;
      if (s.offset === 0) s.dir = 0;
    }
  }

  /** SwitchPartyMon: the Pokémon (mic-core told) and their sprites trade places. */
  private switchMons(): void {
    const a = this.slotId;
    const b = this.slotId2;
    this.host.swap(a, b);
    const boxA = this.sprites[a]!;
    const boxB = this.sprites[b]!;
    for (const key of ["ball", "item", "status"] as const) swapPlaces(boxA[key], boxB[key]);
    swapPlaces(boxA.icon.sprite, boxB.icon.sprite);
    this.sprites[a] = boxB;
    this.sprites[b] = boxA;
  }

  /** FinishTwoMonAction: the cursor on where the Pokémon went, back to choosing. */
  private finishTwoMonAction(): void {
    this.removeStdMessage();
    this.action = Action.ChooseMon;
    this.animateSlot(this.slotId, 0);
    this.slotId = this.slotId2;
    this.animateSlot(this.slotId2, 1);
    this.showStdMessage(Message.ChooseMon);
    this.step = () => this.chooseMonInput();
  }

  // Closing

  /** Task_ClosePartyMenu: the screen fades out, then where it was opened from. */
  private close(): void {
    this.exitTo(null);
  }

  /** Fades out, then opens `next` (sPartyMenuInternal->exitCallback) or goes back. */
  private exitTo(next: (() => void) | null): void {
    this.exit = next;
    this.flow.gba.palettes.beginFade(PALETTES_ALL, -2, 0, 16, RGB_BLACK);
    this.step = () => {
      const { gba } = this.flow;
      if (gba.palettes.fadeActive) return;
      gba.tasks.reset();
      this.flow.text.ctx.canABSpeedUpPrint = false;
      if (this.exit) this.exit();
      else this.done();
    };
  }
}

/** TryMovePartySlot: the part of a box `width` tiles wide at column `x` still on the map, and how many columns it lost on the left. */
function visibleColumns(x: number, width: number): { x: number; width: number; skip: number } | null {
  if (x + width < 0 || x > 31) return null;
  if (x < 0) return { x: 0, width: width + x, skip: -x };
  return { x, width: x + width > 31 ? 32 - x : width, skip: 0 };
}

/** SwitchMenuBoxSprites: two sprites trade positions. */
function swapPlaces(a: Sprite, b: Sprite): void {
  [a.x, b.x] = [b.x, a.x];
  [a.y, b.y] = [b.y, a.y];
  [a.x2, b.x2] = [b.x2, a.x2];
  [a.y2, b.y2] = [b.y2, a.y2];
}
