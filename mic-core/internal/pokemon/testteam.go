// Test content (plans/battles): removed in Phase 5, when the starter replaces the test team.

package pokemon

import (
	"context"
	"fmt"
	"math/rand/v2"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	itemv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/item/v1"
	movev1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/move/v1"
	pokemonv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/pokemon/v1"
	speciesv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/species/v1"
	"pokeuniverse/mic-core/internal/db"
)

const testLevel = 50

// testSet is one test Pokémon: legal Gen 4 sets at Lv. 50 (moves checked against Showdown's Gen 4
// learnsets: level-up, TM, tutor or egg), FireRed's items only until plans/battles M12.
type testSet struct {
	species speciesv1.Species
	nature  pokemonv1.Nature
	item    itemv1.Item
	moves   []movev1.Move
	evs     Stats // HP, ATK, DEF, SPEED, SP. ATK, SP. DEF.
}

var testTeam = []testSet{
	{speciesv1.Species_SPECIES_CHARIZARD, pokemonv1.Nature_NATURE_TIMID, itemv1.Item_ITEM_UNSPECIFIED,
		[]movev1.Move{movev1.Move_MOVE_FLAMETHROWER, movev1.Move_MOVE_AIR_SLASH, movev1.Move_MOVE_DRAGON_PULSE, movev1.Move_MOVE_ROOST},
		Stats{4, 0, 0, 252, 252, 0}},
	{speciesv1.Species_SPECIES_PIKACHU, pokemonv1.Nature_NATURE_HASTY, itemv1.Item_ITEM_LIGHT_BALL,
		[]movev1.Move{movev1.Move_MOVE_THUNDERBOLT, movev1.Move_MOVE_QUICK_ATTACK, movev1.Move_MOVE_IRON_TAIL, movev1.Move_MOVE_THUNDER_WAVE},
		Stats{0, 4, 0, 252, 252, 0}},
	{speciesv1.Species_SPECIES_GARCHOMP, pokemonv1.Nature_NATURE_JOLLY, itemv1.Item_ITEM_UNSPECIFIED,
		[]movev1.Move{movev1.Move_MOVE_EARTHQUAKE, movev1.Move_MOVE_DRAGON_CLAW, movev1.Move_MOVE_STEALTH_ROCK, movev1.Move_MOVE_SWORDS_DANCE},
		Stats{4, 252, 0, 252, 0, 0}},
	// Bullet Punch is a Riolu egg move: Extreme Speed comes at Lv. 51.
	{speciesv1.Species_SPECIES_LUCARIO, pokemonv1.Nature_NATURE_NAIVE, itemv1.Item_ITEM_UNSPECIFIED,
		[]movev1.Move{movev1.Move_MOVE_AURA_SPHERE, movev1.Move_MOVE_CLOSE_COMBAT, movev1.Move_MOVE_BULLET_PUNCH, movev1.Move_MOVE_SWORDS_DANCE},
		Stats{0, 252, 0, 252, 4, 0}},
	{speciesv1.Species_SPECIES_GARDEVOIR, pokemonv1.Nature_NATURE_MODEST, itemv1.Item_ITEM_UNSPECIFIED,
		[]movev1.Move{movev1.Move_MOVE_PSYCHIC, movev1.Move_MOVE_SHADOW_BALL, movev1.Move_MOVE_CALM_MIND, movev1.Move_MOVE_THUNDERBOLT},
		Stats{4, 0, 0, 252, 252, 0}},
	// Curse is an egg move (Munchlax).
	{speciesv1.Species_SPECIES_SNORLAX, pokemonv1.Nature_NATURE_CAREFUL, itemv1.Item_ITEM_LEFTOVERS,
		[]movev1.Move{movev1.Move_MOVE_BODY_SLAM, movev1.Move_MOVE_EARTHQUAKE, movev1.Move_MOVE_REST, movev1.Move_MOVE_CURSE},
		Stats{252, 4, 0, 0, 0, 252}},
}

// GiveTestTeam gives a trainer with no Pokémon the test team, in one transaction; a trainer who
// has Pokémon keeps them. The team is the same for the same trainer ID (personalities and IVs
// come from it), so two copies of the game joining at once agree.
func GiveTestTeam(ctx context.Context, pool *pgxpool.Pool, accountID int64, save time.Time, ot Trainer) (Party, error) {
	var party Party
	err := pgx.BeginFunc(ctx, pool, func(tx pgx.Tx) error {
		q := db.New(tx)
		if err := lock(ctx, q, accountID, save); err != nil {
			return err
		}
		var err error
		if party, err = Load(ctx, q, accountID); err != nil || len(party) > 0 {
			return err
		}
		party = newTestTeam(ot)
		return insert(ctx, q, accountID, party)
	})
	if err != nil {
		return nil, fmt.Errorf("give test team: %w", err)
	}
	return party, nil
}

func newTestTeam(ot Trainer) Party {
	party := make(Party, len(testTeam))
	for i, set := range testTeam {
		r := rand.New(rand.NewPCG(uint64(ot.ID), uint64(i)))
		// CreateMonWithNature: personalities until one has the nature.
		personality := r.Uint32()
		for NatureOf(personality) != set.nature {
			personality = r.Uint32()
		}
		var ivs Stats
		for s := range ivs {
			ivs[s] = r.IntN(MaxIV + 1)
		}
		p := Create(set.species, testLevel, personality, ivs, set.evs, ot)
		p.HeldItem = set.item
		p.Moves = make([]Move, len(set.moves))
		for m, id := range set.moves {
			p.Moves[m] = Move{ID: id, PP: MaxPP(id, 0)}
		}
		party[i] = p
	}
	return party
}
