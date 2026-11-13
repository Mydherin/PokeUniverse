# M10: Trade, Animation and After

Part of [Phase 9](../phase-9-social.md). Decisions: [context.md](context.md#trading) D24. References: `trade_scene.c` (`CB2_LinkTrade`, `DoTradeAnim_Wireless`, `CB2_TryLinkTradeEvolution`), `graphics/trade/`.

## Resume Here

Not started. Needs M9.

## Tasks

- **Scene:** FireRed's wireless trade scene with both Pokémon (front pics, Poké Balls, the signal, cries, music and sounds), the "{NAME} sent over {MON}" / "Take good care of {MON}" texts; art from `make graphics`.
- **Evolution:** the server decides the Gen 4 trade evolutions (D24, held item used up, Everstone) with the swap and saves it in the same transaction; the client plays Phase 6's evolution scene after the trade scene (B cancels as FireRed: the evolution doesn't happen and the item isn't used).
- **After:** OT and met data kept, "Met in a trade" in SUMMARY when OT differs; 1.5× EXP flag (Gen 4) used by battle EXP; Pokédex seen and caught; follower updated if the lead changed; both back in the trade menu.

## Manual Test

| # | Case | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | Scene | Trade two Pokémon | FireRed's scene, texts, sounds (compare the emulator once) | ⬜ |
| 2 | Trade evolution | Trade a Kadabra | Evolves into Alakazam for the receiver | ⬜ |
| 3 | Item evolution | Onix holding Metal Coat | Steelix, item gone | ⬜ |
| 4 | Everstone | Kadabra holding Everstone | No evolution | ⬜ |
| 5 | Cancel evolution | B during the evolution | Stays; item kept | ⬜ |
| 6 | Summary, Pokédex | Check the received one | "Met in a trade", OT the other; Pokédex caught | ⬜ |
| 7 | EXP | Battle with it | 1.5× EXP | ⬜ |
| 8 | Follower | Trade the lead | Follower changes | ⬜ |
