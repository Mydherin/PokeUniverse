package world

import (
	"context"
	"time"
	"unicode"
	"unicode/utf8"

	battlev1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/battle/v1"
	partyv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/party/v1"
	realtimev1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/realtime/v1"
	speciesv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/species/v1"
	"pokeuniverse/mic-core/internal/db"
	"pokeuniverse/mic-core/internal/pokemon"
)

// NicknameLength is FireRed's POKEMON_NAME_LENGTH.
const NicknameLength = 10

// askNaming asks again, after a restart, the nickname of the Pokémon caught before it (phase-7
// D10): the catch is saved, only the question was left.
func (z *zone) askNaming(p *Player, at pokemon.Place) {
	var species speciesv1.Species
	if at.Box == 0 {
		if at.Slot < len(p.party) {
			species = p.party[at.Slot].Species
		}
	} else {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		box, err := pokemon.LoadBox(ctx, db.New(z.w.pool), p.accountID, at.Box)
		if err != nil {
			z.w.log.Error("pending nickname", "account_id", p.accountID, "err", err)
			return
		}
		if at.Slot < pokemon.BoxSize && box[at.Slot] != nil {
			species = box[at.Slot].Species
		}
	}
	if species == speciesv1.Species_SPECIES_UNSPECIFIED {
		return // Gone (it can't be): nothing to ask; the next answer clears it.
	}
	p.naming = &at
	caught := &battlev1.CaughtPokemon{Species: species, NicknamePending: true, Where: battlev1.CaughtWhere_CAUGHT_WHERE_PARTY, Slot: uint32(at.Slot)}
	if at.Box > 0 {
		caught.Where, caught.Box = battlev1.CaughtWhere_CAUGHT_WHERE_BOX, uint32(at.Box-1)
	}
	p.queue(&realtimev1.ServerMessage{Payload: &realtimev1.ServerMessage_BattleEnded{BattleEnded: &battlev1.BattleEnded{
		Result: battlev1.BattleResult_BATTLE_RESULT_CAUGHT, Caught: caught,
	}}})
}

// NameCaughtPokemon answers the nickname question after a catch (phase-7 D10).
func (p *Player) NameCaughtPokemon(m *partyv1.NameCaughtPokemon) {
	p.zone.do(func() { p.zone.nameCaught(p, m.GetName()) })
}

// nameCaught renames the Pokémon where it is and clears the question, in one transaction. A
// name the naming screen can't make (too long, not text) keeps the species' name, like cancel.
func (z *zone) nameCaught(p *Player, name string) {
	if _, ok := z.players[p]; !ok || p.naming == nil {
		return
	}
	if !validNickname(name) {
		name = ""
	}
	at := *p.naming
	party := p.party.Clone()
	inParty := at.Box == 0 && at.Slot < len(party)
	if inParty {
		party[at.Slot].Nickname = name
	}
	if !z.transact(p, func(ctx context.Context, q *db.Queries, save time.Time) error {
		if inParty {
			if err := pokemon.Write(ctx, q, p.accountID, save, party); err != nil {
				return err
			}
		} else if at.Box > 0 {
			if _, err := q.UpdateBoxPokemonNickname(ctx, db.UpdateBoxPokemonNicknameParams{
				AccountID: p.accountID, Box: int16(at.Box), Slot: int16(at.Slot), Nickname: name,
			}); err != nil {
				return err
			}
		}
		return saveNaming(ctx, q, p.accountID, save, nil)
	}) {
		return // Still pending: a restart asks again.
	}
	p.naming = nil
	if inParty {
		p.party = party
		z.sendParty(p)
	}
}

func validNickname(name string) bool {
	if !utf8.ValidString(name) || utf8.RuneCountInString(name) > NicknameLength {
		return false
	}
	for _, r := range name {
		if unicode.IsControl(r) {
			return false
		}
	}
	return true
}
