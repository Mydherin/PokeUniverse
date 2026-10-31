// Package firered reads the FireRed decompilation (references/pokefirered) as input:
// maps, layouts, block grids and tilesets. It never writes to it.
package firered

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// Block grid entries (map.bin): metatile, collision and elevation of one cell.
const (
	blockMetatileMask = 0x03ff
	blockCollision    = 10
	blockElevation    = 12
)

type Block uint16

func (b Block) Metatile() int  { return int(b & blockMetatileMask) }
func (b Block) Walkable() bool { return (b>>blockCollision)&3 == 0 }
func (b Block) Elevation() int { return int(b >> blockElevation) }

type Decomp struct{ Root string }

func (d Decomp) path(rel string) string { return filepath.Join(d.Root, rel) }

// Check fails when the submodule is missing or empty.
func (d Decomp) Check() error {
	if _, err := os.Stat(d.path("data/layouts/layouts.json")); err != nil {
		return fmt.Errorf("%s is not the FireRed decompilation (run git submodule update --init): %w", d.Root, err)
	}
	return nil
}

type Layout struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Width        int    `json:"width"`
	Height       int    `json:"height"`
	BorderWidth  int    `json:"border_width"`
	BorderHeight int    `json:"border_height"`
	Primary      string `json:"primary_tileset"`
	Secondary    string `json:"secondary_tileset"`
	BorderPath   string `json:"border_filepath"`
	BlocksPath   string `json:"blockdata_filepath"`
}

// Layouts returns every layout by ID (LAYOUT_...).
func (d Decomp) Layouts() (map[string]*Layout, error) {
	var file struct {
		Layouts []*Layout `json:"layouts"`
	}
	if err := readJSON(d.path("data/layouts/layouts.json"), &file); err != nil {
		return nil, err
	}
	out := map[string]*Layout{}
	for _, l := range file.Layouts {
		if l.ID != "" {
			out[l.ID] = l
		}
	}
	return out, nil
}

func (d Decomp) Blocks(rel string) ([]Block, error) {
	data, err := os.ReadFile(d.path(rel))
	if err != nil {
		return nil, err
	}
	out := make([]Block, len(data)/2)
	for i := range out {
		out[i] = Block(binary.LittleEndian.Uint16(data[i*2:]))
	}
	return out, nil
}

type Map struct {
	ID          string        `json:"id"`
	Name        string        `json:"name"`
	Layout      string        `json:"layout"`
	Music       string        `json:"music"`
	Region      string        `json:"region_map_section"`
	Flash       bool          `json:"requires_flash"`
	Weather     string        `json:"weather"`
	Type        string        `json:"map_type"`
	Cycling     bool          `json:"allow_cycling"`
	Escaping    bool          `json:"allow_escaping"`
	Running     bool          `json:"allow_running"`
	ShowName    bool          `json:"show_map_name"`
	Floor       int           `json:"floor_number"`
	BattleScene string        `json:"battle_scene"`
	Connections []Connection  `json:"connections"`
	Objects     []ObjectEvent `json:"object_events"`
	Warps       []WarpEvent   `json:"warp_events"`
	Coords      []CoordEvent  `json:"coord_events"`
	BGs         []BGEvent     `json:"bg_events"`
}

type Connection struct {
	Map       string `json:"map"`
	Offset    int    `json:"offset"`
	Direction string `json:"direction"`
}

type ObjectEvent struct {
	Type         string `json:"type"` // object, or clone (a copy of a neighbor map's object)
	LocalID      string `json:"local_id"`
	Graphics     string `json:"graphics_id"`
	X            int    `json:"x"`
	Y            int    `json:"y"`
	Movement     string `json:"movement_type"`
	RangeX       int    `json:"movement_range_x"`
	RangeY       int    `json:"movement_range_y"`
	TrainerType  string `json:"trainer_type"`
	TrainerSight string `json:"trainer_sight_or_berry_tree_id"`
	Script       string `json:"script"`
	Flag         string `json:"flag"`
}

type WarpEvent struct {
	X      int    `json:"x"`
	Y      int    `json:"y"`
	Dest   string `json:"dest_map"`
	DestID string `json:"dest_warp_id"`
}

type CoordEvent struct {
	X      int    `json:"x"`
	Y      int    `json:"y"`
	Var    string `json:"var"`
	Value  string `json:"var_value"`
	Script string `json:"script"`
}

type BGEvent struct {
	Type      string `json:"type"` // sign or hidden_item
	X         int    `json:"x"`
	Y         int    `json:"y"`
	Facing    string `json:"player_facing_dir"`
	Script    string `json:"script"`
	Item      string `json:"item"`
	Flag      string `json:"flag"`
	Quantity  int    `json:"quantity"`
	Underfoot bool   `json:"underfoot"`
}

// Maps returns every map, sorted by name.
func (d Decomp) Maps() ([]*Map, error) {
	paths, err := filepath.Glob(d.path("data/maps/*/map.json"))
	if err != nil {
		return nil, err
	}
	var out []*Map
	for _, p := range paths {
		m := &Map{}
		if err := readJSON(p, m); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

// TilesetDirs maps tileset symbols (gTileset_General) to their folders (data/tilesets/primary/general).
func (d Decomp) TilesetDirs() (map[string]string, error) {
	data, err := os.ReadFile(d.path("src/data/tilesets/metatiles.h"))
	if err != nil {
		return nil, err
	}
	out := map[string]string{}
	for _, m := range regexp.MustCompile(`gMetatiles_(\w+)\[\] = INCBIN_U16\("([^"]+)/metatiles\.bin"\)`).FindAllStringSubmatch(string(data), -1) {
		out["gTileset_"+m[1]] = m[2]
	}
	return out, nil
}

// Behaviors maps metatile behavior values to their names without MB_ (0x02 → "tall_grass").
func (d Decomp) Behaviors() (map[int]string, error) {
	data, err := os.ReadFile(d.path("include/constants/metatile_behaviors.h"))
	if err != nil {
		return nil, err
	}
	out := map[int]string{}
	for _, m := range regexp.MustCompile(`#define MB_(\w+) (0x[0-9A-Fa-f]+)`).FindAllStringSubmatch(string(data), -1) {
		v, _ := strconv.ParseInt(m[2], 0, 32)
		out[int(v)] = strings.ToLower(m[1])
	}
	return out, nil
}

func readJSON(path string, v any) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(data, v); err != nil {
		return fmt.Errorf("%s: %w", path, err)
	}
	return nil
}
