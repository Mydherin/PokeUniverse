// Builds what the FireRed art style shows of every species up to Gen 4, from the read-only
// references at build time, into a gitignored folder (docs/tech-stack.md#firered-as-reference):
// FireRed's own for 1-386, pokeemerald-expansion's Gen 3-style art and Gen 4 Pokédex data for 387-493.
// Run by `make pokemon`: node build.mjs <pokefirered> <pokeemerald-expansion> <out dir>.
//
// Output, by national number (<nnn> = 001 to 493):
// - <nnn>/front.png + front.pal: the Pokédex and battle picture (the expansion's has two frames: the first is shown),
//   <nnn>/back.png (the player's side in battle), <nnn>/shiny.pal (both pictures' shiny colors),
//   <nnn>/footprint.png, <nnn>/icon.png + icon.pal,
//   <nnn>/overworld.png + overworld.pal + overworld-shiny.pal: the following Pokémon's sheet (the expansion's for every
//   species: 6 frames side by side, 32 or 64 px square; base form only, no female variants yet).
// - species.json: { "<n>": { name, category, description: FireRed-encoded bytes ending 0xFF,
//   scale: [pokemonScale, pokemonOffset, trainerScale, trainerOffset],
//   coords: [front y offset, back y offset, enemy elevation] (where the battle draws the pictures),
//   itemScene: [machine x, machine y, y offset, item x, item y] (FireRed's item scene: firered/use-item-scene.ts),
//   noFlip: true when the summary shows the front picture unmirrored (else left out) } }.
// - cries.json: what `make audio` renders for each cry: { "<nnn>": { cry: FireRed cry number } | { wav: repo path } }.
//
// The expansion's names and categories are uppercased and its descriptions reflowed as FireRed
// writes them: species names in capitals, "POKéMON", three lines no wider than FireRed's widest
// (a description that can't fit loses its last sentences).

import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { loadCharmap } from "../text/charmap.mjs";
import { fireRedStyle, makeReflow } from "../text/reflow.mjs";
import { readSpecies } from "./sources.mjs";

const [firered, expansion, out] = process.argv.slice(2);
const species = readSpecies(firered, expansion);
const { encode } = loadCharmap(firered);
const repo = resolve(firered, "../..");

// Pokédex descriptions: three lines no wider than FireRed's widest.
const MAX_LINES = 3;
const { reflow: fit, widest } = makeReflow(firered, encode, MAX_LINES);
const maxWidth = widest([...species.values()].filter((s) => s.source === "firered").map((s) => s.description));
const reflow = (text, label) => fit(text, maxWidth, label);
const fireRed = fireRedStyle([...species.values()].map((s) => s.name));

// Menu2_GetMonPosAttribute's answer for a species its table doesn't have (387-493).
const ITEM_SCENE_DEFAULT = [32, 32, 32, 32, 32];

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
  copyFileSync(join(root, s.back), join(dir, "back.png"));
  copyFileSync(join(root, s.shinyPalette), join(dir, "shiny.pal"));
  copyFileSync(join(root, s.footprint), join(dir, "footprint.png"));
  copyFileSync(join(root, s.icon), join(dir, "icon.png"));
  copyFileSync(join(root, s.iconPalette), join(dir, "icon.pal"));
  copyFileSync(join(expansion, s.overworld.pic), join(dir, "overworld.png"));
  copyFileSync(join(expansion, s.overworld.palette), join(dir, "overworld.pal"));
  copyFileSync(join(expansion, s.overworld.shinyPalette), join(dir, "overworld-shiny.pal"));
  const label = `species ${s.nat}`;
  const gen4 = s.source === "expansion";
  data[s.nat] = {
    name: encoded(gen4 ? s.name.toUpperCase() : s.name, label),
    category: encoded(gen4 ? s.category.toUpperCase() : s.category, label),
    description: encoded(gen4 ? reflow(fireRed(s.description), label) : s.description, label),
    scale: s.scale,
    coords: [s.coords.front, s.coords.back, s.coords.elevation],
    itemScene: s.itemScene ?? ITEM_SCENE_DEFAULT,
    ...(s.noFlip && { noFlip: true }),
  };
  cries[pad(s.nat)] = "firered" in s.cry ? { cry: s.cry.firered } : { wav: relative(repo, join(expansion, s.cry.wav)) };
}
writeFileSync(join(out, "species.json"), JSON.stringify(data));
writeFileSync(join(out, "cries.json"), JSON.stringify(cries));
console.log(`pokemon: ${species.size} species (descriptions up to ${maxWidth} px wide)`);
