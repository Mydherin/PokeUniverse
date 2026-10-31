// The sprites the item lists share (item_menu_icons.c): the selected item's icon at the bottom
// left, and the line showing where an item moved with SELECT goes. The BAG and the PC's
// WITHDRAW ITEM screen use them.

import type { Item } from "@pokeuniverse/contracts/item/v1/catalog";
import type { Sprite, SpriteTemplate } from "../gba/sprites";
import { iconTiles } from "./common";
import type { Flow } from "./flow";
import type { ItemIcon } from "./manifest";

const ITEM_ICON_TEMPLATE: SpriteTemplate = { sheet: "itemIcon", palette: "itemIcon", width: 32, height: 32, priority: 1 };
/** The line showing where a moved item goes: 9 sprites, its two ends and the middle. */
const SWAP_LINE_SPRITES = 9;
const SWAP_LINE_TEMPLATE: SpriteTemplate = {
  sheet: "swapLine",
  palette: "swapLine",
  width: 16,
  height: 16,
  priority: 1,
  anims: [[{ image: 0, duration: 0 }, "end"], [{ image: 4, duration: 0 }, "end"], [{ image: 0, duration: 0, hFlip: true }, "end"]],
};

export class ItemMenuIcons {
  private icon: Sprite | null = null;
  /** Bumped by every icon change: an icon that loads late for an older item is dropped. */
  private iconRequest = 0;
  private readonly swapLine: Sprite[] = [];

  constructor(private readonly flow: Flow) {}

  /** DestroyItemMenuIcon then CreateItemMenuIcon for an item (null: the return arrow); an item's icon shows once loaded. */
  showIcon(item: Item | null): void {
    this.destroyIcon();
    const request = this.iconRequest;
    if (item === null) return this.createIcon(this.flow.assets.get("itemIconReturn"));
    void this.flow.assets.itemIcon(item).then(
      (icon) => request === this.iconRequest && this.createIcon(icon),
      () => {},
    );
  }

  destroyIcon(): void {
    const { gba } = this.flow;
    this.iconRequest++;
    gba.sprites.destroy(this.icon);
    gba.sprites.freeSheet("itemIcon");
    gba.palettes.freeSpritePalette("itemIcon");
    this.icon = null;
  }

  /** The 24×24 icon in a 32×32 sprite, its top left at (8, 124). */
  private createIcon(icon: ItemIcon): void {
    const { gba } = this.flow;
    gba.sprites.loadSheet("itemIcon", iconTiles(icon.image!));
    gba.palettes.loadSpritePalette("itemIcon", icon.palette);
    this.icon = gba.sprites.create(ITEM_ICON_TEMPLATE, 0, 0, 0);
    if (this.icon) {
      this.icon.x2 = 24;
      this.icon.y2 = 140;
    }
  }

  /** CreateSwapLine: 9 sprites across the list, hidden until an item moves. */
  createSwapLine(): void {
    const { gba, assets } = this.flow;
    gba.sprites.loadSheet("swapLine", assets.get("bagSwapLine").tiles);
    gba.palettes.loadSpritePalette("swapLine", assets.get("bagSwapLine").palette);
    for (let i = 0; i < SWAP_LINE_SPRITES; i++) {
      const s = gba.sprites.create(SWAP_LINE_TEMPLATE, i * 16 + 96, 7, 0);
      if (!s) continue;
      s.startAnim(i === 0 ? 0 : i === SWAP_LINE_SPRITES - 1 ? 2 : 1);
      s.invisible = true;
      this.swapLine.push(s);
    }
  }

  /** UpdateSwapLinePos: shifted by `x`, on the list's row at `y`. */
  updateSwapLine(x: number, y: number): void {
    for (const s of this.swapLine) {
      s.x2 = x;
      s.y = y + 7;
    }
  }

  setSwapLineVisible(visible: boolean): void {
    for (const s of this.swapLine) s.invisible = !visible;
  }
}
