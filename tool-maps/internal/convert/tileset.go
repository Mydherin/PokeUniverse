package convert

import (
	"fmt"
	"path/filepath"

	"pokeuniverse/tool-maps/internal/firered"
	"pokeuniverse/tool-maps/internal/format"
	"pokeuniverse/tool-maps/internal/validate"
	"pokeuniverse/tool-maps/internal/world"
)

// tileset returns the catalog of a FireRed tileset: the one in lib-maps if it exists (its
// names may have been edited), else a new one with every metatile named after what it does.
func (c *converter) tileset(symbol, base string, stats cellStats) (*tileset, error) {
	dir, ok := c.dirs[symbol]
	if !ok {
		return nil, fmt.Errorf("tileset %s not found in the decompilation", symbol)
	}
	id := filepath.Base(dir)
	if t, ok := c.tilesets[id]; ok {
		if t.catalog.Base != base {
			return nil, fmt.Errorf("tileset %s is used with both %q and %q as base", id, t.catalog.Base, base)
		}
		return t, nil
	}
	source, err := c.Decomp.LoadTileset(dir)
	if err != nil {
		return nil, err
	}
	t := &tileset{source: source, byIndex: map[int]string{}}
	if source.Secondary {
		t.first = firered.PrimaryMetatiles
	}
	if path := filepath.Join(c.Out, world.TilesetsDir, id+".yaml"); world.Exists(path) && !c.Force {
		if t.catalog, err = format.ReadTileset(path); err != nil {
			return nil, err
		}
		if t.catalog.Base != base {
			return nil, fmt.Errorf("%s has base %q, but FireRed pairs it with %q", path, t.catalog.Base, base)
		}
	} else {
		t.catalog = c.newCatalog(id, base, dir, source, stats[symbol], t.first)
	}
	for name, tile := range t.catalog.Tiles {
		t.byIndex[tile.Index] = name
	}
	c.tilesets[id] = t
	return t, nil
}

func (c *converter) newCatalog(id, base, dir string, src *firered.Tileset, stats map[int]*usage, first int) *format.Tileset {
	cat := &format.Tileset{ID: id, Base: base, FireRed: dir, Tiles: map[string]format.Tile{}}
	for local := range src.Count() {
		tile := format.Tile{Index: first + local}
		tile.Walkable, tile.Elevation = stats[local].defaults()
		if name := c.behaviors[src.Behavior(local)]; name != "normal" {
			if _, ok := validate.Behavior(name); ok {
				tile.Behavior = name
			} else {
				c.Log("%s tile %d: behavior %q is not in the contract, written as a plain tile", id, tile.Index, name)
			}
		}
		switch src.Encounter(local) {
		case firered.EncounterLand:
			tile.Encounter = format.EncounterLand
		case firered.EncounterWater:
			tile.Encounter = format.EncounterWater
		}
		cat.Tiles[tileName(tile)] = tile
	}
	return cat
}

// tileName is a first name to label later: what the tile does and its index ("tall_grass_013",
// "ground_001" for plain walkable tiles, "solid_002" for plain blocked ones).
func tileName(t format.Tile) string {
	kind := t.Behavior
	switch {
	case kind != "":
	case t.Walkable:
		kind = "ground"
	default:
		kind = "solid"
	}
	return fmt.Sprintf("%s_%03d", kind, t.Index)
}
