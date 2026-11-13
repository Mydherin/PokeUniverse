# M8: Link Rooms

Part of [Phase 9](../phase-9-social.md). Decisions: [context.md](context.md#link-rooms) D18-D20, D7. References: `union_room.c` leader and member screens, `cable_club.inc` enter/exit link room.

## Resume Here

Not started. Needs M7 and M1 (busy state).

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
