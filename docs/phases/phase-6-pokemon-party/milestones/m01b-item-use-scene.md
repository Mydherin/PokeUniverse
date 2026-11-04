# M1b FireRed's Item-Use Scene ⬜

Part of [Phase 6](../phase-6-pokemon-party.md). **Needs:** M1. Found while building M1: not in the first plan. Rules: [context.md](context.md).

**Done when:** using an item on a Pokémon outside battle plays FireRed's scene first (the Pokémon's picture, the item, its sparkles), then the party menu shows the effect.

## Resume Here

Not started. First step: read `CB2_DoUseItemAnim`'s callees in `pokemon_special_anim.c`, only the Normal path.

**To play it:** the containers run M1's code. Account 2's bag already holds Potions, cures, Revive, Ether, PP UP, HP UP and berries; its party is healthy, so hurt a Pokémon in Postgres first. [Playing fast](context.md#playing-a-milestone) has the keys and the steps.

## Tasks

- [ ] **Scene:** `firered/use-item-scene.ts`, the Normal variant first. The level up, machine (TM/HM) and can't-evolve variants belong to M2 and M3, on the same file.
- [ ] **Flow:** FireRed closes the party menu, plays the scene, reopens the menu and only then applies the effect. Ours: mic-core answers first (so a refusal never plays it), then the scene, then the party menu reopened on the slot showing `showRecovered` with the HP from before.
- [ ] **Assets:** `make graphics` for `graphics/pokemon_special_anim/` (`bg`, `bg_tm_hm.pal`, `level_up`, `outward_spiral_dots`, `star`).
- [ ] **Play it,** then the [regression check](context.md#playing-a-milestone).

## Play It

- Potion, cure, Revive, Ether, vitamin: scene, then the menu, HP rising, message, back to the bag. Compare with the original (`make emulator`), a look at the Potion only.
- No effect: no scene. Sacred Ash: FireRed plays none (`ItemUseCB_SacredAsh` skips `Task_DoUseItemAnim`).

## What's Known

- `references/pokefirered/src/pokemon_special_anim.c` (709 lines, flow), `pokemon_special_anim_scene.c` (1563 lines, drawing). `party_menu.c:4263` `Task_DoUseItemAnim`, `:4269` `CB2_DoUseItemAnim`: `StartUseItemAnim_Normal(slot, item, callback)`, `StartUseItemAnim_CantEvolve` for stones, `CB2_UseItem` reopening the menu.
- `party-menu.ts` `useItem` is the seam; `startPartyMenu`'s `Resume` reopens a menu, and needs a new `then` for "show the effect".
