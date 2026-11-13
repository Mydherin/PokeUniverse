# M6: Private Channels

Part of [Phase 9](../phase-9-social.md). Decisions: [context.md](context.md#messaging) D8-D10, D16.

## Resume Here

✅ **Done 2026-11-14.** Cases 1-9 played in the built-in browser pane (one tab per player). Not committed (the orchestrator commits). `TEMP-PLAYIT` hook removed, spa rebuilt, `tsc --noEmit` passes; stack at one replica, bots stopped, test channels deleted. `docs/ui.md` Social Panel has the channels and sending/failed lines.

**Fixed while testing:** `channels.ts` `prune()` now calls `gone(c)` (no notice) so a channel found gone on a reload moves the open thread off it (it stayed on an empty FLOOD thread); `app.css` hides MEMBERS in list view (the phone sheet's list head kept it); `infra/bots/run.ts` `social()` waits `Retry-After` on 429 (the per-IP limit refused 18 of a 50-member channel's invites). The stray KANTO row from session 3 didn't reproduce (server had none; the duplicate session's channel).

**Pane setup for later Manual Tests (reuse in M7+):**
- Tokens: `POST /api/dev/bots` with `X-Bots-Secret` (`.env` `BOTS_SECRET`), body `{count, first, map}` (resets) or `{count, first, refreshOnly: true}` (token only, doesn't kick). Tokens last 15 min; an open page keeps working past that. Bots 901-904 = accounts 1841, 1842, 1851, 1852.
- Tab: `preview_start` url `http://localhost:8080/play?bot=<token>` (more tabs: `preview_start` again; `navigate` a tab to switch player). Leave the pane's own size (frame 800×600, panel along the bottom); emulating 1280×720 cut the panel off.
- Intro: front the tab (`tabs_select`), `z` ×4 with 3 s waits, then once more on CONTINUE if it shows. Phone (mobile preset, reload after): tap the game once, then the A button (637,1025) ×4; chat button (562,1235).
- PC panel (800×600 frame): rows at x≈90, y≈507/535/562 from the top of the list; thread input (470,590); MEMBERS (766,457); members view buttons y≈575 (INVITE 175, RENAME 222, LEAVE 270, DELETE 313); YES (168,578). A notice line pushes everything down ~20 px for a few seconds: zoom `[0,410,800,600]` at 0.5 before clicking. `find` also matches the hidden phone sheet's copies; read text with it, click by coordinates.
- Browser back gesture: `navigate` "back".
- Postgres: `docker compose exec -T postgres psql -U $POSTGRES_USER -d $POSTGRES_DB` (`.env`); `messages(conversation_id, sender, …)`.

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
| 1 | Create and invite | Create "KANTO", invite bot and tab 2 | Invites arrive; accepted they are members | ✅ 2026-11-14: pane, A's tab NEW CHANNEL → KANTO, MEMBERS → INVITE BOT902/BOT903; B's tab got the invite row first on CHATS, ACCEPT → KANTO row; C (bot) accepted by API → 3 members |
| 2 | Group chat | Three members talk | All see every line in order; non-members see nothing | ✅ 2026-11-14: pane, B, C and A each typed a line in their own tab; every tab showed B, C, A in order; D (non-member) by API: no KANTO row, messages 404 |
| 3 | Decline | Invitee declines | Not a member, owner can invite again | ✅ 2026-11-14: pane, D's tab DECLINE → row gone, not a member; A's INVITE picker offered BOT904 again, re-invite reached D's tab live ("BOT901 invites you to KANTO.") |
| 4 | Remove, leave | Owner removes one; another leaves | Lose access live; others see it | ✅ 2026-11-14: pane, A right-clicked BOT904 in MEMBERS → YES: D's tab "You were removed from KANTO.", row gone, A's title 4/50 → 3/50; C left by API (its tab reused for D) → C's history 404, B's tab "BOT903 left KANTO." |
| 5 | Owner leaves | Owner leaves | Oldest member owns it | ✅ 2026-11-14: pane, members A, B, D (D rejoined last); A's tab LEAVE → YES → "You left KANTO.", row gone; B's tab "BOT901 left KANTO.", MEMBERS shows BOT902 ★ OWNER with INVITE/RENAME/LEAVE/DELETE |
| 6 | Rename, delete | | All members updated; deleted disappears | ✅ 2026-11-14: pane, B (owner) RENAME → JOHTO → OK: B's title and row, D's row and thread title JOHTO live; DELETE → YES: both tabs "JOHTO was deleted.", row gone |
| 7 | 50 members | Bots fill it, flood | Delivery holds, rate limit applies | ✅ 2026-11-14: bots 451-500 (`--friend 48 --channel FLOOD --flood`, bot-500 owner) → 49 members; bot-500 invited A, A's tab ACCEPT → 50/50; A's FLOOD thread took new lines live; `messages` grew ~30/s from 49 senders, the excess refused (`send_failed` RATE, 588 in 10 s). Bots fix: `social()` waits Retry-After on 429 (the per-IP limit had refused 18 invites) |
| 8 | Persistence | Everyone logs out and back | Channel and history kept | ✅ 2026-11-14: pane, KANTO (A owner, B) with a line each typed in A's and B's tabs; both tabs closed (pane closed), reopened: A's CHATS has KANTO, thread shows both lines; B's reopened (phone, case 9) the same |
| 9 | Phone | Members and settings on the sheet | Gestures as M3 | ✅ 2026-11-14: pane, mobile preset, B's tab by taps: chat button → sheet → KANTO (history back) → MEMBERS in the sheet head → members view (2/50, ★ OWNER, You, LEAVE); back → thread, back → list. Fixed: the list's head kept the MEMBERS button (`app.css`) |
