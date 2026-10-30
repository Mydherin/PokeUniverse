# Tech Stack

## Main Guidelines

- **Monorepository:** all code lives in this repository, one folder per artifact at the root.
- **Microservices:** each service has one responsibility and runs on its own. We start with two; more will come (e.g. `mic-ai`).
- **Protocol Buffers:** all artifacts communicate through contracts defined in `lib-contracts`.
- **Containers:** every artifact ships as a Docker image. Services are **stateless**; only PostgreSQL and Redis hold state.

## Reference Repositories

| Repository | Role |
|---|---|
| [pret/pokefirered](https://github.com/pret/pokefirered) | FireRed decompilation: **reference only** for game behavior; source for the one-time map conversion |
| [smogon/pokemon-showdown](https://github.com/smogon/pokemon-showdown) | Showdown battle engine: reference for battle rules |
| [pkmn/ps](https://github.com/pkmn/ps) | Source of `@pkmn/sim`, `@pkmn/data`, `@pkmn/dex`: **used as dependencies** in `mic-battles` (installed via npm, not cloned) |

### How References Are Kept

- **Git submodules:** one per repo in `references/<name>/`, declared in `.gitmodules` with `shallow = true`.
- **Pinned:** each submodule points to an exact commit; updating it is a one-line, reviewable change (`git submodule update --remote <path>`).
- **Fetch:** `git clone --recursive`, or `git submodule update --init` after cloning.
- **Excluded from builds:** `references/` is in `.dockerignore` and skipped by CI.
- **Why:** no third-party code or Nintendo assets in our history, native Git pinning with no custom scripts, reproducible map conversion, small and fast to fetch.
- Agent usage rules: [AGENTS.md](../AGENTS.md#reference-repositories).

## FireRed as Reference

- **Reference:** the FireRed decompilation ([pret/pokefirered](https://github.com/pret/pokefirered)), readable C source of the original game.
- Used **only to understand behavior**: how actions and events work (movement, collisions, encounters, menus, scripts, formulas).
- **Never copy code.** Everything is rebuilt from zero with our own code, architecture and patterns.
- When the reference and our design disagree, **our design wins**; we replicate the behavior, not the implementation.

## Code Principles

- **Modular:** small modules, each owning one area (e.g. movement, inventory, encounters).
- **Single Responsibility Principle:** each module, type and function has one reason to change.
- **Low coupling:** modules depend on interfaces and contracts, not on each other's internals.
- **High cohesion:** code that changes together lives together.
- **Proven design patterns** where they simplify (e.g. command, observer/events, repository, strategy); never added for their own sake.
- **Simple first:** the simplest solution that respects these principles.

## Structure

```
PokeUniverse/
├── spa-pokeuniverse/   # Frontend (browser game client)
├── mic-core/           # Main game server (Go)
├── mic-battles/        # Battle service (Node + Pokémon Showdown)
├── lib-contracts/      # Protocol Buffers contracts
├── tool-maps/          # Map converter, validator, compiler, previewer (Go)
├── references/         # Read-only reference repos (Git submodules)
└── docs/
```

## Naming

| Prefix | Layer |
|---|---|
| `spa-` | Frontend |
| `mic-` | Microservice |
| `lib-` | Shared library |
| `tool-` | Development tool (not deployed) |

Microservices are named by responsibility (`mic-core`, `mic-battles`), lowercase with hyphens.

## spa-pokeuniverse

Shows the game and sends player actions. Contains **no game rules**. Talks only to `mic-core`.

| Tool | Purpose |
|---|---|
| **TypeScript** | Language |
| **Vite** | Dev server and build |
| **Phaser 3** | Game renderer (world, characters, battles) |
| **Tailwind CSS** | Styling for HTML UI outside the game canvas (login, account screens, overlays) |
| **@bufbuild/protobuf** | Protocol Buffers runtime |

### Decoupled Presentation

The UI and art must be replaceable (e.g. Gen 5 graphics, 3D) without changing the game. Kept simple with three rules:

- **All game rules live on the server** (`mic-core`, `mic-battles`). The client never decides outcomes.
- **The game only uses IDs**, never images: `species:25` at tile `(10, 4)`, not `pikachu.png`. An **asset manifest** per art style maps IDs to visuals.
- **Phaser only renders**: it reads client state and sends player intents. A new renderer means a new presentation folder and manifest; contracts, server and client state stay untouched.

## mic-core (Go)

Main server: player connections, world, movement, NPCs, items, quests, trades, chat, saving data. Decides when a battle starts and delegates it to `mic-battles`.

**Why Go:** high performance, low memory, goroutines handle thousands of connections easily, simple code that AI writes well.

| Library | Purpose | Why |
|---|---|---|
| **gorilla/websocket** | WebSocket connections | Most proven Go WebSocket library, best documented, efficient |
| **jackc/pgx v5** | PostgreSQL driver | Fastest, most complete Go driver for PostgreSQL |
| **sqlc** | Database access | Generates type-safe Go code from plain SQL (see below) |
| **pressly/goose** | Database migrations | Simple, robust versioned migrations (see below) |
| **redis/go-redis v9** | Redis client | Official Redis client for Go |
| **nats-io/nats.go** | NATS client | Official NATS client |
| **google.golang.org/protobuf** | Protocol Buffers runtime | Official Go implementation |
| **golang.org/x/oauth2** + **coreos/go-oidc** | Google sign-in | Standard OAuth 2.0 and Google ID token verification |
| **golang-jwt/jwt v5** | Access tokens | Most used Go JWT library; supports EdDSA |

### Database Access: sqlc

Instead of a classic ORM (like GORM), we write **plain SQL queries** and **sqlc generates type-safe Go functions** from them.

- **Efficient:** no reflection or hidden queries; the SQL that runs is exactly the SQL written.
- **Safe:** a query that doesn't match the schema fails at generation time, not in production.
- **AI-friendly:** SQL is explicit and easy to read; generated code is predictable.
- **Maintainable:** queries live in `.sql` files, one place to review them.

### Migrations: goose

Database changes are versioned SQL files applied in order, similar to Liquibase or Flyway in Java.

- Each change is one file: `00001_create_players.sql`, with `Up` and `Down` sections.
- Migrations are **embedded** in the `mic-core` binary and run on startup or via command.
- sqlc reads the same migration files as its schema, so code and database never drift.

## mic-battles (Node + Showdown)

Runs battles only. Never talks to players; only `mic-core` talks to it.

**Why:** Showdown already implements exact Gen 4 mechanics, battle-tested. Rewriting it in Go would take months and add bugs.

| Tool | Purpose |
|---|---|
| **Node.js 26 LTS** | Runtime (Active LTS since Oct 2026, supported until Apr 2029) |
| **TypeScript** | Language |
| **@pkmn/sim** | Pokémon Showdown battle simulator, run with Gen 4 rules |
| **@pkmn/data** + **@pkmn/dex** | Pokémon, moves, abilities, items and learnsets, filtered to Gen 4 |
| **@nats-io/transport-node** | NATS client |
| **@bufbuild/protobuf** | Protocol Buffers runtime |

- Battles use Showdown's **Gen 4 format**: 493 Pokémon, Gen 4 moves, abilities, items and the physical/special split.

## lib-contracts

Single source of truth for every message between artifacts.

| Tool | Purpose |
|---|---|
| **Protocol Buffers (proto3)** | Message definitions |
| **Buf CLI** | Lint, breaking-change detection, code generation |
| **protoc-gen-go** | Generates Go code for `mic-core` |
| **protoc-gen-es** | Generates TypeScript code for `spa-pokeuniverse` and `mic-battles` |

Rules:

- Contracts are grouped by domain and versioned: `pokeuniverse.world.v1`, `pokeuniverse.battle.v1`.
- Generated code is **never edited by hand**; it is regenerated with `buf generate`.
- `buf breaking` runs on every change so existing clients never break silently.

## Communication

```
spa-pokeuniverse ──► mic-core ──► NATS ──► mic-battles
     (Protocol Buffers           (Protocol Buffers
      over WebSocket)             over NATS)
```

- **Frontend ↔ `mic-core`:** Protocol Buffers messages over **WebSocket**, a persistent two-way connection so the server can push updates instantly.
- **Microservice ↔ microservice:** Protocol Buffers messages over **NATS**. Services never call each other directly.

**Why Protocol Buffers:**
- Smaller and faster than JSON.
- Message mismatches fail at build time, not in production.
- One file to change per message.
- Any future frontend (e.g. 3D) connects using the same contracts.
- AI reads one place to know every message.

### Efficient Event Model

Goal: send **only the minimum information** needed for each event to happen on every client.

**Client → server: intents only**
- The client sends what the player **wants** (`MoveIntent{direction}`, `UseItem{item_id}`), never results or state.
- The server validates and decides (**server-authoritative**). This also prevents cheating.

**Server → client: events, not state**
- On entering a map: **one snapshot** (players, NPCs, objects in that zone).
- After that: **only deltas/events** (`PlayerMoved{id, x, y, facing}`, `PlayerLeft{id}`).
- Never resend data the client already has.

**Interest management**
- Players receive events **only from their current zone** (map area), not the whole world.
- Each zone runs in its own goroutine, so load spreads naturally.

**Minimal payloads**
- Use **numeric IDs and enums**, never names or text: `species: 25`, not `"Pikachu"`; `facing: UP`, not `"up"`.
- Tile coordinates as small integers; no pixel positions.
- Static data (Pokémon, moves, items, maps) is **loaded once** by the client from versioned data files, never sent per event.

**Client derives the rest**
- The server says **what** happened; the client decides **how it looks**.
- `PlayerMoved` to a tile → the client animates the walk. One message per step, not per frame.
- Battles: the server sends compact turn results (`MoveUsed`, `Damage{target, hp}`); the client plays animations, text and sounds.
- This also keeps the presentation swappable: events never contain visual details.

**Batching and rate**
- Events per zone are **batched per server tick** (10–20 ticks/second) into one WebSocket message.
- Rapid repeated intents are rate-limited per player.

**One envelope**
- All messages share one Protocol Buffers envelope (`oneof` payload) with a **sequence number** for ordering.
- On reconnect, the client receives a fresh snapshot and continues with deltas.

**Between microservices (NATS)**
- Subjects are named by domain and action: `battles.start`, `battles.turn`, `world.events.pokemon_caught`.
- **Request/reply** for operations needing an answer (battle turns); **publish** for events other services may react to.
- Messages carry IDs and the minimum data the receiver needs, never full objects "just in case".

**Why NATS (instead of REST, gRPC or Kafka):**
- Supports both **request/reply** (battle turns) and **events** (future services listening to game events) in one tool.
- Very low latency; handles millions of messages per second.
- Built-in load balancing: running more copies of a service spreads the work automatically.
- New services just connect and subscribe; nothing else changes.
- Simple to run: one small binary.

## Authentication

**Protocol:** Google **OpenID Connect** (OAuth 2.0) for identity, then **our own tokens**: short-lived **JWT access tokens** plus rotating **refresh tokens**.

- Google only proves who the player is, once per login.
- After that, PokeUniverse issues and checks its own tokens. No call to Google per request.

### Single Entry Point: "Continue with Google"

The login screen has **one button**. One use case covers both sign-up and login:

1. Player clicks **Continue with Google** and signs in on Google.
2. `mic-core` receives the authorization code (Authorization Code flow with PKCE) and verifies Google's ID token.
3. `mic-core` looks up the account by Google ID (`sub`):
   - **Not found:** creates it automatically. No extra data asked.
   - **Found:** loads it.
4. Player lands on the home screen. Same result, same screen, no extra steps.

- PokeUniverse stores no passwords.
- Google ID (`sub`) is the account's unique identity (email can change; `sub` never does).

### Tokens

| Token | Format | Lifetime | Stored in | Used for |
|---|---|---|---|---|
| **Access token** | Signed JWT | 15 minutes | Client memory only | Authenticating every request and connection |
| **Refresh token** | Random opaque string | 30 days, **sliding** | `HttpOnly` secure cookie (client); **hash** in PostgreSQL (server) | Getting new access tokens in the background |

### Staying Logged In for 30 Days

- The client **refreshes the access token silently** before it expires.
- **Every refresh resets the 30-day window.** A player who opens the game regularly never logs in again.
- After **30 days without opening the game**, the refresh token expires and the player sees the login screen.
- **Rotation:** every refresh returns a **new** refresh token and invalidates the old one.
- **Reuse detection:** if an old refresh token is used again (sign of theft), all of that player's sessions are revoked.

### Scalable Verification (No Bottlenecks)

- Access tokens are signed with an **asymmetric key** (Ed25519 / EdDSA).
- `mic-core` signs them with the **private key**; any service verifies them with the **public key**, locally, with **no database or network call**.
- Only refresh hits the database: once every ~15 minutes per player, not per request.
- Keys have an ID (`kid`) so they can be rotated without logging anyone out.

### Across Microservices

- **WebSocket:** the access token is checked when the connection opens. The client sends each refreshed token over the open socket; if it expires without renewal, the server closes the connection.
- **NATS:** players never reach NATS. `mic-core` includes the verified player ID (and roles when needed) in each message.
- **Service-to-service trust:** each microservice connects to NATS with its own credentials (NATS accounts + TLS), so only our services can publish or subscribe.
- Any future service exposed to players verifies the same JWT with the same public key.

### Roles

- Roles are stored in PostgreSQL and included in the access token (`roles` claim).
- Initial roles: **`user`** (default for every new account) and **`admin`**.
- New roles are added as data, without changing the auth design.
- Permissions are checked per action against roles (role-based access control).
- A role change takes effect at the next refresh (max 15 minutes), or immediately by revoking the player's sessions.

### Auth Endpoints

Authentication uses plain **HTTPS** endpoints on `mic-core` (not WebSocket), because it involves browser redirects and cookies:

| Endpoint | Purpose |
|---|---|
| `GET /auth/google` | Start Google sign-in |
| `GET /auth/google/callback` | Finish sign-in: create or load account, issue tokens |
| `POST /auth/refresh` | Rotate refresh token, return new access token |
| `POST /auth/logout` | Revoke current session |

## Infrastructure Dependencies

| Dependency | Purpose | Data lifetime |
|---|---|---|
| **NATS** | Messaging between microservices | In transit only |
| **PostgreSQL** | Permanent data: accounts, roles, refresh tokens, Pokémon, items, progress | Permanent |
| **Redis** | Fast live data: online players, cache, rate limits | Temporary |

- **NATS:** the "post office" between microservices. Players never connect to it.
- **PostgreSQL:** the source of truth. Anything that must survive a restart lives here.
- **Redis:** in-memory and very fast. Holds data that changes constantly or can be rebuilt, keeping load off PostgreSQL.

## Containers

Everything runs in Docker.

- **One `Dockerfile` per artifact** (`spa-pokeuniverse`, `mic-core`, `mic-battles`), using multi-stage builds for small images.
- `spa-pokeuniverse` is built to static files and served from its own container.
- **Docker Compose** runs the whole stack: artifacts plus NATS, PostgreSQL and Redis.

### Stateless Services

| Container | State |
|---|---|
| `spa-pokeuniverse` | Stateless |
| `mic-core` | Stateless |
| `mic-battles` | Stateless |
| NATS | Stateless (no persistence) |
| **PostgreSQL** | **Stateful** (persistent volume) |
| **Redis** | **Stateful** (persistent volume) |

- Only PostgreSQL and Redis have volumes.
- Any service container can be stopped, restarted or duplicated at any time without losing data.
- This is what allows scaling: more players means more copies of a service, nothing else.
