# M6 Battles in `mic-core` and the Room Trainer 🚧

Part of the [battles plan](README.md). **Needs:** M4 (M5 for the real AI). Shared rules and context: [context.md](context.md).

**Read:** `internal/world/{zone,player,interact}.go`, `internal/realtime/realtime.go`, `internal/battles/battles.go`, `internal/live/live.go`, `lib-maps/maps/pallet_town_players_house_2f.yaml`, `docs/maps.md` (objects), `tool-maps` compile for objects.

- [x] NPCs in maps: `npc` objects compiled into `ClientMap.npcs` (`ClientNpc`) and `ServerMap`; NPCs block movement (`rules.go`, `rules.ts`); A on an NPC runs its script (before signs); the NPC faces the player (`Script.npc`).
- [x] Client: NPC sprites (`firered/npc-sprite.ts`: `cooltrainer_m.png` + `npc_blue.pal`), standing and facing; the sheet builder is shared with the player (`characterSheet`).
- [x] Room: `test_trainer` at (9, 4), `face_down` (D13). Validated, compiled, previewed.
- [x] Script steps: `YesNo{no}` and `TrainerBattle{trainer}` (D19); the client sends `ScriptBattle`, the script goes on after a win.
- [x] `internal/battle`: trainer table (`testdata.go`: FireRed's COOLTRAINER ROLANDO, money rate 9, gym-leader AI flags, 2 HYPER POTION, the six Lv 50 sets, max IVs, checked against Showdown's Gen 4 learnsets). Texts: FireRed's `Route13_Text_SheilaIntro` (the question), `VictoryRoad_1F_Text_Rolando{Intro,Defeat,PostBattle}`.
- [x] Active battle per player in Redis (`player:<id>:battle`: id, trainer, save, start request); `BattleChoice` (step check, RUN refused, item ownership: ITEMS/BERRIES; spent in PostgreSQL once mic-battles played the step, before it's shown); a refused choice answers its request again; `Start`/`Turn` retried until answered (2 min).
- [x] Outcome transaction keyed by battle ID (`battle_outcomes`, migration 00013): party, money (prize or whiteout loss). Whiteout: healed party, back at `world.Start`, script ended (D20).
- [x] The snapshot's `battle` for resume (start again + view, 3 s; otherwise a placeholder, then `BattleStarted` once mic-battles answers; a battle already over gets its outcome from the last step's saved reply); `busy()` blocks moves and actions while in battle.
- [ ] **Done when:** talking to the test trainer starts a battle that plays to the end, and killing `mic-core` or `mic-battles` mid-battle resumes at the last turn. **Not run yet:** it needs M7's screen to play in the game (or a scripted client).

## Progress

- **Next step:** M7 (battle screen). Its hooks are in `firered/overworld.ts` (`battleStarted`, `battleTurn`, `battleEnded`; the player is locked while `battle` is set) and the link (`scriptBattle`, `battleChoice`). Then run the Done-when check (only when the user asks).
- **Build state:** `make contracts` + `make breaking` ✅, `make sqlc` ✅, `make maps` ✅, mic-core `go build` + `go vet` + `gofmt` ✅, SPA `tsc` ✅ + vite bundle ✅, `make text` + `make graphics` ✅. Nothing run against the stack.
- **Files:** contracts (`map.proto` `ClientNpc`, `world.proto` `YesNo`/`TrainerBattle`/`ScriptBattle`/`Script.npc`, `realtime.proto` 22, `view.proto` `BattleTrainer`); `tool-maps/internal/compile`; the room YAML; mic-core `internal/battle/*`, `internal/battles`, `internal/pokemon/{set,battle}.go` (test team uses `Set`), `internal/world/{battle,interact,maps,rules,zone,player,party,items,world}.go`, `realtime.go`, `main.go`, migration 00013, `queries/{battles,trainers}.sql`; SPA `world/{map,rules}.ts`, `realtime/connection.ts`, `firered/{overworld,npc-sprite,player-sprite,manifest}.ts`, `texts.json`; `Makefile`.
- **Gotchas for M7:** after `BattleEnded` LOST, a `Correction` to the respawn tile follows and the script is over (no `ScriptDone`). `BattleEnded` with no result = the battle couldn't start. A choice mic-core refuses (or a `Turn` that gave up) comes back as a `BattleTurn` with no events and the same request; if no answer comes, sending the same choice again is safe. `BattleView.trainer.defeat_text` is a `WORLD_TEXTS` key. Money in `BattleEnded` is what was won or lost. The test team's personalities and IVs changed (`Set.Create` seeds by species): only new trainers get the new ones.
