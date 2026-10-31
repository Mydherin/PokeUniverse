package world

import (
	"errors"
	"fmt"
	"strconv"

	"pokeuniverse/tool-maps/internal/format"
)

// Tile is a catalog tile with the name and tileset it comes from.
type Tile struct {
	format.Tile
	Name    string
	Tileset string
}

// Palette is every tile a map can use: its tileset's and those of its bases.
type Palette struct {
	Tilesets []*format.Tileset // the map's tileset first, then its bases
	byName   map[string]Tile
}

func (p *Palette) Tile(name string) (Tile, bool) {
	t, ok := p.byName[name]
	return t, ok
}

// Palette builds the tile palette of a tileset. Names and indices must be unique across it.
func (w *World) Palette(id string) (*Palette, error) {
	p := &Palette{byName: map[string]Tile{}}
	indices := map[int]string{}
	var errs []error
	for seen := map[string]bool{}; id != ""; {
		if seen[id] {
			return nil, fmt.Errorf("tileset %q: its bases form a loop", id)
		}
		seen[id] = true
		t, ok := w.Tilesets[id]
		if !ok {
			return nil, fmt.Errorf("tileset %q does not exist", id)
		}
		p.Tilesets = append(p.Tilesets, t)
		for name, tile := range t.Tiles {
			if other, dup := p.byName[name]; dup {
				errs = append(errs, fmt.Errorf("tile %q is in both %s and %s", name, other.Tileset, id))
			}
			if other, dup := indices[tile.Index]; dup {
				errs = append(errs, fmt.Errorf("tiles %q and %q share index %d", other, name, tile.Index))
			}
			p.byName[name] = Tile{Tile: tile, Name: name, Tileset: id}
			indices[tile.Index] = name
		}
		id = t.Base
	}
	return p, errors.Join(errs...)
}

// Resolved is a map with every cell worked out.
type Resolved struct {
	Map      *format.Map
	Grid     *format.Grid
	GridFile string
	Palette  *Palette
	Width    int
	Height   int
	// Per cell, row by row.
	Tiles     []Tile
	Elevation []int
	Walkable  []bool
	Border    [][]Tile
}

func (r *Resolved) In(p format.Point) bool {
	return p.X() >= 0 && p.Y() >= 0 && p.X() < r.Width && p.Y() < r.Height
}

func (r *Resolved) Index(p format.Point) int { return p.Y()*r.Width + p.X() }

// Resolve turns a map's grid, legend, elevation and overrides into cells.
// Every problem found is returned together; they belong to GridFile. With errors, the cells
// are incomplete but the result is still returned when the size is known, for further checks.
func (w *World) Resolve(m *format.Map) (*Resolved, error) {
	g, file, err := w.GridOf(m)
	if err != nil {
		return nil, err
	}
	r := &Resolved{Map: m, Grid: g, GridFile: file, Width: g.Size.X(), Height: g.Size.Y()}
	if r.Width <= 0 || r.Height <= 0 {
		return nil, fmt.Errorf("size %v must be positive", g.Size)
	}
	if r.Palette, err = w.Palette(g.Tileset); err != nil {
		return nil, err
	}
	var errs []error
	fail := func(format string, args ...any) { errs = append(errs, fmt.Errorf(format, args...)) }

	legend := map[rune]Tile{}
	for key, name := range g.Legend {
		if !format.IsCellChar(key) {
			fail("legend key %q must be one visible character other than \" and \\", key)
			continue
		}
		tile, ok := r.Palette.Tile(name)
		if !ok {
			fail("legend %q: tile %q is not in tileset %s or its bases", key, name, g.Tileset)
			continue
		}
		legend[[]rune(key)[0]] = tile
	}
	n := r.Width * r.Height
	r.Tiles, r.Elevation, r.Walkable = make([]Tile, n), make([]int, n), make([]bool, n)
	rows, err := format.ParseGrid(g.Ground, r.Width, r.Height)
	if err != nil {
		fail("ground: %v", err)
	}
	for y, row := range rows {
		for x, c := range row {
			tile, ok := legend[c]
			if !ok {
				fail("ground [%d, %d]: %q is not in the legend", x, y, c)
				continue
			}
			i := y*r.Width + x
			r.Tiles[i], r.Elevation[i], r.Walkable[i] = tile, tile.Elevation, tile.Walkable
		}
	}
	if g.Elevation != "" {
		levels, err := format.ParseGrid(g.Elevation, r.Width, r.Height)
		if err != nil {
			fail("elevation: %v", err)
		}
		for y, row := range levels {
			for x, c := range row {
				if c == '.' {
					continue
				}
				v, err := strconv.ParseInt(string(c), 16, 8)
				if err != nil {
					fail("elevation [%d, %d]: %q must be '.' or a hex digit", x, y, c)
					continue
				}
				r.Elevation[y*r.Width+x] = int(v)
			}
		}
	}
	seen := map[format.Point]bool{}
	for _, o := range g.Overrides {
		switch {
		case !r.In(o.At):
			fail("override %v is outside the map", o.At)
		case seen[o.At]:
			fail("override %v is set twice", o.At)
		case o.Walkable == nil:
			fail("override %v changes nothing", o.At)
		default:
			r.Walkable[r.Index(o.At)] = *o.Walkable
		}
		seen[o.At] = true
	}
	for y, row := range g.Border {
		if len(row) != len(g.Border[0]) {
			fail("border row %d: every row must be as long as the first", y)
		}
		var tiles []Tile
		for _, name := range row {
			tile, ok := r.Palette.Tile(name)
			if !ok {
				fail("border: tile %q is not in tileset %s or its bases", name, g.Tileset)
			}
			tiles = append(tiles, tile)
		}
		r.Border = append(r.Border, tiles)
	}
	return r, errors.Join(errs...)
}
