// Package battle is what mic-core owns of battles (plans/battles D3): NPC trainers, the teams it
// sends to mic-battles, how an outcome changes the party and money, and each player's active
// battle in Redis. mic-battles resolves the turns (package battles talks to it).
package battle

import (
	"hash/fnv"

	battlev1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/battle/v1"
	itemv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/item/v1"
	"pokeuniverse/mic-core/internal/pokemon"
)

// Trainer is an NPC trainer, as FireRed's gTrainers: who they are, their AI and their team.
type Trainer struct {
	// FireRed's trainer class, lowercase (its name, music and money rate in the client).
	Class string
	Name  string
	// Trainer art.
	Pic string
	// Text ID shown in battle when they lose.
	DefeatText string
	// gTrainerMoneyTable's value for the class: the prize is 4 × the last Pokémon's level × it.
	MoneyRate int
	AI        []battlev1.AiFlag
	// Up to 4, each used once (plans/battles M5).
	Items []itemv1.Item
	Level int
	Team  []pokemon.Set
	// Both teams are healed before each battle (the room's test trainer).
	Heals bool
	// Two Pokémon a side; the player needs two that can battle (plans/battles D27).
	Doubles bool
}

// Trainers is the trainer table, by the ID scripts name.
var Trainers = map[string]*Trainer{}

// Party is the trainer's team, the same every time for the same trainer.
func (t *Trainer) Party(id string) pokemon.Party {
	h := fnv.New64a()
	h.Write([]byte(id))
	seed := h.Sum64()
	ot := pokemon.Trainer{Name: t.Name, ID: uint32(seed)}
	party := make(pokemon.Party, len(t.Team))
	for i, set := range t.Team {
		party[i] = set.Create(t.Level, ot, seed)
	}
	return party
}

// Prize is the money for beating them (GetTrainerMoneyToGive): 4 × the last Pokémon's level × the
// class' rate, twice that in doubles.
func (t *Trainer) Prize() int {
	if len(t.Team) == 0 {
		return 0
	}
	prize := 4 * t.Level * t.MoneyRate
	if t.Doubles {
		prize *= 2
	}
	return prize
}

// View is the trainer as the battle screen shows them.
func (t *Trainer) View() *battlev1.BattleTrainer {
	return &battlev1.BattleTrainer{TrainerClass: t.Class, Name: t.Name, Pic: t.Pic, DefeatText: t.DefeatText}
}
