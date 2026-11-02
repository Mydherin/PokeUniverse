# M7 The Battle Screen (FireRed, without move animations) ✅

Part of the [battles plan](README.md). **Needs:** M4's contracts (fake events are enough to start); M6 to play for real. Shared rules and context: [context.md](context.md).

**Read:** `game/gba/{video,sprites,palette,tasks,text}.ts` (APIs), `firered/overworld.ts` (`openScreen`), `firered/bag.ts` (modes), `firered/manifest.ts` (sets), and FireRed's `src/battle_transition.c`, `battle_intro.c`, `battle_bg.c`, `battle_interface.c`, `battle_controller_player.c`, `battle_controller_opponent.c`, `battle_message.c`, `battle_gfx_sfx_util.c` (behavior only).

- [x] Battle asset set (`BATTLE_GRAPHICS`, `loadBattle()`, with the party set): `battle_interface/`, the building terrain, `interface/text_pp.pal`, cool_trainer_m's front pic, Red's/Leaf's back pics; species back pics (`backPic(n)`) and battle coords (`SpeciesText.coords`) loaded per battle. Prefetched when a trainer's script starts (`prepareBattle`).
- [x] `game/battle/state.ts`: the art-free model; applies `BattleEvent`s as they're shown, holds the request, built from a `BattleView`.
- [x] Transition (intro gray flashes, `B_TRANSITION_ANGLED_WIPES`), terrain and intro (`BattleIntroSlide3`: the band opens, the terrain halves and trainers slide in), party balls (`PartySummary`), "<CLASS> <NAME> would like to battle!", foe sent out first (trainer walks off), the player's throw (back pic frames, ball arc, `se_ball_throw`), `PokeBalls.release` + cry, healthboxes sliding in.
- [x] Healthboxes: FireRed's tiles and offsets (name, gender, level, status icon and color, HP bar by pixel with `CalcNewBarValue`, the player's HP numbers following it, exp bar).
- [x] Action menu and move menu (PP colored by `GetCurrentPpToMaxPpState`, type name, category icon in place of "TYPE/" (D21)); 0 PP / disabled refused with FireRed's text; all disabled → Struggle.
- [x] Event playback (`playback.ts` + `messages.ts`): FireRed's strings per event (crit/effectiveness moved after the hit, `arrange`), hit blink + effectiveness sound, HP bars, faint cry + sink + `se_faint`, stat sounds, status icons, recall ("come back"/"withdrew"), "Go!" lines by the foe's HP, low HP sound.
- [x] Battle party menu (SHIFT, SUMMARY, CANCEL; forced; refusals "already in battle"/"no energy"), BAG in battle (`BagLocation.Battle`: ITEMS pocket → party target → `BattleChoice.item`), RUN refused in trainer battles.
- [x] `ItemUsed`: "<CLASS> <NAME> used <ITEM>!" / "<PLAYER> used <ITEM>!", its heal silent.
- [x] End: win (victory music, "Player defeated…", trainer slides back, defeat text, prize), loss (whiteout lines), fade, back to the field (map music; the script goes on after a win).
- [x] Music: script `music` step (`mus_encounter_boy` in the test trainer's intro), `mus_vs_trainer`, `mus_victory_trainer`; battle SEs in `sounds.json`; faint cries rendered (D15).
- [x] Mobile: same GBA screen and touch controls (nothing new needed).
- [x] **Done when:** the whole test battle is playable and readable, with placeholder hits instead of move animations. Played in the game on 2026-11-02 (intro, send-outs, moves, faints, forced switches, status, foe switches, BAG, whiteout, leaving mid-battle); the win ending wasn't reached.

## Progress

- **Played (2026-11-02), fixed:** the player's healthbox sat 16 px too high (FireRed makes it 64×32, then 64×64 without moving its center: `boxY`); the menu cursor used palette 1 (FireRed's `0x11` copies it as is: palette 0); a Pokémon showed before its ball opened (hidden until then); the foe's party balls never left (the slide-out loop used `some`); overworld characters lower on the map now draw in front (`world/scene.ts`).
- **Leaving mid-battle (D22):** `World.Leave` drops the battle unless the server is closing; bag items used are spent in memory, kept in `player:<id>:battle` (`spent`) and saved in the outcome transaction; `Join` re-spends them on resume.
- **Files:** SPA `firered/battle/{healthbox,scene,playback,screen}.ts`, `world/scene.ts`; mic-core `battle/active.go`, `world/{battle,world}.go`.
- **Not verified:** the win ending (victory music, prize, script after the win); BAG item use (M12).
- **Gotchas:** `{B_...}` placeholders reuse `FD xx` bytes with battle meanings: expand with `BattleTexts`, never `expandPlaceholders`. Showdown logs crit/effectiveness before `-damage` and the player's switch before the foe's: the playback reorders both. Healthbox sheets are mutated in place (the sprite reads the same array). Leaving for the bag/party resets the GBA: the scene is rebuilt from the state on return (`openScreen`). Trapped Pokémon: SHIFT has no refusal text yet. Gen 4-only conditions print FireRed strings with the move's name, or nothing (M12/M13). Screenshots in the browser pane slow the game (catch-up is capped): judge timing without them.
