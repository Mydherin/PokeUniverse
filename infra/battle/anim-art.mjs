// Run once to write which art each battle animation tag and move background uses; the table is our
// source from then on, edited by hand like the scripts (phase-5 D9). Kept for reference.
//
// node infra/battle/anim-art.mjs references/pokefirered references/pokeemerald-expansion \
//   spa-pokeuniverse/src/game/firered/battle/anims/art.json
//
// Reads gBattleAnimPicTable/gBattleAnimPaletteTable (FireRed) and gBattleAnimTable (the expansion's
// BATTLE_ANIMATION entries), gBattleAnimBackgroundTable (both), and the files each symbol names in
// src/graphics.c. FireRed's art wins for a tag or symbol both games have (Gen 3 look); the
// expansion's config choices (`B_NEW_X == TRUE ? new : old`) take the old art. Paths are relative
// to public/firered/graphics/ (`make graphics`: the expansion's art under expansion/). Writes
// { tags: {ANIM_TAG_*: {png (or the pictures its sheet joins), pal}}, backgrounds: {firered: [{png, pal, bin}], expansion: [...]} },
// backgrounds by BG_* number (each game's scripts use its own numbers).

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [firered, expansion, out] = process.argv.slice(2);
const read = (f) => readFileSync(f, "utf8");

/** Each symbol's file in a game's src/graphics.c: { sym: "battle_anims/sprites/x.png" }, relative to graphics/. */
function symbols(repo, prefix) {
  const files = new Map();
  const text = read(join(repo, "src/graphics.c"));
  // FireRed: INCBIN_U32("graphics/x.4bpp.lz"); the expansion: INCGFX_U32("graphics/x.png", ".4bpp.smol").
  for (const [, sym, path, ext] of text.matchAll(/(\w+)\[\]\s*=\s*INC(?:BIN|GFX)_U(?:8|16|32)\("graphics\/([^"]+?)(\.4bpp|\.gbapal|\.bin|\.png|\.pal)?(?:\.lz|\.smol)?"/g)) {
    let file = path;
    if (ext === ".4bpp") file += ".png";
    else if (ext === ".bin") file += ".bin";
    else if (ext === ".gbapal") file += existsSync(join(repo, "graphics", `${path}.pal`)) ? ".pal" : ".png";
    else if (ext) file += ext;
    files.set(sym, prefix + file);
  }
  return files;
}

/** Sheets built from several pictures (graphics_file_rules.mk: `x.4bpp: x_0.4bpp x_1.4bpp` + cat), relative to graphics/. */
function joined(repo) {
  const rules = new Map();
  const text = read(join(repo, "graphics_file_rules.mk")).replace(/\\\n/g, " ");
  for (const [, out, ins] of text.matchAll(/^\$\(BTLANMSPRGFXDIR\)\/(\w+)\.4bpp:([^\n%]*)$/gm)) {
    const parts = [...ins.matchAll(/\$\(BTLANMSPRGFXDIR\)\/(\w+)\.4bpp/g)].map(([, n]) => `battle_anims/sprites/${n}.png`);
    if (parts.length) rules.set(`battle_anims/sprites/${out}.png`, parts);
  }
  return rules;
}

const frFiles = symbols(firered, "");
const exFiles = symbols(expansion, "expansion/");
const frJoined = joined(firered);
const exJoined = joined(expansion);
/** A symbol's file (or the pictures its sheet joins): FireRed's when it has one. */
const file = (sym) => {
  const f = frFiles.get(sym) ?? exFiles.get(sym);
  if (!f) throw new Error(`no file for ${sym}`);
  const parts = f.startsWith("expansion/") ? exJoined.get(f.slice(10))?.map((p) => `expansion/${p}`) : frJoined.get(f);
  return parts ?? f;
};
/** `COND == TRUE ? a : b` → b. */
const old = (expr) => expr.trim().replace(/^.*\?\s*\w+\s*:\s*/, "");

const tags = {};
// FireRed: the pic and palette tables, read by the same index (GET_TRUE_SPRITE_INDEX).
const frAnim = read(join(firered, "src/data/battle_anim.h"));
const table = (name) => frAnim.slice(frAnim.indexOf(name), frAnim.indexOf("};", frAnim.indexOf(name)));
const pals = [...table("gBattleAnimPaletteTable[]").matchAll(/\{\s*(\w+),\s*ANIM_TAG_\w+\s*\}/g)].map(([, pal]) => pal);
[...table("gBattleAnimPicTable[]").matchAll(/\{\s*(\w+),\s*\w+,\s*(ANIM_TAG_\w+)\s*\}/g)].forEach(([, gfx, tag], i) => (tags[tag] = { png: file(gfx), pal: file(pals[i]) }));
// The expansion: the tags FireRed doesn't have.
const exAnim = read(join(expansion, "src/data/battle_anim.h"));
for (const [, tag, gfx, pal] of exAnim.matchAll(/^\s*BATTLE_ANIMATION\((ANIM_TAG_\w+),\s*([^,]+),\s*[^,]+,\s*([^)]+)\)/gm))
  if (!tags[tag] && gfx !== "NULL") tags[tag] = { png: file(old(gfx)), pal: file(old(pal)) };

/** A game's move backgrounds by BG_* number (include/constants/battle_anim.h). */
function backgrounds(repo, text) {
  const numbers = new Map([...read(join(repo, "include/constants/battle_anim.h")).matchAll(/^#define (BG_\w+) (\d+)/gm)].map(([, n, v]) => [n, Number(v)]));
  const start = text.indexOf("gBattleAnimBackgroundTable[]");
  const list = [];
  for (const [, bg, image, palette, tilemap] of text.slice(start, text.indexOf("};", start)).matchAll(/\[(BG_\w+)\]\s*=\s*\{\s*(\w+),\s*(\w+),\s*(\w+)\s*\}/g)) {
    if (!numbers.has(bg)) throw new Error(`no number for ${bg}`);
    list[numbers.get(bg)] = { png: file(image), pal: file(palette), bin: file(tilemap) };
  }
  return list;
}

const art = { tags, backgrounds: { firered: backgrounds(firered, frAnim), expansion: backgrounds(expansion, exAnim) } };
const line = (v) => JSON.stringify(v);
const tagLines = Object.entries(art.tags).map(([t, v]) => `    ${line(t)}: ${line(v)}`);
const bgLines = (list) => [...list].map((v) => `      ${line(v ?? null)}`).join(",\n");
writeFileSync(
  out,
  `{\n  "tags": {\n${tagLines.join(",\n")}\n  },\n  "backgrounds": {\n    "firered": [\n${bgLines(art.backgrounds.firered)}\n    ],\n    "expansion": [\n${bgLines(art.backgrounds.expansion)}\n    ]\n  }\n}\n`,
);
console.log(`${Object.keys(tags).length} tags, ${art.backgrounds.firered.length} + ${art.backgrounds.expansion.length} backgrounds`);
