# M8 Phase Check 🚧

Part of [Phase 7](../phase-7-wild-battles-catching.md). **Needs:** M1-M7. Rules: [context.md](context.md#playing-a-milestone).

**Done when:** the whole phase is played once from a fresh session, every restart case resumes, the follower behaves in grass and wild battles, the regression check passes, and the phase's Done When is ticked.

## Resume Here

**All play checks done ✅ (5 sessions); test data restored.** Only [Closing](#closing) is left: no more playing, no code.

**Next (one session, docs only):** (1) Tick this file's Closing boxes: cut M1-M8 milestone files to what later phases use, write the follow-ups list below. (2) Mark M8 ✅ (title, Resume Here → "done"), close Phase 7 as [README.md](../../README.md#how-a-phase-is-tracked) says: phase file (Resume Here, milestone table, Done When ticks), the Phases table in README.md, [index.md](../../index.md) (state, milestone counts, open items: add the follow-ups aimed at later phases, with links). (3) AGENTS.md **Now** → Phase 8's file. Don't plan or build Phase 8.

**Results:** Run 1-8 ✅ (Run 6 Thief was ✅ in session 1-3). Restarts (failed RUN, ball broke free, mid-turn, nickname question with party/full party, PC message), real crash (`kill mic-core`), reload mid-battle (balls back) ✅. Repel/flute/Cleanse Tag/Illuminate counts, Sweet Scent, Smoke Ball under BLOCK, RUN refused, ball blocked ✅. Run 8 win (session 5): exp messages and stat boxes, Lv100 gets none (Gen 4), "Will AA change POKéMON?" between foes, "Player defeated COOLTRAINER ROLANDO!" (FireRed's literal "Player"), defeat text, ₽1800 prize. Pickup: POTION found by Meowth Lv10 (silent, as FireRed). Run 7 wild whiteout: "AA is out of usable POKéMON!", "panicked and lost ₽800" (Lv100 × 4 × 2), "… … … …", "whited out!", home 1F, party healed. Follower: in grass, through the transition and back, unchanged after a catch that filled the party, first healthy member after the lead faints; hidden right after load until the first step = HGSS (`follow_mon.c:1913` creates it hidden until a step).

**Fix made (session 2), played ✅, uncommitted at the time:** nickname question lost after a restart, `spa-pokeuniverse/src/game/firered/overworld.ts`: the join's `BattleEnded{caught{nicknamePending}}` arriving while the map loads is kept in `pendingNaming` for the new `Overworld`; with no battle screen `askCaughtName` asks in the field's message box (`sText_GiveNicknameCaptured` + `fieldYesNo`; NO → PC text when BOX; YES → naming screen). **Difference (MMO):** FireRed has no reconnect. Naming-screen icon fix built, not looked at.

**Follow-ups for later phases (to list in Closing):** Safari Ball, roamers, rods and Surf hooks, `FLAG_SYS_NOT_SOMEONES_PC`, the test grass removed in Phase 10; SUMMARY "Met in Somewhere" in the house (no map section name, not Phase 7).

**State now:** build unchanged since session 2 (SPA typecheck passes). Account 2 restored from `m8-db-backup-before.sql` (shared notes): 39 Pokémon, original party, 2F 9,5 north, ₽2560, `player:2:pos` deleted, refresh tokens revoked. `battle_outcomes` rows from the tests were left (history only). Pane closed on `/`.

## The Run

1. Walk into the test grass with the follower: both rustle; a wild battle starts with the right transition, intro and music.
2. RUN once (escape), once against a faster foe until it fails, once holding a Smoke Ball: its escape animation before the message (O4, hooked in M6, not played there).
3. Weaken a foe, throw a POKé BALL until it catches; Pokédex page (new species), name it, see it in POKéMON with its ball and name.
4. Fill the party, catch another: sent to the PC; find it in BILL'S PC.
5. Repel: no low-level battles, then the wore-off message. Black Flute, Cleanse Tag, an Illuminate lead: rate changes (rough counts).
6. Sweet Scent in the grass. Pickup over a few battles. Thief on a held item.
7. Lose on purpose: wild whiteout texts and money.
8. The room trainer: RUN refused, ball blocked, battle still wins with exp.

## Restarts

- `docker compose restart mic-battles` and then `mic-core`: mid-turn, after a failed RUN, after a ball broke free, at the nickname question (asked again), at the PC message.
- A real crash (`docker compose kill mic-core`) during a wild battle (Phase 5 M14 left it unplayed for trainers).
- A reload during a wild battle drops it (Phase 5 D22), with balls used back in the bag.

## Follower

- In grass, through the transition and back after the battle; after a catch that changes the party (lead unchanged); after the lead faints in a wild battle (Phase 6 M9's rules).

## Closing

- [ ] Every milestone file cut to what later phases use; this phase's Resume Here and the Phases table in [README.md](../../README.md); AGENTS.md's **Now** → Phase 8.
- [ ] Follow-ups for later phases listed here (Safari Ball, roamers, rods and Surf hooks, `FLAG_SYS_NOT_SOMEONES_PC`, the test grass removed in Phase 10).
