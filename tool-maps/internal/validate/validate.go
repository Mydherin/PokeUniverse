// Package validate checks every file of lib-maps: syntax, references between files and
// whether each map can be played. Errors stop compile; warnings point at things to look at
// (a link to a map not written yet, an area no entrance reaches).
package validate

import (
	"fmt"
	"regexp"
	"slices"
	"sort"
	"strings"

	mapv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/map/v1"
	"pokeuniverse/tool-maps/internal/format"
	"pokeuniverse/tool-maps/internal/world"
)

type Issue struct {
	File    string
	Msg     string
	Warning bool
}

func (i Issue) String() string {
	level := "error"
	if i.Warning {
		level = "warning"
	}
	return fmt.Sprintf("%s: %s: %s", level, i.File, i.Msg)
}

type Report struct {
	Issues []Issue
	// Resolved maps, for the commands that go on after validating.
	Maps map[string]*world.Resolved
}

func (r *Report) Errors() int {
	n := 0
	for _, i := range r.Issues {
		if !i.Warning {
			n++
		}
	}
	return n
}

func (r *Report) Warnings() int { return len(r.Issues) - r.Errors() }

// Run checks the whole world.
func Run(w *world.World, loadProblems []world.Problem) *Report {
	c := &checker{w: w, report: &Report{Maps: map[string]*world.Resolved{}}, seen: map[string]bool{}}
	for _, p := range loadProblems {
		c.err(p.File, "%s", p.Msg)
	}
	for _, id := range w.TilesetIDs() {
		c.tileset(w.Tilesets[id])
	}
	used := map[string]bool{}
	for _, id := range w.MapIDs() {
		m := w.Maps[id]
		used[m.Layout] = true
		c.mapFile(m)
	}
	for _, id := range w.LayoutIDs() {
		if !used[id] {
			c.warn(file(world.LayoutsDir, id), "no map uses this layout")
		}
	}
	for _, id := range w.MapIDs() {
		if r := c.report.Maps[id]; r != nil {
			c.links(r)
			c.reachable(r)
		}
	}
	sort.SliceStable(c.report.Issues, func(i, j int) bool { return c.report.Issues[i].File < c.report.Issues[j].File })
	return c.report
}

type checker struct {
	w      *world.World
	report *Report
	seen   map[string]bool // issues already reported (shared layouts are resolved once per map)
}

func (c *checker) add(i Issue) {
	if key := i.String(); !c.seen[key] {
		c.seen[key] = true
		c.report.Issues = append(c.report.Issues, i)
	}
}

func (c *checker) err(f, msg string, args ...any) {
	c.add(Issue{File: f, Msg: fmt.Sprintf(msg, args...)})
}

func (c *checker) warn(f, msg string, args ...any) {
	c.add(Issue{File: f, Msg: fmt.Sprintf(msg, args...), Warning: true})
}

var ident = regexp.MustCompile(`^[a-z0-9][a-z0-9_]*$`)

func file(dir, id string) string { return dir + "/" + id + ".yaml" }

func (c *checker) tileset(t *format.Tileset) {
	f := file(world.TilesetsDir, t.ID)
	if _, err := c.w.Palette(t.ID); err != nil {
		for _, e := range unjoin(err) {
			c.err(f, "%v", e)
		}
	}
	for name, tile := range t.Tiles {
		if !ident.MatchString(name) {
			c.err(f, "tile name %q must be lowercase letters, digits and _", name)
		}
		if tile.Index < 0 {
			c.err(f, "tile %s: index must not be negative", name)
		}
		if tile.Elevation < 0 || tile.Elevation > 15 {
			c.err(f, "tile %s: elevation must be 0-15", name)
		}
		if tile.Behavior != "" {
			if _, ok := Behavior(tile.Behavior); !ok {
				c.err(f, "tile %s: unknown behavior %q (see TileBehavior in lib-contracts map.proto)", name, tile.Behavior)
			}
		}
		if tile.Encounter != "" && tile.Encounter != format.EncounterLand && tile.Encounter != format.EncounterWater {
			c.err(f, "tile %s: encounter must be land or water", name)
		}
	}
}

// Behavior returns the contract value of a catalog behavior name.
func Behavior(name string) (mapv1.TileBehavior, bool) {
	v, ok := mapv1.TileBehavior_value["TILE_BEHAVIOR_"+strings.ToUpper(name)]
	return mapv1.TileBehavior(v), ok && name != "unspecified"
}

func (c *checker) mapFile(m *format.Map) {
	f := file(world.MapsDir, m.ID)
	if !ident.MatchString(m.ID) {
		c.err(f, "id must be lowercase letters, digits and _")
	}
	if !slices.Contains(format.MapTypes, m.Type) {
		c.err(f, "type must be one of %v", format.MapTypes)
	}
	for _, a := range m.Allow {
		if a != format.AllowRunning && a != format.AllowCycling && a != format.AllowEscaping {
			c.err(f, "allow: unknown %q (running, cycling, escaping)", a)
		}
	}
	if m.Layout != "" && !emptyGrid(&m.Grid) {
		c.err(f, "a map with a layout must not have its own tileset, size, legend or grids")
	}
	r, err := c.w.Resolve(m)
	gridFile := f
	if _, gf, gerr := c.w.GridOf(m); gerr == nil {
		gridFile = gf
	}
	for _, e := range unjoin(err) {
		c.err(gridFile, "%v", e)
	}
	if r == nil {
		return
	}
	if err == nil {
		c.report.Maps[m.ID] = r
	}
	ids := map[string]bool{}
	for _, wp := range m.Warps {
		if !ident.MatchString(wp.ID) {
			c.err(f, "warp %q: id must be lowercase letters, digits and _", wp.ID)
		}
		if ids[wp.ID] {
			c.err(f, "warp %q: id used twice", wp.ID)
		}
		ids[wp.ID] = true
		if !r.In(wp.At) {
			c.err(f, "warp %s at %v is outside the map", wp.ID, wp.At)
		}
	}
	ids = map[string]bool{}
	for _, o := range m.Objects {
		c.object(f, r, o, ids)
	}
}

func (c *checker) object(f string, r *world.Resolved, o format.Object, ids map[string]bool) {
	name := fmt.Sprintf("object %q", o.ID)
	if !ident.MatchString(o.ID) {
		c.err(f, "%s: id must be lowercase letters, digits and _", name)
	}
	if ids[o.ID] {
		c.err(f, "%s: id used twice", name)
	}
	ids[o.ID] = true
	if !r.In(o.At) {
		c.err(f, "%s at %v is outside the map", name, o.At)
		return
	}
	need := func(field, value string) {
		if value == "" {
			c.err(f, "%s: a %s needs %s", name, o.Type, field)
		}
	}
	// Fields each type may set besides type, id and at.
	allowed := map[string][]string{
		format.ObjectNPC:        {"sprite", "movement", "range", "trainer", "script", "flag"},
		format.ObjectSign:       {"facing", "script"},
		format.ObjectHiddenItem: {"item", "quantity", "underfoot", "flag"},
		format.ObjectTrigger:    {"var", "value", "script"},
	}
	fields, ok := allowed[o.Type]
	if !ok {
		c.err(f, "%s: type must be npc, sign, hidden_item or trigger", name)
		return
	}
	for field, set := range map[string]bool{
		"sprite": o.Sprite != "", "movement": o.Movement != "", "range": o.Range != nil, "trainer": o.Trainer != nil,
		"facing": o.Facing != "", "item": o.Item != "", "quantity": o.Quantity != 0, "underfoot": o.Underfoot,
		"var": o.Var != "", "value": o.Value != 0, "script": o.Script != "", "flag": o.Flag != "",
	} {
		if set && !slices.Contains(fields, field) {
			c.err(f, "%s: a %s has no %s", name, o.Type, field)
		}
	}
	switch o.Type {
	case format.ObjectNPC:
		need("sprite", o.Sprite)
		need("movement", o.Movement)
		if c.report.Maps[r.Map.ID] != nil && !r.Walkable[r.Index(o.At)] {
			c.warn(f, "%s stands on a blocked tile at %v", name, o.At)
		}
	case format.ObjectSign:
		need("script", o.Script)
		if o.Facing != "" && !slices.Contains([]string{"up", "down", "left", "right"}, o.Facing) {
			c.err(f, "%s: facing must be up, down, left or right", name)
		}
	case format.ObjectHiddenItem:
		need("item", o.Item)
		need("flag", o.Flag)
	case format.ObjectTrigger:
		need("var", o.Var)
		need("script", o.Script)
	}
}

// links checks warps and connections against the maps they lead to.
func (c *checker) links(r *world.Resolved) {
	m := r.Map
	f := file(world.MapsDir, m.ID)
	for _, wp := range m.Warps {
		if wp.To == format.DynamicWarp {
			if wp.Spawn != "" {
				c.err(f, "warp %s: a dynamic warp has no spawn", wp.ID)
			}
			continue
		}
		dest, ok := c.w.Maps[wp.To]
		if !ok {
			c.warn(f, "warp %s leads to %s, which doesn't exist yet", wp.ID, wp.To)
			continue
		}
		if !slices.ContainsFunc(dest.Warps, func(d format.Warp) bool { return d.ID == wp.Spawn }) {
			c.err(f, "warp %s: %s has no warp %q to spawn on", wp.ID, wp.To, wp.Spawn)
		}
	}
	for _, e := range m.Connections.Each() {
		if e.Map == m.ID {
			c.err(f, "connection %s leads to the map itself", e.Direction)
			continue
		}
		dest, ok := c.w.Maps[e.Map]
		if !ok {
			c.warn(f, "connection %s leads to %s, which doesn't exist yet", e.Direction, e.Map)
			continue
		}
		back := dest.Connections.Get(e.Direction.Opposite())
		if back == nil || back.Map != m.ID || back.Offset != -e.Offset {
			c.err(f, "connection %s: %s must connect back %s to %s with offset %d", e.Direction, e.Map, e.Direction.Opposite(), m.ID, -e.Offset)
		}
	}
}

// Water the player can surf onto from any elevation.
var surfable = []string{"pond_water", "fast_water", "ocean_water", "waterfall", "cycling_road_water",
	"eastward_current", "westward_current", "northward_current", "southward_current"}

// reachable warns about walkable areas that no warp or connection leads to.
// Ledges and water count as passable; elevations must match unless one is 0 or 15.
func (c *checker) reachable(r *world.Resolved) {
	passable := func(i int) bool {
		b := r.Tiles[i].Behavior
		return r.Walkable[i] || strings.HasPrefix(b, "jump_") || slices.Contains(surfable, b)
	}
	connects := func(a, b int) bool {
		ea, eb := r.Elevation[a], r.Elevation[b]
		return ea == eb || ea == 0 || eb == 0 || ea == 15 || eb == 15 ||
			slices.Contains(surfable, r.Tiles[a].Behavior) || slices.Contains(surfable, r.Tiles[b].Behavior)
	}
	seen := make([]bool, len(r.Tiles))
	var queue []int
	enter := func(x, y int) {
		if i := y*r.Width + x; x >= 0 && y >= 0 && x < r.Width && y < r.Height && !seen[i] && passable(i) {
			seen[i] = true
			queue = append(queue, i)
		}
	}
	for _, wp := range r.Map.Warps {
		if r.In(wp.At) {
			// The player appears on the warp, which may itself be a blocked stair or door tile.
			i := r.Index(wp.At)
			seen[i] = true
			queue = append(queue, i)
		}
	}
	for _, e := range r.Map.Connections.Each() {
		for k := range max(r.Width, r.Height) {
			switch e.Direction {
			case format.North:
				enter(k, 0)
			case format.South:
				enter(k, r.Height-1)
			case format.West:
				enter(0, k)
			case format.East:
				enter(r.Width-1, k)
			}
		}
	}
	for len(queue) > 0 {
		i := queue[0]
		queue = queue[1:]
		x, y := i%r.Width, i/r.Width
		for _, d := range [][2]int{{0, -1}, {0, 1}, {-1, 0}, {1, 0}} {
			nx, ny := x+d[0], y+d[1]
			if nx < 0 || ny < 0 || nx >= r.Width || ny >= r.Height {
				continue
			}
			if j := ny*r.Width + nx; !seen[j] && passable(j) && connects(i, j) {
				seen[j] = true
				queue = append(queue, j)
			}
		}
	}
	var lost []format.Point
	for i, ok := range seen {
		if !ok && r.Walkable[i] {
			lost = append(lost, format.Point{i % r.Width, i / r.Width})
		}
	}
	if len(lost) > 0 {
		c.warn(file(world.MapsDir, r.Map.ID), "%d walkable tiles no warp or connection reaches, first at %v", len(lost), lost[0])
	}
}

func emptyGrid(g *format.Grid) bool {
	return g.Tileset == "" && g.Size == (format.Point{}) && len(g.Border) == 0 && len(g.Legend) == 0 &&
		g.Ground == "" && g.Elevation == "" && len(g.Overrides) == 0
}

// unjoin splits errors.Join results back into single errors.
func unjoin(err error) []error {
	if err == nil {
		return nil
	}
	if j, ok := err.(interface{ Unwrap() []error }); ok {
		var out []error
		for _, e := range j.Unwrap() {
			out = append(out, unjoin(e)...)
		}
		return out
	}
	return []error{err}
}
