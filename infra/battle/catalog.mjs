// Run once to write the battle catalogs; they are our source from then on, edited by hand like the
// item and species catalogs (docs/tech-stack.md#firered-as-reference, phase-5 D7).
// Kept for reference.
//
// docker run --rm -v "$PWD":/repo -w /tmp node:26-alpine sh -c 'npm init -y >/dev/null && npm i @pkmn/sim@<mic-battles version> >/dev/null &&
//   node /repo/infra/battle/catalog.mjs /tmp /repo/references/pokefirered /repo/references/pokeemerald-expansion /repo/lib-contracts/proto/pokeuniverse /repo/mic-battles/src/engine/ids.ts'
//
// The rules are Showdown's Gen 4 data (@pkmn/sim, the same version mic-battles plays with): moves,
// abilities, natures, base stats, abilities per species and level-up learnsets. The IDs and constant
// names are the games': FireRed's for moves 1-354, pokeemerald-expansion's for moves 355-467 and the
// abilities (both numbered as the official games, like Showdown). What Showdown doesn't keep (catch
// rate, base experience, EV yield, growth rate, gender ratio, friendship) comes from the decompilations
// (infra/pokemon/sources.mjs). Writes:
// - move/v1/catalog.proto, ability/v1/catalog.proto, pokemon/v1/nature.proto
// - species/v1/catalog.proto, keeping the types, heights and weights it already has
// - mic-battles/src/engine/ids.ts: Showdown's IDs for our species, moves, abilities, natures and items.

import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { readSpecies, NATIONAL_DEX_COUNT } from "../pokemon/sources.mjs";

const [simDir, firered, expansion, protoRoot, idsOut] = process.argv.slice(2);
const { Dex } = createRequire(join(simDir, "package.json"))("@pkmn/sim");
const dex = Dex.forGen(4);
const read = (f) => readFileSync(f, "utf8");

const MOVE_COUNT = 467;
const FIRERED_MOVE_COUNT = 354;
const ABILITY_COUNT = 123;

/** Numbers of a C enum's constants: explicit values, a known constant, or the previous one plus one. */
function cEnum(text) {
  const values = new Map();
  let next = 0;
  // Every entry counts, prefixed or not (MOVES_COUNT_GEN3 takes a number too).
  for (const m of text.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*(?:=\s*([\w+ -]+?))?\s*,/gm)) {
    let v = next;
    if (m[2] !== undefined) {
      const expr = m[2].replace(/[A-Z_]\w*/g, (id) => {
        if (!values.has(id)) throw new Error(`enum: ${id} before it's defined`);
        return values.get(id);
      });
      v = Function(`return (${expr});`)();
    }
    values.set(m[1], v);
    next = v + 1;
  }
  return values;
}

const byNumber = (map, prefix, from, to) => {
  const out = new Map();
  for (const [name, n] of map) if (name.startsWith(prefix) && n >= from && n <= to && !out.has(n)) out.set(n, name);
  return out;
};

// Constant names.
const fireredMoves = new Map([...read(join(firered, "include/constants/moves.h")).matchAll(/#define (MOVE_\w+) (\d+)/g)].map((m) => [Number(m[2]), m[1]]));
const expansionMoves = byNumber(cEnum(read(join(expansion, "include/constants/moves.h"))), "MOVE_", FIRERED_MOVE_COUNT + 1, MOVE_COUNT);
const abilityNames = byNumber(cEnum(read(join(expansion, "include/constants/abilities.h"))), "ABILITY_", 1, ABILITY_COUNT);
const moveConstant = (n) => (n <= FIRERED_MOVE_COUNT ? fireredMoves.get(n) : expansionMoves.get(n));

const squash = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
function checkName(kind, constant, showdownName, prefix) {
  const ours = squash(constant.slice(prefix.length));
  const theirs = squash(showdownName);
  // Renamed since Gen 3 (FireRed's spellings stay): Vice Grip, Faint Attack, Hi Jump Kick, Smelling Salts, ...
  if (ours !== theirs) console.log(`${kind} ${constant} is "${showdownName}" in Showdown`);
}

// Moves: one per number (Hidden Power's typed variants share 237).
const moves = new Map();
for (const m of dex.moves.all()) {
  if (m.num < 1 || m.num > MOVE_COUNT || m.isNonstandard === "CAP") continue;
  if (!moves.has(m.num)) moves.set(m.num, m);
}
// Hidden Power's typed variants share 237: the move is the untyped one.
moves.set(237, dex.moves.get("hiddenpower"));
const showdownType = (t) => (t === "???" ? "TYPE_MYSTERY" : `TYPE_${t.toUpperCase()}`);
const TARGETS = {
  normal: ["NORMAL", "One adjacent Pokémon the user picks."],
  self: ["SELF", "The user."],
  adjacentAlly: ["ADJACENT_ALLY", "An adjacent ally."],
  adjacentAllyOrSelf: ["ADJACENT_ALLY_OR_SELF", "The user or an adjacent ally."],
  adjacentFoe: ["ADJACENT_FOE", "One adjacent foe the user picks."],
  allAdjacent: ["ALL_ADJACENT", "Every adjacent Pokémon, allies included."],
  allAdjacentFoes: ["ALL_ADJACENT_FOES", "Every adjacent foe."],
  allies: ["ALLIES", "The user and its allies."],
  allySide: ["ALLY_SIDE", "The user's side of the field."],
  allyTeam: ["ALLY_TEAM", "The user's whole party."],
  any: ["ANY", "Any other Pokémon, even far away."],
  foeSide: ["FOE_SIDE", "The foes' side of the field."],
  randomNormal: ["RANDOM_NORMAL", "A random adjacent foe."],
  scripted: ["SCRIPTED", "Decided by the move (e.g. Counter: whoever last hit the user)."],
  all: ["ALL", "The whole field."],
};
const FLAGS = {
  contact: "Makes contact (Rough Skin, Static, …).",
  protect: "Blocked by Protect and Detect.",
  mirror: "Can be copied by Mirror Move.",
  sound: "Sound-based (Soundproof).",
  punch: "Punching (Iron Fist).",
  snatch: "Stolen by Snatch.",
  reflectable: "Bounced back by Magic Coat.",
  charge: "Charges on the first turn.",
  recharge: "The user must recharge next turn.",
  heal: "Heals (blocked by Heal Block).",
  gravity: "Can't be used under Gravity.",
  defrost: "Thaws the user out.",
  distance: "Reaches any Pokémon in triple battles.",
  bypasssub: "Hits through a Substitute.",
  nonsky: "Fails in Sky Battles.",
  metronome: "Can be called by Metronome.",
  noassist: "Can't be called by Assist.",
  failcopycat: "Can't be called by Copycat.",
  failmefirst: "Fails with Me First.",
  nosleeptalk: "Can't be called by Sleep Talk.",
  failencore: "Encore fails on it.",
  failinstruct: "Fails with Instruct.",
  allyanim: "Animated against an ally.",
  cantusetwice: "Can't be used twice in a row.",
  bullet: "Ball or bomb (Bulletproof).",
  bite: "Biting (Strong Jaw).",
  powder: "Powder (Grass types are immune since Gen 6).",
  dance: "A dance (Dancer).",
  pulse: "A pulse (Mega Launcher).",
  slicing: "Slicing (Sharpness).",
  wind: "Wind (Wind Rider).",
  futuremove: "Hits a few turns later.",
  mustpressure: "Pressure takes PP even when it doesn't target the holder.",
  noparentalbond: "Hits once with Parental Bond.",
  minimize: "Double damage against a Minimized target (Stomp).",
  failmimic: "Can't be copied by Mimic.",
  nosketch: "Can't be copied by Sketch.",
};
const flagName = (f) => `MOVE_FLAG_${f.toUpperCase()}`;
const usedFlags = new Set();
const moveLines = [];
for (let n = 1; n <= MOVE_COUNT; n++) {
  const m = moves.get(n);
  const constant = moveConstant(n);
  if (!m || !constant) throw new Error(`move ${n}: missing (${constant}, ${m?.id})`);
  checkName("move", constant, m.name, "MOVE_");
  if (!TARGETS[m.target]) throw new Error(`move ${constant}: target ${m.target}`);
  const flags = Object.keys(m.flags).filter((f) => m.flags[f]).sort();
  for (const f of flags) {
    if (!FLAGS[f]) throw new Error(`move ${constant}: unknown flag ${f}`);
    usedFlags.add(f);
  }
  const chance = m.secondary?.chance ?? m.secondaries?.[0]?.chance ?? 0;
  const fields = [`type: ${showdownType(m.type)}`, `category: CATEGORY_${m.category.toUpperCase()}`];
  if (m.basePower) fields.push(`power: ${m.basePower}`);
  if (m.accuracy !== true) fields.push(`accuracy: ${m.accuracy}`);
  fields.push(`pp: ${m.pp}`);
  if (m.priority) fields.push(`priority: ${m.priority}`);
  fields.push(`target: TARGET_${TARGETS[m.target][0]}`);
  if (flags.length) fields.push(`flags: [${flags.map(flagName).join(", ")}]`);
  if (chance) fields.push(`effect_chance: ${chance}`);
  if (m.critRatio && m.critRatio > 1) fields.push(`crit_stage: ${m.critRatio - 1}`);
  moveLines.push(`  ${constant} = ${n} [(info) = {${fields.join(", ")}}];`);
}
const flagLines = [...usedFlags].sort().map((f, i) => `  // ${FLAGS[f]}\n  ${flagName(f)} = ${i + 1};`);

writeFileSync(
  join(protoRoot, "move/v1/catalog.proto"),
  `syntax = "proto3";

// The move catalog: every move up to Gen 4, by its number in the games, with the rules mic-core,
// mic-battles and the client read. Converted once by infra/battle/catalog.mjs from Showdown's Gen 4
// data (@pkmn/sim) with FireRed's constant names for 1-354 and pokeemerald-expansion's for 355-467;
// this file is the source now. Names, descriptions and animations belong to each art style
// (tech-stack.md#decoupled-presentation); the FireRed one reads them by number at build time.
package pokeuniverse.move.v1;

import "google/protobuf/descriptor.proto";
import "pokeuniverse/species/v1/catalog.proto";

option go_package = "pokeuniverse/lib-contracts/gen/go/pokeuniverse/move/v1;movev1";

// Gen 4's split: each move is physical or special by itself, not by its type.
enum Category {
  CATEGORY_UNSPECIFIED = 0;
  CATEGORY_PHYSICAL = 1;
  CATEGORY_SPECIAL = 2;
  CATEGORY_STATUS = 3;
}

// Who a move can hit.
enum Target {
  TARGET_UNSPECIFIED = 0;
${Object.values(TARGETS).map(([name, doc], i) => `  // ${doc}\n  TARGET_${name} = ${i + 1};`).join("\n")}
}

enum MoveFlag {
  MOVE_FLAG_UNSPECIFIED = 0;
${flagLines.join("\n")}
}

// A move's rules, set on each Move value.
message MoveInfo {
  pokeuniverse.species.v1.Type type = 1;
  Category category = 2;
  // 0 for status moves and moves whose power varies (Low Kick, Return, …).
  uint32 power = 3;
  // Percent; 0 never misses.
  uint32 accuracy = 4;
  uint32 pp = 5;
  // -7 to +5: higher moves first.
  int32 priority = 6;
  Target target = 7;
  repeated MoveFlag flags = 8;
  // Percent chance of the secondary effect (Flamethrower's burn: 10); 0 when it has none or always.
  uint32 effect_chance = 9;
  // Extra critical-hit stages (Slash: 1).
  uint32 crit_stage = 10;
}

extend google.protobuf.EnumValueOptions {
  MoveInfo info = 50002;
}

// Every move up to Gen 4, numbered as in the games.
enum Move {
  MOVE_UNSPECIFIED = 0;
${moveLines.join("\n")}
}
`,
);

// Abilities.
const abilities = new Map(dex.abilities.all().filter((a) => a.num >= 1 && a.num <= ABILITY_COUNT).map((a) => [a.num, a]));
const abilityLines = [];
for (let n = 1; n <= ABILITY_COUNT; n++) {
  const a = abilities.get(n);
  const constant = abilityNames.get(n);
  if (!a || !constant) throw new Error(`ability ${n}: missing`);
  checkName("ability", constant, a.name, "ABILITY_");
  abilityLines.push(`  ${constant} = ${n};`);
}
writeFileSync(
  join(protoRoot, "ability/v1/catalog.proto"),
  `syntax = "proto3";

// Every ability up to Gen 4, numbered as in the games (pokeemerald-expansion's constant names).
// Converted once by infra/battle/catalog.mjs; this file is the source now. What each does is
// Showdown's (mic-battles); names and descriptions belong to each art style.
package pokeuniverse.ability.v1;

option go_package = "pokeuniverse/lib-contracts/gen/go/pokeuniverse/ability/v1;abilityv1";

enum Ability {
  ABILITY_UNSPECIFIED = 0;
${abilityLines.join("\n")}
}
`,
);
const abilityByName = new Map([...abilities.values()].map((a) => [a.name, abilityNames.get(a.num)]));

// Natures, numbered as FireRed's NATURE_ constants plus one (personality % 25 + 1).
const STAT = { atk: "STAT_ATTACK", def: "STAT_DEFENSE", spe: "STAT_SPEED", spa: "STAT_SP_ATTACK", spd: "STAT_SP_DEFENSE" };
const natureNames = [...read(join(firered, "include/constants/pokemon.h")).matchAll(/#define (NATURE_\w+)\s+(\d+)/g)].sort((a, b) => a[2] - b[2]).map((m) => m[1]);
const natureLines = natureNames.map((constant, i) => {
  const n = dex.natures.get(constant.slice("NATURE_".length));
  if (!n.exists) throw new Error(`nature ${constant}: missing`);
  const info = n.plus ? ` [(info) = {raised: ${STAT[n.plus]}, lowered: ${STAT[n.minus]}}]` : "";
  return `  ${constant} = ${i + 1}${info};`;
});
writeFileSync(
  join(protoRoot, "pokemon/v1/nature.proto"),
  `syntax = "proto3";

// The 25 natures, numbered as FireRed's NATURE_ constants plus one: a Pokémon's nature is its
// personality % 25, plus one. Converted once by infra/battle/catalog.mjs; this file is the source now.
package pokeuniverse.pokemon.v1;

import "google/protobuf/descriptor.proto";
import "pokeuniverse/pokemon/v1/stats.proto";

option go_package = "pokeuniverse/lib-contracts/gen/go/pokeuniverse/pokemon/v1;pokemonv1";

// What a nature changes: the raised stat ×1.1, the lowered one ×0.9. Unset for neutral natures.
message NatureInfo {
  Stat raised = 1;
  Stat lowered = 2;
}

extend google.protobuf.EnumValueOptions {
  NatureInfo info = 50003;
}

enum Nature {
  NATURE_UNSPECIFIED = 0;
${natureLines.join("\n")}
}
`,
);

// Species: the facts the catalog already has, plus the battle ones.
const speciesProto = join(protoRoot, "species/v1/catalog.proto");
const current = new Map(
  [...read(speciesProto).matchAll(/^\s*(SPECIES_\w+) = (\d+) \[\(info\) = \{type1: (\w+), type2: (\w+), height: (\d+), weight: (\d+)\}\];/gm)].map((m) => [
    Number(m[2]),
    { constant: m[1], type1: m[3], type2: m[4], height: m[5], weight: m[6] },
  ]),
);
if (current.size !== NATIONAL_DEX_COUNT) throw new Error(`species catalog: ${current.size} species read (already converted?)`);
const refs = readSpecies(firered, expansion);
const showdownSpecies = new Map(dex.species.all().filter((s) => s.num >= 1 && s.num <= NATIONAL_DEX_COUNT && !s.forme).map((s) => [s.num, s]));
const learnsets = Dex.data.Learnsets;
const statsLiteral = (o) => {
  const parts = Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
  return `{${parts.join(", ")}}`;
};
const speciesLines = [];
const ids = { species: [""], moves: [""], abilities: [""], natures: [""], items: {} };
for (let n = 1; n <= NATIONAL_DEX_COUNT; n++) {
  const c = current.get(n);
  const s = showdownSpecies.get(n);
  const r = refs.get(n);
  if (!c || !s || !r) throw new Error(`species ${n}: missing`);
  const types = s.types.map(showdownType);
  if (types[0] !== c.type1 || (types[1] ?? types[0]) !== c.type2) console.log(`species ${c.constant}: types ${c.type1}/${c.type2}, Showdown ${types.join("/")}`);
  const abil = [s.abilities[0], s.abilities[1]].filter(Boolean).map((a) => {
    const constant = abilityByName.get(a);
    if (!constant) throw new Error(`species ${c.constant}: ability ${a}`);
    return constant;
  });
  const bs = s.baseStats;
  const ev = r.battle.evYield;
  // Gen 4 level-up moves ("4L<level>"), by level then move number; a move learned at two levels keeps both.
  const learnset = learnsets[s.id]?.learnset ?? {};
  const levelMoves = [];
  for (const [id, sources] of Object.entries(learnset)) {
    const move = dex.moves.get(id);
    if (!move.exists || move.num > MOVE_COUNT) continue;
    for (const level of new Set(sources.filter((src) => /^4L\d+$/.test(src)).map((src) => Number(src.slice(2))))) levelMoves.push([level, move.num]);
  }
  if (!levelMoves.length) throw new Error(`species ${c.constant}: no Gen 4 level-up moves`);
  levelMoves.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const lines = [
    `type1: ${c.type1}, type2: ${c.type2}, height: ${c.height}, weight: ${c.weight},`,
    `base_stats: ${statsLiteral({ hp: bs.hp, attack: bs.atk, defense: bs.def, speed: bs.spe, sp_attack: bs.spa, sp_defense: bs.spd })},`,
    `abilities: [${abil.join(", ")}], gender_ratio: ${r.battle.genderRatio}, growth_rate: ${r.battle.growthRate.replace("GROWTH_", "GROWTH_RATE_")},`,
    `catch_rate: ${r.battle.catchRate}, base_exp: ${r.battle.expYield}, ev_yield: ${statsLiteral({ hp: ev[0], attack: ev[1], defense: ev[2], speed: ev[3], sp_attack: ev[4], sp_defense: ev[5] })}, base_friendship: ${r.battle.friendship},`,
    `level_moves: [${levelMoves.map(([level, move]) => `{level: ${level}, move: ${move}}`).join(", ")}]`,
  ];
  speciesLines.push(`  ${c.constant} = ${n} [(info) = {\n${lines.map((l) => `    ${l}`).join("\n")}\n  }];`);
  ids.species.push(s.id);
}
for (let n = 1; n <= MOVE_COUNT; n++) ids.moves.push(moves.get(n).id);
for (let n = 1; n <= ABILITY_COUNT; n++) ids.abilities.push(abilities.get(n).id);
for (const constant of natureNames) ids.natures.push(dex.natures.get(constant.slice("NATURE_".length)).name);

const species = read(speciesProto);
const header = species.slice(0, species.indexOf("// A species' facts"));
writeFileSync(
  speciesProto,
  `${header
    .replace(`import "google/protobuf/descriptor.proto";`, `import "google/protobuf/descriptor.proto";\nimport "pokeuniverse/ability/v1/catalog.proto";\nimport "pokeuniverse/pokemon/v1/stats.proto";`)
    .replace(
      "infra/pokemon/catalog.mjs; this file is the source now.",
      "infra/pokemon/catalog.mjs, the battle facts (base stats, abilities, growth, learnsets, …) by\n// infra/battle/catalog.mjs from Showdown's Gen 4 data and both references; this file is the source now.",
    )}// How fast a species gains levels (experience for each level), numbered as FireRed's GROWTH_ constants plus one.
enum GrowthRate {
  GROWTH_RATE_UNSPECIFIED = 0;
  GROWTH_RATE_MEDIUM_FAST = 1;
  GROWTH_RATE_ERRATIC = 2;
  GROWTH_RATE_FLUCTUATING = 3;
  GROWTH_RATE_MEDIUM_SLOW = 4;
  GROWTH_RATE_FAST = 5;
  GROWTH_RATE_SLOW = 6;
}

// A move learned by leveling up.
message LevelMove {
  uint32 level = 1;
  // A pokeuniverse.move.v1.Move number (the move catalog uses this file's Type, so it can't be imported here).
  uint32 move = 2;
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
  pokeuniverse.pokemon.v1.Stats base_stats = 5;
  // One or two (Gen 4 has no hidden abilities); a Pokémon's personality picks between two.
  repeated pokeuniverse.ability.v1.Ability abilities = 6;
  // FireRed's gender threshold: 0 male only, 254 female only, 255 genderless; otherwise female when
  // the personality's low byte is below it (31: 12.5% female, 127: 50%).
  uint32 gender_ratio = 7;
  GrowthRate growth_rate = 8;
  // 3 (hardest) to 255.
  uint32 catch_rate = 9;
  // Base experience a defeated Pokémon gives (Gen 4).
  uint32 base_exp = 10;
  // EVs a defeated Pokémon gives.
  pokeuniverse.pokemon.v1.Stats ev_yield = 11;
  uint32 base_friendship = 12;
  // Gen 4's level-up learnset, by level (level 1 first).
  repeated LevelMove level_moves = 13;
}

extend google.protobuf.EnumValueOptions {
  SpeciesInfo info = 50001;
}

// Every species, numbered as the National Pokédex. The first 151 are the Kanto Pokédex.
enum Species {
  SPECIES_UNSPECIFIED = 0;
${speciesLines.join("\n")}
}
`,
);

// Items Showdown knows in Gen 4, by our (FireRed's) item ID.
const itemCatalog = read(join(protoRoot, "item/v1/catalog.proto"));
for (const m of itemCatalog.matchAll(/^\s*ITEM_(\w+) = (\d+)/gm)) {
  if (m[1] === "UNSPECIFIED") continue;
  const item = dex.items.get(m[1]);
  if (item.exists && item.gen <= 4 && !item.isNonstandard) ids.items[m[2]] = item.id;
}

const list = (a) => `[\n  ${a.map((s) => JSON.stringify(s)).join(",\n  ")},\n]`;
writeFileSync(
  idsOut,
  `// Showdown's IDs (@pkmn/sim, Gen 4) for the numbers of our catalogs in lib-contracts: species,
// moves, abilities, natures (by enum number; index 0 is unspecified) and the items Showdown knows.
// Converted once by infra/battle/catalog.mjs with the catalogs; edit both together.

/** By pokeuniverse.species.v1.Species number. */
export const SPECIES: readonly string[] = ${list(ids.species)};

/** By pokeuniverse.move.v1.Move number. */
export const MOVES: readonly string[] = ${list(ids.moves)};

/** By pokeuniverse.ability.v1.Ability number. */
export const ABILITIES: readonly string[] = ${list(ids.abilities)};

/** By pokeuniverse.pokemon.v1.Nature number. */
export const NATURES: readonly string[] = ${list(ids.natures)};

/** By pokeuniverse.item.v1.Item number; items Showdown doesn't know have no effect in battle. */
export const ITEMS: Readonly<Record<number, string>> = {
${Object.entries(ids.items).map(([n, id]) => `  ${n}: ${JSON.stringify(id)},`).join("\n")}
};
`,
);
console.log(`catalog: ${MOVE_COUNT} moves (${usedFlags.size} flags), ${ABILITY_COUNT} abilities, ${natureNames.length} natures, ${NATIONAL_DEX_COUNT} species, ${Object.keys(ids.items).length} items known to Showdown`);
