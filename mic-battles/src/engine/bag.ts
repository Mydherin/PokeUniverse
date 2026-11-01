// Bag items in battle (plans/battles D12). Showdown has no bag: an item is a queued `event`
// action (order 102: after Showdown's own start-of-turn actions, before switches and moves, as in
// Gen 4) that runs the BagItem event, answered here. mic-core has already checked and spent it.

import type { Battle } from "@pkmn/sim";
import type { ItemAction } from "@pokeuniverse/contracts/battle/v1/view";
import { pokemonAt, type Pokemon } from "./battle.ts";

const ORDER = 102;

/** The item waiting on its user's turn, kept in the Pokémon's mod data (saved with the battle). */
type Pending = { item: number; partySlot: number; moveSlot: number };

/** What a bag item does to its target. Filled in M12. */
type BagEffect = (battle: Battle, user: Pokemon, target: Pokemon, use: Pending) => void;
const EFFECTS = new Map<number, BagEffect>();

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
    EFFECTS.get(use.item)?.(battle, user, target, use);
  });
}
