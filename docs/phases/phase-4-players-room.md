# Phase 4: Player's Room

**Goal:** the player appears in their room, walks with every move decided by the server, and uses the START menu and their PC like in FireRed.

## Scope

- ✅ Create `tool-maps` map commands (Go CLI): `convert`, `validate`, `compile`, `tilesets`, `preview`, `catalog-preview`, `rename` ([maps.md](../maps.md)); tested on the player's room.
- Convert FireRed's maps into the text format, with FireRed's tilesets and their tile catalogs. ✅ the room (2F); the first floor is next.
- ✅ Phaser renders compiled maps (pixel-perfect) under the GBA screen, camera placed as in FireRed. CONTINUE and the end of New Game fade in from black into the trainer's map, with its music; `mic-core` keeps where the trainer is (New Game: the room, tile 6, 6, facing north). The camera follows the player.
- ✅ Player sprite (boy or girl) with walk and run animations; turning in place and bumping (with its sound) as in FireRed. Running follows the original: the room doesn't allow it, and the Running Shoes come later (story flags, Phase 5).
- ✅ Server-authoritative grid movement and collisions (walls, one-way tiles, elevation, stair tiles): the client predicts, `mic-core` checks every step and pace, and corrects ([Movement](../tech-stack.md#movement)).
- ✅ Objects in the room can be checked (A) and answer with the text box: signs, the NES, the PC (boot message), furniture by tile behavior; walking up to a signpost reads it.
- ✅ **START menu** like FireRed, with the entries it shows at this point: BAG, the player's name, SAVE, OPTION, EXIT (POKéDEX and POKéMON appear later, by story flags). Help bar for the selected entry, cursor (remembered), sounds and closing as in the original; the player can't move while it's open. Screens it opens fade out of the world and back into it with the menu open.
  - **BAG:** the ITEMS, KEY ITEMS and POKé BALLS pockets, with switching, scrolling, item description and icon, and each item's actions (USE, GIVE, TOSS, REGISTER…) with quantity selection; using an item answers as FireRed does with no Pokémon yet.
  - ✅ **Player (Trainer Card):** name, ID No., money, play time and badges, front and back with the flip, boy or girl version. Each New Game gets a random trainer ID (ID No. = its low 16 bits) and ¥3000, saved in PostgreSQL. Badges, stars and the back's records appear with what earns them. Play time counts while the trainer is in the world: `mic-core` counts real time and saves it with the position; the client counts on frame by frame from each world snapshot.
  - **SAVE:** FireRed's dialog with the save stats (player, badges, Pokédex, time) and YES/NO; YES makes `mic-core` save the trainer to PostgreSQL right away.
  - **OPTION:** text speed, battle scene, battle style, sound, button mode and frame, saved per trainer in PostgreSQL. Text speed and frame apply to every text box and window, sound and button mode now; battle options are kept for [Phase 9](phase-9-battles.md).
- **Bedroom PC** after the boot message: ITEM STORAGE (WITHDRAW ITEM, DEPOSIT ITEM, TOSS ITEM), MAILBOX (empty) and TURN OFF, with FireRed's screens, texts and sounds. It starts with one POTION, like the original.
- **Items, minimal model:** bag pockets, PC item storage and money (starts at 3000) per trainer in PostgreSQL; `mic-core` decides every change ([Phase 10](phase-10-world-content.md) adds the rest of the items and their effects).
- Warps between maps: the stairs lead down to the house's first floor.
- ✅ Position saved to Redis every tick and copied to PostgreSQL; after a crash the player continues on the same tile. One copy of the game plays a trainer at a time: CONTINUE (or New Game) in a new copy takes it over, and the old copy stops with a dialog that only goes back home.
- Keyboard controls (desktop) and touch controls (mobile).

## Done When

- The AI edits a text map, validates and compiles it, and checks the result as a PNG.
- After Oak's speech, the player walks around their room and down the stairs on desktop and mobile.
- In the room, every START menu entry and the PC work like in FireRed: withdraw the POTION, see it in the BAG, deposit or toss it; change the options and see them applied; save; read the Trainer Card.
- Items, money and options survive a reload and a `mic-core` restart.
- Restarting `mic-core` mid-walk puts the player back on their last tile.
