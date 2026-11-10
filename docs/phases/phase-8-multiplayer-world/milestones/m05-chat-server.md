# M5 Chat: Server and Contracts ⬜

Part of [Phase 8](../phase-8-multiplayer-world.md). **Needs:** M4. Rules: [context.md](context.md) D13, D14, D17. Provisional answers to Q1, Q2 ([context.md](context.md#questions-for-the-user)): check the user's answer first.

**Done when:** a `SendChat` reaches every player on the sender's map, on any replica, as a `ChatMessage` in the zone's events; bad text and floods are dropped; every message is logged.

## Resume Here

**Not started.** First step: the contracts.

## Tasks

### Contracts

- `world/v1` (or a new `chat/v1` if it grows): intent `SendChat{string text}` (`ClientMessage.send_chat = 38`); `ChatMessage{uint64 id, string text}` added to `ZoneEvent`'s oneof. The sender's own line comes back in `ZoneEvents` like everyone's (the client shows its own line only then: saved-before-shown spirit, one source of order). `make contracts`, `make breaking`.

### Server (`mic-core`)

- `internal/chat` (one responsibility): `Valid(text)`: trimmed, 1-64 runes, every rune in FireRed's printable charmap (the font's glyphs: start from `trainer/names.go`'s `nameChars` and add the charmap's other printable characters the font draws, e.g. `:;()&+=%`, read from `pokefirered/charmap.txt`; one list shared with the client's input filter, generated or copied with a comment); collapses runs of spaces.
- `realtime.go`: a second limiter per connection for chat, `rate.NewLimiter(0.5, 4)` (D17); over it → dropped (no answer). Also refused while not in the world.
- Zone: `SendChat` runs in the zone (`do`), appends `ChatMessage` to the tick's events; the NATS path from M4 carries it to other replicas unchanged.
- Log every accepted message: `slog.Info("chat", "trainer", id, "map", map, "text", text)` (D14). Nothing saved.

### Bots

- `--chat`: each bot says a random line from a short list every 20-60 s; `--flood` sends 10/s to see the limit; stats count chat lines received.

### Docs

- tech-stack.md: Efficient Event Model or a short Chat bullet (zone-only, not saved, limit); `lib-contracts` packages list.

## Play It

1. 5 bots with `--chat` on 1F across two replicas, plus a verbose bot: it receives every line from both replicas; bots on 2F receive none of them.
2. `--flood` bot: at most 4 lines then one per 2 s reach others; no disconnect, other intents unaffected.
3. Invalid text (empty, 65 characters, an emoji, a control character) sent by a bot: dropped, nothing broadcast; logged lines show the accepted ones.
4. Regression check.

## Gotchas

- Text is the one free-form field from players: never put it in a log line's key or a NATS subject.
