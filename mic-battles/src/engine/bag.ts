// Bag items in battle (phase-5 D12). Showdown has no bag: an item is a queued `event`
// action (order 102: after Showdown's own start-of-turn actions, before switches and moves, as in
// Gen 4) that runs the BagItem event, answered here. mic-core has already checked and spent a
// player's item; an AI trainer's come from its BattleTeam.items (ai/items.ts). What HP, status and
// PP items do is the catalog's `effect`; the rest (X items, Dire Hit, Guard Spec., POKé FLUTE) is here.

import { getOption } from "@bufbuild/protobuf";
import type { Battle } from "@pkmn/sim";
import type { ItemAction } from "@pokeuniverse/contracts/battle/v1/view";
import { BattleUse, info, Item, ItemSchema, type ItemEffect, type ItemInfo } from "@pokeuniverse/contracts/item/v1/catalog";
import { pokemonAt, sideId, type Pokemon } from "./battle.ts";
import { statusId } from "./lookup.ts";

const ORDER = 102;

/** The item waiting on its user's turn, kept in the Pokémon's mod data (saved with the battle). */
type Pending = { item: number; partySlot: number; moveSlot: number };

const INFOS = new Map<number, ItemInfo>(ItemSchema.values.map((v) => [v.number, getOption(v, info)]));

/** A bag item's effect on HP, status and PP, from the catalog; what its user uses itself is below (their `effect` is only friendship, mic-core's). */
export const itemEffect = (item: number): ItemEffect | undefined => {
  const info = INFOS.get(item);
  return info?.battleUse === BattleUse.SELF ? undefined : info?.effect;
};

/** X items: +1 stage in Gen 4 (X Special is Sp. Atk). */
export const X_STATS: Partial<Record<Item, "atk" | "def" | "spe" | "spa" | "accuracy">> = {
  [Item.X_ATTACK]: "atk",
  [Item.X_DEFEND]: "def",
  [Item.X_SPEED]: "spe",
  [Item.X_SPECIAL]: "spa",
  [Item.X_ACCURACY]: "accuracy",
};

/** The status IDs an effect cures. */
const cures = (e: ItemEffect) => e.cures.map(statusId);

/** The moves a PP item acts on. */
function ppSlots(target: Pokemon, e: ItemEffect, moveSlot: number) {
  return e.allMoves ? target.baseMoveSlots : target.baseMoveSlots.slice(moveSlot, moveSlot + 1);
}

/** Whether a HP, status or PP item would change the target ("It won't have any effect" otherwise). */
function effectWorks(e: ItemEffect, target: Pokemon, moveSlot: number): boolean {
  if (e.revive) return target.fainted;
  if (target.fainted) return false;
  if ((e.hp || e.hpPercent) && target.hp < target.maxhp) return true;
  if (target.status && cures(e).includes(target.status)) return true;
  if (target.isActive && e.confusion && target.volatiles.confusion) return true;
  if (target.isActive && e.infatuation && target.volatiles.attract) return true;
  return (e.pp > 0 || e.ppMax) && ppSlots(target, e, moveSlot).some((slot) => slot.pp < slot.maxpp);
}

function applyEffect(battle: Battle, item: number, e: ItemEffect, target: Pokemon, moveSlot: number): void {
  const amount = e.hp || Math.floor((target.maxhp * e.hpPercent) / 100);
  if (e.revive) {
    // Showdown's Revival Blessing, as an item.
    target.fainted = false;
    target.faintQueued = false;
    target.subFainted = false;
    target.status = "" as never;
    target.hp = 1;
    target.sethp(Math.max(amount, 1));
    target.side.pokemonLeft++;
    battle.add("-heal", target, target.getHealth, `[from] item: ${item}`);
    return;
  }
  if (amount && target.hp < target.maxhp) {
    target.sethp(target.hp + Math.max(1, Math.min(amount, target.maxhp - target.hp)));
    battle.add("-heal", target, target.getHealth, `[from] item: ${item}`);
  }
  if (target.status && cures(e).includes(target.status)) target.cureStatus();
  if (target.isActive && e.confusion && target.volatiles.confusion) target.removeVolatile("confusion");
  if (target.isActive && e.infatuation && target.volatiles.attract) target.removeVolatile("attract");
  for (const slot of e.pp || e.ppMax ? ppSlots(target, e, moveSlot) : []) slot.pp = e.ppMax ? slot.maxpp : Math.min(slot.maxpp, slot.pp + e.pp);
}

/** POKé DOLL, FLUFFY TAIL: RUN from the bag (wild.ts). */
export const isEscapeItem = (item: number) => INFOS.get(item)?.battleUse === BattleUse.ESCAPE;

/** Whether using it now does something: the player's choice is refused otherwise. */
export function bagItemWorks(user: Pokemon, action: ItemAction): boolean {
  const item = INFOS.get(action.item);
  if (item?.battleUse === BattleUse.BALL) return true;
  const effect = itemEffect(action.item);
  if (effect) return effectWorks(effect, pokemonAt(user.battle, user.side.n, action.partySlot), action.moveSlot);
  const stat = X_STATS[action.item as Item];
  if (stat) return user.boosts[stat] < 6;
  if (action.item === Item.DIRE_HIT) return !user.volatiles.focusenergy;
  if (action.item === Item.GUARD_SPEC) return !user.side.sideConditions.mist;
  // BattleUseFunc_PokeFlute: always played; with nobody asleep, it's a catchy tune.
  if (action.item === Item.POKE_FLUTE) return true;
  return false;
}

/** BattleUseFunc_StatBooster's check: X items, Dire Hit and Guard Spec. that would do nothing for this Pokémon now. */
export function selfItemsWithNoEffect(user: Pokemon): number[] {
  return [...INFOS].filter(([item, info]) => info?.battleUse === BattleUse.SELF && !bagItemWorks(user, { item } as ItemAction)).map(([item]) => item);
}

/** VARIOUS_CHECK_POKEFLUTE: everyone asleep in both parties, active or not, except with Soundproof. */
function hearingFlute(battle: Battle): Pokemon[] {
  return battle.sides.flatMap((side) => side.pokemon).filter((mon) => mon.status === "slp" && mon.ability !== "soundproof");
}

function useOnSelf(battle: Battle, user: Pokemon, item: number): void {
  const stat = X_STATS[item as Item];
  if (stat) battle.boost({ [stat]: 1 }, user, user, null, false, true);
  // FireRed's Dire Hit is Focus Energy's effect; Guard Spec. is Mist for 5 turns.
  // Its source effect is explicit: outside an event it would be the format, which saving the battle can't serialize.
  else if (item === Item.DIRE_HIT) user.addVolatile("focusenergy", user, battle.dex.conditions.get("focusenergy"));
  else if (item === Item.GUARD_SPEC) user.side.addSideCondition("mist", user);
  else if (item === Item.POKE_FLUTE) for (const mon of hearingFlute(battle)) mon.cureStatus();
}

/** Queues the item for the user's side (instead of a move or switch). False: not usable in battle. */
export function chooseBagItem(user: Pokemon, action: ItemAction): boolean {
  if (!INFOS.get(action.item)?.battleUse) return false;
  const use: Pending = { item: action.item, partySlot: action.partySlot, moveSlot: action.moveSlot };
  user.m.bagItem = use;
  user.side.choice.actions.push({ choice: "event", event: "BagItem", pokemon: user, order: ORDER, priority: 0 } as never);
  return true;
}

/** Runs on every created or restored battle: listeners aren't part of the saved state. */
export function registerBagItems(battle: Battle): void {
  battle.onEvent("BagItem", battle.format, (user: Pokemon) => {
    const use = user.m.bagItem as Pending | undefined;
    if (!use) return;
    delete user.m.bagItem;
    const target = pokemonAt(battle, user.side.n, use.partySlot);
    // Our own line (protocol/events.ts): `|bagitem|p2|<item number>|<target>|awoke`.
    battle.add("bagitem", sideId(user.side.n), String(use.item), target, use.item === Item.POKE_FLUTE && hearingFlute(battle).length ? "awoke" : "");
    const effect = itemEffect(use.item);
    if (effect) applyEffect(battle, use.item, effect, target, use.moveSlot);
    else useOnSelf(battle, user, use.item);
  });
}
