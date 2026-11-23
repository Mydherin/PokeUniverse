---
id: 11-colosseum-single
title: "Colosseum: single battles"
status: building
depends: [08-link-rooms]
context: [context/social.md, context/references.md]
---

# M11: Colosseum, Single Battles

Part of [Phase 9](../PHASE.md). Decisions: [context/social.md](../../../context/social.md#pvp) D25-D28. References: `battle_controller_link_opponent.c`, `cable_club.c`, `battle_message.c` link strings.

## Resume Here

**Building.** Design below decided (M11-D1..D8); work through *Tasks* in order. References: `git submodule update --init --depth 1 references/pokefirered` if empty.

### Design (decided 2026-11-23)

| # | Decision |
|---|---|
| M11-D1 | **`BATTLE_KIND_LINK`** (view.proto). mic-battles needs nothing else: no AI (no flags, not WILD), no EXP/Pay Day/Pickup (side 0 + TRAINER/WILD only), balls blocked. `BattleView.trainer` carries the opponent: class "", name, pic `red`/`leaf` by gender (FireRed's link opponent pic). Shift style off (FireRed forces SET in link battles). |
| M11-D2 | **The leader's replica starts it** once both sit (as the trade menu): member's party from PostgreSQL, both healed clones (nothing saved, D26), side 0 leader, side 1 member; it saves both players' `battle.Active` (new `Side`, `Link{Room, Partner, PartnerName, PartnerGender, Leader, Activity, Seat}`), calls `battles.start`, sends the member's replica `ColosseumAction.started` (it reads its Active from Redis). |
| M11-D3 | **Choices collected in Redis** `pvp:<battle>` (`battle/pvp.go`, Lua): `step`, `need` (sides whose request isn't WAIT), `c0`/`c1`, `deadline`. A choice is HSETNX'd; the call that completes `need` plays `battles.turn` with all of them (any replica; a duplicate is mic-battles' safe retry), advances the record (only forward), and sends the partner's replica the `BattleUpdate` (`ColosseumAction.update` + deadline) on its inbox. Each replica shows its own side, deduped by request step. *Why:* no host to rebuild after a replica crash. |
| M11-D4 | **Timer per player on its own replica** from the record's deadline (60 s): `BattleTurn`/`BattleStarted.seconds_left`; the client counts down the last 10 s in a window. At 0 the replica picks (first move with PP not disabled, else Struggle slot 0; forced switch: first able bench slot) and re-submits every 5 s while the step stays (heals a crash after completion). |
| M11-D5 | **Disconnect (D28):** Leave keeps a link battle (no rollback; nothing to roll back) and still sends PartnerLeft; the partner's replica, in a link battle, counts a drop instead of ending the link (also from the 5 s partner watch); 30 s later still away, or a second drop → `battles.forfeit` for the absent side, its Active cleared, then the link ends. A rejoin (take-over too) with a link Active resumes: placed on its seat in `battle_colosseum_2p` in the room's phase, link state rebuilt from Active.Link, `ColosseumAction.back` to the partner. |
| M11-D6 | **RUN → forfeit:** client asks `PU_Text_ForfeitMatch` ("Would you like to forfeit the match?", Emerald's wording, ours: FireRed has none), YES sends RUN; mic-core plays `battles.forfeit` for that side. Texts: forfeiter `sText_GotAwaySafely`, other `sText_WildFled` (FireRed's B_OUTCOME_LINK_BATTLE_RAN), WON/LOST/TIE the link outcome texts; no money, no whiteout. BAG → `sText_ItemsCantBeUsedNow` (BattleScript_ActionSelectionItemsCantBeUsed); mic-core refuses items. |
| M11-D7 | **No outcome saved** (D26): `finishLink` clears Active, sends `BattleEnded` (money 0) and the unchanged party; presence back to BUSY_LINK; both stay in the Colosseum, seats free to battle again. No `battle_outcomes` row (its key is the battle ID, one per battle). |
| M11-D8 | **Seats:** triggers `player_spot_0/1` (EnterColosseumPlayerSpot) → script step `colosseum_seat` ("Please wait. B Button: Cancel"; B → `LinkIntent.colosseum_cancel`); the attendant says `Text_TakeSeatStartBattle`. The client's seat step ends at BattleStarted and the battle runs with the link intro; after it the script ends. |

### State

- **Done:** design above; contracts committed and generated (`1214d0d`): `BATTLE_KIND_LINK`, `BattleStarted/BattleTurn.seconds_left`, `ScriptStep.colosseum_seat` (17), `LinkIntent.colosseum_cancel` (13), `LinkEvent.colosseum` (11) = `ColosseumAction{from; seated{save, spot, member Friend} | stood | started BattleUpdate | step{update, deadline} | back}` (social.proto now imports battle.proto). `go build ./... && go vet ./...` green with them.
- **Next step:** Task 1+2 server, in `mic-core/internal/`:
  1. `battle/pvp.go`: on `*battle.Store` (Redis, `w.active`): `LinkInit/LinkAdvance(id, step, need, deadline)` (only forward; clears `c0`/`c1`; TTL a week, an hour once over), `LinkChoose(id, step, side, SideChoice bytes)` (Lua: stale step → -1; HSETNX `c<side>`; all of `need` in → return them), `LinkDeadline(id)`. `battle.Active` gains `Side int` and `Link *LinkInfo{Room, Partner, PartnerName, PartnerGender, Leader, Activity, Seat}`; `battle.NewLinkStart(leader, member Party)` (healed clones, `team(party, 0)`, kind LINK, no shift style).
  2. `world/colosseum.go` (mirror `trade.go`): `colosseumSeat(p)` called next to `tradeSeat` in `encounter.go:20` (triggers `player_spot_0/1` on `battle_colosseum_2p`, activity SINGLE); `startScript(p, Script{{ColosseumSeat}})`, `p.link.seated`, `watchPartner`; leader keeps `p.link.colosseum{seated [2], memberSave, member Friend, memberSpot}`; member sends `ColosseumAction.seated` via `z.w.social.Link(p.link.other, …)`; `colosseum_cancel` → stood. Dispatch `LinkEvent_Colosseum` in `link_room.go onLinkHere`, intent in `Player.Link`.
  3. Start on the leader's replica (`z.ask`): load member party (`pokemon.Load`), both `CanBattle`, SetActive both, `battles.Start`, `LinkInit` (need = sides whose request ≠ WAIT, deadline now+60 s), show own side, send member `started`; member's replica reads its Active from Redis and shows side 1. Presence BUSY_BATTLE.
  4. `battleChoice` for link (`b.Link != nil`): items refused, RUN → `battles.forfeit` own side; else `LinkChoose` → complete → `battles.Turn(all choices)` → `LinkAdvance` → send partner `step{update, deadline}` → own `linkPlayed` (dedupe on request step; `seconds_left` on BattleTurn; arm timer). Partner's `step` → same `linkPlayed`. Every `battle.PlayerSide` use in `battle.go` (played, ask's side check, joinBattle `View`, resumeBattle, withStart) must use `b.Side`; `withStart` fills `view.Trainer` from `Link` (class "", pic red/leaf).
  5. Timer (M11-D4), disconnect (M11-D5: `world.go Leave` skips `abandonBattle` for link; `linkGone` still sends PartnerLeft; `onLinkHere PartnerLeft` and `watchPartner` count a drop in a link battle; Join with a link Active resumes even on take-over, placed on `Link.Seat` in zone `{battle_colosseum_2p, Room}` (`place`/`phaseOf` in `world.go` ~173-192), `p.link` rebuilt, `back` sent), `finishLink` (M11-D7; no `battle.Record`, `battle_outcomes` is keyed by battle ID).
  6. Attendant: `"battle_colosseum_2p.attendant": {message("cable_club.take_seat_start_battle")}` in `interact.go npcScripts`.
- **Then Task 3 client** (`spa-pokeuniverse/src/game/firered/`): `overworld.ts` seat step like `runTradeSeat` (~1413; BattleStarted during it → battle with intro, `battleStarted` ~588), `manifest.ts` (`cable_club.take_seat_start_battle` → `Text_TakeSeatStartBattle` ~626; `BATTLE_GRAPHICS` + `TRAINER_PICS` red/leaf front pics ~364-372, files `trainers/front_pics/red_front_pic.png`, `leaf_front_pic.png`), `texts.json` labels: `Text_TakeSeatStartBattle`, `sText_LinkTrainerWantsToBattle`, `sText_LinkTrainerSentOutPkmn`, `sText_LinkTrainerSentOutPkmn2`, `sText_LinkTrainer1WithdrewPkmn`, `sText_PlayerDefeatedLinkTrainer`, `sText_PlayerLostAgainstLinkTrainer`, `sText_PlayerBattledToDrawLinkTrainer`, `sText_WildFled`, `gText_LinkStandby` (all in pokefirered `src/battle_message.c` 320-412, 1281); `infra/text/extract.mjs OUR_STRINGS` + `PU_Text_ForfeitMatch`. `battle/screen.ts`: intro (~282 text, ~203 music `mus_vs_trainer`), BAG (~375) and RUN (~378) for LINK, `endJob` (~419) link texts, "Link standby…" after `send` (~406), countdown window ≤ 10 s, a newer turn (server auto-pick) cancels the open choice.
- **Gotchas:** `make contracts` / `make` with bind mounts fail on the shared Docker engine (paths not on the host); no local Go or buf. Copy files in and out instead: buf = `docker create … bufbuild/buf:1.59.0 sh -c "buf lint && buf generate"`, `tar … lib-contracts/{buf.yaml,buf.gen.yaml,proto} | docker cp - C:/repo`, start, copy `gen/go` and `gen/ts/src` back. Go = a `golang:1.27-alpine` container labelled `com.docker.compose.project=$COMPOSE_PROJECT_NAME`, tar `mic-core` + `lib-contracts/{go.mod,go.sum,gen/go}` in, `touch maps/placeholder.binpb` (embed needs the gitignored maps), `go build ./... && go vet ./...`. The rtk output filter truncates long grep/ls output: use Read with ranges. References: `git submodule update --init --depth 1 references/pokefirered`.

## Tasks

- [ ] **Seats:** Colosseum seats as the Trade Center's; both seated → `Text_TakeSeatStartBattle`, the battle starts.
- [ ] **Server:** `battles.start` with both parties healed (D26), each side a player; `mic-core` waits for both choices per step (D27), turn timer 60 s, countdown event at 10 s, auto-pick at 0; disconnect grace 30 s (D28); the outcome changes nothing in the parties; busy BUSY_BATTLE.
- [ ] **Client:** link battle intro and outro (FireRed's link versions: "{NAME} wants to battle!", the opponent's trainer pic by gender, link outcome texts), "waiting for the other player" (FireRed's "Link standby..."), the countdown, BAG refused, RUN → forfeit question.
- [ ] **After:** both back in the Colosseum, then out as M8.

## Log

- 2026-11-23: building; design M11-D1..D8 decided; contracts added (session stopped at the context limit before server code).

## Manual Test

| # | Case | Steps | Expected | Result |
|---|---|---|---|---|
| 1 | Battle | Two players play a single battle to the end | Both see their own side; winner and loser texts | ⬜ |
| 2 | Healed and restored | Damaged party before; check after | Healed at start; after, as before the battle; no EXP | ⬜ |
| 3 | Bag, run | Open BAG; RUN | Refused; forfeit question, YES ends it | ⬜ |
| 4 | Timer | One waits | Countdown, auto-pick at 0 | ⬜ |
| 5 | Switches, faint | Force switches both sides | Each picks its own, battle continues | ⬜ |
| 6 | Disconnect | One drops and returns in 30 s; again and stays away | Resumes; then forfeit win | ⬜ |
| 7 | Replica crash | Kill a replica mid-battle | Resumes from the saved step | ⬜ |
| 8 | Two replicas | Players on different replicas | Works | ⬜ |
