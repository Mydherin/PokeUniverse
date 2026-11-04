// Reads every species up to Gen 4 from the two read-only references: FireRed (1-386, its own
// data, text and art) and pokeemerald-expansion (387-493: Gen 3-style art and Gen 4 data).
// Shared by catalog.mjs (run once: the committed species catalog) and build.mjs (`make pokemon`:
// the art, text and cries, gitignored). Nothing here is copied code: it parses the C sources as data.
//
// readSpecies(firered, expansion) -> Map<national number, Species>, where Species is
// { nat, constant (NATIONAL_DEX_ suffix), name, category, description, types: [t1, t2], height, weight, scale: [pokemonScale,
//   pokemonOffset, trainerScale, trainerOffset], front, palette, back, shinyPalette, footprint, icon, iconPalette,
//   coords: { front: y offset, back: y offset, elevation } (where the battle draws its pictures),
//   itemScene: FireRed's only (sMonPosAttributes): [machine x, machine y, y offset, item x, item y],
//   noFlip (the summary shows its picture unmirrored), battle: { catchRate, expYield, evYield: [hp, atk, def, spe, spa, spd], growthRate (GROWTH_ name), genderRatio (0-255), friendship },
//   cry: { firered: number } | { wav: path }, source: "firered" | "expansion" }.
// Text is plain (FireRed's escapes such as \n kept); paths are relative to their reference.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const NATIONAL_DEX_COUNT = 493;
export const FIRERED_DEX_COUNT = 386;
export const KANTO_DEX_COUNT = 151;

const literals = (s) => [...s.matchAll(/"((?:\\.|[^"\\])*)"/g)].map((m) => m[1].replace(/\\"/g, '"')).join("");

/** NATIONAL_DEX_X -> number, from the enum in include/constants/pokedex.h. */
function nationalNumbers(root) {
  const text = readFileSync(join(root, "include/constants/pokedex.h"), "utf8");
  const body = /enum\s*\w*\s*\{([\s\S]*?)\};/.exec(text)[1];
  const numbers = new Map();
  for (const m of body.matchAll(/^\s*(NATIONAL_DEX_\w+)\s*,/gm)) if (!numbers.has(m[1])) numbers.set(m[1], numbers.size);
  return numbers;
}

const EV_FIELDS = ["HP", "Attack", "Defense", "Speed", "SpAttack", "SpDefense"];

/** A numeric field as a Gen 4 game would set it: plain, a conditional on the config, or a macro below. */
function numberField(block, name, fallback) {
  const raw = new RegExp(`\\.${name}\\s*=\\s*([^,\\n]+)`).exec(block)?.[1].trim();
  if (raw === undefined) {
    if (fallback === undefined) throw new Error(`no .${name}`);
    return fallback;
  }
  const female = /^PERCENT_FEMALE\(([\d.]+)\)$/.exec(raw);
  if (female) return Math.min(254, Math.floor((Number(female[1]) * 255) / 100));
  const named = { MON_MALE: 0, MON_FEMALE: 0xfe, MON_GENDERLESS: 0xff, STANDARD_FRIENDSHIP: 70 }[raw];
  if (named !== undefined) return named;
  return Number(evalExpression(raw));
}

/** What the battle needs of a species block (species_info.h in both references). */
function battleFacts(block) {
  return {
    catchRate: numberField(block, "catchRate"),
    expYield: numberField(block, "expYield"),
    evYield: EV_FIELDS.map((f) => numberField(block, `evYield_${f}`, 0)),
    growthRate: /\.growthRate\s*=\s*(GROWTH_\w+)/.exec(block)[1],
    genderRatio: numberField(block, "genderRatio"),
    friendship: numberField(block, "friendship"),
  };
}

// FireRed

function readFireRed(src) {
  const read = (f) => readFileSync(join(src, f), "utf8");
  const nat = nationalNumbers(src);
  const speciesIds = new Map([...read("include/constants/species.h").matchAll(/#define (SPECIES_\w+) (\d+)/g)].map((m) => [m[1], Number(m[2])]));
  const names = new Map([...read("src/data/text/species_names.h").matchAll(/\[(SPECIES_\w+)\]\s*=\s*_\("((?:\\.|[^"\\])*)"\)/g)].map((m) => [m[1], m[2]]));
  // Revision 0, the original release (the decompilation's default build); #if REVISION picks the text.
  const texts = new Map([...preprocess(read("src/data/pokemon/pokedex_text_fr.h"), new Map()).matchAll(/(\w+)\[\]\s*=\s*_\(((?:\s*"(?:\\.|[^"\\])*")+)\s*\)/g)].map((m) => [m[1], literals(m[2])]));
  const blocks = (file) => new Map(speciesBlocks(read(file), /\[(\w+)\]\s*=\s*\{/g));
  const field = (block, name) => new RegExp(`\\.${name}\\s*=\\s*([^,\\n]+)`).exec(block)?.[1].trim();
  const entries = blocks("src/data/pokemon/pokedex_entries.h");
  const info = blocks("src/data/pokemon/species_info.h");
  // Graphics: symbol -> file (src/data/graphics/pokemon.h), and the tables by species.
  // The first definition wins: FireRed's, before LeafGreen's #else (Deoxys).
  const files = new Map();
  for (const m of read("src/data/graphics/pokemon.h").matchAll(/(gMon\w+)\[\]\s*=\s*INCBIN_U\d+\(\s*"graphics\/([\w/]+)\.(\w+)(?:\.lz)?"/g))
    if (!files.has(m[1])) files.set(m[1], `graphics/${m[2]}.${m[3] === "gbapal" ? "pal" : "png"}`);
  const table = (file, re) => new Map([...read(file).matchAll(re)].map((m) => [`SPECIES_${m[1]}`, m[2]]));
  const fronts = table("src/data/pokemon_graphics/front_pic_table.h", /SPECIES_SPRITE\((\w+),\s*(\w+)\)/g);
  const backs = table("src/data/pokemon_graphics/back_pic_table.h", /SPECIES_SPRITE\((\w+),\s*(\w+)\)/g);
  const palettes = table("src/data/pokemon_graphics/palette_table.h", /SPECIES_PAL\((\w+),\s*(\w+)\)/g);
  const shinyPalettes = table("src/data/pokemon_graphics/shiny_palette_table.h", /SPECIES_SHINY_PAL\((\w+),\s*(\w+)\)/g);
  const yOffsets = (file) => new Map(speciesBlocks(read(file)).map(([k, b]) => [k, Number(/\.y_offset\s*=\s*(\d+)/.exec(b)[1])]));
  const frontY = yOffsets("src/data/pokemon_graphics/front_pic_coordinates.h");
  const backY = yOffsets("src/data/pokemon_graphics/back_pic_coordinates.h");
  const itemScene = new Map([...read("src/menu2.c").matchAll(/\[(SPECIES_\w+)\s*-\s*1\]\s*=\s*\{\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\s*\}/g)].map((m) => [m[1], m.slice(2).map(Number)]));
  const elevation = new Map([...read("src/data/pokemon_graphics/enemy_mon_elevation.h").matchAll(/\[(SPECIES_\w+)\]\s*=\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]));
  const footprints = table("src/data/pokemon_graphics/footprint_table.h", /\[SPECIES_(\w+)\]\s*=\s*(\w+)/g);
  const icon = read("src/pokemon_icon.c");
  const icons = table("src/pokemon_icon.c", /\[SPECIES_(\w+)\]\s*=\s*(gMonIcon_\w+)/g);
  const iconPals = new Map([.../gMonIconPaletteIndices\[\]\s*=\s*\{([\s\S]*?)\};/.exec(icon)[1].matchAll(/\[(SPECIES_\w+)\]\s*=\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]));
  // Cries: SpeciesToCryId(species - 1): the species before the old Unown letters, else the Hoenn table.
  const cryIds = new Map([...read("include/constants/hoenn_cries.h").matchAll(/(CRY_\w+)\s*=\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]));
  const hoennCries = new Map([...read("src/data/pokemon/cry_ids.h").matchAll(/\[(SPECIES_\w+)\s*-\s*HOENN_MON_SPECIES_START\]\s*=\s*(CRY_\w+)/g)].map((m) => [m[1], cryIds.get(m[2])]));

  const out = new Map();
  for (const [natName, n] of nat) {
    if (n === 0 || n > FIRERED_DEX_COUNT) continue;
    const key = natName.replace("NATIONAL_DEX_", "SPECIES_");
    const id = speciesIds.get(key);
    const entry = entries.get(natName);
    const si = info.get(key);
    if (id === undefined || !entry || !si || !names.has(key)) throw new Error(`FireRed ${key}: missing data`);
    const types = /\.types\s*=\s*\{\s*(TYPE_\w+)\s*,\s*(TYPE_\w+)\s*\}/.exec(si);
    const path = (map, what) => {
      const file = files.get(map.get(key));
      if (!file) throw new Error(`FireRed ${key}: no ${what}`);
      return file;
    };
    // Castform's pic is built from its four forms; the Pokédex shows the normal one.
    const formDir = (p) => (key === "SPECIES_CASTFORM" ? p.replace("castform/", "castform/normal/") : p);
    out.set(n, {
      nat: n,
      constant: natName.replace("NATIONAL_DEX_", ""),
      name: names.get(key),
      category: literals(field(entry, "categoryName")),
      description: texts.get(field(entry, "description")),
      types: [types[1], types[2]],
      height: Number(field(entry, "height")),
      weight: Number(field(entry, "weight")),
      scale: ["pokemonScale", "pokemonOffset", "trainerScale", "trainerOffset"].map((f) => Number(field(entry, f))),
      front: formDir(path(fronts, "front pic")),
      palette: formDir(path(palettes, "palette")),
      back: formDir(path(backs, "back pic")),
      shinyPalette: formDir(path(shinyPalettes, "shiny palette")),
      coords: { front: frontY.get(key), back: backY.get(key), elevation: elevation.get(key) ?? 0 },
      itemScene: itemScene.get(key),
      noFlip: /\.noFlip\s*=\s*TRUE/.test(si),
      battle: battleFacts(si),
      footprint: path(footprints, "footprint"),
      icon: path(icons, "icon"),
      iconPalette: `graphics/pokemon/icon_palettes/icon_palette_${iconPals.get(key)}.pal`,
      cry: { firered: id < 252 ? id - 1 : hoennCries.get(key) },
      source: "firered",
    });
    if (out.get(n).cry.firered === undefined) throw new Error(`FireRed ${key}: no cry`);
  }
  return out;
}

// pokeemerald-expansion

/** The values its config would give for a Gen 4 game: updated data up to Gen 4 only, base forms. */
function configValue(name) {
  if (/^GEN_(\d+)$/.test(name)) return Number(name.slice(4));
  if (name === "GEN_LATEST") return 9;
  if (/^P_UPDATED_\w+$/.test(name)) return 4;
  if (/^P_FAMILY_\w+$/.test(name)) return 1;
  return { TRUE: 1, FALSE: 0, P_GENDER_DIFFERENCES: 1, P_GEN_2_CROSS_EVOS: 1, P_GEN_4_CROSS_EVOS: 1 }[name] ?? 0;
}

function evalCondition(expr) {
  return Boolean(evalExpression(expr));
}

/** A C constant expression with the config's values (configValue): numbers, comparisons, ?: and logic. */
export function evalExpression(expr) {
  const js = expr
    .replace(/defined\s*\(?\s*\w+\s*\)?/g, "0")
    .replace(/\b[A-Za-z_]\w*\b/g, (id) => String(configValue(id)))
    .replace(/\/\/.*$/, "");
  if (!/^[\d\s().!&|<>=+\-*/?:]*$/.test(js)) throw new Error(`expansion: can't evaluate ${expr}`);
  return Function(`return (${js});`)();
}

/** Splits a macro call's arguments at top-level commas. */
function splitArgs(s) {
  const args = [];
  let depth = 0;
  let cur = "";
  let quote = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      cur += c;
      if (c === "\\") cur += s[++i];
      else if (c === '"') quote = false;
      continue;
    }
    if (c === '"') quote = true;
    else if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    else if (c === "," && depth === 0) {
      args.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  if (cur.trim() || args.length) args.push(cur.trim());
  return args;
}

/**
 * A small C preprocessor for the species files: line continuations, #define (object and
 * function-like, with ##), #if/#ifdef/#elif/#else/#endif by configValue. Global macros the
 * files rely on are passed in `macros`.
 */
export function preprocess(text, macros = new Map()) {
  const lines = text.replace(/\\\r?\n/g, " ").split("\n");
  const kept = [];
  const stack = [];
  const active = () => stack.every((s) => s.on);
  for (const line of lines) {
    const d = /^\s*#\s*(\w+)\s*(.*)$/.exec(line);
    if (!d) {
      if (active()) kept.push(line);
      continue;
    }
    const [, dir, rest] = d;
    if (dir === "if" || dir === "ifdef" || dir === "ifndef") {
      const on = dir === "if" ? evalCondition(rest) : dir === "ifdef" ? false : true;
      stack.push({ on, done: on });
    } else if (dir === "elif") {
      const top = stack.at(-1);
      top.on = !top.done && evalCondition(rest);
      top.done ||= top.on;
    } else if (dir === "else") {
      const top = stack.at(-1);
      top.on = !top.done;
      top.done = true;
    } else if (dir === "endif") stack.pop();
    else if (dir === "define" && active()) {
      const m = /^(\w+)(\(([^)]*)\))?\s*(.*)$/.exec(rest);
      macros.set(m[1], { params: m[2] ? m[3].split(",").map((p) => p.trim()).filter(Boolean) : null, body: m[4].replace(/\/\/.*$/, "") });
    }
  }
  return expand(kept.join("\n"), macros, 0);
}

function expand(text, macros, depth) {
  if (depth > 8) return text;
  let out = "";
  let i = 0;
  const ident = /[A-Za-z_]\w*/y;
  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      const end = /"(?:\\.|[^"\\])*"/y;
      end.lastIndex = i;
      const m = end.exec(text);
      out += m[0];
      i += m[0].length;
      continue;
    }
    ident.lastIndex = i;
    const m = /[A-Za-z_]/.test(c) && (i === 0 || !/\w/.test(text[i - 1])) ? ident.exec(text) : null;
    if (!m) {
      out += c;
      i++;
      continue;
    }
    const name = m[0];
    const macro = macros.get(name);
    i += name.length;
    if (!macro) {
      out += name;
      continue;
    }
    if (!macro.params) {
      out += expand(macro.body, macros, depth + 1);
      continue;
    }
    let j = i;
    while (/\s/.test(text[j])) j++;
    if (text[j] !== "(") {
      out += name;
      continue;
    }
    let level = 0;
    let k = j;
    let quote = false;
    for (; k < text.length; k++) {
      if (quote) {
        if (text[k] === "\\") k++;
        else if (text[k] === '"') quote = false;
      } else if (text[k] === '"') quote = true;
      else if (text[k] === "(") level++;
      else if (text[k] === ")" && --level === 0) break;
    }
    const args = splitArgs(text.slice(j + 1, k));
    let body = macro.body;
    const variadic = macro.params.at(-1) === "...";
    macro.params.forEach((p, n) => {
      const value = p === "..." ? args.slice(n).join(", ") : args[n] ?? "";
      body = body.replace(new RegExp(`\\b${p === "..." ? "__VA_ARGS__" : p}\\b`, "g"), () => value);
    });
    if (variadic && !macro.params.includes("...")) body = body.replace(/__VA_ARGS__/g, "");
    body = body.replace(/\s*##\s*/g, "");
    out += expand(body, macros, depth + 1);
    i = k + 1;
  }
  return out;
}

/** The `[SPECIES_X] = { ... }` blocks, braces balanced, in file order. */
export function speciesBlocks(text, start = /\[(SPECIES_\w+)\]\s*=\s*\{/g) {
  const blocks = [];
  let m;
  while ((m = start.exec(text))) {
    let depth = 1;
    let k = start.lastIndex;
    let quote = false;
    for (; k < text.length && depth > 0; k++) {
      const c = text[k];
      if (quote) {
        if (c === "\\") k++;
        else if (c === '"') quote = false;
      } else if (c === '"') quote = true;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
    }
    blocks.push([m[1], text.slice(start.lastIndex, k - 1)]);
    start.lastIndex = k;
  }
  return blocks;
}

function readExpansion(root) {
  const read = (f) => readFileSync(join(root, f), "utf8");
  const nat = nationalNumbers(root);
  const dir = "src/data/pokemon/species_info";
  const texts = new Map([...read(join(dir, "shared_dex_text.h")).matchAll(/(\w+)\[\]\s*=\s*_\(((?:\s*"(?:\\.|[^"\\])*")+)\s*\)/g)].map((m) => [m[1], literals(m[2])]));
  const files = new Map([...read("src/data/graphics/pokemon.h").matchAll(/(gMon\w+)\[\]\s*=\s*INCGFX_U\d+\("(graphics\/[\w/]+\.\w+)"/g)].map((m) => [m[1], m[2]]));
  const globals = () =>
    new Map([
      ["FOOTPRINT", { params: ["sprite"], body: ".footprint = gMonFootprint_ ## sprite," }],
      ["OVERWORLD", { params: ["..."], body: "" }],
      ["OVERWORLD_PAL", { params: ["..."], body: "" }],
      ["OVERWORLD_SET_ANIM", { params: ["..."], body: "" }],
      ["SHADOW", { params: ["..."], body: "" }],
      ["NO_SHADOW", { params: [], body: "" }],
    ]);
  const out = new Map();
  const files4 = readdirSync(join(root, dir)).filter((f) => /^gen_[1-4]_families\.h$/.test(f)).sort();
  for (const file of files4) {
    const text = preprocess(read(join(dir, file)), globals());
    for (const [key, raw] of speciesBlocks(text)) {
      // Choices made in place, e.g. (P_UPDATED_TYPES >= GEN_6 ? TYPE_FAIRY : TYPE_NORMAL).
      const block = raw.replace(/\(\s*([^?()]+?)\s*\?\s*([\w-]+)\s*:\s*([\w-]+)\s*\)/g, (_, c, a, b) => (evalCondition(c) ? a : b));
      const natName = /\.natDexNum\s*=\s*(NATIONAL_DEX_\w+)/.exec(block)?.[1];
      const n = nat.get(natName);
      if (!n || n <= FIRERED_DEX_COUNT || n > NATIONAL_DEX_COUNT || out.has(n)) continue;
      const num = (f) => {
        const v = new RegExp(`\\.${f}\\s*=\\s*(-?\\d+)`).exec(block)?.[1];
        if (v === undefined) throw new Error(`expansion ${key}: no .${f}`);
        return Number(v);
      };
      const sym = (f) => new RegExp(`\\.${f}\\s*=\\s*(\\w+)`).exec(block)?.[1];
      const str = (f) => {
        const m = new RegExp(`\\.${f}\\s*=\\s*_\\(((?:\\s*"(?:\\\\.|[^"\\\\])*")+)\\s*\\)`).exec(block);
        if (!m) throw new Error(`expansion ${key}: no .${f}`);
        return literals(m[1]);
      };
      const typesM = /\.types\s*=\s*(?:MON_TYPES\(([^)]*)\)|\{([^}]*)\})/.exec(block);
      if (!typesM) throw new Error(`expansion ${key}: types ${/\.types[^\n]*/.exec(block)}`);
      const types = (typesM[1] ?? typesM[2]).split(",").map((t) => t.trim()).filter(Boolean);
      const desc = /\.description\s*=\s*(?:COMPOUND_STRING\(((?:\s*"(?:\\.|[^"\\])*")+)\s*\)|(\w+))/.exec(block);
      const description = desc[1] !== undefined ? literals(desc[1]) : texts.get(desc[2]);
      const file = (f, what) => {
        const path = files.get(sym(f));
        if (!path) throw new Error(`expansion ${key}: no ${what} (${sym(f)})`);
        return path;
      };
      const iconPal = num("iconPalIndex");
      if (description === undefined) throw new Error(`expansion ${key}: no description`);
      out.set(n, {
        nat: n,
        constant: natName.replace("NATIONAL_DEX_", ""),
        name: str("speciesName"),
        category: str("categoryName"),
        description,
        types: [types[0], types[1] ?? types[0]],
        height: num("height"),
        weight: num("weight"),
        scale: ["pokemonScale", "pokemonOffset", "trainerScale", "trainerOffset"].map(num),
        front: file("frontPic", "front pic"),
        palette: file("palette", "palette"),
        back: file("backPic", "back pic"),
        shinyPalette: file("shinyPalette", "shiny palette"),
        coords: { front: num("frontPicYOffset"), back: num("backPicYOffset"), elevation: numberField(block, "enemyMonElevation", 0) },
        noFlip: /\.noFlip\s*=\s*TRUE/.test(block),
        battle: battleFacts(block),
        footprint: file("footprint", "footprint"),
        icon: file("iconSprite", "icon"),
        iconPalette: `graphics/pokemon/icon_palettes/pal${iconPal}.pal`,
        cry: { wav: `sound/direct_sound_samples/cries/${sym("cryId").replace(/^CRY_/, "").toLowerCase()}.wav` },
        source: "expansion",
      });
    }
  }
  return out;
}

export function readSpecies(firered, expansion) {
  const all = new Map([...readFireRed(firered), ...readExpansion(expansion)]);
  for (let n = 1; n <= NATIONAL_DEX_COUNT; n++) if (!all.has(n)) throw new Error(`species ${n}: not found`);
  return new Map([...all].sort((a, b) => a[0] - b[0]));
}
