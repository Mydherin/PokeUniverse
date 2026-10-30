# Phase 3: Single-Player World

**Goal:** walk through the world, with every move decided by the server.

## Scope

- Phaser renders compiled maps (pixel-perfect) with a camera following the player.
- Player sprite with walk and run animations.
- Server-authoritative grid movement and collisions.
- Warps between maps (doors, map edges).
- Position saved to Redis every tick and copied to PostgreSQL; after a crash the player continues on the same tile.
- Keyboard controls (desktop) and touch controls (mobile).
- Asset manifest so the presentation stays swappable.

## Done When

- A player walks between several maps smoothly on desktop and mobile.
- Restarting `mic-core` mid-walk puts the player back on their last tile.
