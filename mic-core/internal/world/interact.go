package world

import (
	mapv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/map/v1"
	worldv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/world/v1"
)

// Script is what an interaction runs. Phase 5 replaces these tables with the event interpreter.
type Script []*worldv1.ScriptStep

func message(text string) *worldv1.ScriptStep {
	return &worldv1.ScriptStep{Action: &worldv1.ScriptStep_Message{Message: &worldv1.Message{Text: text}}}
}

func sound(id string) *worldv1.ScriptStep {
	return &worldv1.ScriptStep{Action: &worldv1.ScriptStep_Sound{Sound: id}}
}

// signScripts are the scripts of sign objects, by map and name (lib-maps objects' `script`).
var signScripts = map[string]Script{
	"pallet_town_players_house_2f.nes":  {message("pallet_town_players_house_2f.played_with_nes")},
	"pallet_town_players_house_2f.sign": {message("pallet_town_players_house_2f.press_lr_for_help")},
	// The bedroom PC's menu (item storage) comes with items.
	"pallet_town_players_house_2f.pc": {sound("se_pc_on"), message("common.player_booted_up_pc")},
}

// tileScript is what checking a tile with a behavior says (GetInteractedMetatileScript).
type tileScript struct {
	text string
	// Only when facing north (TVs, Mart and Center signs).
	north bool
	sign  bool
}

var tileScripts = map[mapv1.TileBehavior]tileScript{
	mapv1.TileBehavior_TILE_BEHAVIOR_BOOKSHELF:             {text: "flavor.bookshelf"},
	mapv1.TileBehavior_TILE_BEHAVIOR_POKEMART_SHELF:        {text: "flavor.pokemart_shelf"},
	mapv1.TileBehavior_TILE_BEHAVIOR_FOOD:                  {text: "flavor.food"},
	mapv1.TileBehavior_TILE_BEHAVIOR_BLUEPRINTS:            {text: "flavor.blueprints"},
	mapv1.TileBehavior_TILE_BEHAVIOR_BURGLARY:              {text: "flavor.burglary"},
	mapv1.TileBehavior_TILE_BEHAVIOR_COMPUTER:              {text: "flavor.computer"},
	mapv1.TileBehavior_TILE_BEHAVIOR_TELEVISION:            {text: "flavor.television", north: true},
	mapv1.TileBehavior_TILE_BEHAVIOR_CABINET:               {text: "flavor.cabinet"},
	mapv1.TileBehavior_TILE_BEHAVIOR_KITCHEN:               {text: "flavor.kitchen"},
	mapv1.TileBehavior_TILE_BEHAVIOR_DRESSER:               {text: "flavor.dresser"},
	mapv1.TileBehavior_TILE_BEHAVIOR_PAINTING:              {text: "flavor.painting"},
	mapv1.TileBehavior_TILE_BEHAVIOR_POWER_PLANT_MACHINE:   {text: "flavor.power_plant_machine"},
	mapv1.TileBehavior_TILE_BEHAVIOR_TELEPHONE:             {text: "flavor.telephone"},
	mapv1.TileBehavior_TILE_BEHAVIOR_ADVERTISING_POSTER:    {text: "flavor.advertising_poster"},
	mapv1.TileBehavior_TILE_BEHAVIOR_FOOD_SMELLS_TASTY:     {text: "flavor.tasty_food"},
	mapv1.TileBehavior_TILE_BEHAVIOR_TRASH_BIN:             {text: "flavor.trash_bin"},
	mapv1.TileBehavior_TILE_BEHAVIOR_CUP:                   {text: "flavor.cup"},
	mapv1.TileBehavior_TILE_BEHAVIOR_BLINKING_LIGHTS:       {text: "flavor.blinking_lights"},
	mapv1.TileBehavior_TILE_BEHAVIOR_NEATLY_LINED_UP_TOOLS: {text: "flavor.neatly_lined_up_tools"},
	mapv1.TileBehavior_TILE_BEHAVIOR_POKEMART_SIGN:         {text: "flavor.pokemart_sign", north: true, sign: true},
	mapv1.TileBehavior_TILE_BEHAVIOR_POKEMON_CENTER_SIGN:   {text: "flavor.pokecenter_sign", north: true, sign: true},
}

// Interaction is what the player at p facing d checks with A, in FireRed's order: a sign on the
// faced tile, then the faced tile's behavior (NPCs come first once they exist). walkInto is
// walking up to a signpost, which only reads signs on signpost tiles. Nil when nothing answers.
func Interaction(m *Map, p Point, d mapv1.Direction, walkInto bool) Script {
	at := p.Step(d)
	behavior := m.Behavior(at)
	signpost := behavior == mapv1.TileBehavior_TILE_BEHAVIOR_SIGNPOST
	if walkInto && (!signpost || (d != mapv1.Direction_DIRECTION_NORTH && d != mapv1.Direction_DIRECTION_SOUTH)) {
		return nil
	}
	if s := m.SignAt(at); s != nil && (s.Facing == mapv1.Direction_DIRECTION_UNSPECIFIED || s.Facing == d) {
		script := signScripts[m.ID+"."+s.Script]
		if !signpost {
			return script
		}
		// Read from a signpost: every message shows in the signpost frame (MsgSetSignpost).
		out := make(Script, len(script))
		for i, step := range script {
			if msg := step.GetMessage(); msg != nil {
				step = &worldv1.ScriptStep{Action: &worldv1.ScriptStep_Message{Message: &worldv1.Message{Text: msg.Text, Sign: true}}}
			}
			out[i] = step
		}
		return out
	}
	if walkInto {
		return nil
	}
	if t, ok := tileScripts[behavior]; ok && (!t.north || d == mapv1.Direction_DIRECTION_NORTH) {
		return Script{{Action: &worldv1.ScriptStep_Message{Message: &worldv1.Message{Text: t.text, Sign: t.sign}}}}
	}
	return nil
}
