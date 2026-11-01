// One line of Showdown's battle log, split into its command, arguments and [keyword] tags.
// Protocol: https://github.com/smogon/pokemon-showdown/blob/master/sim/SIM-PROTOCOL.md

export type Line = {
  cmd: string;
  args: string[];
  /** `[from] item: Leftovers` → from: "item: Leftovers"; `[still]` → still: "". */
  kw: Record<string, string>;
};

export function parseLine(text: string): Line {
  const [cmd = "", ...rest] = text.slice(1).split("|");
  const args: string[] = [];
  const kw: Record<string, string> = {};
  for (const part of rest) {
    const tag = /^\[(\w+)\]\s?(.*)$/.exec(part);
    if (tag) kw[tag[1]] = tag[2];
    else args.push(part);
  }
  return { cmd, args, kw };
}

/** A Pokémon ident ("p2a: 3", "p1: 0"): its side, position (a=0) and party slot (its name). */
export type Ident = { side: number; position: number; slot: number };

export function parseIdent(text: string | undefined): Ident | undefined {
  const m = /^p(\d)([a-c]?):\s*(\d+)$/.exec(text ?? "");
  if (!m) return undefined;
  return { side: Number(m[1]) - 1, position: m[2] ? m[2].charCodeAt(0) - 97 : 0, slot: Number(m[3]) };
}

/** A side ident ("p1: side0", "p2"). */
export function parseSide(text: string | undefined): number | undefined {
  const m = /^p(\d)/.exec(text ?? "");
  return m ? Number(m[1]) - 1 : undefined;
}

/** A condition ("120/150 par", "24/48", "0 fnt"): HP, max HP (0 when fainted) and status ID. */
export function parseCondition(text: string | undefined): { hp: number; maxHp: number; status: string } {
  const [hp = "0", status = ""] = (text ?? "").split(" ");
  const [now, max = "0"] = hp.split("/");
  return { hp: Number(now), maxHp: Number(max.replace(/[a-z]+$/, "")), status: status === "fnt" ? "" : status };
}
