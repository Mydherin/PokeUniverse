package format

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// The writers emit one canonical layout (fixed key order, one-line entries) so files written
// by the tools read the same as hand-edited ones and diffs stay small. Comments are not kept.

func WriteMap(path string, m *Map) error {
	w := &writer{}
	w.scalar("id", m.ID)
	w.scalar("type", m.Type)
	w.scalar("region", m.Region)
	w.scalar("music", m.Music)
	w.scalar("weather", m.Weather)
	w.flag("show_name", m.ShowName)
	w.flag("flash", m.Flash)
	if len(m.Allow) > 0 {
		w.line("allow: %s", list(m.Allow))
	}
	if m.Floor != 0 {
		w.line("floor: %d", m.Floor)
	}
	w.scalar("battle_scene", m.BattleScene)
	w.scalar("layout", m.Layout)
	w.grid(&m.Grid)
	if edges := m.Connections.Each(); len(edges) > 0 {
		w.line("connections:")
		for _, e := range edges {
			if e.Offset == 0 {
				w.line("  %s: %s", e.Direction, quote(e.Map))
			} else {
				w.line("  %s: { map: %s, offset: %d }", e.Direction, quote(e.Map), e.Offset)
			}
		}
	}
	if len(m.Warps) > 0 {
		w.line("warps:")
		for _, wp := range m.Warps {
			f := fields{}
			f.add("id", quote(wp.ID))
			f.add("at", point(wp.At))
			f.add("to", quote(wp.To))
			f.str("spawn", wp.Spawn)
			w.line("  - %s", f)
		}
	}
	if len(m.Objects) > 0 {
		w.line("objects:")
		for _, o := range m.Objects {
			w.line("  - %s", object(o))
		}
	}
	w.encounters(m.Encounters)
	return w.save(path)
}

func (w *writer) encounters(e *Encounters) {
	if e == nil {
		return
	}
	w.line("encounters:")
	slots := func(key string, list []WildSlot) {
		w.line("    %s:", key)
		for _, s := range list {
			w.line("      - { species: %s, min: %d, max: %d }", s.Species, s.Min, s.Max)
		}
	}
	table := func(key string, t *WildTable) {
		if t == nil {
			return
		}
		w.line("  %s:", key)
		w.line("    rate: %d", t.Rate)
		slots("slots", t.Slots)
	}
	table("land", e.Land)
	table("water", e.Water)
	table("rock_smash", e.RockSmash)
	if f := e.Fishing; f != nil {
		w.line("  fishing:")
		w.line("    rate: %d", f.Rate)
		slots("old", f.Old)
		slots("good", f.Good)
		slots("super", f.Super)
	}
}

func WriteLayout(path string, l *Layout) error {
	w := &writer{}
	w.scalar("id", l.ID)
	w.grid(&l.Grid)
	return w.save(path)
}

func WriteTileset(path string, t *Tileset) error {
	w := &writer{}
	w.scalar("id", t.ID)
	w.scalar("base", t.Base)
	w.scalar("firered", t.FireRed)
	w.line("tiles:")
	names := make([]string, 0, len(t.Tiles))
	for name := range t.Tiles {
		names = append(names, name)
	}
	sort.Slice(names, func(i, j int) bool { return t.Tiles[names[i]].Index < t.Tiles[names[j]].Index })
	for _, name := range names {
		tile := t.Tiles[name]
		f := fields{}
		f.add("index", strconv.Itoa(tile.Index))
		f.add("walkable", strconv.FormatBool(tile.Walkable))
		f.add("elevation", strconv.Itoa(tile.Elevation))
		f.str("behavior", tile.Behavior)
		f.str("encounter", tile.Encounter)
		w.line("  %s: %s", quote(name), f)
	}
	return w.save(path)
}

func (w *writer) grid(g *Grid) {
	w.scalar("tileset", g.Tileset)
	if g.Size != (Point{}) {
		w.line("size: %s", point(g.Size))
	}
	if len(g.Border) > 0 {
		w.line("border:")
		for _, row := range g.Border {
			w.line("  - %s", list(row))
		}
	}
	if len(g.Legend) > 0 {
		w.line("legend:")
		keys := make([]string, 0, len(g.Legend))
		for k := range g.Legend {
			keys = append(keys, k)
		}
		sort.Slice(keys, func(i, j int) bool { return []rune(keys[i])[0] < []rune(keys[j])[0] })
		for _, k := range keys {
			w.line("  %q: %s", k, quote(g.Legend[k]))
		}
	}
	w.block("ground", g.Ground)
	w.block("elevation", g.Elevation)
	if len(g.Overrides) > 0 {
		w.line("overrides:")
		for _, o := range g.Overrides {
			f := fields{}
			f.add("at", point(o.At))
			if o.Walkable != nil {
				f.add("walkable", strconv.FormatBool(*o.Walkable))
			}
			f.str("behavior", o.Behavior)
			f.str("encounter", o.Encounter)
			w.line("  - %s", f)
		}
	}
}

func object(o Object) fields {
	f := fields{}
	f.add("type", quote(o.Type))
	f.add("id", quote(o.ID))
	f.add("at", point(o.At))
	f.str("sprite", o.Sprite)
	f.str("movement", o.Movement)
	if o.Range != nil {
		f.add("range", point(*o.Range))
	}
	if o.Trainer != nil {
		f.add("trainer", fmt.Sprintf("{ type: %s, sight: %d }", quote(o.Trainer.Type), o.Trainer.Sight))
	}
	f.str("facing", o.Facing)
	f.str("item", o.Item)
	if o.Quantity != 0 {
		f.add("quantity", strconv.Itoa(o.Quantity))
	}
	if o.Underfoot {
		f.add("underfoot", "true")
	}
	f.str("var", o.Var)
	if o.Var != "" {
		f.add("value", strconv.Itoa(o.Value))
	}
	f.str("script", o.Script)
	f.str("flag", o.Flag)
	return f
}

type writer struct{ b strings.Builder }

func (w *writer) line(format string, args ...any) { fmt.Fprintf(&w.b, format+"\n", args...) }

func (w *writer) scalar(key, value string) {
	if value != "" {
		w.line("%s: %s", key, quote(value))
	}
}

func (w *writer) flag(key string, on bool) {
	if on {
		w.line("%s: true", key)
	}
}

func (w *writer) block(key, text string) {
	if text == "" {
		return
	}
	w.line("%s: |", key)
	for _, l := range strings.Split(strings.TrimRight(text, "\n"), "\n") {
		w.line("  %s", l)
	}
}

func (w *writer) save(path string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, []byte(w.b.String()), 0o644)
}

// fields is a one-line flow mapping: { a: 1, b: 2 }.
type fields []string

func (f *fields) add(key, value string) { *f = append(*f, key+": "+value) }

func (f *fields) str(key, value string) {
	if value != "" {
		f.add(key, quote(value))
	}
}

func (f fields) String() string { return "{ " + strings.Join(f, ", ") + " }" }

func point(p Point) string { return fmt.Sprintf("[%d, %d]", p[0], p[1]) }

func list(items []string) string {
	q := make([]string, len(items))
	for i, s := range items {
		q[i] = quote(s)
	}
	return "[" + strings.Join(q, ", ") + "]"
}

var (
	plain   = regexp.MustCompile(`^[a-z0-9_][a-z0-9_./]*$`)
	numeric = regexp.MustCompile(`^[0-9_.]+$`)
)

// quote leaves identifiers bare and quotes anything YAML could read as another type.
func quote(s string) string {
	switch s {
	case "true", "false", "null", "yes", "no", "on", "off", "y", "n":
		return strconv.Quote(s)
	}
	if plain.MatchString(s) && !numeric.MatchString(s) {
		return s
	}
	return strconv.Quote(s)
}
