# M1b FireRed's Item-Use Scene 🚧

Part of [Phase 6](../phase-6-pokemon-party.md). **Needs:** M1. Found while building M1: not in the first plan. Rules: [context.md](context.md).

**Done when:** using an item on a Pokémon outside battle plays FireRed's scene first (the Pokémon's picture, the item, its sparkles), then the party menu shows the effect.

## Resume Here

Built, committed and running in the containers. The Potion played; only playing is left. **Next step:** the unchecked [Play It](#play-it) items, then the regression check and M1's battle BAG list, then close: mark ✅ here and in the phase file, point **Now** in `AGENTS.md` at M2, cut this file down. No code needs reading first. Fix only what fails.

**To play it:** assets and containers are up to date. Account 2's bag has Potions, cures, Revive, Ether, PP UP, HP UP and berries; its team is healthy again. [Playing fast](context.md#playing-a-milestone) has the keys and the steps.

- **Hurting a Pokémon** (game closed, on `/`): `docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "update trainer_pokemon set hp=5 where account_id=2 and slot=0"'`. Full HP: slot 0 Garchomp 171, slot 1 Pikachu 100. Friendship is 70 (closeness 0); set a slot to 255 for closeness 3 and back to 70. Potion is `item=13`, 4 at the start.
- **Keys in order:** in the BAG, A, A (USE), wait about 2 s, the slot, A. In the party, Right goes from Garchomp to the first box on the right. Screenshot before pressing: a run of blind presses after a message once ended on GIVE (harmless, B).
- **Timing:** about 2.3 s after A shows the sparkles, 3.5 s more the message.

## Tasks

- [x] **Scene:** `firered/use-item-scene.ts`, Normal variant. The level up, machine (TM/HM) and can't-evolve variants belong to M2 and M3, on the same file.
- [x] **Flow:** mic-core answers first (a refusal plays nothing), the menu closes, the scene plays, the menu reopens (`Resume` `then: "used"`, `showUsed` in `party-menu.ts`) with the box as it was, then sound, HP rising and message.
- [x] **Closeness:** `ItemResult.value` on `USED_ON_POKEMON` carries 0-3, from the friendship before the item (`Party.ItemSceneCloseness`). Friendship itself stays on the server ([Phase 5 D16](../../phase-5-battle-system/milestones/context.md#decisions)).
- [x] **Assets:** `make pokemon` adds `itemScene` to `species.json` (`sMonPosAttributes` from `src/menu2.c`: machine x, machine y, y offset, item x, item y; 387-493 get FireRed's fallback, 32 for all). `make text` has `gText_WasUsedOn`, `gText_Period`; `make audio` has `se_ball_tray_exit`. Graphics were already copied.
- [ ] **Play it,** then the [regression check](context.md#playing-a-milestone).

## Play It

- [x] Potion, closeness 0 (Garchomp) and 3 (Pikachu): background, picture at the right size, item, sparkles, message, zoom back, A, then the menu with HP rising from the old value (5 → 25), its message, back to the bag with one Potion fewer. One console error: "An unknown error occurred when fetching the script", probably the service worker after the rebuild; not looked into, check it's gone.
- [ ] Cure (the status icon stays until the menu is back), Revive (FNT stays until then), Ether, vitamin.
- [ ] A or B held before the message: black at once, the menu, the effect all the same.
- [ ] No effect: no scene. Sacred Ash: none (`ItemUseCB_SacredAsh` skips `Task_DoUseItemAnim`).
- [ ] A Gen 4 species' item position looks fine with the fallback (Garchomp looked fine on the Potion, item centered).
- [ ] A look at the Potion against the original (`make emulator`), once.
- [ ] **M1's battle BAG fixes,** with the regression check's battle: the list under [Not Checked](m01-party-item-use.md#not-checked).

**Can't be checked here:** the browser pane plays no sound we can hear, so the scene's sounds and the cry at closeness 3 are unheard.

## Differences

- **Effect saved before the scene,** not after as in FireRed: the MMO saves first, so a refusal plays nothing and a reload can't lose it. The player sees FireRed's order.
- **Cancelling** stops the scene at once instead of letting its tasks run under the black screen: nothing to see differs.

## Files

`spa-pokeuniverse/src/game/firered/use-item-scene.ts` (new), `party-menu.ts`, `manifest.ts`, `sounds.json`, `texts.json`; `infra/pokemon/build.mjs`, `sources.mjs`; `lib-contracts/proto/pokeuniverse/item/v1/bag.proto` (a comment, generated code); `mic-core/internal/pokemon/item.go`, `world/party.go`.

The same commit adds `references/pokeheartgold` (`.gitmodules`, `AGENTS.md`, `docs/tech-stack.md`, `docs/vision.md`, [M8](m08-following-walk.md#whats-known)).

**Build state:** typecheck, `mic-core` build + vet, `make contracts`, `make breaking` pass; SPA built by the Docker rebuild.
