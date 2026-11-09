package battle

import (
	"crypto/rand"
	"encoding/binary"
	"fmt"

	"github.com/jackc/pgx/v5/pgtype"

	battlev1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/battle/v1"
	partyv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/party/v1"
	"pokeuniverse/mic-core/internal/pokemon"
)

// Sides: the player who started the battle, and the opponent.
const (
	PlayerSide   = 0
	OpponentSide = 1
)

// NewStart is a trainer battle between the player's party (`trainerID`: theirs, for traded
// Pokémon) and the NPC trainer `key` of the table, with a new ID and seed.
func NewStart(party pokemon.Party, trainerID uint32, key string, t *Trainer) *battlev1.StartBattle {
	var seed [8]byte
	_, _ = rand.Read(seed[:])
	return &battlev1.StartBattle{
		BattleId: NewID(),
		Kind:     battlev1.BattleKind_BATTLE_KIND_TRAINER,
		Doubles:  t.Doubles,
		Sides: []*battlev1.BattleTeam{
			team(party, trainerID),
			{Pokemon: team(t.Party(key), 0).Pokemon, AiFlags: t.AI, Items: t.Items},
		},
		Seed: binary.LittleEndian.Uint64(seed[:]),
	}
}

// NewWildStart is a wild battle against one Pokémon (DoStandardWildBattle): side 1 has no
// trainer and no AI flags (mic-battles picks its moves at random).
func NewWildStart(party pokemon.Party, trainerID uint32, wild *pokemon.Pokemon) *battlev1.StartBattle {
	var seed [8]byte
	_, _ = rand.Read(seed[:])
	return &battlev1.StartBattle{
		BattleId: NewID(),
		Kind:     battlev1.BattleKind_BATTLE_KIND_WILD,
		Sides:    []*battlev1.BattleTeam{team(party, trainerID), team(pokemon.Party{wild}, 0)},
		Seed:     binary.LittleEndian.Uint64(seed[:]),
	}
}

// team is a party as it enters a battle. trainerID 0: no Pokémon counts as traded.
func team(party pokemon.Party, trainerID uint32) *battlev1.BattleTeam {
	out := &battlev1.BattleTeam{Pokemon: make([]*battlev1.BattleMon, len(party))}
	for i, p := range party {
		moves := make([]*partyv1.Move, len(p.Moves))
		for m, mv := range p.Moves {
			moves[m] = &partyv1.Move{Move: mv.ID, Pp: uint32(mv.PP), MaxPp: uint32(pokemon.MaxPP(mv.ID, mv.PPUps))}
		}
		out.Pokemon[i] = &battlev1.BattleMon{
			Species: p.Species, Nickname: p.Nickname, Level: uint32(p.Level), Nature: p.Nature(), Ability: p.Ability(),
			HeldItem: p.HeldItem, Ivs: p.IVs.Proto(), Evs: p.EVs.Proto(), Moves: moves, Hp: uint32(p.HP), Status: p.Status,
			Gender: p.Gender(), Shiny: p.Shiny(), Personality: p.Personality, Friendship: uint32(p.Friendship),
			Traded: trainerID != 0 && p.OT.ID != trainerID, Exp: uint32(p.Exp),
		}
	}
	return out
}

// NewID is a random UUID (version 4), a battle's ID.
func NewID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

// uuid is a battle ID as PostgreSQL's uuid.
func uuid(id string) (pgtype.UUID, error) {
	var u pgtype.UUID
	return u, u.Scan(id)
}
