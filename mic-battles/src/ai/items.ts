// FireRed's trainer items (ShouldUseItem in src/battle_ai_switch_items.c): up to 4, each used
// once. Items after the first wait until the trainer is down to its last Pokémon or so.

import { Item } from "@pokeuniverse/contracts/item/v1/catalog";
import { CURES, HEAL_HP, X_STATS } from "../engine/bag.ts";
import type { AiView } from "./view.ts";

/** The item to use now (spent from `items`), or 0. `count` is how many the trainer started with. */
export function itemToUse(v: AiView, items: number[], count: number): number {
  const u = v.user;
  const alive = u.side.pokemon.filter((p) => !p.fainted).length;
  for (let i = 0; i < items.length; i++) {
    if (i && alive > count - i + 1) continue;
    const item = items[i];
    if (!item) continue;
    const use = shouldUse(v, item);
    if (use === undefined) return 0;
    if (use) {
      items[i] = 0;
      return item;
    }
  }
  return 0;
}

/** Undefined: an item the AI doesn't know, which stops it looking further (as in FireRed). */
function shouldUse(v: AiView, item: number): boolean | undefined {
  const u = v.user;
  if (item === Item.FULL_RESTORE) return u.hp > 0 && u.hp < u.maxhp / 4;
  const heal = HEAL_HP[item as Item];
  if (heal) return u.hp > 0 && (u.hp < u.maxhp / 4 || u.maxhp - u.hp > heal);
  const cures = CURES[item as Item];
  if (cures) return (!!u.status && cures.includes(u.status)) || (cures.includes("") && v.volatile(u, "confusion"));
  const stat = X_STATS[item as Item];
  if (stat) return v.firstTurn(u) && v.stage(u, stat) < 12;
  if (item === Item.DIRE_HIT) return v.firstTurn(u) && !v.volatile(u, "focusenergy");
  if (item === Item.GUARD_SPEC) return v.firstTurn(u) && !v.sideHas(u, "mist");
  return undefined;
}
