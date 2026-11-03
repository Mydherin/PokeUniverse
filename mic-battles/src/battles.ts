// The battles.* requests: load → play → translate → save → reply (plans/battles D2). Stateless:
// any replica plays any step, and a step already played answers its saved reply.

import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import type { Battle } from "@pkmn/sim";
import {
  BattleUpdateSchema,
  StartBattleSchema,
  type BattleUpdate,
  type Forfeit,
  type StartBattle,
  type TurnRequest,
  type ViewRequest,
} from "@pokeuniverse/contracts/battle/v1/battle";
import type { BattleEvent } from "@pokeuniverse/contracts/battle/v1/event";
import { BattleViewSchema, type BattleView } from "@pokeuniverse/contracts/battle/v1/view";
import { newAiMemory, type AiMemory } from "./ai/index.ts";
import { createBattle, restoreBattle, serializeBattle, sideId } from "./engine/battle.ts";
import { advance, answerLearn, answerShift, applyChoice, InvalidChoice, type ShiftOffer } from "./engine/choices.ts";
import { ExpTracker, newExpState, type ExpState } from "./exp.ts";
import { log } from "./log.ts";
import { translate } from "./protocol/translate.ts";
import { outcome, request, view } from "./protocol/views.ts";
import { ACTIVE_TTL, ENDED_TTL, type Saved, type Store } from "./store.ts";

/** Our state beside Showdown's, saved as JSON. */
type Meta = { exp: ExpState; ai?: AiMemory; forfeit?: number; shift?: ShiftOffer };

type Loaded = { saved: Saved; start: StartBattle; battle: Battle; meta: Meta; exp: ExpTracker };

export class Battles {
  constructor(private readonly store: Store) {}

  async start(start: StartBattle): Promise<BattleUpdate> {
    const existing = await this.store.load(start.battleId);
    if (existing) return decodeReply(existing.reply);
    const battle = createBattle(start);
    const meta: Meta = { exp: newExpState(start), ai: newAiMemory(start) };
    const exp = new ExpTracker(battle, start, meta.exp);
    advance(battle, start, meta.ai!);
    const update = buildUpdate(battle, start, meta, exp, 1, true);
    return this.save(start, battle, meta, exp, 1, update, undefined);
  }

  async turn(req: TurnRequest): Promise<BattleUpdate> {
    const loaded = await this.load(req.battleId);
    const { saved, start, battle, meta, exp } = loaded;
    if (req.step === saved.step - 1) return decodeReply(saved.reply);
    const learning = meta.exp.pending.length > 0;
    if (req.step !== saved.step || (battle.ended && !learning)) throw new Error(`battle ${req.battleId}: step ${req.step}, expected ${saved.step}`);
    const answered: BattleEvent[] = [];
    try {
      if (learning) answered.push(...answerLearn(battle, meta.exp, req.choices[0]?.action));
      else if (meta.shift) answerShift(battle, meta.shift, req.choices[0]?.action);
      else for (const choice of req.choices) applyChoice(battle, choice.side, choice.action, choice.partner);
    } catch (err) {
      if (!(err instanceof InvalidChoice)) throw err;
      log.warn("invalid battle choice", { battle: req.battleId, step: req.step, err: err.message });
      // Not played: every side gets its request again, with nothing new to show.
      return buildUpdate(restoreBattle(saved.state), start, meta, exp, saved.step, false, []);
    }
    // The battle goes on once every move a level up brought is answered.
    if (!meta.exp.pending.length) meta.shift = advance(battle, start, (meta.ai ??= newAiMemory(start)));
    const update = buildUpdate(battle, start, meta, exp, saved.step + 1, false, battle.log, answered);
    return this.save(start, battle, meta, exp, saved.step + 1, update, saved.step);
  }

  async forfeit(req: Forfeit): Promise<BattleUpdate> {
    const { saved, start, battle, meta, exp } = await this.load(req.battleId);
    if (battle.ended) return decodeReply(saved.reply);
    battle.lose(sideId(req.side));
    meta.forfeit = req.side;
    meta.exp.pending = [];
    const update = buildUpdate(battle, start, meta, exp, saved.step + 1, false);
    return this.save(start, battle, meta, exp, saved.step + 1, update, saved.step);
  }

  async view(req: ViewRequest): Promise<BattleView> {
    const { saved, start, battle, meta } = await this.load(req.battleId);
    return create(BattleViewSchema, view(battle, start, meta.exp, req.side, saved.step, meta.shift));
  }

  private async load(id: string): Promise<Loaded> {
    const saved = await this.store.load(id);
    if (!saved) throw new Error(`battle ${id} not found`);
    const start = fromBinary(StartBattleSchema, Buffer.from(saved.start, "base64"));
    const battle = restoreBattle(saved.state);
    const meta = JSON.parse(saved.meta) as Meta;
    return { saved, start, battle, meta, exp: new ExpTracker(battle, start, meta.exp) };
  }

  /** Saves the played step; when another replica saved it first, answers with its reply. */
  private async save(start: StartBattle, battle: Battle, meta: Meta, exp: ExpTracker, step: number, update: BattleUpdate, expected: number | undefined): Promise<BattleUpdate> {
    exp.sync();
    const reply = Buffer.from(toBinary(BattleUpdateSchema, update)).toString("base64");
    const saved: Saved = {
      step,
      start: Buffer.from(toBinary(StartBattleSchema, start)).toString("base64"),
      state: serializeBattle(battle),
      meta: JSON.stringify(meta),
      reply,
    };
    if (await this.store.save(start.battleId, expected, saved, over(battle, meta) ? ENDED_TTL : ACTIVE_TTL)) return update;
    const winner = await this.store.load(start.battleId);
    if (!winner || winner.step !== step) throw new Error(`battle ${start.battleId}: step ${step} lost to another save`);
    return decodeReply(winner.reply);
  }
}

/** Over: Showdown says so, and no move a level up brought is still waiting for its answer. */
const over = (battle: Battle, meta: Meta) => battle.ended && !meta.exp.pending.length;

/** Each side's new events and request; the views after battles.start; the outcome once over. */
function buildUpdate(battle: Battle, start: StartBattle, meta: Meta, exp: ExpTracker, step: number, withViews: boolean, lines: readonly string[] = battle.log, first: BattleEvent[] = []): BattleUpdate {
  // Who came out must be known before the views and the outcome are built.
  exp.sync();
  const events = translate(lines, battle, start, exp);
  events[0].unshift(...first);
  return create(BattleUpdateSchema, {
    battleId: start.battleId,
    sides: start.sides.map((_, side) => ({
      events: events[side],
      request: request(battle, start, meta.exp, side, step, meta.shift),
      view: withViews ? view(battle, start, meta.exp, side, step, meta.shift) : undefined,
    })),
    outcome: over(battle, meta) ? outcome(battle, start, meta.exp, meta.forfeit) : undefined,
  });
}

function decodeReply(base64: string): BattleUpdate {
  return fromBinary(BattleUpdateSchema, Buffer.from(base64, "base64"));
}
