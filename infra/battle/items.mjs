// Run once to add what the item catalog lacked for Gen 4 battles; item/v1/catalog.proto and
// mic-battles/src/engine/ids.ts are the source from then on, edited by hand (phase-5 M12).
// Kept for reference.
//
// node infra/battle/items.mjs <pokemon-showdown> <pokeemerald-expansion> <lib-contracts proto dir> <ids.ts>
//
// - Every item Showdown's Gen 4 data adds (in the expansion's order, so the berries stay in
//   a row, numbered after FireRed's), and Old Gateau, a Gen 4 medicine Showdown doesn't need. Gen 4
//   prices come from the expansion. Names, descriptions and icons are read at build time (D8).
// - What each item does when used in battle, set on FireRed's items and the new ones (Gen 4 amounts).

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { preprocess, speciesBlocks } from "../pokemon/sources.mjs";

const [showdown, expansion, protoDir, idsPath] = process.argv.slice(2);
const catalogPath = join(protoDir, "item/v1/catalog.proto");
const LEFT_OUT = new Set(["cherishball", "parkball"]);
const EVOLUTION_STONES = new Set(["dawnstone", "duskstone", "shinystone"]);
const FIRST = 375;

const constant = (name) => `ITEM_${name.toUpperCase().replace(/['.]/g, "").replace(/[^A-Z0-9]+/g, "_")}`;

const entries = [...readFileSync(join(showdown, "data/items.ts"), "utf8").matchAll(/^\t(\w+): \{\n(.*?)^\t\},/gms)]
  .map(([, id, body]) => ({ id, gen: /\bgen: (\d)/.exec(body)?.[1], name: /name: "([^"]+)"/.exec(body)[1] }))
  .filter((e) => e.gen === "4" && !LEFT_OUT.has(e.id));
const order = new Map([...readFileSync(join(expansion, "include/constants/items.h"), "utf8").matchAll(/^\s*(ITEM_\w+) = (\d+),/gm)].map((m) => [m[1], Number(m[2])]));
const added = [{ id: "", name: "Old Gateau" }, ...entries].sort((a, b) => order.get(constant(a.name)) - order.get(constant(b.name)));

const blocks = new Map(speciesBlocks(preprocess(readFileSync(join(expansion, "src/data/items.h"), "utf8")), /^[ \t]+\[(\w+)\]\s*=\s*\{/gm));
function fields(e) {
  const block = blocks.get(constant(e.name));
  if (!block) throw new Error(`${e.name}: not in the expansion`);
  // `.price = 200` or `.price = (I_PRICE >= GEN_7) ? 3000 : 2100`; berries sell as FireRed's.
  const priced = /\.price\s*=\s*(?:\(.*?\)\s*\?\s*\d+\s*:\s*)?(\d+)/.exec(block);
  const price = e.id.endsWith("berry") ? 20 : Number(priced?.[1] ?? 0);
  const out = [];
  if (e.id.endsWith("ball")) out.push("pocket: POCKET_POKE_BALLS");
  else if (e.id.endsWith("berry")) out.push("pocket: POCKET_BERRY_POUCH");
  else if (e.id.endsWith("fossil")) out.push("pocket: POCKET_KEY_ITEMS");
  else out.push("pocket: POCKET_ITEMS");
  if (e.id.endsWith("fossil")) out.push("important: true");
  else if (price) out.push(`price: ${price}`);
  if (EVOLUTION_STONES.has(e.id)) out.push("field_use: FIELD_USE_EVOLUTION_ITEM", "party: true");
  else if (e.name === "Old Gateau") out.push("field_use: FIELD_USE_MEDICINE", "party: true");
  else if (!e.id.endsWith("ball")) out.push("field_use: FIELD_USE_NOT_NOW");
  return out.join(", ");
}

// What using them in battle does.
const ALL = "cures: [STATUS_SLEEP, STATUS_POISON, STATUS_TOXIC, STATUS_BURN, STATUS_FREEZE, STATUS_PARALYSIS], confusion: true";
const POISON = "cures: [STATUS_POISON, STATUS_TOXIC]";
const party = (effect) => `battle_use: BATTLE_USE_PARTY, effect: {${effect}}`;
const move = (effect) => `battle_use: BATTLE_USE_MOVE, effect: {${effect}}`;
const USES = {
  POTION: party("hp: 20"), SUPER_POTION: party("hp: 50"), HYPER_POTION: party("hp: 200"), MAX_POTION: party("hp_percent: 100"),
  FULL_RESTORE: party(`hp_percent: 100, ${ALL}`), FULL_HEAL: party(ALL), HEAL_POWDER: party(ALL), LAVA_COOKIE: party(ALL), OLD_GATEAU: party(ALL), LUM_BERRY: party(ALL),
  ANTIDOTE: party(POISON), PECHA_BERRY: party(POISON),
  BURN_HEAL: party("cures: [STATUS_BURN]"), RAWST_BERRY: party("cures: [STATUS_BURN]"),
  ICE_HEAL: party("cures: [STATUS_FREEZE]"), ASPEAR_BERRY: party("cures: [STATUS_FREEZE]"),
  AWAKENING: party("cures: [STATUS_SLEEP]"), CHESTO_BERRY: party("cures: [STATUS_SLEEP]"), BLUE_FLUTE: party("cures: [STATUS_SLEEP]"),
  PARALYZE_HEAL: party("cures: [STATUS_PARALYSIS]"), CHERI_BERRY: party("cures: [STATUS_PARALYSIS]"),
  YELLOW_FLUTE: party("confusion: true"), PERSIM_BERRY: party("confusion: true"), RED_FLUTE: party("infatuation: true"),
  REVIVE: party("revive: true, hp_percent: 50"), MAX_REVIVE: party("revive: true, hp_percent: 100"), REVIVAL_HERB: party("revive: true, hp_percent: 100"),
  FRESH_WATER: party("hp: 50"), SODA_POP: party("hp: 60"), LEMONADE: party("hp: 80"), MOOMOO_MILK: party("hp: 100"),
  ENERGY_POWDER: party("hp: 50"), ENERGY_ROOT: party("hp: 200"), BERRY_JUICE: party("hp: 20"), ORAN_BERRY: party("hp: 10"), SITRUS_BERRY: party("hp_percent: 25"),
  ETHER: move("pp: 10"), LEPPA_BERRY: move("pp: 10"), MAX_ETHER: move("pp_max: true"),
  ELIXIR: party("pp: 10, all_moves: true"), MAX_ELIXIR: party("pp_max: true, all_moves: true"),
};
for (const n of ["X_ATTACK", "X_DEFEND", "X_SPEED", "X_SPECIAL", "X_ACCURACY", "DIRE_HIT", "GUARD_SPEC", "POKE_FLUTE"]) USES[n] = "battle_use: BATTLE_USE_SELF";
const withUse = (line) => {
  const m = /^\s*ITEM_(\w+) = \d+ \[\(info\) = \{(.*)\}\];$/.exec(line);
  if (!m) return line;
  const use = USES[m[1]] ?? (m[2].includes("POCKET_POKE_BALLS") ? "battle_use: BATTLE_USE_BALL" : null);
  return use ? line.replace(/\}\];$/, `, ${use}}];`) : line;
};

let n = FIRST;
const lines = added.map((e) => `  ${constant(e.name)} = ${n++} [(info) = {${fields(e)}}];`);
const proto = readFileSync(catalogPath, "utf8");
const end = proto.lastIndexOf("\n}");
writeFileSync(catalogPath, `${proto.slice(0, end)}\n${lines.join("\n")}${proto.slice(end)}`.split("\n").map(withUse).join("\n"));

n = FIRST;
const ids = added.flatMap((e) => (n++, e.id ? [`  ${n - 1}: ${JSON.stringify(e.id)},`] : []));
const source = readFileSync(idsPath, "utf8");
const close = source.lastIndexOf("};");
writeFileSync(idsPath, `${source.slice(0, close)}${ids.join("\n")}\n${source.slice(close)}`);
console.log(`items: ${added.length} added, numbers ${FIRST}-${n - 1}`);
