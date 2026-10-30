// Asset manifest for the current art style: the app refers to Pokémon by species ID only.
// Temporary source: PokeAPI's public FireRed/LeafGreen sprites, pinned to a commit.
// Phase 2 replaces this with the selected resource packs (vision.md#art-direction).

const BASE = "https://cdn.jsdelivr.net/gh/PokeAPI/sprites@1dd55c0436d2a5b6e324c0b780e1b1b416fbfb64/sprites/pokemon";

export const Species = {
  bulbasaur: 1,
  charmander: 4,
  squirtle: 7,
  pikachu: 25,
  clefairy: 35,
  gengar: 94,
  lapras: 131,
  eevee: 133,
  snorlax: 143,
  dragonite: 149,
  mew: 151,
} as const;

/** Front battle sprite, 64×64, Gen 3 style. */
export function frontSprite(species: number): string {
  return `${BASE}/versions/generation-iii/firered-leafgreen/${species}.png`;
}
