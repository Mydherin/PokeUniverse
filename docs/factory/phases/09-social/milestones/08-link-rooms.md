---
id: 08-link-rooms
title: "Link rooms"
status: testing
test: none
depends: [07-pokemon-center-2f, 01-friends-server]
context: [context/social.md, context/references.md]
---

# M8: Link Rooms

Part of [Phase 9](../PHASE.md). Decisions: [context/social.md](../../../context/social.md#link-rooms) D18-D20, D7. References: `union_room.c` leader and member screens, `cable_club.inc` enter/exit link room.

## Resume Here

**🧪 Built, ready for testing (session 3, 2026-11-22):** every task done; `tsc --noEmit`, Vite build, `go build ./... && go vet ./...` (mic-core) and the text extractor green. Nothing played yet: the next session plays the Manual Test.

**How it works (files):**
- **Contracts** (`social.proto`): `LinkIntent` (`open`, `close`, `browse`, `join`, `cancel_join`, `answer`, `enter`, `leave`), `LinkEvent` (`rooms`, `join_asked`, `join_answered{refusal}`, `start`, `ended`, `join_cancelled`, `partner_left` replica-only), `SocialEvent.link`, `ClientMessage.link`, `ZoneEvent.link_room_opened/closed`, `ScriptStep.link_room` (`LinkRoomStep{activity, lead}`).
- **Server:** `mic-core/internal/live/linkrooms.go` (Redis `linkrooms:<map>:<phase>`, Lua with the session check); `mic-core/internal/world/link_room.go` (needs `p.script != 0` on `pokemon_center_2f`; accept → room ID, `start` to both, BUSY_LINK; `enter` warps into the room map's `dynamic` warp, phase = room; `leave`/disconnect → `partner_left`/`ended`, both back at `pokemon_center_2f` (9,4) facing south). `cable_club.go`: JOIN GROUP / BECOME LEADER → `link_room` step; a cancelled screen jumps back to the JOIN/LEAD multichoice (`choose_<activity>`, FireRed's LINKUP_FAILED).
- **Client:** `realtime/connection.ts` `link(intent)`; `game/world/social.ts` `onLink`; `game/firered/link-room.ts` `LinkScreenRun` (leader: `Task_TryBecomeLinkLeader`; member: `Task_TryJoinLinkGroup`, `ListMenu` of 16 rows, D-pad pages); `overworld.ts` step `linkRoom`, `linkFlow` generators `enterLinkRoom` (DirectYouToYourRoom, barrier (9,3) → 0x2C5 + `se_click`, attendant faces west, client-only `Avatar.scriptWalk` left/up/up, `LeavingDoor` at (9,1), sends `enter`), `askLeaveRoom` (any warp on `trade_center`/`battle_colosseum_2p`: TerminateLink YES/NO, YES → `leave`), `dropLink` (`ended` while linked: LinkWithFriendDropped, A, `leave`); `menu.ts` `YesNoMenu.close()`.
- **Bots** (`infra/bots/run.ts`): `--map pokemon_center_2f --lead <trade|single|double>` (BFS to (10,4), A on the attendant, opens, accepts the first member) / `--join [--activity <a>]` (asks the first room of that activity); both `scriptDone` + `enter` 3 s after `start`, `leave` on `ended`; they don't wander.

**Differences from FireRed (reasons):**
- The member list shows each room's activity (right-aligned, small font; another activity in gray) and the member can ask it: mic-core answers `DIFFERENT` → `CableClub_Text_PlayersMadeDifferentSelections` (D18, case 3). FireRed only lists one activity.
- No trainer ID for others (the leader's row 1, the member's rows): the MMO has none to show; own ID shown as FireRed.
- The walk to the door is the client's only (server authority keeps the counter blocked; `enter` warps from where mic-core has the player).
- The leader's "OK sent" stays 120 frames before both walk in (ours: FireRed starts on the link handshake).
- Dropped link message waits for A before `leave` (the MMO's `ended` has no FireRed counterpart besides `gText_UR_LinkWithFriendDropped`).

**Gotchas:**
- The host Docker can't see this workspace through `-v "$PWD"`: pipe the sources in (`tar c mic-core lib-contracts/go.mod lib-contracts/go.sum lib-contracts/gen | docker run --rm -i … golang:1.27-alpine sh -c "mkdir /repo && cd /repo && tar x && cd mic-core && touch maps/x.binpb && go build ./... && go vet ./..."`; the `touch` stands in for `make maps`' output, never in the repo).
- Node deps: `npx -y pnpm@10 install --frozen-lockfile` at the root; text: `node infra/text/extract.mjs references/pokefirered spa-pokeuniverse/src/game/firered/texts.json spa-pokeuniverse/public/firered/text references/pokeemerald-expansion lib-contracts/proto/pokeuniverse` (needs `git submodule update --init --depth 1` of both references).
- `spa/src/app/base.ts` now falls back to "/" without `import.meta.env`: the bots import the map rules under Node and crashed on it since 0210b5d.

## Tasks

- [x] **Contracts:** intents `OpenLinkRoom{activity}`, `CloseLinkRoom`, `JoinLinkRoom{leader}`, `AnswerJoin{member, accept}`, `LeaveLinkRoom`; events `LinkRooms{rooms}` (on the member screen), `LinkRoomOpened/Closed`, `JoinAsked`, `JoinAnswered`, `LinkStart{room, map}`.
- [x] **Server:** rooms in Redis per 2F zone (D19, Lua with the session check); one join at a time per leader; a leader's room closes when they leave, disconnect or cancel; on accept both are busy and are warped together into the room map with phase = room ID (D20); the room map's zone exists only for them; on leave or disconnect both go back in front of the counter.
- [x] **Client:** `union_room.c`'s leader screen (awaiting, "{NAME} has joined. Accept?") and member list (names, activity, scroll), B to cancel; FireRed's walk to the door (`Movement_PlayerApproachLinkRoomLeft`, door `9,1`), "Please enter."; the room maps; the exit question `Text_TerminateLinkIfYouLeaveRoom`.
- [x] **Bots:** `--lead <activity>` / `--join` to open and join rooms.

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

## Log

- 2026-11-14: contracts and server (594a7e4).
- 2026-11-22: strings, sounds, extractor source; FireRed's leader/member screens, walk-in and exit looked up and planned in Resume Here.
- 2026-11-22: client screens, walk-in, leave and dropped link, B back to JOIN/LEAD, bots; all builds green; `testing`.
