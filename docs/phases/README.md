# Phases

High-level plan to build the **MVP: all of Kanto, including social features**.

## Principles

- **Each phase ends with something working and testable.**
- **Foundations before features:** later phases only add pieces.
- **Global systems before content:** what affects the whole game (battles, items on Pokémon, multiplayer, social) is built first, on test content. Maps and events come last. *Why: content built on finished systems isn't redone.*
- **Server-authoritative from day one:** even single-player movement goes through the server.
- **Faithful first, then better:** the start of the game (intro, Oak, room, Pallet Town) is rebuilt exactly like FireRed with its original art, then upgraded with public art.
- **FireRed system, Gen 4 rules:** every phase matches FireRed unless it conflicts with the MMO, with Gen 4 battle and Pokémon rules ([vision.md](../vision.md#firered-as-reference)).
- **Riskiest parts early:** the map pipeline and client-server movement validate the approach.

## How a Phase Is Tracked

The phase file is the source of its goal, scope, technical details and progress, self-contained enough to resume with no other read. [AGENTS.md](../../AGENTS.md#current-work) points at the file to resume.

- **Every phase file:** goal, **Resume Here** while it is open (exact next step, what is left), scope with ✅ per item, done when, and the technical details found so far.
- **A phase too big for one file** becomes a folder, like [Phase 5](phase-5-battle-system/phase-5-battle-system.md):

  ```
  phase-N-name/
    phase-N-name.md       goal, Resume Here, milestone table with status, scope, done when
    milestones/
      mNN-name.md         tasks, Resume Here, files, commands, decisions, gotchas: enough alone to resume
      context.md          optional: decisions and details milestones share, read by section
      references.md       optional: where things are in the reference repositories
      log.md              optional: session history, not needed to resume
  ```

- **Planning a milestone:** list every piece, on every layer: contract, server, client screens, and what FireRed shows for it (scenes, art, strings, sounds, with their functions and files). What's missing gets rediscovered at full cost. If it won't fit one session (about 14% of the context after the start, reading included), split it.
- **Manual Test:** every milestone file has a `## Manual Test` section (it replaces `## Play It`): a table `| # | Case | Steps | Expected | Result |`, Result ⬜ / ✅ date / ❌ date + short note.
  - Played **in the game only:** the SPA in a browser, bots, `make logs`, Redis/NATS inspection when a case needs it. Never automated or deterministic suites ([AGENTS.md](../../AGENTS.md#testing)).
  - **End to end in the built-in browser (user 2026-11-14):** each case is played in the Claude app's built-in browser pane like a player: real clicks, taps, typing and keys on the game page, one tab per player when a case needs several, and the pane's mobile preset for phone cases. Look at a screenshot at each key moment (FireRed look, layout, text). The HTTP API, bots and `page.evaluate`/`TEMP-PLAYIT` hooks only set up, clean up, read state or stand in for extra players, never do the action under test. Headless Playwright only adds load or many-player runs. The Result cell says in one line how the case was played.
  - **Server-only milestones** (no UI of their own) still play at least one case through the game in the browser.
  - Covers the milestone's **Done when** in depth: happy path, then the edges that apply (warps, reconnect, battle, follower, many players, mobile layout where UI applies), not move by move. 5-12 cases.
  - Status: 🧪 = code done, Manual Test pending; ✅ only when every case passes. A ❌ gets its fix and a re-test in the same session.
- **When a milestone is ✅,** cut its file down to what later milestones use (keep the Manual Test table).

### How to Test in Game

- **Stack:** `make env` once (then a dev `BOTS_SECRET=` in `.env`, local only), `make up` (`docker compose up -d --build mic-core spa-pokeuniverse` after changing `.env` or code). `make ps`, `make logs` (`docker compose logs -f mic-core`; with two replicas lines are prefixed `mic-core-1`/`mic-core-2`).
- **Open the SPA:** `http://localhost:8080` (`SPA_PORT`) in the browser pane. The pane has no Google sign-in: log in as a bot by token, `/play?bot=<token>` (Phase 8 M1). Tokens: `curl -s -X POST localhost:8080/api/dev/bots -H "X-Bots-Secret: $S" -d '{"count":N,"refreshOnly":true}'`; run the bot script with one bot more than needed and take the last one over. A bot spawn is a fresh New Game on the map's free tiles.
- **Bots:** `node infra/bots/bots.ts --count N --map <id> [--first n] [--verbose] [--idle] [--chat] [--flood] [--say <line>]` (Node ≥ 24; `--verbose` prints what the last bot receives; `--first` lets several runs play side by side; stats every 10 s). Ctrl-C stops them; `make bots-clean` deletes their accounts after.
- **Two replicas:** `MIC_CORE_REPLICAS=2` in `.env` (or `docker compose up -d --scale mic-core=2`); kill one with `docker kill <name from make ps>`.
- **Inspect:** Redis `docker compose exec redis redis-cli -a $REDIS_PASSWORD HKEYS zone:<map>:0`; NATS monitoring `docker compose exec nats wget -qO- localhost:8222/subsz?subs=1`.
- **Mobile layout:** the pane's mobile preset (portrait/landscape); real phones via the dev server on the LAN when a case says so.
- Back up the test account's save first when a case may change it ([Phase 6 backup steps](phase-6-pokemon-party/milestones/context.md#playing-a-milestone)); nothing a test leaves is committed.
- **Code comments** cite a phase's milestones and decisions by short name: `phase-5 M7`, `phase-5 D9` (decisions are in its `context.md`).

## Phases

The list of phases, each one's state and what is still open: [index.md](index.md).
