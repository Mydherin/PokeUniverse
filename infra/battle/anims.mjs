// Run once to write the battle animation scripts as data; they are our source from then on, edited
// by hand like the other converted catalogs (phase-5 D9). Kept for reference.
//
// node infra/battle/anims.mjs references/pokefirered references/pokeemerald-expansion \
//   lib-contracts/proto/pokeuniverse/move/v1/catalog.proto spa-pokeuniverse/src/game/firered/battle/anims
//
// Reads each game's data/battle_anim_scripts.s with its own macros (asm/macros/battle_anim_script.inc):
// wrapper macros (the expansion's create_*_sprite…) expand to the commands they call. Numbers are
// evaluated from the headers the script includes; templates, tasks, tags and labels stay names,
// sounds become our sound IDs (SE_M_SWIFT → se_m_swift; a sound task's args[0] also as `se`). Each label is a block of commands; a block
// that falls through to the next one ends with a goto. Writes:
// - firered.json: moves 1-354, the general, status and special animations, and every block they reach
// - expansion.json: moves 355-467 (the expansion's gBattleAnimMove_*) and the blocks they reach
// Both: { moves: {number: label}, general?, status?, special?: {B_ANIM_*: label}, scripts: {label: [command]} }

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const [firered, expansion, catalogProto, outDir] = process.argv.slice(2);
const read = (f) => readFileSync(f, "utf8");
const FIRERED_MOVES = 354;
const MOVE_COUNT = 467;

// Macro params that are names, not numbers; and the JSON key each param gets.
const NAME_PARAMS = new Set(["template", "addr", "tag", "ptr", "ptr1", "ptr2", "jumpInstr"]);
const LABEL_PARAMS = new Set(["ptr", "ptr1", "ptr2", "jumpInstr"]);
const SOUND_PARAMS = new Set(["se"]);
const KEYS = { anim_battler: "battler", subpriority_offset: "subpriority", argv: "args", addr: "task", ptr: "label", jumpInstr: "label", ptr1: "first", ptr2: "second" };
// Tasks whose args[0] is a sound (battle_anim_sound_tasks.c): the command also names it as `se`.
const SOUND_ARG_TASKS = new Set(["SoundTask_PlaySE1WithPanning", "SoundTask_PlaySE2WithPanning", "SoundTask_LoopSEAdjustPanning", "SoundTask_PlaySeChangingVolume"]);
// Commands the game ignores.
const SKIP = new Set(["nop", "nop2"]);
// Commands that never fall through.
const TERMINAL = new Set(["end", "return", "goto", "choosetwoturnanim"]);

// ---------- C constants ----------

/** #defines of a header and the headers it includes, from one repository's include/. */
function readDefines(repo, header, defines, seen = new Set(), from = "") {
  // "battle.h" next to the including header first, then from include/.
  const near = join(repo, "include", from, header);
  const path = existsSync(near) ? near : join(repo, "include", header);
  if (seen.has(path) || !existsSync(path)) return;
  seen.add(path);
  const text = read(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\\\n/g, " ");
  // enum { A, B = 2, C }: C is 3 (values stay expressions until evaluated).
  for (const [, body] of text.replace(/\/\/.*$/gm, "").matchAll(/\benum\b[^{;]*\{([^}]*)\}/g)) {
    let prev = "-1";
    let step = 0;
    for (const item of splitArgs(body)) {
      const [, name, value] = item.match(/^(\w+)\s*(?:=\s*([\s\S]+))?$/) ?? [];
      if (!name) continue;
      if (value !== undefined) [prev, step] = [value.trim(), 0];
      else step++;
      if (!defines.has(name)) defines.set(name, { body: step ? `(${prev}) + ${step}` : prev });
    }
  }
  for (const line of text.split("\n")) {
    const inc = line.match(/^\s*#include\s+"([^"]+)"/);
    if (inc) readDefines(repo, inc[1], defines, seen, dirname(relative(join(repo, "include"), path)));
    const fn = line.match(/^\s*#define\s+(\w+)\(([^)]*)\)\s+(.*?)\s*(\/\/.*)?$/);
    if (fn) {
      defines.set(fn[1], { params: fn[2].split(",").map((p) => p.trim()), body: fn[3] });
      continue;
    }
    const obj = line.match(/^\s*#define\s+(\w+)\s+(.*?)\s*(\/\/.*)?$/);
    if (obj && obj[2] !== "") defines.set(obj[1], { body: obj[2] });
  }
}

const OPERATOR = /[|&^+\-*/%<>=!~(]/;

/**
 * Splits a command's args as gas does: at commas outside parentheses, and at spaces between two
 * operands (`SOUND_PAN_TARGET 10 3`), not next to an operator (`1 | 2`).
 */
function splitArgs(s) {
  const out = [];
  let depth = 0;
  let cur = "";
  const flush = () => {
    if (cur.trim() !== "") out.push(cur.trim());
    cur = "";
  };
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      flush();
      continue;
    }
    if (/\s/.test(ch) && depth === 0) {
      const before = cur.trimEnd().at(-1);
      const after = s.slice(i).trimStart()[0];
      if (before && after && after !== "," && !OPERATOR.test(before) && !OPERATOR.test(after) && after !== ")") {
        flush();
        continue;
      }
    }
    cur += ch;
  }
  flush();
  return out;
}

function makeEvaluator(defines, unresolved, current) {
  const expand = (expr, depth = 0) => {
    if (depth > 30) throw new Error(`define loop in ${expr}`);
    let changed = false;
    let out = "";
    let i = 0;
    while (i < expr.length) {
      const m = /^[A-Za-z_]\w*/.exec(expr.slice(i));
      if (!m || (i > 0 && /[\w]/.test(expr[i - 1]))) {
        out += expr[i++];
        continue;
      }
      const name = m[0];
      i += name.length;
      const def = defines.get(name);
      if (!def) {
        out += name;
        continue;
      }
      changed = true;
      if (def.params) {
        // Function-like: read its parenthesized args.
        let j = i;
        while (expr[j] === " ") j++;
        if (expr[j] !== "(") throw new Error(`${name} without args in ${expr}`);
        let d = 0;
        let k = j;
        for (; k < expr.length; k++) {
          if (expr[k] === "(") d++;
          if (expr[k] === ")" && --d === 0) break;
        }
        const args = splitArgs(expr.slice(j + 1, k));
        let body = def.body;
        def.params.forEach((p, n) => (body = body.replace(new RegExp(`\\b${p}\\b`, "g"), `(${args[n]})`)));
        out += `(${body})`;
        i = k + 1;
      } else out += `(${def.body})`;
    }
    return changed ? expand(out, depth + 1) : out;
  };
  return (expr, where) => {
    if (expr === undefined || expr.trim() === "") throw new Error(`${where}: empty value`);
    const js = expand(expr).replace(/\b(\d+)[uUlL]+\b/g, "$1");
    const left = js.replace(/\b0x[\da-f]+\b/gi, "").match(/\b[A-Za-z_]\w*/g);
    if (left?.length) {
      for (const n of left) unresolved.push({ name: n, where, label: current() });
      return 0;
    }
    if (!/^[\s\d xXa-fA-F()+\-*/%<>=!&|^~?:]*$/.test(js)) throw new Error(`can't evaluate ${expr} (${js})`);
    try {
      return Number(Function(`"use strict"; return (${js});`)());
    } catch {
      throw new Error(`${where}: can't evaluate ${expr}`);
    }
  };
}

// ---------- gas macros ----------

/** The macros of a battle_anim_script.inc: params (name, required, vararg, default) and body. */
function readMacros(file) {
  const macros = new Map();
  const lines = read(file).split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*\.macro\s+(\w+)\s*(.*)$/);
    if (!m) continue;
    const params = m[2]
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const [, name, kind, def] = p.match(/^(\w+)(?::(\w+))?(?:=(.*))?$/);
        return { name, vararg: kind === "vararg", def: def?.trim() };
      });
    const body = [];
    while (!/^\s*\.endm\b/.test(lines[++i])) body.push(lines[i].replace(/@.*$/, "").trim());
    const core = body.some((l) => /^\.(2|4)?byte\b/.test(l));
    macros.set(m[1].toLowerCase(), { params, body: body.filter(Boolean), core });
  }
  return macros;
}

/** Binds a call's args to a macro's params (`name=value`, else by position; the vararg takes the rest). */
function bind(macro, args) {
  const bound = {};
  const named = new Map();
  const positional = [];
  for (const a of args) {
    const m = a.match(/^(\w+)\s*=(?!=)\s*(.*)$/);
    if (m && macro.params.some((p) => p.name === m[1])) named.set(m[1], m[2]);
    else positional.push(a);
  }
  macro.params.forEach((p, n) => {
    if (p.vararg) bound[p.name] = positional.slice(n);
    else bound[p.name] = named.get(p.name) ?? positional[n] ?? p.def;
  });
  return bound;
}

// ---------- scripts ----------

/**
 * Reads a battle_anim_scripts.s into blocks: label → commands (each `{op, ...}`), in file order,
 * plus the order of labels and the tables (`.4byte Label @ B_ANIM_X`).
 */
function readScripts(repo, overrides) {
  const src = read(join(repo, "data/battle_anim_scripts.s"));
  const defines = new Map();
  // gba/io_reg.h: the BLDCNT_* that setbldcnt takes (gas has them from constants.inc).
  for (const [, h] of [...src.matchAll(/^#include "([^"]+)"/gm), [, "gba/io_reg.h"]]) readDefines(repo, h, defines);
  for (const [k, v] of Object.entries({ TRUE: "1", FALSE: "0", ...overrides })) defines.set(k, { body: v });
  // Names no header defines, with the block they're in: only an error where a script reaches.
  const unresolved = [];
  let blockLabel = null;
  const evaluate = makeEvaluator(defines, unresolved, () => blockLabel);
  const macros = readMacros(join(repo, "asm/macros/battle_anim_script.inc"));

  // A sound by its number (some scripts give it as one): songs.h's SE_*/MUS_* name, as our ID.
  let songs = null;
  const soundName = (n, where) => {
    songs ??= new Map([...defines.keys()].filter((k) => /^(SE|MUS)_\w+$/.test(k)).map((k) => [evaluate(k, where), k]).reverse());
    if (!songs.has(n)) throw new Error(`${where}: no sound ${n}`);
    return songs.get(n).toLowerCase();
  };

  const blocks = new Map();
  const order = [];
  const tables = new Map();
  let block = null;
  let table = null;
  // .if/.else stack: each entry is whether its lines are kept.
  const conds = [];
  const keeping = () => conds.every(Boolean);

  const conditional = (line, evalCond) => {
    let m;
    if ((m = line.match(/^\.if\s+(.*)$/))) return conds.push(keeping() && evalCond(m[1]) !== 0), true;
    if ((m = line.match(/^\.ifb\s*(.*)$/))) return conds.push(m[1].trim() === ""), true;
    if ((m = line.match(/^\.ifnb\s*(.*)$/))) return conds.push(m[1].trim() !== ""), true;
    if (/^\.else\b/.test(line)) return conds.push(!conds.pop()), true;
    if (/^\.endif\b/.test(line)) return conds.pop(), true;
    return false;
  };

  const emit = (name, args, where) => {
    // gas macro names ignore case (`Call`).
    const op = name.toLowerCase();
    if (SKIP.has(op)) return;
    const macro = macros.get(op);
    if (!macro) throw new Error(`${where}: unknown command ${op}`);
    const bound = bind(macro, args);
    if (!macro.core) {
      // A wrapper: expand its body with the args, as gas would.
      for (const raw of macro.body) {
        let line = raw.replace(/\\(\w+)/g, (_, p) => (p in bound ? (Array.isArray(bound[p]) ? bound[p].join(", ") : bound[p] ?? "") : _));
        if (conditional(line, (e) => evaluate(e, where))) continue;
        if (!keeping() || /^\.(error|warning)\b/.test(line)) continue;
        const [, sub, rest = ""] = line.match(/^(\w+)\s*(.*)$/);
        emit(sub, splitArgs(rest), where);
      }
      return;
    }
    const command = { op };
    for (const p of macro.params) {
      const v = bound[p.name];
      const key = KEYS[p.name] ?? p.name;
      if (p.vararg) command[key] = v.map((a) => (evaluate(a, where) << 16) >> 16);
      else if (v === undefined) continue;
      else if (LABEL_PARAMS.has(p.name)) command[key] = v;
      else if (NAME_PARAMS.has(p.name)) command[key] = v;
      else if (SOUND_PARAMS.has(p.name)) {
        // The expansion plays SOUND_PAN_ATTACKER as a sound twice (a bug: no sound plays).
        if (!/^(SE|MUS)_/.test(v)) return console.warn(`${where}: ${v} isn't a sound, dropped`);
        command[key] = v.toLowerCase();
      }
      else command[key] = evaluate(v, where);
    }
    if (SOUND_ARG_TASKS.has(command.task)) command.se = soundName(command.args[0], where);
    block.push(command);
  };

  src.split("\n").forEach((raw, n) => {
    const where = `${repo}:${n + 1}`;
    const line = raw.replace(/@.*$/, "").replace(/\/\/.*$/, "").trim();
    const comment = raw.match(/@\s*(\w+)/)?.[1];
    const def = line.match(/^#define\s+(\w+)\s+(.+)$/);
    if (def) return void defines.set(def[1], { body: def[2] });
    if (line === "" || line.startsWith("#")) return;
    if (conditional(line, (e) => evaluate(e, where))) return;
    if (!keeping()) return;
    const label = line.match(/^(\w+)\s*::?$/);
    if (label) {
      table = null;
      if (label[1].startsWith("gBattleAnims_")) {
        table = [];
        tables.set(label[1], table);
        block = null;
        return;
      }
      block = [];
      blockLabel = label[1];
      blocks.set(label[1], block);
      order.push(label[1]);
      return;
    }
    const set = line.match(/^\.(?:set|equ)\s+(\w+)\s*,\s*(.+)$/);
    if (set) return void defines.set(set[1], { body: set[2] });
    if (line.startsWith(".")) {
      const entry = line.match(/^\.4byte\s+(\w+)/);
      if (table && entry) table.push({ label: entry[1], name: comment });
      return;
    }
    if (!block) return;
    const [, op, rest = ""] = line.match(/^(\w+)\s*(.*)$/);
    emit(op, splitArgs(rest), where);
  });
  return { blocks, order, tables, unresolved };
}

/** Empty labels are aliases of the next; falling through becomes a goto. */
function link({ blocks, order }) {
  const alias = new Map();
  for (let i = order.length - 1; i >= 0; i--) {
    const label = order[i];
    if (blocks.get(label).length === 0 && i + 1 < order.length) alias.set(label, alias.get(order[i + 1]) ?? order[i + 1]);
  }
  const resolve = (l) => alias.get(l) ?? l;
  for (let i = 0; i < order.length; i++) {
    const cmds = blocks.get(order[i]);
    if (alias.has(order[i])) continue;
    for (const c of cmds) for (const k of ["label", "first", "second"]) if (k in c) c[k] = resolve(c[k]);
    const last = cmds.at(-1);
    if (!last || !TERMINAL.has(last.op)) {
      const next = order.slice(i + 1).find((l) => !alias.has(l));
      if (next) cmds.push({ op: "goto", label: next });
    }
  }
  return resolve;
}

/** The blocks reachable from some entry labels, in file order. */
function reachable(parsed, entries) {
  const keep = new Set();
  const visit = (label) => {
    if (keep.has(label)) return;
    const cmds = parsed.blocks.get(label);
    if (!cmds) throw new Error(`no block ${label}`);
    keep.add(label);
    for (const c of cmds) for (const k of ["label", "first", "second"]) if (k in c) visit(c[k]);
  };
  entries.forEach(visit);
  const missing = parsed.unresolved.filter((u) => keep.has(u.label));
  if (missing.length) {
    for (const u of missing) console.error(`unresolved ${u.name} (${u.where})`);
    throw new Error(`${missing.length} unresolved names`);
  }
  return Object.fromEntries(parsed.order.filter((l) => keep.has(l)).map((l) => [l, parsed.blocks.get(l)]));
}

/** One command per line: readable diffs, small files. */
function write(file, data) {
  const scripts = Object.entries(data.scripts)
    .map(([label, cmds]) => `    ${JSON.stringify(label)}: [\n${cmds.map((c) => `      ${JSON.stringify(c)}`).join(",\n")}\n    ]`)
    .join(",\n");
  const rest = Object.entries(data)
    .filter(([k]) => k !== "scripts")
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  writeFileSync(file, `{\n${[...rest, `  "scripts": {\n${scripts}\n  }`].join(",\n")}\n}\n`);
  console.log(`${file}: ${Object.keys(data.scripts).length} blocks`);
}

// ---------- FireRed ----------

const fr = readScripts(firered, { REVISION: "0" });
const frResolve = link(fr);
const table = (name) => fr.tables.get(name).map((e) => ({ ...e, label: frResolve(e.label) }));
const frMoves = table("gBattleAnims_Moves").slice(0, FIRERED_MOVES + 1);
const named = (name) => Object.fromEntries(table(name).map((e) => [e.name, e.label]));
const general = named("gBattleAnims_General");
const status = named("gBattleAnims_StatusConditions");
const special = named("gBattleAnims_Special");
const frEntries = [...frMoves.slice(1).map((e) => e.label), ...Object.values(general), ...Object.values(status), ...Object.values(special)];
write(join(outDir, "firered.json"), {
  moves: Object.fromEntries(frMoves.slice(1).map((e, i) => [i + 1, e.label])),
  general,
  status,
  special,
  scripts: reachable(fr, frEntries),
});

// ---------- the expansion's Gen 4 moves ----------

const moveNames = new Map([...read(catalogProto).matchAll(/^\s*(MOVE_\w+) = (\d+)/gm)].map(([, name, n]) => [Number(n), name]));
const info = read(join(expansion, "src/data/moves_info.h"));
const ex = readScripts(expansion, { B_UPDATED_MOVE_DATA: "GEN_4" });
const exResolve = link(ex);
const exMoves = {};
for (let n = FIRERED_MOVES + 1; n <= MOVE_COUNT; n++) {
  const name = moveNames.get(n);
  const at = info.indexOf(`[${name}] =`);
  if (at < 0) throw new Error(`no ${name} in moves_info.h`);
  const script = info.slice(at).match(/\.battleAnimScript\s*=\s*(\w+)/)[1];
  exMoves[n] = exResolve(script);
}
write(join(outDir, "expansion.json"), { moves: exMoves, scripts: reachable(ex, Object.values(exMoves)) });
