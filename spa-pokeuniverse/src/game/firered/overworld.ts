// The overworld, entered from CONTINUE or the end of New Game: mic-core says where the trainer
// is (a snapshot), the map fades in from black with its music (FieldCB_WarpExitFadeFromBlack),
// and the player walks, predicted here and checked by the server step by step. The camera
// keeps the player at FireRed's spot on screen. A checks what the player faces; the server
// answers with a script (messages, sounds) during which the player can't move. START opens the
// START menu; its screens (the POKéDEX, POKéMON's party menu, the BAG, the Trainer Card, OPTION) fade out of the
// world and back into it, menu open.
// SELECT uses the item registered to it (the TM CASE and BERRY POUCH open, faded in from the
// world and back to it); an item used from the bag may work back on the field. The bedroom PC's
// script flickers its screen on, shows its menus and opens WITHDRAW ITEM or the BAG's DEPOSIT
// ITEM from black, coming back to ITEM STORAGE. NPCs stand on the map; talking to one turns it
// to the player, and a trainer's script asks YES/NO, plays their encounter music and starts a
// battle: the battle screen (phase-5 M7) takes over until it ends, and the script goes on
// after a win. A battle in progress after a reconnect is drawn again as it stands.
// The stairs start leaving at once (predicted, no latency); mic-core decides and answers Warped
// once saved. The next map loads on the black screen, so a slow answer only stays black longer,
// and a refusal fades back in. SAVE is a homage: it asks mic-core nothing (save-dialog.ts).

import { create } from "@bufbuild/protobuf";
import type { BattleEvent } from "@pokeuniverse/contracts/battle/v1/event";
import { BattleResult, CaughtWhere, type BattleEnded, type BattleStarted, type BattleTurn, type BattleView, type CaughtPokemon } from "@pokeuniverse/contracts/battle/v1/view";
import { Gender as MonGender } from "@pokeuniverse/contracts/pokemon/v1/pokemon";
import { ItemOutcome, ItemResultSchema, type BagChanged, type ItemResult } from "@pokeuniverse/contracts/item/v1/bag";
import { Item } from "@pokeuniverse/contracts/item/v1/catalog";
import type { ClientMap } from "@pokeuniverse/contracts/map/v1/map";
import { Direction } from "@pokeuniverse/contracts/map/v1/map";
import { ButtonMode, type Gender } from "@pokeuniverse/contracts/trainer/v1/trainer";
import type { PcChanged } from "@pokeuniverse/contracts/item/v1/pc";
import { BoxViewSchema, type BoxView } from "@pokeuniverse/contracts/party/v1/box";
import { FieldMoveOutcome, FieldMoveResultSchema, LearnMoveResultSchema, PokemonEvolvedSchema, type FieldMoveResult, type LearnMoveResult, type PartyChanged, type PokemonEvolved } from "@pokeuniverse/contracts/party/v1/party";
import type { PokedexChanged } from "@pokeuniverse/contracts/pokedex/v1/pokedex";
import type { Correction, Follower, FollowerChanged, OtherPlayer, PcScreen, PlayersPc, Script, ScriptStep, Warped, WorldSnapshot, ZoneEvents } from "@pokeuniverse/contracts/world/v1/world";
import { Button } from "../gba/input";
import { PALETTES_ALL } from "../gba/palette";
import type { Task } from "../gba/tasks";
import { decodeText, expandPlaceholders, FontId, PLACEHOLDER_PLAYER, PLACEHOLDER_STR_VAR_1, PLACEHOLDER_STR_VAR_2, type Text } from "../gba/text";
import { rgb, RGB_BLACK } from "../gba/video";
import { Avatar, type AvatarInput } from "../world/avatar";
import { BagState, StoredItems } from "../world/items";
import { PartyState } from "../world/party";
import { PokedexState } from "../world/pokedex";
import { behaviorAt, loadMap, TILE } from "../world/map";
import { DELTAS } from "../world/rules";
import { FieldMessage, fieldYesNo } from "./field-message";
import { PlayerMenuRun } from "./player-menu";
import { MENU_NOTHING_CHOSEN, type YesNoMenu } from "./menu";
import { NpcSprite } from "./npc-sprite";
import type { Flow } from "./flow";
import { Assets, WORLD_TEXTS } from "./manifest";
import { PlayerSprite } from "./player-sprite";
import { FollowerSprite } from "./follower-sprite";
import { FollowerModel } from "../world/follower";
import { Others, type OtherPlayerModel } from "../world/others";
import { getSession } from "../../auth/session";
import { OtherPlayerSprite } from "./other-player-sprite";
import { SaveDialog } from "./save-dialog";
import { ArrivingStairs, LeavingStairs } from "./stair-warp";
import { BagLocation, openItemScreen, startBag, type BagExit, type BagHost } from "./bag";
import { itemMessage, ItemMessagePlayer, type ItemMessage } from "./item-messages";
import { startItemPc, type ItemPcHost } from "./item-pc";
import { beginPcScreenFlicker, PC_SCREEN_TILES, pcScreenOffset, PcChoice, PlayersPcMenu, StorageEntry } from "./players-pc";
import { startOptionMenu } from "./option-menu";
import { startStorage, type StorageHost } from "./storage/storage";
import type { BoxAction } from "../../realtime/box-action";
import { startPartyMenu, type PartyHost } from "./party-menu";
import { startPokedex } from "./pokedex";
import { StartMenu, StartMenuEntry } from "./start-menu";
import { startTrainerCard } from "./trainer-card";
import { BattleScreen, prepareBattle, type BattleHost } from "./battle/screen";
import { TallGrass } from "./tall-grass";
import { startNamingScreen } from "./naming-screen";

/** StartSweetScentFieldEffect's fade: delay 4, up to 8/16 toward RGB(31, 0, 0); TrySweetScentEncounter's 64 frames. */
const SWEET_SCENT_DELAY = 4;
const SWEET_SCENT_Y = 8;
const SWEET_SCENT_COLOR = rgb(31, 0, 0);
const SWEET_SCENT_FRAMES = 64;
/** {STR_VAR_3}, and the battle string's {B_OPPONENT_MON1_NAME}. */
const STR_VAR_3 = 0x04;
const B_OPPONENT_MON1_NAME = 0x06;

/** Sweet Scent on the field: back from the menu, red, fading back; mic-core's script once it arrives. */
interface SweetScent {
  phase: "menu" | "red" | "back";
  frames: number;
  script: Script | null;
}

/** The player's cell on screen: 7 tiles in, under the BG scrolled 40 pixels down (field_camera.c). */
const PLAYER_X = 7 * TILE;
const PLAYER_Y = 7 * TILE - 40;

/**
 * The field's backdrop, which screens that don't set their own color 0 (OPTION) show: the map's
 * first palette, color 0. In the house it is the building tileset's (213, 213, 172).
 */
const FIELD_BACKDROP = rgb(213 >> 3, 213 >> 3, 172 >> 3);

export function startOverworld(flow: Flow): void {
  const { gba, world, link } = flow;
  // The screen stays black until the server says where the trainer is and the map is loaded.
  gba.setMain(() => {});
  let overworld: Overworld | null = null;
  // While a map loads, the newest snapshot (a reconnect may send another one).
  let pending: WorldSnapshot | null = null;
  // The nickname question mic-core asks again on joining comes while the map still loads.
  let pendingNaming: BattleEnded | null = null;
  const enter = (snapshot: WorldSnapshot) => {
    pending = snapshot;
    void flow.social.load();
    // A warp's load still running ends first: two world.show can't cross.
    const settled = overworld?.settled;
    overworld?.destroy();
    overworld = null;
    void Promise.all([flow.newGameReady(), Promise.resolve(settled).then(() => loadWorld(flow, snapshot.map))]).then(
      ([, map]) => {
        const latest = pending!;
        pending = null;
        if (latest.map !== map.id) return enter(latest);
        overworld = new Overworld(flow, map, latest, leave);
        if (pendingNaming) overworld.battleEnded(pendingNaming);
        pendingNaming = null;
      },
      () => leave(),
    );
  };
  const leave = () => {
    flow.playTime.stop();
    link.leave();
    overworld?.destroy();
    world.hide();
    flow.toTitle();
  };
  link.enter({
    snapshot: (s) => {
      flow.playTime.start(s.playTimeSeconds);
      // Every snapshot (entering, a reconnect): the friends list read again (phase-9 M4).
      if (pending || overworld?.mapId === s.map) void flow.social.load();
      if (pending) pending = s;
      else if (overworld?.mapId === s.map) overworld.resume(s);
      else enter(s);
    },
    correction: (c) => overworld?.correct(c),
    warped: (w) => overworld?.warped(w),
    script: (s) => overworld?.run(s),
    bagChanged: (b) => overworld?.bagChanged(b),
    pcChanged: (p) => overworld?.pcChanged(p),
    partyChanged: (p) => overworld?.partyChanged(p),
    pokemonEvolved: (p) => overworld?.pokemonEvolved(p),
    learnMoveResult: (r) => overworld?.learnMoveResult(r),
    fieldMoveResult: (r) => overworld?.fieldMoveResult(r),
    boxView: (v) => overworld?.boxView(v),
    followerChanged: (f) => overworld?.followerChanged(f),
    zoneEvents: (z) => overworld?.zoneEvents(z),
    pokedexChanged: (p) => overworld?.pokedexChanged(p),
    itemResult: (r) => overworld?.itemResult(r),
    battleStarted: (b) => overworld?.battleStarted(b),
    battleTurn: (b) => overworld?.battleTurn(b),
    battleEnded: (b) => {
      if (overworld) overworld.battleEnded(b);
      else if (b.caught?.nicknamePending) pendingNaming = b;
    },
    noTrainer: leave,
  });
}

/** Draws the map (under the still black screen) and loads its music. */
async function loadWorld(flow: Flow, id: string): Promise<ClientMap> {
  const { world, gba } = flow;
  const map = await loadMap(id);
  world.setFade(16, RGB_BLACK);
  await Promise.all([world.show(map, Assets.tilesetArt(map.tileset)), map.music && gba.sound.load([map.music], Assets.soundUrl)]);
  return map;
}

/** The held direction as FireRed reads it: up, then down, left, right. */
function heldDirection(held: number): Direction {
  if (held & Button.Up) return Direction.NORTH;
  if (held & Button.Down) return Direction.SOUTH;
  if (held & Button.Left) return Direction.WEST;
  if (held & Button.Right) return Direction.EAST;
  return Direction.UNSPECIFIED;
}

/** Back from a screen: the menu is drawn on black, then the world fades in, then it takes input. */
const enum Return {
  None,
  Drawing,
  FadingIn,
}

/** The START menu and what it is doing. */
interface Menu {
  menu: StartMenu;
  returning: Return;
  /** The screen to open once the world faded to black. */
  opening: (() => void) | null;
  /** SAVE's dialog, in place of the menu. */
  saving: SaveDialog | null;
}

/** The PC in use: its menus and what it stores, as mic-core last said. */
interface OpenPc {
  menu: PlayersPcMenu;
  stored: StoredItems;
}

/** A PC's screen turned on on the map: its cell and the map's own tile there. */
interface PcScreenTile {
  x: number;
  y: number;
  tile: number;
}

/** A script the server sent, step by step. */
interface Running {
  id: number;
  /** The NPC who answered, if any. */
  npc: string;
  steps: ScriptStep[];
  index: number;
  /** The current message is printed: waiting for A or B. */
  waiting: boolean;
  /** The YES/NO menu of a yesNo step, while it waits for an answer. */
  yesNo: YesNoMenu | null;
  /** A trainerBattle or wildBattle step was sent: waiting for the battle to end. */
  battling: boolean;
  /** The menu on another player of a playerMenu step (phase-9 D4), while it is open. */
  playerMenu: PlayerMenuRun | null;
}

/** A warp under way, from the moment the player leaves until the next map is placed. */
interface Warp {
  /** The sprite leaving; none when the warp was cancelled and mic-core's answer came after all. */
  stairs: LeavingStairs | null;
  /** mic-core's answer. */
  arrival: Warped | null;
  /** The next map is loading, on the black screen. */
  loading: boolean;
}

/** Where an NPC turns to face the player who faces it (faceplayer). */
const FACING_PLAYER: Partial<Record<Direction, Direction>> = {
  [Direction.NORTH]: Direction.SOUTH,
  [Direction.SOUTH]: Direction.NORTH,
  [Direction.WEST]: Direction.EAST,
  [Direction.EAST]: Direction.WEST,
};

class Overworld {
  /** Ends when no map load of this overworld is running. Never rejects. */
  settled: Promise<void> = Promise.resolve();
  private map!: ClientMap;
  private avatar!: Avatar;
  private sprite!: PlayerSprite;
  /** The party's lead walking behind the player (HeartGold's), as mic-core last said plus predicted steps. */
  private follower!: FollowerModel;
  private followerSprite!: FollowerSprite;
  private tallGrass!: TallGrass;
  /** Everyone else in the zone (phase 8), and how each is drawn. */
  private others!: Others;
  private readonly otherSprites = new Map<bigint, OtherPlayerSprite>();
  /** Zone events after the Warped: the next map's, played once it's placed. */
  private nextZone: ZoneEvents[] = [];
  private npcs!: NpcSprite[];
  private readonly gender: Gender;
  private warp: Warp | null = null;
  private arriving: ArrivingStairs | null = null;
  private destroyed = false;
  private message!: FieldMessage;
  /** The battle the trainer is in (its ID): the player can't move until it ends. */
  private battle: string | null;
  /** The battle screen, while it shows. */
  private battleScreen: BattleScreen | null = null;
  /** A script changed the music: the map's comes back when it ends. */
  private scriptMusic = false;
  private script: Running | null = null;
  private menu: Menu | null = null;
  /** Off in a screen opened from the START menu: the world waits under it. */
  private away = false;
  private readonly playerName: Text;
  /** What the trainer carries, as mic-core last said. */
  private bag: BagState;
  /** The trainer's Pokédex, as mic-core last said. */
  private pokedex: PokedexState;
  /** Who waits for mic-core's PokemonEvolved. */
  private evolveAnswer: ((p: PokemonEvolved) => void) | null = null;
  /** Who waits for mic-core's LearnMoveResult. */
  private learnAnswer: ((r: LearnMoveResult) => void) | null = null;
  /** Sweet Scent was used from the party menu: its fade on the field, then the script mic-core sent. */
  private sweetScent: SweetScent | null = null;
  /** Who waits for mic-core's FieldMoveResult. */
  private fieldMoveAnswer: ((r: FieldMoveResult) => void) | null = null;
  /** Who waits for mic-core's BoxViews, by the seq of the message asking (BoxView.request). */
  private readonly boxAnswers = new Map<number, (v: BoxView) => void>();
  /** The trainer's Pokémon, as mic-core last said. */
  private party: PartyState;
  /** Waiting for mic-core's ItemResults, in the order asked. */
  private itemAnswers: ((r: ItemResult) => void)[] = [];
  /** An item's message on the field (SELECT, or back from the bag); the player can't move. */
  private fieldItem: ItemMessagePlayer | null = null;
  /** The nickname question asked on the field: a restart lost the battle screen it came after. */
  private caughtAsk: Generator<void, void, void> | null = null;
  /** The screen a registered item opens once the world faded to black. */
  private fieldOpening: (() => void) | null = null;
  private pc: OpenPc | null = null;
  private pcScreen: PcScreenTile | null = null;
  private pcFlicker: Task | undefined;

  constructor(
    private readonly flow: Flow,
    map: ClientMap,
    snapshot: WorldSnapshot,
    /** Back to the title: the next map couldn't load. */
    private readonly leave: () => void,
  ) {
    const { gba } = flow;
    const p = snapshot.player!;
    this.gender = p.gender;
    this.playerName = flow.encode(flow.trainer?.name ?? "");
    this.bag = new BagState(snapshot.bag);
    this.pokedex = new PokedexState(snapshot.pokedex);
    this.party = new PartyState(snapshot.party);
    this.place(map, p.x, p.y, p.facing, snapshot.canRun, p.follower, snapshot.others);
    this.battle = snapshot.battle?.battleId ?? null;
    if (map.music) gba.sound.playBgm(map.music);
    this.enter(false);
    if (snapshot.battle) this.showBattle(snapshot.battle, [], false);
  }

  /** No map's id while the next one loads: any snapshot then starts over from what it says. */
  get mapId(): string {
    return this.warp?.loading ? "" : this.map.id;
  }

  /** The player and NPCs on a map that's already drawn. */
  private place(map: ClientMap, x: number, y: number, facing: Direction, canRun: boolean, follower: Follower | undefined, others: OtherPlayer[]): void {
    const { flow } = this;
    const { world, link } = flow;
    this.map = map;
    this.avatar = new Avatar(map, x, y, facing, canRun, {
      move: (step, d, run, x, y) => {
        link.move(step, d, run, x, y);
        this.tallGrass.enter("player", x + DELTAS[d][0], y + DELTAS[d][1]);
        const { x: fx, y: fy, hidden } = this.follower;
        this.follower.follow(x, y, run);
        if (!this.follower.species) return;
        if (fx !== x || fy !== y) this.tallGrass.enter("follower", x, y);
        else if (hidden) this.tallGrass.enter("follower", x, y, true);
      },
      turn: (d) => link.turn(d),
      warp: (d, x, y) => this.leaveByStairs(d, x, y),
      interact: (walkInto) => link.interact(walkInto),
      openMenu: () => this.openMenu(false),
      useRegistered: () => this.useRegistered(),
      bump: () => flow.play("se_wall_hit"),
    });
    this.sprite = new PlayerSprite(world, flow.assets, this.gender);
    this.follower = new FollowerModel(follower);
    this.followerSprite = new FollowerSprite(world, flow.assets);
    this.npcs = map.npcs.map((n) => new NpcSprite(world, flow.assets, n));
    this.tallGrass = new TallGrass(world, flow.assets, map);
    this.regrass();
    const self = getSession()?.account.id ?? 0n;
    // A new map: its chat starts empty (D13).
    this.flow.chat.clear();
    this.others = new Others(map, self, {
      joined: (p) => this.otherSprites.set(p.id, new OtherPlayerSprite(world, flow.assets, p)),
      left: (p) => {
        this.otherSprites.get(p.id)?.destroy();
        this.otherSprites.delete(p.id);
        this.tallGrass.forget(`other:${p.id}`);
        this.tallGrass.forget(`other-follower:${p.id}`);
      },
      stepped: (p, fx, fy) => {
        this.tallGrass.enter(`other:${p.id}`, p.x, p.y);
        if (p.follower.species) this.tallGrass.enter(`other-follower:${p.id}`, fx, fy);
      },
      placed: (p) => this.regrassOther(p),
      chat: (id, name, text) => {
        const own = id === self;
        // Someone already gone from the map: nobody to name.
        if (own || name !== undefined) this.flow.chat.add({ id, name: own ? (this.flow.trainer?.name ?? "") : name!, text, own });
      },
    });
    this.others.fromSnapshot(others);
  }

  /** The grass over another player's feet and its shown follower's, standing where they are now. */
  private regrassOther(p: OtherPlayerModel): void {
    const [me, mine] = [`other:${p.id}`, `other-follower:${p.id}`];
    this.tallGrass.forget(me);
    this.tallGrass.forget(mine);
    this.tallGrass.enter(me, p.x, p.y, true);
    const f = p.follower;
    if (f.species && !f.hidden) this.tallGrass.enter(mine, f.x, f.y, true);
  }

  /** The grass over the feet of the player and a shown follower, standing where they are now. */
  private regrass(): void {
    this.tallGrass.forget("player");
    this.tallGrass.forget("follower");
    this.tallGrass.enter("player", this.avatar.x, this.avatar.y, true);
    const f = this.follower;
    if (f.species && !f.hidden) this.tallGrass.enter("follower", f.x, f.y, true);
  }

  /**
   * The field's screen set up again: on arriving (fading in from black at once), back from a
   * START menu screen (CB2_ReturnToFieldWithOpenMenu: the menu drawn first, on black) or from
   * another screen (`draw` puts its windows back on black, e.g. the PC's menu).
   */
  private enter(withMenu: boolean, draw?: () => void): void {
    const { gba, world } = this.flow;
    gba.setVBlank(null);
    gba.reset();
    gba.video.transparentBackdrop = true;
    this.message = new FieldMessage(this.flow);
    this.draw();
    world.setFade(16, RGB_BLACK);
    if (withMenu) this.openMenu(true);
    else {
      draw?.();
      this.fadeIn();
    }
    const main = () => {
      this.frame();
      if (this.away) return;
      this.flow.runFrame();
      if (this.menu?.returning !== Return.Drawing) world.setFade(gba.palettes.fadeY, gba.palettes.fadeColor);
    };
    gba.setMain(main);
    // The chat shows on the field, not over battles and START's menus (FireRed's screens stay as they are).
    this.flow.chat.field = () => !this.destroyed && gba.currentMain === main && !this.away && this.menu === null && this.battleScreen === null;
  }

  /** FadeInFromBlack. */
  private fadeIn(): void {
    const { gba } = this.flow;
    gba.palettes.beginFade(PALETTES_ALL, 0, 16, 0, RGB_BLACK);
    gba.setVBlank(gba.standardVBlank);
  }

  /** Back in the world after a reconnect: where the server has the player, no script running. */
  resume(s: WorldSnapshot): void {
    const p = s.player!;
    this.cancelWarp();
    this.avatar.snap(p.x, p.y, p.facing);
    this.follower.set(p.follower);
    this.regrass();
    this.nextZone = [];
    this.others.fromSnapshot(s.others);
    // Nothing said while away is replayed (D13).
    this.flow.chat.clear();
    this.avatar.waiting = false;
    this.endScript(false);
    if (this.pcScreen) this.flow.world.setTile(this.pcScreen.x, this.pcScreen.y, this.pcScreen.tile);
    this.pcScreen = null;
    this.flow.gba.tasks.destroy(this.pcFlicker);
    this.bag = new BagState(s.bag);
    this.party = new PartyState(s.party);
    // Box answers lost with the old connection: refusals, so the box screen shows mic-core's state again.
    const lost = [...this.boxAnswers.values()];
    this.boxAnswers.clear();
    for (const answer of lost) answer(create(BoxViewSchema));
    this.battle = s.battle?.battleId ?? null;
    // The battle as the server has it now, drawn again; none: back to the field.
    if (s.battle) this.showBattle(s.battle, [], false);
    else if (this.battleScreen) this.leaveBattle();
    // Answers lost with the connection: nothing happened.
    for (const answer of this.itemAnswers.splice(0)) answer(create(ItemResultSchema));
  }

  bagChanged(b: BagChanged): void {
    this.bag.apply(b);
  }

  pcChanged(p: PcChanged): void {
    this.pc?.stored.apply(p.slots);
  }

  partyChanged(p: PartyChanged): void {
    this.party.apply(p);
  }

  pokemonEvolved(p: PokemonEvolved): void {
    this.evolveAnswer?.(p);
    this.evolveAnswer = null;
  }

  learnMoveResult(r: LearnMoveResult): void {
    this.learnAnswer?.(r);
    this.learnAnswer = null;
  }

  fieldMoveResult(r: FieldMoveResult): void {
    if (r.outcome === FieldMoveOutcome.SWEET_SCENT) this.sweetScent = { phase: "menu", frames: 0, script: null };
    this.fieldMoveAnswer?.(r);
    this.fieldMoveAnswer = null;
  }

  /** An answer nobody waits for (unasked, or its request already given up after a reconnect) is
   *  dropped: the box screen asked again on its own. */
  /** The party changed its lead: another Pokémon follows, or none. */
  followerChanged(f: FollowerChanged): void {
    this.follower.set(f.follower);
    this.regrass();
  }

  zoneEvents(z: ZoneEvents): void {
    if (this.warp?.arrival) this.nextZone.push(z);
    else this.others.apply(z);
  }

  boxView(v: BoxView): void {
    const answer = this.boxAnswers.get(v.request);
    this.boxAnswers.delete(v.request);
    answer?.(v);
  }

  pokedexChanged(p: PokedexChanged): void {
    this.pokedex = new PokedexState(p.pokedex);
  }

  itemResult(r: ItemResult): void {
    this.itemAnswers.shift()?.(r);
  }

  /** The battle screen takes over: with the transition and intro from a script, drawn as it stands otherwise. */
  battleStarted(b: BattleStarted): void {
    if (!b.view) return;
    this.battle = b.view.battleId;
    this.showBattle(b.view, b.events, this.script?.battling === true && !this.battleScreen);
  }

  battleTurn(b: BattleTurn): void {
    if (this.battleScreen?.id === b.battleId) this.battleScreen.turn(b);
  }

  /** The battle screen shows the ending first; a battle that couldn't start ends at once. */
  battleEnded(b: BattleEnded): void {
    this.battle = null;
    if (this.battleScreen && b.result !== BattleResult.UNSPECIFIED) this.battleScreen.ended(b);
    else {
      if (this.battleScreen) this.leaveBattle();
      this.afterBattle(b.result);
      if (b.caught?.nicknamePending) this.caughtAsk = this.askCaughtName(b.caught);
    }
  }

  /**
   * The battle's nickname question (Cmd_trygivecaughtmonnick) after a restart: mic-core asks it
   * again on joining, with the battle screen gone, so it comes in the field's message box. FireRed
   * has no reconnect; the texts, the YES/NO and the naming screen are the battle's.
   */
  private *askCaughtName(c: CaughtPokemon): Generator<void, void, void> {
    const { flow } = this;
    const { gba } = flow;
    // The species' names come with the party set, and the naming screen's icon with its art: the field may have neither yet.
    let loaded = false;
    Promise.all([flow.assets.loadParty(), flow.assets.pokemonArt(c.species)]).then(
      () => (loaded = true),
      () => (loaded = true),
    );
    while (!loaded) yield;
    const speciesName = flow.assets.species(c.species).name;
    const toPc = c.where === CaughtWhere.BOX;
    const box = (n: Text | null) =>
      expandPlaceholders(flow.assets.text(c.boxFullBefore ? "Text_MonSentToBoxSomeonesBoxFull" : "Text_MonSentToBoxInSomeonesPC"), {
        [PLACEHOLDER_STR_VAR_1]: flow.encode(c.boxName),
        [PLACEHOLDER_STR_VAR_2]: n ?? speciesName,
        [STR_VAR_3]: flow.encode(c.fullBoxName),
      });
    const pressed = () => {
      if (!gba.input.isPressed(Button.A | Button.B)) return false;
      gba.input.pressed &= ~(Button.A | Button.B);
      return true;
    };
    this.message.show(expandPlaceholders(flow.assets.text("sText_GiveNicknameCaptured"), { [B_OPPONENT_MON1_NAME]: speciesName }), false);
    while (this.message.printing) yield;
    const menu = fieldYesNo(flow);
    let answer: number;
    while ((answer = menu.processInput()) === MENU_NOTHING_CHOSEN) yield;
    gba.input.pressed &= ~(Button.A | Button.B);
    if (answer !== 0) {
      flow.link.nameCaughtPokemon("");
      if (!toPc) return;
      this.message.show(box(null), false);
      while (this.message.printing || !pressed()) yield;
      return;
    }
    this.message.hide();
    gba.palettes.beginFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
    // frame() runs this again once the fade is over.
    yield;
    const mon = c.where === CaughtWhere.PARTY ? this.party.pokemon[c.slot] : undefined;
    const gender = mon?.gender === MonGender.MALE ? "male" : mon?.gender === MonGender.FEMALE ? "female" : null;
    let named: Text | null | undefined;
    this.away = true;
    startNamingScreen(
      flow,
      "caughtMon",
      flow.trainer!.gender,
      (n) => {
        named = n;
        this.away = false;
        this.enter(false);
      },
      { species: c.species, name: speciesName, gender, sentToPc: toPc ? box : undefined },
    );
    while (named === undefined) yield;
    flow.link.nameCaughtPokemon(named ? decodeText(flow.assets.charmap, named) : "");
  }

  private showBattle(view: BattleView, events: BattleEvent[], intro: boolean): void {
    this.message.hide();
    this.menu = null;
    this.away = true;
    this.sprite.overFade = false;
    this.battleScreen = new BattleScreen(this.flow, this.battleHost(), view, events, intro);
  }

  /** Back on the field from the battle screen, with the map's music. */
  private leaveBattle(): void {
    this.battleScreen = null;
    this.away = false;
    this.enter(false);
    this.scriptMusic = false;
    if (this.map.music) this.flow.gba.sound.playBgm(this.map.music);
  }

  /**
   * After a win, running from a wild Pokémon or catching it the script goes on (its end tells
   * mic-core, which keeps the player still until then); a loss (whiteout) or a battle that
   * couldn't start ends it.
   */
  private afterBattle(result: BattleResult): void {
    const s = this.script;
    if (!s?.battling) return;
    s.battling = false;
    if (result === BattleResult.WON || result === BattleResult.RAN || result === BattleResult.CAUGHT) s.index++;
    else this.endScript(false);
  }

  /** The battle screen's way to the trainer's Pokémon, bag and mic-core. */
  private battleHost(): BattleHost {
    const { link } = this.flow;
    const self = this;
    return {
      get party() {
        return self.party;
      },
      playerName: this.playerName,
      gender: this.flow.trainer!.gender,
      nationalDex: this.pokedex.national,
      caught: (species) => this.pokedex.caught(species),
      get bag() {
        return self.bagHost();
      },
      choose: (battleId, step, action, partner) => link.battleChoice(battleId, step, action, partner),
      evolve: (slot) => this.askEvolve(slot),
      learnMove: (slot, move, forget) => link.learnMove(slot, move, forget),
      get pokedex() {
        return self.pokedex;
      },
      nameCaught: (name) => link.nameCaughtPokemon(name),
      finished: (result) => {
        this.leaveBattle();
        this.afterBattle(result);
      },
    };
  }

  /** Sends an item intent and waits for its ItemResult; offline, nothing happens. */
  private askItem(send: () => void): Promise<ItemResult> {
    if (!this.flow.link.inWorld) return Promise.resolve(create(ItemResultSchema));
    return new Promise((resolve) => {
      this.itemAnswers.push(resolve);
      send();
    });
  }

  /** The bag's way to the trainer's items. */
  private bagHost(): BagHost {
    const { link } = this.flow;
    const self = this;
    return {
      get bag() {
        return self.bag;
      },
      playerName: this.playerName,
      use: (item) => this.askItem(() => link.useItem(item, false)),
      give: (item) => this.askItem(() => link.giveItem(item, false)),
      toss: (item, quantity) => this.askItem(() => link.tossItem(item, quantity)),
      register: (item) => {
        this.bag.toggleRegistered(item);
        link.registerItem(item);
      },
      move: (pocket, from, to) => {
        if (this.bag.move(pocket, from, to)) link.moveItem(pocket, from, to);
      },
      deposit: (item, quantity) => this.askItem(() => link.depositItem(item, quantity)),
      get party() {
        return self.partyHost();
      },
    };
  }

  /** EvolvePokemon: mic-core saves it, then answers; offline it stops. */
  private askEvolve(slot: number): Promise<PokemonEvolved> {
    const { link } = this.flow;
    if (!link.inWorld) return Promise.resolve(create(PokemonEvolvedSchema, { slot, failed: true }));
    return new Promise((resolve) => {
      this.evolveAnswer = resolve;
      link.evolvePokemon(slot);
    });
  }

  /** LearnMove: mic-core saves it, then answers; offline nothing can evolve anyway. */
  private askFieldMove(slot: number, move: number, target?: number): Promise<FieldMoveResult> {
    const { link } = this.flow;
    if (!link.inWorld) return Promise.resolve(create(FieldMoveResultSchema));
    return new Promise((resolve) => {
      this.fieldMoveAnswer = resolve;
      link.useFieldMove(slot, move, target);
    });
  }

  /** OpenBox: boxes live on mic-core; offline it's a refusal (box 0), as there is nothing to show. */
  private askBox(box: number): Promise<BoxView> {
    const { link } = this.flow;
    if (!link.inWorld) return Promise.resolve(create(BoxViewSchema));
    return this.awaitBox(link.openBox(box));
  }

  /** A box action, shown at once by the box screen; the BoxView answer is what mic-core kept
   *  (offline: a refusal, box 0). */
  private boxAction(action: BoxAction): Promise<BoxView> {
    const { link } = this.flow;
    if (!link.inWorld) return Promise.resolve(create(BoxViewSchema));
    return this.awaitBox(link.boxAction(action));
  }

  /** The BoxView answering the message sent as `request`; not sent (0): a refusal. */
  private awaitBox(request: number): Promise<BoxView> {
    if (!request) return Promise.resolve(create(BoxViewSchema));
    return new Promise((resolve) => this.boxAnswers.set(request, resolve));
  }

  private askLearnMove(slot: number, move: number, forget: number): Promise<LearnMoveResult> {
    const { link } = this.flow;
    if (!link.inWorld) return Promise.resolve(create(LearnMoveResultSchema, { slot }));
    return new Promise((resolve) => {
      this.learnAnswer = resolve;
      link.learnMove(slot, move, forget);
    });
  }

  /** The box screen's way to the boxes, and to the party it shows beside them. */
  private storageHost(): StorageHost {
    return { partyHost: this.partyHost(), askBox: (box) => this.askBox(box), boxAction: (a) => this.boxAction(a) };
  }

  /** The party menu's way to the trainer's Pokémon (and to the bag, for GIVE). */
  private partyHost(): PartyHost {
    const { link } = this.flow;
    const self = this;
    return {
      get party() {
        return self.party;
      },
      playerName: this.playerName,
      gender: this.flow.trainer!.gender,
      nationalDex: this.pokedex.national,
      get bag() {
        return self.bagHost();
      },
      useItem: (item, slot, moveSlot) => this.askItem(() => link.usePartyItem(item, slot, moveSlot)),
      useFieldMove: (slot, move, target) => this.askFieldMove(slot, move, target),
      growth: {
        evolve: (slot) => this.askEvolve(slot),
        learnMove: (slot, move, forget) => this.askLearnMove(slot, move, forget),
        mapMusic: () => {
          if (this.map.music) this.flow.gba.sound.playBgm(this.map.music);
        },
      },
      give: (item, slot, pc) => this.askItem(() => link.givePartyItem(item, slot, pc)),
      take: (slot) => this.askItem(() => link.takePartyItem(slot)),
      swap: (a, b) => {
        if (this.party.swap(a, b)) link.swapPartySlots(a, b);
      },
      swapMoves: (slot, a, b) => {
        if (this.party.swapMoves(slot, a, b)) link.swapPokemonMoves(slot, a, b);
      },
    };
  }

  /** WITHDRAW ITEM's way to what the PC stores. */
  private pcHost(pc: OpenPc): ItemPcHost {
    const { link } = this.flow;
    const self = this;
    return {
      get party() {
        return self.partyHost();
      },
      stored: pc.stored,
      withdraw: (item, quantity) => this.askItem(() => link.withdrawItem(item, quantity)),
      give: (item) => this.askItem(() => link.giveItem(item, true)),
      move: (from, to) => {
        if (pc.stored.move(from, to)) link.movePcItem(from, to);
      },
    };
  }

  /**
   * UseRegisteredKeyItemOnField: SELECT uses the registered item, mic-core says what it did;
   * with none, a sign message: "An item in the BAG can be registered to SELECT for easy use."
   */
  private useRegistered(): void {
    const { flow } = this;
    const item = this.bag.registered;
    if (item === Item.UNSPECIFIED) {
      const text = flow.assets.text("Text_BagItemCanBeRegistered");
      return this.showFieldMessage({ text, font: FontId.Normal, delay: 0, sound: null, waitSound: false, waitA: true, sign: true });
    }
    this.avatar.waiting = true;
    void this.askItem(() => flow.link.useItem(item, true)).then((r) => {
      this.avatar.waiting = false;
      this.useOnField(r);
    });
  }

  /**
   * What an item does on the field: its message (effects like riding come with the outdoor
   * maps), or the screen it opens (Task_InitTMCaseFromField: FadeScreen, then the screen, then
   * CB2_ReturnToField).
   */
  private useOnField(r: ItemResult): void {
    const { flow } = this;
    if (r.outcome === ItemOutcome.OPEN) {
      flow.gba.palettes.beginFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
      this.fieldOpening = () => {
        this.away = true;
        const back = () => {
          this.away = false;
          this.enter(false);
        };
        if (!openItemScreen(flow, flow.trainer!.gender, this.bagHost(), r.item, true, back)) back();
      };
      return;
    }
    const msg = itemMessage(flow, r, this.playerName);
    if (msg) this.showFieldMessage(msg);
  }

  private showFieldMessage(msg: ItemMessage): void {
    this.fieldItem = new ItemMessagePlayer(
      this.flow,
      msg,
      (text, font, sign) => this.message.show(text, sign, font),
      () => this.message.printing,
    );
  }

  correct(c: Correction): void {
    this.cancelWarp();
    this.avatar.snap(c.x, c.y, c.facing);
    this.follower.set(c.follower);
    this.regrass();
  }

  /** mic-core took the player through; a warp cancelled by an older correction fades out first. */
  warped(w: Warped): void {
    if (this.warp) {
      this.warp.arrival = w;
      return;
    }
    this.flow.gba.palettes.beginFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
    this.warp = { stairs: null, arrival: w, loading: false };
  }

  /** The stairs, predicted: the sprite starts leaving at once. */
  private leaveByStairs(d: Direction, x: number, y: number): void {
    const { flow, avatar, sprite } = this;
    flow.link.useWarp(d, x, y);
    this.warp = { stairs: new LeavingStairs(flow, avatar, sprite, behaviorAt(this.map, x, y)), arrival: null, loading: false };
  }

  /** mic-core refused, or the connection came back without the warp: the player stays here. */
  private cancelWarp(): void {
    if (!this.warp || this.warp.loading) return;
    this.warp = null;
    this.nextZone = [];
    this.sprite.offsetX = this.sprite.offsetY = 0;
    this.sprite.forceOver = false;
    const { palettes } = this.flow.gba;
    if (!palettes.fadeActive && palettes.fadeY === 0) return;
    palettes.stopFade();
    palettes.beginFade(PALETTES_ALL, 0, palettes.fadeY, 0, RGB_BLACK);
  }

  /** The screen is black and mic-core answered: the next map loads, then the player arrives. */
  private travel(warp: Warp, to: Warped): void {
    const { flow } = this;
    warp.loading = true;
    this.destroySprites();
    this.settled = loadWorld(flow, to.map).then(
      (map) => {
        if (this.destroyed) return;
        const previousMusic = this.map.music;
        this.warp = null;
        this.place(map, to.x, to.y, to.facing, to.canRun, to.follower, to.others);
        for (const z of this.nextZone) this.others.apply(z);
        this.nextZone = [];
        // The same song keeps playing (TryFadeOutOldMapMusic).
        if (map.music && map.music !== previousMusic) flow.gba.sound.playBgm(map.music);
        this.enter(false);
        this.arriving = new ArrivingStairs(flow, this.avatar, this.sprite, behaviorAt(map, to.x, to.y));
      },
      () => {
        if (!this.destroyed) this.leave();
      },
    );
  }

  /** One frame of a warp under way, either way. */
  private runWarp(): void {
    if (this.arriving?.update()) this.arriving = null;
    const w = this.warp;
    if (!w) return;
    const black = w.stairs ? w.stairs.update() : !this.flow.gba.palettes.fadeActive;
    if (black && w.arrival) this.travel(w, w.arrival);
  }

  /** The answer to an interaction: nothing, or a script to show. */
  run(s: Script): void {
    this.avatar.waiting = false;
    // Sweet Scent's answer waits for its fade on the field.
    if (this.sweetScent && !this.sweetScent.script) {
      this.sweetScent.script = s;
      return;
    }
    if (!s.steps.length) return;
    this.script = { id: s.id, npc: s.npc, steps: s.steps, index: 0, waiting: false, yesNo: null, battling: false, playerMenu: null };
    // A trainer's script: the battle's art and sounds load while they talk.
    if (s.steps.some((step) => step.action.case === "trainerBattle" || step.action.case === "wildBattle")) void prepareBattle(this.flow).catch(() => {});
    const facing = FACING_PLAYER[this.avatar.facing];
    if (facing) this.npcs.find((n) => n.npc.id === s.npc)?.face(facing);
  }

  destroy(): void {
    this.destroyed = true;
    this.flow.chat.field = null;
    this.destroySprites();
    this.message.hide();
  }

  private destroySprites(): void {
    this.sprite.destroy();
    this.followerSprite.destroy();
    this.others.clear();
    this.tallGrass.destroy();
    for (const npc of this.npcs) npc.destroy();
  }

  private frame(): void {
    const { input } = this.flow.gba;
    if (this.warp?.loading) return;
    this.runWarp();
    // Just started loading: the sprites are gone.
    if (this.warp?.loading) return;
    this.runOthers();
    if (this.fieldOpening) {
      if (this.flow.gba.palettes.fadeActive) return;
      const open = this.fieldOpening;
      this.fieldOpening = null;
      return open();
    }
    if (this.sweetScent && !this.away) this.runSweetScent();
    if (this.script) this.runScript();
    if (this.fieldItem && !this.flow.gba.palettes.fadeActive && this.fieldItem.update()) {
      this.fieldItem = null;
      this.message.hide();
    }
    if (this.caughtAsk && !this.away && !this.flow.gba.palettes.fadeActive && this.warp === null && this.caughtAsk.next().done) {
      this.caughtAsk = null;
      this.message.hide();
    }
    // The button that closes the menu doesn't also act in the world.
    const menuOpen = this.menu !== null;
    if (this.menu) this.runMenu();
    if (this.away) return;
    const controls: AvatarInput = {
      direction: heldDirection(input.held),
      run: input.isHeld(Button.B),
      check: input.isPressed(Button.A),
      menu: input.isPressed(Button.Start),
      select: input.isPressed(Button.Select),
    };
    // Messages and menus lock the player, and so does being offline: steps the server can't check aren't taken.
    const locked = this.warp !== null || this.arriving !== null || this.script !== null || this.sweetScent !== null || this.battle !== null || this.fieldItem !== null || this.caughtAsk !== null || menuOpen || !this.flow.link.inWorld || this.flow.gba.palettes.fadeActive;
    this.avatar.update(controls, locked);
    this.follower.update();
    this.draw();
  }

  /** ShowStartMenu (with SE_WIN_OPEN), or the menu drawn again under the black screen on returning. */
  private openMenu(returning: boolean): void {
    const { flow } = this;
    if (!returning) flow.play("se_win_open");
    const helpBar = flow.options.buttonMode === ButtonMode.HELP;
    const menu = new StartMenu(flow, flow.gba.video.bgs[0], this.playerName, { hasPokedex: this.pokedex.obtained, hasPokemon: this.party.count > 0, helpBar });
    this.menu = { menu, returning: returning ? Return.Drawing : Return.None, opening: null, saving: null };
    menu.draw();
  }

  private runMenu(): void {
    const m = this.menu!;
    const { palettes } = this.flow.gba;
    if (m.opening) {
      if (!palettes.fadeActive) m.opening();
      return;
    }
    if (m.saving) {
      const outcome = m.saving.update();
      if (outcome) m.saving = null;
      if (outcome === "cancelled") m.menu.redraw();
      else if (outcome === "saved") this.menu = null;
      return;
    }
    if (!m.menu.draw()) return;
    if (m.returning === Return.Drawing) {
      this.fadeIn();
      m.returning = Return.FadingIn;
      return;
    }
    // Task_WaitFadeAndCreateStartMenuTask: the menu takes input once the world is back.
    if (m.returning === Return.FadingIn) {
      if (!palettes.fadeActive) m.returning = Return.None;
      return;
    }
    const chosen = m.menu.update();
    if (chosen === "closed") this.menu = null;
    else if (chosen === StartMenuEntry.Exit) {
      m.menu.close();
      this.menu = null;
    } else if (chosen === StartMenuEntry.Bag)
      this.openScreen((back) =>
        startBag(this.flow, this.flow.trainer!.gender, this.bagHost(), (exit: BagExit) => {
          back(exit === null);
          if (exit && "field" in exit) this.useOnField(exit.field);
        }),
      );
    else if (chosen === StartMenuEntry.Pokedex)
      // The Pokédex's art and every species' text load the first time it opens, on the black screen.
      this.openScreen((back) =>
        this.flow.assets.loadPokedex().then(
          () => startPokedex(this.flow, this.flow.trainer!.gender, this.pokedex, back),
          () => back(),
        ),
      );
    else if (chosen === StartMenuEntry.Pokemon) this.openScreen((back) => startPartyMenu(this.flow, this.partyHost(), { kind: "field" }, back));
    else if (chosen === StartMenuEntry.Player) this.openScreen((back) => startTrainerCard(this.flow, this.flow.trainer!, this.playerName, back));
    else if (chosen === StartMenuEntry.Option) this.openScreen((back) => startOptionMenu(this.flow, FIELD_BACKDROP, back));
    else if (chosen === StartMenuEntry.Save) {
      m.menu.removeForSave();
      m.saving = new SaveDialog(this.flow, this.message, { playerName: this.playerName, region: this.map.region, pokedex: this.pokedex });
    }
  }

  /**
   * StartMenu_FadeScreenIfLeavingOverworld, then the screen; back into the world with the menu
   * open, or closed when an item used from the bag works on the field.
   */
  private openScreen(open: (back: (withMenu?: boolean) => void) => void): void {
    const { gba } = this.flow;
    gba.palettes.beginFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
    this.menu!.opening = () => {
      this.menu = null;
      this.away = true;
      open((withMenu = true) => {
        this.away = false;
        // FieldCallback_PrepareFadeInFromMenu: Sweet Scent comes back without the START menu.
        this.enter(withMenu && !this.sweetScent);
      });
    };
  }

  /**
   * The others move on their own, whatever the own player does (a menu, a message, a screen over
   * the field). Offline they're gone: the reconnect's snapshot draws them again.
   */
  private runOthers(): void {
    if (!this.flow.link.inWorld) {
      if (this.others.players.size) this.others.clear();
      return;
    }
    this.others.update();
    for (const p of this.others.players.values()) this.otherSprites.get(p.id)?.update(p, this.sprite.overFade);
  }

  private draw(): void {
    this.sprite.update(this.avatar);
    this.followerSprite.update(this.follower, this.avatar.overTiles);
    this.tallGrass.overFade = this.sprite.overFade;
    this.tallGrass.update();
    this.flow.world.setCamera(this.avatar.pixelX - PLAYER_X, this.avatar.pixelY - PLAYER_Y);
  }

  /**
   * FldEff_SweetScent once the field has faded in (its cut-in of the Pokémon is phase 12's, with the
   * HMs' field effects): everything but the player fades to red, 64 frames, then a wild battle
   * starts from the red field; nothing there fades back first, then its message.
   */
  private runSweetScent(): void {
    const e = this.sweetScent!;
    const { gba, link } = this.flow;
    if (gba.palettes.fadeActive) return;
    if (e.phase === "menu") {
      this.flow.play("se_m_sweet_scent");
      this.sprite.overFade = true;
      gba.palettes.beginFade(PALETTES_ALL, SWEET_SCENT_DELAY, 0, SWEET_SCENT_Y, SWEET_SCENT_COLOR);
      e.phase = "red";
      return;
    }
    if (e.phase === "red") {
      if (e.frames < SWEET_SCENT_FRAMES) return void e.frames++;
      // mic-core's script comes right after its answer; offline it never will.
      if (!e.script && link.inWorld) return;
      if (e.script?.steps.some((step) => step.action.case === "wildBattle")) {
        this.sweetScent = null;
        return this.run(e.script);
      }
      gba.palettes.beginFade(PALETTES_ALL, SWEET_SCENT_DELAY, SWEET_SCENT_Y, 0, SWEET_SCENT_COLOR);
      e.phase = "back";
      return;
    }
    this.sweetScent = null;
    this.sprite.overFade = false;
    if (e.script) this.run(e.script);
  }

  /** One frame of the running script: sounds play at once; messages wait for A or B once printed. */
  private runScript(): void {
    const s = this.script!;
    for (;;) {
      const step = s.steps[s.index];
      if (!step) return this.endScript(true);
      if (step.action.case === "sound") {
        this.flow.gba.sound.play(step.action.value);
        s.index++;
        continue;
      }
      if (step.action.case === "music") {
        const id = step.action.value;
        const { sound } = this.flow.gba;
        void sound.load([id], Assets.soundUrl).then(
          () => this.script === s && sound.playBgm(id),
          () => {},
        );
        this.scriptMusic = true;
        s.index++;
        continue;
      }
      if (step.action.case === "pcScreen") {
        this.setPcScreen(step.action.value);
        s.index++;
        continue;
      }
      if (step.action.case === "playersPc") {
        if (!this.runPc(step.action.value)) return;
        s.index++;
        continue;
      }
      if (step.action.case === "playerMenu") {
        s.playerMenu ??= new PlayerMenuRun(this.flow, this.message, step.action.value);
        if (!s.playerMenu.update()) return;
        s.playerMenu = null;
        s.index++;
        continue;
      }
      if (step.action.case === "yesNo") {
        const yes = this.runYesNo(s);
        if (yes === null) return;
        if (yes) s.index++;
        else {
          s.steps = step.action.value.no;
          s.index = 0;
        }
        continue;
      }
      // A wild Pokémon: the battle starts once the step into the grass has ended.
      if (step.action.case === "wildBattle" && !s.battling && this.avatar.action) return;
      if (step.action.case === "trainerBattle" || step.action.case === "wildBattle") {
        if (!s.battling) {
          s.battling = true;
          this.message.hide();
          this.flow.link.scriptBattle(s.id);
        }
        return;
      }
      if (step.action.case === "faceOriginal") {
        const npc = this.npcs.find((n) => n.npc.id === s.npc);
        npc?.face(npc.npc.facing);
        s.index++;
        continue;
      }
      if (step.action.case !== "message") {
        s.index++;
        continue;
      }
      const msg = step.action.value;
      if (!s.waiting) {
        const text = this.flow.assets.text(WORLD_TEXTS[msg.text] ?? "");
        this.message.show(expandPlaceholders(text, { [PLACEHOLDER_PLAYER]: this.playerName }), msg.sign);
        s.waiting = true;
        return;
      }
      if (this.message.printing) return;
      // A question (msgbox MSGBOX_YESNO): the YES/NO menu opens as soon as it's printed.
      const asks = s.steps[s.index + 1]?.action.case === "yesNo";
      if (!asks && !this.flow.gba.input.isPressed(Button.A | Button.B)) return;
      s.waiting = false;
      s.index++;
      // Pressed this frame: the player doesn't also act on it.
      this.flow.gba.input.pressed &= ~(Button.A | Button.B);
    }
  }

  /** The YES/NO menu over the message: true YES, false NO (or B), null while it waits. */
  private runYesNo(s: Running): boolean | null {
    s.yesNo ??= fieldYesNo(this.flow);
    const answer = s.yesNo.processInput();
    if (answer === MENU_NOTHING_CHOSEN) return null;
    s.yesNo = null;
    // Pressed this frame: the player doesn't also act on it.
    this.flow.gba.input.pressed &= ~(Button.A | Button.B);
    return answer === 0;
  }

  private endScript(done: boolean): void {
    this.script?.playerMenu?.close();
    if (this.script && done) this.flow.link.scriptDone(this.script.id);
    this.script = null;
    // Sweet Scent's battle didn't start: the field comes back from its red.
    if (this.sprite.overFade) {
      this.sprite.overFade = false;
      if (!this.away) this.flow.gba.palettes.beginFade(PALETTES_ALL, SWEET_SCENT_DELAY, SWEET_SCENT_Y, 0, SWEET_SCENT_COLOR);
    }
    if (this.scriptMusic) {
      this.scriptMusic = false;
      if (this.map.music) this.flow.gba.sound.playBgm(this.map.music);
    }
    // Away, the screen shown owns BG0: the field's windows are set up again on returning.
    if (!this.away) {
      this.pc?.menu.close();
      this.message.hide();
    }
    this.pc = null;
  }

  /**
   * AnimatePcTurnOn (the screen flickers on) or AnimatePcTurnOff, on the cell the player faces.
   * The map's own tile comes back if the script stops early.
   */
  private setPcScreen(screen: PcScreen): void {
    const tiles = PC_SCREEN_TILES[screen.pc];
    if (!tiles) return;
    const { world, gba } = this.flow;
    const [dx, dy] = pcScreenOffset(this.avatar.facing);
    const x = this.avatar.x + dx;
    const y = this.avatar.y + dy;
    gba.tasks.destroy(this.pcFlicker);
    if (!screen.on) {
      world.setTile(x, y, tiles.off);
      this.pcScreen = null;
      return;
    }
    this.pcScreen = { x, y, tile: this.map.tiles[y * this.map.width + x] };
    this.pcFlicker = beginPcScreenFlicker(gba, (on) => world.setTile(x, y, on ? tiles.on : tiles.off));
  }

  /** The PC's menus, until TURN OFF: true then. The screens it opens fade out of the world and back. */
  private runPc(players: PlayersPc): boolean {
    const { flow } = this;
    if (!this.pc) {
      const stored = new StoredItems(players.items);
      this.pc = { stored, menu: new PlayersPcMenu(flow, () => this.message, () => stored.slots.length, () => this.party.count) };
    }
    const pc = this.pc;
    // Task_ReturnToItemStorageSubmenu: input waits for the world to be back.
    if (flow.gba.palettes.fadeActive) return false;
    switch (pc.menu.update()) {
      case PcChoice.TurnOff:
        this.pc = null;
        return true;
      case PcChoice.Withdraw:
        this.openPcScreen(() => pc.menu.resumeStorage(StorageEntry.Withdraw), (back) => startItemPc(flow, this.pcHost(pc), back));
        break;
      case PcChoice.Deposit:
        this.openPcScreen(() => pc.menu.resumeStorage(StorageEntry.Deposit), (back) => startBag(flow, flow.trainer!.gender, this.bagHost(), () => back(), BagLocation.ItemPc));
        break;
      case PcChoice.Boxes:
        this.openPcScreen(() => pc.menu.resumeBills(), (back) => startStorage(flow, this.storageHost(), pc.menu.billsEntry, back));
        break;
    }
    return false;
  }

  /** FadeScreen to black, the screen, then back to the PC's menu with the cursor on what was chosen. */
  private openPcScreen(resume: () => void, open: (back: () => void) => void): void {
    this.flow.gba.palettes.beginFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
    this.fieldOpening = () => {
      this.away = true;
      open(() => {
        this.away = false;
        this.enter(false, () => {
          if (this.pc) resume();
        });
      });
    };
  }
}
