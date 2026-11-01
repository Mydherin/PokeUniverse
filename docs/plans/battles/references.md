# Battles: Reference Map

Part of the [battles plan](README.md). Behavior only, never copy code ([AGENTS.md](../../../AGENTS.md#reference-repositories)).

| Need | Where |
|---|---|
| Battle flow, turn order, scripts | `pokefirered/src/battle_main.c`, `battle_script_commands.c`, `data/battle_scripts_1.s` |
| Player and foe controllers (what the screen does per event) | `pokefirered/src/battle_controller_player.c`, `battle_controller_opponent.c` |
| Healthboxes, HP/exp bars | `pokefirered/src/battle_interface.c`, `graphics/battle_interface/` |
| Intro, terrain, transitions | `pokefirered/src/battle_intro.c`, `battle_bg.c`, `battle_transition.c`, `graphics/battle_terrain/`, `graphics/battle_transitions/` |
| Messages | `pokefirered/src/battle_message.c`; Gen 4: `pokeemerald-expansion/src/battle_message.c` |
| Animations | `pokefirered/data/battle_anim_scripts.s`, `src/battle_anim*.c`, `graphics/battle_anims/`; Gen 4: `pokeemerald-expansion/data/battle_anim_scripts.s` (`gBattleAnimMove_*`), `src/battle_anim_new.c` |
| AI | `pokefirered/data/battle_ai_scripts.s`, `src/battle_ai_script_commands.c`, `src/battle_ai_switch_items.c`; Gen 4: `pokeemerald-expansion/src/battle_ai_*.c`, `include/constants/battle_ai.h` |
| Party, summary | `pokefirered/src/party_menu.c`, `pokemon_summary_screen.c`, `graphics/party_menu/`, `graphics/summary_screen/` |
| Exp, level up, evolution | `pokefirered/src/battle_script_commands.c` (getexp), `pokemon.c`, `evolution_scene.c` |
| Trainers (classes, pics, AI flags, money) | `pokefirered/src/data/trainers.h`, `trainer_parties.h`, `graphics/trainers/` |
| Gen 4 rules and edge cases | `pokemon-showdown/data/mods/gen4/`, `sim/` (init the submodule first) |
| Gen 4 art for 387-493 | `pokeemerald-expansion/graphics/pokemon/<name>/` (`anim_front.png`, `back.png`, `normal.pal`, `shiny.pal`) |
