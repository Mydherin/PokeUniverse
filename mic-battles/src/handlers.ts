// NATS request handlers. Subjects: battles.<action>; mic-core is the only caller.

import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import type { Msg, NatsConnection } from "@nats-io/transport-node";
import { PingSchema, PongSchema } from "@pokeuniverse/contracts/battle/v1/battle";
import { log } from "./log.ts";
import { FORMAT } from "./rules.ts";

/** Every copy of mic-battles joins this queue group, so NATS spreads requests between them. */
const QUEUE = "mic-battles";

type Handler = (data: Uint8Array) => Uint8Array;

const handlers: Record<string, Handler> = {
  "battles.ping": (data) => {
    const ping = fromBinary(PingSchema, data);
    return toBinary(PongSchema, create(PongSchema, { coreTime: ping.coreTime, battlesTime: BigInt(Date.now()), format: FORMAT }));
  },
};

export function subscribe(nc: NatsConnection): void {
  for (const [subject, handle] of Object.entries(handlers)) {
    nc.subscribe(subject, {
      queue: QUEUE,
      callback: (err, msg) => {
        if (err) return log.error("subscription failed", { subject, err: String(err) });
        reply(subject, msg, handle);
      },
    });
  }
}

function reply(subject: string, msg: Msg, handle: Handler): void {
  try {
    msg.respond(handle(msg.data));
  } catch (err) {
    // A bad message gets no reply: the caller times out and logs it.
    log.warn("request failed", { subject, err: String(err) });
  }
}
