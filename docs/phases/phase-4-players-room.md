# Phase 4: Player's Room

**Goal:** the player appears in their room and walks, with every move decided by the server.

## Scope

- ✅ Create `tool-maps` map commands (Go CLI): `convert`, `validate`, `compile`, `tilesets`, `preview`, `catalog-preview`, `rename` ([maps.md](../maps.md)); tested on the player's room.
- Convert FireRed's maps into the text format, with FireRed's tilesets and their tile catalogs. ✅ the room (2F); the first floor is next.
- ✅ Phaser renders compiled maps (pixel-perfect) under the GBA screen, camera placed as in FireRed. CONTINUE and the end of New Game fade in from black into the trainer's map, with its music; `mic-core` keeps where the trainer is (New Game: the room, tile 6, 6, facing north). The camera follows the player.
- ✅ Player sprite (boy or girl) with walk and run animations; turning in place and bumping (with its sound) as in FireRed. Running follows the original: the room doesn't allow it, and the Running Shoes come later (story flags, Phase 5).
- ✅ Server-authoritative grid movement and collisions (walls, one-way tiles, elevation, stair tiles): the client predicts, `mic-core` checks every step and pace, and corrects ([Movement](../tech-stack.md#movement)).
- ✅ Objects in the room can be checked (A) and answer with the text box: signs, the NES, the PC (boot message; its menu comes with items), furniture by tile behavior; walking up to a signpost reads it.
- Warps between maps: the stairs lead down to the house's first floor.
- ✅ Position saved to Redis every tick and copied to PostgreSQL; after a crash the player continues on the same tile. One copy of the game plays a trainer at a time: another copy asks before taking it over.
- Keyboard controls (desktop) and touch controls (mobile).

## Done When

- The AI edits a text map, validates and compiles it, and checks the result as a PNG.
- After Oak's speech, the player walks around their room and down the stairs on desktop and mobile.
- Restarting `mic-core` mid-walk puts the player back on their last tile.
