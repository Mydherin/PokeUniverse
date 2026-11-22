# AGENTS.md

Instructions for AI agents working on PokeUniverse.

## Documentation

The project is built by its Software Factory: every document lives in [docs/factory/](docs/factory/FACTORY.md).

- **Start with [FACTORY.md](docs/factory/FACTORY.md):** it lists every document and when to read it, and the conventions (budget, saving progress, decision numbers).
- **Where work stands:** [ROADMAP.md](docs/factory/ROADMAP.md)'s front matter (phases), each `PHASE.md`'s (milestones) and each milestone's; to resume, read the milestone's **Resume Here**. Open items: [ROADMAP.md](docs/factory/ROADMAP.md#open-items).
- Check the relevant doc **before** making any decision or change.
- Follow what the docs say; don't introduce technologies or patterns that contradict them.
- **Context guard:** the project mod [`context-wrap-up`](.claude/mods/context-wrap-up/hooks/register.ts) asks to save progress in the milestone file once the context passes 20% ([D-015](docs/factory/DECISIONS.md#d-015-one-session-per-step-context-guard-kept)).

## Reference Repositories

Git submodules in `references/` (FireRed, the Emerald expansion, HeartGold, Showdown), **read only**: never modify, build or commit anything inside them, never copy their code. What each holds, the asset exceptions and the rules: [context/references.md](docs/factory/context/references.md).

## Guidelines

### FireRed System, Gen 4 Rules

- **Match FireRed whenever possible:** screens, menus, flows, input, messages, sounds, animations and how the world behaves. Check `references/pokefirered/` first; don't simplify or invent.
- **Battle and Pokémon rules are Gen 4:** battle mechanics, moves, abilities, what items do in battle, stats, natures, growth, learning and evolution, from `references/pokemon-showdown/` and `@pkmn/sim`'s Gen 4 data.
- **Where they meet:** the rule is Gen 4, FireRed's way of showing it stays. A Gen 4 feature FireRed doesn't have is presented as FireRed would; how it behaves comes from `references/pokeheartgold/` (the following Pokémon, for one).
- **Unless it conflicts with the MMO:** keep FireRed's behavior wherever the MMO approach (server authority, many players, always saved) allows it. Where it can't work, keep as much of it as possible: SAVE behaves exactly like FireRed's dialog, though the MMO saves everything all the time.
- **A difference needs a reason:** a Gen 4 rule, the MMO or the user's request. Write it in the milestone file; anything else is a bug to fix.

### Living Documentation

Documentation must always reflect the current state of the project.

- **The user's requests are the source of truth.** Docs follow the user, not the other way around.
- **After every user request**, quickly check which docs the request affects and update **only those**, in the same iteration. Inside the factory a decided change arrives as a change request (`CR-<n>`).
- **On conflict** (the request contradicts a doc):
  1. Point out the conflict briefly and ask the user to confirm.
  2. If confirmed, update the doc to match the new decision.
  3. Never silently ignore the request or leave the doc outdated.
- Keep docs **concise and consistent**: bullets, tables, short "Why" lines. Full coverage, minimal words.
- Don't create new docs unless the user asks.

### Testing

- **No automated tests in the repository:** no unit, integration or end-to-end test suites.
- **Every milestone ends with its Manual Test played in game** ([how](docs/factory/ARCHITECTURE.md#testing-policy)): `testing` until every case passes, a failed case fixed and re-tested. Don't commit anything a test leaves behind.
- **Manual Tests are end to end in the built-in browser:** played like a player through the game UI (clicks, taps, keys), one tab per player when needed, screenshots looked at; APIs, bots and hooks only set up, read or stand in for extra players.

### Git

- **Work directly on `main`:** develop, build and commit there. Don't create feature branches to merge later (from 2026-11-09, after `gen4-battles` was merged).
- **The factory commits each step itself**; outside the factory, commit or push only when the user asks ([D-012](docs/factory/DECISIONS.md#d-012-git-on-main-the-factory-commits)).
