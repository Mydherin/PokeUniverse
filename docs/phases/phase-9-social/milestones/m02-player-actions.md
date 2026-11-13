# M2: Acting on a Player

Part of [Phase 9](../phase-9-social.md). Decisions: [context.md](context.md#friends-and-presence) D4, D5, D7; Phase 8 D24.

## Resume Here

🧪 **Code done 2026-11-13** (Go build + vet, `make contracts`, `make text`, `tsc` green; stack rebuilt with `docker compose up --build -d mic-core spa-pokeuniverse`). Cases 1-4 ✅ in game; 5-8 left.

**Next step:** rebuild spa first (the badge fix below isn't deployed yet), then play cases 5, 6, 7 (phone ticker), 8, and rerun case 2-3 end to end (`m2.mjs`) to confirm the badge clears and A's MESSAGE menu shows. Then remove the `TEMP-PLAYIT` hook (end of `frame()` in `overworld.ts`, `Object.assign(window, { __self, __script, __others, __chat, __social })`), rebuild spa, mark ✅, cut this file down, update phase file, index, AGENTS **Now**.

**Built (files):**
- Contracts: `social.proto` `Relation` enum (NONE, FRIEND, REQUEST_SENT, REQUEST_RECEIVED); `world.proto` `ScriptStep.player_menu = 10` → `PlayerMenu{id, name, relation, owns_channel}` (owns_channel always false until M6).
- mic-core: `social/friends.go` `Service.Relation(ctx, me, other)` (AreFriends, RequestExists both ways); `world.Social` interface gained `Relation`; `world/zone.go` `playerMenu(p)` called from `interact` (not walk-into, not busy) before NPCs: finds an `OtherPlayer` on the faced tile with `z.others(p)` (local + other replicas from Redis), locks the player (`p.script`), `InBattle` → Message step `trainer_too_busy`; else reads the relation in a goroutine and queues the Script back via `z.do` (error → empty script, unlocked).
- Strings: `infra/text/extract.mjs` reads `data/scripts/cable_club.inc` (Text_TrainerTooBusyToNotice) and an `OUR_STRINGS` table (`PU_Text_AddFriend/Message/Invite/SentFriendRequest/NowFriends/AlreadyRequested/FriendRequestFailed/WantsToBeFriends`); labels added at the end of `texts.json`; `manifest.ts` `WORLD_TEXTS.trainer_too_busy`.
- spa: `game/world/social.ts` `SocialState` (load `GET /api/social/friends` on every snapshot from `overworld.ts` `enter`, `apply(SocialEvent)`, `relation`, `addFriend` → POST requests; 409 → "already"; `unseen` = badge; `dropIncoming` keeps it right); `realtime/connection.ts` `onSocial` (ServerMessage.social); `boot.ts`/`flow.ts` `flow.social`; `game/firered/player-menu.ts` `PlayerMenuRun` (name in the message box, FireRed's `DrawVerticalMultichoiceMenu` sizes: width `(w+9)/8+1`, items 14 px, right side above the box, baseBlock 0x125; B = CANCEL with se_select), run from `overworld.ts` `runScript` (`Running.playerMenu`, closed in `endScript`); `game/firered/social-ui.ts` `LineActions` (HTML popover in the panel's style on long-press/tap name, Esc/outside closes) and `Notice`; `chat-window.ts`: FRIENDS chip with badge (`chips(badge)`), PC toast under the chips, phone ticker notice (sheet open → status hint), `openWith(id)` (MESSAGE: opens the chat until M5's DMs), `notice(text)`; CSS in `styles/app.css` (`.chip-badge`, `.social-notice`, `.chat-actions`).

**Choices (with reasons):** REQUEST_SENT shows "You already sent {NAME} a friend request." and no menu (nothing to choose; "the menu shows what fits"). REQUEST_RECEIVED shows ADD FRIEND, which accepts (D3) → "You and {NAME} are now friends!". MESSAGE opens the chat panel until M5. Players are checked before NPCs (FireRed checks object events first).

**Uncommitted, not deployed:** `social.ts` `dropIncoming` (badge stayed 1 after accepting through ADD FRIEND).

**Testing:** driver in the shared notes folder `m2-headless/` (copy to your scratchpad; edit `SHOTS` in `two.mjs`): `node two.mjs ./mN.mjs`, env `FIRST` (default 901: bots 901/902 on 1F; 903/904 on 2F with `MAP=pallet_town_players_house_2f`). `m1` case 1, `m2` cases 2/3/7 (cleans with DELETE first), `m3` debug of the menu state, `m4` case 4 (B fights the test trainer from 9,5 facing up; A at 8,5 facing right). Bots 901 and 902 are friends now. Phone cases: `MOBILE=1 VW=390 VH=844` style contexts (see Phase 8 M9's driver `pw.mjs`).

## Tasks

- **World:** A facing a tile with another player (server checks the player is still there, any replica) → `PlayerMenu{id, name, is_friend, owns_channel}`; the client shows FireRed's message box "{NAME}" and multichoice: ADD FRIEND or MESSAGE, INVITE (D16, after M6), CANCEL. Busy → `Text_TrainerTooBusyToNotice`.
- **ADD FRIEND:** sends the request (M1); then FireRed-style text "Sent a friend request to {NAME}." (ours, FireRed has none). Already pending or friends: the menu shows what fits.
- **Chat line actions** (Phase 8 D24): the menu for a line's player, in the panel's style: ADD FRIEND / MESSAGE / INVITE / CANCEL.
- **Notices:** an incoming request shows a toast (PC) or ticker line (phone) and a badge on FRIENDS (M4 lists it).
- Strings: ours in the FireRed charset, in the game's string table.

## Manual Test

| # | Case | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | A on a player | Face a bot, press A | Name and menu; CANCEL closes, player can walk | ✅ |
| 2 | Add friend | ADD FRIEND | Text shown, bot receives the request | ✅ |
| 3 | Friend | A on a friend | MESSAGE instead of ADD FRIEND | ✅ |
| 4 | Busy | A on a bot in battle | "too busy to notice" text | ✅ |
| 5 | Moved away | Bot steps away while the menu opens | Menu not shown or action refused cleanly | ⬜ |
| 6 | Chat line | Long-press / tap a zone chat name (phone, PC) | Same actions | ⬜ |
| 7 | Notice | Bot sends a request | Toast or ticker line, FRIENDS badge | ⬜ |
| 8 | Touch | A button on the touch layer | Same as key A | ⬜ |
