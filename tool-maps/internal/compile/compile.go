// Package compile turns validated maps into the runtime maps of lib-contracts' map.proto:
// a ClientMap for spa-pokeuniverse (what to draw) and a ServerMap for mic-core (what to play).
package compile

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"google.golang.org/protobuf/proto"

	mapv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/map/v1"
	"pokeuniverse/tool-maps/internal/format"
	"pokeuniverse/tool-maps/internal/validate"
	"pokeuniverse/tool-maps/internal/world"
)

const Ext = ".binpb"

// Run writes every map of the report to both folders, replacing what was there.
func Run(report *validate.Report, clientDir, serverDir string) error {
	if n := report.Errors(); n > 0 {
		return fmt.Errorf("%d validation errors: run tool-maps validate", n)
	}
	for _, dir := range []string{clientDir, serverDir} {
		if err := clean(dir); err != nil {
			return err
		}
	}
	for id, r := range report.Maps {
		if err := write(filepath.Join(clientDir, id+Ext), Client(r)); err != nil {
			return err
		}
		if err := write(filepath.Join(serverDir, id+Ext), Server(r)); err != nil {
			return err
		}
	}
	return nil
}

func Client(r *world.Resolved) *mapv1.ClientMap {
	m := &mapv1.ClientMap{
		Id:          r.Map.ID,
		Width:       uint32(r.Width),
		Height:      uint32(r.Height),
		Tileset:     r.Grid.Tileset,
		Tiles:       make([]uint32, len(r.Tiles)),
		Connections: connections(r.Map),
		Music:       r.Map.Music,
		Weather:     r.Map.Weather,
		ShowName:    r.Map.ShowName,
	}
	for i, t := range r.Tiles {
		m.Tiles[i] = uint32(t.Index)
	}
	for _, row := range r.Border {
		m.BorderWidth = uint32(len(row))
		for _, t := range row {
			m.Border = append(m.Border, uint32(t.Index))
		}
	}
	return m
}

var mapTypes = map[string]mapv1.MapType{
	"town": mapv1.MapType_MAP_TYPE_TOWN, "route": mapv1.MapType_MAP_TYPE_ROUTE,
	"indoor": mapv1.MapType_MAP_TYPE_INDOOR, "underground": mapv1.MapType_MAP_TYPE_UNDERGROUND,
}

var encounters = map[string]mapv1.EncounterType{
	format.EncounterLand: mapv1.EncounterType_ENCOUNTER_TYPE_LAND, format.EncounterWater: mapv1.EncounterType_ENCOUNTER_TYPE_WATER,
}

func Server(r *world.Resolved) *mapv1.ServerMap {
	n := len(r.Tiles)
	m := &mapv1.ServerMap{
		Id:            r.Map.ID,
		Width:         uint32(r.Width),
		Height:        uint32(r.Height),
		Type:          mapTypes[r.Map.Type],
		Walkable:      make([]byte, n),
		Elevation:     make([]byte, n),
		Behaviors:     make([]mapv1.TileBehavior, n),
		Encounters:    make([]mapv1.EncounterType, n),
		Connections:   connections(r.Map),
		AllowRunning:  allows(r.Map, format.AllowRunning),
		AllowCycling:  allows(r.Map, format.AllowCycling),
		AllowEscaping: allows(r.Map, format.AllowEscaping),
		RequiresFlash: r.Map.Flash,
		Region:        r.Map.Region,
	}
	for i, t := range r.Tiles {
		if r.Walkable[i] {
			m.Walkable[i] = 1
		}
		m.Elevation[i] = byte(r.Elevation[i])
		m.Behaviors[i], _ = validate.Behavior(t.Behavior)
		m.Encounters[i] = encounters[t.Encounter]
	}
	for _, w := range r.Map.Warps {
		wp := &mapv1.Warp{Id: w.ID, X: uint32(w.At.X()), Y: uint32(w.At.Y()), ToWarp: w.Spawn}
		if w.To != format.DynamicWarp {
			wp.ToMap = w.To
		}
		m.Warps = append(m.Warps, wp)
	}
	for _, o := range r.Map.Objects {
		m.Objects = append(m.Objects, object(o))
	}
	return m
}

var facings = map[string]mapv1.Direction{
	"up": mapv1.Direction_DIRECTION_NORTH, "down": mapv1.Direction_DIRECTION_SOUTH,
	"left": mapv1.Direction_DIRECTION_WEST, "right": mapv1.Direction_DIRECTION_EAST,
}

func object(o format.Object) *mapv1.MapObject {
	out := &mapv1.MapObject{Id: o.ID, X: uint32(o.At.X()), Y: uint32(o.At.Y())}
	switch o.Type {
	case format.ObjectNPC:
		npc := &mapv1.Npc{Sprite: o.Sprite, Movement: o.Movement, Script: o.Script, Flag: o.Flag}
		if o.Range != nil {
			npc.RangeX, npc.RangeY = uint32(o.Range.X()), uint32(o.Range.Y())
		}
		if o.Trainer != nil {
			npc.TrainerType, npc.TrainerSight = o.Trainer.Type, uint32(o.Trainer.Sight)
		}
		out.Kind = &mapv1.MapObject_Npc{Npc: npc}
	case format.ObjectSign:
		out.Kind = &mapv1.MapObject_Sign{Sign: &mapv1.Sign{Script: o.Script, Facing: facings[o.Facing]}}
	case format.ObjectHiddenItem:
		out.Kind = &mapv1.MapObject_HiddenItem{HiddenItem: &mapv1.HiddenItem{
			Item: o.Item, Quantity: uint32(max(o.Quantity, 1)), Flag: o.Flag, Underfoot: o.Underfoot}}
	case format.ObjectTrigger:
		out.Kind = &mapv1.MapObject_Trigger{Trigger: &mapv1.Trigger{Script: o.Script, Var: o.Var, Value: int32(o.Value)}}
	}
	return out
}

var directions = map[format.Direction]mapv1.Direction{
	format.North: mapv1.Direction_DIRECTION_NORTH, format.South: mapv1.Direction_DIRECTION_SOUTH,
	format.West: mapv1.Direction_DIRECTION_WEST, format.East: mapv1.Direction_DIRECTION_EAST,
}

func connections(m *format.Map) []*mapv1.Connection {
	var out []*mapv1.Connection
	for _, e := range m.Connections.Each() {
		out = append(out, &mapv1.Connection{Direction: directions[e.Direction], Map: e.Map, Offset: int32(e.Offset)})
	}
	return out
}

func allows(m *format.Map, what string) bool {
	for _, a := range m.Allow {
		if a == what {
			return true
		}
	}
	return false
}

func write(path string, msg proto.Message) error {
	data, err := proto.MarshalOptions{Deterministic: true}.Marshal(msg)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

// clean empties a folder of runtime maps, so removed maps don't linger.
func clean(dir string) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), Ext) {
			if err := os.Remove(filepath.Join(dir, e.Name())); err != nil {
				return err
			}
		}
	}
	return nil
}
