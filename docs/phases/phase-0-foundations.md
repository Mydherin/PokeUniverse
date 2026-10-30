# Phase 0: Foundations

**Goal:** the full project skeleton running end to end, with no features.

**Status:** done.

## Scope

- [x] Monorepo folders: `spa-pokeuniverse`, `mic-core`, `mic-battles`, `lib-contracts` (`tool-maps` comes in [Phase 2](phase-2-map-pipeline.md)).
- [x] Reference repositories as shallow Git submodules in `references/` ([tech-stack.md](../tech-stack.md#how-references-are-kept)).
- [x] Docker Compose with PostgreSQL, Redis and NATS; one Dockerfile per artifact.
- [x] `lib-contracts` with Buf, generating Go and TypeScript code.
- [x] Shared commands to build and run everything (`Makefile`).
- [x] `mic-core` ↔ `mic-battles` test message over NATS (`battles.ping`).

## Done When

- [x] The whole stack starts with **one command** (`make up`).
- [x] The SPA connects to `mic-core` over WebSocket and exchanges a Protocol Buffers test message (Ping/Pong).
