# Software Factory

Index of this project's factory documents. Every agent session reads this file first, then only the
files its task names. Keep this index truthful: a file not listed here does not exist for the factory.

## Files

| File | Read when |
| --- | --- |
| `VISION.md` | Planning a phase, analysing a change request, or a milestone needs product intent |
| `ARCHITECTURE.md` | Always for building; sections relevant to the milestone only |
| `DECISIONS.md` | Planning, analysing a change, or a task touches a decided area |
| `ROADMAP.md` | Planning or analysing; builders and testers never need it |
| `context/<name>.md` | As each entry below says; milestones declare the ones they need in `context` |

## Context files

- `context/references.md`: read when a task needs how FireRed, a Gen 4 feature or a battle rule behaves, or touches the asset build (what each reference repository holds and the rules for using them).
- `context/ui.md`: read for any UI, screen, layout, input, mobile keyboard, platform or PWA work.
- `context/maps.md`: read for any map creation, edit or map tooling (text format, tile catalog, `tool-maps`, workflow).
- `context/audio.md`: read for any music, sound effect, cry or audio tooling work.
- `context/battle-system.md`: read for battle work (engine, battle screen, animations, AI, exp and evolution): Phase 5's decisions (`phase-5 Dn`), commands and shared details, by section.
- `context/battle-references.md`: read when a battle task needs where a FireRed or expansion battle feature lives in the references.
- `context/pokemon-party.md`: read for items on Pokémon, TMs, the party screen, boxes or the following Pokémon: Phase 6's decisions and how to back up a test save before playing.
- `context/wild-battles.md`: read for wild encounters, wild battles or catching: Phase 7's decisions and the Gen 4 rules several milestones share.
- `context/multiplayer.md`: read for zones, other players, replicas, zone chat or bots: Phase 8's decisions (zones, personal layer, map phases) and how to play a milestone with bots and replicas.
- `context/social.md`: read for friends, direct messages, private channels, the social panel, the Pokémon Center 2F, link rooms, trading or PvP: Phase 9's decisions (D1-D29) by section.

## Conventions

- Phases live in `phases/<nn>-<slug>/PHASE.md`; milestones in `phases/<nn>-<slug>/milestones/<nn>-<slug>.md`.
- The YAML front matter of `ROADMAP.md`, `PHASE.md` and milestone files drives the factory: keep it valid.
- Decisions: `D-<nnn>` in `DECISIONS.md` (global), `D-<phase nn>.<n>` in a `PHASE.md`; each says what it affects.
- Change requests are referenced as `CR-<n>` wherever they changed something.
- Production deployments and backups are out of the factory: never touch `deploy/production/` or backup files.
- **Imported phases (D-013):** phases 00-09 were built before the factory. Their decisions keep their old numbers, `D<n>` in their context file (`phase-N Dn` in code = `D-0N.n`); `phases/05-battle-system/log.md` is session history, never needed to resume. Open items (`O<n>`) are tracked in [ROADMAP.md](ROADMAP.md#open-items): one line each, updated in the same edit that opens, closes or moves one.
- **Phase file:** goal, **Resume Here** while it is open (exact next step, what is left), milestone table (needs, in short), scope, done when, and the technical details found so far.
- **Milestone file:** tasks, **Resume Here**, files, commands, decisions, gotchas: enough alone to resume; its `## Manual Test` table `| # | Case | Steps | Expected | Result |` ([how](ARCHITECTURE.md#testing-policy)). Once `done`, cut it down to what later milestones use (keep the Manual Test table).
- **Planning a milestone:** list every piece, on every layer: contract, server, client screens, and what FireRed shows for it (scenes, art, strings, sounds, with their functions and files). What's missing gets rediscovered at full cost. If it won't fit one session (about 14% of the context after the start, reading included), split it.
- **Session budget (D-015):** read this file, then only the milestone file and what its Resume Here names, and only the sections a step needs (`grep -n`, then a ranged read). Never re-check `done` items in the code. Decide, then write.
- **Save progress:** at the end of a session, or when the `context-wrap-up` mod asks (past 20% of the context), write into the milestone file (or `PHASE.md` if the phase has none): tasks done, exact next step in **Resume Here**, files touched, build state, gotchas, commands and decisions the next steps use, whatever was looked up. Replace stale text, don't pile it up.
