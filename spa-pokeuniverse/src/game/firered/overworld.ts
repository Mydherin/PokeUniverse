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
import { BattleResult, type BattleEnded, type BattleStarted, type BattleTurn, type BattleView } from "@pokeuniverse/contracts/battle/v1/view";
import { ItemOutcome, ItemResultSchema, type BagChanged, type ItemResult } from "@pokeuniverse/contracts/item/v1/bag";
import { Item } from "@pokeuniverse/contracts/item/v1/catalog";
import type { ClientMap } from "@pokeuniverse/contracts/map/v1/map";
import { Direction } from "@pokeuniverse/contracts/map/v1/map";
import { ButtonMode, type Gender } from "@pokeuniverse/contracts/trainer/v1/trainer";
import type { PcChanged } from "@pokeuniverse/contracts/item/v1/pc";
import { PokemonEvolvedSchema, type PartyChanged, type PokemonEvolved } from "@pokeuniverse/contracts/party/v1/party";
import type { PokedexChanged } from "@pokeuniverse/contracts/pokedex/v1/pokedex";
import type { Correction, PcScreen, PlayersPc, Script, ScriptStep, Warped, WorldSnapshot } from "@pokeuniverse/contracts/world/v1/world";
import { Button } from "../gba/input";
import { PALETTES_ALL } from "../gba/palette";
import type { Task } from "../gba/tasks";
import { expandPlaceholders, FontId, PLACEHOLDER_PLAYER, type Text } from "../gba/text";
import { rgb, RGB_BLACK } from "../gba/video";
import { Avatar, type AvatarInput } from "../world/avatar";
import { BagState, StoredItems } from "../world/items";
import { PartyState } from "../world/party";
import { PokedexState } from "../world/pokedex";
import { behaviorAt, loadMap, TILE } from "../world/map";
import { FieldMessage, fieldYesNo } from "./field-message";
import { MENU_NOTHING_CHOSEN, type YesNoMenu } from "./menu";
import { NpcSprite } from "./npc-sprite";
import type { Flow } from "./flow";
import { Assets, WORLD_TEXTS } from "./manifest";
import { PlayerSprite } from "./player-sprite";
import { SaveDialog } from "./save-dialog";
import { ArrivingStairs, LeavingStairs } from "./stair-warp";
import { BagLocation, openItemScreen, startBag, type BagExit, type BagHost } from "./bag";
import { itemMessage, ItemMessagePlayer, type ItemMessage } from "./item-messages";
import { startItemPc, type ItemPcHost } from "./item-pc";
import { beginPcScreenFlicker, PC_SCREEN_TILES, pcScreenOffset, PcChoice, PlayersPcMenu, StorageEntry } from "./players-pc";
import { startOptionMenu } from "./option-menu";
import { startPartyMenu, type PartyHost } from "./party-menu";
import { startPokedex } from "./pokedex";
import { StartMenu, StartMenuEntry } from "./start-menu";
import { startTrainerCard } from "./trainer-card";
import { BattleScreen, prepareBattle, type BattleHost } from "./battle/screen";

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
  const enter = (snapshot: WorldSnapshot) => {
    pending = snapshot;
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
    pokedexChanged: (p) => overworld?.pokedexChanged(p),
    itemResult: (r) => overworld?.itemResult(r),
    battleStarted: (b) => overworld?.battleStarted(b),
    battleTurn: (b) => overworld?.battleTurn(b),
    battleEnded: (b) => overworld?.battleEnded(b),
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
  /** A trainerBattle step was sent: waiting for the battle to end. */
  battling: boolean;
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
  /** The trainer's Pokémon, as mic-core last said. */
  private party: PartyState;
  /** Waiting for mic-core's ItemResults, in the order asked. */
  private itemAnswers: ((r: ItemResult) => void)[] = [];
  /** An item's message on the field (SELECT, or back from the bag); the player can't move. */
  private fieldItem: ItemMessagePlayer | null = null;
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
    this.place(map, p.x, p.y, p.facing, snapshot.canRun);
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
  private place(map: ClientMap, x: number, y: number, facing: Direction, canRun: boolean): void {
    const { flow } = this;
    const { world, link } = flow;
    this.map = map;
    this.avatar = new Avatar(map, x, y, facing, canRun, {
      move: (step, d, run, x, y) => link.move(step, d, run, x, y),
      turn: (d) => link.turn(d),
      warp: (d, x, y) => this.leaveByStairs(d, x, y),
      interact: (walkInto) => link.interact(walkInto),
      openMenu: () => this.openMenu(false),
      useRegistered: () => this.useRegistered(),
      bump: () => flow.play("se_wall_hit"),
    });
    this.sprite = new PlayerSprite(world, flow.assets, this.gender);
    this.npcs = map.npcs.map((n) => new NpcSprite(world, flow.assets, n));
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
    gba.setMain(() => {
      this.frame();
      if (this.away) return;
      this.flow.runFrame();
      if (this.menu?.returning !== Return.Drawing) world.setFade(gba.palettes.fadeY, gba.palettes.fadeColor);
    });
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
    this.avatar.waiting = false;
    this.endScript(false);
    if (this.pcScreen) this.flow.world.setTile(this.pcScreen.x, this.pcScreen.y, this.pcScreen.tile);
    this.pcScreen = null;
    this.flow.gba.tasks.destroy(this.pcFlicker);
    this.bag = new BagState(s.bag);
    this.party = new PartyState(s.party);
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
    }
  }

  private showBattle(view: BattleView, events: BattleEvent[], intro: boolean): void {
    this.message.hide();
    this.menu = null;
    this.away = true;
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

  /** After a win the script goes on; a loss (whiteout) or a battle that couldn't start ends it. */
  private afterBattle(result: BattleResult): void {
    const s = this.script;
    if (!s?.battling) return;
    s.battling = false;
    if (result === BattleResult.WON) s.index++;
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
      get bag() {
        return self.bagHost();
      },
      choose: (battleId, step, action, partner) => link.battleChoice(battleId, step, action, partner),
      evolve: (slot) => {
        if (!link.inWorld) return Promise.resolve(create(PokemonEvolvedSchema, { slot, failed: true }));
        return new Promise((resolve) => {
          this.evolveAnswer = resolve;
          link.evolvePokemon(slot);
        });
      },
      learnMove: (slot, move, forget) => link.learnMove(slot, move, forget),
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
        this.place(map, to.x, to.y, to.facing, to.canRun);
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
    if (!s.steps.length) return;
    this.script = { id: s.id, npc: s.npc, steps: s.steps, index: 0, waiting: false, yesNo: null, battling: false };
    // A trainer's script: the battle's art and sounds load while they talk.
    if (s.steps.some((step) => step.action.case === "trainerBattle")) void prepareBattle(this.flow).catch(() => {});
    const facing = FACING_PLAYER[this.avatar.facing];
    if (facing) this.npcs.find((n) => n.npc.id === s.npc)?.face(facing);
  }

  destroy(): void {
    this.destroyed = true;
    this.destroySprites();
    this.message.hide();
  }

  private destroySprites(): void {
    this.sprite.destroy();
    for (const npc of this.npcs) npc.destroy();
  }

  private frame(): void {
    const { input } = this.flow.gba;
    if (this.warp?.loading) return;
    this.runWarp();
    // Just started loading: the sprites are gone.
    if (this.warp?.loading) return;
    if (this.fieldOpening) {
      if (this.flow.gba.palettes.fadeActive) return;
      const open = this.fieldOpening;
      this.fieldOpening = null;
      return open();
    }
    if (this.script) this.runScript();
    if (this.fieldItem && !this.flow.gba.palettes.fadeActive && this.fieldItem.update()) {
      this.fieldItem = null;
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
    const locked = this.warp !== null || this.arriving !== null || this.script !== null || this.battle !== null || this.fieldItem !== null || menuOpen || !this.flow.link.inWorld || this.flow.gba.palettes.fadeActive;
    this.avatar.update(controls, locked);
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
        this.enter(withMenu);
      });
    };
  }

  private draw(): void {
    this.sprite.update(this.avatar);
    this.flow.world.setCamera(this.avatar.pixelX - PLAYER_X, this.avatar.pixelY - PLAYER_Y);
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
      if (step.action.case === "trainerBattle") {
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
    if (this.script && done) this.flow.link.scriptDone(this.script.id);
    this.script = null;
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
      this.pc = { stored, menu: new PlayersPcMenu(flow, () => this.message, () => stored.slots.length) };
    }
    const pc = this.pc;
    // Task_ReturnToItemStorageSubmenu: input waits for the world to be back.
    if (flow.gba.palettes.fadeActive) return false;
    switch (pc.menu.update()) {
      case PcChoice.TurnOff:
        this.pc = null;
        return true;
      case PcChoice.Withdraw:
        this.openPcScreen(StorageEntry.Withdraw, (back) => startItemPc(flow, this.pcHost(pc), back));
        break;
      case PcChoice.Deposit:
        this.openPcScreen(StorageEntry.Deposit, (back) => startBag(flow, flow.trainer!.gender, this.bagHost(), () => back(), BagLocation.ItemPc));
        break;
    }
    return false;
  }

  /** FadeScreen to black, the screen, then back to ITEM STORAGE with the cursor on what was chosen. */
  private openPcScreen(cursor: StorageEntry, open: (back: () => void) => void): void {
    this.flow.gba.palettes.beginFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
    this.fieldOpening = () => {
      this.away = true;
      open(() => {
        this.away = false;
        this.enter(false, () => this.pc?.menu.resumeStorage(cursor));
      });
    };
  }
}
