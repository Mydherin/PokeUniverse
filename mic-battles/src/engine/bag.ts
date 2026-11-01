// Bag items in battle (plans/battles D12). Showdown has no bag: an item is a queued `event`
// action (order 102: after Showdown's own start-of-turn actions, before switches and moves, as in
// Gen 4) that runs the BagItem event, answered here. mic-core has already checked and spent a
// player's item; an AI trainer's come from its BattleTeam.items (ai/items.ts).

import type { Battle } from "@pkmn/sim";
import type { ItemAction } from "@pokeuniverse/contracts/battle/v1/view";
import { Item } from "@pokeuniverse/contracts/item/v1/catalog";
import { pokemonAt, sideId, type Pokemon } from "./battle.ts";

const ORDER = 102;

/** The item waiting on its user's turn, kept in the Pokémon's mod data (saved with the battle). */
type Pending = { item: number; partySlot: number; moveSlot: number };

/** What a bag item does to its target. M5 has the AI trainers' items; M12 adds the rest. */
type BagEffect = (battle: Battle, user: Pokemon, target: Pokemon, use: Pending) => void;

/** Gen 4 amounts. */
export const HEAL_HP: Partial<Record<Item, number>> = {
  [Item.POTION]: 20,
  [Item.SUPER_POTION]: 50,
  [Item.HYPER_POTION]: 200,
  [Item.MAX_POTION]: Infinity,
  [Item.FULL_RESTORE]: Infinity,
};

/** The statuses each cure heals ("" for confusion). */
export const CURES: Partial<Record<Item, string[]>> = {
  [Item.ANTIDOTE]: ["psn", "tox"],
  [Item.BURN_HEAL]: ["brn"],
  [Item.ICE_HEAL]: ["frz"],
  [Item.AWAKENING]: ["slp"],
  [Item.PARALYZE_HEAL]: ["par"],
  [Item.FULL_HEAL]: ["psn", "tox", "brn", "frz", "slp", "par", ""],
  [Item.FULL_RESTORE]: ["psn", "tox", "brn", "frz", "slp", "par", ""],
};

/** X items: +1 stage in Gen 4 (X Special is Sp. Atk). */
export const X_STATS: Partial<Record<Item, "atk" | "def" | "spe" | "spa" | "accuracy">> = {
  [Item.X_ATTACK]: "atk",
  [Item.X_DEFEND]: "def",
  [Item.X_SPEED]: "spe",
  [Item.X_SPECIAL]: "spa",
  [Item.X_ACCURACY]: "accuracy",
};

const EFFECTS = new Map<number, BagEffect>();
for (const item of new Set([...Object.keys(HEAL_HP), ...Object.keys(CURES)].map(Number))) {
  EFFECTS.set(item, (battle, _user, target, use) => {
    const amount = HEAL_HP[use.item as Item];
    if (amount && target.hp < target.maxhp) {
      target.sethp(target.hp + Math.min(amount, target.maxhp - target.hp));
      battle.add("-heal", target, target.getHealth, `[from] item: ${use.item}`);
    }
    const cures = CURES[use.item as Item] ?? [];
    if (target.status && cures.includes(target.status)) target.cureStatus();
    if (cures.includes("") && target.isActive && target.volatiles.confusion) target.removeVolatile("confusion");
  });
}
for (const [item, stat] of Object.entries(X_STATS)) {
  EFFECTS.set(Number(item), (battle, user) => void battle.boost({ [stat]: 1 }, user, user, null, false, true));
}
// FireRed's Dire Hit is Focus Energy's effect; Guard Spec. is Mist for 5 turns.
EFFECTS.set(Item.DIRE_HIT, (_battle, user) => void user.addVolatile("focusenergy"));
EFFECTS.set(Item.GUARD_SPEC, (_battle, user) => void user.side.addSideCondition("mist", user));

/** Whether this bag item does something in battle. */
export const usableInBattle = (item: number) => EFFECTS.has(item);

/** Queues the item for the user's side (instead of a move or switch). False: not usable in battle. */
export function chooseBagItem(user: Pokemon, action: ItemAction): boolean {
  if (!EFFECTS.has(action.item)) return false;
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
    // Our own line (protocol/events.ts): `|bagitem|p2|<item number>|<target>`.
    battle.add("bagitem", sideId(user.side.n), String(use.item), target);
    EFFECTS.get(use.item)?.(battle, user, target, use);
  });
}
