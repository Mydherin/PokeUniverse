// Plays the battle's events as FireRed shows them, with placeholder hits until the move
// animations come (plans/battles M8): the target blinks with the effectiveness sound and its HP
// bar moves; a faint plays the faint cry and the Pokémon sinks; stats play their sound; a
// send-out throws the ball and the Pokémon comes out with its cry, its healthbox sliding in.
// Each event changes the battle's state as it is shown.

import { Condition, HitResult, type BattleEvent, type Battler, type BattlerInfo } from "@pokeuniverse/contracts/battle/v1/event";
import type { IndexedImage } from "../../gba/assets";
import type { BattleState } from "../../battle/state";
import type { Flow } from "../flow";
import { HpBarLevel, hpBarLevel } from "../hp-bar";
import { Assets } from "../manifest";
import { PokeBalls } from "../pokeball";
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

  constructor(private readonly host: PlaybackHost) {
    this.balls = new PokeBalls(host.flow);
  }

  /** A batch of events, in FireRed's order. */
  *play(events: readonly BattleEvent[]): Generator<void, void, void> {
    const arranged = arrange(events);
    this.hits = arranged.hits;
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
        return yield* this.faint(e, k.value.battler);
      case "statusSet":
      case "statusCured": {
        state.apply(e);
        const b = k.value.battler;
        const mon = state.battler(b);
        if (b && state.side(b.foe).active[0] === mon && mon) scene.healthbox(b.foe).setStatus(mon.status);
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
      case "statChange":
        if (k.value.stages > 0) this.host.flow.play(k.value.lower ? "se_m_stat_decrease" : "se_m_stat_increase");
        break;
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

  /** Placeholder hit (until M8): the target blinks for 32 frames (DoHitAnimation) with the effectiveness sound. */
  private *hit(b: Battler | undefined, result: HitResult): Generator<void, void, void> {
    if (!b) return;
    const { flow, scene } = this.host;
    flow.play(result === HitResult.SUPER_EFFECTIVE ? "se_super_effective" : result === HitResult.NOT_VERY_EFFECTIVE ? "se_not_effective" : "se_effective");
    const sprite = scene.mons[b.foe ? 1 : 0]?.sprite;
    if (!sprite) return;
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
