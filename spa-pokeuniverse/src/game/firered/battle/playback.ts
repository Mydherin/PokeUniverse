// Plays the battle's events as FireRed shows them: "<MON> used <MOVE>!", then the move's
// animation (anims/, with BATTLE SCENE on; two-turn moves play their charging turn, then their
// strike); a hit blinks the target with the effectiveness sound and its HP bar moves; a faint
// plays the faint cry and the Pokémon sinks; status conditions, stat changes and weather play
// FireRed's general animations;
// a send-out throws the ball and the Pokémon comes out with its cry, its healthbox sliding in.
// Each event changes the battle's state as it is shown.

import { Condition, ConditionPhase, HitResult, Weather, type BattleEvent, type Battler, type BattlerInfo, type Effect } from "@pokeuniverse/contracts/battle/v1/event";
import { Move } from "@pokeuniverse/contracts/move/v1/catalog";
import { Status } from "@pokeuniverse/contracts/pokemon/v1/pokemon";
import { BattleScene as BattleSceneOption } from "@pokeuniverse/contracts/trainer/v1/trainer";
import type { IndexedImage } from "../../gba/assets";
import type { Sprite } from "../../gba/sprites";
import type { BattleState } from "../../battle/state";
import type { Flow } from "../flow";
import { HpBarLevel, hpBarLevel } from "../hp-bar";
import { Assets } from "../manifest";
import { PokeBalls } from "../pokeball";
import { generalAnimation, moveAnimation, playAnimation, type AnimMon } from "./anims";
import type { HealthboxMon } from "./healthbox";
import { eventMessages, type Recent } from "./messages";
import type { BattleScene } from "./scene";
import type { BattleTexts } from "./text";

/** What the playback needs from the screen. */
export interface PlaybackHost {
  readonly flow: Flow;
  readonly scene: BattleScene;
  readonly texts: BattleTexts;
  readonly state: BattleState;
  /** Back pictures loaded for the player's Pokémon, by species. */
  readonly backPics: Map<number, IndexedImage>;
  healthboxMon(info: BattlerInfo): HealthboxMon;
  /** The player sent out the Pokémon in this party slot (the battle party's order follows). */
  sentOut(slot: number): void;
  /** The battle's first send-outs: the trainers still stand there. */
  readonly starting: boolean;
}

/** Effectiveness shown after the HP moved, as FireRed prints them. */
const AFTER_HIT = new Set([HitResult.CRITICAL, HitResult.SUPER_EFFECTIVE, HitResult.NOT_VERY_EFFECTIVE]);

const key = (b: Battler | undefined) => (b ? `${b.foe ? 1 : 0}:${b.position}` : "");

/**
 * Showdown says how a move landed before the damage; FireRed shows the hit, then "A critical
 * hit!" and "It's super effective!". The results move after their damage, which remembers the
 * effectiveness for its sound.
 */
export function arrange(events: readonly BattleEvent[]): { events: BattleEvent[]; hits: Map<BattleEvent, HitResult> } {
  const out: BattleEvent[] = [];
  const hits = new Map<BattleEvent, HitResult>();
  const pending = new Map<string, BattleEvent[]>();
  for (const e of events) {
    const k = e.kind;
    if (k.case === "moveResult" && AFTER_HIT.has(k.value.result)) {
      const list = pending.get(key(k.value.battler)) ?? [];
      list.push(e);
      pending.set(key(k.value.battler), list);
      continue;
    }
    out.push(e);
    if (k.case === "damage" && !k.value.from) {
      const results = pending.get(key(k.value.battler)) ?? [];
      pending.delete(key(k.value.battler));
      const eff = results.map((r) => (r.kind.case === "moveResult" ? r.kind.value.result : HitResult.UNSPECIFIED)).find((r) => r !== HitResult.CRITICAL);
      hits.set(e, eff ?? HitResult.UNSPECIFIED);
      out.push(...results);
    } else if (k.case === "moveUsed" || k.case === "turnStart") {
      for (const list of pending.values()) out.push(...list);
      pending.clear();
    }
  }
  for (const list of pending.values()) out.push(...list);
  return { events: out, hits };
}

/** A status condition's animation (B_ANIM_STATUS_*): badly poisoned shows as poisoned. */
const STATUS_ANIM: Partial<Record<Status, string>> = {
  [Status.POISON]: "B_ANIM_STATUS_PSN",
  [Status.TOXIC]: "B_ANIM_STATUS_PSN",
  [Status.BURN]: "B_ANIM_STATUS_BRN",
  [Status.PARALYSIS]: "B_ANIM_STATUS_PRZ",
  [Status.SLEEP]: "B_ANIM_STATUS_SLP",
  [Status.FREEZE]: "B_ANIM_STATUS_FRZ",
};

const WEATHER_ANIM: Partial<Record<Weather, string>> = {
  [Weather.RAIN]: "B_ANIM_RAIN_CONTINUES",
  [Weather.SUN]: "B_ANIM_SUN_CONTINUES",
  [Weather.SANDSTORM]: "B_ANIM_SANDSTORM_CONTINUES",
  [Weather.HAIL]: "B_ANIM_HAIL_CONTINUES",
};

/** The animation an effect plays on its battler (Cmd_statusanimation, Cmd_status2animation). */
function statusAnim(effect: Effect | undefined): string | undefined {
  const k = effect?.kind;
  if (k?.case === "status") return STATUS_ANIM[k.value];
  if (k?.case === "condition" && k.value === Condition.CONFUSION) return "B_ANIM_STATUS_CONFUSION";
  if (k?.case !== "move") return undefined;
  if (k.value === Move.ATTRACT) return "B_ANIM_STATUS_INFATUATION";
  if (k.value === Move.CURSE) return "B_ANIM_STATUS_CURSED";
  if (k.value === Move.NIGHTMARE) return "B_ANIM_STATUS_NIGHTMARE";
  return undefined;
}

/** Moves whose user stays out of sight between their two turns (the semi-invulnerable bit). */
const SEMI_INVULNERABLE = new Set<number>([Move.FLY, Move.DIG, Move.DIVE, Move.BOUNCE, Move.SHADOW_FORCE]);

/** FireRed's STAT_ANIM_PLUS1/MINUS1/PLUS2/MINUS2 and their MULTIPLE_* kinds. */
const STAT_ANIM = { plus1: 15, minus1: 22, plus2: 39, minus2: 46, multiple: 55 };

/**
 * What the general animations need from a batch: a stat change's animation argument (one
 * animation for a run of changes to one battler in one direction, as Cmd_playstatchangeanimation
 * plays them; the rest of the run plays none), and the charge turns of two-turn moves, whose
 * "used <MOVE>!" FireRed doesn't print (BattleScriptFirstChargingTurn).
 */
function plan(events: readonly BattleEvent[]): { statArgs: Map<BattleEvent, number>; chargeTurns: Set<BattleEvent> } {
  const statArgs = new Map<BattleEvent, number>();
  const chargeTurns = new Set<BattleEvent>();
  for (let i = 0; i < events.length; i++) {
    const k = events[i].kind;
    const next = events[i + 1]?.kind;
    if (k.case === "moveUsed" && k.value.still && next?.case === "prepare" && key(next.value.battler) === key(k.value.battler) && next.value.move === k.value.move) {
      chargeTurns.add(events[i]);
    }
    if (k.case !== "statChange" || !k.value.stages) continue;
    const { battler, lower } = k.value;
    let end = i + 1;
    for (; end < events.length; end++) {
      const n = events[end].kind;
      if (n.case !== "statChange" || !n.value.stages || n.value.lower !== lower || key(n.value.battler) !== key(battler)) break;
    }
    const two = events.slice(i, end).some((e) => e.kind.case === "statChange" && e.kind.value.stages > 1);
    statArgs.set(
      events[i],
      end - i > 1
        ? STAT_ANIM.multiple + (two ? 1 : 0) + (lower ? 2 : 0)
        : (lower ? (two ? STAT_ANIM.minus2 : STAT_ANIM.minus1) : two ? STAT_ANIM.plus2 : STAT_ANIM.plus1) + k.value.stat - 1,
    );
    for (let j = i + 1; j < end; j++) statArgs.set(events[j], -1);
    i = end - 1;
  }
  return { statArgs, chargeTurns };
}

/** Frames a generator over several at once, until all are done. */
export function* all(...gens: Generator<void, void, void>[]): Generator<void, void, void> {
  let running = gens;
  for (;;) {
    running = running.filter((g) => !g.next().done);
    if (!running.length) return;
    yield;
  }
}

export function* wait(frames: number): Generator<void, void, void> {
  for (let i = 0; i < frames; i++) yield;
}

export class Playback {
  private readonly recent: Recent = { itemUsed: false };
  private readonly balls: PokeBalls;
  private hits = new Map<BattleEvent, HitResult>();
  private statArgs = new Map<BattleEvent, number>();
  private chargeTurns = new Set<BattleEvent>();
  /** Two-turn moves charged (by battler key): the next use is their second turn. */
  private readonly charging = new Map<string, number>();
  /** Battlers out of sight (Fly, Dig…) until they strike. */
  private readonly hidden = new Set<string>();

  constructor(private readonly host: PlaybackHost) {
    this.balls = new PokeBalls(host.flow);
  }

  /** A batch of events, in FireRed's order. */
  *play(events: readonly BattleEvent[]): Generator<void, void, void> {
    const arranged = arrange(events);
    this.hits = arranged.hits;
    ({ statArgs: this.statArgs, chargeTurns: this.chargeTurns } = plan(arranged.events));
    for (const e of arranged.events) yield* this.event(e);
  }

  private *event(e: BattleEvent): Generator<void, void, void> {
    const { state, texts, scene } = this.host;
    const k = e.kind;
    if (k.case !== "heal" && k.case !== "statusCured" && k.case !== "itemUsed" && k.case !== "statChange") this.recent.itemUsed = false;
    if (k.case === "moveUsed") this.recent.mover = k.value.battler;
    if (k.case === "abilityShown") this.recent.ability = k.value.battler;
    if (e.silent) {
      state.apply(e);
      this.syncHealthbox(e);
      return;
    }
    switch (k.case) {
      case "switchIn":
        this.charging.delete(key(k.value.pokemon?.battler));
        this.hidden.delete(key(k.value.pokemon?.battler));
        return yield* this.switchIn(e, k.value.pokemon!);
      case "damage": {
        const { battler, from } = k.value;
        const hp = k.value.health?.hp ?? 0;
        if (!from) {
          state.apply(e);
          yield* this.hit(battler, this.hits.get(e) ?? HitResult.UNSPECIFIED);
          yield* this.moveHp(battler, hp);
          return;
        }
        const messages = eventMessages(texts, e, this.recent);
        state.apply(e);
        const recoil = from.kind.case === "condition" && from.kind.value === Condition.RECOIL;
        if (!recoil) for (const m of messages) yield* scene.message(m);
        // Hurting itself in confusion is a hit (BattleScript_DoSelfConfusionDmg); poison, burn, Curse and Nightmare play their animation.
        if (from.kind.case === "condition" && from.kind.value === Condition.CONFUSION) yield* this.hit(battler, HitResult.UNSPECIFIED);
        else yield* this.animateStatus(statusAnim(from), battler);
        yield* this.moveHp(battler, hp);
        if (recoil) for (const m of messages) yield* scene.message(m);
        return;
      }
      case "heal":
      case "setHealth": {
        const messages = eventMessages(texts, e, this.recent);
        state.apply(e);
        yield* this.moveHp(k.value.battler, k.value.health?.hp ?? 0);
        for (const m of messages) yield* scene.message(m);
        return;
      }
      case "faint":
        this.charging.delete(key(k.value.battler));
        this.hidden.delete(key(k.value.battler));
        return yield* this.faint(e, k.value.battler);
      case "statusSet":
      case "statusCured": {
        state.apply(e);
        const b = k.value.battler;
        const mon = state.battler(b);
        if (b && state.side(b.foe).active[0] === mon && mon) scene.healthbox(b.foe).setStatus(mon.status);
        if (k.case === "statusSet") yield* this.animateStatus(STATUS_ANIM[k.value.status], b);
        for (const m of eventMessages(texts, e, this.recent)) yield* scene.message(m);
        return;
      }
      case "teamCured": {
        state.apply(e);
        const b = k.value.battler;
        const mon = b ? state.side(b.foe).active[0] : null;
        if (b && mon) scene.healthbox(b.foe).setStatus(mon.status);
        for (const m of eventMessages(texts, e, this.recent)) yield* scene.message(m);
        return;
      }
      case "moveUsed": {
        const { battler, target, move } = k.value;
        state.apply(e);
        if (this.chargeTurns.has(e) && !this.sunBeam(move)) return;
        for (const m of eventMessages(texts, e, this.recent)) yield* scene.message(m);
        const turn = this.charging.get(key(battler)) === move ? 1 : 0;
        this.charging.delete(key(battler));
        this.show(battler);
        if (!k.value.still) yield* this.animateMove(battler, target, move, turn);
        return;
      }
      case "prepare": {
        const { battler, target, move } = k.value;
        // In sun, Solar Beam strikes at once, with no charging text (BattleScript_SolarbeamOnFirstTurn).
        if (this.sunBeam(move)) {
          state.apply(e);
          return yield* this.animateMove(battler, target, move, 1);
        }
        this.charging.set(key(battler), move);
        yield* this.animateMove(battler, target, move, 0);
        if (battler && SEMI_INVULNERABLE.has(move)) {
          const sprite = this.sprite(battler);
          if (sprite) sprite.invisible = true;
          this.hidden.add(key(battler));
        }
        break;
      }
      case "cant":
        this.charging.delete(key(k.value.battler));
        this.show(k.value.battler);
        state.apply(e);
        for (const m of eventMessages(texts, e, this.recent)) yield* scene.message(m);
        // Being in love played its animation with "is in love" (activate).
        if (k.value.reason?.kind.case === "status") yield* this.animateStatus(statusAnim(k.value.reason), k.value.battler);
        return;
      case "volatileStart": {
        // Becoming confused plays its animation first (BattleScript_MoveEffectConfusion).
        const effect = k.value.effect?.kind;
        if (effect?.case === "condition" && effect.value === Condition.CONFUSION) yield* this.animateStatus(statusAnim(k.value.effect), k.value.battler);
        break;
      }
      case "activate":
        state.apply(e);
        for (const m of eventMessages(texts, e, this.recent)) yield* scene.message(m);
        yield* this.animateStatus(statusAnim(k.value.effect), k.value.battler);
        return;
      case "statChange": {
        const arg = this.statArgs.get(e);
        if (arg !== undefined && arg >= 0) yield* this.animateGeneral("B_ANIM_STATS_CHANGE", !!k.value.battler?.foe, { animArg: arg });
        break;
      }
      case "weatherChange": {
        const name = k.value.phase === ConditionPhase.UPKEEP ? WEATHER_ANIM[k.value.weather] : undefined;
        state.apply(e);
        for (const m of eventMessages(texts, e, this.recent)) yield* scene.message(m);
        if (name) yield* this.animateGeneral(name, false);
        return;
      }
      case "itemUsed":
        state.apply(e);
        for (const m of eventMessages(texts, e, this.recent)) yield* scene.message(m);
        this.recent.itemUsed = true;
        return;
    }
    state.apply(e);
    for (const m of eventMessages(texts, e, this.recent)) yield* scene.message(m);
  }

  /** A silent HP or status change: the healthbox shows it at once. */
  private syncHealthbox(e: BattleEvent): void {
    const k = e.kind;
    if (k.case === "damage" || k.case === "heal" || k.case === "setHealth") {
      const b = k.value.battler;
      if (b && this.host.state.battler(b)) for (const _ of this.host.scene.healthbox(b.foe).moveHp(k.value.health?.hp ?? 0));
    }
  }

  /** The HP bar moving; the player's own reaching red plays the low HP alarm. */
  private *moveHp(b: Battler | undefined, hp: number): Generator<void, void, void> {
    if (!b) return;
    const box = this.host.scene.healthbox(b.foe);
    const mon = this.host.state.side(b.foe).active[0];
    yield* box.moveHp(hp);
    const max = mon?.health?.maxHp ?? 0;
    if (!b.foe && hp > 0 && max && hpBarLevel(hp, max) === HpBarLevel.Red) this.host.flow.play("se_low_health");
  }

  private sunBeam(move: number): boolean {
    return move === Move.SOLAR_BEAM && this.host.state.weather === Weather.SUN;
  }

  private sprite(b: Battler): Sprite | null {
    return this.host.scene.mons[b.foe ? 1 : 0]?.sprite ?? null;
  }

  private animMon(foe: boolean): AnimMon {
    return { foe, sprite: this.host.scene.mons[foe ? 1 : 0]?.sprite ?? null };
  }

  /** A battler hidden by Fly, Dig… comes back into sight. */
  private show(b: Battler | undefined): void {
    if (!b || !this.hidden.delete(key(b))) return;
    const sprite = this.sprite(b);
    if (sprite) sprite.invisible = false;
  }

  /** The move's animation (DoMoveAnim), unless the trainer turned BATTLE SCENE off. */
  private *animateMove(attacker: Battler | undefined, target: Battler | undefined, move: number, turn: number): Generator<void, void, void> {
    const { flow, scene } = this.host;
    if (!attacker || flow.options.battleScene === BattleSceneOption.OFF) return;
    const anim = moveAnimation(move, !!target);
    if (!anim) return;
    const ctx = { flow, attacker: this.animMon(attacker.foe), target: this.animMon((target ?? attacker).foe), backdrop: scene, color: anim.color, turn };
    yield* playAnimation(ctx, anim.program);
  }

  /** A general animation on one battler (Cmd_playanimation): stat changes and weather play even with BATTLE SCENE off. */
  private *animateGeneral(name: string, foe: boolean, opts: { animArg?: number; statusAnim?: boolean } = {}): Generator<void, void, void> {
    const program = generalAnimation(name);
    if (!program) return;
    const mon = this.animMon(foe);
    yield* playAnimation({ flow: this.host.flow, attacker: mon, target: mon, backdrop: this.host.scene, color: 0, ...opts }, program);
  }

  /** A status condition's animation (Cmd_statusanimation): not with BATTLE SCENE off, nor while out of sight. */
  private *animateStatus(name: string | undefined, b: Battler | undefined): Generator<void, void, void> {
    if (!name || !b || this.hidden.has(key(b)) || this.host.flow.options.battleScene === BattleSceneOption.OFF) return;
    yield* this.animateGeneral(name, b.foe, { statusAnim: true });
  }

  /** The hit (DoHitAnimation): the target blinks for 32 frames with the effectiveness sound; one out of sight doesn't. */
  private *hit(b: Battler | undefined, result: HitResult): Generator<void, void, void> {
    if (!b) return;
    this.host.flow.play(result === HitResult.SUPER_EFFECTIVE ? "se_super_effective" : result === HitResult.NOT_VERY_EFFECTIVE ? "se_not_effective" : "se_effective");
    const sprite = this.sprite(b);
    if (!sprite || sprite.invisible) return;
    for (let i = 0; i < 32; i++) {
      if (i % 4 === 0) sprite.invisible = !sprite.invisible;
      yield;
    }
    sprite.invisible = false;
  }

  /** The faint cry, then the Pokémon sinks out of sight with SE_FAINT, its healthbox gone, then the message. */
  private *faint(e: BattleEvent, b: Battler | undefined): Generator<void, void, void> {
    const { flow, scene, state, texts } = this.host;
    if (!b) return;
    const info = state.battler(b);
    const messages = eventMessages(texts, e, this.recent);
    state.apply(e);
    if (info) flow.gba.sound.play(Assets.faintCryId(info.species), "cry");
    yield* wait(2);
    while (flow.gba.sound.isPlaying("cry")) yield;
    const mon = scene.mons[b.foe ? 1 : 0];
    flow.play("se_faint");
    if (mon) {
      for (let dy = 4; dy <= 64; dy += 4) {
        mon.draw(dy);
        yield;
      }
      scene.removeMon(b.foe);
    }
    scene.healthbox(b.foe).visible = false;
    for (const m of messages) yield* scene.message(m);
  }

  /**
   * A Pokémon sent out: the one there comes back first (its trainer calls it), then the trainer's
   * line, the ball, the Pokémon with its cry, and its healthbox sliding in. At the battle's start
   * the trainers leave as they send theirs out.
   */
  private *switchIn(e: BattleEvent, info: BattlerInfo): Generator<void, void, void> {
    const { flow, scene, state, texts } = this.host;
    const b = info.battler!;
    const foe = b.foe;
    const side = foe ? 1 : 0;
    texts.remember(info);
    void flow.gba.sound.load([Assets.cryId(info.species), Assets.faintCryId(info.species)], Assets.cryUrl).catch(() => {});
    yield* this.loadArt(info);

    const previous = state.side(foe).active[b.position];
    if (previous && scene.mons[side]) yield* this.recall(previous);

    const first = this.host.starting && scene.trainers[side] !== null;
    let line: number[];
    if (foe) line = texts.format(first ? "sText_Trainer1SentOutPkmn" : "sText_Trainer1SentOutPkmn2", { atk: b, buff1: texts.name(b) });
    else line = texts.format(first ? "sText_GoPkmn" : this.goLine(), { atk: b, buff1: texts.name(b) });
    state.apply(e);
    if (!foe) this.host.sentOut(b.partySlot);

    const mon = scene.showMon(info, this.host.backPics.get(info.species));
    // Hidden until its ball opens.
    if (mon) mon.sprite.invisible = true;
    const [x, y] = scene.monPosition(info);
    const trainer = scene.trainers[side];
    const leave = trainer ? this.trainerLeaves(foe) : wait(0);
    // The message prints while the trainer leaves; the ball comes once it's read.
    yield* all(scene.message(line, 0), leave);
    if (mon) {
      const ball = this.balls.release(mon.sprite, x, y + (foe ? 16 : 8), 2, 0, foe ? 0 : 24, 0);
      if (!foe) yield* this.throwBall(ball);
      // The cry as the Pokémon comes out of the ball.
      let cried = false;
      while (ball.inUse) {
        if (!cried && !mon.sprite.invisible) {
          flow.playCry(info.species);
          cried = true;
        }
        yield;
      }
      if (!cried) flow.playCry(info.species);
    } else flow.playCry(info.species);
    yield* this.slideHealthbox(foe, info);
    yield* wait(32);
  }

  /** FireRed's "Go!" lines by how hurt the foe is (gBattleStruct->hpScale). */
  private goLine(): string {
    const foe = this.host.state.side(true).active[0]?.health;
    const pct = foe && foe.maxHp ? (foe.hp * 100) / foe.maxHp : 100;
    if (pct >= 70) return "sText_GoPkmn2";
    if (pct >= 40) return "sText_DoItPkmn";
    if (pct >= 10) return "sText_GoForItPkmn";
    return "sText_YourFoesWeakGetEmPkmn";
  }

  /** "<MON>, come back!" (or the trainer withdrew it), and it shrinks back into its ball. */
  private *recall(previous: BattlerInfo): Generator<void, void, void> {
    const { scene, texts } = this.host;
    const b = previous.battler!;
    const side = b.foe ? 1 : 0;
    const line = b.foe ? texts.format("sText_Trainer1WithdrewPkmn", { buff1: texts.name(b) }) : texts.format("sText_PkmnComeBack", { buff1: texts.name(b) });
    yield* scene.message(line, 0);
    const mon = scene.mons[side];
    if (mon) {
      const ball = this.balls.takeBack(mon.sprite, mon.sprite.x, mon.sprite.y + 16, 2, 0, 0, 0);
      yield* wait(40);
      this.host.flow.gba.sprites.destroy(ball);
      scene.removeMon(b.foe);
    }
    scene.healthbox(b.foe).visible = false;
  }

  /** The player's ball flies from the trainer's hand to the Pokémon's spot (SE_BALL_THROW). */
  private *throwBall(ball: { x: number; y: number; x2: number; y2: number; data: Int16Array }): Generator<void, void, void> {
    this.host.flow.play("se_ball_throw");
    const frames = 24;
    const fromX = 32 - ball.x;
    const fromY = 72 - ball.y;
    for (let i = 0; i < frames; i++) {
      const t = 1 - i / frames;
      ball.x2 = Math.round(fromX * t);
      ball.y2 = Math.round(fromY * t - Math.sin(Math.PI * (1 - t)) * 32);
      yield;
    }
    ball.x2 = ball.y2 = 0;
  }

  /** At the battle's start: the foe walks off to the right; the player throws and slides off to the left. */
  private *trainerLeaves(foe: boolean): Generator<void, void, void> {
    const { scene } = this.host;
    const sprite = scene.trainers[foe ? 1 : 0];
    if (!sprite) return;
    if (!foe) sprite.startAnim(1);
    for (let i = 0; i < 40; i++) {
      sprite.x2 += foe ? 4 : -3;
      yield;
    }
    scene.hideTrainer(foe);
  }

  /** The healthbox drawn and sliding in from its side. */
  private *slideHealthbox(foe: boolean, info: BattlerInfo): Generator<void, void, void> {
    const box = this.host.scene.healthbox(foe);
    box.show(this.host.healthboxMon(info));
    box.offset = foe ? -96 : 96;
    box.visible = true;
    while (box.offset !== 0) {
      box.offset += foe ? 8 : -8;
      yield;
    }
  }

  /** The species' pictures (and the player's back pic) before it shows. */
  private *loadArt(info: BattlerInfo): Generator<void, void, void> {
    const { flow, backPics } = this.host;
    let ready = false;
    const foe = info.battler?.foe ?? false;
    void Promise.all([flow.assets.pokemonArt(info.species), foe ? null : flow.assets.backPic(info.species).then((pic) => backPics.set(info.species, pic))]).then(
      () => (ready = true),
      () => (ready = true),
    );
    while (!ready) yield;
  }
}
