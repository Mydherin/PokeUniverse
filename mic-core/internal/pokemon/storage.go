package pokemon

import (
	"context"
	"errors"
	"fmt"
	"time"
	"unicode/utf8"

	"pokeuniverse/mic-core/internal/db"
	"pokeuniverse/mic-core/internal/item"
)

const (
	// BoxNameLength and WallpaperCount are FireRed's BOX_NAME_LENGTH and WALLPAPER_COUNT.
	BoxNameLength  = 8
	WallpaperCount = 16
)

// ErrRefused is an action BILL'S PC doesn't allow; nothing was written.
var ErrRefused = errors.New("storage action refused")

// Place is where a Pokémon is in BILL'S PC: box 0 is the party.
type Place struct{ Box, Slot int }

// storage is the party and the boxes one action touches, read inside its transaction.
type storage struct {
	party Party
	boxes map[int]*Box
}

func loadStorage(ctx context.Context, q *db.Queries, accountID int64, save time.Time, party Party, places ...Place) (*storage, error) {
	if err := lock(ctx, q, accountID, save); err != nil {
		return nil, err
	}
	s := &storage{party: party, boxes: map[int]*Box{}}
	for _, pl := range places {
		if pl.Box == 0 || s.boxes[pl.Box] != nil {
			continue
		}
		b, err := LoadBox(ctx, q, accountID, pl.Box)
		if err != nil {
			return nil, err
		}
		s.boxes[pl.Box] = b
	}
	return s, nil
}

func (s *storage) at(pl Place) *Pokemon {
	if pl.Box == 0 {
		return s.party.At(pl.Slot)
	}
	return s.boxes[pl.Box][pl.Slot]
}

func valid(pl Place) bool {
	if pl.Box == 0 {
		return pl.Slot >= 0 && pl.Slot <= PartySize
	}
	return pl.Box >= 1 && pl.Box <= BoxCount && pl.Slot >= 0 && pl.Slot < BoxSize
}

// MovePokemon is WITHDRAW, DEPOSIT and MOVE's placing, inside the caller's transaction: the
// Pokémon at `from` goes to `to`, swapping with one there (SHIFT). Party slot len(party) is
// past its end (WITHDRAW). It answers the party to keep; ErrRefused when FireRed wouldn't allow
// it (CanMovePartyMon, CanShiftMon, ItemIsMail, a full party).
func MovePokemon(ctx context.Context, q *db.Queries, accountID int64, save time.Time, party Party, from, to Place) (Party, error) {
	if !valid(from) || !valid(to) || from == to {
		return party, ErrRefused
	}
	s, err := loadStorage(ctx, q, accountID, save, party, from, to)
	if err != nil {
		return party, err
	}
	moving, target := s.at(from), s.at(to)
	if moving == nil || (from.Box == 0 && to.Box == 0 && target == nil) {
		return party, ErrRefused
	}
	// The one placed in a box (ItemIsMail keeps MAIL out of the boxes).
	if (to.Box != 0 && item.IsMail(moving.HeldItem)) || (from.Box != 0 && target != nil && item.IsMail(target.HeldItem)) {
		return party, ErrRefused
	}
	next := party.Clone()
	switch {
	case from.Box == 0 && to.Box == 0: // SWITCH inside the party
		next[from.Slot], next[to.Slot] = next[to.Slot], next[from.Slot]
	case to.Box == 0 && target == nil: // WITHDRAW: to the end of the party
		if len(next) >= PartySize || to.Slot != len(next) {
			return party, ErrRefused
		}
		next = append(next, moving.Clone())
	case to.Box == 0: // a boxed one swapped into the party
		next[to.Slot] = moving.Clone()
	case from.Box == 0 && target == nil: // DEPOSIT (CompactPartySlots)
		next = append(next[:from.Slot], next[from.Slot+1:]...)
	case from.Box == 0: // a party one swapped into a box
		next[from.Slot] = target.Clone()
	}
	// CountPartyAliveNonEggMonsExcept: someone must still be able to battle.
	if next.Able() == 0 {
		return party, ErrRefused
	}
	if from.Box != 0 || to.Box != 0 {
		if err := s.writeBoxSlot(ctx, q, accountID, from, boxed(from, target)); err != nil {
			return party, err
		}
		if err := s.writeBoxSlot(ctx, q, accountID, to, boxed(to, moving)); err != nil {
			return party, err
		}
	}
	if from.Box == 0 || to.Box == 0 {
		if err := Write(ctx, q, accountID, save, next); err != nil {
			return party, err
		}
	}
	return next, nil
}

// boxed is what ends at `pl` when it's a box slot: a copy with HP, status and PP back
// (BoxPokemon keeps no HP or status; SetPlacedMonData's BoxMonRestorePP).
func boxed(pl Place, p *Pokemon) *Pokemon {
	if pl.Box == 0 || p == nil {
		return nil
	}
	c := p.Clone()
	c.Heal()
	return c
}

// writeBoxSlot writes a box slot to hold p (nil: empty). Party places are skipped.
func (s *storage) writeBoxSlot(ctx context.Context, q *db.Queries, accountID int64, pl Place, p *Pokemon) error {
	if pl.Box == 0 {
		return nil
	}
	if err := q.DeleteBoxPokemon(ctx, db.DeleteBoxPokemonParams{AccountID: accountID, Box: int16(pl.Box), Slot: int16(pl.Slot)}); err != nil {
		return fmt.Errorf("box %d slot %d: %w", pl.Box, pl.Slot, err)
	}
	if p == nil {
		return nil
	}
	if err := q.InsertTrainerPokemon(ctx, toRow(accountID, pl.Box, pl.Slot, p)); err != nil {
		return fmt.Errorf("box %d slot %d: %w", pl.Box, pl.Slot, err)
	}
	return nil
}

// ReleasePokemon is RELEASE, inside the caller's transaction; its held item goes with it. It
// answers the party to keep; ErrRefused for the last one able to battle or one holding MAIL.
func ReleasePokemon(ctx context.Context, q *db.Queries, accountID int64, save time.Time, party Party, pl Place) (Party, error) {
	if !valid(pl) {
		return party, ErrRefused
	}
	s, err := loadStorage(ctx, q, accountID, save, party, pl)
	if err != nil {
		return party, err
	}
	p := s.at(pl)
	if p == nil || item.IsMail(p.HeldItem) {
		return party, ErrRefused
	}
	if pl.Box != 0 {
		return party, s.writeBoxSlot(ctx, q, accountID, pl, nil)
	}
	next := party.Clone()
	next = append(next[:pl.Slot], next[pl.Slot+1:]...)
	if next.Able() == 0 {
		return party, ErrRefused
	}
	return next, Write(ctx, q, accountID, save, next)
}

// SetBox changes a box's name (empty: kept) or wallpaper (negative: kept), inside the caller's
// transaction; ErrRefused out of FireRed's bounds.
func SetBox(ctx context.Context, q *db.Queries, accountID int64, save time.Time, box int, name string, wallpaper int) error {
	n := utf8.RuneCountInString(name)
	if box < 1 || box > BoxCount || n > BoxNameLength || !utf8.ValidString(name) || wallpaper >= WallpaperCount {
		return ErrRefused
	}
	if err := lock(ctx, q, accountID, save); err != nil {
		return err
	}
	infos, err := LoadBoxes(ctx, q, accountID)
	if err != nil {
		return err
	}
	b := infos[box-1]
	if n > 0 {
		b.Name = name
	}
	if wallpaper >= 0 {
		b.Wallpaper = wallpaper
	}
	if err := q.UpsertTrainerBox(ctx, db.UpsertTrainerBoxParams{AccountID: accountID, Box: int16(box), Name: b.Name, Wallpaper: int16(b.Wallpaper)}); err != nil {
		return fmt.Errorf("set box %d: %w", box, err)
	}
	return nil
}
