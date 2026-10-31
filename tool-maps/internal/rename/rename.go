// Package rename renames a tile in its catalog and in every map and layout that uses it,
// so tiles can be labeled ("solid_042" → "pc") without breaking any map.
package rename

import (
	"fmt"
	"regexp"

	"pokeuniverse/tool-maps/internal/format"
	"pokeuniverse/tool-maps/internal/world"
)

var ident = regexp.MustCompile(`^[a-z0-9][a-z0-9_]*$`)

// Tile renames a tile and returns how many files changed.
func Tile(w *world.World, tilesetID, from, to string) (int, error) {
	t, ok := w.Tilesets[tilesetID]
	if !ok {
		return 0, fmt.Errorf("tileset %q does not exist", tilesetID)
	}
	tile, ok := t.Tiles[from]
	if !ok {
		return 0, fmt.Errorf("tileset %s has no tile %q", tilesetID, from)
	}
	if !ident.MatchString(to) {
		return 0, fmt.Errorf("%q: names are lowercase letters, digits and _", to)
	}
	for _, id := range w.TilesetIDs() {
		if p, err := w.Palette(id); err == nil && includes(p, tilesetID) {
			if _, taken := p.Tile(to); taken {
				return 0, fmt.Errorf("a tile named %q already exists in tileset %s or its bases", to, id)
			}
		}
	}
	// Grids that can use the tile: those whose tileset is it or builds on it.
	var grids []*format.Grid
	var saves []func() error
	for _, id := range w.LayoutIDs() {
		l := w.Layouts[id]
		uses, err := usesTileset(w, l.Tileset, tilesetID)
		if err != nil {
			return 0, fmt.Errorf("layout %s: %w", id, err)
		}
		if uses {
			grids = append(grids, &l.Grid)
			saves = append(saves, func() error { return format.WriteLayout(w.LayoutFile(id), l) })
		}
	}
	for _, id := range w.MapIDs() {
		m := w.Maps[id]
		if m.Layout != "" {
			continue
		}
		uses, err := usesTileset(w, m.Tileset, tilesetID)
		if err != nil {
			return 0, fmt.Errorf("map %s: %w", id, err)
		}
		if uses {
			grids = append(grids, &m.Grid)
			saves = append(saves, func() error { return format.WriteMap(w.MapFile(id), m) })
		}
	}
	delete(t.Tiles, from)
	t.Tiles[to] = tile
	changed := 1
	if err := format.WriteTileset(w.TilesetFile(tilesetID), t); err != nil {
		return 0, err
	}
	for i, g := range grids {
		if !replace(g, from, to) {
			continue
		}
		if err := saves[i](); err != nil {
			return changed, err
		}
		changed++
	}
	return changed, nil
}

// usesTileset tells whether a grid's palette includes the tileset.
func usesTileset(w *world.World, gridTileset, tilesetID string) (bool, error) {
	p, err := w.Palette(gridTileset)
	if err != nil {
		return false, err
	}
	return includes(p, tilesetID), nil
}

func includes(p *world.Palette, tilesetID string) bool {
	for _, t := range p.Tilesets {
		if t.ID == tilesetID {
			return true
		}
	}
	return false
}

func replace(g *format.Grid, from, to string) bool {
	changed := false
	for k, v := range g.Legend {
		if v == from {
			g.Legend[k], changed = to, true
		}
	}
	for _, row := range g.Border {
		for i, v := range row {
			if v == from {
				row[i], changed = to, true
			}
		}
	}
	return changed
}
