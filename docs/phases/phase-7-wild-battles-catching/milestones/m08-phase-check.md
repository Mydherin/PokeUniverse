# M8 Phase Check ⬜

Part of [Phase 7](../phase-7-wild-battles-catching.md). **Needs:** M1-M7. Rules: [context.md](context.md#playing-a-milestone).

**Done when:** the whole phase is played once from a fresh session, every restart case resumes, the follower behaves in grass and wild battles, the regression check passes, and the phase's Done When is ticked.

## Resume Here

**Not started.** First step: back up account 2 (Phase 6's context), then play the run below in order.

## The Run

1. Walk into the test grass with the follower: both rustle; a wild battle starts with the right transition, intro and music.
2. RUN once (escape), once against a faster foe until it fails.
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
