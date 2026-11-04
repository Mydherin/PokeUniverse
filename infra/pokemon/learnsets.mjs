// Adds `machine_moves` and `tutor_moves` to the species catalog, once (phase-6 M3), from @pkmn/sim's
// learnsets: what a species learns by TM or HM in Gen 3 or 4 (`3M`, `4M`), and from a tutor (`3T`,
// `4T`). FireRed's TMs teach Gen 3 moves and the rules are Gen 4, so both generations count. The
// catalog is our source afterwards. A species' base form speaks for it. Moves past the catalog's are
// left out and printed.
//
// docker run --rm -v "$PWD":/repo -w /tmp node:26-alpine sh -c 'npm init -y >/dev/null && npm i @pkmn/sim@<mic-battles version> >/dev/null &&
//   node /repo/infra/pokemon/learnsets.mjs /tmp /repo/lib-contracts/proto/pokeuniverse/species/v1/catalog.proto'

import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const [modules, catalogPath] = process.argv.slice(2);
const { Dex } = createRequire(join(modules, "package.json"))("@pkmn/sim");
const dex = Dex.forGen(4);
const MOVE_COUNT = 467;

const learnsets = Dex.data.Learnsets;
const dropped = new Set();

/** The moves of a learnset with one of these sources, by number. */
function movesFrom(learnset, sources) {
  const out = [];
  for (const [id, from] of Object.entries(learnset)) {
    if (!from.some((source) => sources.includes(source))) continue;
    const move = dex.moves.get(id);
    if (!move.exists || move.num > MOVE_COUNT) dropped.add(id);
    else out.push(move.num);
  }
  return out.sort((a, b) => a - b);
}

let catalog = readFileSync(catalogPath, "utf8");
let species = 0;
let machine = 0;
let tutor = 0;
const none = [];
catalog = catalog.replace(/( {2}SPECIES_([A-Z0-9_]+) = (\d+) \[\(info\) = \{[\s\S]*?)\n {2}\}\];/g, (_, block, name, number) => {
  const s = dex.species.all().find((x) => x.num === Number(number) && !x.forme) ?? dex.species.all().find((x) => x.num === Number(number));
  if (!s) throw new Error(`no ${name} in the sim`);
  const learnset = learnsets[s.id]?.learnset;
  if (!learnset) throw new Error(`no learnset for ${name}`);
  const machineMoves = movesFrom(learnset, ["3M", "4M"]);
  const tutorMoves = movesFrom(learnset, ["3T", "4T"]);
  species++;
  machine += machineMoves.length;
  tutor += tutorMoves.length;
  if (!machineMoves.length) none.push(name);
  let lines = "";
  if (machineMoves.length) lines += `,\n    machine_moves: [${machineMoves.join(", ")}]`;
  if (tutorMoves.length) lines += `,\n    tutor_moves: [${tutorMoves.join(", ")}]`;
  return `${block}${lines}\n  }];`;
});
writeFileSync(catalogPath, catalog);
console.log(`${species} species, ${machine} machine moves, ${tutor} tutor moves`);
console.log(`No machine moves: ${none.join(", ")}`);
if (dropped.size) console.log(`Left out: ${[...dropped].join(", ")}`);
