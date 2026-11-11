# M5 Chat: Server and Contracts ✅

Part of [Phase 8](../phase-8-multiplayer-world.md). **Needs:** M4. Rules: [context.md](context.md) D13, D14, D17. Q1 and Q2 answered (zone chat, D13; logs only, D14).

**Done when:** a `SendChat` reaches every player in the sender's zone (map + phase, D19), on any replica, as a `ChatMessage` in the zone's events; bad text and floods are dropped; every message is logged.

## Resume Here

**Done 2026-11-11:** code (contracts, `make breaking`, Go build/vet, SPA `tsc` green) and every Manual Test case passed in game; one fix (case 2). Next: [M6](m06-chat-window.md).

- **Files:** new `mic-core/internal/chat/chat.go` (`Clean`, `Chars`, `MaxLength`); changed `world.proto` (`SendChat`, `ChatMessage`, `ZoneEvent.chat = 7`), `realtime.proto` (`send_chat = 38`), `dev/v1/bots.proto` (`SpawnBots.first`), `internal/realtime/realtime.go` (`chat` limiter 0.5/4; `SendChat` handled before the in-world check: dropped silently outside the world, over the rate or invalid, never a disconnect), `world/player.go` (`SendChat`), `world/zone_presence.go` (`zone.chat`: logs `chat`, emits like any event), `world/zone_bus.go` (`zoneEventID` knows `chat`), `internal/bots/bots.go` (`first`), `infra/bots/run.ts`, `docs/tech-stack.md`.
- **Fix (case 2):** `zoneEventID` had no `chat` case, so another replica's lines counted as from a player not held there and were dropped. Any new `ZoneEvent` kind needs a case there.
- **Bots:** `--chat`, `--flood` (10/s, `FLOOD <n>`), `--say <line>` (repeatable, once each, 2.1 s apart; zsh: pass them as an array), `--first <n>` (runs bot-<n>…, so several runs don't take each other's bots over); the verbose bot is the run's last and prints `chat NAME: "text"` (`(own)` for its own).
- **Test driver:** as M4's (copied into this session's scratchpad); keys must be held ~120 ms (`keyboard.press` can fall between frames), and the battle menu remembers its cursor (press Right, Down to reach RUN). Case 7 used a raw-socket script (authenticate, `SendChat` before `EnterWorld`, a refused second `EnterWorld`).
- **For M6:** the client's input filter copies `chat.Chars` (its comment says so); the sender's own line comes back in `ZoneEvents` (show it only then). `others.ts` `apply` skips its own id before its switch: chat needs handling before that.

## Tasks

### Contracts ✅

- `world/v1` (or a new `chat/v1` if it grows): intent `SendChat{string text}` (`ClientMessage.send_chat = 38`); `ChatMessage{uint64 id, string text}` added to `ZoneEvent`'s oneof. The sender's own line comes back in `ZoneEvents` like everyone's (the client shows its own line only then: saved-before-shown spirit, one source of order). `make contracts`, `make breaking`.

### Server (`mic-core`) ✅

- `internal/chat` (one responsibility): `Valid(text)`: trimmed, 1-64 runes, every rune in FireRed's printable charmap (the font's glyphs: start from `trainer/names.go`'s `nameChars` and add the charmap's other printable characters the font draws, e.g. `:;()&+=%`, read from `pokefirered/charmap.txt`; one list shared with the client's input filter, generated or copied with a comment); collapses runs of spaces.
- `realtime.go`: a second limiter per connection for chat, `rate.NewLimiter(0.5, 4)` (D17); over it → dropped (no answer). Also refused while not in the world.
- Zone: `SendChat` runs in the zone (`do`), appends `ChatMessage` to the tick's events; the NATS path from M4 carries it to other replicas unchanged.
- Log every accepted message: `slog.Info("chat", "trainer", id, "map", map, "phase", phase, "text", text)` (D14). Nothing saved.

### Bots ✅

- `--chat`: each bot says a random line from a short list every 20-60 s; `--flood` sends 10/s to see the limit; stats count chat lines received.

### Docs ✅

- tech-stack.md: Efficient Event Model or a short Chat bullet (zone-only, not saved, limit); `lib-contracts` packages list.

## Manual Test

| # | Case | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | Zone chat | 5 bots `--chat` on 1F, a `--verbose` bot on 1F | The verbose bot prints every line, its own included, as `ChatMessage` in `ZoneEvents` | ✅ 2026-11-11 (90 s: all 10 lines the log shows on 1F reached bot-6, its own 2 included; BOT5's 2 lines on 2F didn't) |
| 2 | Across replicas | Same with `MIC_CORE_REPLICAS=2` (`make logs` shows both) | Lines from bots on either replica reach the verbose bot once | ✅ 2026-11-11 (first try ❌: lines from the other replica were dropped, `zoneEventID` (zone_bus.go) had no `chat` case so they counted as from a player not held there; fixed; re-test: bot-6 on `mic-core-2` got all 16 lines once, 12 from 4 bots on `mic-core-1`) |
| 3 | Other map silent | Bots on 2F alongside | They receive none of 1F's lines | ✅ 2026-11-11 (3 bots on 2F, two replicas: 0 lines received in 40 s while bot-6 on 1F got all 10 said there) |
| 4 | Flood | A `--flood` bot (10/s) | Others get at most 4 lines, then one per 2 s; no disconnect; its steps still accepted | ✅ 2026-11-11 (30 s at 10/s: bot-6 got `FLOOD 1-4` within 0.3 s, then one every ~2 s (21, 41, 61…), 18 in all, the same 18 the log shows; the flooder stayed connected, walking, 0 corrections) |
| 5 | Invalid text | A bot sends empty, spaces only, 65 characters, an emoji, a control character | Nothing broadcast; no answer, no disconnect | ✅ 2026-11-11 (`""`, 5 spaces, 65 `A`s, `hi 😀`, `bell\x07`, `tab\there`, then `still here`: bot-6 and the log got only `still here`; the sender got no error, stayed connected and walking) |
| 6 | Valid edges | 64 characters; `:;()&+=%`; runs of spaces | Broadcast; trimmed, spaces collapsed | ✅ 2026-11-11 (64 `B`s; `:;()&+=%`; `"   lots    of     spaces   "` → `lots of spaces`; `Ça va? ¡Sí! ♂♀ PKMN…“ok”`; 64 `B`s padded with spaces → the 64) |
| 7 | Not in world | Send before `EnterWorld` / after leaving | Dropped | ✅ 2026-11-11 (raw socket: a line before `EnterWorld` and one after a refused `EnterWorld` (`SESSION_ACTIVE`, out of the world) were dropped, no answer, both connections stayed; the in-world lines went through; a taken-over connection is closed with `REPLACED` before it can send) |
| 8 | Log | `make logs` | One `chat` line per accepted message (trainer, map, phase, text); none for dropped ones | ✅ 2026-11-11 (cases 1-7 and 9: the log matched what was broadcast line for line, e.g. 18 of the flood's ~300, only `still here` of case 5, only the 2 in-world lines of case 7; each with `trainer`, `map`, `phase`, `text`) |
| 9 | Warp mid-chat | A chatting bot takes the stairs | Its next lines reach 2F, not 1F | ✅ 2026-11-11 (10 bots × 30 lines with a watcher per floor: BOT2 said L9 on 2F (only the 2F watcher got it) and L10-30 back on 1F (only the 1F one); 300 lines, none misrouted) |
| 10 | Regression | [context.md](context.md#playing-a-milestone) regression check | Nothing broken | ✅ 2026-11-11 (two replicas, 5 chatting bots: walked 1F → stairs → 2F → stairs → 1F, 3,532 frames, never more than 1 px a frame (no `Correction`); 2F's trainer battled; a wild battle in the test grass, RUN, then walking again with the 5 drawn) |

## Gotchas

- Text is the one free-form field from players: never put it in a log line's key or a NATS subject.
