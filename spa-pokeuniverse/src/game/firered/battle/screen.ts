// The FireRed battle screen (plans/battles M7). It shows what mic-battles resolved and asks the
// player's choices; it decides nothing. Its work is a queue of jobs, each a generator stepped
// once a frame: the transition, the intro (the terrain and trainers slide in, "<CLASS> <NAME>
// would like to battle!", the send-outs), each turn's events, the player's choice (FIGHT, BAG,
// POKéMON, RUN, or a forced switch) and the ending (the trainer comes back with their defeat
// line and the prize money, or the whiteout). BAG and POKéMON leave the battle screen for the
// bag and the party menu, and the battle is drawn again from its state on coming back, as after
// a reconnect.

import { clone, create } from "@bufbuild/protobuf";
import type { BattleEvent, BattlerInfo } from "@pokeuniverse/contracts/battle/v1/event";
import {
  BattleActionSchema,
  BattleKind,
  BattleResult,
  PartyBall,
  RequestKind,
  type BattleAction,
  type BattleEnded,
  type BattleTurn,
  type BattleView,
} from "@pokeuniverse/contracts/battle/v1/view";
import type { Item } from "@pokeuniverse/contracts/item/v1/catalog";
import { PartySchema, PokemonSchema, type Pokemon } from "@pokeuniverse/contracts/party/v1/party";
import { ItemResultSchema } from "@pokeuniverse/contracts/item/v1/bag";
import type { Gender } from "@pokeuniverse/contracts/trainer/v1/trainer";
import type { IndexedImage } from "../../gba/assets";
import { Button } from "../../gba/input";
import { PALETTES_ALL } from "../../gba/palette";
import { decimalText, NumberMode, type Text } from "../../gba/text";
import { RGB_BLACK } from "../../gba/video";
import { BattleState } from "../../battle/state";
import { PartyState } from "../../world/party";
import { BagLocation, startBag, type BagExit, type BagHost } from "../bag";
import type { Flow } from "../flow";
import { Assets, BATTLE_SOUNDS } from "../manifest";
import { loadAnimations } from "./anims";
import { startPartyMenu, type PartyHost, type PartyMenuMode } from "../party-menu";
import type { HealthboxMon } from "./healthbox";
import { PartySummary } from "./healthbox";
import { Action, chooseAction, chooseMove, type Cursors } from "./menus";
import { all, Playback, wait, type PlaybackHost } from "./playback";
import { BattleScene, Page } from "./scene";
import { BattleTexts } from "./text";
import { battleTransition } from "./transition";

/** The trainer's side of things: their full party, the bag, and the way to mic-core. */
export interface BattleHost {
  /** The trainer's Pokémon as mic-core last said (the battle's own HP, status and PP go over them). */
  readonly party: PartyState;
  readonly playerName: Text;
  readonly gender: Gender;
  readonly nationalDex: boolean;
  /** The bag BAG opens (items are only chosen there; the battle uses them). */
  readonly bag: BagHost;
  /** The choice for the request with this step (BattleChoice). */
  choose(battleId: string, step: number, action: BattleAction): void;
  /** The battle is over and the screen black: back to the field (after a loss, the whiteout). */
  finished(result: BattleResult): void;
}

/** The battle set and its sounds, started early (when a trainer's script starts) so the transition needn't wait. */
export function prepareBattle(flow: Flow): Promise<void> {
  return Promise.all([flow.assets.loadBattle(), flow.gba.sound.load([...BATTLE_SOUNDS], Assets.soundUrl), loadAnimations()]).then(() => {});
}

type Job = () => Generator<void, void, void>;

export class BattleScreen implements PlaybackHost {
  readonly state: BattleState;
  readonly texts: BattleTexts;
  readonly backPics = new Map<number, IndexedImage>();
  private sceneNow: BattleScene | null = null;
  private readonly playback: Playback;
  private readonly jobs: Job[] = [];
  private job: Generator<void, void, void> | null = null;
  private readonly cursors: Cursors = { action: 0, move: 0 };
  /** The battle party's order on the party menu: party slots, the one in battle first. */
  private order: number[];
  starting = false;
  /** Away in the bag or the party menu: the battle waits. */
  private away = false;

  constructor(
    readonly flow: Flow,
    private readonly host: BattleHost,
    view: BattleView,
    events: readonly BattleEvent[],
    intro: boolean,
  ) {
    this.state = new BattleState(view);
    this.texts = new BattleTexts(flow, host.playerName, view.trainer, (b) => this.state.battler(b) !== null);
    for (const side of this.state.sides) for (const info of side.active) if (info) this.texts.remember(info);
    this.playback = new Playback(this);
    const active = this.state.side(false).active[0]?.battler?.partySlot ?? 0;
    this.order = [active, ...host.party.pokemon.map((_, i) => i).filter((i) => i !== active)];
    flow.gba.setMain(() => this.frame());
    this.jobs.push(() => this.load());
    if (intro) this.jobs.push(() => this.introJob(events));
    else this.jobs.push(() => this.redrawJob(events));
  }

  get scene(): BattleScene {
    return this.sceneNow!;
  }

  get id(): string {
    return this.state.id;
  }

  /** What happened after a choice: shown, then the next request. */
  turn(t: BattleTurn): void {
    this.jobs.push(() => this.playJob(t.events, false));
    this.jobs.push(() => this.requestJob(t.request ?? null));
  }

  /** The battle is over: the ending once everything before it was shown. */
  ended(e: BattleEnded): void {
    this.jobs.push(() => this.endJob(e));
  }

  private frame(): void {
    if (this.away) return;
    if (!this.job) {
      const next = this.jobs.shift();
      if (next) this.job = next();
    }
    if (this.job?.next().done) this.job = null;
    this.flow.runFrame();
  }

  // Jobs

  /** The battle set, the battle's sounds, and every Pokémon on the field's art. */
  private *load(): Generator<void, void, void> {
    let ready = false;
    const arts = this.state.sides.flatMap((s) => s.active.filter((a): a is BattlerInfo => a !== null)).map((info) => this.loadArt(info));
    void Promise.all([prepareBattle(this.flow), ...arts]).then(
      () => (ready = true),
      () => (ready = true),
    );
    while (!ready) yield;
  }

  private loadArt(info: BattlerInfo): Promise<unknown> {
    const { assets } = this.flow;
    const foe = info.battler?.foe ?? false;
    return Promise.all([assets.pokemonArt(info.species), foe ? null : assets.backPic(info.species).then((pic) => this.backPics.set(info.species, pic))]);
  }

  /**
   * The transition on the field, then the intro: BattleIntroSlide3 (the black band opens, the
   * terrain's halves and the trainers slide in), the party balls, "<CLASS> <NAME> would like to
   * battle!", and the send-outs.
   */
  private *introJob(events: readonly BattleEvent[]): Generator<void, void, void> {
    const { flow, state } = this;
    const { gba } = flow;
    gba.setVBlank(null);
    gba.reset();
    gba.video.transparentBackdrop = true;
    gba.setVBlank(gba.standardVBlank);
    gba.sound.playBgm("mus_vs_trainer");
    yield* battleTransition(flow);

    const scene = this.newScene();
    scene.drawTerrain(true);
    const foeTrainer = state.trainer ? scene.showTrainer(true, state.trainer.pic) : null;
    const player = scene.showTrainer(false, "");
    let top = 80;
    let bottom = 81;
    let slide = 240;
    const place = () => {
      scene.setReveal(top, bottom);
      scene.terrainSlide = slide;
      if (foeTrainer) foeTrainer.x2 = -slide;
      if (player) player.x2 = slide;
    };
    place();
    // The band opens a line a frame up and down, then four, while the halves slide 2 pixels a frame.
    while (slide > 0 || top > 0) {
      yield;
      if (top > 48) {
        top--;
        bottom++;
      } else {
        top = Math.max(0, top - 4);
        bottom = Math.min(160, bottom + 4);
        slide = Math.max(0, slide - 2);
      }
      place();
    }
    scene.setReveal(0, 160);
    scene.drawTerrain();

    const summaries = [new PartySummary(flow, false, this.playerBalls()), ...(state.trainer ? [new PartySummary(flow, true, state.side(true).balls)] : [])];
    const tray = function* (): Generator<void, void, void> {
      while (!summaries.every((s) => s.settled)) {
        for (const s of summaries) s.update();
        yield;
      }
    };
    yield* tray();
    if (state.trainer) yield* scene.message(this.texts.format("sText_Trainer1WantsToBattle"), 0);
    for (const s of summaries) s.leave();
    this.starting = true;
    // Every tray moves each frame (not `some`, which would stop at the first one still moving).
    const out = function* (): Generator<void, void, void> {
      while (summaries.map((s) => s.update()).includes(true)) yield;
    };
    // FireRed sends the foe's out first; Showdown logs the player's first.
    const foeFirst = [...events].sort((a, b) => Number(isFoeSwitchIn(b)) - Number(isFoeSwitchIn(a)));
    yield* all(out(), this.playback.play(foeFirst));
    this.starting = false;
    yield* this.requestJob(state.request);
  }

  /** The battle drawn as it stands (a reconnect, or a battle started again), then its events and request. */
  private *redrawJob(events: readonly BattleEvent[]): Generator<void, void, void> {
    this.newScene();
    this.drawField();
    this.flow.gba.sound.playBgm("mus_vs_trainer");
    this.fadeIn();
    yield* this.playJob(events, false);
    yield* this.requestJob(this.state.request);
  }

  private *playJob(events: readonly BattleEvent[], starting: boolean): Generator<void, void, void> {
    this.starting = starting;
    yield* this.playback.play(events);
    this.starting = false;
  }

  /** The player's choice for a request (or nothing to do while the foe chooses). */
  private *requestJob(request: BattleView["request"] | null): Generator<void, void, void> {
    const { state } = this;
    if (request) state.request = request;
    const r = state.request;
    if (!r || r.kind === RequestKind.WAIT || r.kind === RequestKind.UNSPECIFIED) return;
    if (r.kind === RequestKind.SWITCH) {
      const slot = yield* this.chooseFromParty({ forced: true });
      if (slot !== null) this.send({ case: "switch", value: { $typeName: "pokeuniverse.battle.v1.SwitchAction", partySlot: slot } });
      return;
    }
    const active = state.side(false).active[0]?.battler;
    if (!active) return;
    for (;;) {
      const action = yield* chooseAction(this.flow, this.scene, this.texts, active, this.cursors);
      if (action === Action.Fight) {
        // Every move disabled or out of PP: FIGHT is Struggle.
        if (r.moves.every((m) => m.disabled || m.pp === 0)) return this.sendMove(0);
        const slot = yield* chooseMove(this.flow, this.scene, this.texts, active, r.moves, this.cursors);
        if (slot !== null) return this.sendMove(slot);
      } else if (action === Action.Pokemon) {
        const slot = yield* this.chooseFromParty({ forced: false });
        if (slot !== null) return this.send({ case: "switch", value: { $typeName: "pokeuniverse.battle.v1.SwitchAction", partySlot: slot } });
      } else if (action === Action.Bag) {
        const used = yield* this.chooseFromBag();
        if (used) return this.send({ case: "item", value: { $typeName: "pokeuniverse.battle.v1.ItemAction", item: used.item, partySlot: used.slot, moveSlot: 0 } });
      } else if (state.kind === BattleKind.TRAINER) {
        yield* this.scene.message(this.texts.format("sText_NoRunningFromTrainers"), 0);
      } else return this.send({ case: "run", value: { $typeName: "pokeuniverse.battle.v1.RunAction" } });
    }
  }

  private sendMove(slot: number): void {
    this.send({ case: "move", value: { $typeName: "pokeuniverse.battle.v1.MoveAction", slot } });
  }

  /** The choice goes to mic-core; the textbox waits empty for the turn. */
  private send(kind: BattleAction["kind"]): void {
    const r = this.state.request;
    if (!r) return;
    this.host.choose(this.state.id, r.step, create(BattleActionSchema, { kind }));
    this.state.request = null;
    this.scene.page = Page.Message;
    this.scene.clearMessage();
  }

  /**
   * The end: a win brings the victory music, "Player defeated <CLASS> <NAME>!", the trainer back
   * with their defeat line, and the prize; a loss the whiteout lines. Then black, and the field.
   */
  private *endJob(e: BattleEnded): Generator<void, void, void> {
    const { flow, texts, state } = this;
    const money = decimalText(e.money, NumberMode.LeftAlign, String(e.money).length);
    if (this.sceneNow && e.result === BattleResult.WON && state.trainer) {
      flow.gba.sound.playBgm("mus_victory_trainer");
      yield* this.scene.message(texts.format("sText_PlayerDefeatedLinkTrainerTrainer1"), 0);
      const trainer = this.scene.showTrainer(true, state.trainer.pic);
      if (trainer) {
        trainer.x2 = 96;
        while (trainer.x2 > 0) {
          trainer.x2 -= 4;
          yield;
        }
      }
      yield* this.scene.message(texts.format("sText_Trainer1LoseText"), 0);
      yield* this.waitPress();
      yield* this.scene.message(texts.format("sText_PlayerGotMoney", { buff1: money }), 0);
    } else if (this.sceneNow && (e.result === BattleResult.LOST || e.result === BattleResult.TIE)) {
      yield* this.scene.message(texts.format(state.trainer ? "sText_PlayerWhiteoutAgainstTrainer" : "sText_PlayerWhiteout"), 0);
      if (state.trainer) yield* this.scene.message(texts.format("sText_PlayerPaidAsPrizeMoney", { buff1: money }), 0);
    }
    const { gba } = flow;
    gba.palettes.beginFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
    gba.sound.fadeOutBgm(4);
    while (gba.palettes.fadeActive) yield;
    yield* wait(1);
    gba.sound.stopBgm();
    this.host.finished(e.result);
  }

  private *waitPress(): Generator<void, void, void> {
    while (!this.flow.gba.input.isPressed(Button.A | Button.B)) yield;
    this.flow.play("se_select");
  }

  // Screens: the party menu and the bag

  /** The party menu in battle mode: the party slot chosen, or null when cancelled. */
  private *chooseFromParty(how: { forced: boolean; item?: Item }): Generator<void, number | null, void> {
    let chosen: number | null = null;
    yield* this.openScreen((back) => this.openParty({ kind: "battle", forced: how.forced, item: how.item, choose: (i) => (chosen = this.order[i]) }, back));
    return chosen;
  }

  /** BAG: an item chosen in the bag, then the Pokémon it's for; null when either is cancelled. */
  private *chooseFromBag(): Generator<void, { item: Item; slot: number } | null, void> {
    let used: { item: Item; slot: number } | null = null;
    yield* this.openScreen((back) =>
      startBag(
        this.flow,
        this.host.gender,
        this.host.bag,
        (exit: BagExit) => {
          if (!exit || !("chosen" in exit)) return back();
          const item = exit.chosen;
          this.openParty({ kind: "battle", forced: false, item, choose: (i) => (used = { item, slot: this.order[i] }) }, back);
        },
        BagLocation.Battle,
      ),
    );
    return used;
  }

  private openParty(mode: PartyMenuMode, back: () => void): void {
    startPartyMenu(this.flow, this.partyHost(), mode, back);
  }

  /** Fades out, opens another screen, and once it's back draws the battle again and fades in. */
  private *openScreen(open: (back: () => void) => void): Generator<void, void, void> {
    const { gba } = this.flow;
    gba.palettes.beginFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
    while (gba.palettes.fadeActive) yield;
    let returned = false;
    this.away = true;
    open(() => {
      this.away = false;
      returned = true;
      gba.setMain(() => this.frame());
      this.newScene();
      this.drawField();
      this.fadeIn();
    });
    while (!returned) yield;
    while (gba.palettes.fadeActive) yield;
  }

  private newScene(): BattleScene {
    this.sceneNow = new BattleScene(this.flow, this.host.gender);
    return this.sceneNow;
  }

  private drawField(): void {
    this.scene.drawField(this.state, this.backPics, (info) => this.healthboxMon(info));
  }

  private fadeIn(): void {
    const { palettes } = this.flow.gba;
    palettes.blendPalettes(PALETTES_ALL, 16, RGB_BLACK);
    palettes.beginFade(PALETTES_ALL, 0, 16, 0, RGB_BLACK);
  }

  /** The party as the battle has it (HP, status, held item, PP over mic-core's data), the one in battle first. */
  private partyHost(): PartyHost {
    const members = new Map(this.state.party.map((m) => [m.partySlot, m]));
    const pokemon: Pokemon[] = this.order
      .map((slot) => {
        const base = this.host.party.pokemon[slot];
        if (!base) return null;
        const mon = clone(PokemonSchema, base);
        const m = members.get(slot);
        if (m) {
          mon.hp = m.health?.hp ?? mon.hp;
          mon.status = m.status;
          mon.heldItem = m.heldItem;
          m.pp.forEach((pp, i) => mon.moves[i] && (mon.moves[i].pp = pp));
        }
        return mon;
      })
      .filter((p): p is Pokemon => p !== null);
    const party = new PartyState(create(PartySchema, { pokemon }));
    const host = this.host;
    const none = () => Promise.resolve(create(ItemResultSchema));
    return {
      party,
      playerName: host.playerName,
      gender: host.gender,
      nationalDex: host.nationalDex,
      bag: host.bag,
      give: none,
      take: none,
      swap: () => {},
      swapMoves: () => {},
    };
  }

  // PlaybackHost

  /** The player sent a Pokémon out: it and the one it replaced trade places on the party menu (gBattlePartyCurrentOrder). */
  sentOut(slot: number): void {
    const i = this.order.indexOf(slot);
    if (i > 0) [this.order[0], this.order[i]] = [this.order[i], this.order[0]];
  }

  healthboxMon(info: BattlerInfo): HealthboxMon {
    const b = info.battler;
    const mon: HealthboxMon = {
      name: this.texts.name(b),
      species: info.species,
      nicknamed: info.nickname !== "",
      gender: info.gender,
      level: info.level,
      hp: info.health?.hp ?? 0,
      maxHp: info.health?.maxHp ?? 0,
      status: info.status,
    };
    if (b && !b.foe) {
      const p = this.host.party.pokemon[b.partySlot];
      if (p) mon.exp = [p.exp - p.levelExp, p.nextLevelExp - p.levelExp];
    }
    return mon;
  }

  /** The player's party balls at the start: from the battle party (HP and status). */
  private playerBalls(): PartyBall[] {
    return this.host.party.pokemon.map((_, slot) => {
      const m = this.state.party.find((p) => p.partySlot === slot);
      const hp = m?.health?.hp ?? this.host.party.pokemon[slot].hp;
      const status = m ? m.status : this.host.party.pokemon[slot].status;
      return hp === 0 ? PartyBall.FAINTED : status ? PartyBall.STATUS : PartyBall.HEALTHY;
    });
  }
}

function isFoeSwitchIn(e: BattleEvent): boolean {
  return e.kind.case === "switchIn" && e.kind.value.pokemon?.battler?.foe === true;
}
