# Phase 4: Player's Room

**Goal:** the player appears in their room and walks, with every move decided by the server.

## Scope

- ✅ Create `tool-maps` map commands (Go CLI): `convert`, `validate`, `compile`, `tilesets`, `preview`, `catalog-preview`, `rename` ([maps.md](../maps.md)); tested on the player's room.
- Convert FireRed's maps into the text format, with FireRed's tilesets and their tile catalogs. ✅ the room (2F); the first floor is next.
- ✅ Phaser renders compiled maps (pixel-perfect) under the GBA screen, camera placed as in FireRed. CONTINUE and the end of New Game fade in from black into the trainer's map, with its music; `mic-core` keeps where the trainer is (New Game: the room, tile 6, 6). Next: the camera follows the player.
- Player sprite (boy or girl) with walk and run animations.
- Server-authoritative grid movement and collisions.
- Objects in the room can be checked (A) and answer with the text box.
- Warps between maps: the stairs lead down to the house's first floor.
- Position saved to Redis every tick and copied to PostgreSQL; after a crash the player continues on the same tile.
- Keyboard controls (desktop) and touch controls (mobile).

## Done When

- The AI edits a text map, validates and compiles it, and checks the result as a PNG.
- After Oak's speech, the player walks around their room and down the stairs on desktop and mobile.
- Restarting `mic-core` mid-walk puts the player back on their last tile.
