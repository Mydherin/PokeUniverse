# M3 Party Screen and Summary ✅

Part of the [battles plan](README.md). Finished and committed 2026-11-01 (`4169be9`). Played by the user on 2026-11-01: the main features work. Not every edge case has been tested; fix bugs as they're reported. What later milestones can use, without re-reading:

- **`firered/party-menu.ts`:** `startPartyMenu(flow, host, mode, done, resume?)` (loads the party set and every party Pokémon's art first). `PartyHost {party, playerName, gender, nationalDex, bag, give, take, swap, swapMoves}`. `PartyMenuMode`: `{kind:"field"}` (SUMMARY, SWITCH with slide, ITEM GIVE/TAKE) or `{kind:"give", item, pc}`. Exports `STATUS_ICON_TEMPLATE`, `Ailment`, `ailmentOf`, `monName`, `shownGender`. Single layout only. **M7 adds the battle mode** (SHIFT, SUMMARY, CANCEL, forced switch).
- **`firered/summary.ts`:** `startSummary(flow, host, slot, done(last))`: INFO, SKILLS, KNOWN MOVES, move details with the Gen 4 category icon (sprite at 104, 70; D10), move SWITCH → `host.swapMoves`. M11 reuses its move page for "forget a move".
- **Shared:** `firered/hp-bar.ts` (`hpBarLevel`, `scaledHpFraction`, 48 px), `mon-icon.ts` (`MonIcon`, `iconAnimForHp`), `menu-info.ts` (`typeIcon`, `blitMenuInfoIcon`), `manifest.ts` (`loadParty()`, `PARTY_GRAPHICS`, `BALL_ICONS`, `abilityName/Description`, `natureName`, `PokemonArt.shinyPalette`), `gba/text.ts` `expandDynamic`, `gba/sound.ts` `stop(player)`.
- **Bag, TM CASE, BERRY POUCH, item PC:** pick mode (`BagLocation.Party`, `pick` flag) and GIVE → party menu → back.
- **Contracts:** `party.v1.SwapPokemonMoves{slot, from, to}` (realtime client field 20); `mic-core` `Party.SwapMoves`, `Player.SwapPokemonMoves`.
- **Assets:** `make graphics` copies `party_menu/`, `summary_screen/`, status icons, the 12 balls, and the expansion's `category_icons.png` (into `graphics/expansion/`); `species.json` has `noFlip`; 42 texts added.
- **Out of scope, unchanged:** USE of items on Pokémon, TM teaching, field moves, MAIL, eggs, Pokérus, markings.
