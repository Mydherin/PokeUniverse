// A step's new log lines → each side's events. `|split|pN` is followed by the line only side N
// sees (its exact HP) and the line everyone else sees (the 48-pixel bar).

import type { Battle } from "@pkmn/sim";
import type { StartBattle } from "@pokeuniverse/contracts/battle/v1/battle";
import type { BattleEvent } from "@pokeuniverse/contracts/battle/v1/event";
import { observe, type ExpState } from "../exp.ts";
import { toEvents } from "./events.ts";
import { parseLine, parseSide } from "./line.ts";

export function translate(lines: readonly string[], battle: Battle, start: StartBattle, exp: ExpState): BattleEvent[][] {
  const sides = start.sides.map((_, viewer) => ({ viewer, events: [] as BattleEvent[] }));
  for (let i = 0; i < lines.length; i++) {
    let seen = sides.map(() => lines[i]);
    if (lines[i].startsWith("|split|")) {
      const owner = parseSide(lines[i].slice("|split|".length));
      seen = sides.map((s) => (s.viewer === owner ? lines[i + 1] : lines[i + 2]));
      i += 2;
    }
    sides.forEach((s) => s.events.push(...toEvents(parseLine(seen[s.viewer]), { battle, start, viewer: s.viewer })));
    observe(parseLine(seen[0]), exp, battle, start).forEach((events, side) => sides[side].events.push(...events));
  }
  return sides.map((s) => s.events);
}
