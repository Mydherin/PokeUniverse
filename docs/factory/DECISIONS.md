# Decisions

Newest last. A decision is never deleted: a later one supersedes it and says so. Phase decisions live in each phase (see [ARCHITECTURE.md](ARCHITECTURE.md#citing-phases-and-decisions)).

## D-001 FireRed system, Gen 4 rules
- Context: the game should feel like FireRed, with Gen 4's depth, in an MMO.
- Decision: match FireRed whenever possible (screens, menus, flows, input, messages, sounds, animations, how the world behaves; check `references/pokefirered/` first, don't simplify or invent). Battle and Pokémon rules are Gen 4 (`references/pokemon-showdown/`, `@pkmn/sim`'s Gen 4 data). Where they meet, the rule is Gen 4 and FireRed's way of showing it stays; a Gen 4 feature FireRed lacks is shown as FireRed would, behaving as `references/pokeheartgold/` does. Where the MMO can't keep FireRed's behavior, keep as much as possible. A difference needs a reason (a Gen 4 rule, the MMO or the user's request), written in the milestone file; anything else is a bug.
- Affects: every phase and milestone; [VISION.md](VISION.md#firered-as-reference), [AGENTS.md](../../AGENTS.md#firered-system-gen-4-rules)
- Origin: definition

## D-002 MMO: server-authoritative, everything saved as it happens
- Context: many players share one world; a crash must never lose what a player has seen.
- Decision: the server decides everything, even single-player movement, from day one; every change is saved when it happens (PostgreSQL permanent, Redis live with AOF on every write). SAVE still behaves exactly like FireRed's dialog.
- Affects: every phase; [ARCHITECTURE.md](ARCHITECTURE.md#communication), [Saving State](ARCHITECTURE.md#saving-state-resilience)
- Origin: definition

## D-003 Reference repositories: read only, behavior only
- Context: FireRed, the Emerald expansion, HeartGold and Showdown are the references; no third-party code or Nintendo assets may enter our history.
- Decision: references are pinned Git submodules, never modified, built or committed into; code is never copied, only behavior is rebuilt with our design. The build copies or renders their assets into gitignored folders; one-time conversions (maps, catalogs, animation scripts) become our committed source.
- Affects: `references/`, `infra/`, `Makefile`, [context/references.md](context/references.md), [FireRed as Reference](ARCHITECTURE.md#firered-as-reference)
- Origin: definition

## D-004 No automated tests, manual end-to-end tests in game
- Context: the game is checked the way a player sees it (user 2026-11-14).
- Decision: no unit, integration or end-to-end test suites in the repository. Code must build green; every milestone ends with its Manual Test played in the built-in browser like a player, one tab per player; APIs, bots and hooks only set up, read or stand in for extra players.
- Affects: every milestone; [Testing Policy](ARCHITECTURE.md#testing-policy)
- Origin: definition

## D-005 Stack and architecture
- Context: a browser MMO that scales by adding copies of stateless services.
- Decision: monorepository; TypeScript + Vite + Phaser 3 client (`spa-pokeuniverse`), Go game server (`mic-core`), Node + Showdown battles (`mic-battles`), Protocol Buffers contracts (`lib-contracts`), PostgreSQL, Redis and NATS, every artifact a Docker image run by Docker Compose; only PostgreSQL and Redis hold state.
- Affects: [ARCHITECTURE.md](ARCHITECTURE.md)
- Origin: definition

## D-006 Logic decoupled from graphics
- Context: the art will be upgraded (public packs) and could be replaced entirely.
- Decision: game logic is completely separate from the presentation; the client has no game rules; clear boundaries, no extra layers.
- Affects: `spa-pokeuniverse` ([Decoupled Presentation](ARCHITECTURE.md#decoupled-presentation)), phases 11 and 12
- Origin: definition

## D-007 Full AI development: everything is text
- Context: AI agents build everything.
- Decision: code, maps, content and configuration are text or data the AI reads, writes and verifies; no manual tools (maps are text in `lib-maps`, no Tiled).
- Affects: `lib-maps`, `tool-maps`, [context/maps.md](context/maps.md)
- Origin: definition

## D-008 Art: faithful first, then public packs
- Context: efficiency and the most beautiful result without custom art.
- Decision: the intro, Oak, the room and Pallet Town first use FireRed's original art and music; public resource packs then replace them, starting with Pallet Town; species 387-493 use `pokeemerald-expansion`'s Gen 3-style art; no custom art; every pack's license and credits respected.
- Affects: phases 02-04, 10, 11, 12; [Art Direction](VISION.md#art-direction)
- Origin: definition

## D-009 Login with Google only
- Context: one simple, safe entry point.
- Decision: "Continue with Google" is the only sign-in; sessions last 30 days; a sign-in mock (`GOOGLE_MOCK`) stands in for Google in development only.
- Affects: phase 01, [Authentication](ARCHITECTURE.md#authentication), the development deployment
- Origin: definition

## D-010 Phase order
- Context: the most efficient order for an MVP of all of Kanto with social features.
- Decision: foundations first; global systems (battles, Pokémon, multiplayer, social) before content, built on test content; maps and events last, so content isn't redone; riskiest parts (map pipeline, client-server movement) early.
- Affects: [ROADMAP.md](ROADMAP.md)
- Origin: definition

## D-011 Living documentation
- Context: the user's requests are the source of truth.
- Decision: after every request the docs it affects are updated in the same iteration; a request contradicting a doc is pointed out and confirmed first; inside the factory, a decided change arrives as a change request (`CR-<n>`). New docs only when the user asks.
- Affects: every document under `docs/factory/`
- Origin: definition

## D-012 Git on `main`, the factory commits
- Context: feature branches stopped after `gen4-battles` was merged (2026-11-09); the factory runs autonomously (user 2026-11-22).
- Decision: work, build and commit directly on `main`. The factory commits each step itself; outside the factory, commit or push only when the user asks.
- Affects: every session
- Origin: definition

## D-013 Factory adoption of the existing project
- Context: phases 0-9 were planned and built before the factory, tracked in `docs/phases/` (user 2026-11-22).
- Decision: every document moved under `docs/factory/` with nothing dropped: `vision.md` → `VISION.md`, `tech-stack.md` → `ARCHITECTURE.md`, `phases/index.md` and the phase plan → `ROADMAP.md`, `ui.md`, `maps.md`, `audio.md` and each phase's shared `context.md` → `context/`, phase files → `phases/<nn>-<slug>/PHASE.md`, milestones → `milestones/<nn>-<slug>.md`. Phases 00-08 are `done`, 09 is `expanded` with M8 `building`, 10-13 `planned` with their notes in the roadmap. Old decision numbers stay (`phase-N Dn` = `D-0N.n`); Phase 6's M1b became a section of M1.
- Affects: `docs/factory/`, `AGENTS.md`, doc paths in code comments
- Origin: definition

## D-014 Phase 8 closed; its real-phone cases go to the user
- Context: M7 cases 9-10, case 11's naming screen and M9 case 6 need a real iPhone and Android phone; the factory can't play them (user 2026-11-22).
- Decision: Phase 8 is `done`; those cases are open item O22, played by the user like O3. A ❌ there becomes a change request.
- Affects: phase 08 M7, M9; [Open items](ROADMAP.md#open-items)
- Origin: definition

## D-015 One session per step, context guard kept
- Context: reading is the main cost of a session; the factory runs each step in a fresh session (user 2026-11-22).
- Decision: a milestone must fit one session (about 14% of the context after the start, reading included), else it is split. A session reads `FACTORY.md`, then only the files its step names, and only the sections it needs. The `context-wrap-up` mod stays: past 20% of the context it asks the agent to finish the task at hand and save progress in the milestone file (or `PHASE.md`) so a fresh session resumes from it.
- Affects: [FACTORY.md](FACTORY.md), `.claude/mods/context-wrap-up/`
- Origin: definition

## D-016 Production deployment and backups out of the factory
- Context: production deployments and backups are prepared from their own Mooi chats.
- Decision: Phase 13 no longer builds the production deployment or its PostgreSQL and Redis backups; it leaves the game ready to deploy (logs, metrics, NATS TLS settings documented).
- Affects: phase 13, [Infrastructure Dependencies](ARCHITECTURE.md#infrastructure-dependencies)
- Origin: definition
