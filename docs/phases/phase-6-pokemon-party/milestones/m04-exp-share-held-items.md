# M4 Exp. Share and Held Items ✅

Part of [Phase 6](../phase-6-pokemon-party.md). Rules: [context.md](context.md).

**Done:** an Exp. Share holder gains its share in battle, and held items that matter outside battle work. Played with the regression check.

## The List

Every `HOLD_EFFECT_` user outside `battle*.c` in FireRed, plus Gen 4's from HeartGold:

| Item | Effect | State |
|---|---|---|
| Exp. Share | Half to holders | ✅ `exp.ts` |
| Soothe Bell | Friendship rises × 1.5 | ✅ `changeFriendship`, one function for all events |
| Macho Brace, Lucky Egg | EVs × 2, exp × 1.5 | ✅ |
| Power items (Gen 4) | +4 EVs in their stat | ✅ `exp.ts` `POWER_ITEMS` |
| Amulet Coin, Luck Incense (Gen 4, new in the catalog, 471) | Double prize, if it came out on either side | ✅ `ExpState.doublePrize`, `BattleOutcome.double_prize` |
| Everstone | No level evolution | ✅ Phase 5 M11 |
| Cleanse Tag, Pure Incense (Gen 4, new in the catalog, 472) | Wild encounters | Phase 7 (`wild_encounter.c:655`) |

## Played

Exact numbers, every message read:

- **Split:** two bench holders 1017 / 508 / 508; a holder in battle gets both, 1719 and 573; a fainted holder or Lv 100 one gets no message; no holder, two participants 1017 each.
- **Item taken away in battle:** Trick moved an Exp. Share to the foe: no share for that Pokémon, still held after the battle. No foe has Knock Off; it's the same check (`pokemon.item` at the faint).
- **Amulet Coin:** ₽3600 (50 × 4 × 9 × 2), held by one that came out and fainted. **Lucky Egg:** 508 where the others got 339.
- **Friendship:** faint -5 (45 levels below) and -1; walking +1 at 128 steps, Soothe Bell included.
- **Power Weight:** EVs {20,6,0,1,6,1} after 5 KOs: 4 each in HP plus exactly the yields.
- **`friendship_steps`:** 10 + 2 steps = 12 after leaving, carries on after coming back.
- **Not played:** league friendship, no such trainer until gyms.

## Decisions and Differences

- **Split (both games, `Cmd_getexp`, `BtlCmd` in HeartGold):** `total = ⌊base × level ÷ 7⌋`; with holders, participants split `⌊total ÷ 2⌋`, holders split `⌊total ÷ 2⌋`, each share at least 1. A holder in battle gets both. Holders count only with HP left; level 100 ones count but gain nothing.
- **Friendship order is Gen 4's** (`MonApplyFriendshipMod`): Luxury Ball +1, met here +1, then Soothe Bell × 1.5. FireRed multiplies first. `growFriendship` and `changeFriendshipByItem` each had their own order; both are now `changeFriendship`.
- **Level 100 gains no EVs either** (fixed): FireRed's `MonGainEVs` only runs for one that gains exp. `exp.ts` gave them EVs.
- **The walking counter is saved on leaving (MMO):** `trainers.friendship_steps`, in Gen 4's save too; not written every step, so only a server crash loses any (at most 127).
- **`ITEMS` in `ids.ts` holds every catalog item:** it had only Showdown's, so Exp. Share, Lucky Egg, Amulet Coin and Soothe Bell never reached `pokemon.item`, and Lucky Egg never worked. Showdown ignores items it doesn't know, yet Knock Off, Trick and Thief work on them, as in Gen 4.
- **Fling fails with items Showdown doesn't know (limit):** it has no power for them. Not fixed: only those items, only that move.
- **Foreign Pokémon's exp × 1.7 isn't built (MMO):** we have no game languages, so traded stays × 1.5.
- **League friendship is applied when the battle's outcome arrives (MMO):** Gen 4 does it at the start; the outcome is where the party changes atomically.
- **Power items' +4 isn't checked in a reference:** HeartGold reads it from binary item data (`holdEffectParam`); 4 is the known Gen 4 value.

## Friendship Events

Built: level up, items, TMs, walking, fainting in battle, league battles. Not built, nothing to hang them on yet: field poison faint (`script_pokemon_util.c:186`), Massage (FireRed's, `field_specials.c:2077`).
