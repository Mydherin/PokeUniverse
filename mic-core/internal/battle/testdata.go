// Test content (plans/battles/README.md): removed in Phase 5, when the NPC leaves the room.

package battle

import (
	battlev1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/battle/v1"
	itemv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/item/v1"
	movev1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/move/v1"
	pokemonv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/pokemon/v1"
	speciesv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/species/v1"
	"pokeuniverse/mic-core/internal/pokemon"
)

// maxIVs: the test trainer's Pokémon are as strong as their sets allow.
var maxIVs = &pokemon.Stats{31, 31, 31, 31, 31, 31}

func init() {
	// FireRed's Victory Road COOLTRAINER ROLANDO, with a Gen 4 team at Lv. 50 (moves checked
	// against Showdown's Gen 4 learnsets) and the gym leaders' AI.
	Trainers["test_trainer"] = &Trainer{
		Class: "cooltrainer", Name: "ROLANDO", Pic: "cooltrainer_m", DefeatText: "test_trainer.defeat",
		MoneyRate: 9, // TRAINER_CLASS_COOLTRAINER
		AI: []battlev1.AiFlag{battlev1.AiFlag_AI_FLAG_CHECK_BAD_MOVE, battlev1.AiFlag_AI_FLAG_TRY_TO_FAINT,
			battlev1.AiFlag_AI_FLAG_CHECK_VIABILITY, battlev1.AiFlag_AI_FLAG_SETUP_FIRST_TURN, battlev1.AiFlag_AI_FLAG_HP_AWARE},
		Items: []itemv1.Item{itemv1.Item_ITEM_HYPER_POTION, itemv1.Item_ITEM_HYPER_POTION},
		Level: 50,
		Heals: true,
		Team: []pokemon.Set{
			{Species: speciesv1.Species_SPECIES_GENGAR, Nature: pokemonv1.Nature_NATURE_TIMID, IVs: maxIVs, EVs: pokemon.Stats{4, 0, 0, 252, 252, 0},
				Moves: []movev1.Move{movev1.Move_MOVE_SHADOW_BALL, movev1.Move_MOVE_SLUDGE_BOMB, movev1.Move_MOVE_HYPNOSIS, movev1.Move_MOVE_DESTINY_BOND}},
			{Species: speciesv1.Species_SPECIES_GYARADOS, Nature: pokemonv1.Nature_NATURE_ADAMANT, IVs: maxIVs, EVs: pokemon.Stats{4, 252, 0, 252, 0, 0},
				Moves: []movev1.Move{movev1.Move_MOVE_WATERFALL, movev1.Move_MOVE_DRAGON_DANCE, movev1.Move_MOVE_ICE_FANG, movev1.Move_MOVE_EARTHQUAKE}},
			{Species: speciesv1.Species_SPECIES_SCIZOR, Nature: pokemonv1.Nature_NATURE_ADAMANT, IVs: maxIVs, EVs: pokemon.Stats{252, 252, 0, 0, 0, 4},
				Moves: []movev1.Move{movev1.Move_MOVE_BULLET_PUNCH, movev1.Move_MOVE_X_SCISSOR, movev1.Move_MOVE_SWORDS_DANCE, movev1.Move_MOVE_ROOST}},
			{Species: speciesv1.Species_SPECIES_TYRANITAR, Nature: pokemonv1.Nature_NATURE_BRAVE, IVs: maxIVs, EVs: pokemon.Stats{252, 252, 0, 0, 4, 0},
				Moves: []movev1.Move{movev1.Move_MOVE_STONE_EDGE, movev1.Move_MOVE_CRUNCH, movev1.Move_MOVE_EARTHQUAKE, movev1.Move_MOVE_FIRE_BLAST}},
			{Species: speciesv1.Species_SPECIES_TOGEKISS, Nature: pokemonv1.Nature_NATURE_TIMID, IVs: maxIVs, EVs: pokemon.Stats{252, 0, 0, 4, 252, 0},
				Moves: []movev1.Move{movev1.Move_MOVE_AIR_SLASH, movev1.Move_MOVE_AURA_SPHERE, movev1.Move_MOVE_THUNDER_WAVE, movev1.Move_MOVE_ROOST}},
			// Flare Blitz comes at Lv. 57: Fire Punch (tutor).
			{Species: speciesv1.Species_SPECIES_INFERNAPE, Nature: pokemonv1.Nature_NATURE_JOLLY, IVs: maxIVs, EVs: pokemon.Stats{4, 252, 0, 252, 0, 0},
				Moves: []movev1.Move{movev1.Move_MOVE_CLOSE_COMBAT, movev1.Move_MOVE_FIRE_PUNCH, movev1.Move_MOVE_MACH_PUNCH, movev1.Move_MOVE_U_TURN}},
		},
	}
}
