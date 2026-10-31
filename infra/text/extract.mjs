// Encodes FireRed's text the way the game's build does (charmap.txt), from the decompilation,
// so the game prints the original bytes and no game text is committed (docs/tech-stack.md#firered-as-reference).
// Run by `make text`: node extract.mjs <pokefirered> <labels.json> <out dir>.
// Output: strings.json (label -> bytes, ending in 0xFF) and charmap.json (character <-> byte).

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
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
// Assembly: gName:: then .string lines; "$" ends the string.
for (const file of readdirSync(join(src, "data/text")).filter((f) => f.endsWith(".inc"))) {
  let label = null;
  let parts = [];
  const flush = () => {
    if (label) {
      const [name, text] = [label, parts.join("")];
      found.set(name, () => encode(text, name));
    }
  };
  for (const line of readFileSync(join(src, "data/text", file), "utf8").split("\n")) {
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
writeFileSync(join(out, "charmap.json"), JSON.stringify(charmap));
console.log(`text: ${labels.length} strings`);
