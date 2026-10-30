# Phase 4: Player's Room

**Goal:** the player appears in their room and walks, with every move decided by the server.

## Scope

- Create `tool-maps` map commands (Go CLI): `convert`, `validate`, `compile`, `preview`, `catalog-preview` ([maps.md](../maps.md)).
- Convert FireRed's maps into the text format, with FireRed's tilesets and their tile catalogs.
- Phaser renders compiled maps (pixel-perfect) with a camera following the player.
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
