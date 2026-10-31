// Package convert turns FireRed's maps into lib-maps text files: maps, shared layouts and
// tile catalogs. It runs once per map; afterwards the text files are the source.
// Files that already exist are kept (unless forced), and existing catalogs are reused, so
// converting more maps later never undoes edits or renamed tiles.
package convert

import (
	"fmt"
	"sort"
	"strings"

	"pokeuniverse/tool-maps/internal/firered"
	"pokeuniverse/tool-maps/internal/format"
	"pokeuniverse/tool-maps/internal/world"
)

type Options struct {
	Decomp firered.Decomp
	Out    string   // lib-maps folder
	Maps   []string // FireRed names or our IDs; empty for every Kanto map
	Force  bool     // overwrite existing files
	Log    func(format string, args ...any)
}

type converter struct {
	Options
	layouts   map[string]*firered.Layout
	dirs      map[string]string // tileset symbol → folder
	behaviors map[int]string
	kanto     []*firered.Map
	names     map[string]string // MAP_ constant → FireRed name, for Kanto maps
	tilesets  map[string]*tileset
	warpIDs   map[string][]string // map ID → warp IDs, in FireRed's order
	written   int
	kept      int
}

// tileset is a catalog being converted or reused, with its FireRed source.
type tileset struct {
	catalog *format.Tileset
	byIndex map[int]string
	source  *firered.Tileset
	first   int // global metatile index of its first tile
}

func Run(o Options) error {
	if err := o.Decomp.Check(); err != nil {
		return err
	}
	c := &converter{Options: o, names: map[string]string{}, tilesets: map[string]*tileset{}, warpIDs: map[string][]string{}}
	var err error
	if c.layouts, err = o.Decomp.Layouts(); err != nil {
		return err
	}
	if c.dirs, err = o.Decomp.TilesetDirs(); err != nil {
		return err
	}
	if c.behaviors, err = o.Decomp.Behaviors(); err != nil {
		return err
	}
	all, err := o.Decomp.Maps()
	if err != nil {
		return err
	}
	for _, m := range all {
		if isKanto(m) {
			c.kanto = append(c.kanto, m)
			c.names[m.ID] = m.Name
		}
	}
	selected, err := c.select_()
	if err != nil {
		return err
	}
	for _, m := range c.kanto {
		c.warpIDs[firered.Snake(m.Name)] = warpIDs(m, c.names)
	}
	stats, err := c.usage()
	if err != nil {
		return err
	}
	shared := map[string]int{}
	for _, m := range c.kanto {
		shared[m.Layout]++
	}
	for _, m := range selected {
		if err := c.convertMap(m, stats, shared[m.Layout] > 1); err != nil {
			return fmt.Errorf("%s: %w", m.Name, err)
		}
	}
	for _, id := range sortedKeys(c.tilesets) {
		if err := c.save(world.TilesetsDir, id, func(path string) error { return format.WriteTileset(path, c.tilesets[id].catalog) }); err != nil {
			return err
		}
	}
	o.Log("converted %d maps: %d files written, %d kept", len(selected), c.written, c.kept)
	return nil
}

func (c *converter) select_() ([]*firered.Map, error) {
	if len(c.Maps) == 0 {
		return c.kanto, nil
	}
	var out []*firered.Map
	for _, want := range c.Maps {
		found := false
		for _, m := range c.kanto {
			if m.Name == want || firered.Snake(m.Name) == want {
				out = append(out, m)
				found = true
			}
		}
		if !found {
			return nil, fmt.Errorf("no Kanto map named %q", want)
		}
	}
	return out, nil
}

// Map sections outside Kanto (the Sevii Islands and link rooms); the game covers Kanto only.
var excludedSections = map[string]bool{
	"MAPSEC_SPECIAL_AREA": true, "MAPSEC_BIRTH_ISLAND": true, "MAPSEC_NAVEL_ROCK": true, "MAPSEC_MT_EMBER": true,
	"MAPSEC_TRAINER_TOWER": true, "MAPSEC_TRAINER_TOWER_2": true,
}

var excludedPrefixes = []string{"OneIsland", "TwoIsland", "ThreeIsland", "FourIsland", "FiveIsland", "SixIsland", "SevenIsland", "Prototype"}

func isKanto(m *firered.Map) bool {
	for _, p := range excludedPrefixes {
		if strings.HasPrefix(m.Name, p) {
			return false
		}
	}
	return !excludedSections[m.Region]
}

// cellStats counts how cells use each metatile across every Kanto layout, so a catalog's
// defaults (walkable, elevation) are what most cells use, whichever maps are converted.
type cellStats map[string]map[int]*usage // tileset symbol → local index

type usage struct {
	walkable  map[bool]int
	elevation map[int]int
}

func (s cellStats) at(symbol string, local int) *usage {
	if s[symbol] == nil {
		s[symbol] = map[int]*usage{}
	}
	u := s[symbol][local]
	if u == nil {
		u = &usage{walkable: map[bool]int{}, elevation: map[int]int{}}
		s[symbol][local] = u
	}
	return u
}

func (u *usage) defaults() (walkable bool, elevation int) {
	if u == nil {
		return false, 0
	}
	walkable = u.walkable[true] > u.walkable[false]
	best := -1
	for e, n := range u.elevation {
		if n > best || n == best && e < elevation {
			elevation, best = e, n
		}
	}
	return walkable, elevation
}

func (c *converter) usage() (cellStats, error) {
	stats := cellStats{}
	done := map[string]bool{}
	for _, m := range c.kanto {
		l := c.layouts[m.Layout]
		if l == nil || done[l.ID] {
			continue
		}
		done[l.ID] = true
		blocks, err := c.Decomp.Blocks(l.BlocksPath)
		if err != nil {
			return nil, err
		}
		for _, b := range blocks {
			symbol, local := l.Primary, b.Metatile()
			if local >= firered.PrimaryMetatiles {
				symbol, local = l.Secondary, local-firered.PrimaryMetatiles
			}
			u := stats.at(symbol, local)
			u.walkable[b.Walkable()]++
			u.elevation[b.Elevation()]++
		}
	}
	return stats, nil
}

// save writes one file unless it exists and Force is off.
func (c *converter) save(dir, id string, write func(path string) error) error {
	path := fmt.Sprintf("%s/%s/%s.yaml", c.Out, dir, id)
	if world.Exists(path) && !c.Force {
		c.kept++
		return nil
	}
	c.written++
	c.Log("write %s/%s.yaml", dir, id)
	return write(path)
}

func sortedKeys[V any](m map[string]V) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}
