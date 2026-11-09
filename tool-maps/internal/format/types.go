// Package format is the text format of lib-maps: maps, shared layouts and tile catalogs
// (docs/maps.md). It only reads and writes files; meaning is checked by validate.
package format

// Point is a tile coordinate: [x, y] = [column, row], from 0 at the top-left.
type Point [2]int

func (p Point) X() int { return p[0] }
func (p Point) Y() int { return p[1] }

// Grid is what a map looks like: its tiles, elevations and border.
// A map holds one inline or shares one from layouts/.
type Grid struct {
	Tileset string `yaml:"tileset,omitempty"`
	Size    Point  `yaml:"size,omitempty"`
	// Tiles drawn outside the map where no connection is, as rows of tile names.
	Border [][]string `yaml:"border,omitempty"`
	// One character per tile name; ground uses the characters.
	Legend map[string]string `yaml:"legend,omitempty"`
	Ground string            `yaml:"ground,omitempty"`
	// Optional: '.' keeps the tile's elevation, a hex digit sets it.
	Elevation string     `yaml:"elevation,omitempty"`
	Overrides []Override `yaml:"overrides,omitempty"`
}

// Override changes one cell where the catalog's default doesn't fit.
type Override struct {
	At       Point `yaml:"at"`
	Walkable *bool `yaml:"walkable,omitempty"`
	// A catalog behavior or encounter name, as in Tile.
	Behavior  string `yaml:"behavior,omitempty"`
	Encounter string `yaml:"encounter,omitempty"`
}

// Layout is a grid shared by several maps (layouts/<id>.yaml).
type Layout struct {
	ID   string `yaml:"id"`
	Grid `yaml:",inline"`
}

// Map is one map file (maps/<id>.yaml).
type Map struct {
	ID          string   `yaml:"id"`
	Type        string   `yaml:"type"`
	Region      string   `yaml:"region,omitempty"`
	Music       string   `yaml:"music,omitempty"`
	Weather     string   `yaml:"weather,omitempty"`
	ShowName    bool     `yaml:"show_name,omitempty"`
	Flash       bool     `yaml:"flash,omitempty"`
	Allow       []string `yaml:"allow,omitempty"`
	Floor       int      `yaml:"floor,omitempty"`
	BattleScene string   `yaml:"battle_scene,omitempty"`
	// Shared layout ID; when set, the map has no grid of its own.
	Layout      string `yaml:"layout,omitempty"`
	Grid        `yaml:",inline"`
	Connections Connections `yaml:"connections,omitempty"`
	Warps       []Warp      `yaml:"warps,omitempty"`
	Objects     []Object    `yaml:"objects,omitempty"`
	Encounters  *Encounters `yaml:"encounters,omitempty"`
}

// Encounters is a map's wild Pokémon, one table per kind (docs/maps.md). Slot chances are
// FireRed's, fixed by slot position, so a table lists exactly its kind's slot count.
type Encounters struct {
	Land      *WildTable `yaml:"land,omitempty"`
	Water     *WildTable `yaml:"water,omitempty"`
	RockSmash *WildTable `yaml:"rock_smash,omitempty"`
	Fishing   *Fishing   `yaml:"fishing,omitempty"`
}

type WildTable struct {
	Rate  int        `yaml:"rate"`
	Slots []WildSlot `yaml:"slots"`
}

// Fishing shares one rate; its slots are split by rod.
type Fishing struct {
	Rate  int        `yaml:"rate"`
	Old   []WildSlot `yaml:"old"`
	Good  []WildSlot `yaml:"good"`
	Super []WildSlot `yaml:"super"`
}

// WildSlot is a species (lowercase, as in the species catalog: mr_mime) and a level range.
type WildSlot struct {
	Species string `yaml:"species"`
	Min     int    `yaml:"min"`
	Max     int    `yaml:"max"`
}

// Slot counts per kind, as FireRed's.
const (
	LandSlots      = 12
	WaterSlots     = 5
	RockSmashSlots = 5
	OldRodSlots    = 2
	GoodRodSlots   = 3
	SuperRodSlots  = 5
)

// Allow values.
const (
	AllowRunning  = "running"
	AllowCycling  = "cycling"
	AllowEscaping = "escaping"
)

// Map types.
var MapTypes = []string{"town", "route", "indoor", "underground"}

// Connections joins maps along their edges.
type Connections struct {
	North *Connection `yaml:"north,omitempty"`
	South *Connection `yaml:"south,omitempty"`
	West  *Connection `yaml:"west,omitempty"`
	East  *Connection `yaml:"east,omitempty"`
}

// Each returns the set connections, in a fixed order.
func (c Connections) Each() []Edge {
	var out []Edge
	for _, e := range []Edge{{North, c.North}, {South, c.South}, {West, c.West}, {East, c.East}} {
		if e.Connection != nil {
			out = append(out, e)
		}
	}
	return out
}

func (c *Connections) Set(d Direction, conn *Connection) {
	switch d {
	case North:
		c.North = conn
	case South:
		c.South = conn
	case West:
		c.West = conn
	case East:
		c.East = conn
	}
}

func (c Connections) Get(d Direction) *Connection {
	switch d {
	case North:
		return c.North
	case South:
		return c.South
	case West:
		return c.West
	}
	return c.East
}

type Direction string

const (
	North Direction = "north"
	South Direction = "south"
	West  Direction = "west"
	East  Direction = "east"
)

func (d Direction) Opposite() Direction {
	switch d {
	case North:
		return South
	case South:
		return North
	case West:
		return East
	}
	return West
}

type Edge struct {
	Direction Direction
	*Connection
}

// Connection is written "north: route_1", or "north: { map: route_1, offset: 3 }" when shifted.
type Connection struct {
	Map    string `yaml:"map"`
	Offset int    `yaml:"offset,omitempty"`
}

// Warp moves the player to the spawn warp of another map; "to: dynamic" goes back where they came from.
type Warp struct {
	ID    string `yaml:"id"`
	At    Point  `yaml:"at"`
	To    string `yaml:"to"`
	Spawn string `yaml:"spawn,omitempty"`
}

// DynamicWarp is the "to" of warps that lead back to the previous map.
const DynamicWarp = "dynamic"

// Object is anything placed on a map; Type decides which fields apply.
type Object struct {
	Type string `yaml:"type"`
	ID   string `yaml:"id"`
	At   Point  `yaml:"at"`
	// npc
	Sprite   string   `yaml:"sprite,omitempty"`
	Movement string   `yaml:"movement,omitempty"`
	Range    *Point   `yaml:"range,omitempty"`
	Trainer  *Trainer `yaml:"trainer,omitempty"`
	// sign
	Facing string `yaml:"facing,omitempty"`
	// hidden_item
	Item      string `yaml:"item,omitempty"`
	Quantity  int    `yaml:"quantity,omitempty"`
	Underfoot bool   `yaml:"underfoot,omitempty"`
	// trigger
	Var   string `yaml:"var,omitempty"`
	Value int    `yaml:"value,omitempty"`
	// npc, sign, trigger: a script of this map, or "scope.name" for a shared one.
	Script string `yaml:"script,omitempty"`
	// npc, hidden_item: story flag
	Flag string `yaml:"flag,omitempty"`
}

// Object types.
const (
	ObjectNPC        = "npc"
	ObjectSign       = "sign"
	ObjectHiddenItem = "hidden_item"
	ObjectTrigger    = "trigger"
)

type Trainer struct {
	Type  string `yaml:"type"`
	Sight int    `yaml:"sight"`
}

// Tileset is a tile catalog (tilesets/<id>.yaml): every tile's name and properties.
type Tileset struct {
	ID string `yaml:"id"`
	// Tileset whose tiles this one adds to; a map may use the tiles of both.
	Base string `yaml:"base,omitempty"`
	// FireRed tileset folder its art is rendered from (tool-maps tilesets).
	FireRed string          `yaml:"firered,omitempty"`
	Tiles   map[string]Tile `yaml:"tiles"`
}

// Tile is one 16×16 tile. Index is its frame in the tileset's art.
type Tile struct {
	Index     int    `yaml:"index"`
	Walkable  bool   `yaml:"walkable"`
	Elevation int    `yaml:"elevation"`
	Behavior  string `yaml:"behavior,omitempty"`
	Encounter string `yaml:"encounter,omitempty"`
}

// Encounter values.
const (
	EncounterLand  = "land"
	EncounterWater = "water"
)
