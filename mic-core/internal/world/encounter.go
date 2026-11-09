package world

import (
	battlev1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/battle/v1"
	mapv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/map/v1"
	realtimev1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/realtime/v1"
	worldv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/world/v1"

	"pokeuniverse/mic-core/internal/encounter"
	"pokeuniverse/mic-core/internal/item"
	"pokeuniverse/mic-core/internal/pokemon"
)

// Wild encounters on the map (phase-7 M3): the step check, Repel's steps and Sweet Scent.

// stepped follows an accepted step as FireRed's ProcessPlayerFieldInput does: the step-based
// scripts first (TryStartStepBasedScript: a warp's cell, then Repel's counter, whose message
// takes the step), then the wild encounter test (CheckStandardWildEncounter).
func (z *zone) stepped(p *Player) {
	if z.m.WarpAt(p.pos) != nil {
		return
	}
	if p.items.RepelSteps > 0 {
		// UpdateRepelCounter (576). Saved when it wears off and on leaving (phase-7 D8).
		p.items.RepelSteps--
		if p.items.RepelSteps == 0 {
			z.saveTrainer(p, item.Changed{State: true}, false)
			z.startScript(p, Script{signMessage("common.repel_wore_off")})
			return
		}
	}
	mon, _, ok := p.encounter.Step(z.m.Wild, z.m.Encounter(p.pos), z.m.Behavior(p.pos), p.encounterField(), p.encounterOptions(), pokemon.ServerRNG)
	if ok {
		z.meetWild(p, mon)
	}
}

// sweetScent is Sweet Scent from the party menu (SweetScentWildEncounter 464): a wild battle where
// the player stands, else "Looks like there's nothing here…". The client plays the fade first.
func (z *zone) sweetScent(p *Player) {
	mon, _, ok := encounter.SweetScent(z.m.Wild, z.m.Encounter(p.pos), p.encounterOptions(), pokemon.ServerRNG)
	if !ok {
		z.startScript(p, Script{signMessage("common.sweet_scent_nothing")})
		return
	}
	z.meetWild(p, mon)
}

// meetWild runs a script whose WildBattle step starts the battle with the Pokémon (ScriptBattle).
func (z *zone) meetWild(p *Player, mon *pokemon.Pokemon) {
	z.startScript(p, Script{{Action: &worldv1.ScriptStep_WildBattle{WildBattle: true}}})
	p.wild = mon
}

// startScript runs a script mic-core starts itself: the player is locked until it ends.
func (z *zone) startScript(p *Player, steps Script) {
	p.lastScript++
	p.script = p.lastScript
	p.queue(&realtimev1.ServerMessage{Payload: &realtimev1.ServerMessage_Script{Script: &worldv1.Script{Id: p.script, Steps: z.withPlayer(p, steps)}}})
}

func signMessage(text string) *worldv1.ScriptStep {
	return &worldv1.ScriptStep{Action: &worldv1.ScriptStep_Message{Message: &worldv1.Message{Text: text, Sign: true}}}
}

// clearFlute is ClearTempFieldEventData on a map change: the flutes last until the player leaves
// the map. Saved with the arrival.
func (p *Player) clearFlute() bool {
	if p.items.Flute == item.FluteNone {
		return false
	}
	p.items.Flute = item.FluteNone
	return true
}

func (p *Player) encounterField() encounter.Field {
	f := encounter.Field{Repel: p.items.RepelSteps > 0}
	switch p.items.Flute {
	case item.FluteWhite:
		f.Flute = encounter.WhiteFlute
	case item.FluteBlack:
		f.Flute = encounter.BlackFlute
	}
	return f
}

func (p *Player) encounterOptions() encounter.Options {
	o := encounter.Options{Trainer: pokemon.Trainer{ID: p.trainerID, Gender: p.gender}}
	if len(p.party) > 0 {
		o.Lead = p.party[0]
	}
	if p.items.RepelSteps > 0 {
		o.RepelLevel = encounter.RepelLevel(p.party)
	}
	return o
}

// terrain is BattleSetup_GetTerrainId (battle_setup.c 466) for the cell the player stands on.
// Our maps have no long grass, bridges, ocean routes, underwater or secret bases (FireRed has
// none of the first two either).
func terrain(m *Map, at Point) battlev1.BattleTerrain {
	b := m.Behavior(at)
	switch b {
	case mapv1.TileBehavior_TILE_BEHAVIOR_TALL_GRASS:
		return battlev1.BattleTerrain_BATTLE_TERRAIN_GRASS
	case mapv1.TileBehavior_TILE_BEHAVIOR_SAND, mapv1.TileBehavior_TILE_BEHAVIOR_SHALLOW_WATER:
		return battlev1.BattleTerrain_BATTLE_TERRAIN_SAND
	}
	switch m.Type {
	case mapv1.MapType_MAP_TYPE_UNDERGROUND:
		if surfable(b) {
			return battlev1.BattleTerrain_BATTLE_TERRAIN_POND
		}
		return battlev1.BattleTerrain_BATTLE_TERRAIN_CAVE
	case mapv1.MapType_MAP_TYPE_INDOOR:
		return battlev1.BattleTerrain_BATTLE_TERRAIN_BUILDING
	}
	switch {
	case b == mapv1.TileBehavior_TILE_BEHAVIOR_FAST_WATER, b == mapv1.TileBehavior_TILE_BEHAVIOR_WATERFALL, b == mapv1.TileBehavior_TILE_BEHAVIOR_OCEAN_WATER:
		return battlev1.BattleTerrain_BATTLE_TERRAIN_WATER // IsDeepWaterTerrain
	case surfable(b):
		return battlev1.BattleTerrain_BATTLE_TERRAIN_POND
	case b == mapv1.TileBehavior_TILE_BEHAVIOR_MOUNTAIN_TOP:
		return battlev1.BattleTerrain_BATTLE_TERRAIN_MOUNTAIN
	}
	return battlev1.BattleTerrain_BATTLE_TERRAIN_PLAIN
}

// surfable is MetatileBehavior_IsSurfable (sBehaviorSurfable).
func surfable(b mapv1.TileBehavior) bool {
	switch b {
	case mapv1.TileBehavior_TILE_BEHAVIOR_POND_WATER, mapv1.TileBehavior_TILE_BEHAVIOR_FAST_WATER,
		mapv1.TileBehavior_TILE_BEHAVIOR_WATERFALL, mapv1.TileBehavior_TILE_BEHAVIOR_OCEAN_WATER,
		mapv1.TileBehavior_TILE_BEHAVIOR_CYCLING_ROAD_WATER, mapv1.TileBehavior_TILE_BEHAVIOR_EASTWARD_CURRENT,
		mapv1.TileBehavior_TILE_BEHAVIOR_WESTWARD_CURRENT, mapv1.TileBehavior_TILE_BEHAVIOR_NORTHWARD_CURRENT,
		mapv1.TileBehavior_TILE_BEHAVIOR_SOUTHWARD_CURRENT:
		return true
	}
	return false
}

// wildTransitions is sBattleTransitionTable_Wild (battle_setup.c 87): column 0 when the wild
// Pokémon's level is below the first healthy party member's.
var wildTransitions = [...][2]battlev1.BattleTransition{
	{battlev1.BattleTransition_BATTLE_TRANSITION_SLICE, battlev1.BattleTransition_BATTLE_TRANSITION_WHITE_BARS_FADE},
	{battlev1.BattleTransition_BATTLE_TRANSITION_CLOCKWISE_WIPE, battlev1.BattleTransition_BATTLE_TRANSITION_GRID_SQUARES},
	{battlev1.BattleTransition_BATTLE_TRANSITION_BLUR, battlev1.BattleTransition_BATTLE_TRANSITION_GRID_SQUARES},
	{battlev1.BattleTransition_BATTLE_TRANSITION_WAVE, battlev1.BattleTransition_BATTLE_TRANSITION_RIPPLE},
}

const (
	transitionNormal = iota
	transitionCave
	transitionFlash
	transitionWater
)

// wildTransition is GetWildBattleTransition (612) with GetBattleTransitionTypeByMap (517). Flash
// (a dark cave not yet lit) comes with Flash in Phase 12.
func wildTransition(m *Map, at Point, wildLevel int, party pokemon.Party) battlev1.BattleTransition {
	kind := transitionNormal
	switch {
	case surfable(m.Behavior(at)):
		kind = transitionWater
	case m.Type == mapv1.MapType_MAP_TYPE_UNDERGROUND:
		kind = transitionCave
	}
	col := 1
	if wildLevel < encounter.RepelLevel(party) { // GetSumOfPlayerPartyLevel(1): the first healthy one's level.
		col = 0
	}
	return wildTransitions[kind][col]
}
