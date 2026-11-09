// Ball throws (phase-7 D6, M5's Findings): Showdown has no catching. A ball is a queued `event`
// action like a bag item (HandleAction_UseItem, before moves); its Ball event rolls Gen 4's
// BattleSystem_CalculateBallShakes. mic-core has already spent the ball. Caught: the battle ends
// (Showdown's tie, as RUN does) and the outcome reads the catch from Extras.

import { getOption } from "@bufbuild/protobuf";
import type { Battle } from "@pkmn/sim";
import type { StartBattle } from "@pokeuniverse/contracts/battle/v1/battle";
import { BattleKind, BattleTerrain } from "@pokeuniverse/contracts/battle/v1/view";
import { Item } from "@pokeuniverse/contracts/item/v1/catalog";
import { info, SpeciesSchema } from "@pokeuniverse/contracts/species/v1/catalog";
import { partySlot, type Pokemon } from "./battle.ts";
import { speciesNumber } from "./lookup.ts";
import type { Extras } from "./wild.ts";

const ORDER = 102;

const CATCH_RATES = new Map<number, number>(SpeciesSchema.values.map((v) => [v.number, getOption(v, info)?.catchRate ?? 0]));

/** Gen 4's ball multiplier in tenths (×1 = 10). */
function multiplier(battle: Battle, start: StartBattle, ball: number, target: Pokemon): number {
  const turns = battle.turn - 1; // totalTurns: 0 on the first turn.
  const night = start.catchFacts?.night ?? false;
  switch (ball) {
    case Item.ULTRA_BALL:
      return 20;
    case Item.GREAT_BALL:
    case Item.SAFARI_BALL:
      return 15;
    case Item.NET_BALL:
      return target.getTypes().some((t) => t === "Water" || t === "Bug") ? 30 : 10;
    case Item.DIVE_BALL:
      return start.terrain === BattleTerrain.WATER ? 35 : 10;
    case Item.NEST_BALL:
      return target.level < 40 ? Math.max(10, 40 - target.level) : 10;
    case Item.REPEAT_BALL:
      return start.catchFacts?.speciesCaught[partySlot(target)] ? 30 : 10;
    case Item.TIMER_BALL:
      return Math.min(40, turns + 10);
    case Item.DUSK_BALL:
      return night || start.terrain === BattleTerrain.CAVE ? 35 : 10;
    case Item.QUICK_BALL:
      return turns < 1 ? 40 : 10;
    default:
      return 10;
  }
}

const isqrt = (n: number) => Math.floor(Math.sqrt(n));

/** Shake checks passed, 0-4 (4 = caught). */
export function ballShakes(battle: Battle, start: StartBattle, ball: number, target: Pokemon): number {
  if (ball === Item.MASTER_BALL) return 4;
  const catchRate = CATCH_RATES.get(speciesNumber(target.species.name)) ?? 0;
  const maxHp3 = target.maxhp * 3;
  let a = Math.floor((Math.floor((catchRate * multiplier(battle, start, ball, target)) / 10) * (maxHp3 - target.hp * 2)) / maxHp3);
  if (target.status === "slp" || target.status === "frz") a *= 2;
  if (["brn", "par", "psn", "tox"].includes(target.status)) a = Math.floor((a * 15) / 10);
  if (a >= 255) return 4;
  const b = Math.floor(0xffff0 / isqrt(isqrt(Math.floor(0xff0000 / Math.max(1, a)))));
  let shakes = 0;
  while (shakes < 4 && battle.random(65536) < b) shakes++;
  return shakes;
}

/** Queues the ball throw for the user's side (instead of a move). */
export function chooseBall(user: Pokemon, ball: number): boolean {
  user.m.ball = ball;
  user.side.choice.actions.push({ choice: "event", event: "Ball", pokemon: user, order: ORDER, priority: 0 } as never);
  return true;
}

/** Runs on every created or restored battle (from registerExtras). */
export function registerCatch(battle: Battle, start: StartBattle, extras: Extras): void {
  battle.onEvent("Ball", battle.format, (user: Pokemon) => {
    const ball = user.m.ball as number | undefined;
    if (!ball) return;
    delete user.m.ball;
    const target = user.foes()[0];
    if (!target) return;
    // A trainer's Pokémon: the ball is blocked, no roll (Gen 4's CHECK_IF_TRAINER).
    const blocked = start.kind !== BattleKind.WILD;
    const shakes = blocked ? 0 : ballShakes(battle, start, ball, target);
    // Our line (protocol/events.ts): `|ball|<user>|<ball>|<target>|<shakes>|<caught|blocked|>`.
    battle.add("ball", user, String(ball), target, String(shakes), blocked ? "blocked" : shakes === 4 ? "caught" : "");
    if (shakes < 4) return;
    extras.caught = { slot: partySlot(target), ball };
    battle.tie();
  });
}
