// Encodes FireRed's text the way the game's build does (charmap.txt), from the decompilation,
// so the game prints the original bytes and no game text is committed (docs/tech-stack.md#firered-as-reference).
// Run by `make text`: node extract.mjs <pokefirered> <labels.json> <out dir> <pokeemerald-expansion> <lib-contracts proto dir>.
// Output: strings.json (label -> bytes, ending in 0xFF), items.json (each item's name and
// description by item ID, from src/data/items.json), moves.json and abilities.json (name and
// description by catalog number), natures.json (name by catalog number) and charmap.json
// (character <-> byte). Moves 1-354 and FireRed's abilities use FireRed's text; Gen 4's
// (moves 355-467, abilities from Tangled Feet on) use pokeemerald-expansion's, written and
// fitted as FireRed's (docs/plans/battles.md D8).

import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { preprocess, speciesBlocks } from "../pokemon/sources.mjs";
import { loadCharmap } from "./charmap.mjs";
import { fireRedStyle, makeReflow } from "./reflow.mjs";

const [src, listPath, out, expansion, protoDir] = process.argv.slice(2);
const labels = JSON.parse(readFileSync(listPath, "utf8"));

const { chars, encode } = loadCharmap(src);

// String literals keep their escapes (\n, \l, \p) as charmap keys; \" is a quote.
const literals = (s) => [...s.matchAll(/"((?:\\.|[^"\\])*)"/g)].map((m) => m[1].replace(/\\"/g, '"')).join("");

const found = new Map();
// C: const u8 gName[] = _("...");  The macro ends the string.
for (const file of ["src/strings.c", "src/keyboard_text.c"]) {
  for (const m of readFileSync(join(src, file), "utf8").matchAll(/(\w+)\[\]\s*=\s*_\(((?:\s*"(?:\\.|[^"\\])*")+)\s*\)/g))
    found.set(m[1], () => [...encode(literals(m[2]), m[1]), 0xff]);
}
// Assembly: gName:: then .string lines; "$" ends the string. Shared texts, each map's texts and
// the few defined with the event scripts.
const asmFiles = [
  ...readdirSync(join(src, "data/text")).filter((f) => f.endsWith(".inc")).map((f) => join("data/text", f)),
  ...readdirSync(join(src, "data/maps")).map((m) => join("data/maps", m, "text.inc")).filter((f) => existsSync(join(src, f))),
  "data/event_scripts.s",
];
for (const file of asmFiles) {
  let label = null;
  let parts = [];
  const flush = () => {
    if (label) {
      const [name, text] = [label, parts.join("")];
      found.set(name, () => encode(text, name));
    }
  };
  for (const line of readFileSync(join(src, file), "utf8").split("\n")) {
    const l = /^(\w+)::/.exec(line);
    if (l) {
      flush();
      label = l[1];
      parts = [];
    } else if (/^\s*\.string\s/.test(line)) parts.push(literals(line));
  }
  flush();
}

const strings = {};
for (const label of labels) {
  const get = found.get(label);
  if (!get) throw new Error(`text ${label} not found`);
  strings[label] = get();
}

// Items: name and description by item ID; IDs FireRed leaves unused ("????????") are skipped.
const itemIds = new Map([...readFileSync(join(src, "include/constants/items.h"), "utf8").matchAll(/#define (ITEM_\w+) (\d+)\n/g)].map((m) => [m[1], Number(m[2])]));
const items = {};
for (const item of JSON.parse(readFileSync(join(src, "src/data/items.json"), "utf8")).items) {
  const id = itemIds.get(item.itemId);
  if (!id || item.english === "????????") continue;
  items[id] = { name: [...encode(item.english, item.itemId), 0xff], description: [...encode(item.description_english, item.itemId), 0xff] };
}

// Moves, abilities and natures, by the numbers of our catalogs (lib-contracts).
const read = (f) => readFileSync(join(src, f), "utf8");
const readExp = (f) => readFileSync(join(expansion, f), "utf8");
/** An enum of our catalogs: constant -> number (0 left out). */
function catalog(file, name) {
  const text = readFileSync(join(protoDir, file), "utf8");
  const body = text.slice(text.indexOf(`enum ${name} {`), text.indexOf("\n}", text.indexOf(`enum ${name} {`)));
  return new Map([...body.matchAll(/^\s*([A-Z]\w+) = (\d+)/gm)].filter((m) => m[2] !== "0").map((m) => [m[1], Number(m[2])]));
}
const bytes = (text, label) => [...encode(text, label), 0xff];
const fireRed = fireRedStyle([], { stats: true });
// A line ending in "-" keeps the hyphen ("Water-\ntype"), except the two words the expansion splits across lines.
const SPLIT_WORDS = { "bul-let": "bullet", "head-butt": "headbutt" };
const style = (text) => fireRed(text.replace(/-\\n/g, "-").replace(/\b(bul-let|head-butt)/g, (w) => SPLIT_WORDS[w]));
const { reflow, lineWidth, widest } = makeReflow(src, encode, 4);
/** The expansion's `[CONSTANT] = { ... }` blocks with Gen 4 settings, and a text field of one. */
const expansionBlocks = (file) => new Map(speciesBlocks(preprocess(readExp(file)), /^[ \t]+\[(\w+)\]\s*=\s*\{/gm));
function expansionText(block, field, label) {
  const m = new RegExp(`\\.${field}\\s*=\\s*(?:COMPOUND_STRING|_)\\(((?:\\s*"(?:\\\\.|[^"\\\\])*")+)\\s*\\)`).exec(block);
  if (!m) throw new Error(`${label}: no .${field}`);
  return literals(m[1]);
}
/** A Gen 4 name in FireRed's capitals, no longer than FireRed allows. */
function gen4Name(name, max, label) {
  const upper = name.toUpperCase();
  if ([...encode(upper, label)].length > max) console.log(`${label}: "${upper}" is longer than ${max}`);
  return upper;
}

// Moves: FireRed's names (MOVE_NAME_LENGTH 12) and descriptions (four lines, as the summary shows them).
const moveNames = new Map([...read("src/data/text/move_names.h").matchAll(/\[(MOVE_\w+)\]\s*=\s*_\("((?:\\.|[^"\\])*)"\)/g)].map((m) => [m[1], m[2]]));
const moveDescriptionTexts = new Map([...read("src/move_descriptions.c").matchAll(/(gMoveDescription_\w+)\[\]\s*=\s*_\(((?:\s*"(?:\\.|[^"\\])*")+)\s*\)/g)].map((m) => [m[1], literals(m[2])]));
const moveDescriptions = new Map([...read("src/move_descriptions.c").matchAll(/\[(MOVE_\w+)\s*-\s*1\]\s*=\s*(gMoveDescription_\w+)/g)].map((m) => [m[1], moveDescriptionTexts.get(m[2])]));
const moveWidth = widest([...moveDescriptions.values()]);
const expansionMoves = expansionBlocks("src/data/moves_info.h");
const moves = {};
for (const [constant, n] of catalog("move/v1/catalog.proto", "Move")) {
  if (moveNames.has(constant)) {
    if (!moveDescriptions.get(constant)) throw new Error(`${constant}: no description`);
    moves[n] = { name: bytes(moveNames.get(constant), constant), description: bytes(moveDescriptions.get(constant), constant) };
    continue;
  }
  const block = expansionMoves.get(constant);
  if (!block) throw new Error(`${constant}: not in FireRed or the expansion`);
  const name = gen4Name(expansionText(block, "name", constant), 12, constant);
  moves[n] = { name: bytes(name, constant), description: bytes(reflow(style(expansionText(block, "description", constant)), moveWidth, constant), constant) };
}

// Abilities: FireRed's names (ABILITY_NAME_LENGTH 12) and one-line descriptions, by constant (FireRed
// numbers them differently from Cacophony on); the expansion's for the Gen 4 ones.
const abilityText = read("src/data/text/abilities.h");
const abilityDescriptionTexts = new Map([...abilityText.matchAll(/(s\w+Description)\[\]\s*=\s*_\("((?:\\.|[^"\\])*)"\)/g)].map((m) => [m[1], m[2]]));
const abilityDescriptions = new Map([...abilityText.matchAll(/\[(ABILITY_\w+)\]\s*=\s*(s\w+Description)/g)].map((m) => [m[1], abilityDescriptionTexts.get(m[2])]));
const abilityNames = new Map([...abilityText.matchAll(/\[(ABILITY_\w+)\]\s*=\s*_\("((?:\\.|[^"\\])*)"\)/g)].map((m) => [m[1], m[2]]));
const abilityWidth = widest([...abilityDescriptions.values()]);
const expansionAbilities = expansionBlocks("src/data/abilities.h");
const abilities = {};
for (const [constant, n] of catalog("ability/v1/catalog.proto", "Ability")) {
  if (abilityNames.has(constant)) {
    abilities[n] = { name: bytes(abilityNames.get(constant), constant), description: bytes(abilityDescriptions.get(constant), constant) };
    continue;
  }
  const block = expansionAbilities.get(constant);
  if (!block) throw new Error(`${constant}: not in FireRed or the expansion`);
  const name = gen4Name(expansionText(block, "name", constant), 12, constant);
  const description = style(expansionText(block, "description", constant));
  const fitted = lineWidth(description) <= abilityWidth ? description : makeReflow(src, encode, 1).reflow(description, abilityWidth, constant);
  abilities[n] = { name: bytes(name, constant), description: bytes(fitted, constant) };
}

// Natures: FireRed's names, in its order (NATURE_HARDY first).
const natureNames = [...read("src/data/text/nature_names.h").matchAll(/s(\w+)NatureName\[\]\s*=\s*_\("((?:\\.|[^"\\])*)"\)/g)];
const natures = {};
for (const [constant, n] of catalog("pokemon/v1/nature.proto", "Nature")) {
  const m = natureNames.find((x) => `NATURE_${x[1].toUpperCase()}` === constant);
  if (!m) throw new Error(`${constant}: no name`);
  natures[n] = bytes(m[2], constant);
}

// Single characters, for names: the first byte of each, and back (ASCII preferred for duplicates).
const charmap = { encode: {}, decode: {} };
for (const [c, bytes] of chars)
  if ([...c].length === 1 && bytes.length === 1 && c !== "$") {
    charmap.encode[c] = bytes[0];
    const prev = charmap.decode[bytes[0]];
    if (prev === undefined || (c.charCodeAt(0) < 128 && prev.charCodeAt(0) >= 128)) charmap.decode[bytes[0]] = c;
  }

mkdirSync(out, { recursive: true });
writeFileSync(join(out, "strings.json"), JSON.stringify(strings));
writeFileSync(join(out, "items.json"), JSON.stringify(items));
writeFileSync(join(out, "moves.json"), JSON.stringify(moves));
writeFileSync(join(out, "abilities.json"), JSON.stringify(abilities));
writeFileSync(join(out, "natures.json"), JSON.stringify(natures));
rmSync(join(out, "tm-moves.json"), { force: true });
writeFileSync(join(out, "charmap.json"), JSON.stringify(charmap));
console.log(`text: ${labels.length} strings, ${Object.keys(items).length} items, ${Object.keys(moves).length} moves, ${Object.keys(abilities).length} abilities, ${Object.keys(natures).length} natures`);
