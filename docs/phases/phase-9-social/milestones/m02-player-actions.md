# M2: Acting on a Player

Part of [Phase 9](../phase-9-social.md). Decisions: [context.md](context.md#friends-and-presence) D4, D5, D7; Phase 8 D24.

## Resume Here

Not started. Needs M1.

## Tasks

- **World:** A facing a tile with another player (server checks the player is still there, any replica) → `PlayerMenu{id, name, is_friend, owns_channel}`; the client shows FireRed's message box "{NAME}" and multichoice: ADD FRIEND or MESSAGE, INVITE (D16, after M6), CANCEL. Busy → `Text_TrainerTooBusyToNotice`.
- **ADD FRIEND:** sends the request (M1); then FireRed-style text "Sent a friend request to {NAME}." (ours, FireRed has none). Already pending or friends: the menu shows what fits.
- **Chat line actions** (Phase 8 D24): the menu for a line's player, in the panel's style: ADD FRIEND / MESSAGE / INVITE / CANCEL.
- **Notices:** an incoming request shows a toast (PC) or ticker line (phone) and a badge on FRIENDS (M4 lists it).
- Strings: ours in the FireRed charset, in the game's string table.

## Manual Test

| # | Case | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | A on a player | Face a bot, press A | Name and menu; CANCEL closes, player can walk | ⬜ |
| 2 | Add friend | ADD FRIEND | Text shown, bot receives the request | ⬜ |
| 3 | Friend | A on a friend | MESSAGE instead of ADD FRIEND | ⬜ |
| 4 | Busy | A on a bot in battle | "too busy to notice" text | ⬜ |
| 5 | Moved away | Bot steps away while the menu opens | Menu not shown or action refused cleanly | ⬜ |
| 6 | Chat line | Long-press / tap a zone chat name (phone, PC) | Same actions | ⬜ |
| 7 | Notice | Bot sends a request | Toast or ticker line, FRIENDS badge | ⬜ |
| 8 | Touch | A button on the touch layer | Same as key A | ⬜ |
