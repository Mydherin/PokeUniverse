// NATS request handlers. Subjects: battles.<action>; mic-core is the only caller.

import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import type { Msg, NatsConnection } from "@nats-io/transport-node";
import {
  BattleUpdateSchema,
  ForfeitSchema,
  PingSchema,
  PongSchema,
  StartBattleSchema,
  TurnRequestSchema,
  ViewRequestSchema,
} from "@pokeuniverse/contracts/battle/v1/battle";
import { BattleViewSchema } from "@pokeuniverse/contracts/battle/v1/view";
import type { Battles } from "./battles.ts";
import { log } from "./log.ts";
import { FORMAT } from "./rules.ts";

/** Every copy of mic-battles joins this queue group, so NATS spreads requests between them. */
const QUEUE = "mic-battles";

type Handler = (data: Uint8Array) => Promise<Uint8Array>;

function handlers(battles: Battles): Record<string, Handler> {
  return {
    "battles.ping": async (data) => {
      const ping = fromBinary(PingSchema, data);
      return toBinary(PongSchema, create(PongSchema, { coreTime: ping.coreTime, battlesTime: BigInt(Date.now()), format: FORMAT }));
    },
    "battles.start": async (data) => toBinary(BattleUpdateSchema, await battles.start(fromBinary(StartBattleSchema, data))),
    "battles.turn": async (data) => toBinary(BattleUpdateSchema, await battles.turn(fromBinary(TurnRequestSchema, data))),
    "battles.forfeit": async (data) => toBinary(BattleUpdateSchema, await battles.forfeit(fromBinary(ForfeitSchema, data))),
    "battles.view": async (data) => toBinary(BattleViewSchema, await battles.view(fromBinary(ViewRequestSchema, data))),
  };
}

export function subscribe(nc: NatsConnection, battles: Battles): void {
  for (const [subject, handle] of Object.entries(handlers(battles))) {
    nc.subscribe(subject, {
      queue: QUEUE,
      callback: (err, msg) => {
        if (err) return log.error("subscription failed", { subject, err: String(err) });
        void reply(subject, msg, handle);
      },
    });
  }
}

async function reply(subject: string, msg: Msg, handle: Handler): Promise<void> {
  try {
    msg.respond(await handle(msg.data));
  } catch (err) {
    // A bad message gets no reply: the caller times out and logs it.
    log.warn("request failed", { subject, err: String(err) });
  }
}
