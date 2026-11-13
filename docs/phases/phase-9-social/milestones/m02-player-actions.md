# M2: Acting on a Player

Part of [Phase 9](../phase-9-social.md). Decisions: [context.md](context.md#friends-and-presence) D4, D5, D7; Phase 8 D24.

## Resume Here

✅ **Done 2026-11-13.** Every Manual Test case passed in game (headless Chromium, PC and phone contexts). `TEMP-PLAYIT` removed, spa rebuilt.

**Built (files):**
- Contracts: `social.proto` `Relation` enum (NONE, FRIEND, REQUEST_SENT, REQUEST_RECEIVED); `world.proto` `ScriptStep.player_menu = 10` → `PlayerMenu{id, name, relation, owns_channel}` (owns_channel always false until M6).
- mic-core: `social/friends.go` `Service.Relation`; `world.Social` gained `Relation`; `world/zone.go` `playerMenu(p)` from `interact` (before NPCs): finds an `OtherPlayer` on the faced tile with `z.others(p)` (any replica), locks the player, `InBattle` → `trainer_too_busy`; else reads the relation in a goroutine and queues the Script via `z.do`.
- Strings: `infra/text/extract.mjs` (`cable_club.inc` Text_TrainerTooBusyToNotice + `OUR_STRINGS` `PU_Text_*`), `manifest.ts` `WORLD_TEXTS.trainer_too_busy`.
- spa: `game/world/social.ts` `SocialState` (friends list on every snapshot, `apply(SocialEvent)`, `relation`, `addFriend`, `unseen` = badge, `dropIncoming`); `realtime/connection.ts` `onSocial`; `flow.social`; `game/firered/player-menu.ts` `PlayerMenuRun` (FireRed's multichoice sizes); `game/firered/social-ui.ts` `LineActions` (popover on long-press/tap of a chat line) and `Notice`; `chat-window.ts` FRIENDS chip badge, PC toast, phone ticker notice, `openWith(id)`, `notice(text)`; CSS in `styles/app.css`.

**Choices (with reasons):** REQUEST_SENT shows "You already sent {NAME} a friend request." and no menu (nothing to choose). REQUEST_RECEIVED shows ADD FRIEND, which accepts (D3). MESSAGE opens the chat panel until M5's DMs. Players are checked before NPCs (FireRed checks object events first). Case 5: a menu already open when the other player walks away still sends the request (a request is by account, it doesn't need them in front of you); a player already gone gets no menu.

**Fixed while testing:** the badge stayed 1 after accepting through ADD FRIEND (`dropIncoming`); the phone ticker notice was squeezed beside the log because the canvas's Tailwind `block` utility outranks `@layer components` (`display: none !important`, notice `flex: 1`).

**Testing:** driver in the shared notes folder `m2-headless/` (copy to your scratchpad, set `SHOTS` in `two.mjs`; needs the `TEMP-PLAYIT` hook re-added after `this.draw()` in `overworld.ts` `frame()`: `Object.assign(window, { __self, __script, __others, __chat: this.flow.chat, __social: this.flow.social })`). `node two.mjs ./mN.mjs`: `m2` cases 2/3/7, `m4` case 4, `m5` friend menu + badge, `m6` case 6 PC, `m7` cases 6/7/8 on a phone context (touch via CDP `Input.dispatchTouchEvent`), `m8` case 5. Bots 901 and 902 are friends now.

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
| 5 | Moved away | Bot steps away while the menu opens | Menu not shown or action refused cleanly | ✅ |
| 6 | Chat line | Long-press / tap a zone chat name (phone, PC) | Same actions | ✅ |
| 7 | Notice | Bot sends a request | Toast or ticker line, FRIENDS badge | ✅ |
| 8 | Touch | A button on the touch layer | Same as key A | ✅ |
