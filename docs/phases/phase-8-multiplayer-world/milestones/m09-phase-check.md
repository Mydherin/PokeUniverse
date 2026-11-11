# M9 Phase Check 🚧

Part of [Phase 8](../phase-8-multiplayer-world.md). **Needs:** M1-M8. Rules: [context.md](context.md) (all), [Playing a Milestone](context.md#playing-a-milestone).

**Done when:** the phase's Done When is played end to end, every restart and crash case passes, and the regression check finds nothing; leftovers are moved to later phases in [index.md](../../index.md#open-items).

## Resume Here

**In progress (2026-11-11): cases 1-5 and 7 ✅, case 6 ⏳ (real phones, with M7's 9-10). Next: case 8 (Restarts), then 9, 10, 11.** No bug found, no code changed; TEMP hooks removed, `.env` untouched, bots stopped, nothing to commit but this file.

- **Driver:** shared notes folder `m9-headless/` (its `README.md`: copy into your scratchpad, re-add the TEMP-PLAYIT hooks it lists, rebuild the SPA, `KEEP=1` run, command list). Tabs: A = BOT31 (account 1405), B = BOT32 (1406). Use `KEEP=1` from now on: without it the dev bots endpoint resets the bot's save.
- **Stack:** two replicas `mic-core-3` and `mic-core-4` (scaled, no `MIC_CORE_REPLICAS` in `.env`; keep it so). Bots: `node infra/bots/bots.ts --count 15 --map pallet_town_players_house_1f` and `--count 15 --map pallet_town_players_house_2f --first 16` (they also roam the stairs, so per-floor counts move; 30 in all). `hk.sh` checks the Redis hashes.
- **Case 8 plan:** with 30 bots + both tabs on 2F, `B watch BOT31`; for each of `docker restart pokeuniverse-mic-core-3`, then `-4`, `docker kill` one (bring it back with `docker compose up -d --scale mic-core=2 --no-recreate`), `docker compose restart redis`, `docker compose restart nats`: within 15 s the bots' stats show all connected, `hk.sh` total = players connected, no id in both hashes, the tabs' `self` tile unchanged, `B unwatch` shows A back once.
- **Case 9:** M8's ramp short: `node infra/bots/run.ts` (see M8's Resume Here) to 100 on one map; compare to D18. **Case 10:** context.md regression check (Phase 6 notes: account 2 in the browser pane, or a bot tab with `KEEP=1`); catching too. **Case 11:** restore `m9-backup.sql` from the notes folder (Phase 6's restore steps; account 2 wasn't played so far, so a diff may already match), `make bots-clean`.
- **Gotchas:** `?bot=` tabs can't refresh their 15-min access token: `renew` each tab every ~14 min. Playwright's `setOffline` doesn't close an open WebSocket; `route` + `cut`/`restore` does. The room trainer heals both teams before battling, so a quick loss isn't possible; bot Charizard's moves KO any wild Pokémon, so a faint needs Growl-only + 1 HP (bot data, set with the tab away 16 s). Start menu: POKéMON is first; Charizard's submenu: SUMMARY, SWITCH, ITEM, CANCEL. Wild Chansey here has no damaging move.

## Manual Test

| # | Case | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | Backup | Phase 6's backup steps | Save backed up in the shared notes folder | ✅ `m9-backup.sql` in the shared notes folder (426 lines) |
| 2 | Together | Two real tabs (pane + `?bot=`), 30 bots on both maps, two replicas | Each sees the others and their followers walk, run, turn, use the stairs; no `Correction` walking through | ✅ Tabs BOT31 (mic-core-3) and BOT32 (mic-core-4) headless, 30 bots: each sees every player of its zone (bots wander the stairs too: 13 + 17); B saw A's walk, run, turns and follower step for step (hidden until the first step), A vanished on taking the stairs and both saw each other on 2F; 0 corrections |
| 3 | Followers | Lead swap; a faint in the test grass making another lead | The other tab sees each new follower | ✅ A swapped Charizard → Pikachu in the party menu: B drew Pikachu at once (hidden until A's next step, then behind A). B's Charizard (1 HP, Growl only: bot data) fainted to a wild Pikachu's ThunderShock in the 1F grass; after RUN, A drew B's follower as Pikachu, `in_battle` false, stepping behind B |
| 4 | Battles | One tab in a wild battle, the other in the room trainer's | Each sees the other standing; both walk after | ✅ The grass is on 1F and the trainer on 2F, so each battle was watched from the same floor: B's wild battle on 1F (A drew B standing on its tile, `in_battle` true, follower beside it; after RUN, B walked and A drew it); A's trainer battle on 2F (B drew A standing, `in_battle` true). The trainer heals both teams first, so A ended it with a reload (dropped, phase-5 D22): B drew A `in_battle` false, both walked, each drew the other; 0 corrections |
| 5 | Chat, PC | Lines between tabs and bots; the other map; flood; charset and length; panel | Zone-only, limited, valid text only | ✅ A's line reached B and a 2F bot, not a 1F bot; a 2F bot's line reached both tabs, a 1F bot's neither; nothing replayed on entering. A's 8 quick lines: 4 sent, the 5th waited in the input (M6's rule). A `--flood` bot: FLOOD 1-4, then one every ~2 s. Input dropped emoji and `~` as typed (kept é ü), capped at 64. A bot's emoji line, 65-character line and blank line were dropped by the server, 64 characters kept, `  TRIM ME  ` trimmed; each kept line logged (`chat`, trainer, map, phase). PC panel beside the screen, a color per player, long line wrapped |
| 6 | Chat, phones | Ticker, sheet, compose, gestures on iOS Safari and Android Chrome (D21-D23) | As M6, M7 | ⏳ Waits on the user's phones with M7's cases 9-10 (headless touch emulation passed in M7 cases 1-8 and 11; no chat code changed since) |
| 7 | Reconnect and take-over | Network off/on in one tab; same account in a third tab | Others redrawn, chat log cleared; old tab stops, one leave + one join | ✅ Network cut in A (Playwright `routeWebSocket` closing both sides and refusing reconnects, plus `setOffline`; `setOffline` alone keeps an open WebSocket): A showed Reconnecting… with no one drawn; B drew A leave at once. Back on: A online by its backoff, 15 others redrawn, chat log empty; B drew A again on the same tile. Third tab as A's account: old tab "Playing somewhere else", stopped; B drew one copy throughout (the new join replaces it, M4), then followed the new tab's steps |
| 8 | Restarts | Restart each replica in turn, `docker kill` one, restart Redis and NATS | No ghost, everyone back within 15 s, no lost position | ⬜ |
| 9 | Load | M8's ramp, short (100 on one map) | Within D18 | ⬜ |
| 10 | Regression | Phase 7's check: party, bag, PC, boxes, room trainer, test grass, catching | Nothing broken | ⬜ |
| 11 | Clean up | Restore the backup; `make bots-clean` | Save equal to the backup; no bot accounts | ⬜ |

## Follow-ups (Later Phases)

- To fill in at the end: what moved to Phase 9 (trainer card on A, friends, private and party chat, busy state in the social menu), Phase 10 (story flags, personal layer, map phases, D19-D20), Phase 12 (players across connected maps), Phase 13 (moderation, production limits).
