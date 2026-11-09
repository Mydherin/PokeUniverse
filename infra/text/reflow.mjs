// Writes pokeemerald-expansion's text the way FireRed writes it and fits it in FireRed's lines.
// Shared by `make text` (extract.mjs: move and ability descriptions) and `make pokemon`
// (infra/pokemon/build.mjs: Pokédex descriptions).

import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * FireRed's writing: POKéMON and the given names (species) in capitals, plain quotes; with
 * `stats`, the stats too (ATTACK, SP. ATK), as its move descriptions write them.
 */
export function fireRedStyle(names = [], { stats = false } = {}) {
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sorted = [...names].sort((a, b) => b.length - a.length);
  const namePattern = sorted.length ? new RegExp(`(?<![\\w'])(${sorted.map(escape).join("|")})(?![\\w])`, "gi") : null;
  return (text) => {
    let out = text.replace(/Pokémon/gi, "POKéMON").replace(/’/g, "'");
    if (stats) out = out.replace(/\b(Sp\. Atk|Sp\. Def|Attack|Defense|Speed)\b/g, (m) => m.toUpperCase());
    if (namePattern) out = out.replace(namePattern, (m) => m.toUpperCase());
    return out;
  };
}

/**
 * A reflow for FONT_NORMAL text no wider than `maxWidth` pixels (1 pixel between letters) in at
 * most `maxLines` lines: the last sentences go while it's longer; a first sentence that alone
 * doesn't fit is cut after the last line, ending in "…". Returns "\n"-joined lines.
 */
export function makeReflow(firered, encode, maxLines) {
  const widths = /sFontNormalLatinGlyphWidths\[\]\s*=\s*\{([^}]*)\}/.exec(readFileSync(join(firered, "src/text.c"), "utf8"))[1].match(/\d+/g).map(Number);
  const lineWidth = (line) => encode(line, "width").reduce((w, b) => w + widths[b] + 1, 0);
  /** The widest line of FireRed's own texts (escaped "\n" between lines). */
  const widest = (texts) => Math.max(...texts.flatMap((t) => t.split("\\n").map(lineWidth)));

  function reflow(text, maxWidth, label) {
    const wrap = (s) => {
      const lines = [];
      for (const word of s.split(" ")) {
        const next = lines.length ? `${lines.at(-1)} ${word}` : word;
        if (lines.length && lineWidth(next) <= maxWidth) lines[lines.length - 1] = next;
        else lines.push(word);
      }
      return lines;
    };
    const sentences = text.replace(/\\n/g, " ").replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/);
    for (let n = sentences.length; n > 0; n--) {
      const lines = wrap(sentences.slice(0, n).join(" "));
      if (lines.length <= maxLines) return lines.join("\\n");
    }
    const lines = wrap(sentences[0]).slice(0, maxLines);
    const words = lines[maxLines - 1].split(" ");
    while (words.length > 1 && lineWidth(`${words.join(" ")}…`) > maxWidth) words.pop();
    lines[maxLines - 1] = `${words.join(" ").replace(/[,;:]$/, "")}…`;
    if (!lines[0]) throw new Error(`${label}: no text`);
    return lines.join("\\n");
  }
  return { reflow, lineWidth, widest };
}
