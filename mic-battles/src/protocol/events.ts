// Showdown's log → BattleEvents for one side (phase-5 D4, D5). `|split|` lines are resolved
// before this (see translate.ts): the side's own Pokémon come with exact HP, a foe's as 48 pixels.

import { create, type DescMessage, type MessageInitShape } from "@bufbuild/protobuf";
import type { Battle } from "@pkmn/sim";
import type { StartBattle } from "@pokeuniverse/contracts/battle/v1/battle";
import {
  BattleEventSchema,
  Condition,
  ConditionPhase,
  EffectSchema,
  HitResult,
  StatsResetKind,
  type BattleEvent,
  type BattlerSchema,
  type BattlerInfoSchema,
  type Effect,
  type HealthSchema,
} from "@pokeuniverse/contracts/battle/v1/event";
import { pokemonAt } from "../engine/battle.ts";
import { itemNumber, moveNumber, statNumber, statusNumber, typeNumber, weatherNumber, abilityNumber } from "../engine/lookup.ts";
import { parseEffect } from "./effects.ts";
import { parseCondition, parseIdent, parseSide, type Line } from "./line.ts";
import { warnOnce } from "./warn.ts";

export type Context = { battle: Battle; start: StartBattle; viewer: number };

type Init<T extends DescMessage> = MessageInitShape<T>;
type EventKind = NonNullable<Init<typeof BattleEventSchema>["kind"]>;

/** Lines that change nothing the client shows. */
const IGNORED = new Set([
  "", "t:", "gametype", "player", "teamsize", "gen", "tier", "rule", "start", "upkeep", "clearpoke", "poke",
  "teampreview", "win", "tie", "debug", "-hint", "-message", "-center", "-anim", "-mustrecharge", "-waiting",
  "-combine", "inactive", "inactiveoff", "error", "request", "message", "raw", "html", "j", "l", "n", "c",
]);

const HIT_RESULTS: Record<string, HitResult> = {
  "-crit": HitResult.CRITICAL,
  "-supereffective": HitResult.SUPER_EFFECTIVE,
  "-resisted": HitResult.NOT_VERY_EFFECTIVE,
  "-immune": HitResult.IMMUNE,
  "-ohko": HitResult.ONE_HIT_KO,
  "-notarget": HitResult.NO_TARGET,
  "-nothing": HitResult.NOTHING,
};

/** Castform's and Cherrim's forms (FormeChange.forme). */
const FORMES: Record<string, number> = {
  castformsunny: 1,
  castformrainy: 2,
  castformsnowy: 3,
  cherrimsunshine: 1,
};

export function toEvents(line: Line, ctx: Context): BattleEvent[] {
  const { cmd, args, kw } = line;
  const silent = "silent" in kw;
  const out: BattleEvent[] = [];
  const add = (kind: EventKind) => out.push(create(BattleEventSchema, { kind, silent }));
  const who = (i: number) => battler(ctx, args[i]);
  const from = () => parseEffect(kw.from);
  const of = () => battler(ctx, kw.of);

  switch (cmd) {
    case "turn":
      add({ case: "turnStart", value: { turn: Number(args[0]) } });
      break;
    case "switch":
    case "drag":
      add({ case: "switchIn", value: { pokemon: battlerInfo(ctx, args[0], args[2]), dragged: cmd === "drag" } });
      break;
    case "move":
      add({ case: "moveUsed", value: { battler: who(0), move: moveNumber(args[1]), target: who(2), from: from(), still: "still" in kw || "miss" in kw } });
      break;
    case "-prepare":
      add({ case: "prepare", value: { battler: who(0), move: moveNumber(args[1]), target: who(2) } });
      break;
    case "cant":
      add({ case: "cant", value: { battler: who(0), reason: parseEffect(args[1]), move: moveNumber(args[2] ?? "") } });
      break;
    case "-miss":
      add({ case: "moveResult", value: { battler: who(1) ?? who(0), result: HitResult.MISS, from: from() } });
      break;
    case "-crit":
    case "-supereffective":
    case "-resisted":
    case "-immune":
    case "-ohko":
    case "-notarget":
    case "-nothing":
      add({ case: "moveResult", value: { battler: who(0), result: HIT_RESULTS[cmd], from: from() } });
      break;
    case "-hitcount":
      add({ case: "hitCount", value: { battler: who(0), hits: Number(args[1]) } });
      break;
    case "-fail":
    case "-block":
      add({ case: "fail", value: { battler: who(0), effect: failEffect(args[1]), from: cmd === "-block" ? parseEffect(args[1]) : from(), stat: statNumber(args[2] ?? "") } });
      break;
    case "-damage":
      add({ case: "damage", value: { battler: who(0), health: health(ctx, args[0], args[1]), from: from(), source: of() } });
      break;
    case "-heal":
      add({ case: "heal", value: { battler: who(0), health: health(ctx, args[0], args[1]), from: from(), source: of() } });
      break;
    case "-sethp":
      add({ case: "setHealth", value: { battler: who(0), health: health(ctx, args[0], args[1]), from: from() } });
      break;
    case "faint":
      add({ case: "faint", value: { battler: who(0) } });
      break;
    case "-status":
      add({ case: "statusSet", value: { battler: who(0), status: statusNumber(args[1]), from: from(), source: of() } });
      break;
    case "-curestatus":
      add({ case: "statusCured", value: { battler: who(0), status: statusNumber(args[1]), from: from() } });
      break;
    case "-cureteam":
      add({ case: "teamCured", value: { battler: who(0), from: from() } });
      break;
    case "-boost":
    case "-unboost":
      add({ case: "statChange", value: { battler: who(0), stat: statNumber(args[1]), stages: Number(args[2]), lower: cmd === "-unboost", from: from() } });
      break;
    case "-setboost":
      add({ case: "statSet", value: { battler: who(0), stat: statNumber(args[1]), stage: Number(args[2]), from: from() } });
      break;
    case "-clearallboost":
      add({ case: "statsReset", value: { kind: StatsResetKind.ALL, from: from() } });
      break;
    case "-clearnegativeboost":
      add({ case: "statsReset", value: { battler: who(0), kind: StatsResetKind.NEGATIVE, from: from() } });
      break;
    case "-copyboost":
    case "-swapboost":
      add({ case: "statsCopied", value: { battler: who(0), source: who(1), from: from(), swapped: cmd === "-swapboost" } });
      break;
    case "-start":
    case "-singleturn":
    case "-singlemove":
      add({ case: "volatileStart", value: volatileStart(ctx, line) });
      break;
    case "-end":
      add({ case: "volatileEnd", value: { battler: who(0), effect: parseEffect(args[1]), from: from() } });
      break;
    case "-activate":
      add({ case: "activate", value: activate(ctx, line) });
      break;
    case "-weather":
      add({ case: "weatherChange", value: {
        weather: weatherNumber(args[0]),
        phase: args[0] === "none" ? ConditionPhase.END : "upkeep" in kw ? ConditionPhase.UPKEEP : ConditionPhase.START,
        from: from(),
        source: of(),
      } });
      break;
    case "-fieldstart":
    case "-fieldend":
      add({ case: "fieldCondition", value: { effect: parseEffect(args[0]), phase: cmd === "-fieldend" ? ConditionPhase.END : ConditionPhase.START, source: of() } });
      break;
    case "-sidestart":
    case "-sideend":
      add({ case: "sideCondition", value: { foe: parseSide(args[0]) !== ctx.viewer, effect: parseEffect(args[1]), phase: cmd === "-sideend" ? ConditionPhase.END : ConditionPhase.START } });
      break;
    case "-ability":
      add({ case: "abilityShown", value: { battler: who(0), ability: abilityNumber(args[1]), from: from(), source: of() } });
      break;
    case "-endability":
      add({ case: "volatileStart", value: { battler: who(0), effect: from() } });
      break;
    case "-item":
      add({ case: "itemShown", value: { battler: who(0), item: itemNumber(args[1]), from: from(), source: of() } });
      break;
    case "-enditem":
      // A resist berry writes `[eat]`, then `[weaken]` for the same berry.
      if ("weaken" in kw) break;
      // Bug Bite and Pluck: `[from] stealeat|[move] Bug Bite`.
      add({ case: "itemEnded", value: { battler: who(0), item: itemNumber(args[1]), from: kw.from === "stealeat" ? parseEffect(`move: ${kw.move}`) : from(), eaten: "eat" in kw } });
      break;
    case "bagitem":
      add({ case: "itemUsed", value: { foe: parseSide(args[0]) !== ctx.viewer, item: Number(args[1]), target: who(2) } });
      break;
    case "-transform":
      add({ case: "transform", value: { battler: who(0), target: who(1) } });
      break;
    case "detailschange":
    case "-formechange":
      add({ case: "formeChange", value: { battler: who(0), forme: FORMES[args[1].split(",")[0].toLowerCase().replace(/[^a-z]/g, "")] ?? 0, from: from() } });
      break;
    default:
      if (!IGNORED.has(cmd)) warnOnce("untranslated line", cmd);
  }
  return out;
}

export function battler(ctx: Context, ident: string | undefined): Init<typeof BattlerSchema> | undefined {
  const id = parseIdent(ident);
  return id && { foe: id.side !== ctx.viewer, partySlot: id.slot, position: id.position };
}

/** HP as the viewer sees it: exact for their own, 48 pixels for a foe's (`0 fnt` has no max). */
function health(ctx: Context, ident: string, condition: string): Init<typeof HealthSchema> {
  const c = parseCondition(condition);
  const id = parseIdent(ident);
  const max = c.maxHp || (id && id.side === ctx.viewer ? pokemonAt(ctx.battle, id.side, id.slot).maxhp : 48);
  return { hp: c.hp, maxHp: max };
}

/** What a Pokémon sending out shows: our team data, with the condition from the log. */
function battlerInfo(ctx: Context, ident: string, condition: string): Init<typeof BattlerInfoSchema> {
  const id = parseIdent(ident)!;
  const mon = ctx.start.sides[id.side].pokemon[id.slot];
  return {
    battler: battler(ctx, ident),
    species: mon.species,
    nickname: mon.nickname,
    level: pokemonAt(ctx.battle, id.side, id.slot).level,
    gender: mon.gender,
    shiny: mon.shiny,
    personality: mon.personality,
    health: health(ctx, ident, condition),
    status: statusNumber(parseCondition(condition).status),
  };
}

/** `-fail|p1a|unboost|Attack`: "unboost"/"boost" are no effect; a move or condition is. */
function failEffect(name: string | undefined): Effect | undefined {
  if (!name || name === "unboost" || name === "boost" || name === "heal") return undefined;
  return parseEffect(name);
}

function volatileStart(ctx: Context, { args, kw }: Line) {
  const counted = /^(perish|stockpile)(\d)$/.exec(args[1] ?? "");
  const effect = counted ? parseEffect(counted[1] === "perish" ? "move: Perish Song" : "move: Stockpile") : parseEffect(args[1]);
  const isType = effect?.kind.case === "condition" && args[1] === "typechange";
  return {
    battler: battler(ctx, args[0]),
    effect: "fatigue" in kw ? create(EffectSchema, { kind: { case: "condition", value: Condition.FATIGUE } }) : effect,
    from: parseEffect(kw.from),
    source: battler(ctx, kw.of),
    amount: counted ? Number(counted[2]) : 0,
    type: isType ? typeNumber(args[2] ?? "") : 0,
    move: isType ? 0 : moveNumber(args[2] ?? ""),
  };
}

/** `-activate|p2a|move: Spite|Thunderbolt|4`, `-activate|p1a|ability: Forewarn|thunderbolt|[of] p2a`… */
function activate(ctx: Context, { args, kw }: Line) {
  const extra = args.slice(2);
  const amount = extra.find((a) => /^\d+$/.test(a));
  const move = extra.map(moveNumber).find(Boolean) ?? 0;
  return {
    battler: battler(ctx, args[0]),
    effect: parseEffect(args[1]),
    source: battler(ctx, kw.of),
    move,
    amount: amount ? Number(amount) : 0,
    item: kw.item ? itemNumber(kw.item) : 0,
  };
}
