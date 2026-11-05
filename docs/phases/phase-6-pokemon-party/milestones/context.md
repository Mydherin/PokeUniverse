# Pokémon and Party: Shared Context

Part of [Phase 6](../phase-6-pokemon-party.md). Open only the section a step needs. Commands, the client engine and Phase 5's decisions are in [Phase 5's context](../../phase-5-battle-system/milestones/context.md): open it by section, don't repeat it here.

## Playing a Milestone

The user asked for this phase to be tested in the game (2026-11-04), so **a milestone closes only once played**. Nothing left from a test is committed, except test content marked as below.

1. **Build:** `make contracts` and `make breaking` if a contract changed; `mic-core` build + vet; SPA typecheck and bundle; `mic-battles` build if touched ([commands](../../phase-5-battle-system/milestones/context.md#commands)). Then a Docker rebuild of what changed; when in doubt `docker compose up -d --build mic-battles mic-core spa-pokeuniverse` (seconds if nothing changed): an old image looks like a bug.
2. **Play** the milestone's **Play it** list in the game, with the browser pane. Write what passed and what didn't in its file.
3. **Regression check**, about 5 minutes, after every milestone:
   - POKéMON: SWITCH, GIVE, TAKE, SUMMARY with move SWITCH.
   - BAG: USE, TOSS, an item that isn't for now. PC: WITHDRAW and DEPOSIT an item.
   - A battle against the room's trainer: a potion from the bag, a win, exp. `docker compose restart mic-core` mid-battle resumes it; a reload drops it, with the items used back in the bag ([Phase 5 D22](../../phase-5-battle-system/milestones/context.md#decisions)).
   - Walk, take the stairs and SAVE; a reload shows the same state.
4. **Fix** what fails before closing, then cut the file down to what later milestones use.

**Playing fast** (found in M1; saves most of the session):

- **Account:** the browser pane is signed in as account 2 (trainer AA, the test team). Account 8 is someone else's: leave it alone.
- **Back up first:** `pg_dump --data-only -t trainers -t trainer_items -t trainer_pc_items -t trainer_pokemon` into the scratchpad.
- **Edit the save only with the game closed:** go to `/`, wait 15 s, change the rows, open `/play`. The server keeps the party in memory while you're connected, and writes position and play time a moment after the game closes: a restore 3 s after closing lost them.
- **Restoring:** load the dump into temp tables (`create temp table t (like public.t) on commit drop`, `COPY public.` → `COPY pg_temp.`), then replace only account 2's item, PC and Pokémon rows and update its `trainers` row (deleting that row could cascade). Then diff a new dump against the backup, both sorted: row order changes.
- **Keys:** `javascript_tool` with `dispatchEvent(new KeyboardEvent('keydown'/'keyup', {code}))` on `window` works and is far shorter than `computer` key calls. Hold 50 ms to press, about 280 ms per step to walk. A call is cut at 45 s. `code`: arrows, `KeyZ` A, `KeyX` B, `Enter` Start.
- **Reaching the game:** `http://localhost:8080/play` takes 30 to 60 s to load, and presses before that are lost: screenshot until the intro or title shows. Then A until the field, about 3 s apart, looking first: from the title only two are needed, and a third acts on the world. Never press Down on that menu: NEW GAME is below CONTINUE.
- **Walking:** a press in a new direction only turns the player: add one press per direction change.
- **Test TMs** (game closed, account 2, removed by the restore): `insert into trainer_items values (2,2,1,364,1),(2,4,0,294,3),(2,4,1,301,2),(2,4,2,314,2),(2,4,3,339,1),(2,4,4,341,1)`. From the field: Start, Down twice, A, Right, Down, A, A opens the TM CASE; A, A on a TM opens "Teach which POKéMON?".
- **Commands:** `docker compose exec -T postgres psql -U pokeuniverse -d pokeuniverse`, written out each time (zsh doesn't split a variable into words).
- **Screenshots at `scale: 0.4`** are enough to read everything. After a message that spends the last of a stack, the bag's list shifts up under the cursor: check the item before pressing.
- **Room:** the PC is at (1,1), the player starts below it at (1,2); the trainer at (9,4) (stand at (9,5), face up); the stairs at (10,2): from (11,2) press Left twice. Don't go up at (11,2): that's the sign.
- **The trainer heals both teams before each battle and has 6 at level 50.** Hurt yourself inside the battle to test a potion. For a quick win, raise the lead in the DB (Garchomp: level 90, exp 911250) and revert it after; on "Will AA change POKéMON?" press B. Garchomp alone wins in about 5 minutes: Dragon Claw on Gengar (Levitate), Gyarados and Togekiss (twice), Earthquake on the rest. Infernape can switch out and come back. To see friendship move too, set exp just under the next level.
- **The trainer's battle is double** when the first two Pokémon can both fight. Quickest win (about 6 minutes): a Lv 100 Charizard and Garchomp Lv 90 out. A Pokémon switched out on turn 1 still shares the exp, so a bench Pokémon just under an evolution level covers the battle's level up and evolution.
- **Pressing A in a loop finishes a battle hands-free, with care:** the battle menu remembers its cursor, so after using the BAG it spends items, and after the win it starts another battle with the trainer. Press FIGHT by hand first and screenshot every 40 s. A also re-reads a sign: press it once, then look.
- **One run covers most of the regression:** raise the lead, toss in the battle, win, walk to the PC, take the stairs, SAVE on 1F, reload.
- **The original, fast** (`make emulator` opens your own browser: to use the pane, run its `docker run` line from `make -n emulator` and go to `http://localhost:8090/`). `tool-emulator/states/potion-party-menu.state` (gitignored) is the party menu with a Potion and a Pikachu at 50/100: fetch it and `EJS_emulator.gameManager.loadState(new Uint8Array(buffer))`. Keys: `gameManager.simulateInput(0, button, 1 or 0)`, hold 120 ms; A 8, B 0, Start 3, Up 4, Down 5, Left 6, Right 7. `toggleFastForward(1)` with A pressed about 105 times takes `oak.state` to the first room.
- **TMs in the original:** patch the fetched `potion-party-menu.state` before `loadState`. IWRAM at byte `0x19010`, WRAM at `0x21010`. Pointers at IWRAM `+0x5008` (save block 1) and `+0x500c` (save block 2), minus `0x2000000` for a WRAM offset. Key: u16 at block 2 `+0xF20`. Slots are u16 item, u16 quantity XOR key: key items at block 1 `+0x3b8` (TM CASE 364), TMs at `+0x464` (TM06 294, TM26 314). After loading: B (bag), Right, A, A opens the TM CASE; A, A on a TM, then A on Pikachu starts the scene (it knows only move 85; personality and OT id 0 make it shiny, so its colors differ from ours).
- **Comparing a scene frame by frame:** in `requestAnimationFrame`, `drawImage` the canvas into a 240x160 canvas every 33 ms, then draw the frames as a sheet over the page and screenshot it. The image's source rect: ours (960, 640) at (32, 64) of its 1024x768 canvas; the emulator's (2048, 1365) at (0, 85.5). For timing, log one background pixel per frame instead of judging by eye.
- **Any Pokémon in the original:** patch `getState()`'s bytes and `loadState` them. WRAM starts at byte `0x21010` (a 16-byte `RASTATE` header, then mGBA's `0x21000`); `gPlayerParty` at WRAM `0x24284` and the count at WRAM `0x24029` (add `0x21010` for the byte). With personality and OT id 0 the data isn't encrypted, the order is Growth, Attacks, EVs, Misc, and the checksum at +28 is the sum of its 48 bytes' u16s. Flags byte +19 = 2, level +84, HP +86, max HP +88.

**Test content:** team, bag and box additions needed to play go in `pokemon/testteam.go` and `world/testbag.go`, each with the `// Test content (phase-6): removed in Phase 10` comment ([Phase 5 D13](../../phase-5-battle-system/milestones/context.md#decisions)). Levels changed only for one test are reverted.

## Code Map

Items used on a Pokémon, so a milestone starts from `grep -n` and not from reading these files. All touched by M1-M3.

| Where | What |
|---|---|
| `mic-core/internal/world/party.go` `usePartyItem` | The switch by `FieldUse`, the transaction, the answer. New item kind: a `case` here |
| `mic-core/internal/item/use.go` `uses`, `PokemonEffect`, `SpendOnPokemon` | What USE answers, which items act on a Pokémon, what's spent |
| `mic-core/internal/pokemon/item.go` | The effects: `UseItem`, `RareCandy`, `TeachMachineMove`, `changeFriendshipByItem` |
| `firered/party-menu.ts` (1,500 lines) | `chooseToUse`, `useItem`, `teach`, `learnNext`, `askToReplaceMove`, `afterForgetScreen`, `displayData`, `description`, `Resume`, `showStdMessage` |
| `firered/use-item-scene.ts` | `run`, `runMachine`, `forgetMove`, `itemOnMon`, `zoomTo`, `say` |
| `firered/tm-case.ts`, `bag.ts`, `berry-pouch.ts` `onResult` | PARTY_MENU opens the party menu, then back |
| `firered/texts.json`, `sounds.json`, `manifest.ts` | New strings (`make text`), sounds (`make audio`, both the JSON and the manifest's list), graphics |

## Decisions

| # | Decision | Why |
|---|---|---|
| D1 | **One way to use an item on a Pokémon:** one `party.v1` intent (`UsePartyItem`: item, slot, move slot when asked), one answer, whatever the item. M2 and M3 add outcomes, not messages. | New items cost a table entry |
| D2 | **Effects are data first:** `mic-core` applies `ItemInfo.effect` from the catalog, the same data the client's `itemWorksOn` and `mic-battles` read. A strategy table by `FieldUse`, like `item/use.go`, holds what data can't say. | No second list of what each item does |
| D3 | **Server decides, in one transaction:** party and bag saved together by the zone's `transact`, or nothing changes. The client's `itemWorksOn` only picks the message; a refusal comes from `mic-core`. | Server-authoritative; no spent item without its effect |
| D4 | **Reuse, don't fork, Phase 5's growth:** level up, learning and evolution stay one code path. Extract what's battle-bound from `battle/level-up.ts`, `learn.ts`, `evolution.ts` without changing what battles do. | No regression in battles, one behavior |
| D5 | **Catalogs stay the source:** TM and tutor learnsets are converted once by a script under `infra/pokemon/` (like `evolutions.mjs`), then the proto is what we edit. | Same rule as every catalog ([AGENTS.md](../../../../AGENTS.md#reference-repositories)) |
| D6 | **A party and a box are the same row:** `trainer_pokemon` gets a `box` column (0 = party, 1-14 = boxes) rather than a second table; moving a Pokémon is an update. | One store, one shape; every party query must filter `box = 0` |
| D7 | **The room's PC also opens BILL'S PC,** which FireRed's bedroom PC doesn't, because there's no Pokémon Center until Phase 12. Pokémon Centers' PCs share the screen; revisit the bedroom's menu in Phase 10. | Boxes can be used and tested now; the phase file asks for it |
| D8 | **`mic-core` owns the follower:** it says which Pokémon follows (`Avatar`) and where (the tile the player left); the client animates it and predicts like the player. | Server-authoritative; Phase 8 shows it to others with no new design |
| D9 | **The follower only walks behind:** no talking to it, no mood, no riding. | The [vision](../../../vision.md) asks for walking behind; add more only if the user asks |
