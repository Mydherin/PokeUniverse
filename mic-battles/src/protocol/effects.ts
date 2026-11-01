// Showdown's effect names ("move: Leech Seed", "ability: Levitate", "brn", "confusion"…) as our
// Effect. Names Showdown writes without a prefix are looked up as a move, ability, then item.

import { create } from "@bufbuild/protobuf";
import { toID } from "@pkmn/sim";
import { Condition, EffectSchema, type Effect } from "@pokeuniverse/contracts/battle/v1/event";
import { abilityNumber, itemNumber, moveNumber, statusNumber, weatherNumber } from "../engine/lookup.ts";
import { warnOnce } from "./warn.ts";

const CONDITIONS: Record<string, Condition> = {
  confusion: Condition.CONFUSION,
  flinch: Condition.FLINCH,
  recharge: Condition.RECHARGE,
  mustrecharge: Condition.RECHARGE,
  nopp: Condition.NO_PP,
  recoil: Condition.RECOIL,
  strugglerecoil: Condition.RECOIL,
  drain: Condition.DRAIN,
  partiallytrapped: Condition.PARTIALLY_TRAPPED,
  trapped: Condition.TRAPPED,
  typechange: Condition.TYPE_CHANGE,
  lockedmove: Condition.LOCKED_MOVE,
};

/** The effect a Showdown name means; undefined for none (empty name). */
export function parseEffect(name: string | undefined): Effect | undefined {
  if (!name) return undefined;
  const colon = name.indexOf(":");
  const kind = colon < 0 ? "" : name.slice(0, colon).trim();
  const id = toID(colon < 0 ? name : name.slice(colon + 1));
  const effect = (value: Effect["kind"]) => create(EffectSchema, { kind: value });

  if (kind === "move") return effect({ case: "move", value: moveNumber(id) });
  if (kind === "ability") return effect({ case: "ability", value: abilityNumber(id) });
  if (kind === "item") return effect({ case: "item", value: itemNumber(id) });

  const status = statusNumber(id);
  if (status) return effect({ case: "status", value: status });
  const weather = weatherNumber(id);
  if (weather) return effect({ case: "weather", value: weather });
  const condition = CONDITIONS[id];
  if (condition) return effect({ case: "condition", value: condition });
  const move = moveNumber(id);
  if (move) return effect({ case: "move", value: move });
  const ability = abilityNumber(id);
  if (ability) return effect({ case: "ability", value: ability });
  const item = itemNumber(id);
  if (item) return effect({ case: "item", value: item });

  warnOnce("unknown effect", name);
  return effect({ case: undefined });
}
