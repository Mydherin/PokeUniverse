// The menu info icons (list_menu.c's BlitMenuInfoIcon on interface/menu_info.png): each type's
// icon and the move info labels, drawn into a window in its palette (pokemon_types.pal).

import type { Window } from "../gba/text";
import type { Flow } from "./flow";

/** An icon: its first tile in menu_info's 16-tile-wide sheet, and its size in pixels. */
export interface MenuInfoIcon {
  tile: number;
  width: number;
  height: number;
}

/** Each type's icon tile by the catalog's Type (FireRed's TYPE_ number + 1); 0 the caught ball's. */
const TYPE_TILES = [0, 0x20, 0x64, 0x60, 0x80, 0x48, 0x44, 0x6c, 0x68, 0x88, 0xa4, 0x24, 0x28, 0x2c, 0x40, 0x84, 0x4c, 0xa0, 0x8c];

/** The caught Poké Ball of the Pokédex's lists. */
export const MENU_INFO_CAUGHT: MenuInfoIcon = { tile: 0, width: 12, height: 12 };

/** A type's icon (the catalog's Type); NORMAL's for a number past the types. */
export function typeIcon(type: number): MenuInfoIcon {
  return { tile: TYPE_TILES[type] ?? TYPE_TILES[1], width: 32, height: 12 };
}

/** BlitMenuInfoIcon. */
export function blitMenuInfoIcon(flow: Flow, win: Window, icon: MenuInfoIcon, x: number, y: number): void {
  win.blitRect(flow.assets.get("menuInfo").image!, (icon.tile % 16) * 8, (icon.tile >> 4) * 8, x, y, icon.width, icon.height);
}
