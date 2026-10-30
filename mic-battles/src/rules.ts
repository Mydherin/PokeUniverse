// Battle rules: Showdown's Gen 4 format (tech-stack.md#mic-battles-node--showdown).

import { Dex } from "@pkmn/sim";

/** Gen 4 mechanics without team validation: mic-core decides which Pokémon take part. */
export const FORMAT = "gen4customgame";

/** Fails at startup if the simulator can't load the Gen 4 format. */
export function checkRules(): void {
  const format = Dex.formats.get(FORMAT);
  if (!format.exists) throw new Error(`showdown format ${FORMAT} not found`);
}
