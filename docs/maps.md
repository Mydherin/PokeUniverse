# Maps

Maps are **plain text files** that the AI reads and edits directly. No visual editor is used.

## Overview

```
FireRed decompilation ──► [convert] ──► text maps ──► [compile] ──► runtime maps
   (binary, once)                      (AI edits)                  (client + server)
```

- **Once:** FireRed's maps are converted into our text format.
- **From then on:** the AI edits and extends the world only through the text files.
- **On build:** text maps are compiled into the runtime format.

## Why

- FireRed's map grids and tiles (`map.bin`, `metatiles.bin`) are **binary**: the AI can't read or edit them.
- FireRed's graphics are GBA-format; Phaser needs PNG tilesets and tile grids. Conversion is required anyway.
- Plain text lets the AI **understand** a map ("pond in the top-right") and **edit it precisely** ("extend the path two tiles east").

## Map Format

One YAML file per map.

```yaml
# maps/pallet_town.yaml
id: pallet_town
size: [20, 18]          # width, height in tiles
tileset: kanto_outdoor
legend:
  ".": grass
  ",": tall_grass
  "=": path
  "~": water
  "T": tree
  "H": house_small      # multi-tile object, anchored at its top-left
ground: |
  #   0         1
  #   01234567890123456789
  00  TTTTTTTTT==TTTTTTTTT
  01  T........==........T
  02  T..H.....==....H...T
  ...
overrides:
  - { at: [3, 5], tile: flower_red }
objects:
  - { type: npc, id: oak, at: [9, 10], facing: down }
  - { type: sign, id: pallet_sign, at: [7, 8] }
warps:
  - { at: [5, 4], to: player_house, spawn: entrance }
connections:
  north: route_1
encounters:
  tall_grass: pallet_grass
```

### Rules

- **One character = one tile.** The grid is exactly the map.
- **Row and column numbers** are written in the grid, so every coordinate is explicit.
- **Coordinates:** `[x, y]` = `[column, row]`, starting at `0` in the top-left.
- **Semantic legend:** characters mean terrain (`~` = water); the compiler picks the exact tile and edges (auto-tiling).
- **Multi-tile objects** (houses, big trees) use one character at their **top-left anchor**.
- **Overrides:** exact tiles for the rare cases auto-tiling can't express.
- **Collision is never written by hand:** it comes from the tile catalog.
- **Optional layers** only when needed (e.g. `overlay` for treetops or bridges drawn above the player).
- **Stable IDs** for maps, NPCs, warps and encounters; references always use IDs.

## Tile Catalog

Each tileset PNG has a YAML catalog that gives every tile a **name and properties**:

```yaml
# tilesets/kanto_outdoor.yaml
image: kanto_outdoor.png
tile_size: 16
tiles:
  water_center:      { index: 112, tags: [water], walkable: false, surfable: true }
  water_edge_north:  { index: 96,  tags: [water], walkable: false, surfable: true }
  tall_grass:        { index: 8,   tags: [grass], walkable: true, encounters: true }
autotile:
  water: { center: water_center, edge_north: water_edge_north, ... }
objects:
  house_small: { size: [5, 4], tiles: [...], door: [2, 3] }
```

- The compiler uses it for auto-tiling, collision and behavior (grass, water, ledges, doors).
- Built once per tileset; the AI labels tiles by viewing a **labeled preview** (each tile with its index drawn on it).

## Tools

All tools live in `tool-maps` (Go) and run from the command line.

| Command | Purpose |
|---|---|
| `convert` | **Once:** reads FireRed's decompilation (`map.json`, `map.bin`, tilesets) and writes text maps, PNG tilesets and catalogs |
| `validate` | Checks every map: valid IDs, warps lead somewhere, connections match, no object inside a wall, every area reachable |
| `compile` | Turns text maps into compact runtime maps for `spa-pokeuniverse` and `mic-core`, applying auto-tiling |
| `preview` | Renders any map (or a region of it) to PNG so the AI can check it visually |
| `catalog-preview` | Renders a tileset with tile indices drawn on it, for labeling |

- Runtime maps are **generated output**: never edited by hand.
- The client receives the visual layers; the server receives collision, warps, objects and encounters only.

## Workflow

How the AI creates or changes a map:

1. **Read** the map file (and its neighbors, if connections change).
2. **Edit** the text: grid, objects, warps, connections.
3. **Validate:** `tool-maps validate`. Fix every error.
4. **Compile:** `tool-maps compile`.
5. **Preview:** `tool-maps preview <map>` and look at the PNG.
6. **Adjust** until the result is correct, then repeat from step 3.

### Extending the World

- New areas are **new map files**, linked through `connections` (edges) or `warps` (doors, caves).
- Existing FireRed maps are edited the same way; there is no difference between converted and new maps.
- New terrain or objects need entries in the tile catalog first.
