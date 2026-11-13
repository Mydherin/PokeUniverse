# M6: Private Channels

Part of [Phase 9](../phase-9-social.md). Decisions: [context.md](context.md#messaging) D8-D10, D16.

## Resume Here

🚧 **Code done, Manual Test partly played (2026-11-13).** Cases 1-3 pass (headless, PC 1600×720). Not committed (the orchestrator commits). Builds: Go build+vet pass (docker, Phase 8 M4's command), `tsc --noEmit` passes; mic-core (migration 21 applied) and spa rebuilt and running, one replica.

**Next step:** play cases 4-9 with the driver, fix what fails, then remove the `TEMP-PLAYIT` hook (end of `frame()` in `spa-pokeuniverse/src/game/firered/overworld.ts`, after `this.draw()`), rebuild the spa (`docker compose up -d --build spa-pokeuniverse`), add the one-line `docs/ui.md` Social Panel note (channels: invites first on CHATS, NEW CHANNEL last, MEMBERS over the thread; plus M5's sending/failed line look), mark ✅ here, in the phase file and `docs/phases/index.md`, and update AGENTS.md's **Now** line.
- Case 4: owner removes one (members view, right-click / long-press a member → YES), another `POST .../leave`; check the gone one's notice ("You were removed from KANTO.") and row disappear, the others' notice and member count.
- Case 5: owner LEAVE (YES); the next by `joined_at` (then account ID) shows ★ OWNER.
- Case 6: RENAME (OK) → every member's row and title; DELETE (YES) → "KANTO was deleted." and the row goes for all.
- Case 7: `node infra/bots/bots.ts --count 50 --first 451 --map pallet_town_players_house_1f --idle --friend 49 --channel FLOOD --flood --verbose` (owner bot-500, 49 friends join → 50 members); check `select count(*) from messages` grows and the rate limiter refuses the excess (`send_failed` RATE in verbose output). Invite tab 1 first if a page should watch it (the channel is full at 50: invite before the bots join, or run 48 friends).
- Case 8: close all pages, reopen: channel row and history back (`load()` reads `conversations`).
- Case 9: phone 390×844 with touch (M3's `phone.mjs` way, `fakekb.js`): MEMBERS button in the sheet head, back gesture closes the members view (history entry `members: true`).

**Built-in browser pane (2026-11-14, session 3 learned this, no case passed yet):** cases 1-3 must be played again in the pane (user rule), then 4-9.
- Setup once, before opening tabs: `node pane-setup.mjs` from the shared notes folder `m6-headless/` (copy next to `m4lib/m5lib/m6lib.mjs`): bots 901-904 on 1F, A befriends B-D, everyone leaves channels; writes `players.json` (id, token, name: A=BOT901 1841, B=BOT902 1842, C=BOT903 1851, D=BOT904 1852). Tokens last 15 min. A duplicate M6 session ran on the same stack at the same time (orchestrator, 2026-11-14), so the kicks ("Playing somewhere else", "stale save") may have been its doing, not setup's: re-run setup before opening tabs anyway.
- One tab per player at `http://localhost:8080/play?bot=<token>` (`preview_start` url, then `navigate` in the tab): the token sits in `sessionStorage`, so tabs don't clash. `*.localhost` origins fail (socket `CheckOrigin` is one origin). `resize_window` 1280×720 per tab.
- A background tab doesn't advance the intro: `tabs_select` it, then `z` ×4-5 with 3 s waits until `!!window.__self`.
- `read_page`/`find` see the panel's buttons (NEW CHANNEL has two refs: one is the hidden phone sheet's; refs report "outside the viewport" until the CHATS list is showing); click by screenshot coordinates (frame 800×450). The panel opens on the last thread (Zone): click its back arrow (~596,68) for the list.
- Seen on A's CHATS after setup (maybe the duplicate session's channel): a KANTO row "No messages yet." although `clean` left every channel: check `GET /api/social/conversations` for A; if the server has none, it's a client bug (`load()` prune or a stale cache).
- Budget: each `browser_batch` returns ~150 tokens per action of tab context; keep batches short and few, screenshots at scale 0.4-0.6.

**Testing (headless, old):** driver in the shared notes folder `m6-headless/` (copy to your scratchpad; `two.mjs` there points at this session's scratchpad for `fakekb.js` and shots: fix the paths). `m6lib.mjs`: `createChannel`, `members`, `act(p, "invite"|"rename"|"leave"|"delete"|"close"|"yes"|"cancel")`, `pick` (invite a friend by name), `openRoom`, `sayIn`, `roomLines`, `rows`, `membersText`, `notice`, `clean` (every player leaves all channels and declines invites; run first). `c123.mjs` = cases 1-3 (A=bot-901, B=bot-902 pages, C=903 by API, D=904 page): `node two.mjs ./c123.mjs`. `api.mjs` = HTTP smoke test of every route (bots 911-913). Needs the TEMP-PLAYIT hook (in place now).

**Built:**
- Migration `00021_create_channels.sql`: `channels(conversation PK → conversations, name, owner)`, `conversation_members.joined_at`, `channel_invites(channel, player, invited_by, sent_at)`. The owner is `channels.owner` (no role column; D16's `channel_members` is `conversation_members`). Queries `queries/channels.sql`; `ListConversations` adds `channel_name/owner`, `members`, `last_sender_name`; message pages add `sender_name`.
- Proto (`social.proto`): `Channel`, `ChannelInvite`, `ChannelInviteClosed(+Reason)`, `ChannelMemberChanged`/`ChannelMemberChange`, `ChannelGone`, `ChannelMembers`, `ChannelName`, `ChannelInviteRequest`; `SocialEvent` 8-12 (`channel_invite`, `channel_invite_closed`, `channel_updated`, `channel_member`, `channel_gone`); `Conversation.channel` (7), `ConversationsList.invites` (2), `ConversationMessage.sender_name` (8).
- Server `mic-core/internal/social/channels.go`: routes `POST /api/social/channels`, `PATCH|DELETE /api/social/channels/{id}`, `GET .../{id}/members` (owner also gets `invited`), `POST .../{id}/invites {id}`, `.../accept`, `.../decline`, `.../leave`, `DELETE .../{id}/members/{player}`. Each change in a tx holding the channel row (`LockChannel` FOR UPDATE; create/accept also `LockSocial(me)`), events sent after commit (`outbox`). Limits: name `chat.Clean` + ≤16 runes, 10 owned, 30 joined, members+invites ≤ 50; 403 not owner, 404, 409, 422. Owner leaving → oldest member; last out deletes. `messages.go` `Send`: a channel takes any member's line (member list read at send), `friend` = 0, `sender_name` set.
- Client: `game/world/channels.ts` `Channels` (`DirectMessages.channels`): room conversation key `channel:<id>`, `Conversation.channel {owner, members}`, `invites`, `owned`, actions return a notice text or null, `apply` for events 8-12, `gone`/`notice`/`membersChanged` hooks. `messages.ts`: `load()` reads channels and invites and prunes channels gone offline, rooms page/mark read like direct, a channel line's `own` = sender is the session's account. `firered/channel-view.ts` `ChannelView` (members, ★ OWNER, INVITED, INVITE picker, RENAME, LEAVE, DELETE, YES/NO in the bar, owner's hold/right-click → REMOVE). `chat-window.ts`: invites row (ACCEPT/DECLINE) first in CHATS, NEW CHANNEL form last (rows sit at index+1), MEMBERS button and the title open the view, `send()` takes rooms, row menu LEAVE wired, INVITE in the friend's menu and the chat line menu (`inviteTo`, owned channels). CSS block "M6" in `styles/app.css`. Bots `--channel <name>` in `infra/bots/run.ts`.

**Choices:** joining sets `last_read_seq` = the channel's last seq (no unread backlog; history before joining still readable). Panel texts: "NAME invites you to KANTO.", "NAME joined/left KANTO.", "NAME was removed from KANTO.", "You left / You were removed from KANTO.", "KANTO was deleted.", refusals by status in `channels.ts` `REFUSED`.

**Files:** `lib-contracts/proto/pokeuniverse/social/v1/social.proto`; `mic-core/migrations/00021_create_channels.sql`, `queries/{channels.sql (new), messages.sql}`, `internal/social/{channels.go (new), messages.go, friends.go}`; `infra/bots/run.ts`; `spa-pokeuniverse/src/game/world/{channels.ts (new), conversations.ts, messages.ts}`, `game/firered/{channel-view.ts (new), chat-window.ts, social-ui.ts, friends-view.ts, overworld.ts (TEMP-PLAYIT)}`, `src/styles/app.css`.

## Tasks

- **Migration:** `channels(id → conversation, name, owner)`, roles on `conversation_members`, `channel_invites`.
- **HTTP:** create, rename, delete (owner), invite (owner, friends only), accept / decline invite, leave, remove member (owner), members list. Limits D16; `422` beyond.
- **Events:** invite received, member joined, left or removed, renamed, deleted, to every member's inbox (D9); messages as M5.
- **Client:** NEW CHANNEL (name with FireRed charset check) on the CHATS list; channel thread header → members (faces, owner mark) and settings; invites shown as rows with ACCEPT / DECLINE; INVITE from M2's menu and from a friend's row; the owner's long-press on a member → REMOVE.
- **Owner leaving:** oldest member becomes owner; last one out deletes it.
- **Bots:** `--channel` creates one and invites friends, `--flood` in it.

## Manual Test

| # | Case | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | Create and invite | Create "KANTO", invite bot and tab 2 | Invites arrive; accepted they are members | ✅ |
| 2 | Group chat | Three members talk | All see every line in order; non-members see nothing | ✅ |
| 3 | Decline | Invitee declines | Not a member, owner can invite again | ✅ |
| 4 | Remove, leave | Owner removes one; another leaves | Lose access live; others see it | ⬜ |
| 5 | Owner leaves | Owner leaves | Oldest member owns it | ⬜ |
| 6 | Rename, delete | | All members updated; deleted disappears | ⬜ |
| 7 | 50 members | Bots fill it, flood | Delivery holds, rate limit applies | ⬜ |
| 8 | Persistence | Everyone logs out and back | Channel and history kept | ⬜ |
| 9 | Phone | Members and settings on the sheet | Gestures as M3 | ⬜ |
