// Adds `evolutions` to the species catalog, once (phase-5 M11): every way a species 1-493
// evolves into another of them, from pokeemerald-expansion's species info, which has Gen 4's. The
// catalog is our source afterwards. What the game can't express yet is left out and printed: items
// the item catalog doesn't have, Hoenn's places for location evolutions, contest Beauty.
//
//   node infra/pokemon/evolutions.mjs

import { readFileSync, writeFileSync } from "node:fs";

const CATALOG = "lib-contracts/proto/pokeuniverse/species/v1/catalog.proto";
const INFO = "references/pokeemerald-expansion/src/data/pokemon/species_info";
const FRIENDSHIP_THRESHOLD = 220;

function numbers(path, prefix) {
  const out = new Map();
  for (const m of readFileSync(path, "utf8").matchAll(new RegExp(`^\\s*${prefix}_([A-Z0-9_]+) = (\\d+)`, "gm"))) out.set(m[1], Number(m[2]));
  return out;
}

const catalog = readFileSync(CATALOG, "utf8");
const species = numbers(CATALOG, "SPECIES");
const items = numbers("lib-contracts/proto/pokeuniverse/item/v1/catalog.proto", "ITEM");
const moves = numbers("lib-contracts/proto/pokeuniverse/move/v1/catalog.proto", "MOVE");
const dropped = [];

/** A form's name to its species': FOO_PLANT → FOO. */
function speciesNumber(name) {
  for (let n = name; n; n = n.includes("_") ? n.slice(0, n.lastIndexOf("_")) : "") if (species.has(n)) return species.get(n);
  return 0;
}

/** The `{...}` groups directly inside a string. */
function groups(text) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{" && depth++ === 0) start = i + 1;
    else if (text[i] === "}" && --depth === 0) out.push(text.slice(start, i));
  }
  return out;
}

function fromEntry(source, entry) {
  const conditionsAt = entry.indexOf("CONDITIONS(");
  const [method, param, target] = (conditionsAt < 0 ? entry : entry.slice(0, conditionsAt)).split(",").map((s) => s.trim());
  const name = target?.replace("SPECIES_", "") ?? "";
  // Regional forms and later generations.
  if (!/^EVO_(LEVEL|ITEM|TRADE|SPLIT_FROM_EVO)$/.test(method) || !speciesNumber(name)) return null;
  if (/_(ALOLA|GALAR|HISUI|PALDEA)/.test(name)) return null;
  const e = { method: { EVO_LEVEL: "LEVEL", EVO_ITEM: "ITEM", EVO_TRADE: "TRADE", EVO_SPLIT_FROM_EVO: "SHED" }[method], species: speciesNumber(name) };
  const drop = (why) => (dropped.push(`${source} → ${name}: ${why}`), null);
  const needItem = (n) => items.get(n.replace("ITEM_", "").replace("UPGRADE", "UP_GRADE")) ?? 0;

  if (method === "EVO_LEVEL" && Number(param)) e.level = Number(param);
  if (method === "EVO_ITEM") {
    e.item = needItem(param);
    if (!e.item) return drop(param);
  }
  if (conditionsAt >= 0) {
    for (const group of groups(entry.slice(conditionsAt))) {
      const [condition, value] = group.split(",").map((s) => s.trim());
      switch (condition) {
        case "IF_NOT_REGION":
          break;
        case "IF_BAG_ITEM_COUNT":
          // Shedinja: Gen 4 spends a Poké Ball from the bag.
          e.item = needItem(value);
          break;
        case "IF_REGION":
          return null;
        case "IF_GENDER":
          e.gender = value === "MON_MALE" ? "GENDER_MALE" : "GENDER_FEMALE";
          break;
        case "IF_MIN_FRIENDSHIP":
          e.friendship = FRIENDSHIP_THRESHOLD;
          break;
        case "IF_TIME":
          if (value !== "TIME_DAY" && value !== "TIME_NIGHT") return drop(group);
          e.time = value === "TIME_DAY" ? "EVOLUTION_TIME_DAY" : "EVOLUTION_TIME_NIGHT";
          break;
        case "IF_NOT_TIME":
          if (value !== "TIME_DAY" && value !== "TIME_NIGHT") return drop(group);
          e.time = value === "TIME_DAY" ? "EVOLUTION_TIME_NIGHT" : "EVOLUTION_TIME_DAY";
          break;
        case "IF_HOLD_ITEM":
          e.item = needItem(value);
          if (!e.item) return drop(value);
          break;
        case "IF_KNOWS_MOVE":
          e.move = moves.get(value.replace("MOVE_", ""));
          if (!e.move) return drop(value);
          break;
        case "IF_ATK_GT_DEF":
          e.stats = "EVOLUTION_STATS_ATTACK_HIGHER";
          break;
        case "IF_ATK_EQ_DEF":
          e.stats = "EVOLUTION_STATS_EQUAL";
          break;
        case "IF_ATK_LT_DEF":
          e.stats = "EVOLUTION_STATS_DEFENSE_HIGHER";
          break;
        case "IF_PID_UPPER_MODULO_10_LT":
          e.personality = "EVOLUTION_PERSONALITY_LOW";
          break;
        case "IF_PID_UPPER_MODULO_10_GT":
          e.personality = "EVOLUTION_PERSONALITY_HIGH";
          break;
        case "IF_SPECIES_IN_PARTY":
          e.partySpecies = speciesNumber(value.replace("SPECIES_", ""));
          break;
        default:
          return drop(group);
      }
    }
  }
  return e;
}

function textFormat(e) {
  const fields = [`method: EVOLUTION_METHOD_${e.method}`, `species: ${e.species}`];
  if (e.level) fields.push(`level: ${e.level}`);
  if (e.item) fields.push(`item: ${e.item}`);
  if (e.gender) fields.push(`gender: ${e.gender}`);
  if (e.friendship) fields.push(`friendship: ${e.friendship}`);
  if (e.time) fields.push(`time: ${e.time}`);
  if (e.move) fields.push(`move: ${e.move}`);
  if (e.stats) fields.push(`stats: ${e.stats}`);
  if (e.personality) fields.push(`personality: ${e.personality}`);
  if (e.partySpecies) fields.push(`party_species: ${e.partySpecies}`);
  return `{${fields.join(", ")}}`;
}

/** Species number → its evolutions. A species' first form with a table speaks for it (Burmy's plant cloak). */
const table = new Map();
for (const gen of [1, 2, 3, 4]) {
  const text = readFileSync(`${INFO}/gen_${gen}_families.h`, "utf8").replace(/^#.*$/gm, "");
  let at = 0;
  for (const m of text.matchAll(/\[SPECIES_([A-Z0-9_]+)\]\s*=|\.evolutions = EVOLUTION\(/g)) {
    if (m[1]) {
      at = species.has(m[1]) || /_(PLANT|WEST|NORMAL)$/.test(m[1]) ? speciesNumber(m[1]) : 0;
      continue;
    }
    if (!at || table.has(at)) continue;
    let depth = 1;
    let end = m.index + m[0].length;
    for (; depth > 0; end++) depth += text[end] === "(" ? 1 : text[end] === ")" ? -1 : 0;
    const source = [...species].find(([, n]) => n === at)?.[0];
    const list = groups(text.slice(m.index + m[0].length, end - 1)).map((entry) => fromEntry(source, entry)).filter(Boolean);
    // The level evolution a shed follows comes first.
    if (list.length) table.set(at, list);
  }
}

let out = catalog;
let count = 0;
for (const [number, list] of table) {
  const name = [...species].find(([, n]) => n === number)[0];
  const re = new RegExp(`(  SPECIES_${name} = ${number} \\[\\(info\\) = \\{[\\s\\S]*?)\\n  \\}\\];`);
  if (!re.test(out)) throw new Error(`no ${name} in the catalog`);
  out = out.replace(re, (_, block) => `${block},\n    evolutions: [${list.map(textFormat).join(", ")}]\n  }];`);
  count++;
}
writeFileSync(CATALOG, out);
console.log(`${count} species got evolutions`);
if (dropped.length) console.log(`Left out:\n  ${[...new Set(dropped)].join("\n  ")}`);
