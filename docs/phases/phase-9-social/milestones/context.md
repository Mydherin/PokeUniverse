# Social: Shared Context

Part of [Phase 9](../phase-9-social.md). Open only the section a step needs. How to play, bots and two replicas: [How to Test in Game](../../README.md#how-to-test-in-game); Phase 8's zones and chat: [its context](../../phase-8-multiplayer-world/milestones/context.md) (D2, D5, D13, D19, D21-D24), open by section.

## Playing a Milestone

Same steps as Phase 8 (build, play the **Manual Test**, regression check, fix, cut the file down). Differences:

- **Two real players:** tab 1 is the user's Google account, tab 2 a bot taken over by token (`/play?bot=<token>`). Bots befriend, message and open rooms with the flags M1, M5, M6 and M8 add to `infra/bots/bots.ts`.
- **Back up both saves** before a trade or battle case ([Phase 6 backup steps](../../phase-6-pokemon-party/milestones/context.md#playing-a-milestone)); a trade really swaps Pokémon.
- **Regression check** adds Phase 8's (5 bots walking, zone chat, wild battle, room trainer) and, from M5 on, zone chat still unsaved and unchanged.

## Decisions

All from the user's request of 2026-11-12 unless marked otherwise. Each one cites the FireRed behavior it keeps or the reason it differs.

### Scope

| # | Decision |
|---|---|
| D1 | **No parties.** Private channels (D8) replace "party chat". *Why:* user 2026-11-12, parties make no sense now. |
| D2 | **No trainer card of another player in this phase.** Pressing A facing a player opens the player menu (D4). The card, and FireRed's link battle records shown with it, are left for later (O17). *Why:* user 2026-11-12, "maybe not yet". |

### Friends and presence

| # | Decision |
|---|---|
| D3 | **Friend requests:** send, cancel, accept, decline; accepting makes both friends; remove ends it for both, with no notice. Limits: 100 friends, 20 pending outgoing, 50 pending incoming (oldest dropped). A request to someone who already asked you accepts both. PostgreSQL: `friend_requests(from, to, created_at)` and `friendships(a, b, since)` (a < b, one row per pair). Lists are HTTP + JSON (`GET /api/social/friends`, `POST /api/social/friends/requests`, `.../{id}/accept`, `DELETE /api/social/friends/{id}`); the changes are pushed live (D7). |
| D4 | **Acting on a player in the world:** A facing another player (the touch A button too) opens a FireRed message box, "{NAME}" plus a multichoice in FireRed's menu style: ADD FRIEND (or MESSAGE once friends; INVITE only when you own a channel) / CANCEL. The same actions open from a chat line (D24 of Phase 8: long-press or tap the name). FireRed shows the trainer card here (`CableClub_EventScript_ReadTrainerCard`); the MMO needs these actions instead (D2). A busy player (D7) answers with FireRed's `Text_TrainerTooBusyToNotice`. |
| D5 | **No search by name.** You add someone you met: in front of you, or from a zone chat line. *Why:* names aren't unique and search invites spam; moderation is Phase 13's (O16). |
| D6 | **Face, ready for each player's own** (user 2026-11-12, Q2): every trainer has `face` (uint32; `0` = the default), sent wherever a player shows in the social panel (friends, requests, members, message headers, toasts). The default is the player's trainer face by gender: a 32×32 portrait cut from Red's or Leaf's front pic (`graphics/trainers/front_pics/`, `make graphics` output). Later each player gets their own pixel-art face (ours, not FireRed's): `face > 0` names a stored face, fetched by URL `/faces/<id>.png`, same size and palette rules, cached by ID. So the client already draws every face through one `FaceView(face, gender)` that loads by ID and falls back to the gender default; no contract or UI change when custom faces arrive. |
| D7 | **Presence:** online, busy (in a battle, a trade or a link room: Phase 8 D9's `in_battle` grows into a `busy` enum), offline with last seen. Computed from the session key (`player:<id>:session`) and the busy flag in Redis, read with one `MGET` for a friends list. A change is pushed only to online friends (D9). Updated at most once per 2 s per player. |

### Messaging

| # | Decision |
|---|---|
| D8 | **Conversations:** zone (Phase 8, not saved), direct (one per friend pair) and channel (private, permanent). Direct and channel messages go in PostgreSQL `messages(conversation_id, seq, sender, text, sent_at)`, with `seq` increasing per conversation. A message is saved before anyone is sent it, as positions are (Phase 8 D3). Text: Phase 8 D13's rule (FireRed charset, trimmed, 1-64 characters) and D17's rate limit, one budget across every conversation. |
| D9 | **Delivery across replicas: one NATS inbox per online player,** `social.player.<id>`, subscribed by the replica holding that player's session (as `sessionbus`). The sender's replica saves the message, then publishes it to each member's inbox (≤ 50, D16). Friend events, invites and presence go the same way. *Why:* no channel routing or ownership, any replica serves anyone, and the cost grows with the members actually online. |
| D10 | **History and unread:** a thread opens with the last 50 messages (`GET /api/social/conversations/{id}/messages?before=<seq>`, older pages on scroll up). Each member keeps `last_read_seq`; unread = last `seq` − `last_read_seq`, in the conversation list. Read state is sent when the thread is visible and the tab is focused. Kept per conversation: the newest 1,000 (older ones deleted by a daily job). A reconnect refetches the list and the open thread's new messages, so nothing is lost or doubled (`seq` dedupes). |
| D11 | **Direct messages need a friendship.** After a remove, the history stays readable to both, but no one can send. |
| D16 | **Channels:** name in FireRed's charset, 1-16 characters; an owner (creator) and up to 50 members. The owner invites friends (the invitee accepts or declines), removes members, renames, deletes; a member leaves; when the owner leaves, the longest member becomes owner (an empty channel is deleted). At most 10 channels owned and 30 joined per player. Tables `channels`, `channel_members(channel, player, role, joined_at, last_read_seq)`, `channel_invites`. |

### Social panel (UI/UX)

| # | Decision |
|---|---|
| D12 | **One social panel, outside the GBA screen.** Phase 8's chat panel and sheet become it: tabs **CHATS** and **FRIENDS**, in the same Union Room chat style (pixel font, panel blue, `messages.pal` colors). Nothing is added to the START menu or drawn into the 240×160 screen except D4's menu. *Why:* FireRed's screens stay as they are; the panel is the MMO's, as zone chat is. |
| D13 | **PC (wide window):** the panel stays beside the game (Phase 8 D15, the game still sized first). Inside it, two panes when the panel is ≥ 480 CSS px wide: the conversation list (Zone pinned first, then by last message, face, name, last line, unread badge) and the open thread; narrower, one pane with a back button. Keys: `T` opens the last conversation, `Esc` goes back then closes, `Alt+↑/↓` switches conversation, `Enter` sends. A message to a closed or other conversation shows a toast at the panel's top (face, name, line; click opens it) and a badge. |
| D14 | **Phones (portrait and landscape):** the chat button and ticker stay (Phase 8 D23); the ticker shows lines from every conversation, labeled with the conversation. Tapping opens the sheet on the **list**; a conversation pushes the **thread** (a history entry, so the system back gesture and the in-app back arrow pop it), a swipe right from the thread's left area (not the screen edge, which is the browser's) goes back, swipe down on the header closes the sheet. Long-press a list row → mute (for this session), leave, remove friend. The compose bar is Phase 8's (D22, ui.md's keyboard pattern) in every thread. Notifications while the sheet is closed: badge on the chat button plus a ticker line; the device vibrates (`navigator.vibrate`, Android only) for direct messages. *Why:* the usual messaging-app gestures; the game keeps running above the sheet. |

### Pokémon Center 2F

| # | Decision |
|---|---|
| D15 | **The map is FireRed's `POKEMON_CENTER_2F` layout** (Viridian's 2F, `tool-maps convert`) as its own map `pokemon_center_2f`. Until Viridian's Pokémon Center exists (Phase 12), a door in the player's room (house 2F) leads there and its stairs (warp 0, `1,6`) lead back to that door. *Why (user 2026-11-12):* the maps so far are the house. O20 moves it. |
| D17 | **The attendants as FireRed's FRLG ones, as if the Wireless Adapter were connected:** left (`2,2`) Wireless Club, explains linking (`CableClub_Text_AskAboutLinking`, YES/NO), text kept; right (`10,2`) Direct Corner: `CableClub_Text_WelcomeWhichDirectCornerRoom`, then TRADE / COLOSSEUM / CANCEL (`MULTICHOICE_TRADE_COLOSSEUM_2`, no Berry Crush); middle (`6,2`) Union Room: `CableClub_Text_WelcomeUnionRoomEnter`, YES / NO / INFO kept, but YES answers with a joke instead of entering (the whole world is already a Union Room), as SAVE answers with one ([Phase 4](../../phase-4-players-room.md)). The mystery gift man stays hidden (FRLG hides him unless Mystery Gift is on). FireRed's checks kept: two Pokémon to trade (`CableClub_Text_NeedTwoMonsToTrade`), two usable for a double battle, no Bad Egg; the Pokédex check (`FLAG_SYS_POKEDEX_GET`) waits for story flags (O20). Before linking, FireRed's "save the game" exchange plays as SAVE does (the MMO is always saved). *Why:* user 2026-11-12. |

### Link rooms

| # | Decision |
|---|---|
| D18 | **Rooms follow FireRed's Wireless Club flow** (`CableClub_EventScript_ChooseLinkLeaderFrom2`, `...From4` for MULTI): after the activity (trade, single or double battle), JOIN GROUP / BECOME LEADER / CANCEL. A leader waits on `union_room.c`'s leader screen (`Task_TryBecomeLinkLeader`: "Awaiting members", a member asks to join, A accepts, B declines); a member sees its list of leaders (`Task_TryJoinLinkGroup`: name and activity, up to 16 shown with scrolling), picks one, waits for the answer. *Why:* FireRed's own rooms map onto MMO rooms without inventing a screen (user: "like a room, only two people"). |
| D19 | **Who is in range:** the leaders in the same Pokémon Center 2F zone (map + phase), friends first, then by time opened. Rooms are kept in Redis `linkrooms:<map>:<phase>` (leader → activity, opened at), changed by Lua with the session check, and announced as zone events (`LinkRoomOpened`, `LinkRoomClosed`) to players on the member screen. A leader who leaves the map, disconnects or cancels closes the room. |
| D20 | **The room is a private zone:** once accepted, both walk in (FireRed's movements: `Movement_PlayerApproachLinkRoomLeft`, door at `9,1`) and are warped to `trade_center` or `battle_colosseum_2p` with a zone phase that is the room's ID (Phase 8 D19's key, a private phase), so only the two see each other there. Leaving (FireRed's `TradeCenter_ConfirmLeaveRoom`, "terminate the link") or a disconnect ends the room for both and puts them back in front of the counter, as `CableClub_EventScript_ExitLinkRoom`. Both are busy (D7) from accept until they are back. |

### Trading

| # | Decision |
|---|---|
| D21 | **FireRed's Trade Center and trade menu:** each takes a seat (`TradeCenter` map); with both seated, `trade.c`'s menu opens: both parties side by side (icons, the cursor, SUMMARY / TRADE, CANCEL), what the other picked shown when both have picked, "Is this trade okay?" (YES/NO) to both, "Cancel trade?". The server holds the offer: either changing or cancelling resets both confirmations. |
| D22 | **Rules:** FireRed's (`trade.c`): two Pokémon in the party to enter; a trade that would leave a side with no usable Pokémon is refused with FireRed's message; an Egg can be traded. Held items travel with the Pokémon (Gen 4; FireRed only blocked the Enigma Berry). Party only, not boxes, as FireRed. |
| D23 | **One transaction:** when both said YES, `mic-core` swaps the two `trainer_pokemon` rows (owner and party slot) in one PostgreSQL transaction keyed by the trade ID, after checking both are still in the parties as offered. Retried or replayed, it applies once; a crash before the commit swaps nothing, after it both see the result on reconnect. *Why:* user 2026-11-12, both Pokémon move or neither does. |
| D24 | **After a trade:** FireRed's wireless trade scene (`trade_scene.c`, `DoTradeAnim_Wireless`, as the rooms are the Wireless Club's), then the Gen 4 trade evolutions (by trade: Kadabra, Machoke, Graveler, Haunter; holding an item: Onix + Metal Coat, Scyther + Metal Coat, Poliwhirl and Slowpoke + King's Rock, Seadra + Dragon Scale, Porygon + Up-Grade, Porygon2 + Dubious Disc, Rhydon + Protector, Electabuzz + Electirizer, Magmar + Magmarizer, Dusclops + Reaper Cloth, Clamperl + Deep Sea Tooth or Scale; Everstone stops them; the item is used up), shown with Phase 6's evolution scene (`CB2_TryLinkTradeEvolution`). The original trainer and met data stay (SUMMARY says "Met in a trade" when OT differs); a traded Pokémon gains 1.5× EXP (Gen 4); the Pokédex marks it seen and caught; the follower updates. Obedience by badges is O21. |

### PvP

| # | Decision |
|---|---|
| D29 | **Only FireRed's options** (user 2026-11-12, Q1): the Colosseum offers exactly FireRed's SINGLE / DOUBLE / MULTI / INFO / EXIT, nothing added. MULTI is FireRed's 4-player link multi battle: a room of four (leader + 3, `ChooseLinkLeaderFrom4`), `BattleColosseum_4P`, 3 Pokémon each, two per side, each player controls one (Showdown `gameType: 'multi'`) (M13). |
| D25 | **FireRed's Colosseum link battle:** each takes a seat (`BattleColosseum_2P`); with both seated the battle starts with FireRed's link intro ("{NAME} wants to battle!"). Single: Showdown's `gen4customgame`; double: `gen4doublescustomgame` (Phase 5 M13's doubles), two usable Pokémon each (FireRed's check). No level cap or clauses (FireRed has none). |
| D26 | **Link battle rules (FireRed):** both parties are healed before (`HealPlayerParty`) and the party is restored after (`SavePlayerParty`/`LoadPlayerParty`): no EXP, EVs, money, item use from the bag ("can't be used now"), no Pokédex change, no evolution; RUN asks to forfeit (FireRed: "Would you like to forfeit the match?"). Results: FireRed's link outcome texts ("Player defeated {NAME}!", lost, drew). *Why:* matches FireRed's link battle, which changes nothing in the save. |
| D27 | **Both sides choose:** `mic-core` collects both players' choices per step and sends them in one `battles.turn` ([tech-stack.md](../../../tech-stack.md#behavior)); each sees only their own side's request. A turn timer of 60 s per choice (ours: FireRed's link has none, but a player can't wait forever): at 10 s left a countdown shows; at 0 the server picks the first usable move (or the first switch when forced). |
| D28 | **Disconnects:** a player who drops has 30 s to come back (the battle redraws with `battles.view`); after that, or on a second drop, the other wins by forfeit. A crash of either `mic-core` resumes from the saved battle (Phase 5). |

## Questions for the User

All answered 2026-11-12: Q1 MULTI is built, FireRed's options only (D29, M13); Q2 default face by gender, ready for each player's own pixel-art face (D6); Q3 blocking in Phase 13 (O16); Q4 64 characters for every conversation (D8).

## FireRed and HeartGold References

| What | Where |
|---|---|
| 2F map, attendants, warps | `pokefirered/data/maps/ViridianCity_PokemonCenter_2F/` (layout `LAYOUT_POKEMON_CENTER_2F`; receptionists at `2,2` Wireless Club, `6,2` Union Room, `10,2` Direct Corner; warps: stairs `1,6`, Union Room `5,1`, Trade Center `9,1`) |
| Attendants' scripts and every string | `pokefirered/data/scripts/cable_club.inc`: `CableClub_EventScript_DirectCornerAttendant`, `_UnionRoomAttendant`, `_WirelessClubAttendant`, `_SaveAndChooseLinkLeader`, `_ChooseLinkLeaderFrom2`, `_EnterWirelessLinkRoom`, `_ExitLinkRoom`, `TradeCenter_ConfirmLeaveRoom`, `_CheckPartyTradeRequirements`; texts from line ~1291 |
| Leader and member screens | `pokefirered/src/union_room.c`: `TryBecomeLinkLeader`/`Task_TryBecomeLinkLeader` (~382), `TryJoinLinkGroup`/`Task_TryJoinLinkGroup` (~1126); `gText_BecomeLeader` etc. in `src/strings.c` |
| Link rooms | `pokefirered/data/maps/TradeCenter/`, `BattleColosseum_2P/`, `BattleColosseum_4P/` (M13, seats `3,4` `3,6` `10,4` `10,6`); `src/cable_club.c` (seats, `CB2_ReturnFromCableClubBattle`) |
| Trade menu | `pokefirered/src/trade.c`: `CB2_StartCreateTradeMenu` (821), `CB2_TradeMenu` (1350), `CB2_ReturnToTradeMenuFromSummary`; `gText_IsThisTradeOkay`, `gText_CancelTrade` (`src/strings.c` ~1208) |
| Trade animation and evolution | `pokefirered/src/trade_scene.c`: `CB2_LinkTrade` (779), `DoTradeAnim_Wireless`, `CB2_TryLinkTradeEvolution` (2311); art in `graphics/trade/` |
| Link battle | `pokefirered/src/battle_controller_link_opponent.c`, `battle_controller_link_partner.c`; link intro and outcome strings in `src/battle_message.c` |
| Trainer front pics (D6 faces) | `pokefirered/graphics/trainers/front_pics/` (Red, Leaf) |

## Already Built (don't rebuild)

- **Zones, chat, presence:** Phase 8 ([its Already Built](../../phase-8-multiplayer-world/milestones/context.md#already-built-dont-rebuild)): `ZoneKey{map, phase}`, `world.zone.<map>.<phase>`, `zone:<map>:<phase>`, `ChatMessage`, the chat panel, sheet, ticker and compose bar, `in_battle` on `OtherPlayer`.
- **Battles:** Phase 5 (singles and doubles, `battles.start/turn/forfeit/view`), evolution after battle and its scene (Phase 6).
- **Menus and dialogs:** FireRed's message box, multichoice and YES/NO, the SAVE homage (Phase 4); the party and SUMMARY screens (Phase 6).
