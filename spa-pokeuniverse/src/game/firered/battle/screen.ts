// The FireRed battle screen (phase-5 M7). It shows what mic-battles resolved and asks the
// player's choices; it decides nothing. Its work is a queue of jobs, each a generator stepped
// once a frame: the transition, the intro (the terrain and trainers slide in, "<CLASS> <NAME>
// would like to battle!", the send-outs), each turn's events, the player's choice (FIGHT, BAG,
// POKéMON, RUN, or a forced switch) and the ending (the trainer comes back with their defeat
// line and the prize money, or the whiteout). BAG and POKéMON leave the battle screen for the
// bag and the party menu, and the battle is drawn again from its state on coming back, as after
// a reconnect.

import { clone, create } from "@bufbuild/protobuf";
import { BattlerSchema, type BattleEvent, type Battler, type BattlerInfo } from "@pokeuniverse/contracts/battle/v1/event";
import {
  BattleActionSchema,
  BattleKind,
  BattleResult,
  PartyBall,
  RequestKind,
  type BattleAction,
  type BattleEnded,
  type BattleRequest,
  type BattleTurn,
  type BattleView,
  type PositionRequest,
  type EscapeBlock,
} from "@pokeuniverse/contracts/battle/v1/view";
import { BattleUse, Item as ItemId, Pocket, type Item } from "@pokeuniverse/contracts/item/v1/catalog";
import { ESCAPE_ITEMS, itemInfo } from "../../world/items";
import { moveInfo } from "../../world/moves";
import { Move } from "@pokeuniverse/contracts/move/v1/catalog";
import { Type } from "@pokeuniverse/contracts/species/v1/catalog";
import { speciesInfo } from "../../world/pokedex";
import { MoveSchema, PartySchema, PokemonSchema, type Pokemon, type PokemonEvolved } from "@pokeuniverse/contracts/party/v1/party";
import { ItemResultSchema } from "@pokeuniverse/contracts/item/v1/bag";
import type { Gender } from "@pokeuniverse/contracts/trainer/v1/trainer";
import type { IndexedImage } from "../../gba/assets";
import { Button } from "../../gba/input";
import { PALETTES_ALL } from "../../gba/palette";
import { decimalText, NumberMode, type Text } from "../../gba/text";
import { RGB_BLACK } from "../../gba/video";
import { BattleState } from "../../battle/state";
import { PartyState } from "../../world/party";
import { BagLocation, openItemScreen, startBag, type BagExit, type BagHost } from "../bag";
import type { Flow } from "../flow";
import { Assets, BATTLE_SOUNDS } from "../manifest";
import { loadAnimations } from "./anims";
import { startPartyMenu, type PartyHost, type PartyMenuMode } from "../party-menu";
import { startSummary } from "../summary";
import type { HealthboxMon } from "./healthbox";
import { PartySummary } from "./healthbox";
import { evolutionScene, type EvolutionHost } from "./evolution";
import { askToLearnMove } from "./learn";
import { Action, chooseAction, chooseMove, choosesTarget, chooseTarget, type Cursors } from "./menus";
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
  /** The choice for the request with this step (BattleChoice); `partner`: the second position's, in doubles. */
  choose(battleId: string, step: number, action: BattleAction, partner?: BattleAction): void;
  /** A scene that wasn't stopped: mic-core saves it, then answers. */
  evolve(slot: number): Promise<PokemonEvolved>;
  /** After an evolution: a move replaces another (mic-core saves it). */
  learnMove(slot: number, move: number, forget: number): void;
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
  /** By position. */
  private readonly cursors: Cursors[] = [
    { action: 0, move: 0 },
    { action: 0, move: 0 },
  ];
  /** The battle party's order on the party menu: party slots, each one in battle at its position. */
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
    this.texts = new BattleTexts(flow, host.playerName, view.trainer, (b) => this.state.battler(b) !== null, (slot) => {
      const mon = host.party.pokemon[slot];
      return mon && (mon.nickname ? flow.encode(mon.nickname) : flow.assets.species(mon.species).name);
    });
    for (const side of this.state.sides) for (const info of side.active) if (info) this.texts.remember(info);
    this.playback = new Playback(this);
    this.order = host.party.pokemon.map((_, i) => i);
    this.state.side(false).active.forEach((info, position) => {
      if (info?.battler) this.sentOut(info.battler.partySlot, position);
    });
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
    if (r.kind === RequestKind.LEARN_MOVE) {
      const slot = r.learn?.partySlot ?? 0;
      const forget = yield* this.askToLearn(slot, r.learn?.move ?? 0);
      this.send({ case: "learn", value: { $typeName: "pokeuniverse.battle.v1.LearnMoveAction", forgetSlot: forget ?? undefined } });
      return;
    }
    if (r.kind === RequestKind.SHIFT) {
      const slot = yield* this.askToShift(r.nextFoe!);
      this.send({ case: "shift", value: { $typeName: "pokeuniverse.battle.v1.ShiftAction", partySlot: slot ?? undefined } });
      return;
    }
    // D27: one choice per position asked, sent together. B on the second goes back to the first.
    const asked = this.positionsAsked(r);
    const chosen: BattleAction["kind"][] = [];
    for (let i = 0; i < asked.length; ) {
      const kind = r.kind === RequestKind.SWITCH ? yield* this.chooseReplacement(chosen) : yield* this.chooseFor(asked[i], i > 0, chosen, r.escape);
      if (kind === null) {
        if (i === 0) return;
        chosen.pop();
        i--;
        continue;
      }
      chosen[i++] = kind;
    }
    if (chosen.length) this.send(...(chosen as [BattleAction["kind"], BattleAction["kind"]?]));
  }

  /** Who must choose, in order: singles' one position, or the request's. */
  private positionsAsked(r: BattleRequest): Pick<PositionRequest, "position" | "moves" | "noEffectItems">[] {
    return this.state.doubles ? r.positions : [{ position: 0, moves: r.moves, noEffectItems: r.noEffectItems }];
  }

  /** A forced switch: the party slot, not the one the partner just took. */
  private *chooseReplacement(chosen: readonly BattleAction["kind"][]): Generator<void, BattleAction["kind"] | null, void> {
    const slot = yield* this.chooseFromParty({ forced: true, partner: chosen[0] });
    return slot === null ? null : { case: "switch", value: { $typeName: "pokeuniverse.battle.v1.SwitchAction", partySlot: slot } };
  }

  /** One position's FIGHT, BAG, POKéMON or RUN; null when B went back to the partner's. */
  private *chooseFor(asked: Pick<PositionRequest, "position" | "moves" | "noEffectItems">, canGoBack: boolean, chosen: readonly BattleAction["kind"][], escape?: EscapeBlock): Generator<void, BattleAction["kind"] | null, void> {
    const { state } = this;
    const active = state.side(false).active[asked.position]?.battler;
    if (!active) return null;
    const cursors = this.cursors[asked.position];
    for (;;) {
      const action = yield* chooseAction(this.flow, this.scene, this.texts, active, cursors, canGoBack);
      if (action === null) return null;
      if (action === Action.Fight) {
        // Every move disabled or out of PP: FIGHT is Struggle.
        if (asked.moves.every((m) => m.disabled || m.pp === 0)) return moveAction(0);
        let target: Battler | undefined;
        const slot = yield* chooseMove(this.flow, this.scene, this.texts, active, asked.moves, cursors, (m) => this.askTarget(active, m.move, (t) => (target = t)));
        if (slot !== null) return moveAction(slot, target);
      } else if (action === Action.Pokemon) {
        const slot = yield* this.chooseFromParty({ forced: false, partner: chosen[0] });
        if (slot !== null) return { case: "switch", value: { $typeName: "pokeuniverse.battle.v1.SwitchAction", partySlot: slot } };
      } else if (action === Action.Bag) {
        const used = yield* this.chooseFromBag(active, asked.noEffectItems);
        if (used) return { case: "item", value: { $typeName: "pokeuniverse.battle.v1.ItemAction", item: used.item, partySlot: used.slot, moveSlot: used.move } };
      } else if (state.kind === BattleKind.TRAINER) {
        yield* this.scene.message(this.texts.format("sText_NoRunningFromTrainers"), 0);
      } else if (escape?.blocked) {
        // IsRunningFromBattleImpossible: the foe's trapping ability, or a move.
        const text = escape.byAbility && escape.foe ? this.texts.format("sText_PreventsEscape", { scr: escape.foe, ability: escape.byAbility }) : this.texts.format("sText_CantEscape");
        yield* this.scene.message(text, 0);
      } else return { case: "run", value: { $typeName: "pokeuniverse.battle.v1.RunAction" } };
    }
  }

  /** Doubles: the move's target, if it asks for one; false when B goes back to the moves. */
  private *askTarget(user: Battler, move: Move, pick: (target: Battler) => void): Generator<void, boolean, void> {
    const { state } = this;
    const { target } = moveInfo(move);
    if (!state.doubles || !choosesTarget(target)) return true;
    // Curse picks a target only for a Ghost; anyone else raises its own stats.
    if (move === Move.CURSE && !this.isGhost(user)) return true;
    const spot = yield* chooseTarget(this.flow, this.scene, user, target, (s) => state.side(s.foe).active[s.position] != null);
    if (spot) pick(create(BattlerSchema, spot));
    return spot !== null;
  }

  private isGhost(b: Battler): boolean {
    const info = speciesInfo(this.state.battler(b)?.species ?? 0);
    return info.type1 === Type.GHOST || info.type2 === Type.GHOST;
  }

  /** The choice goes to mic-core; the textbox waits empty for the turn. */
  private send(kind: BattleAction["kind"], partner?: BattleAction["kind"]): void {
    const r = this.state.request;
    if (!r) return;
    this.host.choose(this.state.id, r.step, create(BattleActionSchema, { kind }), partner && create(BattleActionSchema, { kind: partner }));
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
    if (e.evolutions.length) {
      const evolving = this.evolutionHost();
      for (const pending of e.evolutions) yield* evolutionScene(evolving, pending);
    }
    this.host.finished(e.result);
  }

  /** The party is mic-core's again here: the battle's outcome reached it with the ending. */
  private evolutionHost(): EvolutionHost {
    const { flow, host } = this;
    const pokemon = (slot: number) => host.party.pokemon[slot];
    return {
      flow,
      texts: this.texts,
      nationalDex: host.nationalDex,
      stoppable: true,
      newScene: () => this.newScene(),
      fadeIn: () => this.fadeIn(),
      monName: (slot) => this.texts.name(create(BattlerSchema, { partySlot: slot })),
      mon: pokemon,
      moveAt: (slot, moveSlot) => pokemon(slot)?.moves[moveSlot]?.move ?? 0,
      evolve: (slot) => host.evolve(slot),
      learnMove: (slot, move, forget) => host.learnMove(slot, move, forget),
      forgetScreen: (slot, move, pick, redraw) => this.forgetScreen(this.hostOf(host.party), slot, move, pick, redraw),
    };
  }

  private *waitPress(): Generator<void, void, void> {
    while (!this.flow.gba.input.isPressed(Button.A | Button.B)) yield;
    this.flow.play("se_select");
  }

  /** BattleScript_AskToLearnMove for a party member, on the battle's own party. */
  private askToLearn(slot: number, move: number): Generator<void, number | null, void> {
    return askToLearnMove(() => this.scene, this.texts, this.texts.name(create(BattlerSchema, { partySlot: slot })), move, (pick) => this.forgetScreen(this.partyHost(), this.order.indexOf(slot), move, pick, () => this.drawBattle()));
  }

  /** Battle style SHIFT: "<CLASS> <NAME> is about to use <MON>", YES/NO, the party menu. Null: no change. */
  private *askToShift(next: BattlerInfo): Generator<void, number | null, void> {
    this.texts.remember(next);
    yield* this.scene.message(this.texts.format("sText_EnemyAboutToSwitchPkmn", { buff2: this.texts.name(next.battler) }), 0);
    return (yield* this.scene.yesNo()) ? yield* this.chooseFromParty({ forced: false }) : null;
  }

  /** The summary in its forget mode; `pick` hears the row chosen (4: none). */
  private *forgetScreen(host: PartyHost, index: number, move: number, pick: (row: number) => void, redraw: () => void): Generator<void, void, void> {
    const mon = host.party.pokemon[index];
    yield* this.openScreen((back) => {
      void this.flow.assets.pokemonArt(mon.species).then(() => startSummary(this.flow, host, index, () => back(), { move, pick }));
    }, redraw);
  }

  // Screens: the party menu and the bag

  /** The party menu in battle mode: the party slot chosen, or null when cancelled. */
  private *chooseFromParty(how: { forced: boolean; partner?: BattleAction["kind"] }): Generator<void, number | null, void> {
    let chosen: number | null = null;
    const taken = how.partner?.case === "switch" ? this.order.indexOf(how.partner.value.partySlot) : undefined;
    yield* this.openScreen((back) => this.openParty({ kind: "battle", forced: how.forced, selected: taken, inBattle: (i) => this.inBattle(i), choose: (i) => (chosen = this.order[i]) }, back));
    return chosen;
  }

  /** The party menu's slot holds a Pokémon on the field. */
  private inBattle(i: number): boolean {
    return this.state.side(false).active.some((a) => a?.battler?.partySlot === this.order[i]);
  }

  /** BAG: an item chosen in the bag, then the Pokémon and move it's for (X items and balls ask nothing); null when cancelled. */
  private *chooseFromBag(active: Battler, noEffect: readonly Item[]): Generator<void, { item: Item; slot: number; move: number } | null, void> {
    let used: { item: Item; slot: number; move: number } | null = null;
    yield* this.openScreen((back) => {
      const { flow } = this;
      const { gender, bag } = this.host;
      const openBag = () =>
        startBag(
          flow,
          gender,
          bag,
          (exit: BagExit) => {
            if (!exit || !("chosen" in exit)) return back();
            chosen(exit.chosen);
          },
          BagLocation.Battle,
          noEffect,
          this.state.kind === BattleKind.TRAINER ? ESCAPE_ITEMS : [],
        );
      const chosen = (item: Item) => {
        const use = itemInfo(item)?.battleUse;
        // BattleUseFunc_PokeDoll: an escape item is used at once, like a ball.
        if (use === BattleUse.SELF || use === BattleUse.BALL || use === BattleUse.ESCAPE) {
          used = { item, slot: active.partySlot, move: 0 };
          return back();
        }
        // EnterPartyFromItemMenuInBattle: B goes back to the BAG, or the BERRY POUCH for a berry.
        const cancelled = () => {
          if (itemInfo(item)?.pocket !== Pocket.BERRY_POUCH) return openBag();
          openItemScreen(flow, gender, bag, ItemId.BERRY_POUCH, false, (picked) => (picked ? chosen(picked) : openBag()), true, true);
        };
        this.openParty({ kind: "battle", forced: false, item, inBattle: (i) => this.inBattle(i), choose: (i, move = 0) => (used = { item, slot: this.order[i], move }) }, () => (used ? back() : cancelled()));
      };
      openBag();
    });
    return used;
  }

  private openParty(mode: PartyMenuMode, back: () => void): void {
    startPartyMenu(this.flow, this.partyHost(), mode, back);
  }

  /** Fades out, opens another screen, and once it's back draws the battle again and fades in. */
  private *openScreen(open: (back: () => void) => void, redraw = () => this.drawBattle()): Generator<void, void, void> {
    const { gba } = this.flow;
    gba.palettes.beginFade(PALETTES_ALL, 0, 0, 16, RGB_BLACK);
    while (gba.palettes.fadeActive) yield;
    let returned = false;
    this.away = true;
    open(() => {
      this.away = false;
      returned = true;
      gba.setMain(() => this.frame());
      redraw();
      this.fadeIn();
    });
    while (!returned) yield;
    while (gba.palettes.fadeActive) yield;
  }

  private drawBattle(): void {
    this.newScene();
    this.drawField();
  }

  private newScene(): BattleScene {
    this.sceneNow = new BattleScene(this.flow, this.host.gender, this.state.doubles);
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
          // Levels and moves gained in this battle aren't mic-core's party yet.
          Object.assign(mon, { level: m.level, exp: m.exp, levelExp: m.levelExp, nextLevelExp: m.nextLevelExp, stats: m.stats ?? mon.stats });
          mon.moves = m.moves.map((move, i) => create(MoveSchema, { move, pp: m.pp[i], maxPp: m.maxPp[i] }));
        }
        return mon;
      })
      .filter((p): p is Pokemon => p !== null);
    return this.hostOf(new PartyState(create(PartySchema, { pokemon })));
  }

  /** A party for the party menu and the summary, which change nothing here. */
  private hostOf(party: PartyState): PartyHost {
    const host = this.host;
    const none = () => Promise.resolve(create(ItemResultSchema));
    return {
      party,
      playerName: host.playerName,
      gender: host.gender,
      nationalDex: host.nationalDex,
      bag: host.bag,
      useItem: none,
      give: none,
      take: none,
      swap: () => {},
      swapMoves: () => {},
    };
  }

  // PlaybackHost

  /** The player sent a Pokémon out at a position: it and the one it replaced trade places on the party menu (gBattlePartyCurrentOrder). */
  sentOut(slot: number, position: number): void {
    // SwitchInClearSetData: the newcomer's cursors start over.
    this.cursors[position] = { action: 0, move: 0 };
    const i = this.order.indexOf(slot);
    if (i >= 0 && i !== position && position < this.order.length) [this.order[position], this.order[i]] = [this.order[i], this.order[position]];
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
      const p = this.state.party.find((m) => m.partySlot === b.partySlot) ?? this.host.party.pokemon[b.partySlot];
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

function moveAction(slot: number, target?: Battler): BattleAction["kind"] {
  return { case: "move", value: { $typeName: "pokeuniverse.battle.v1.MoveAction", slot, target } };
}

function isFoeSwitchIn(e: BattleEvent): boolean {
  return e.kind.case === "switchIn" && e.kind.value.pokemon?.battler?.foe === true;
}
