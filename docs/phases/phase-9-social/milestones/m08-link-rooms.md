# M8: Link Rooms

Part of [Phase 9](../phase-9-social.md). Decisions: [context.md](context.md#link-rooms) D18-D20, D7. References: `union_room.c` leader and member screens, `cable_club.inc` enter/exit link room.

## Resume Here

**🔨 In progress (session 1, 2026-11-14):** contracts and server written, `go build ./...` + `go vet` green; **client and bots not started**; nothing played. Not committed.

**Done:**
- **Contracts** (`make contracts` green): `social.proto` `LinkActivity`, `LinkRoom{leader Friend, activity, opened_at}`, `LinkIntent` oneof (`open`, `close`, `browse`, `join`, `cancel_join`, `answer{member, accept}`, `enter`, `leave`), `LinkEvent` oneof (`rooms`, `join_asked`, `join_answered{leader, accepted, refusal DECLINED/GONE/DIFFERENT}`, `start{room, map, leader, partner, activity}`, `ended`, `join_cancelled`, `partner_left` (replica-only)), `SocialEvent.link = 13`; `ClientMessage.link = 41`; `ZoneEvent.link_room_opened = 8` / `link_room_closed = 9` (leader ID); `ScriptStep.link_room = 15` (`LinkRoomStep{activity, lead}`).
- **Server:** `mic-core/internal/live/linkrooms.go` (Redis `linkrooms:<map>:<phase>` hash, open with the session check in Lua, list drops leaders whose session is gone, `linkroom:next` IDs ≠ 0). `mic-core/internal/world/link_room.go`: `Player.Link` dispatch, leader/member/answer in the zone goroutine, link events travel on the player's social inbox (`Social.Link`, `social.go`) and are routed through `World.Join`'s deliver into `zone.onLink` (not forwarded raw). Accept: leader unlists, gets a room ID, sends `join_answered` + `start` to the member; the member's replica answers the leader's `start` (leader=true). `enter` (after the client's walk) warps leader to the room map's `dynamic` warp, member one tile right, facing north, phase = room. `leave` (from the room or still on the 2F) tells the partner (`partner_left` → `ended` to its client, whose client must then send `leave`), warps back to `pokemon_center_2f` (9,4) facing south, presence ONLINE. Busy: BUSY_LINK from accept. Disconnect: `World.Leave` → `linkGone(true)` (close room / cancel join / partner_left); reconnect on a room map → `place()` puts them at (9,4). Leaving the 2F by warp → `linkGone(false)`. `cable_club.go`: Direct Corner JOIN GROUP / BECOME LEADER → `link_room` step per activity (trade, single, double), then `PleaseVisitAgain` when the screen is cancelled; MULTI still aborts (M13). `realtime.go` dispatches `ClientMessage_Link`. `zone_bus.go` `zoneEventID` knows the two new events.

**Next (exact):**
1. **Client** (`spa-pokeuniverse/src`): `realtime/connection.ts` add `link(intent)` sender (like `useWarp`, case `"link"`); `game/world/social.ts` / `boot.ts` `link.onSocial`: route `e.event.case === "link"` to the overworld (e.g. a listener set on `SocialState`). New `game/firered/link-room.ts` (`LinkRoomRun`, like `PlayerMenuRun` in `player-menu.ts`): **leader**: sends `open`, field message `gText_UR_AwaitingCommunication` ({STR_VAR_1} = activity name `gText_UR_PokemonTrades`/`SingleBattle`/`DoubleBattle`), a framed list window of members (row: small "1:" + name; FireRed shows ID at +77, we show none), a small window `gText_UR_BButtonCancel`; on `join_asked`: `gText_UR_PlayerContactedYouForXAccept` ({STR_VAR_2}=name) + YES/NO → `answer`; NO/B → `gText_UR_OfferDeclined1`, back to awaiting; B while awaiting → `close`, returns "cancel" (script goes on to `PleaseVisitAgain`); `join_cancelled` → back to awaiting. **member**: sends `browse`, message `sText_ChooseTrainerToTradeWith` / `sText_ChooseTrainerSingleBattle` / `...DoubleBattle`, list window of rooms (name + small activity, up to 16 with scroll arrows `scroll-arrows.ts`; other activity drawn gray, A on it = `SE_WALL_HIT`), hint window `gText_UR_ChooseJoinCancel`; live updates from `ZoneEvent` `linkRoomOpened/Closed` (hook `overworld.zoneEvents` before `others.apply`; `others.apply` already skips them); A → `SE_POKENAV_ON`, `join`, `gText_UR_AwaitingPlayersResponse`; B while waiting → `cancel_join`; refused → a refusal text then back to the list; accepted → `gText_UR_PlayerSentBackOK`. **both on `start`**: `CableClub_Text_PleaseEnter` (autoscroll), `SE_CLICK`, 60 frames, end the script (`scriptDone`), walk FireRed's `Movement_PlayerApproachLinkRoomLeft` (left, up, up: from (10,4) via the opened barrier (9,3) to (9,2)), open door (9,1) (`door-warp.ts`, the Cable Club door), walk up, send `enter`; the `Warped` that follows loads the room. In the room (`trade_center`/`battle_colosseum_2p`): pressing South on the `dynamic` warp tiles → `Text_TerminateLinkIfYouLeaveRoom` YES/NO; YES → `Text_TerminateLinkConfirmation` (autoscroll) → send `leave`. On `ended` (partner left): FireRed shows `gText_UR_LinkWithFriendDropped`?—pick the closest, then send `leave`. Add every new string to `texts.json`, run `make text` (check static `sText_*` are extracted) and `manifest.ts` if keyed there. `script step link_room` case in `overworld.ts` near `playerMenu` (~line 1207).
2. **Bots** (`infra/bots/bots.ts`): `--lead <trade|single|double>` (walk to (10,4), A the attendant through the script, or send `ClientMessage.link{open}` while a script runs — the server requires `p.script != 0` on `pokemon_center_2f`) and `--join`.
3. Build (`make` targets as Phase 8 M4: Go via docker, see Commands in M7's file), restart the stack, play the 10 cases in the built-in browser (two tabs `?bot=<token>`, M7's pane how-to).

**Gotchas:** the leader's own `LinkStart` comes from the member's replica (`onLinkHere` case `Start` with `leader=true`); `warpTo` patches the queued `Warped`'s facing. The exit doesn't animate FireRed's walk down from the door (server puts the player straight at (9,4)); add it client-side if cheap. Rooms of a crashed replica are dropped on the next `browse` (session key gone).

## Tasks

- **Contracts:** intents `OpenLinkRoom{activity}`, `CloseLinkRoom`, `JoinLinkRoom{leader}`, `AnswerJoin{member, accept}`, `LeaveLinkRoom`; events `LinkRooms{rooms}` (on the member screen), `LinkRoomOpened/Closed`, `JoinAsked`, `JoinAnswered`, `LinkStart{room, map}`.
- **Server:** rooms in Redis per 2F zone (D19, Lua with the session check); one join at a time per leader; a leader's room closes when they leave, disconnect or cancel; on accept both are busy and are warped together into the room map with phase = room ID (D20); the room map's zone exists only for them; on leave or disconnect both go back in front of the counter.
- **Client:** `union_room.c`'s leader screen (awaiting, "{NAME} has joined. Accept?") and member list (names, activity, scroll), B to cancel; FireRed's walk to the door (`Movement_PlayerApproachLinkRoomLeft`, door `9,1`), "Please enter."; the room maps; the exit question `Text_TerminateLinkIfYouLeaveRoom`.
- **Bots:** `--lead <activity>` / `--join` to open and join rooms.

## Manual Test

| # | Case | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | Lead and join | Tab 1 LEADER (trade), tab 2 JOIN | Tab 2 lists tab 1; accept; both walk in and see only each other | ⬜ |
| 2 | Decline | Leader presses B on the join | Member told, back in the list | ⬜ |
| 3 | Activity | Leader trade, member wants battle | Room shown with its activity; mismatches can't join (FireRed's "different selections") | ⬜ |
| 4 | Range | Leader on another map | Not in the list | ⬜ |
| 5 | Leader leaves | Leader cancels or walks away | Room gone from lists live | ⬜ |
| 6 | Leave room | One leaves the Trade Center | Both back at the counter | ⬜ |
| 7 | Disconnect | Kill one tab in the room | Other is put back; dropped player reconnects at the counter | ⬜ |
| 8 | Two replicas | Leader and member on different replicas | Works | ⬜ |
| 9 | Busy | Friend's status during the room | BUSY_LINK | ⬜ |
| 10 | Many rooms | 20 bot leaders | List scrolls, friends first | ⬜ |
