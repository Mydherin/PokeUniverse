// Wild battles and the rest of a battle's end that Showdown doesn't have (phase-7 D5, D6; M4 holds
// the Gen 4 sources). RUN and escape items are queued `event` actions like bag items (order 101:
// HandleAction_Run comes before items and moves); Roar, Whirlwind and Teleport end a wild battle;
// a wild Pokémon (or an AI trainer's) never steals or swaps items; Pay Day is counted. Leaving
// ends the battle with Showdown's tie: the outcome reads who left from Extras.

import type { Battle } from "@pkmn/sim";
import type { StartBattle } from "@pokeuniverse/contracts/battle/v1/battle";
import { BattleKind } from "@pokeuniverse/contracts/battle/v1/view";
import { EscapeHow } from "@pokeuniverse/contracts/battle/v1/event";
import { Item } from "@pokeuniverse/contracts/item/v1/catalog";
import { pokemonAt, type Pokemon } from "./battle.ts";
import { itemNumber, moveNumber } from "./lookup.ts";

const ORDER = 101;

/** Our state beside Showdown's (saved in the battle's meta): RUN tries (BattleTryRun's
 *  runAttempts), who left, Pay Day's coins (the player's side only, as FireRed). */
export type Extras = { runTries: number; left?: { side: number; how: EscapeHow }; payDay: number };

export const newExtras = (): Extras => ({ runTries: 0, payDay: 0 });

const wild = (start: StartBattle) => start.kind === BattleKind.WILD;

/** Trapping abilities named by "<FOE> prevents escape with <ABILITY>!". */
const TRAP_ABILITIES = new Set(["shadowtag", "arenatrap", "magnetpull"]);
const TRAP_VOLATILES = ["trapped", "partiallytrapped", "ingrain"];

/** CantEscape: Smoke Ball and Run Away always get away; otherwise Showdown's trapping. */
export function escapeBlock(pokemon: Pokemon): { blocked: boolean; byAbility?: string; foe?: Pokemon } {
  if (pokemon.item === "smokeball" || pokemon.ability === "runaway" || !pokemon.trapped) return { blocked: false };
  const foe = pokemon.foes().find((f) => TRAP_ABILITIES.has(f.ability));
  const byMove = TRAP_VOLATILES.some((v) => pokemon.volatiles[v]);
  return { blocked: true, byAbility: foe && !byMove ? foe.ability : undefined, foe: byMove ? undefined : foe };
}

/** Queues RUN, or an escape item from the bag, for the active Pokémon (instead of a move). */
export function chooseRun(user: Pokemon, item?: number): boolean {
  user.m.run = { item: item ?? 0 };
  user.side.choice.actions.push({ choice: "event", event: "Run", pokemon: user, order: ORDER, priority: 0 } as never);
  return true;
}

/** BattleTryRun: Smoke Ball, Run Away, else the speed roll (u8, so it wraps at 256). */
function tryRun(battle: Battle, user: Pokemon, extras: Extras): EscapeHow | undefined {
  if (user.item === "smokeball") return EscapeHow.ITEM;
  if (user.ability === "runaway") return EscapeHow.ABILITY;
  const foe = user.foes()[0];
  const speed = user.storedStats.spe;
  const foeSpeed = foe?.storedStats.spe ?? 0;
  let escaped = speed >= foeSpeed;
  if (!escaped) escaped = (Math.floor((speed * 128) / foeSpeed) + extras.runTries * 30) % 256 > battle.random(256);
  extras.runTries++;
  return escaped ? EscapeHow.NORMAL : undefined;
}

/** The side leaves: our line `|left|<pokemon>|<how>|<item>|<ability>|<move>`, then the battle ends. */
function leave(battle: Battle, extras: Extras, who: Pokemon, how: EscapeHow, item = 0, move = ""): void {
  extras.left = { side: who.side.n, how };
  const ability = how === EscapeHow.ABILITY ? who.ability : "";
  battle.add("left", who, String(how), String(item), ability, String(move ? moveNumber(move) : 0));
  battle.tie();
}

/** WhirlwindCheck: a higher or equal level always blows the target away; else a level roll. */
function whirlwindCheck(battle: Battle, source: Pokemon, target: Pokemon): boolean {
  if (source.level >= target.level) return true;
  return Math.floor((battle.random(256) * (source.level + target.level)) / 256) + 1 > Math.floor(target.level / 4);
}

const NO_STEALING = new Set(["thief", "covet", "trick", "switcheroo"]);

/** Runs on every created or restored battle: listeners aren't part of the saved state. */
export function registerExtras(battle: Battle, start: StartBattle, extras: Extras): void {
  battle.onEvent("Run", battle.format, (user: Pokemon) => {
    const run = user.m.run as { item: number } | undefined;
    if (!run) return;
    delete user.m.run;
    // Poké Doll and Fluffy Tail need no roll and work while trapped (BATTLE_SUBSCRIPT_ESCAPE_ITEM).
    if (run.item) return leave(battle, extras, user, EscapeHow.ITEM, run.item);
    const how = tryRun(battle, user, extras);
    if (how === undefined) battle.add("escapefail", user);
    else leave(battle, extras, user, how, how === EscapeHow.ITEM ? itemNumber(user.item) : 0);
  });

  // TryStealItem, TrySwapItems: side 1 can't take items outside link battles.
  battle.onEvent("TakeItem", battle.format, () => {
    const move = battle.activeMove;
    const by = battle.activePokemon;
    if ((start.kind === BattleKind.TRAINER || start.kind === BattleKind.WILD) && move && by?.side.n === 1 && NO_STEALING.has(move.id)) return false;
    return undefined;
  });

  battle.onEvent("ModifyMove", battle.format, (move: { id: string; [k: string]: unknown }, user: Pokemon) => {
    if (move.id === "payday" && user.side.n === 0) {
      const hit = move.onHit as ((...a: unknown[]) => unknown) | undefined;
      move.onHit = function (this: Battle, ...args: unknown[]) {
        extras.payDay = Math.min(0xffff, extras.payDay + user.level * 5);
        return hit?.apply(this, args);
      };
    }
    if (!wild(start)) return;
    if (move.id === "teleport") {
      // BtlCmd_TryTeleport: fails when the user can't escape; otherwise it leaves.
      move.onTry = function (this: Battle, source: Pokemon) {
        if (escapeBlock(source).blocked) return false;
        leave(battle, extras, source, EscapeHow.MOVE, 0, "teleport");
        return null;
      };
    }
    if (move.id === "roar" || move.id === "whirlwind") {
      // BtlCmd_TryWhirlwind in a wild battle: the target leaves when WhirlwindCheck passes.
      delete move.forceSwitch;
      move.onHit = function (this: Battle, target: Pokemon, source: Pokemon) {
        if (!battle.runEvent("DragOut", target, source, move as never) || !whirlwindCheck(battle, source, target)) return false;
        leave(battle, extras, target, EscapeHow.MOVE, 0, move.id);
        return null;
      };
    }
  });
}

/** BtlCmd_GenerateEndOfBattleItem's tables (sPickupTable1, sPickupTable2, sPickupWeightTable).
 *  TM56 and TM86 are Gen 4 TMs our catalog doesn't have: those rolls pick up nothing. */
const PICKUP_COMMON = [
  Item.POTION, Item.ANTIDOTE, Item.SUPER_POTION, Item.GREAT_BALL, Item.REPEL, Item.ESCAPE_ROPE,
  Item.FULL_HEAL, Item.HYPER_POTION, Item.ULTRA_BALL, Item.REVIVE, Item.RARE_CANDY, Item.SUN_STONE,
  Item.MOON_STONE, Item.HEART_SCALE, Item.FULL_RESTORE, Item.MAX_REVIVE, Item.PP_UP, Item.MAX_ELIXIR,
];
const PICKUP_RARE = [
  Item.HYPER_POTION, Item.NUGGET, Item.KINGS_ROCK, Item.FULL_RESTORE, Item.ETHER, Item.IRON_BALL,
  Item.UNSPECIFIED, Item.ELIXIR, Item.UNSPECIFIED, Item.LEFTOVERS, Item.TM26,
];
const PICKUP_WEIGHTS = [30, 40, 50, 60, 70, 80, 90, 94, 98];

/** Pickup and Honey Gather after a won battle: what each party slot finds (held items as they leave the battle). */
export function pickUp(battle: Battle, side: number, held: number[]): Item[] {
  return held.map((item, slot) => {
    const p = pokemonAt(battle, side, slot);
    if (item) return Item.UNSPECIFIED;
    if (p.baseAbility === "pickup" && battle.random(10) === 0) {
      const rnd = battle.random(100);
      const band = Math.min(Math.floor((p.level - 1) / 10), 9);
      if (rnd >= 98) return PICKUP_RARE[band + 99 - rnd];
      return PICKUP_COMMON[band + PICKUP_WEIGHTS.findIndex((w) => w > rnd)];
    }
    if (p.baseAbility === "honeygather" && battle.random(100) < 5 * Math.max(1, Math.ceil(p.level / 10))) return Item.HONEY;
    return Item.UNSPECIFIED;
  });
}
