# M9 Following Pokémon: Edge Cases and Phase Check ✅

Part of [Phase 6](../phase-6-pokemon-party.md). Rules: [context.md](context.md), D8, D9. Closed 2026-11-08.

**Done:** the follower is right through every way the lead can change or the player can move, and the whole phase was played in one session (account 2), with the regression check. **Main reference: HeartGold** (`references/pokeheartgold/`, behavior only), as in [M8](m08-following-walk.md).

## What Was Played

- **Edge cases:** 5 faints in a row (each cry and text moves on, whiteout fine); lead changes (SWITCH, evolution, whiteout, lead at 0 HP → next able one follows, Revive of the fainted lead, box DEPOSIT of the lead and MOVE back to slot 1); reload; swapping by stepping onto the follower; stairs down and up; NPCs (static only so far) block and the follower never overlaps them; all fainted (no follower); big and asymmetric sheets (Snorlax, Farfetch'd).
- **Phase check:** SWITCH, item PC WITHDRAW and DEPOSIT, BILL'S PC WITHDRAW and DEPOSIT, Potion from the bag (item-use scene), GIVE Exp. Share, Rare Candy, Water Stone evolution, TM with forget-a-move, Blue Flute, TOSS, Light Ball USE, TAKE, SUMMARY move swap, a double battle won with Exp. Share, `mic-core` restart mid-battle (resumed), SAVE and reload (same tile, party, bag, PC).
- **Battle reload:** a Potion used mid-battle, then a page reload: the battle is dropped and the Potion is back (bag changes are only written when a battle ends).

## Fixed in M9

- Whiteout left the follower on its old tile: `world/battle.go` `finish` calls `p.placeFollower()` before `z.correct` (HGSS `FollowMon_RecreateForMap`).
- All fainted showed slot 1: `pokemon/party.go` `Lead()` returns nil when nobody can fight (HGSS `FollowMon_IsActive`).
- Join loop with an empty party and Pokémon in boxes: `pokemon/testteam.go` skips the test boxes when any box holds Pokémon (`CountBoxPokemon`). Test content, goes with it in Phase 7.
- Possible battle hang (seen once, not reproduced): `gba/sound.ts` `isPlaying` and `fanfarePlaying` treat a non-running AudioContext as silent, so `battle/playback.ts`' cry waits can't block forever. Destiny Bond's `-activate` shows FireRed's `sText_PkmnTookFoe` (`battle/messages.ts`).

## Decisions and Known Behavior

- The follower isn't hidden during the battle transition (HGSS `battle/battle_setup.c` only records the slot). On a map entry (warp, reload, re-join after a `mic-core` restart) it appears hidden and comes out on the first step.
- Box cursor: from the box title, Up goes to PARTY POKéMON, a second Up wraps to the bottom row (FireRed).
- Stair warps start when the direction is pressed while standing on the warp tile (1F (10,2) press Right; 2F (10,2) walk Left from (11,2)).

## Follow-ups (later phases)

- **Whiteout respawn map:** uses `Start`'s tile but stays in the battle's zone (`Start.Map` ignored). Needs a warp once battles happen outside 2F (Phase 7+).
- **Sight trainers and walking NPCs:** re-check the follower with them when they arrive (Phase 7+).
- **Other players' followers** (Phase 8): the follower's data lives in `Avatar`, nothing local to the player's own client (D8). `sendParty` in `world/party.go` is the common point after party changes; M8's file maps client and server.
- Destiny Bond's message not seen in play (the AI won't set it up). When both last Pokémon faint, Showdown's Gen 4 rule gives side 0 the win; not chased.

## Playing Tips

- Keys: Z = A, X = B, Enter = START (`gba/input.ts`). Steps need held keys: dispatch `keydown`, `keyup` after ~300-450 ms; turning needs ~150 ms.
- Test trainers heal both teams first (`world/battle.go` `startBattle`). 2F trainer: from the stairs walk Down 2, face Left, A.
- **SQL:** leave `/play`, `docker compose restart mic-core`, then edit (it keeps the player in memory and overwrites edits). `docker compose exec -T postgres psql -U pokeuniverse`. Account 2 was restored from the pre-M9 backup (shared notes folder `m9-backup/`, tables trainers, trainer_pokemon, trainer_items, trainer_pc_items, trainer_boxes, battle_outcomes, loaded in that order after `delete from trainers where account_id=2`).

## Files

`mic-core/internal/world/` (`party.go`, `warp.go`, `battle.go`, `follower.go`), `mic-core/internal/pokemon/` (`party.go`, `testteam.go`), `spa-pokeuniverse/src/game/firered/overworld.ts`, `firered/follower-sprite.ts`, `firered/stair-warp.ts`, `firered/battle/playback.ts`, `firered/battle/messages.ts`, `gba/sound.ts`.
