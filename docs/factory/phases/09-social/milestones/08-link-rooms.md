---
id: 08-link-rooms
title: Link rooms
status: done
test: passed
attempts: 1
depends: [07-pokemon-center-2f, 01-friends-server]
context: [context/social.md, context/references.md]
---

# M8: Link Rooms

Part of [Phase 9](../PHASE.md). Decisions: [context/social.md](../../../context/social.md#link-rooms) D18-D20, D7. References: `union_room.c` leader and member screens, `cable_club.inc` enter/exit link room.

## Resume Here

**✅ End-to-end test passed (2026-11-22), see Tests' top entry.** Every playable case passes on desktop and phone; 4 and 8 can't be set up on the preview (one 2F map, one replica).
- **Tester gotchas:** play on `https://mooi.skypea.dev/preview/<id>/play?bot=<token>` (127.0.0.1:8000 fails `PUBLIC_URL`). Bot tokens last 15 min and `/play?bot=` can't refresh: get new ones (`POST /api/dev/bots {count, first, refreshOnly:true}`, `X-Bots-Secret` = `MOOI_DEVELOPMENT_BOTS_SECRET`) and reload. `{count:6, first:N, map:pokemon_center_2f}`: bots N+3 and N+5 land in the open area. Taps under ~100 ms only turn; hold ~230 ms to step. Players don't block: the member stands on (10,4) with the leader. Text is slow: press Z every 2.5-4 s and screenshot.
- **Bot leaders:** `npx -y pnpm@10 install --frozen-lockfile`; maps from `<preview>/maps/<id>.binpb` into `spa-pokeuniverse/public/maps/` (gitignored); a local proxy (`/tmp/proxy/proxy.mjs`, recreate: forwards `http://127.0.0.1:18080/*` and the WS upgrade to `https://mooi.skypea.dev/preview/<id>/*` with `Origin: https://mooi.skypea.dev`); `BOTS_SECRET=… node infra/bots/bots.ts --count 20 --first 420 --map pokemon_center_2f --lead trade --url http://127.0.0.1:18080` (18 lead, 2 spawn behind the counter).
- **Friends-first note:** the client re-sorts with `flow.social.friends` (`link-room.ts` `sortRooms`); friendships made through the HTTP API from another client don't reach it until reload, so befriend through the game or reload before browsing. `sortRooms` also cuts `this.rooms` to 16 for good: a room past 16 stays hidden after one above it closes, until re-browsed (check if it matters).

**🧪 Fixed, ready for re-testing (session 4, 2026-11-22):** attempt 1's cases 3 and 6 fixed; `tsc --noEmit`, Vite build, `go build ./... && go vet ./...` green. Next: re-play every case of the Manual Test.
- **Case 3 fix:** `browse` stores the member's activity (`Player.linkWants`, `link_room.go` `browseLinkRooms`); `joinLinkRoom` asks with it, so the leader's zone answers `DIFFERENT` on a mismatch.
- **Case 6 fix:** `world/avatar.ts` takes FireRed's arrow warps (`TryArrowWarp`; in the rooms `PlayerIsAtSouthExit`): Down while facing south on the exit tile (`battle_colosseum_2p`/`trade_center` row 8) → `leaveByWarp` → `askLeaveRoom`. Elsewhere `leaveByWarp` ignores arrow warps (mic-core's `warpCell` has none until Phase 10's maps): the players' house mat (4,8) now does nothing instead of bumping.

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
| 1 | Lead and join | Tab 1 LEADER (trade), tab 2 JOIN | Tab 2 lists tab 1; accept; both walk in and see only each other | ✅ |
| 2 | Decline | Leader presses B on the join | Member told, back in the list | ✅ |
| 3 | Activity | Leader trade, member wants battle | Room shown with its activity; mismatches can't join (FireRed's "different selections") | ✅ |
| 4 | Range | Leader on another map | Not in the list | ⬜ not playable on the preview |
| 5 | Leader leaves | Leader cancels or walks away | Room gone from lists live | ✅ |
| 6 | Leave room | One leaves the Trade Center | Both back at the counter | ✅ |
| 7 | Disconnect | Kill one tab in the room | Other is put back; dropped player reconnects at the counter | ✅ |
| 8 | Two replicas | Leader and member on different replicas | Works | ⬜ not playable on the preview |
| 9 | Busy | Friend's status during the room | BUSY_LINK | ✅ |
| 10 | Many rooms | 20 bot leaders | List scrolls, friends first | ✅ |

## Tests

### 2026-11-22: ✅ passed (re-test completed; desktop 1280×720 and phone 390×844)
Fresh preview `https://mooi.skypea.dev/preview/<id>/`, same build as the entry below; BOT503 (desktop) and BOT505 (phone), spawned with `POST /api/dev/bots {count:6, first:500, map:pokemon_center_2f}`; 18 bot leaders (BOT422-439, `bots.ts --lead trade`). Cases 1, 2, 3, 6, 9 passed in the entry below; this session played what was left. No console errors.
| # | Result |
|---|---|
| 1 | ✅ again on phone + desktop: BOT505 (phone) BECOME LEADER, BOT503 JOIN GROUP sees "BOT505 POKéMON TRADES" appear live, "Awaiting BOT505's response…", "BOT503 contacted you for POKéMON TRADES. Accept?" YES → both in `trade_center`, only each other + attendant. |
| 4 | ⬜ not playable on the preview (one 2F map, phase always 0, Phase 8 D19). Not a defect. |
| 5 | ✅ disconnect variant: with BOT505's JOIN GROUP list open on 18 rooms, the leader bots' process killed → every row emptied live. (Cancel variant ✅ below.) |
| 7 | ✅ BOT503's tab closed in the Trade Center → BOT505 "The link with your friend has been dropped…", A → 2F in front of the counter; BOT503 reopened → CONTINUE lands on the 2F in front of the counter facing south. |
| 8 | ⬜ not playable: the preview runs one `mic-core` replica (`MIC_CORE_REPLICAS` has no development variable). Not a defect. |
| 10 | ✅ phone: BOT505 befriended BOT433 (the last leader to open) before loading; JOIN GROUP lists "01: BOT433" first, then BOT425, 429, 424, 428… in opening order; Down scrolls to row 16 (BOT430), 16 rows max. |

Observation (not this milestone): on the phone layout the floating Home/Online buttons cover the top of the game screen, hiding the list's row 1 name and the key-help bar partly.

### 2026-11-22: 🧪 re-test in progress (desktop 1280×720; phone not reached yet)
Preview `https://mooi.skypea.dev/preview/<id>/`; BOT403 tab 1 (leader), BOT405 tab 2 (member), bots spawned with `POST /api/dev/bots {count:6, first:400, map:pokemon_center_2f}`.
| # | Result |
|---|---|
| 1 | ✅ BOT403 BECOME LEADER (trade); BOT405 JOIN GROUP lists "BOT403 POKéMON TRADES"; "contacted you… Accept?" YES; "I'll direct you…"; both in `trade_center`, only each other + attendant. |
| 2 | ✅ Leader B on the ask → member "BOT403 replied, 'No…'", back in the list. |
| 3 | ✅ Fixed: BOT405 COLOSSEUM › SINGLE BATTLE sees BOT403's trade room grayed; A → "The link partners appear to have made different selections."; leader never asked. |
| 4 | ⬜ not playable on the preview: one 2F map, phase always 0 (Phase 8 D19). |
| 5 | ✅ (cancel) leader B on the awaiting screen → room gone live from BOT405's open list. Leader disconnect variant not played yet. |
| 6 | ✅ Fixed: Down on the Trade Center exit → `Text_TerminateLinkIfYouLeaveRoom` YES → "Terminating link…"; BOT405 back at (9,4) facing south; BOT403 got "The link with your friend has been dropped…", A → back at the counter. |
| 7 | ⬜ not played yet (BOT405 reloaded the page and continued at the counter ✅). |
| 8 | ⬜ not playable: `replicas: ${MIC_CORE_REPLICAS:-1}` has no development variable. |
| 9 | ✅ Friend BOT404 `GET /api/social/friends` during the room: BOT405 `PRESENCE_BUSY_LINK`. |
| 10 | 🟡 18 bot leaders appear live on the open list, 16 rows, D-pad scrolls. Friends first not confirmed: BOT437 (friend via API while BOT405 was online) wasn't listed first; BOT405's client still showed it as "Wants to be friends" (test setup, see Resume Here); re-check after a reload/befriending in game. |

### 2026-11-22: ❌ failed (desktop 1280×720; phone not reached)
Played on the preview at `https://mooi.skypea.dev/preview/<id>/` (the `127.0.0.1:8000` origin gets `login?error=offline`: `PUBLIC_URL` check). Players are bot accounts taken over by `/play?bot=<token>`, spawned with `POST /api/dev/bots {count:6, first:120, map:pokemon_center_2f}` (BOT123 tab 1, BOT125 tab 2); extra leaders by `infra/bots/bots.ts --lead` through a local proxy adding the preview prefix and `Origin: PUBLIC_URL` (the bots build root URLs).
| # | Result |
|---|---|
| 1 | ✅ BOT123 BECOME LEADER (trade), BOT125 JOIN GROUP lists "BOT123 POKéMON TRADES"; A, "contacted you… Accept?" YES; "I'll direct you…", barrier, walk to the door, both in `trade_center` seeing only each other (+ attendant). |
| 2 | ✅ Leader B on the ask → member "BOT123 replied, 'No…'", A → back in the list. |
| 3 | ❌ BOT301 single-battle room shown grayed "SINGLE BATTLE" ✅, but BOT125 (trade) A on it → accepted, both warped into `battle_colosseum_2p`. Expected `CableClub_Text_PlayersMadeDifferentSelections`. Cause: see Resume Here. |
| 4 | ⬜ not played (only one 2F map exists; a different phase not set up). |
| 5 | ⬜ not played (rooms appear live ✅ when 22 bots opened; disappearing not checked). |
| 6 | ❌ In `battle_colosseum_2p` and `trade_center`, Down on the arrival door tile (and stepping in and back onto it) does nothing: no `Text_TerminateLinkIfYouLeaveRoom`, players stuck until disconnect. |
| 7 | ✅ Closing the member tab: bot partner got `ended` and left; BOT125 reconnected on `pokemon_center_2f` at the counter. Closing the leader tab: member shows "The link with your friend has been dropped…", A → back on the 2F at the counter. |
| 8 | ⬜ not playable: `compose.yaml` `replicas: ${MIC_CORE_REPLICAS:-1}` has no development variable, the preview runs one replica. |
| 9 | ✅ BOT124 (friend) `GET /api/social/friends` during the room: BOT125 `PRESENCE_BUSY_LINK`. |
| 10 | ✅ 20 trade + 2 single bot leaders: list updates live, 16 rows, D-pad scrolls, friend BOT216 first then by time opened. |

Observations (not this milestone): single `POST /api/dev/bots` spawns land behind the 2F counter at (0,1)-(0,2), unreachable (bots print "no way to 10,4"); a bot spawned there is stuck. Text prints slowly in the headless browser (several seconds per box).

## Log

- 2026-11-14: contracts and server (594a7e4).
- 2026-11-22: strings, sounds, extractor source; FireRed's leader/member screens, walk-in and exit looked up and planned in Resume Here.
- 2026-11-22: client screens, walk-in, leave and dropped link, B back to JOIN/LEAD, bots; all builds green; `testing`.
- 2026-11-22: end-to-end test ❌ (cases 3, 6 fail; 4, 5, 8 not played); `building`, attempt 1.
- 2026-11-22: fixed case 3 (join asks with the member's browsed activity) and case 6 (arrow warp exit in the rooms); builds green; `testing`.
- 2026-11-22: re-test started: 1, 2, 3, 5, 6, 9 ✅; 10 partly; 7, phone and friends-first left (context checkpoint).
- 2026-11-22: re-test finished: 5 (disconnect), 7, 10 (friends first) ✅ on desktop and phone; 4, 8 not playable on the preview; end-to-end test ✅ passed.
