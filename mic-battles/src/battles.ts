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
import { BattleViewSchema, type BattleView } from "@pokeuniverse/contracts/battle/v1/view";
import { createBattle, restoreBattle, serializeBattle, sideId } from "./engine/battle.ts";
import { advance, applyChoice, InvalidChoice } from "./engine/choices.ts";
import { newExpState, type ExpState } from "./exp.ts";
import { log } from "./log.ts";
import { translate } from "./protocol/translate.ts";
import { outcome, request, view } from "./protocol/views.ts";
import { ACTIVE_TTL, ENDED_TTL, type Saved, type Store } from "./store.ts";

/** Our state beside Showdown's, saved as JSON. */
type Meta = { exp: ExpState; forfeit?: number };

type Loaded = { saved: Saved; start: StartBattle; battle: Battle; meta: Meta };

export class Battles {
  constructor(private readonly store: Store) {}

  async start(start: StartBattle): Promise<BattleUpdate> {
    const existing = await this.store.load(start.battleId);
    if (existing) return decodeReply(existing.reply);
    const battle = createBattle(start);
    const meta: Meta = { exp: newExpState(start) };
    advance(battle, start);
    const update = buildUpdate(battle, start, meta, 1, true);
    return this.save(start, battle, meta, 1, update, undefined);
  }

  async turn(req: TurnRequest): Promise<BattleUpdate> {
    const loaded = await this.load(req.battleId);
    const { saved, start, battle, meta } = loaded;
    if (req.step === saved.step - 1) return decodeReply(saved.reply);
    if (req.step !== saved.step || battle.ended) throw new Error(`battle ${req.battleId}: step ${req.step}, expected ${saved.step}`);
    try {
      for (const choice of req.choices) applyChoice(battle, choice.side, choice.action);
    } catch (err) {
      if (!(err instanceof InvalidChoice)) throw err;
      log.warn("invalid battle choice", { battle: req.battleId, step: req.step, err: err.message });
      // Not played: every side gets its request again, with nothing new to show.
      return buildUpdate(restoreBattle(saved.state), start, meta, saved.step, false, []);
    }
    advance(battle, start);
    const update = buildUpdate(battle, start, meta, saved.step + 1, false);
    return this.save(start, battle, meta, saved.step + 1, update, saved.step);
  }

  async forfeit(req: Forfeit): Promise<BattleUpdate> {
    const { saved, start, battle, meta } = await this.load(req.battleId);
    if (battle.ended) return decodeReply(saved.reply);
    battle.lose(sideId(req.side));
    meta.forfeit = req.side;
    const update = buildUpdate(battle, start, meta, saved.step + 1, false);
    return this.save(start, battle, meta, saved.step + 1, update, saved.step);
  }

  async view(req: ViewRequest): Promise<BattleView> {
    const { saved, start, battle } = await this.load(req.battleId);
    return create(BattleViewSchema, view(battle, start, req.side, saved.step));
  }

  private async load(id: string): Promise<Loaded> {
    const saved = await this.store.load(id);
    if (!saved) throw new Error(`battle ${id} not found`);
    const start = fromBinary(StartBattleSchema, Buffer.from(saved.start, "base64"));
    return { saved, start, battle: restoreBattle(saved.state), meta: JSON.parse(saved.meta) as Meta };
  }

  /** Saves the played step; when another replica saved it first, answers with its reply. */
  private async save(start: StartBattle, battle: Battle, meta: Meta, step: number, update: BattleUpdate, expected: number | undefined): Promise<BattleUpdate> {
    const reply = Buffer.from(toBinary(BattleUpdateSchema, update)).toString("base64");
    const saved: Saved = {
      step,
      start: Buffer.from(toBinary(StartBattleSchema, start)).toString("base64"),
      state: serializeBattle(battle),
      meta: JSON.stringify(meta),
      reply,
    };
    if (await this.store.save(start.battleId, expected, saved, battle.ended ? ENDED_TTL : ACTIVE_TTL)) return update;
    const winner = await this.store.load(start.battleId);
    if (!winner || winner.step !== step) throw new Error(`battle ${start.battleId}: step ${step} lost to another save`);
    return decodeReply(winner.reply);
  }
}

/** Each side's new events and request; the views after battles.start; the outcome once over. */
function buildUpdate(battle: Battle, start: StartBattle, meta: Meta, step: number, withViews: boolean, lines: readonly string[] = battle.log): BattleUpdate {
  const events = translate(lines, battle, start, meta.exp);
  return create(BattleUpdateSchema, {
    battleId: start.battleId,
    sides: start.sides.map((_, side) => ({
      events: events[side],
      request: request(battle, side, step),
      view: withViews ? view(battle, start, side, step) : undefined,
    })),
    outcome: battle.ended ? outcome(battle, start, meta.exp, meta.forfeit) : undefined,
  });
}

function decodeReply(base64: string): BattleUpdate {
  return fromBinary(BattleUpdateSchema, Buffer.from(base64, "base64"));
}
