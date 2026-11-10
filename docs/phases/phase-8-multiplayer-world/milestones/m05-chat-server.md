# M5 Chat: Server and Contracts ⬜

Part of [Phase 8](../phase-8-multiplayer-world.md). **Needs:** M4. Rules: [context.md](context.md) D13, D14, D17. Q1 and Q2 answered (zone chat, D13; logs only, D14).

**Done when:** a `SendChat` reaches every player in the sender's zone (map + phase, D19), on any replica, as a `ChatMessage` in the zone's events; bad text and floods are dropped; every message is logged.

## Resume Here

**Not started.** First step: the contracts.

## Tasks

### Contracts

- `world/v1` (or a new `chat/v1` if it grows): intent `SendChat{string text}` (`ClientMessage.send_chat = 38`); `ChatMessage{uint64 id, string text}` added to `ZoneEvent`'s oneof. The sender's own line comes back in `ZoneEvents` like everyone's (the client shows its own line only then: saved-before-shown spirit, one source of order). `make contracts`, `make breaking`.

### Server (`mic-core`)

- `internal/chat` (one responsibility): `Valid(text)`: trimmed, 1-64 runes, every rune in FireRed's printable charmap (the font's glyphs: start from `trainer/names.go`'s `nameChars` and add the charmap's other printable characters the font draws, e.g. `:;()&+=%`, read from `pokefirered/charmap.txt`; one list shared with the client's input filter, generated or copied with a comment); collapses runs of spaces.
- `realtime.go`: a second limiter per connection for chat, `rate.NewLimiter(0.5, 4)` (D17); over it → dropped (no answer). Also refused while not in the world.
- Zone: `SendChat` runs in the zone (`do`), appends `ChatMessage` to the tick's events; the NATS path from M4 carries it to other replicas unchanged.
- Log every accepted message: `slog.Info("chat", "trainer", id, "map", map, "phase", phase, "text", text)` (D14). Nothing saved.

### Bots

- `--chat`: each bot says a random line from a short list every 20-60 s; `--flood` sends 10/s to see the limit; stats count chat lines received.

### Docs

- tech-stack.md: Efficient Event Model or a short Chat bullet (zone-only, not saved, limit); `lib-contracts` packages list.

## Manual Test

| # | Case | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | Zone chat | 5 bots `--chat` on 1F, a `--verbose` bot on 1F | The verbose bot prints every line, its own included, as `ChatMessage` in `ZoneEvents` | ⬜ |
| 2 | Across replicas | Same with `MIC_CORE_REPLICAS=2` (`make logs` shows both) | Lines from bots on either replica reach the verbose bot once | ⬜ |
| 3 | Other map silent | Bots on 2F alongside | They receive none of 1F's lines | ⬜ |
| 4 | Flood | A `--flood` bot (10/s) | Others get at most 4 lines, then one per 2 s; no disconnect; its steps still accepted | ⬜ |
| 5 | Invalid text | A bot sends empty, spaces only, 65 characters, an emoji, a control character | Nothing broadcast; no answer, no disconnect | ⬜ |
| 6 | Valid edges | 64 characters; `:;()&+=%`; runs of spaces | Broadcast; trimmed, spaces collapsed | ⬜ |
| 7 | Not in world | Send before `EnterWorld` / after leaving | Dropped | ⬜ |
| 8 | Log | `make logs` | One `chat` line per accepted message (trainer, map, phase, text); none for dropped ones | ⬜ |
| 9 | Warp mid-chat | A chatting bot takes the stairs | Its next lines reach 2F, not 1F | ⬜ |
| 10 | Regression | [context.md](context.md#playing-a-milestone) regression check | Nothing broken | ⬜ |

## Gotchas

- Text is the one free-form field from players: never put it in a log line's key or a NATS subject.
