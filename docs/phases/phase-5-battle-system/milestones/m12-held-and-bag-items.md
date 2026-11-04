# M12 Gen 4 Held Items and Bag Items in Battle ✅

Part of [Phase 5](../phase-5-battle-system.md). Shared rules and context: [context.md](context.md).

- [x] Gen 4 items in `item/v1/catalog.proto`: 96 new, numbers 375-470 (`infra/battle/items.mjs`, once), Showdown IDs in `ids.ts`, icons (`make graphics`, `item-icons.mjs`), names and descriptions (`make text`). The evolutions that needed them are in the species catalog.
- [x] Bag use in battle (D25): `ItemInfo.battle_use` and `effect`; Ethers, Revives, berries, flutes, POKé FLUTE; the BERRY POUCH opens from BAG; balls blocked and spent ("The TRAINER blocked the BALL!").
- [x] Item messages and animations (eaten or used-up items, cures, boosts, Focus Sash/Band, White and Mental Herb, Leppa, Custap).
- [x] Engine check (one-off, deleted), with save and restore between steps: Potion and Antidote on the bench, Revive (`pokemonLeft` rises, then it switches in), Ether, Max Elixir, X Attack, Poké Ball, the AI's Full Restore; refusals queue nothing; Life Orb, Focus Sash, Occa, Lum, White and Mental Herb, Leppa, Custap, Bug Bite, Knock Off. It found two bugs, now fixed: resist berries played their animation twice, Bug Bite's `stealeat` was an unknown effect.

**Not played in the game (goes with M14).** All builds pass (contracts, `make breaking`, SPA tsc, vite, `mic-core`, `mic-battles`).

**What to watch when playing:**
- The test team and test bag only reach a trainer with **no Pokémon**: existing accounts keep their old team and bag.
- The client doesn't track confusion, love or stat stages. If an item would do nothing there, `mic-battles` refuses it and the menu just comes back, with nothing spent and no message.
- A bag item removing love prints nothing (Showdown's `-end` is silent there).
- Gen 4-only item effects with no FireRed string (Quick Claw, Power Herb, resist berries, Custap, Micle, Bug Bite and Pluck eating a berry) show no text (D21). The ball's throw and knock-away is our own simple motion, not FireRed's `BALL_TRAINER_BLOCK`.
- Poké Dolls and the Fluffy Tail stay unusable until wild battles (Phase 7).

**Gotcha:** `infra/pokemon/evolutions.mjs` can't run over the catalog as it is (it adds duplicates). This time its lines were stripped first, then the new `METHOD_ITEM` twins removed by hand (Gen 4: trade only, or level up holding), and M11's lines restored as they were.
