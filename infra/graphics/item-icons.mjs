// Writes which icon and palette each FireRed item shows (src/data/item_icon_table.h, with the
// files from src/data/graphics/items.h), read from the decompilation at build time like the
// fonts' widths, so nothing of the game is committed (docs/tech-stack.md#firered-as-reference).
// Run by `make graphics`: node item-icons.mjs <pokefirered> <out file>.
// Output: { "<item ID>": ["items/icons/<icon>.png", "items/icon_palettes/<palette>.pal"] }; "0" is
// the question mark shown for an item without an icon.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [src, out] = process.argv.slice(2);
const read = (f) => readFileSync(join(src, f), "utf8");

const ids = new Map([...read("include/constants/items.h").matchAll(/#define (ITEM_\w+) (\d+)\n/g)].map((m) => [m[1], Number(m[2])]));
// const u32 gItemIcon_X[] = INCBIN_U32("graphics/items/icons/x.4bpp.lz");
const files = new Map(
  [...read("src/data/graphics/items.h").matchAll(/(gItemIcon\w+)\[\]\s*=\s*INCBIN_U32\("graphics\/(items\/[\w/]+)\.(4bpp|gbapal)\.lz"\)/g)].map((m) => [
    m[1],
    `${m[2]}.${m[3] === "4bpp" ? "png" : "pal"}`,
  ]),
);
const icons = {};
for (const m of read("src/data/item_icon_table.h").matchAll(/\[(ITEM_\w+)\]\s*=\s*\{(\w+),\s*(\w+)\}/g)) {
  const id = ids.get(m[1]);
  const [icon, pal] = [files.get(m[2]), files.get(m[3])];
  if (id === undefined || !icon || !pal) throw new Error(`item icon ${m[1]}: unknown ${icon ? m[3] : m[2]}`);
  icons[id] = [icon, pal];
}
writeFileSync(out, JSON.stringify(icons));
console.log(`item icons: ${Object.keys(icons).length}`);
