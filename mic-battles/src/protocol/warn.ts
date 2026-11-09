// Logs each untranslated piece of Showdown's log once per process: the list of gaps to fill.

import { log } from "../log.ts";

const seen = new Set<string>();

export function warnOnce(what: string, value: string): void {
  const key = `${what}:${value}`;
  if (seen.has(key)) return;
  seen.add(key);
  log.warn(`battle log: ${what}`, { value });
}
