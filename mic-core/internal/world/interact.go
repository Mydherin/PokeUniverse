package world

import (
	"pokeuniverse/mic-core/internal/pokemon"

	mapv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/map/v1"
	worldv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/world/v1"
)

// Script is what an interaction runs. Phase 10 replaces these tables with the event interpreter.
type Script []*worldv1.ScriptStep

func message(text string) *worldv1.ScriptStep {
	return &worldv1.ScriptStep{Action: &worldv1.ScriptStep_Message{Message: &worldv1.Message{Text: text}}}
}

func sound(id string) *worldv1.ScriptStep {
	return &worldv1.ScriptStep{Action: &worldv1.ScriptStep_Sound{Sound: id}}
}

// pcScreen is AnimatePcTurnOn (on) or AnimatePcTurnOff.
func pcScreen(pc worldv1.Pc, on bool) *worldv1.ScriptStep {
	return &worldv1.ScriptStep{Action: &worldv1.ScriptStep_PcScreen{PcScreen: &worldv1.PcScreen{Pc: pc, On: on}}}
}

// playersPC is the player's PC menu; the zone fills in what it stores (withPlayer).
func playersPC() *worldv1.ScriptStep {
	return &worldv1.ScriptStep{Action: &worldv1.ScriptStep_PlayersPc{PlayersPc: &worldv1.PlayersPc{}}}
}

// faceOriginal turns the NPC that answers back to where it faced (Common_Movement_FaceOriginalDirection).
func faceOriginal() *worldv1.ScriptStep {
	return &worldv1.ScriptStep{Action: &worldv1.ScriptStep_FaceOriginal{FaceOriginal: true}}
}

// yesNo is a YES/NO menu over the last message; `no` plays on NO, then the script ends.
func yesNo(no ...*worldv1.ScriptStep) *worldv1.ScriptStep {
	return &worldv1.ScriptStep{Action: &worldv1.ScriptStep_YesNo{YesNo: &worldv1.YesNo{No: no}}}
}

// trainerBattle starts a battle with a trainer of internal/battle's table.
// music plays a song on the BGM player (a trainer's encounter music) until the script ends.
func music(id string) *worldv1.ScriptStep {
	return &worldv1.ScriptStep{Action: &worldv1.ScriptStep_Music{Music: id}}
}

func trainerBattle(trainer string) *worldv1.ScriptStep {
	return &worldv1.ScriptStep{Action: &worldv1.ScriptStep_TrainerBattle{TrainerBattle: &worldv1.TrainerBattle{Trainer: trainer}}}
}

// npcScripts are the scripts of NPC objects, by map and name (lib-maps objects' `script`).
var npcScripts = map[string]Script{
	// PalletTown_PlayersHouse_1F_EventScript_Mom; healing after the rival's battle comes with the story flags (Phase 10).
	"pallet_town_players_house_1f.mom": {message("pallet_town_players_house_1f.mom"), faceOriginal()},
	// Test content (phase-5): removed in Phase 10. Asks, heals both teams
	// (the trainer table's Heals) and battles with FireRed's encounter music for COOLTRAINERs
	// (MUS_ENCOUNTER_BOY) during the intro; after a win, the post-battle text.
	"pallet_town_players_house_2f.test_trainer": {
		message("test_trainer.question"), yesNo(),
		music("mus_encounter_boy"), message("test_trainer.intro"), trainerBattle("test_trainer"),
		message("test_trainer.post_battle"),
	},
	// Test content, as above: the same script in a double battle.
	"pallet_town_players_house_2f.test_double_trainer": {
		message("test_trainer.question"), yesNo(),
		music("mus_encounter_boy"), message("test_trainer.intro"), trainerBattle("test_double_trainer"),
		message("test_trainer.post_battle"),
	},
}

// signScripts are the scripts of sign objects, by map and name (lib-maps objects' `script`).
var signScripts = map[string]Script{
	// Its side and back, FireRed's "Oops, wrong side...", can't be reached.
	"pallet_town_players_house_1f.tv":   {message("pallet_town_players_house_1f.tv")},
	"pallet_town_players_house_2f.nes":  {message("pallet_town_players_house_2f.played_with_nes")},
	"pallet_town_players_house_2f.sign": {message("pallet_town_players_house_2f.press_lr_for_help")},
	// PalletTown_PlayersHouse_2F_EventScript_PC, then ..._ShutDownPC once the player turns it off.
	"pallet_town_players_house_2f.pc": {
		pcScreen(worldv1.Pc_PC_PLAYERS, true), sound("se_pc_on"), message("common.player_booted_up_pc"),
		playersPC(),
		sound("se_pc_off"), pcScreen(worldv1.Pc_PC_PLAYERS, false),
	},
}

// girlTexts are the messages FireRed says differently to a girl (checkplayergender).
var girlTexts = map[string]string{
	"pallet_town_players_house_1f.mom": "pallet_town_players_house_1f.mom_girl",
	"pallet_town_players_house_1f.tv":  "pallet_town_players_house_1f.tv_girl",
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

// Interaction is what the player at p facing d checks with A, in FireRed's order: an NPC on
// the faced tile (it turns to the player: the NPC's ID is returned), a sign there, then the
// faced tile's behavior. walkInto is walking up to a signpost, which only reads signs on
// signpost tiles. Nil when nothing answers. Some NPCs' scripts read the party (partyScripts).
func Interaction(m *Map, p Point, d mapv1.Direction, walkInto bool, party pokemon.Party) (Script, string) {
	at := p.Step(d)
	o := m.NpcAt(at)
	if o == nil && m.Behavior(at) == mapv1.TileBehavior_TILE_BEHAVIOR_COUNTER {
		// An NPC on the other side of a counter (GetInteractedObjectEventScript).
		o = m.NpcAt(at.Step(d))
	}
	if o != nil && !walkInto {
		if build := partyScripts[o.GetNpc().GetScript()]; build != nil {
			return build(party), o.Id
		}
		if script := npcScripts[m.ID+"."+o.GetNpc().GetScript()]; len(script) > 0 {
			return script, o.Id
		}
	}
	behavior := m.Behavior(at)
	signpost := behavior == mapv1.TileBehavior_TILE_BEHAVIOR_SIGNPOST
	if walkInto && (!signpost || (d != mapv1.Direction_DIRECTION_NORTH && d != mapv1.Direction_DIRECTION_SOUTH)) {
		return nil, ""
	}
	if s := m.SignAt(at); s != nil && (s.Facing == mapv1.Direction_DIRECTION_UNSPECIFIED || s.Facing == d) {
		script := signScripts[m.ID+"."+s.Script]
		if !signpost {
			return script, ""
		}
		// Read from a signpost: every message shows in the signpost frame (MsgSetSignpost).
		out := make(Script, len(script))
		for i, step := range script {
			if msg := step.GetMessage(); msg != nil {
				step = &worldv1.ScriptStep{Action: &worldv1.ScriptStep_Message{Message: &worldv1.Message{Text: msg.Text, Sign: true}}}
			}
			out[i] = step
		}
		return out, ""
	}
	if walkInto {
		return nil, ""
	}
	if t, ok := tileScripts[behavior]; ok && (!t.north || d == mapv1.Direction_DIRECTION_NORTH) {
		return Script{{Action: &worldv1.ScriptStep_Message{Message: &worldv1.Message{Text: t.text, Sign: t.sign}}}}, ""
	}
	return nil, ""
}
