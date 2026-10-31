// FireRed's charmap.txt: characters and constants to the game's bytes, as its build encodes
// text. Shared by `make text` (extract.mjs) and `make pokemon` (infra/pokemon/build.mjs).

import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Reads <pokefirered>/charmap.txt: 'c' = HH ... for characters, NAME = HH ... for constants; @ starts a comment. */
export function loadCharmap(src) {
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

  /** The bytes of `text` (escapes like \n as written in the source, {CONSTANT} and {NAME n} codes), without the final 0xFF. */
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

  return { chars, constants, encode };
}
