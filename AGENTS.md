# AGENTS.md

Instructions for AI agents working on PokeUniverse.

## Documentation

| Topic | File | Check when |
|---|---|---|
| Vision: purpose, game scope, art direction, non-functional requirements | [docs/vision.md](docs/vision.md) | Any feature, gameplay, art or scope decision |
| UI / UX: design, responsive, input, mobile keyboard, platforms, PWA | [docs/ui.md](docs/ui.md) | Any UI, screen, layout or interaction work |
| Maps: text format, tile catalog, tools, workflow | [docs/maps.md](docs/maps.md) | Any map creation, edit or map tooling work |
| Phases: MVP plan, scope and "done when" per phase | [docs/phases/](docs/phases/README.md) | Planning work, or starting/finishing a phase |
| Tech stack: structure, naming, languages, libraries, communication, auth, infrastructure, containers | [docs/tech-stack.md](docs/tech-stack.md) | Any technical decision or change |

- Check the relevant doc **before** making any decision or change.
- Follow what the docs say; don't introduce technologies or patterns that contradict them.

## Guidelines

### Living Documentation

Documentation must always reflect the current state of the project.

- **The user's requests are the source of truth.** Docs follow the user, not the other way around.
- **After every user request**, quickly check which docs the request affects and update **only those**, in the same iteration.
- **On conflict** (the request contradicts a doc):
  1. Point out the conflict briefly and ask the user to confirm.
  2. If confirmed, update the doc to match the new decision.
  3. Never silently ignore the request or leave the doc outdated.
- Keep docs **concise and consistent**: bullets, tables, short "Why" lines. Full coverage, minimal words.
- Don't create new docs unless the user asks.
