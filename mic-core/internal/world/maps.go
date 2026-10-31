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
	walkable     []byte
	elevation    []byte
	behaviors    []mapv1.TileBehavior
	objects      []*mapv1.MapObject
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

// SignAt is the sign object on a cell, or nil.
func (m *Map) SignAt(p Point) *mapv1.Sign {
	for _, o := range m.objects {
		if s := o.GetSign(); s != nil && int(o.X) == p.X && int(o.Y) == p.Y {
			return s
		}
	}
	return nil
}

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
		maps[sm.Id] = &Map{
			ID:           sm.Id,
			Width:        int(sm.Width),
			Height:       int(sm.Height),
			AllowRunning: sm.AllowRunning,
			walkable:     sm.Walkable,
			elevation:    sm.Elevation,
			behaviors:    sm.Behaviors,
			objects:      sm.Objects,
		}
	}
	return maps, nil
}
