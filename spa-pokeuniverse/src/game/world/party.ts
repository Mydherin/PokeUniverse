// The trainer's party, the same for every art style: their Pokémon as mic-core last said
// (party/v1), where the player's own SWITCHes (Pokémon or moves) show at once (mic-core checks
// them and corrects a refused one).

import type { Party, PartyChanged, Pokemon } from "@pokeuniverse/contracts/party/v1/party";

export class PartyState {
  private list: Pokemon[] = [];

  constructor(party?: Party) {
    this.list = party?.pokemon ?? [];
  }

  /** The Pokémon in order. */
  get pokemon(): readonly Pokemon[] {
    return this.list;
  }

  get count(): number {
    return this.list.length;
  }

  /** What mic-core says: the whole party. */
  apply(change: PartyChanged): void {
    this.list = change.party?.pokemon ?? [];
  }

  /** The summary's SWITCH: two of a Pokémon's moves trade places. False if any is missing or they're the same. */
  swapMoves(slot: number, a: number, b: number): boolean {
    const moves = this.list[slot]?.moves;
    if (!moves || a === b || !moves[a] || !moves[b]) return false;
    [moves[a], moves[b]] = [moves[b], moves[a]];
    return true;
  }

  /** SWITCH: two Pokémon trade places. False if either slot is empty or they're the same. */
  swap(a: number, b: number): boolean {
    const list = this.list;
    if (a === b || !list[a] || !list[b]) return false;
    [list[a], list[b]] = [list[b], list[a]];
    return true;
  }
}
