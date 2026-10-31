// Run once to write the species catalog and the Pokédex habitats; both are our source from then on,
// edited by hand like the item catalog (docs/tech-stack.md#firered-as-reference). Kept for reference.
// node catalog.mjs <pokefirered> <pokeemerald-expansion> <catalog.proto> <pokedex-habitats.json>
//
// - catalog.proto: every species up to Gen 4 by national number, with the facts the game plays by
//   (types, height, weight). FireRed's for 1-386 (Gen 4 kept Gen 3's), the expansion's for 387-493
//   read with Gen 4 settings (no Fairy type).
// - pokedex-habitats.json: FireRed's habitat pages (pokedex_categories.h), then the Gen 4 species:
//   an evolution of an older family joins its family's habitat; the new families get ours below.
//   Families are never split; pages hold up to 4.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readSpecies, FIRERED_DEX_COUNT } from "./sources.mjs";

const [firered, expansion, protoOut, habitatsOut] = process.argv.slice(2);
const species = readSpecies(firered, expansion);

const HABITATS = ["Grassland", "Forest", "WatersEdge", "Sea", "Cave", "Mountain", "RoughTerrain", "Urban", "Rare"];
const H = Object.fromEntries(HABITATS.map((h, i) => [h, i]));

// Gen 4 evolutions and pre-evolutions of FireRed's species: their family's FireRed species.
const RELATED = {
  406: 315, 407: 315, 424: 190, 429: 200, 430: 198, 433: 358, 438: 185, 439: 122, 440: 113, 446: 143, 458: 226,
  461: 215, 462: 82, 463: 108, 464: 112, 465: 114, 466: 125, 467: 126, 468: 176, 469: 193, 470: 133, 471: 133,
  472: 207, 473: 221, 474: 233, 475: 281, 476: 299, 477: 356, 478: 361,
};
// New Gen 4 families, by where they live in Sinnoh, in FireRed's habitats.
const NEW_FAMILIES = [
  [[387, 388, 389], H.Forest],
  [[390, 391, 392], H.Mountain],
  [[393, 394, 395], H.WatersEdge],
  [[396, 397, 398], H.Grassland],
  [[399, 400], H.WatersEdge],
  [[401, 402], H.Grassland],
  [[403, 404, 405], H.Grassland],
  [[408, 409], H.Rare],
  [[410, 411], H.Rare],
  [[412, 413, 414], H.Forest],
  [[415, 416], H.Forest],
  [[417], H.Forest],
  [[418, 419], H.WatersEdge],
  [[420, 421], H.Forest],
  [[422, 423], H.Sea],
  [[425, 426], H.Grassland],
  [[427, 428], H.Forest],
  [[431, 432], H.Urban],
  [[434, 435], H.Grassland],
  [[436, 437], H.Cave],
  [[441], H.Forest],
  [[442], H.Rare],
  [[443, 444, 445], H.Cave],
  [[447, 448], H.Mountain],
  [[449, 450], H.RoughTerrain],
  [[451, 452], H.RoughTerrain],
  [[453, 454], H.WatersEdge],
  [[455], H.WatersEdge],
  [[456, 457], H.Sea],
  [[459, 460], H.Mountain],
  [[479], H.Urban],
  [[480, 481, 482], H.Rare],
  [[483, 484], H.Rare],
  [[485], H.Rare],
  [[486], H.Rare],
  [[487], H.Rare],
  [[488], H.Rare],
  [[489, 490], H.Rare],
  [[491], H.Rare],
  [[492], H.Rare],
  [[493], H.Rare],
];

// FireRed's pages: sDexCategory_<Habitat>Pkmn_PageN = { SPECIES_X, ... }, listed per habitat.
const text = readFileSync(join(firered, "src/data/pokemon/pokedex_categories.h"), "utf8");
const pageSpecies = new Map([...text.matchAll(/(sDexCategory_\w+_Page\d+)\[\]\s*=\s*\{([^}]*)\}/g)].map((m) => [m[1], m[2].match(/SPECIES_\w+/g)]));
const natByName = new Map([...species.values()].filter((s) => s.nat <= FIRERED_DEX_COUNT).map((s) => [`SPECIES_${constantName(s)}`, s.nat]));
const habitats = HABITATS.map((h) => {
  const list = new RegExp(`sDexCategory_${h}Pkmn\\[\\]\\s*=\\s*\\{([^}]*)\\}`).exec(text)[1];
  return [...list.matchAll(/DEX_CATEGORY\((\w+)\)/g)].map((m) =>
    pageSpecies.get(`sDexCategory_${m[1]}`).map((name) => {
      const n = natByName.get(name);
      if (!n) throw new Error(`habitat page ${m[1]}: unknown ${name}`);
      return n;
    }),
  );
});
const habitatOf = new Map();
habitats.forEach((pages, h) => pages.forEach((page) => page.forEach((n) => habitatOf.set(n, h))));
if (habitatOf.size !== FIRERED_DEX_COUNT) throw new Error(`FireRed habitats: ${habitatOf.size} species`);

// Gen 4: related species grouped by family, then the new families, packed into pages per habitat.
const families = [];
const byBase = new Map();
for (const [n, base] of Object.entries(RELATED)) {
  if (!byBase.has(base)) byBase.set(base, []);
  byBase.get(base).push(Number(n));
}
for (const [base, members] of [...byBase].sort((a, b) => a[1][0] - b[1][0])) families.push([members, habitatOf.get(base)]);
families.push(...NEW_FAMILIES);
families.sort((a, b) => a[0][0] - b[0][0]);
const added = new Map();
for (const [members, h] of families) {
  if (!added.has(h)) added.set(h, []);
  const pages = added.get(h);
  const last = pages.at(-1);
  if (last && last.length + members.length <= 4) last.push(...members);
  else pages.push([...members]);
}
for (const [h, pages] of added) habitats[h].push(...pages);
const all = habitats.flat(2);
if (all.length !== species.size || new Set(all).size !== species.size) throw new Error(`habitats: ${all.length} entries for ${species.size} species`);

// The proto.
function constantName(s) {
  return s.constant;
}
const typeName = (t) => t.replace(/^TYPE_/, "");
const lines = [...species.values()].map((s) => {
  const [t1, t2] = s.types.map(typeName);
  return `  SPECIES_${s.constant} = ${s.nat} [(info) = {type1: TYPE_${t1}, type2: TYPE_${t2}, height: ${s.height}, weight: ${s.weight}}];`;
});
const proto = `syntax = "proto3";

// The species catalog: every Pokémon up to Gen 4, by national Pokédex number, with the facts the
// game plays by. Generated once from pokefirered (1-386) and pokeemerald-expansion (387-493) by
// infra/pokemon/catalog.mjs; this file is the source now. Names, categories, descriptions, art and
// cries belong to each art style (tech-stack.md#decoupled-presentation); the FireRed one reads them
// by number at build time (make pokemon).
package pokeuniverse.species.v1;

import "google/protobuf/descriptor.proto";

option go_package = "pokeuniverse/lib-contracts/gen/go/pokeuniverse/species/v1;speciesv1";

// Gen 4's types, numbered as FireRed's TYPE_ constants plus one (MYSTERY is "???", Curse's type).
enum Type {
  TYPE_UNSPECIFIED = 0;
  TYPE_NORMAL = 1;
  TYPE_FIGHTING = 2;
  TYPE_FLYING = 3;
  TYPE_POISON = 4;
  TYPE_GROUND = 5;
  TYPE_ROCK = 6;
  TYPE_BUG = 7;
  TYPE_GHOST = 8;
  TYPE_STEEL = 9;
  TYPE_MYSTERY = 10;
  TYPE_FIRE = 11;
  TYPE_WATER = 12;
  TYPE_GRASS = 13;
  TYPE_ELECTRIC = 14;
  TYPE_PSYCHIC = 15;
  TYPE_ICE = 16;
  TYPE_DRAGON = 17;
  TYPE_DARK = 18;
}

// A species' facts, set on each Species value.
message SpeciesInfo {
  Type type1 = 1;
  // The same as type1 for a single-typed species.
  Type type2 = 2;
  // In decimeters.
  uint32 height = 3;
  // In hectograms.
  uint32 weight = 4;
}

extend google.protobuf.EnumValueOptions {
  SpeciesInfo info = 50001;
}

// Every species, numbered as the National Pokédex. The first 151 are the Kanto Pokédex.
enum Species {
  SPECIES_UNSPECIFIED = 0;
${lines.join("\n")}
}
`;
writeFileSync(protoOut, proto);
writeFileSync(habitatsOut, `[\n${habitats.map((pages) => `  [${pages.map((p) => `[${p.join(", ")}]`).join(", ")}]`).join(",\n")}\n]\n`);
console.log(`catalog: ${species.size} species; habitats: ${habitats.map((p) => p.length).join(" ")} pages`);
