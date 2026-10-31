// The trainer's Pokédex, the same for every art style: which species they have seen and caught
// as mic-core last said (pokedex/v1), and each species' facts from the catalog in lib-contracts.

import { getOption } from "@bufbuild/protobuf";
import type { Pokedex } from "@pokeuniverse/contracts/pokedex/v1/pokedex";
import { info, SpeciesSchema, Type, type SpeciesInfo } from "@pokeuniverse/contracts/species/v1/catalog";

const INFOS: SpeciesInfo[] = [];
for (const v of SpeciesSchema.values) if (v.number) INFOS[v.number] = getOption(v, info);

/** Every species: the National Pokédex. */
export const NATIONAL_COUNT = INFOS.length - 1;
/** The Kanto Pokédex: species 1 to 151. */
export const KANTO_COUNT = 151;

/** The species' facts (national number); types UNSPECIFIED for an unknown one. */
export function speciesInfo(n: number): SpeciesInfo {
  return INFOS[n] ?? { $typeName: "pokeuniverse.species.v1.SpeciesInfo", type1: Type.UNSPECIFIED, type2: Type.UNSPECIFIED, height: 0, weight: 0 };
}

export class PokedexState {
  /** FLAG_SYS_POKEDEX_GET. */
  readonly obtained: boolean;
  /** The National Pokédex (IsNationalPokedexEnabled). */
  readonly national: boolean;
  private readonly seenSet: Uint8Array;
  private readonly caughtSet: Uint8Array;

  constructor(p?: Pokedex) {
    this.obtained = p?.obtained ?? false;
    this.national = p?.national ?? false;
    this.seenSet = p?.seen ?? new Uint8Array(0);
    this.caughtSet = p?.caught ?? new Uint8Array(0);
  }

  seen(n: number): boolean {
    return has(this.seenSet, n) || this.caught(n);
  }

  caught(n: number): boolean {
    return has(this.caughtSet, n);
  }

  /** How many species of 1..upTo (Kanto's or the National's) are seen or caught. */
  count(caught: boolean, upTo: number): number {
    let c = 0;
    for (let n = 1; n <= upTo; n++) if (caught ? this.caught(n) : this.seen(n)) c++;
    return c;
  }

  /** The last species the Pokédex shows: the National's or Kanto's. */
  get last(): number {
    return this.national ? NATIONAL_COUNT : KANTO_COUNT;
  }
}

/** Bit n-1 (least significant first) is species n. */
function has(set: Uint8Array, n: number): boolean {
  const i = n - 1;
  return n >= 1 && n <= NATIONAL_COUNT && ((set[i >> 3] ?? 0) >> (i & 7)) & 1 ? true : false;
}
