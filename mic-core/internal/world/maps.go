package world

import (
	"fmt"
	"io/fs"
	"path"
	"strings"

	"google.golang.org/protobuf/proto"

	mapv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/map/v1"
)

// Point is a tile: x = column, y = row, from the map's top-left.
type Point struct{ X, Y int }

var deltas = map[mapv1.Direction]Point{
	mapv1.Direction_DIRECTION_NORTH: {0, -1},
	mapv1.Direction_DIRECTION_SOUTH: {0, 1},
	mapv1.Direction_DIRECTION_WEST:  {-1, 0},
	mapv1.Direction_DIRECTION_EAST:  {1, 0},
}

// Step is the tile next to p in direction d.
func (p Point) Step(d mapv1.Direction) Point {
	v := deltas[d]
	return Point{p.X + v.X, p.Y + v.Y}
}

// ValidDirection reports whether d is one of the four directions.
func ValidDirection(d mapv1.Direction) bool {
	_, ok := deltas[d]
	return ok
}

// Map is a compiled ServerMap with cell lookups. Read only once loaded, so zones share it.
type Map struct {
	ID           string
	Width        int
	Height       int
	AllowRunning bool
	// For items: where the bike rides, the ESCAPE ROPE works, the VS SEEKER works.
	Type          mapv1.MapType
	AllowCycling  bool
	AllowEscaping bool
	walkable      []byte
	elevation     []byte
	behaviors     []mapv1.TileBehavior
	objects       []*mapv1.MapObject
	warps         []*mapv1.Warp
	// The NPCs, by the cell they stand on.
	npcs map[Point]*mapv1.MapObject
}

func (m *Map) In(p Point) bool { return p.X >= 0 && p.Y >= 0 && p.X < m.Width && p.Y < m.Height }

func (m *Map) Walkable(p Point) bool { return m.In(p) && m.walkable[p.Y*m.Width+p.X] != 0 }

// Elevation is the cell's elevation; 0 outside the map.
func (m *Map) Elevation(p Point) byte {
	if !m.In(p) {
		return 0
	}
	return m.elevation[p.Y*m.Width+p.X]
}

// Behavior is the cell's tile behavior; unspecified outside the map.
func (m *Map) Behavior(p Point) mapv1.TileBehavior {
	if !m.In(p) {
		return mapv1.TileBehavior_TILE_BEHAVIOR_UNSPECIFIED
	}
	return m.behaviors[p.Y*m.Width+p.X]
}

// WarpAt is the warp on a cell, or nil (a map has a handful: a scan is enough).
func (m *Map) WarpAt(p Point) *mapv1.Warp {
	for _, w := range m.warps {
		if int(w.X) == p.X && int(w.Y) == p.Y {
			return w
		}
	}
	return nil
}

// warpNamed is the warp with an ID, or nil.
func (m *Map) warpNamed(id string) *mapv1.Warp {
	for _, w := range m.warps {
		if w.Id == id {
			return w
		}
	}
	return nil
}

// NpcAt is the NPC standing on a cell, or nil.
func (m *Map) NpcAt(p Point) *mapv1.MapObject { return m.npcs[p] }

// SignAt is the sign object on a cell, or nil.
func (m *Map) SignAt(p Point) *mapv1.Sign {
	for _, o := range m.objects {
		if s := o.GetSign(); s != nil && int(o.X) == p.X && int(o.Y) == p.Y {
			return s
		}
	}
	return nil
}

// HiddenItemNear reports whether a hidden item lies within the ITEMFINDER's range of p
// (7 tiles across, 5 up or down). Found items are tracked with the story flags (Phase 10).
func (m *Map) HiddenItemNear(p Point) bool {
	for _, o := range m.objects {
		if o.GetHiddenItem() != nil && abs(int(o.X)-p.X) <= 7 && abs(int(o.Y)-p.Y) <= 5 {
			return true
		}
	}
	return false
}

func abs(n int) int { return max(n, -n) }

// Maps is the world: every map by ID.
type Maps map[string]*Map

// LoadMaps reads every <id>.binpb of fsys and checks each map's cell arrays.
func LoadMaps(fsys fs.FS) (Maps, error) {
	files, err := fs.Glob(fsys, "*.binpb")
	if err != nil {
		return nil, err
	}
	if len(files) == 0 {
		return nil, fmt.Errorf("maps: none found: run make maps")
	}
	maps := Maps{}
	for _, f := range files {
		data, err := fs.ReadFile(fsys, f)
		if err != nil {
			return nil, err
		}
		var sm mapv1.ServerMap
		if err := proto.Unmarshal(data, &sm); err != nil {
			return nil, fmt.Errorf("maps: %s: %w", f, err)
		}
		n := int(sm.Width * sm.Height)
		if id := strings.TrimSuffix(path.Base(f), ".binpb"); sm.Id != id || n == 0 ||
			len(sm.Walkable) != n || len(sm.Elevation) != n || len(sm.Behaviors) != n {
			return nil, fmt.Errorf("maps: %s is malformed: run make maps", f)
		}
		npcs := map[Point]*mapv1.MapObject{}
		for _, o := range sm.Objects {
			if o.GetNpc() != nil {
				npcs[Point{int(o.X), int(o.Y)}] = o
			}
		}
		maps[sm.Id] = &Map{
			ID:            sm.Id,
			Width:         int(sm.Width),
			Height:        int(sm.Height),
			AllowRunning:  sm.AllowRunning,
			Type:          sm.Type,
			AllowCycling:  sm.AllowCycling,
			AllowEscaping: sm.AllowEscaping,
			walkable:      sm.Walkable,
			elevation:     sm.Elevation,
			behaviors:     sm.Behaviors,
			objects:       sm.Objects,
			warps:         sm.Warps,
			npcs:          npcs,
		}
	}
	return maps, nil
}
