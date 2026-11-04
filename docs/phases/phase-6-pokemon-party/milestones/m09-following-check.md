# M9 Following Pokémon: Edge Cases and Phase Check ⬜

Part of [Phase 6](../phase-6-pokemon-party.md). **Needs:** M7, M8, and every other milestone for the check. Rules: [context.md](context.md), D8, D9.

**Done when:** the follower is right through every way the lead can change or the player can move, and the whole phase has been played once in one session.

## Resume Here

Not started. First step: the follower's reactions to party changes in `mic-core`.

## Tasks

- [ ] **Lead changes:** SWITCH, a box MOVE or DEPOSIT, an evolution, a Rare Candy evolution, fainting and whiteout, a revive: `mic-core` resends the follower and the sprite swaps next to the player.
- [ ] **Movement:** stairs and warps (`stair-warp.ts`), map entry, reload, the follower hidden during the battle transition and the evolution scene, back after.
- [ ] **Scripts:** a test trainer's approach and NPCs don't block on or walk through the follower; the player can always step onto its tile (it swaps).
- [ ] **Empty cases:** an empty party, or all fainted: no follower, no error.
- [ ] **Phase check:** play all of [Phase 6's **Done When**](../phase-6-pokemon-party.md#done-when) on one account, then the regression check. Close the phase: README, AGENTS.md's **Now**.

## Play It

- Each item above, with a reload after it.
- SWITCH the lead, leave the menu: the new one follows. Lead faints in battle: the next one that can fight follows on return.
- Walk down the stairs and back; SAVE, reload: same follower, right place.
- A full session: use a Potion and a TM, level with a Rare Candy, evolve with a stone, Exp. Share in a battle, deposit, withdraw, follow.

## What's Known

- `sendParty` in `world/party.go` is the common point after party changes. M8's file has the client and server map.
- Phase 8 reuses this for other players: keep the follower's data in `Avatar`, nothing about it local to the player's own client (D8).

## Files

`mic-core/internal/world/` (`party.go`, `warp.go`, `battle.go`), `spa-pokeuniverse/src/game/firered/overworld.ts`, `firered/follower-sprite.ts`, `firered/stair-warp.ts`.
