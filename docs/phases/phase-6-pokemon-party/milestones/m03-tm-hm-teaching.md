# M3 TM/HM Teaching ✅

Part of [Phase 6](../phase-6-pokemon-party.md). Rules: [context.md](context.md), D1, D3, D5.

**Done:** USE in the TM CASE shows who can learn the move, teaches it, forgets a move if needed, and the catalog has every species' TM and tutor moves. Played with the regression check, and the scene compared frame by frame with the original (2026-11-05).

## Compared With the Original

Same species (Pikachu), same moves. Disc and Pikachu match pixel for pixel; wobble, glow, dots, "1, 2, and... Poof!", stars and their timing match. The original's Pikachu looks more orange only because the test state's is shiny (personality and OT id 0). The last 3-frame wait (below) was built but not replayed in the machine scene.

Fixed from the comparison:

- **Dots:** machine dots run animation 0 (16, 8, 4 frames, large to small); only the item scene's sparkles switch to animation 1.
- **Zoom:** 9 frames a step (`Task_ZoomAnim`), which also corrects the item scene; `Task_MachineSet` waits 3 more frames before the first step.

Also added **NO USE** in the slots for an evolution stone that won't work (`itemEvolves` in `world/moves.ts`).

## How It Works

- **Source of "can learn":** `3M` or `4M`, tutor `3T` or `4T`; a species' base form. `infra/pokemon/learnsets.mjs` appends lines, so re-running needs the fields removed first.
- **Friendship:** `{1, 1, 0}` through `changeFriendshipByItem`, as `AdjustFriendship(FRIENDSHIP_EVENT_LEARN_TMHM)`.
- **Party menu (`party-menu.ts`):** `machine`, `description()`, `teach()`, `teachAndShow()`, `showTaught()`. `askToReplaceMove` and `askToStopLearning` are M2's.
- **Scene (`use-item-scene.ts`):** `runMachine`, `forgetMove`, `machineDots`, `createStars`. The icon's spot comes per species from `assets.species(...).itemScene`, so compare only the same species.
- **Tutor moves are only stored:** tutor NPCs come in Phase 12.

## Differences From FireRed

| Difference | Reason |
|---|---|
| The move is saved before the scene plays, so closing the game mid-scene keeps it | MMO, D3 |
| Species learn from Gen 3 and Gen 4 machine lists | Gen 4 rules with FireRed's TMs, user's rule in this milestone |
