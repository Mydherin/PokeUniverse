# Phase 0: Foundations

**Goal:** the full project skeleton running end to end, with no features.

## Scope

- Monorepo folders: `spa-pokeuniverse`, `mic-core`, `mic-battles`, `lib-contracts`, `tool-maps`.
- Docker Compose with PostgreSQL, Redis and NATS; one Dockerfile per artifact.
- `lib-contracts` with Buf, generating Go and TypeScript code.
- Shared commands to build, test and run everything.
- Test setup for Go and TypeScript.
- `mic-core` ↔ `mic-battles` test message over NATS.

## Done When

- The whole stack starts with **one command**.
- The SPA connects to `mic-core` over WebSocket and exchanges a Protocol Buffers test message.
