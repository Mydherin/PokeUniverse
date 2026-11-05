# Phase 6: Pokémon and Party

**Goal:** every item and TM works on Pokémon, players manage their Pokémon, and their lead Pokémon follows them.

## Resume Here

**Next step:** [M6: Boxes: storage and viewing](milestones/m06-boxes-storage.md), not started. M5 is played and closed.

Every milestone is played in the game before it closes, with the regression check: [context.md](milestones/context.md#playing-a-milestone).

## Milestones

Order = dependencies. Marks: ⬜ not started · 🚧 in progress · ✅ done · ⏸ deferred.

| # | Milestone | Status | Needs | In short |
|---|---|---|---|---|
| M1 | [Items on a Pokémon: medicine and PP](milestones/m01-party-item-use.md) | ✅ | | The party menu's USE mode and `UsePartyItem`; potions, status cures, revives, vitamins, Sacred Ash, PP items |
| M1b | [FireRed's item-use scene](milestones/m01b-item-use-scene.md) | ✅ | M1 | The Pokémon and item scene before an item's effect; M2 and M3 add its other variants |
| M2 | [Rare Candy and evolution stones](milestones/m02-growth-items.md) | ✅ | M1b | Level up, learning and evolution outside battle, reusing Phase 5 M11 |
| M3 | [TM/HM teaching](milestones/m03-tm-hm-teaching.md) | ✅ | M2 | TM and tutor learnsets in the catalog; the TM CASE's USE; ABLE / NOT ABLE |
| M4 | [Exp. Share and held items](milestones/m04-exp-share-held-items.md) | ✅ | | Exp. Share's split in `mic-battles`; held items' effects outside battle |
| M5 | [Field moves on the party screen](milestones/m05-field-moves.md) | ✅ | M1 | Field moves in the party menu; Milk Drink and Softboiled work, the rest refuse until their maps |
| M6 | [Boxes: storage and viewing](milestones/m06-boxes-storage.md) | ⬜ | | Box storage in `mic-core`, BILL'S PC in the PC menu, the box screen to look through |
| M7 | [Boxes: managing Pokémon](milestones/m07-boxes-actions.md) | ⬜ | M6 | WITHDRAW, DEPOSIT, MOVE, RELEASE, held items, box options |
| M8 | [Following Pokémon: art and walking](milestones/m08-following-walk.md) | ⬜ | | Overworld sprites in the build; the lead walks behind the player, decided by the server |
| M9 | [Following Pokémon: edge cases, phase check](milestones/m09-following-check.md) | ⬜ | M7, M8 | Warps, lead changes, battles, reloads; the whole phase played once |

M1 → M1b → M2 → M3 and M6 → M7 → M9 are chains. M4, M5 and M8 can go in any order after what they need.

## Done

Built for the [Battle System](../phase-5-battle-system/phase-5-battle-system.md); each milestone's file has the details to build on it.

- ✅ **Data model** ([M2](../phase-5-battle-system/milestones/m02-party.md)): Gen 4 stats, natures, IVs/EVs, personality, growth rates, moves and PP, saved in `trainer_pokemon`; `party.v1` contracts; the test team.
- ✅ **Party menu** ([M3](../phase-5-battle-system/milestones/m03-party-screen.md)): SUMMARY, SWITCH, ITEM (GIVE, TAKE); GIVE from the BAG, TM CASE, BERRY POUCH and PC.
- ✅ **Summary** ([M3](../phase-5-battle-system/milestones/m03-party-screen.md)): INFO, SKILLS, moves and their details, move SWITCH.
- ✅ **Growing, from battles** ([M11](../phase-5-battle-system/milestones/m11-exp-level-up-evolution.md)): exp, level up, learning and forgetting moves, friendship, evolution (the catalog has every species' evolutions).
- ✅ **Items in battle** ([M12](../phase-5-battle-system/milestones/m12-held-and-bag-items.md)): held items' effects, and bag items used on a Pokémon.

## Scope Outside This Phase

- What field moves do on the map, and tutor NPCs: [Phase 12](../phase-12-world-content.md). Other players seeing following Pokémon: [Phase 8](../phase-8-multiplayer-world.md). Cleanse Tag, and catching into the boxes: [Phase 7](../phase-7-wild-battles-catching.md).

## Done When

- ✅ The team shows in POKéMON; SWITCH, held items and the summary work; battles level up and evolve it.
- Items and TMs used from the bag work on the test team (M1-M3).
- Exp. Share, held items outside battle and the party screen's field moves work (M4, M5).
- A player manages their team and boxes, and their lead Pokémon follows them in the world (M6-M9).
- Every milestone played in the game, with no regression in the regression check.
