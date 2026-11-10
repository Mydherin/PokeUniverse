# M1 Bot Players ✅

Part of [Phase 8](../phase-8-multiplayer-world.md). **Needs:** nothing. Rules: [context.md](context.md) D16, D17.

**Done when:** one command starts N bots that log in, enter the player's house and walk it at FireRed's pace through the real WebSocket protocol, reporting latency and traffic; the real player keeps playing beside them (not drawn until M3).

## Resume Here

**Done 2026-11-10.** Next: [M2 Zone presence](m02-zone-presence.md).

## What Was Built

- **Server:** `mic-core/internal/bots/bots.go`, `POST /api/dev/bots` (`dev/v1/bots.proto`: `SpawnBots{count 1-100, map, refresh_only}` → `SpawnedBots{bots[n, account_id, access_token, expires_at]}`). Registered only when `BOTS_SECRET` is set (`config.BotsSecret`; `compose.yaml`, `.env.example` empty); `X-Bots-Secret` compared in constant time (403); unknown map 422; rate-limited `dev-bots` 30/min per IP.
  - Accounts via `UpsertGoogleAccount` with `google_sub = 'bot:<n>'`, email `bot-<n>@bots.invalid` (no schema change); roles `user` + `bot` (`migrations/00018_add_bot_role.sql`; `bot` opens no route).
  - Each spawn re-creates the trainer as New Game does (`PutTrainer`, `item.Reset`, `pokemon.Reset`, `Live.Clear`; the test team comes on join): `BOT<n>`, odd boy / even girl, rival `RIVAL`, facing south, on free tiles spread over the map (walkable, no warp, NPC, encounter cell or New Game start tile). `refresh_only` only issues tokens (`queries/accounts.sql` `GetAccountIDByGoogleSub`).
- **`make bots-clean`:** deletes `bot:%` accounts (everything cascades) and their `player:<id>:*` Redis keys.
- **Script:** `infra/bots/bots.ts` → `hooks.mjs` → `run.ts`. Node ≥ 24, nothing to install: Node's own `WebSocket` (undici) sends the `Origin` header, so no `ws`; `hooks.mjs` (`module.registerHooks`) loads `.ts` with `stripTypeScriptTypes(mode: transform)` (the contracts' enums), adds `.ts` to extensionless imports and resolves packages as `lib-contracts/gen/ts` does. It imports the generated contracts and the client's `world/{map,rules}.ts` as they are.
  - Flags: `--count` (5), `--map` (2F), `--url` (`http://localhost:$SPA_PORT`), `--secret` (env or `.env` `BOTS_SECRET`), `--chat` (prints that chat isn't there yet; the chat milestone adds it).
  - Per bot: `Authenticate` (random instance), `EnterWorld{take_over}` on the first entry only, steps at 16/8 frames (walk/run 25% when `can_run`), 70% straight, 3% pause 0-3 s, 3% `Turn`; `Correction` resets the tile; `checkStep` collision; avoids `TALL_GRASS` and non-stair warps; takes the stairs (`UseWarp`) 15% of the times it faces them; `Script` → `ScriptDone`. Tokens renewed a minute before expiry (`refresh_only`, `Authenticate` on the open socket). Reconnect: 1, 2, 4, 8, 15 s ±25%, 8 failures stop the bot; 4001/4003/4004 stop it at once.
  - Every 10 s: connected, steps/s, corrections, per-bot msg/s and B/s, ping p50/p99, reconnects, battles. Ctrl-C closes all sockets.
- **Client:** `src/auth/session.ts`: `/play?bot=<token>` uses the token instead of Google (kept in `sessionStorage` for the tab, removed from the URL, not renewed, ignores other tabs' logout) when `import.meta.env.DEV` or the image was built with `VITE_BOT_LOGIN=1`, which `compose.yaml` passes only when `BOTS_SECRET` is set (`spa-pokeuniverse/Dockerfile` build arg). Production never sets it.

## Playing It

- `.env` has a dev `BOTS_SECRET` (local only, never committed); `docker compose up -d --build mic-core spa-pokeuniverse` after changing it.
- A second player: run the script with one bot more than you need, get tokens with `curl -s -X POST localhost:8080/api/dev/bots -H "X-Bots-Secret: $S" -d '{"count":6,"refreshOnly":true}'`, open `/play?bot=<bot-6 token>`: it takes bot-6 over (the script's bot-6 stops with 4004).
- **Results (5-6 bots, 2026-11-10):** ~15 steps/s total, 0 corrections, ~0.2 msg/s and 4 B/s per bot (pongs only, until M2), ping p50 2 ms p99 3 ms. Bots reach 1F by the stairs. `docker compose restart mic-core`: all reconnected in one backoff step and kept walking; the browser's wild battle resumed. No ERROR/WARN in `mic-core`/`mic-battles`. `BOTS_SECRET=` → 404. `bots-clean` left the DB equal to the backup but for migration 18 and the `bot` role.
- **Regression (as BOT6 via `?bot=`, the pane has no Google sign-in):** walk, menu, POKéMON, sign, stairs, wild battle won, restart mid-battle, SAVE, reload. Not replayed: the room trainer, BAG/PC items, party SWITCH/GIVE/TAKE (no code they use changed).

## Gotchas

- `pkill -INT` on a backgrounded `node … > log` kills the wrapping shell with exit 1; start it with `exec node …` to see the script's own exit.
- The 2F trainers (9,4) and (9,6) are talk-only (no sight). The 2F sign at (11,1) is above the stairs' approach tile (11,2): pressing Up there reads it.
