// The trainer's items, the same for every art style: each item's rules from the catalog in
// lib-contracts, and the bag and the PC as mic-core last said, where the player's own moves and
// registrations show at once (mic-core checks them and corrects a refused one).

import { getOption } from "@bufbuild/protobuf";
import type { Bag, BagChanged, BagSlot as BagSlotMessage } from "@pokeuniverse/contracts/item/v1/bag";
import { info, Item, ItemSchema, Pocket, type ItemInfo } from "@pokeuniverse/contracts/item/v1/catalog";
import type { Pokemon } from "@pokeuniverse/contracts/party/v1/party";

const INFOS = new Map<Item, ItemInfo>(ItemSchema.values.filter((v) => v.number !== Item.UNSPECIFIED).map((v) => [v.number as Item, getOption(v, info)]));

/** The item's rules; undefined for an ID that isn't an item. */
export function itemInfo(item: Item): ItemInfo | undefined {
  return INFOS.get(item);
}

/** Whether using the item on this Pokémon changes something ("It won't have any effect" otherwise). Confusion and love aren't known here: mic-battles has the last word. */
export function itemWorksOn(item: Item, mon: Pokemon, inBattle: boolean, moveSlot?: number): boolean {
  const e = itemInfo(item)?.effect;
  if (!e) return false;
  const max = mon.stats?.hp ?? 0;
  if (e.revive) return mon.hp === 0;
  if (mon.hp === 0) return false;
  if ((e.hp || e.hpPercent) && mon.hp < max) return true;
  if (e.cures.includes(mon.status)) return true;
  if (inBattle && (e.confusion || e.infatuation)) return true;
  if (!e.pp && !e.ppMax) return false;
  return mon.moves.some((m, i) => (moveSlot === undefined || i === moveSlot) && m.pp < m.maxPp);
}

export interface BagSlot {
  item: Item;
  quantity: number;
}

export class BagState {
  private readonly pockets = new Map<Pocket, BagSlot[]>();
  /** SELECT's item; UNSPECIFIED: none. */
  registered: Item = Item.UNSPECIFIED;

  constructor(bag?: Bag) {
    if (bag) this.apply(bag);
  }

  /** A pocket's slots in order. */
  pocket(p: Pocket): readonly BagSlot[] {
    return this.pockets.get(p) ?? [];
  }

  /** What mic-core says: the whole bag, or the pockets that changed. */
  apply(change: Bag | BagChanged): void {
    for (const p of change.pockets) this.pockets.set(p.pocket, p.slots.map((s) => ({ item: s.item, quantity: s.quantity })));
    this.registered = change.registered;
  }

  /** MoveItemSlotInList within a pocket. False if nothing moves. */
  move(p: Pocket, from: number, to: number): boolean {
    const slots = this.pockets.get(p);
    return !!slots && moveSlot(slots, from, to);
  }

  /** REGISTER or DESELECT: the item becomes SELECT's, or none when it already was. */
  toggleRegistered(item: Item): void {
    this.registered = this.registered === item ? Item.UNSPECIFIED : item;
  }
}

/** What the player's PC stores, in order. */
export class StoredItems {
  private list: BagSlot[] = [];

  constructor(slots: readonly BagSlotMessage[]) {
    this.apply(slots);
  }

  get slots(): readonly BagSlot[] {
    return this.list;
  }

  /** What mic-core says the PC stores. */
  apply(slots: readonly BagSlotMessage[]): void {
    this.list = slots.map((s) => ({ item: s.item, quantity: s.quantity }));
  }

  /** MoveItemSlotInList. False if nothing moves. */
  move(from: number, to: number): boolean {
    return moveSlot(this.list, from, to);
  }
}

/** MoveItemSlotInList: slot `from` before slot `to` (`to` can be the count: last). False if nothing moves. */
function moveSlot(slots: BagSlot[], from: number, to: number): boolean {
  if (from < 0 || from >= slots.length || to < 0 || to > slots.length || to === from || to === from + 1) return false;
  const [slot] = slots.splice(from, 1);
  slots.splice(to > from ? to - 1 : to, 0, slot);
  return true;
}
