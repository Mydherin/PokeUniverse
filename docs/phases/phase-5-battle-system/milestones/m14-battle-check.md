# M14 Battle Check ✅

Part of [Phase 5](../phase-5-battle-system.md). Manual check of M4-M13 in the game, on desktop and in the phone preset. Its temporary script and overrides are removed.

## Resume Here

No code left to write but the minor open items below, and nothing to read first.

- **The user:** frame rate on a real phone (the preset can't show it). A problem found there is a new fix; otherwise this plan is closed.

**State:** AA's party, bag and money (2560) restored; Pokédex seen back to full. `infra/playtest/` and `zz_playtest.go` are deleted, so a new play test needs its own overrides (git has neither).

**Not run, optional, only if the user asks:**

- A restart in the middle of a turn's playback (the passing run restarted at the action menu).
- A real crash (`docker compose kill`): the passing run was a graceful restart; a crash skips `Leave`, so it should resume too.
- A battle after Clean Up, with the real `test_trainer` (the runs used the Lv. 5 Scizor override). `mic-core` starts healthy without the override.
- `gofmt`: not on the host; `world.go` was aligned by hand, and the Docker build passes.

## Passed

- **Singles win:** defeat text, ₽180, back in the room, saved (exp, moves, money).
- **Singles loss:** whiteout, −₽400, party healed, back in the room.
- **Items:** refusals (Antidote on a healthy Pokémon, LEFTOVERS), Potion, Antidote, Full Restore, Revive, Ether, X Attack, Dire Hit; LEFTOVERS and poison messages; quantities saved.
- **Level up:** exp gain, bar, level up window, also on the bench.
- **Learning:** free slot, full moveset (forget a move), HM refused, give up ("did not learn").
- **Evolution:** saved; B held stops it; evolves at the next level up; a bench Pokémon evolves too. Move learning given up, it still evolves.
- **Pokédex seen:** with Charmeleon's bit cleared, evolving into it sets the bit.
- **Reload mid-battle:** drops the battle (D22), party and bag as before it.
- **Restart mid-battle:** restarting `mic-core`, then `mic-battles`: the battle comes back on the same menu, plays on, and the win saves.
- **Party after a battle:** HP, status, PP, revived partner's HP, split exp, money; order unchanged after a switch (not compared with the ROM).
- **Send-out and recall:** grows where it stands, no arc; recall has no ball.
- **Mobile (phone preset):** D-pad, A, B show at their sizes and work through the battle menus, bag and party. START has no use in a battle, so it wasn't pressed.
- **Already played in M13 (desktop):** moves, switch, faint, replacement, SHIFT, doubles, a doubles loss, a doubles win with its prize.

**Not tested, not built, all in [Phase 6](../../phase-6-pokemon-party.md) (the user, 2026-11-04):** TM/HM teaching, items used on a Pokémon outside battle (Rare Candy, potions, stones), Exp. Share's effect.

## Bugs Fixed

- **A restart dropped the battle:** connections closed before the world knew it was stopping, so `Leave` treated each player as having left (D22's rollback). `World.Drain` now runs before `ws.Shutdown`. A crash never had this problem.
- **Ether's move list covered:** clearing the old message erased part of the list drawn before it. The message is drawn first now (`chooseMoveForItem`).
- **Dire Hit froze the battle:** `addVolatile` outside an event stored the format as `sourceEffect`, which `State` can't serialize. `bag.ts` passes the condition.
- **Missing lines:** "is getting pumped!" (Dire Hit, Focus Energy) and Mist's "became shrouded in MIST!".
- **Others:** SURF and MUDDY WATER's per-line blend (`video.alphaLines`), party balls' palette, battle's prompt arrow, send-out (`PokeBalls.releaseInBattle`), recall (`switchOutEffect`).

**Not bugs:** "Player defeated" and "Player lost against" say "Player" literally in FireRed's own strings, as "Ally" prefixes Mist's line.

## Open, minor, not fixed

The user approved fixing these (2026-11-04); not started.

- The player's throw is approximate: `throwBall` in `spa-pokeuniverse/src/game/firered/battle/playback.ts` goes from 32,72 in 24 frames, arc 32, no slowdown; FireRed: from 48,70, 25 frames, arc -30, slower mid-flight. `ballBlocked` uses it too.
- A transformed Pokémon's recall: `switchOut` in the same file takes `scene.monYDelta(info)`, which uses `info.species`; not checked against `transformSpecies`.
- A failed `battles.turn` leaves the client on an empty box with no error (seen with Dire Hit, before its fix).
