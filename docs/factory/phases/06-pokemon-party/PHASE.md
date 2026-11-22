---
milestones: [01-party-item-use, 02-growth-items, 03-tm-hm-teaching, 04-exp-share-held-items, 05-field-moves, 06-boxes-storage, 07-boxes-actions, 08-following-walk, 09-following-check]
---

# Phase 6: Pokémon and Party

**Goal:** every item and TM works on Pokémon, players manage their Pokémon, and their lead Pokémon follows them.

## Resume Here

Done (2026-11-08): every milestone was played and passes, and the whole phase was played once with the regression check (M9). The following Pokémon (M8, M9) takes HeartGold as its main reference (`references/pokeheartgold/`, behavior only), shown in FireRed's style. Still open, none of it blocks the next phases: whiteout respawn map, re-checking the follower with sight trainers and walking NPCs, other players' followers ([M9's follow-ups](milestones/09-following-check.md#follow-ups-later-phases)).

Every milestone is played in the game before it closes, with the regression check: [context/pokemon-party.md](../../context/pokemon-party.md#playing-a-milestone).

## Milestones

Order = dependencies. Each milestone's status is in its file's front matter.

| # | Milestone | Needs | In short |
|---|---|---|---|
| M1 | [Items on a Pokémon: medicine and PP](milestones/01-party-item-use.md) | | The party menu's USE mode and `UsePartyItem`; potions, status cures, revives, vitamins, Sacred Ash, PP items |
| M1b | [FireRed's item-use scene](milestones/01-party-item-use.md#m1b-firereds-item-use-scene) | M1 | The Pokémon and item scene before an item's effect; M2 and M3 add its other variants |
| M2 | [Rare Candy and evolution stones](milestones/02-growth-items.md) | M1b | Level up, learning and evolution outside battle, reusing Phase 5 M11 |
| M3 | [TM/HM teaching](milestones/03-tm-hm-teaching.md) | M2 | TM and tutor learnsets in the catalog; the TM CASE's USE; ABLE / NOT ABLE |
| M4 | [Exp. Share and held items](milestones/04-exp-share-held-items.md) | | Exp. Share's split in `mic-battles`; held items' effects outside battle |
| M5 | [Field moves on the party screen](milestones/05-field-moves.md) | M1 | Field moves in the party menu; Milk Drink and Softboiled work, the rest refuse until their maps |
| M6 | [Boxes: storage and viewing](milestones/06-boxes-storage.md) | | Box storage in `mic-core`, BILL'S PC in the PC menu, the box screen to look through |
| M7 | [Boxes: managing Pokémon](milestones/07-boxes-actions.md) | M6 | WITHDRAW, DEPOSIT, MOVE, RELEASE, held items, box options |
| M8 | [Following Pokémon: art and walking](milestones/08-following-walk.md) | | Overworld sprites in the build; the lead walks behind the player, decided by the server |
| M9 | [Following Pokémon: edge cases, phase check](milestones/09-following-check.md) | M7, M8 | Warps, lead changes, battles, reloads; the whole phase played once |

M1 → M1b → M2 → M3 and M6 → M7 → M9 are chains. M4, M5 and M8 can go in any order after what they need.

## Done

Built for the [Battle System](../05-battle-system/PHASE.md); each milestone's file has the details to build on it.

- ✅ **Data model** ([M2](../05-battle-system/milestones/02-party.md)): Gen 4 stats, natures, IVs/EVs, personality, growth rates, moves and PP, saved in `trainer_pokemon`; `party.v1` contracts; the test team.
- ✅ **Party menu** ([M3](../05-battle-system/milestones/03-party-screen.md)): SUMMARY, SWITCH, ITEM (GIVE, TAKE); GIVE from the BAG, TM CASE, BERRY POUCH and PC.
- ✅ **Summary** ([M3](../05-battle-system/milestones/03-party-screen.md)): INFO, SKILLS, moves and their details, move SWITCH.
- ✅ **Growing, from battles** ([M11](../05-battle-system/milestones/11-exp-level-up-evolution.md)): exp, level up, learning and forgetting moves, friendship, evolution (the catalog has every species' evolutions).
- ✅ **Items in battle** ([M12](../05-battle-system/milestones/12-held-and-bag-items.md)): held items' effects, and bag items used on a Pokémon.

## Scope Outside This Phase

- What field moves do on the map, and tutor NPCs: [Phase 12](../../ROADMAP.md#12-world-content). Other players seeing following Pokémon: [Phase 8](../08-multiplayer-world/PHASE.md). Cleanse Tag, Sweet Scent, and catching into the boxes: [Phase 7](../07-wild-battles-catching/PHASE.md).

## Done When

- ✅ The team shows in POKéMON; SWITCH, held items and the summary work; battles level up and evolve it.
- ✅ Items and TMs used from the bag work on the test team (M1-M3).
- ✅ Exp. Share, held items outside battle and the party screen's field moves work (M4, M5).
- ✅ A player manages their team and boxes, and their lead Pokémon follows them in the world (M6-M9).
- ✅ Every milestone played in the game, with no regression in the regression check.
