# M1 Bot Players ⬜

Part of [Phase 8](../phase-8-multiplayer-world.md). **Needs:** nothing. Rules: [context.md](context.md) D16, D17.

**Done when:** one command starts N bots that log in, enter the player's house and walk it at FireRed's pace through the real WebSocket protocol, reporting latency and traffic; the real player keeps playing beside them (not drawn until M3).

## Resume Here

**Not started.** First step: the dev endpoint in `mic-core` (Tasks → Server).

## Tasks

### Server (`mic-core`)

- `internal/config`: `BOTS_SECRET` (empty = off); `.env.example` documents it empty, with a comment: dev only.
- New `internal/bots` (or in `admin`, one responsibility): `POST /api/dev/bots` `{count, map}` registered only when the secret is set; `X-Bots-Secret` compared in constant time; rate-limited per IP like the other routes.
  - Creates or reuses accounts `bot-<n>` (n = 1…count), no Google subject (check the `accounts` columns; a migration if the subject is `NOT NULL`: a nullable column or a `bot:<n>` subject), roles `user` and `bot` (new row in `roles` via goose migration).
  - Each gets a trainer like `PUT /api/trainer` does (gender alternating, name `BOT<n>`, rival `RIVAL`), the test team, placed on `map` at a walkable tile (from `ServerMap`, spread so they don't stack), in one transaction per bot.
  - Answer: `[{account_id, access_token}]` (`auth.Tokens.Issue`). Payload as a proto in `lib-contracts` (`auth/v1` or a new `dev/v1`), JSON like the other endpoints.
- `make bots-clean`: deletes `bot-*` accounts and their rows (SQL via `docker compose exec postgres psql`), and their Redis keys.

### Bot script (`infra/bots/`)

- `bots.ts` run with Node 26 (type stripping), importing the generated TS contracts (`lib-contracts/gen/ts`) and `ws` (add to a `package.json` in `infra/bots`, `make lock`).
- `--count N --map <id> --url http://localhost:<spa port> --secret $BOTS_SECRET [--chat]`: calls the endpoint, then per bot opens `/ws`, sends `Authenticate` (token, random `instance`), `EnterWorld{take_over}`, reads `WorldSnapshot`.
- Walks: every step a random direction (keep going straight with 70%), `Move{step, direction, run, x, y}` at FireRed's pace (16 frames walking ≈ 267 ms; run sometimes when `can_run`); a `Correction` resets its tile; pauses 0-3 s now and then; `Turn` sometimes. Collision: from the compiled `ClientMap` (`spa-pokeuniverse/public/maps/<id>.binpb`) with the same rules as `world/rules.ts` if it imports cleanly, else trust `Correction`s. Uses warps rarely (`UseWarp` on the stairs) so both maps fill.
- Answers `Script` with `ScriptDone`, ignores battles (bots don't step on the test grass: skip `encounter` cells).
- Every 10 s prints: bots connected, steps/s sent, corrections, server messages/s and bytes/s received per bot, `Ping`→`Pong` p50/p99. Ctrl-C closes all sockets cleanly.

### Client

- Dev builds only (`import.meta.env.DEV`): `/play?bot=<token>` skips Google and uses the token, so a second tab can be a second player (context.md, Playing a Milestone). Production builds ignore it.

## Play It

1. `make up` with `BOTS_SECRET` set; `node infra/bots/bots.ts --count 5 --map pallet_town_players_house_2f`: 5 bots connect and walk, stats print, no errors in `make logs`.
2. The real player plays in the browser pane at the same time: walking, a menu, the test grass battle: nothing changes for them.
3. Restart `mic-core`: bots reconnect (backoff like the SPA's, [Movement](../../../tech-stack.md#movement) reconnect limit) and keep walking.
4. Without `BOTS_SECRET`, the endpoint is a 404. `make bots-clean` removes them.
5. Regression check ([Phase 6](../../phase-6-pokemon-party/milestones/context.md#playing-a-milestone)).

## Gotchas

- The bot role must not get any admin route; `user` is enough to play.
- Bots must not count as the real player's take-over: each has its own account.
