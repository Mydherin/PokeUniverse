// The trainer's party, the same for every art style: their Pokémon as mic-core last said
// (party/v1), where the player's own SWITCH shows at once (mic-core checks it and corrects a
// refused one).

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

  /** SWITCH: two Pokémon trade places. False if either slot is empty or they're the same. */
  swap(a: number, b: number): boolean {
    const list = this.list;
    if (a === b || !list[a] || !list[b]) return false;
    [list[a], list[b]] = [list[b], list[a]];
    return true;
  }
}
