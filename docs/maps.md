# Maps

Maps are **plain text files** that the AI reads and edits directly. No visual editor is used.

## Overview

```
FireRed decompilation ──► [convert] ──► lib-maps (text) ──► [compile] ──► runtime maps
   (input, once per map)                (AI edits, committed)             (client + server, gitignored)
                      └──► [tilesets] ──► tileset art (PNG, gitignored)
```

- **Once per map:** a FireRed map is converted into our text format.
- **From then on:** the AI edits and extends the world only through the text files in `lib-maps/`, which are **source code** (committed).
- **On build** (`make maps`): the text maps are validated and compiled into runtime maps, and FireRed's tilesets are rendered to PNG; both are generated output, never committed.

## Why

- FireRed's map grids and tiles (`map.bin`, `metatiles.bin`) are **binary**: the AI can't read or edit them.
- FireRed's graphics are GBA-format; the game needs PNG tilesets and tile grids. Conversion is required anyway.
- Plain text lets the AI **understand** a map ("pond in the top-right") and **edit it precisely** ("extend the path two tiles east").

## lib-maps

Shared by `spa-pokeuniverse` and `mic-core` through the compiled runtime maps.

| Folder | Holds |
|---|---|
| `maps/<id>.yaml` | One file per map: properties, grid (or a shared layout), connections, warps, objects |
| `layouts/<id>.yaml` | Grids shared by several maps (e.g. every Poké Center): tileset, size, border, legend, grids |
| `tilesets/<id>.yaml` | Tile catalogs: every tile's name and properties |

- **Scope:** Kanto only ([vision.md](vision.md)); the Sevii Islands and link rooms are never converted.

## Map Format

```yaml
# lib-maps/maps/pallet_town_players_house_2f.yaml
id: pallet_town_players_house_2f
type: indoor                # town, route, indoor, underground
region: pallet_town
music: mus_pallet
allow: [running]            # running, cycling, escaping
tileset: generic_building_1
size: [12, 9]               # width, height in tiles
border:                     # tiles drawn outside the map, as rows
  - [solid_008, solid_008]
  - [solid_008, solid_008]
legend:
  "#": solid_008
  ".": ground_001
  "`": down_left_stair_warp_007
  "}": television_053
  # ... one entry per character used
ground: |
  #   0         1
  #   012345678901
  00  #]%%/<%%%%%[
  01  #)>+@=&&|&&*
  02  #rgbcd,,$!`,
elevation: |                # optional: '.' = the tile's elevation, a hex digit sets it
  #   0         1
  #   012345678901
  00  ............
overrides:                  # optional: cells whose collision differs from the catalog
  - { at: [3, 5], walkable: true }
connections:
  north: route_1            # or { map: route_1, offset: 3 } when shifted along the edge
warps:
  - { id: 1f, at: [10, 2], to: pallet_town_players_house_1f, spawn: 2f }
objects:
  - { type: npc, id: mom, at: [5, 4], sprite: mom, movement: face_down, script: mom }
  - { type: sign, id: pc, at: [1, 1], script: pc }
  - { type: hidden_item, id: hidden_potion, at: [3, 22], item: potion, flag: hidden_item_viridian_forest_potion }
  - { type: trigger, id: oak_trigger_left, at: [12, 1], var: map_scene_pallet_town_oak, value: 0, script: oak_trigger_left }
```

### Rules

- **One character = one tile.** The grid is exactly the map.
- **Row and column numbers** are written in the grid, so every coordinate is explicit.
- **Coordinates:** `[x, y]` = `[column, row]`, starting at `0` in the top-left.
- **Legend:** each character names one catalog tile. Converted maps get light marks and lowercase letters for walkable tiles and heavy marks and capitals for blocked ones, so the grid shows where the player can go. Big maps go on with Latin-1, Greek, Cyrillic and Latin Extended letters (never `"`, `\` or space).
- **Shared layouts:** `layout: pokemon_center_1f` instead of a grid; the map keeps its own warps, objects and properties.
- **Collision and elevation come from the tile catalog;** `overrides` and the `elevation` grid only hold exceptions.
- **Warps:** named after where they lead; `spawn` is a warp ID of the destination map; `to: dynamic` returns to the previous map.
- **Objects:** `npc`, `sign` (checked with A), `hidden_item`, `trigger` (runs when stepped on). Scripts of the same map are written by name, shared ones as `scope.name` (`common.pkmn_center_nurse`).
- **Stable IDs** for maps, layouts, tiles, warps and objects: lowercase letters, digits and `_`; references always use IDs.
- **Canonical files:** commands that write files (`convert`, `rename`) use one layout and don't keep comments.
- **Planned, when new content needs them:** semantic terrain with auto-tiling, multi-tile objects anchored at their top-left, and encounter tables.

## Tile Catalog

Each tileset has a YAML catalog that gives every tile a **name and properties**:

```yaml
# lib-maps/tilesets/generic_building_1.yaml
id: generic_building_1
base: building              # its maps may also use every tile of building
firered: data/tilesets/secondary/generic_building_1   # art rendered from here
tiles:
  ground_643: { index: 643, walkable: true, elevation: 3 }
  impassable_south_644: { index: 644, walkable: true, elevation: 3, behavior: impassable_south }
  tall_grass_013: { index: 13, walkable: true, elevation: 3, behavior: tall_grass, encounter: land }
```

- **`index`** is the tile's frame in the tileset art (FireRed's metatile number: 0–639 for primary tilesets, 640+ for secondary ones).
- **Base:** FireRed pairs a primary tileset (shared) with a secondary one (per area); the secondary's catalog names the primary as its base. Names and indices are unique across a tileset and its base.
- **Behaviors** are the values of `TileBehavior` in `lib-contracts` `map.proto` (lowercase, no prefix): the contract is the single list.
- **Converted names say what a tile does:** `<behavior>_<index>`, or `ground_<index>` / `solid_<index>` for plain walkable / blocked tiles. Defaults (`walkable`, `elevation`) are what most Kanto cells use.
- **Labeling:** look at `catalog-preview`, then `rename` tiles to meaningful names (`solid_008` → `wall`); every map follows.
- **Art styles share tile names:** a public pack gets its own art with the same names, so text maps don't change when the art does ([Phase 10](phases/phase-10-pallet-town-art.md)).

## Tools

All tools live in `tool-maps/` (Go) and run from the command line: `make tool-maps CMD="<command> ..."`.

| Command | Purpose |
|---|---|
| `convert [--force] [map...]` | FireRed maps (FireRed names or our IDs; none = all of Kanto) to text maps, shared layouts and catalogs. **Keeps existing files** and reuses existing catalogs, so converting more maps never undoes edits; `--force` overwrites. Links to maps outside Kanto are left out |
| `validate` | Checks everything: syntax (unknown fields are errors), tiles and legend, grids, IDs, warps and spawns, reciprocal connections, object fields. **Warnings:** links to maps not written yet, walkable areas no warp or connection reaches, NPCs on blocked tiles |
| `compile` | Validates, then writes the runtime maps; any error stops it |
| `tilesets` | Renders every FireRed tileset of `lib-maps` to PNG (needs the submodule) |
| `preview <map>` | Renders a map to PNG with numbered rows and columns. `--region x,y,w,h`, `--scale n`, `--collision` (blocked tiles hatched red), `--objects` (warps and objects outlined) |
| `catalog-preview <tileset>` | Renders a tileset's tiles with their indices, for labeling |
| `rename <tileset> <from> <to>` | Renames a tile in its catalog and in every map and layout using it |

- `make maps` runs `tilesets` and `compile` (also part of `make assets`, so `make up` builds them). Previews go to `tool-maps/previews/` (gitignored).

### Outputs

Generated, gitignored, never edited by hand.

| Output | Where | Contents |
|---|---|---|
| Tileset art | `spa-pokeuniverse/public/firered/tilesets/<id>.png` and `<id>.above.png` | 16×16 frames, 16 per row, frame = tile index; `.above` is drawn over the player. A tileset with a base also holds the base's frames, drawn with its palettes |
| Client maps | `spa-pokeuniverse/public/maps/<id>.binpb` (served at `/maps/`) | `ClientMap`: size, tileset, tile per cell, border, connections, music, weather; walkable, elevation and behavior per cell, to predict movement; NPCs (ID, cell, sprite, facing: drawn, and blocking steps) |
| Server maps | `mic-core/maps/<id>.binpb` | `ServerMap`: walkable, elevation, behavior and encounter type per cell; connections, warps, objects, map rules |

- Both are Protocol Buffers messages of `pokeuniverse.map.v1` ([lib-contracts](tech-stack.md#lib-contracts)).
- Tile animations (water, flowers) are not rendered yet: tiles show their first frame.

## Workflow

How the AI creates or changes a map:

1. **Read** the map file (and its neighbors, if connections change; its layout, if it has one).
2. **Edit** the text: grid, legend, objects, warps, connections.
3. **Validate:** `make tool-maps CMD=validate`. Fix every error; read every warning.
4. **Preview:** `make tool-maps CMD="preview <map> --objects --collision"` and look at the PNG.
5. **Adjust** until the result is correct, then `make maps`.

### Extending the World

- New areas are **new map files**, linked through `connections` (edges) or `warps` (doors, caves).
- Existing FireRed maps are edited the same way; there is no difference between converted and new maps.
- New tiles need entries in the tile catalog first; new behaviors need a `TileBehavior` value in the contract.
