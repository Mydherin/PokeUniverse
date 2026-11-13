# Phase 9: Social

**Goal:** players do more together than see each other and chat in their zone. They add friends, message them privately, talk in private channels (permanent invite-only groups), and trade and battle each other the way FireRed's Pokémon Center 2F does, with MMO rooms in place of the link cable.

## Resume Here

**Planned 2026-11-12, not started.** The scope was refined with the user: parties dropped (private channels replace them), the other player's trainer card left for later, trade and PvP in FireRed's Cable Club. Questions answered 2026-11-12 (Q1-Q4). Next: build [M1](milestones/m01-friends-server.md). Start each milestone by reading only its file, then the [context.md](milestones/context.md) sections it names.

Carried in: O14 (from Phase 8, rewritten: parties became private channels and the trainer card moved out, D1, D2).

## Milestones

Order = dependencies. Marks: ⬜ not started · 🚧 in progress · 🧪 code done, Manual Test pending · ✅ done (every case passed) · ⏸ deferred.

| # | Milestone | Status | Needs | In short |
|---|---|---|---|---|
| M1 | [Friends: server](milestones/m01-friends-server.md) | ⬜ | | Tables, contracts, HTTP list/request/accept/decline/remove, presence (online, busy, offline), per-player NATS inbox `social.player.<id>`, face ID, limits, bots |
| M2 | [Acting on a player](milestones/m02-player-actions.md) | ⬜ | M1 | A facing a player → FireRed-style menu (ADD FRIEND / MESSAGE / CANCEL); the chat line-actions menu (D24) filled; request notices |
| M3 | [Social panel shell](milestones/m03-social-shell.md) | ⬜ | | The chat becomes the social panel: CHATS and FRIENDS tabs, conversation list ↔ thread, desktop two-pane, phone sheet with back/swipe gestures, unread badges, toasts; Zone is the first conversation |
| M4 | [Friends list](milestones/m04-friends-list.md) | ⬜ | M1, M3 | FRIENDS tab: requests in/out, friends with face, name, status, last seen; tap → message; remove |
| M5 | [Direct messages](milestones/m05-direct-messages.md) | ⬜ | M1, M3 | One conversation per friend pair: saved before shown, history paged, read markers, unread counts, across replicas |
| M6 | [Private channels](milestones/m06-private-channels.md) | ⬜ | M5 | Create, name, invite friends, accept or decline, leave, owner removes, renames, deletes; up to 50 members; same thread view |
| M7 | [Pokémon Center 2F](milestones/m07-pokemon-center-2f.md) | ⬜ | | The 2F map, a door in the player's room to it, its three attendants as FireRed's (Wireless Club, Union Room with the MMO joke, Direct Corner menus), the save exchange |
| M8 | [Link rooms](milestones/m08-link-rooms.md) | ⬜ | M7, M1 | BECOME LEADER / JOIN GROUP with FireRed's leader and member screens; open rooms per 2F zone; two players walk into a private Trade Center or Colosseum (own zone phase); leaving ends the link |
| M9 | [Trade: menu and transaction](milestones/m09-trade-menu.md) | ⬜ | M8 | Trade Center seats, FireRed's trade menu with both parties, SUMMARY, choose, cancel, "Is this trade okay?", FireRed's trade rules, the swap in one transaction |
| M10 | [Trade: animation and after](milestones/m10-trade-animation.md) | ⬜ | M9 | FireRed's wireless trade scene, Gen 4 trade evolutions (held items, Everstone), Pokédex, met data and OT, follower update |
| M11 | [Colosseum: single battles](milestones/m11-colosseum-single.md) | ⬜ | M8 | PvP single battle: FireRed's link battle (party healed and restored, no bag, no EXP, no money), both sides choosing, turn timer, disconnect, results |
| M12 | [Colosseum: double battles](milestones/m12-colosseum-double.md) | ⬜ | M11 | PvP double battle on Phase 5's doubles (two usable Pokémon each), both players targeting |
| M13 | [Colosseum: multi battles](milestones/m13-colosseum-multi.md) | ⬜ | M12 | FireRed's 4-player link multi: room of four, the 4P Colosseum, 3 Pokémon each, Showdown `multi`, each player one Pokémon |
| M14 | [Social load and tuning](milestones/m14-social-load.md) | ⬜ | M5, M6, M8 | Bots friending, messaging, flooding channels and opening rooms; budgets measured and written in tech-stack.md |
| M15 | [Phase check](milestones/m15-phase-check.md) | ⬜ | M1-M14 | The whole phase played with two real players, bots and two replicas, PC and phones; regression |

M1 → M2, M4, M5; M3 → M4, M5; M5 → M6; M7 → M8 → M9 → M10 and M8 → M11 → M12 → M13. The social side (M1-M6) and the Cable Club side (M7-M12) don't depend on each other except M8's busy state (M1).

## Scope

- **Friends** (M1, M2, M4): friend requests (send, accept, decline, cancel), remove; one global list across zones and replicas; each friend's face, name and status (online, busy in battle, trade or a link room, offline with last seen); requests sent from a player in front of you or a chat line, never by searching (D5).
- **Faces** (D6): every player has a face; for now the default face of their trainer (Red's or Leaf's). Each player's own pixel-art face comes later and plugs into the same field and art loading.
- **Direct messages** (M5): a private conversation per pair of friends, kept and paged, unread counts, read markers.
- **Private channels** (M6): permanent invite-only groups, like messaging-app groups; an owner, members invited from friends, history kept.
- **Social panel** (M3): the chat grows into a social panel beside (PC) or over (phones) the game, never covering the GBA screen while it runs. Mobile gestures, PWA on Safari and Chrome ([ui.md](../../ui.md#mobile-keyboard), D10-D14).
- **Pokémon Center 2F** (M7): FireRed's map and attendants; reached by a door in the player's room until Viridian's Pokémon Center exists (D15). The Union Room attendant answers with a joke about the MMO, like SAVE does (D17).
- **Link rooms** (M8): a room is two players, opened by a leader and joined from a list, FireRed's Wireless Club flow (D18-D20).
- **Trading** (M9, M10): FireRed's Trade Center, menu and animation, with Gen 4's trade rules and evolutions; both Pokémon move or neither does (D21-D24).
- **PvP** (M11-M13): FireRed's Colosseum, single, double and 4-player multi battles, only FireRed's options, Gen 4 rules (D25-D29).
- **Not here:** parties (dropped, D1); another player's trainer card and battle records (O17); blocking players (O16, Phase 13); push notifications when the game is closed (O19); moving the 2F to Viridian's Pokémon Center and the attendants' Pokédex check (O20); traded Pokémon obeying by badges (O21).

## Done When

- Two players meet in the world, become friends, message each other privately and talk in a private channel with a third player, on PC and on phones (iOS Safari, Android Chrome, both as a PWA), across two `mic-core` replicas, with nothing lost after a reconnect.
- In the Pokémon Center 2F, one becomes LEADER, the other joins, and they trade (FireRed's menu and animation, a trade evolution) and fight single, double and (with four players) multi battles in the Colosseum like FireRed's link battles.
- The Union Room attendant answers with the MMO joke; a crash or disconnect mid-trade never loses or duplicates a Pokémon.
- The social budget measured in M14 holds, with no regression in the regression check.
