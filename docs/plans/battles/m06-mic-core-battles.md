# M6 Battles in `mic-core` and the Room Trainer ⬜

Part of the [battles plan](README.md). **Needs:** M4 (M5 for the real AI). Shared rules and context: [context.md](context.md).

**Read:** `internal/world/{zone,player,interact}.go`, `internal/realtime/realtime.go`, `internal/battles/battles.go`, `internal/live/live.go`, `lib-maps/maps/pallet_town_players_house_2f.yaml`, `docs/maps.md` (objects), `tool-maps` compile for objects.

- [ ] NPCs in maps: compile `npc` objects into `ClientMap`/`ServerMap`; NPCs block movement (server `rules.go` and client `rules.ts`); A on an NPC runs its script (before signs, as FireRed); the NPC turns to face the player.
- [ ] Client: NPC sprites in the overworld (`world/scene.ts`, `firered/` object event art: `cooltrainer_m.png` + palette), standing and facing.
- [ ] Room: `- { type: npc, id: test_trainer, at: [9, 4], sprite: cooltrainer_m, movement: face_down, script: test_trainer }` (D13). Validate, compile and preview it.
- [ ] Script steps: `YesNo` and `StartBattle{trainer}` (the zone asks `internal/battle` to start one, and the script continues after the battle).
- [ ] `internal/battle`: the trainer table (`test_trainer`: COOLTRAINER class, name, intro, defeat and victory texts, money ×, AI flags = gym-leader set, team Lv 50: GENGAR (Shadow Ball, Sludge Bomb, Hypnosis, Destiny Bond), GYARADOS (Waterfall, Dragon Dance, Ice Fang, Earthquake), SCIZOR (Bullet Punch, X-Scissor, Swords Dance, Roost), TYRANITAR (Stone Edge, Crunch, Earthquake, Fire Blast), TOGEKISS (Air Slash, Aura Sphere, Thunder Wave, Roost), INFERNAPE (Close Combat, Fire Punch, Mach Punch, U-turn; Flare Blitz is Lv 57), checked against learnsets, items: 2 HYPER POTION). The flags and items go in `BattleTeam.ai_flags` and `items` (M5).
- [ ] Active battle per player in Redis (`player:<id>:battle`); `BattleChoice` handling (turn check, item ownership; a bag item is spent in PostgreSQL once `mic-battles` confirms the turn, before the turn is shown); retries to `mic-battles` with the same turn.
- [ ] Outcome transaction keyed by battle ID: party HP/PP/status/exp/level/stats, money won or lost (FireRed's whiteout amount), `battle_outcomes` row. Whiteout: healed party, back in the room.
- [ ] The snapshot's `battle` for resume; the zone blocks moves and interactions while in battle.
- **Done when:** talking to the test trainer starts a battle that plays to the end, and killing `mic-core` or `mic-battles` mid-battle resumes at the last turn.

## Progress

Not started. While 🚧: tasks ticked above, then here the exact next step, files touched, build state, gotchas.
