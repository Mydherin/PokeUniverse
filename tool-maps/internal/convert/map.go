package convert

import (
	"fmt"
	"strconv"
	"strings"

	"pokeuniverse/tool-maps/internal/firered"
	"pokeuniverse/tool-maps/internal/format"
	"pokeuniverse/tool-maps/internal/world"
)

func (c *converter) convertMap(fm *firered.Map, stats cellStats, sharedLayout bool) error {
	l, ok := c.layouts[fm.Layout]
	if !ok {
		return fmt.Errorf("layout %s not found", fm.Layout)
	}
	id := firered.Snake(fm.Name)
	m := &format.Map{
		ID:          id,
		Type:        firered.Constant(fm.Type, "MAP_TYPE_"),
		Region:      firered.Constant(fm.Region, "MAPSEC_"),
		Music:       firered.Constant(fm.Music, ""),
		Weather:     firered.Constant(fm.Weather, "WEATHER_"),
		ShowName:    fm.ShowName,
		Flash:       fm.Flash,
		Floor:       fm.Floor,
		BattleScene: firered.Constant(fm.BattleScene, "MAP_BATTLE_SCENE_"),
	}
	if m.BattleScene == "normal" {
		m.BattleScene = ""
	}
	if fm.Running {
		m.Allow = append(m.Allow, format.AllowRunning)
	}
	if fm.Cycling {
		m.Allow = append(m.Allow, format.AllowCycling)
	}
	if fm.Escaping {
		m.Allow = append(m.Allow, format.AllowEscaping)
	}
	grid, err := c.grid(l, stats)
	if err != nil {
		return err
	}
	if sharedLayout {
		m.Layout = layoutID(l)
		layout := &format.Layout{ID: m.Layout, Grid: *grid}
		if err := c.save(world.LayoutsDir, m.Layout, func(path string) error { return format.WriteLayout(path, layout) }); err != nil {
			return err
		}
	} else {
		m.Grid = *grid
	}
	c.connections(fm, m)
	c.warps(fm, m)
	objects(fm, m)
	return c.save(world.MapsDir, id, func(path string) error { return format.WriteMap(path, m) })
}

// layoutID names a shared layout: "LAYOUT_POKEMON_CENTER_1F" → "pokemon_center_1f".
func layoutID(l *firered.Layout) string { return firered.Snake(strings.TrimSuffix(l.Name, "_Layout")) }

var directions = map[string]format.Direction{"up": format.North, "down": format.South, "left": format.West, "right": format.East}

func (c *converter) connections(fm *firered.Map, m *format.Map) {
	for _, conn := range fm.Connections {
		d, ok := directions[conn.Direction]
		name, kanto := c.names[conn.Map]
		if !ok || !kanto {
			c.Log("%s: connection %s to %s left out (not a Kanto edge)", m.ID, conn.Direction, conn.Map)
			continue
		}
		m.Connections.Set(d, &format.Connection{Map: firered.Snake(name), Offset: conn.Offset})
	}
}

// warpIDs names a map's warps after where they lead, without the part both maps share:
// on pallet_town_players_house_2f, the warp to pallet_town_players_house_1f is "1f".
func warpIDs(fm *firered.Map, names map[string]string) []string {
	self := firered.Snake(fm.Name)
	used := map[string]int{}
	var out []string
	for _, w := range fm.Warps {
		id := format.DynamicWarp
		if name, ok := names[w.Dest]; ok {
			id = strings.TrimPrefix(firered.Snake(name), sharedPrefix(self, firered.Snake(name)))
		} else if w.Dest != "MAP_DYNAMIC" {
			id = firered.Constant(w.Dest, "MAP_")
		}
		used[id]++
		if used[id] > 1 {
			id += "_" + strconv.Itoa(used[id])
		}
		out = append(out, id)
	}
	return out
}

// sharedPrefix is the longest common prefix of whole words, unless it is all of b.
func sharedPrefix(a, b string) string {
	n := 0
	for i := 0; i < len(a) && i < len(b) && a[i] == b[i]; i++ {
		if a[i] == '_' {
			n = i + 1
		}
	}
	if n >= len(b) {
		return ""
	}
	return b[:n]
}

func (c *converter) warps(fm *firered.Map, m *format.Map) {
	ids := c.warpIDs[m.ID]
	for i, w := range fm.Warps {
		wp := format.Warp{ID: ids[i], At: format.Point{w.X, w.Y}}
		switch name, ok := c.names[w.Dest]; {
		case w.Dest == "MAP_DYNAMIC":
			wp.To = format.DynamicWarp
		case ok:
			wp.To = firered.Snake(name)
			dest, _ := strconv.Atoi(w.DestID)
			if spawns := c.warpIDs[wp.To]; dest < len(spawns) {
				wp.Spawn = spawns[dest]
			}
		default:
			c.Log("%s: warp at %v to %s left out (not in Kanto)", m.ID, wp.At, w.Dest)
			continue
		}
		m.Warps = append(m.Warps, wp)
	}
}

var facings = map[string]string{
	"BG_EVENT_PLAYER_FACING_NORTH": "up", "BG_EVENT_PLAYER_FACING_SOUTH": "down",
	"BG_EVENT_PLAYER_FACING_WEST": "left", "BG_EVENT_PLAYER_FACING_EAST": "right",
}

// objects converts NPCs, signs, hidden items and triggers. IDs come from their scripts
// ("PalletTown_PlayersHouse_2F_EventScript_PC" → "pc"); scripts of this map are written by
// name, shared ones as "scope.name" ("common.pkmn_center_nurse").
func objects(fm *firered.Map, m *format.Map) {
	used := map[string]int{}
	unique := func(id string) string {
		used[id]++
		if used[id] > 1 {
			return id + "_" + strconv.Itoa(used[id])
		}
		return id
	}
	for _, o := range fm.Objects {
		if o.Type != "object" {
			continue // clones only show a neighbor map's object at the edge
		}
		script, name := scriptRef(o.Script, m.ID)
		if name == "" {
			name = firered.Constant(o.LocalID, "LOCALID_")
		}
		if name == "" {
			name = firered.Constant(o.Graphics, "OBJ_EVENT_GFX_")
		}
		obj := format.Object{
			Type: format.ObjectNPC, ID: unique(name), At: format.Point{o.X, o.Y},
			Sprite:   firered.Constant(o.Graphics, "OBJ_EVENT_GFX_"),
			Movement: firered.Constant(o.Movement, "MOVEMENT_TYPE_"),
			Script:   script,
			Flag:     firered.Constant(o.Flag, "FLAG_"),
		}
		if o.RangeX != 0 || o.RangeY != 0 {
			obj.Range = &format.Point{o.RangeX, o.RangeY}
		}
		if strings.HasPrefix(o.TrainerType, "TRAINER_TYPE_") && o.TrainerType != "TRAINER_TYPE_NONE" {
			sight, _ := strconv.Atoi(o.TrainerSight)
			obj.Trainer = &format.Trainer{Type: firered.Constant(o.TrainerType, "TRAINER_TYPE_"), Sight: sight}
		}
		m.Objects = append(m.Objects, obj)
	}
	for _, b := range fm.BGs {
		at := format.Point{b.X, b.Y}
		switch b.Type {
		case "sign":
			script, name := scriptRef(b.Script, m.ID)
			if name == "" {
				name = "sign"
			}
			m.Objects = append(m.Objects, format.Object{Type: format.ObjectSign, ID: unique(name), At: at, Script: script, Facing: facings[b.Facing]})
		case "hidden_item":
			item := firered.Constant(b.Item, "ITEM_")
			obj := format.Object{Type: format.ObjectHiddenItem, ID: unique("hidden_" + item), At: at, Item: item,
				Flag: firered.Constant(b.Flag, "FLAG_"), Underfoot: b.Underfoot}
			if b.Quantity > 1 {
				obj.Quantity = b.Quantity
			}
			m.Objects = append(m.Objects, obj)
		}
	}
	for _, t := range fm.Coords {
		script, name := scriptRef(t.Script, m.ID)
		if name == "" {
			name = "trigger"
		}
		value, _ := strconv.Atoi(t.Value)
		m.Objects = append(m.Objects, format.Object{Type: format.ObjectTrigger, ID: unique(name), At: format.Point{t.X, t.Y},
			Var: firered.Constant(t.Var, "VAR_"), Value: value, Script: script})
	}
}

// scriptRef splits a FireRed script label into our reference and a name for the object.
func scriptRef(label, mapID string) (ref, name string) {
	if firered.Constant(label, "") == "" {
		return "", ""
	}
	scope, base, found := strings.Cut(label, "_EventScript_")
	if !found {
		scope, base = "", strings.TrimPrefix(label, "EventScript_")
	}
	name = firered.Snake(base)
	if s := firered.Snake(scope); s != "" && s != mapID {
		return s + "." + name, name
	}
	return name, name
}
