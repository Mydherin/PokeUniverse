package convert

import (
	"fmt"
	"sort"
	"strconv"

	"pokeuniverse/tool-maps/internal/firered"
	"pokeuniverse/tool-maps/internal/format"
)

// grid converts a FireRed layout: block grid, border and the per-cell exceptions
// to the catalog's defaults (elevation grid, collision overrides).
func (c *converter) grid(l *firered.Layout, stats cellStats) (*format.Grid, error) {
	primary, err := c.tileset(l.Primary, "", stats)
	if err != nil {
		return nil, err
	}
	secondary, err := c.tileset(l.Secondary, primary.catalog.ID, stats)
	if err != nil {
		return nil, err
	}
	tileAt := func(id int) (string, format.Tile, error) {
		t := primary
		if id >= firered.PrimaryMetatiles {
			t = secondary
		}
		name, ok := t.byIndex[id]
		if !ok {
			return "", format.Tile{}, fmt.Errorf("metatile %d has no tile in catalog %s", id, t.catalog.ID)
		}
		return name, t.catalog.Tiles[name], nil
	}
	blocks, err := c.Decomp.Blocks(l.BlocksPath)
	if err != nil {
		return nil, err
	}
	if len(blocks) != l.Width*l.Height {
		return nil, fmt.Errorf("%s: %d blocks for %d×%d", l.BlocksPath, len(blocks), l.Width, l.Height)
	}
	g := &format.Grid{Tileset: secondary.catalog.ID, Size: format.Point{l.Width, l.Height}}

	names := make([]string, len(blocks))
	count := map[string]int{}
	walkable := map[string]bool{}
	var elevations [][]rune
	deviates := false
	for i, b := range blocks {
		name, tile, err := tileAt(b.Metatile())
		if err != nil {
			return nil, err
		}
		names[i] = name
		count[name]++
		walkable[name] = tile.Walkable
		if i%l.Width == 0 {
			elevations = append(elevations, make([]rune, 0, l.Width))
		}
		e := '.'
		if b.Elevation() != tile.Elevation {
			e, deviates = rune(strconv.FormatInt(int64(b.Elevation()), 16)[0]), true
		}
		elevations[i/l.Width] = append(elevations[i/l.Width], e)
		if b.Walkable() != tile.Walkable {
			v := b.Walkable()
			g.Overrides = append(g.Overrides, format.Override{At: format.Point{i % l.Width, i / l.Width}, Walkable: &v})
		}
	}
	chars, err := assignChars(count, walkable)
	if err != nil {
		return nil, err
	}
	g.Legend = map[string]string{}
	for name, r := range chars {
		g.Legend[string(r)] = name
	}
	rows := make([][]rune, l.Height)
	for i, name := range names {
		rows[i/l.Width] = append(rows[i/l.Width], chars[name])
	}
	g.Ground = format.FormatGrid(rows)
	if deviates {
		g.Elevation = format.FormatGrid(elevations)
	}

	if l.BorderWidth > 0 {
		border, err := c.Decomp.Blocks(l.BorderPath)
		if err != nil {
			return nil, err
		}
		for y := range l.BorderHeight {
			var row []string
			for x := range l.BorderWidth {
				name, _, err := tileAt(border[y*l.BorderWidth+x].Metatile())
				if err != nil {
					return nil, err
				}
				row = append(row, name)
			}
			g.Border = append(g.Border, row)
		}
	}
	return g, nil
}

// Characters for legends, nicest first: walkable tiles get light marks and lowercase letters,
// blocked ones heavy marks and capitals, so the grid shows where the player can go.
// Large maps use more tiles than ASCII has, so Latin-1, Greek, Cyrillic and Latin Extended-A
// letters follow, skipping the ones that look like Latin letters.
var (
	walkChars  = []rune(".,:;-_'`" + "abcdefghijklmnopqrstuvwxyz" + "àáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ" + "αβγδεζηθικλμνξπρστυφχψω" + "бвгджзийклмнптфцчшщъыьэюя")
	blockChars = []rune("#%&@=+*$!?^|/<>[](){}~" + "ABCDEFGHIJKLMNOPQRSTUVWXYZ" + "0123456789" + "ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞ" + "ΓΔΘΛΞΠΣΦΨΩ" + "БГДЖЗИЙЛПФЦЧШЩЪЫЬЭЮЯ")
	extraChars = latinExtendedA()
)

func latinExtendedA() []rune {
	var out []rune
	for r := rune(0x100); r < 0x180; r++ {
		out = append(out, r)
	}
	return out
}

// assignChars gives each tile a character, most used tiles first.
func assignChars(count map[string]int, walkable map[string]bool) (map[string]rune, error) {
	names := make([]string, 0, len(count))
	for n := range count {
		names = append(names, n)
	}
	sort.Slice(names, func(i, j int) bool {
		if count[names[i]] != count[names[j]] {
			return count[names[i]] > count[names[j]]
		}
		return names[i] < names[j]
	})
	pools := map[bool][]rune{true: walkChars, false: blockChars}
	extra := extraChars
	take := func(pool *[]rune) (rune, bool) {
		if len(*pool) == 0 {
			return 0, false
		}
		r := (*pool)[0]
		*pool = (*pool)[1:]
		return r, true
	}
	out := map[string]rune{}
	for _, n := range names {
		w, other := pools[walkable[n]], pools[!walkable[n]]
		r, ok := take(&w)
		if !ok {
			r, ok = take(&other)
		}
		if !ok {
			r, ok = take(&extra)
		}
		if !ok {
			return nil, fmt.Errorf("%d different tiles, more than the legend has characters", len(names))
		}
		pools[walkable[n]], pools[!walkable[n]] = w, other
		out[n] = r
	}
	return out, nil
}
