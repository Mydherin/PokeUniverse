# M7 The Battle Screen (FireRed, without move animations) ⬜

Part of the [battles plan](README.md). **Needs:** M4's contracts (fake events are enough to start); M6 to play for real. Shared rules and context: [context.md](context.md).

**Read:** `game/gba/{video,sprites,palette,tasks,text}.ts` (APIs), `firered/overworld.ts` (`openScreen`), `firered/bag.ts` (modes), `firered/manifest.ts` (sets), and FireRed's `src/battle_transition.c`, `battle_intro.c`, `battle_bg.c`, `battle_interface.c`, `battle_controller_player.c`, `battle_controller_opponent.c`, `battle_message.c`, `battle_gfx_sfx_util.c` (behavior only).

- [ ] Battle asset set in the manifest, loaded when the first battle starts: `battle_interface/`, `battle_terrain/` (building for the house), `battle_transitions/`, `trainers/front_pics` (cool_trainer_m) and `back_pics` (red/leaf with throw frames), balls, `battle_anims/` (for M8). Species front/back loaded per battle.
- [ ] `game/battle/state.ts`: the art-free model; applies `BattleEvent`s, holds the request, replays a `BattleView` on resume.
- [ ] Transition (the trainer's), terrain and intro: the bases slide in, trainer pics, "<CLASS> <NAME> would like to battle!", the trainer slides out, the ball throw and send-out (`se_ball_open`, cry), the player's back pic throwing, healthboxes sliding in.
- [ ] Healthboxes: name, gender, level, status icon, HP bar draining by pixel with colors, exact HP numbers for the player, exp bar; the foe's party balls (`party_summary_bar`) at the start.
- [ ] Action menu FIGHT / BAG / POKéMON / RUN ("What will <MON> do?"); move menu with PP, TYPE and the category icon (D10); disabled or 0-PP moves refused with FireRed's text.
- [ ] Event playback queue: each event → text (text speed option) + sound + general animation (hit flash or shake, faint slide with the faint cry, stat arrows, status), effectiveness sounds (`se_effective`, `se_super_effective`, `se_not_effective`).
- [ ] Battle party screen (M3 in battle mode: SHIFT, SUMMARY, CANCEL; forced switch); BAG in battle mode (BATTLE-usable items, `UseItem` → `BattleChoice.item`); RUN: "No! There's no running from a TRAINER battle!".
- [ ] `ItemUsed` (M5): "<TRAINER> used <ITEM>!" for the foe, then its effect events (`Heal`, `StatusCured`… with `from` = the item).
- [ ] End: the foe trainer slides back in with the defeat text, `mus_victory_trainer`, "<PLAYER> got ¥X for winning!", fade to the room. Whiteout text and fade.
- [ ] Music: `mus_encounter_*` when the trainer talks, `mus_vs_trainer`, `mus_victory_trainer`; new entries in `sounds.json` (+ `make audio`), faint cries (D15).
- [ ] Mobile: same GBA screen, touch controls (existing A/B/D-pad).
- **Done when:** the whole test battle is playable and readable, with placeholder hits instead of move animations.

## Progress

Not started. While 🚧: tasks ticked above, then here the exact next step, files touched, build state, gotchas.
