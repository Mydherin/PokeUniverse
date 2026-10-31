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
- **Assets exception:** FireRed's graphics are copied as they are by `make graphics` (no tool; drawn with their palettes and tilemaps at runtime; the fonts' glyph widths are read from `src/text.c` into JSON files), `make text` encodes the strings the game shows (dialogue, menus) with the game's `charmap.txt`, as its own build does (`infra/text/extract.mjs`; the list is `src/game/firered/texts.json`), `make audio` renders its music, sound effects and cries ([audio.md](audio.md)), and `make maps` renders its tilesets to PNG ([maps.md](maps.md)), from the submodule into **gitignored** folders at build time (before the Docker build, since `references/` is excluded from it). They are served by the game but **never committed**.

### Original Game (Emulator)

- `tool-emulator/`: the original FireRed in **EmulatorJS** (mGBA core), served by a small Node server (`server.mjs`) in Docker, to compare our game with the real one.
- `make emulator` opens it in the browser on `http://localhost:8090` (`EMU_PORT`). `ROM=path` copies a ROM in (to `rom/firered.gba`); `STATE=name` starts from that save state.
- **Save states are files:** the emulator's Save/Load State buttons write to and list `tool-emulator/states/<name>.state` (+ a `.png` screenshot); `?state=<name>` starts from one. In-game saves stay in the browser.
- The ROM, EmulatorJS (fetched from npm on first run, pinned version) and the states are **gitignored, never committed**.

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
├── lib-maps/           # Text maps, shared layouts and tile catalogs: world source, compiled for the client and mic-core
├── tool-maps/          # Map converter, validator, compiler, previewer (Go)
├── tool-emulator/      # The original FireRed in the browser, to compare with ours (`make emulator`)
├── references/         # Read-only reference repos (Git submodules)
├── infra/              # Infrastructure config (e.g. nats/nats.conf; audio/: the `make audio` image; text/: the `make text` encoder)
├── docs/
├── compose.yaml        # Whole stack
├── Makefile            # Shared commands
├── .env.example        # Configuration template (.env is never committed)
└── package.json, pnpm-workspace.yaml, pnpm-lock.yaml   # TypeScript workspace
```

### Shared Commands

- **Make** runs every shared command; each tool runs in Docker, so only **Docker and Make** are needed on the host.
- `make env` (create `.env` with generated secrets), `make up` / `down` / `logs` / `ps` / `clean`, `make generate` (contracts + sqlc), `make tidy`, `make lock`, `make breaking`, `make assets` (`make graphics` + `make text` + `make audio`: FireRed's art, text and sound into gitignored folders). `make maps` (render the maps' tileset art, validate and compile `lib-maps`) and `make tool-maps CMD="..."` (any map command, [maps.md](maps.md#tools)). `make emulator` (the original game, see below). `make up` runs `make assets` first. `make help` lists them.
- **pnpm workspaces** for TypeScript packages; Go modules linked with `replace`.
- **Generated code is committed** (Protocol Buffers, sqlc), so builds never need the generators.

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
| **Phaser 3** | Game loop, scaling, Web Audio; shows the game's frame (world, characters, battles) |
| **Tailwind CSS** | Styling for HTML UI outside the game canvas (login, account screens, overlays) |
| **@bufbuild/protobuf** | Protocol Buffers runtime |
| **vite-plugin-pwa** | Web manifest, icons and service worker (Workbox) |
| **@fontsource-variable** | Self-hosted fonts: Pixelify Sans (display), Outfit (text) |

- **No UI framework:** plain TypeScript with a tiny DOM helper (`ui/dom.ts`); text is never parsed as HTML.
- **Routing:** History API router; signed-in sections share one layout. A section can require a role (e.g. **Admin**, `admin` only): hidden from the navigation and blocked by the route guard for everyone else.
- **API calls:** one client (`src/api/client.ts`) adds the access token, refreshes once on `401` and retries.
- **Phaser is lazy-loaded** only when the player opens the game; it and the game's art and sound are cached by the service worker on first play, not on install. FireRed's files (not hashed, rebuilt under the same names) are **network first**: always revalidated (a 304 when unchanged), the cache only offline, so a new build never plays stale art, text or loop points.
- **Game code** (`src/game/`):
  - `gba/`: a small GBA-style engine, written from zero: the 240×160 compositor (tile backgrounds, an affine background, sprites with scale animations and flips, 512-color palette, windows, alpha/lighten/darken blending, per-scanline brightness), palette fades, per-frame tasks, fonts, text windows and the text printer (the game's encoded text: letter by letter, control codes, prompts), sound players, buttons with key repeat and touch controls. Logic runs at the GBA's 59.73 fps; Phaser provides the loop, scaling and Web Audio, and shows the frame as a texture.
  - `firered/`: the FireRed presentation: its asset manifest (`manifest.ts`: a boot set, and a New Game set loaded in the background), sound and text lists (`sounds.json`, `texts.json`), its windows and menus (`menu.ts`) and screens (copyright, intro, title, main menu, New Game with Oak's speech, naming screen) as frame-driven state machines with FireRed's timings. Screens decide nothing: New Game sends the chosen trainer to `mic-core`, which validates and saves it.
- **Served by nginx**, which also proxies `/auth` and `/ws` to `mic-core` on the **same origin**: first-party cookies, no CORS, strict Content Security Policy.

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
| **golang.org/x/time/rate** | Per-connection message rate limit | Official, in-memory token bucket |

- **Go 1.27.** Layout: `cmd/mic-core` (wiring), `internal/<module>` (one responsibility each: `auth`, `account`, `admin`, `trainer`, `realtime`, `ratelimit`, `health`, `store`), `migrations/`, `queries/`.
- **Tables so far:** `accounts`, `roles`, `account_roles`, `refresh_tokens`, `trainers` (one per account: name, gender, rival name, play time; created, or replaced, by New Game at the end of Oak's speech).

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
| **redis** (node-redis) | Redis client, to save battles after every turn |
| **esbuild** | Bundles the service into one file, so the image needs no `node_modules` |

- Battles use Showdown's **Gen 4 format** (`gen4customgame`): 493 Pokémon, Gen 4 moves, abilities, items and the physical/special split.

### Behavior

- **`mic-core` decides, `mic-battles` resolves.** `mic-core` starts a battle (wild, trainer or player vs player) and sends the Pokémon on each side. `mic-battles` returns what happened.
- **One turn at a time per battle.** `mic-core` collects every player's choice (and enforces the turn timer), then sends them in one request. `mic-battles` picks for wild Pokémon and NPC trainers. No two requests touch the same battle at once, so no locks are needed.
- **Stateless, saved every turn:** each battle is a Redis hash (`battle:<id>`: serialized Showdown battle, turn number, last turn's reply). For each turn, `mic-battles` loads it, plays the turn, then saves it **before replying**, with an atomic check on the turn number. Any copy can play any turn, and a crash resumes at the last saved turn.
- Battles in progress use Redis, not PostgreSQL: they are rewritten every turn and deleted when the battle ends, which Redis does in microseconds.
- **Safe retries:** every turn request carries its turn number. A request for a turn already played returns the saved reply instead of playing it again, so `mic-core` retries when a reply doesn't arrive.
- **Replies are compact turn events** (`MoveUsed`, `Damage{target, hp}`), forwarded by `mic-core` to the players in the battle. When the battle ends, the reply also carries the outcome: winner, each Pokémon's HP, PP and status, catch result and experience.
- **Catching and experience** are not in Showdown. `mic-battles` computes them with Gen 4 formulas written by us.
- **`mic-core` saves the outcome** to the players' data in one transaction, keyed by battle ID so it's applied only once. `mic-core` also saves each player's active battle ID in Redis, so a battle survives a crash of `mic-core` too.
- **Own keys only:** `mic-battles` connects to Redis with its own ACL user, limited to `battle:*` keys. It never touches PostgreSQL.

### Subjects

All are request/reply, with messages from `pokeuniverse.battle.v1`. Every copy joins the `mic-battles` queue group, so NATS spreads requests between them.

| Subject | Purpose | Status |
|---|---|---|
| `battles.ping` | Round-trip check; `mic-core` logs `mic-battles reachable` at startup | Done (Phase 0) |
| `battles.start` | Create a battle from both sides; reply: battle ID and first turn | Phase 9 |
| `battles.turn` | Every side's choice for the turn; reply: turn events, plus the outcome when it ends | Phase 9 |
| `battles.forfeit` | End a battle early (disconnect, timeout); reply: outcome | Phase 9 |

- The NATS user `mic-battles` can only subscribe to `battles.>` and answer requests; it can't publish anything else.

## tool-maps (Go)

Converts, validates, compiles and previews the text maps of `lib-maps` ([maps.md](maps.md)). Development tool, run through Make in Docker; not deployed.

| Library | Purpose |
|---|---|
| **go.yaml.in/yaml/v3** | Reads the text maps strictly (unknown fields are errors) |
| **google.golang.org/protobuf** + `lib-contracts` | Writes the runtime maps (`pokeuniverse.map.v1`) |
| Standard library | PNG art and previews, FireRed's binary data |

- Layout: `cmd/tool-maps` (commands), `internal/<module>`: `format` (text files), `world` (loading, resolving cells), `validate`, `compile`, `firered` (decompilation reader, metatile renderer), `convert`, `art`, `preview`, `rename`.

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
- Layout: `proto/` (sources), `gen/go` (Go module `pokeuniverse/lib-contracts`), `gen/ts` (package `@pokeuniverse/contracts`).
- Packages so far: `pokeuniverse.auth.v1` (auth endpoint payloads, sent as **Protocol Buffers JSON**), `pokeuniverse.realtime.v1` (WebSocket envelopes `ClientMessage` / `ServerMessage`), `pokeuniverse.battle.v1` (NATS messages between `mic-core` and `mic-battles`) and `pokeuniverse.map.v1` (runtime maps compiled by `tool-maps`: `ClientMap`, `ServerMap`, and `TileBehavior`, the list of tile behaviors).

## Communication

```
spa-pokeuniverse ──► mic-core ──► NATS ──► mic-battles
   gameplay: Protocol Buffers     (Protocol Buffers
     over WebSocket                over NATS)
   everything else: HTTP + JSON
```

- **Frontend ↔ `mic-core`, two transports by use case:**

  | Use case | Transport | Why |
  |---|---|---|
  | **Gameplay** (movement, battles, chat, world events) | Protocol Buffers (binary) over **WebSocket** | Constant two-way traffic; the server pushes updates instantly; every byte counts |
  | **Ordinary use cases** (auth, admin: ban, remove, kick; publishing news; profile; settings; lists) | **HTTP endpoints (REST-style) + JSON** | One request, one response; works without the game open; status codes, caching, simple to debug |

- **HTTP endpoints:**
  - Payloads are **Protocol Buffers messages from `lib-contracts`, encoded as JSON** (`protojson`): one source of truth, typed in Go and TypeScript.
  - Under **`/api/`** (proxied by the SPA's nginx like `/auth` and `/ws`).
  - Authenticated with the access token in `Authorization: Bearer`, verified locally; permissions checked per route against roles with one shared check (`auth.Tokens.Require`): `401` no or invalid token, `403` missing role.
  - Rate-limited per route; resources named by noun (`/api/admin/players/{id}/ban`, `/api/news`).
  - Endpoints so far: `GET /api/admin/access` (`admin`; `204` confirms access, used by the Admin page); `GET /api/trainer` (`user`; `200` with the `TrainerSummary` the main menu's CONTINUE shows, `404` when the account has no trainer yet); `PUT /api/trainer` (`user`; a `NewTrainer` from the end of Oak's speech: gender and both names, checked against the naming screen's characters and length; saved in one statement, replacing the account's trainer as a new game replaces the save; idempotent, so the client retries until it is saved; `422` for an invalid trainer).
- **When an HTTP action affects the game**, `mic-core` applies it over the live connection (e.g. a kick closes the player's WebSocket; a ban also revokes their sessions).
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

- **WebSocket:** browsers can't set headers on a WebSocket, and tokens never go in URLs, so the first message must be `Authenticate{access_token}` within 5 seconds. The client sends each refreshed token the same way; if it expires without renewal, the server closes the connection (close codes `4001` unauthenticated, `4002` expired, `4003` bad message). Only the app's own `Origin` may connect.
- **NATS:** players never reach NATS. `mic-core` includes the verified player ID (and roles when needed) in each message.
- **Service-to-service trust:** each microservice connects to NATS with its own credentials (NATS accounts + TLS), so only our services can publish or subscribe.
- Any future service exposed to players verifies the same JWT with the same public key.

### Roles

- Roles are stored in PostgreSQL and included in the access token (`roles` claim).
- Initial roles: **`user`** (default for every new account) and **`admin`**.
- **`ADMIN_EMAILS`** (comma-separated, in `.env`) gets `admin` on sign-in, and at `mic-core` startup for existing accounts. Default: `mydherin@gmail.com`. Removing an email doesn't revoke the role (done in the database).
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

### Auth Security Details

- **Login state:** `state`, `nonce` and the PKCE verifier live in Redis for 10 minutes; a `pu_login` cookie (`SameSite=Lax`) binds the login to the browser that started it.
- **Refresh cookie:** `pu_session`, `HttpOnly`, `SameSite=Strict`, `Path=/auth`, `Secure` on HTTPS. Only its SHA-256 hash is stored.
- **CSRF:** `refresh` and `logout` require the app's exact `Origin`.
- **Rate limits** per IP in Redis (shared by every replica): 20/min for sign-in and logout, 60/min for refresh.
- **Multiple tabs:** refreshes are serialized across tabs (Web Locks API), so rotation never looks like token reuse; signing out in one tab signs out all.
- Google must report a **verified email**. Expired refresh tokens are deleted hourly.

## Saving State (Resilience)

Goal: **a crash never loses a change a player has seen.** Any container can die at any moment; the game continues from what was saved.

- **Saved before shown:** every change is saved before the server confirms it to anyone. No periodic saves, no "save on logout", no state that lives only in a service's memory.
- **Each change goes to the store that fits it:**

  | State | Saved in | When | Why |
  |---|---|---|---|
  | Permanent and valuable: accounts, Pokémon, items, money, progress, trades, battle outcomes | **PostgreSQL**, one transaction per action | On every change | Rare and must never be lost; relational queries |
  | Live and frequent: positions, battles in progress, online players | **Redis** | On every change | Changes many times per second; Redis writes take microseconds |

- **Redis is durable too:** AOF with `appendfsync always` writes every change to disk before Redis answers, so a crash of Redis itself loses nothing confirmed. Redis batches the disk writes of each loop, so this stays fast.
- **Live state flows to PostgreSQL** for long-term storage: `mic-core` copies positions on map change, logout and every 30 seconds for players who moved (tracked in a Redis set). Redis is the truth while a player is online; PostgreSQL afterwards.
- **One action, one transaction:** everything an action changes is saved together or not at all (e.g. a catch adds the Pokémon and uses the ball; a trade moves both Pokémon). Redis changes that belong together use `MULTI` or a Lua script.
- **Movement:** each zone saves the moves of its tick to Redis in one pipeline, then broadcasts them. A crash can only drop moves no one saw yet.
- **Retries are safe (idempotent):** every request carries an ID or sequence number, and an already-applied request returns its saved result instead of running twice. A crashed request is simply retried.
- **Recovery:** on restart a service loads live state from Redis and everything else from PostgreSQL. Clients reconnect, get a fresh snapshot and continue.
- **PostgreSQL durability:** `synchronous_commit` stays on. Backups of PostgreSQL and Redis come with production deployment (Phase 12).

**Why:** players' progress is the game. Redis keeps the frequent saves cheap; PostgreSQL keeps what matters forever.

## Infrastructure Dependencies

| Dependency | Purpose | Data lifetime |
|---|---|---|
| **NATS** | Messaging between microservices | In transit only |
| **PostgreSQL** | Permanent data: accounts, roles, refresh tokens, Pokémon, items, progress, last saved positions | Permanent |
| **Redis** | Live data, saved on every change: positions, battles in progress, online players; plus cache, rate limits, pending logins | Live (durable, AOF on every write) |

- **NATS:** the "post office" between microservices. Players never connect to it.
- **PostgreSQL:** the source of truth. Anything that must survive a crash lives here ([Saving State](#saving-state-resilience)).
- **Redis:** in-memory and very fast, and durable (every write reaches disk). Holds live state that changes constantly, keeping load off PostgreSQL.
- Images: `postgres:18-alpine`, `redis:8-alpine` (password, AOF with `appendfsync always`), `nats:2.12-alpine` (one user per microservice, no persistence). NATS TLS is added with production deployment (Phase 12).

## Containers

Everything runs in Docker.

- **One `Dockerfile` per artifact** (`spa-pokeuniverse`, `mic-core`, `mic-battles`), using multi-stage builds for small images.
- `spa-pokeuniverse` is built to static files and served from its own container.
- **Docker Compose** runs the whole stack: artifacts plus NATS, PostgreSQL and Redis.
- **Images:** `mic-core` is a static binary on distroless (non-root, no shell); `mic-battles` is one bundled file on `node:26-alpine` (non-root); the SPA runs on unprivileged nginx.
- **Only the SPA port is published**; every other service stays on the internal network.
- **Health checks** on every container; services start only when their dependencies are healthy (`mic-core` and `mic-battles` expose `/healthz` and `/readyz`; the SPA's nginx exposes `/healthz`).
- **Configuration** comes from `.env` (never committed); `.env.example` documents every variable.

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
