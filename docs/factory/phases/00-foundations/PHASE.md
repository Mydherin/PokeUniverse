---
milestones: []
---

# Phase 0: Foundations

**Goal:** the full project skeleton running end to end, with no features.


## Scope

- [x] Monorepo folders: `spa-pokeuniverse`, `mic-core`, `mic-battles`, `lib-contracts` (`tool-maps` comes in [Phase 4](../04-players-room/PHASE.md), the first phase with maps).
- [x] Reference repositories as shallow Git submodules in `references/` ([ARCHITECTURE.md](../../context/references.md#how-references-are-kept)).
- [x] Docker Compose with PostgreSQL, Redis and NATS; one Dockerfile per artifact.
- [x] `lib-contracts` with Buf, generating Go and TypeScript code.
- [x] Shared commands to build and run everything (`Makefile`).
- [x] `mic-core` ↔ `mic-battles` test message over NATS (`battles.ping`).
- [x] Mooi development deployment (2026-11-22, commit 0210b5d): the root `compose.yaml` runs in the Deploy preview with the project's `MOOI_DEVELOPMENT_*` variables, assets built in the image (`ASSETS=built`), the app under the preview's base path and the Google sign-in mock ([Development Deployment](../../ARCHITECTURE.md#development-deployment)).

## Done When

- [x] The whole stack starts with **one command** (`make up`).
- [x] The SPA connects to `mic-core` over WebSocket and exchanges a Protocol Buffers test message (Ping/Pong).
