// Adds `item_common` and `item_rare` to the species catalog, once (phase-7 M1): the items a wild
// Pokémon may hold. Gen 4's table for 1-493, read as data from pokeheartgold's personal data (user,
// 2026-11-09: wild items are a Pokémon rule, so Gen 4; FireRed's are Gen 3's). The catalog is our
// source afterwards. Items the item catalog doesn't have are left out and printed.
//
//   node infra/pokemon/wild-items.mjs

import { readFileSync, writeFileSync } from "node:fs";

const CATALOG = "lib-contracts/proto/pokeuniverse/species/v1/catalog.proto";
const PERSONAL = "references/pokeheartgold/files/poketool/personal/personal.json";
// Gen 4's spellings that our catalog writes as later games do.
const SPELLINGS = {
  SILVERPOWDER: "SILVER_POWDER", TINYMUSHROOM: "TINY_MUSHROOM", TWISTEDSPOON: "TWISTED_SPOON",
  DEEPSEASCALE: "DEEP_SEA_SCALE", DEEPSEATOOTH: "DEEP_SEA_TOOTH", NEVERMELTICE: "NEVER_MELT_ICE",
  BLACKGLASSES: "BLACK_GLASSES", BRIGHTPOWDER: "BRIGHT_POWDER", UP_GRADE: "UP_GRADE", THUNDERSTONE: "THUNDER_STONE",
};

function numbers(path, prefix) {
  const out = new Map();
  for (const m of readFileSync(path, "utf8").matchAll(new RegExp(`^\\s*${prefix}_([A-Z0-9_]+) = (\\d+)`, "gm"))) out.set(m[1], Number(m[2]));
  return out;
}

const species = numbers(CATALOG, "SPECIES");
const items = numbers("lib-contracts/proto/pokeuniverse/item/v1/catalog.proto", "ITEM");
const names = new Map([...species].map(([name, n]) => [n, name]));
const personal = JSON.parse(readFileSync(PERSONAL, "utf8")).baseStats;
const missing = [];

let out = readFileSync(CATALOG, "utf8");
let count = 0;
for (let number = 1; number <= 493; number++) {
  const name = names.get(number);
  const fields = [];
  personal[number].items.forEach((raw, i) => {
    const kind = i === 0 ? "common" : "rare";
    const item = raw.replace("ITEM_", "");
    if (item === "NONE") return;
    const n = items.get(SPELLINGS[item] ?? item);
    if (!n) missing.push(`${name} ${kind}: ${item}`);
    else fields.push(`item_${kind}: ${n}`);
  });
  if (!fields.length) continue;
  const re = new RegExp(`(  SPECIES_${name} = ${number} \\[\\(info\\) = \\{[\\s\\S]*?)\\n  \\}\\];`);
  if (!re.test(out)) throw new Error(`no ${name} in the catalog`);
  out = out.replace(re, (_, block) => `${block},\n    ${fields.join(", ")}\n  }];`);
  count++;
}
if (process.env.DRY) console.log("dry run: catalog not written");
else writeFileSync(CATALOG, out);
console.log(`${count} species got wild held items`);
if (missing.length) console.log(`Left out (not in the item catalog):\n  ${missing.join("\n  ")}`);
