// Encodes FireRed's text the way the game's build does (charmap.txt), from the decompilation,
// so the game prints the original bytes and no game text is committed (docs/tech-stack.md#firered-as-reference).
// Run by `make text`: node extract.mjs <pokefirered> <labels.json> <out dir>.
// Output: strings.json (label -> bytes, ending in 0xFF), items.json (each item's name and
// description by item ID, from src/data/items.json), tm-moves.json (each TM's and HM's move,
// by item ID) and charmap.json (character <-> byte).

import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const [src, listPath, out] = process.argv.slice(2);
const labels = JSON.parse(readFileSync(listPath, "utf8"));

// charmap.txt: 'c' = HH ... for characters, NAME = HH ... for constants; @ starts a comment.
const chars = new Map();
const constants = new Map();
for (const raw of readFileSync(join(src, "charmap.txt"), "utf8").split("\n")) {
  const line = raw.replace(/@.*$/, "").trim();
  const m = /^('(?:\\.|[^'])+'|[A-Z0-9_]+)\s*=\s*([0-9A-Fa-f ]+)$/.exec(line);
  if (!m) continue;
  const bytes = m[2].trim().split(/\s+/).map((h) => parseInt(h, 16));
  if (m[1].startsWith("'")) {
    const key = m[1].slice(1, -1).replace(/^\\'$/, "'");
    if (!chars.has(key)) chars.set(key, bytes);
  } else if (!constants.has(m[1])) constants.set(m[1], bytes);
}
const longest = Math.max(...[...chars.keys()].map((k) => k.length));

function encode(text, label) {
  const bytes = [];
  for (let i = 0; i < text.length; ) {
    if (text[i] === "{") {
      const end = text.indexOf("}", i);
      for (const [n, token] of text.slice(i + 1, end).trim().split(/\s+/).entries()) {
        if (n > 0 && /^(0x[0-9a-f]+|\d+)$/i.test(token)) bytes.push(Number(token) & 0xff);
        else if (constants.has(token)) bytes.push(...constants.get(token));
        else throw new Error(`${label}: unknown {${token}}`);
      }
      i = end + 1;
      continue;
    }
    let matched = false;
    for (let len = Math.min(longest, text.length - i); len > 0; len--) {
      const key = text.slice(i, i + len);
      if (chars.has(key)) {
        bytes.push(...chars.get(key));
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) throw new Error(`${label}: no charmap entry for ${JSON.stringify(text[i])}`);
  }
  return bytes;
}

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

// TMs and HMs: the move each teaches (sTMHMMoves, TM01 to HM08), its name and what the TM CASE
// shows of it (src/data/battle_moves.h): type (FireRed's TYPE_ number), power, accuracy, PP.
const read = (f) => readFileSync(join(src, f), "utf8");
const typeIds = new Map([...read("include/constants/pokemon.h").matchAll(/#define (TYPE_\w+)\s+(\d+)/g)].map((m) => [m[1], Number(m[2])]));
const moveNames = new Map([...read("src/data/text/move_names.h").matchAll(/\[(MOVE_\w+)\]\s*=\s*_\("((?:\\.|[^"\\])*)"\)/g)].map((m) => [m[1], m[2]]));
const battleMoves = new Map(
  [...read("src/data/battle_moves.h").matchAll(/\[(MOVE_\w+)\]\s*=\s*\{([^}]*)\}/g)].map((m) => {
    const field = (name) => new RegExp(`\\.${name}\\s*=\\s*(\\w+)`).exec(m[2])?.[1];
    return [m[1], { type: typeIds.get(field("type")), power: Number(field("power")), accuracy: Number(field("accuracy")), pp: Number(field("pp")) }];
  }),
);
const tmhm = /sTMHMMoves\[\]\s*=\s*\{([^}]*)\}/.exec(read("src/data/party_menu.h"))[1].match(/MOVE_\w+/g);
const tmMoves = {};
for (const [i, move] of tmhm.entries()) {
  const stats = battleMoves.get(move);
  if (!moveNames.has(move) || stats?.type === undefined) throw new Error(`TM move ${move}: not found`);
  tmMoves[itemIds.get("ITEM_TM01") + i] = { name: [...encode(moveNames.get(move), move), 0xff], ...stats };
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
writeFileSync(join(out, "tm-moves.json"), JSON.stringify(tmMoves));
writeFileSync(join(out, "charmap.json"), JSON.stringify(charmap));
console.log(`text: ${labels.length} strings, ${Object.keys(items).length} items, ${Object.keys(tmMoves).length} TM moves`);
