// Builds what the FireRed art style shows of every species up to Gen 4, from the read-only
// references at build time, into a gitignored folder (docs/tech-stack.md#firered-as-reference):
// FireRed's own for 1-386, pokeemerald-expansion's Gen 3-style art and Gen 4 Pokédex data for 387-493.
// Run by `make pokemon`: node build.mjs <pokefirered> <pokeemerald-expansion> <out dir>.
//
// Output, by national number (<nnn> = 001 to 493):
// - <nnn>/front.png + front.pal: the Pokédex picture (the expansion's has two frames: the first is shown),
//   <nnn>/footprint.png, <nnn>/icon.png + icon.pal.
// - species.json: { "<n>": { name, category, description: FireRed-encoded bytes ending 0xFF,
//   scale: [pokemonScale, pokemonOffset, trainerScale, trainerOffset] } }.
// - cries.json: what `make audio` renders for each cry: { "<nnn>": { cry: FireRed cry number } | { wav: repo path } }.
//
// The expansion's names and categories are uppercased and its descriptions reflowed as FireRed
// writes them: species names in capitals, "POKéMON", three lines no wider than FireRed's widest
// (a description that can't fit loses its last sentences).

import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { loadCharmap } from "../text/charmap.mjs";
import { readSpecies } from "./sources.mjs";

const [firered, expansion, out] = process.argv.slice(2);
const species = readSpecies(firered, expansion);
const { encode } = loadCharmap(firered);
const repo = resolve(firered, "../..");

// FONT_NORMAL's glyph widths (src/text.c), by byte; the description prints with 1 pixel between letters.
const widths = /sFontNormalLatinGlyphWidths\[\]\s*=\s*\{([^}]*)\}/.exec(readFileSync(join(firered, "src/text.c"), "utf8"))[1].match(/\d+/g).map(Number);
const lineWidth = (line) => encode(line, "width").reduce((w, b) => w + widths[b] + 1, 0);
const MAX_LINES = 3;
const maxWidth = Math.max(...[...species.values()].filter((s) => s.source === "firered").flatMap((s) => s.description.split("\\n").map(lineWidth)));

// FireRed's writing: species names and POKéMON in capitals, plain quotes.
const names = [...species.values()].map((s) => s.name).sort((a, b) => b.length - a.length);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const namePattern = new RegExp(`(?<![\\w'])(${names.map(escape).join("|")})(?![\\w])`, "gi");
function fireRedStyle(text) {
  return text
    .replace(/Pokémon/gi, "POKéMON")
    .replace(namePattern, (m) => m.toUpperCase())
    .replace(/’/g, "'");
}

/** Greedy lines no wider than FireRed's. */
function wrap(text) {
  const lines = [];
  for (const word of text.split(" ")) {
    const next = lines.length ? `${lines.at(-1)} ${word}` : word;
    if (lines.length && lineWidth(next) <= maxWidth) lines[lines.length - 1] = next;
    else lines.push(word);
  }
  return lines;
}

/**
 * Three lines at most: the last sentences go while it's longer; a first sentence that alone
 * doesn't fit is cut after its third line, ending in "…".
 */
function reflow(text, label) {
  const sentences = text.replace(/\\n/g, " ").replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/);
  for (let n = sentences.length; n > 0; n--) {
    const lines = wrap(sentences.slice(0, n).join(" "));
    if (lines.length <= MAX_LINES) return lines.join("\\n");
  }
  const lines = wrap(sentences[0]).slice(0, MAX_LINES);
  const words = lines[MAX_LINES - 1].split(" ");
  while (words.length > 1 && lineWidth(`${words.join(" ")}…`) > maxWidth) words.pop();
  lines[MAX_LINES - 1] = `${words.join(" ").replace(/[,;:]$/, "")}…`;
  if (!lines[0]) throw new Error(`${label}: no description`);
  return lines.join("\\n");
}

const encoded = (text, label) => [...encode(text, label), 0xff];
const pad = (n) => String(n).padStart(3, "0");

rmSync(out, { recursive: true, force: true });
const data = {};
const cries = {};
for (const s of species.values()) {
  const root = s.source === "firered" ? firered : expansion;
  const dir = join(out, pad(s.nat));
  mkdirSync(dir, { recursive: true });
  copyFileSync(join(root, s.front), join(dir, "front.png"));
  copyFileSync(join(root, s.palette), join(dir, "front.pal"));
  copyFileSync(join(root, s.footprint), join(dir, "footprint.png"));
  copyFileSync(join(root, s.icon), join(dir, "icon.png"));
  copyFileSync(join(root, s.iconPalette), join(dir, "icon.pal"));
  const label = `species ${s.nat}`;
  const gen4 = s.source === "expansion";
  data[s.nat] = {
    name: encoded(gen4 ? s.name.toUpperCase() : s.name, label),
    category: encoded(gen4 ? s.category.toUpperCase() : s.category, label),
    description: encoded(gen4 ? reflow(fireRedStyle(s.description), label) : s.description, label),
    scale: s.scale,
  };
  cries[pad(s.nat)] = "firered" in s.cry ? { cry: s.cry.firered } : { wav: relative(repo, join(expansion, s.cry.wav)) };
}
writeFileSync(join(out, "species.json"), JSON.stringify(data));
writeFileSync(join(out, "cries.json"), JSON.stringify(cries));
console.log(`pokemon: ${species.size} species (descriptions up to ${maxWidth} px wide)`);
