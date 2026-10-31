// Package world loads every file of lib-maps and resolves maps into cells:
// the tile, elevation and collision of each one.
package world

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"pokeuniverse/tool-maps/internal/format"
)

// Folders of lib-maps.
const (
	MapsDir     = "maps"
	LayoutsDir  = "layouts"
	TilesetsDir = "tilesets"
)

type World struct {
	Dir      string
	Maps     map[string]*format.Map
	Layouts  map[string]*format.Layout
	Tilesets map[string]*format.Tileset
}

// Problem is one thing wrong in a file.
type Problem struct {
	File string
	Msg  string
}

func (p Problem) String() string { return p.File + ": " + p.Msg }

// Load reads every map, layout and tileset. Files that fail to parse are reported and skipped.
func Load(dir string) (*World, []Problem) {
	w := &World{Dir: dir, Maps: map[string]*format.Map{}, Layouts: map[string]*format.Layout{}, Tilesets: map[string]*format.Tileset{}}
	var problems []Problem
	load := func(sub string, read func(path string) (string, error)) {
		paths, _ := filepath.Glob(filepath.Join(dir, sub, "*.yaml"))
		for _, path := range paths {
			id, err := read(path)
			rel := w.Rel(path)
			switch {
			case err != nil:
				problems = append(problems, Problem{rel, err.Error()})
			case id != strings.TrimSuffix(filepath.Base(path), ".yaml"):
				problems = append(problems, Problem{rel, fmt.Sprintf("id %q must match the file name", id)})
			}
		}
	}
	load(MapsDir, func(path string) (string, error) {
		m, err := format.ReadMap(path)
		if err != nil {
			return "", err
		}
		w.Maps[m.ID] = m
		return m.ID, nil
	})
	load(LayoutsDir, func(path string) (string, error) {
		l, err := format.ReadLayout(path)
		if err != nil {
			return "", err
		}
		w.Layouts[l.ID] = l
		return l.ID, nil
	})
	load(TilesetsDir, func(path string) (string, error) {
		t, err := format.ReadTileset(path)
		if err != nil {
			return "", err
		}
		w.Tilesets[t.ID] = t
		return t.ID, nil
	})
	return w, problems
}

func (w *World) Rel(path string) string {
	if rel, err := filepath.Rel(w.Dir, path); err == nil {
		return rel
	}
	return path
}

func (w *World) MapFile(id string) string     { return filepath.Join(w.Dir, MapsDir, id+".yaml") }
func (w *World) LayoutFile(id string) string  { return filepath.Join(w.Dir, LayoutsDir, id+".yaml") }
func (w *World) TilesetFile(id string) string { return filepath.Join(w.Dir, TilesetsDir, id+".yaml") }

// MapIDs returns every map ID, sorted.
func (w *World) MapIDs() []string { return sortedKeys(w.Maps) }

func (w *World) TilesetIDs() []string { return sortedKeys(w.Tilesets) }

func (w *World) LayoutIDs() []string { return sortedKeys(w.Layouts) }

// GridOf returns the grid a map uses (its own or its shared layout's) and the file holding it.
func (w *World) GridOf(m *format.Map) (*format.Grid, string, error) {
	if m.Layout == "" {
		return &m.Grid, filepath.Join(MapsDir, m.ID+".yaml"), nil
	}
	l, ok := w.Layouts[m.Layout]
	if !ok {
		return nil, "", fmt.Errorf("layout %q does not exist", m.Layout)
	}
	return &l.Grid, filepath.Join(LayoutsDir, l.ID+".yaml"), nil
}

func sortedKeys[V any](m map[string]V) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

// Exists tells whether lib-maps already holds a file.
func Exists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
