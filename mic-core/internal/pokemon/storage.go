package pokemon

import (
	"cmp"
	"context"
	"errors"
	"fmt"
	"time"
	"unicode/utf8"

	itemv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/item/v1"
	movev1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/move/v1"
	"pokeuniverse/mic-core/internal/db"
	"pokeuniverse/mic-core/internal/item"
)

const (
	// BoxNameLength and WallpaperCount are FireRed's BOX_NAME_LENGTH and WALLPAPER_COUNT.
	BoxNameLength  = 8
	WallpaperCount = 16
	// FirstFree as a box slot is DEPOSIT's: the box's first free slot (TryStorePartyMonInBox).
	FirstFree = BoxSize
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

// firstFree is GetFirstFreeBoxSpot, the moving one's own slot free (the hand holds it): -1 when full.
func (s *storage) firstFree(box int, moving Place) int {
	for i, p := range s.boxes[box] {
		if p == nil || moving == (Place{box, i}) {
			return i
		}
	}
	return -1
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
// it (CanMovePartyMon, CanShiftMon, ItemIsMail, a full party). A party one put at len(party)
// goes to the end: the box screen's hand holds it while the party closes up. A `to` slot of
// FirstFree is DEPOSIT's first free slot of that box, refused when it's full.
func MovePokemon(ctx context.Context, q *db.Queries, accountID int64, save time.Time, party Party, from, to Place) (Party, error) {
	deposit := to.Box >= 1 && to.Box <= BoxCount && to.Slot == FirstFree
	if !valid(from) || (!valid(to) && !deposit) || from == to {
		return party, ErrRefused
	}
	s, err := loadStorage(ctx, q, accountID, save, party, from, to)
	if err != nil {
		return party, err
	}
	if deposit {
		if to.Slot = s.firstFree(to.Box, from); to.Slot < 0 {
			return party, ErrRefused
		}
		if to == from { // back where it was: nothing changes
			return party, nil
		}
	}
	moving, target := s.at(from), s.at(to)
	if moving == nil {
		return party, ErrRefused
	}
	// The one placed in a box (ItemIsMail keeps MAIL out of the boxes).
	if (to.Box != 0 && item.IsMail(moving.HeldItem)) || (from.Box != 0 && target != nil && item.IsMail(target.HeldItem)) {
		return party, ErrRefused
	}
	next := party.Clone()
	switch {
	case from.Box == 0 && to.Box == 0 && target == nil: // put down in an empty slot: to the end (CompactPartySlots)
		if to.Slot != len(next) {
			return party, ErrRefused
		}
		next = append(append(next[:from.Slot:from.Slot], next[from.Slot+1:]...), moving.Clone())
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
// answers the party to keep; ErrRefused for the last one able to battle, one holding MAIL or the
// last one knowing SURF or DIVE (RunCanReleaseMon).
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
	if last, err := s.lastToKnow(ctx, q, accountID, pl, p); err != nil || last {
		return party, cmp.Or(err, ErrRefused)
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

// MarkingsMask is FireRed's four marks, one bit each.
const MarkingsMask = 0xf

// SetMarkings is MARK (SetMonMarkings), inside the caller's transaction; it answers the party to
// keep. ErrRefused for an empty place or a mark FireRed doesn't have.
func SetMarkings(ctx context.Context, q *db.Queries, accountID int64, save time.Time, party Party, pl Place, markings int) (Party, error) {
	if !valid(pl) || markings&^MarkingsMask != 0 {
		return party, ErrRefused
	}
	s, err := loadStorage(ctx, q, accountID, save, party, pl)
	if err != nil {
		return party, err
	}
	return s.edit(ctx, q, accountID, save, []Place{pl}, func(m []*Pokemon) error {
		m[0].Markings = markings
		return nil
	})
}

// releaseRestricted is InitCanReleaseMonVars' list: a move only one Pokémon knows keeps it.
var releaseRestricted = []movev1.Move{movev1.Move_MOVE_SURF, movev1.Move_MOVE_DIVE}

// lastToKnow is RunCanReleaseMon's refusal: p, at pl, knows SURF or DIVE and no other Pokémon in
// the party or the boxes does.
func (s *storage) lastToKnow(ctx context.Context, q *db.Queries, accountID int64, pl Place, p *Pokemon) (bool, error) {
	for _, m := range releaseRestricted {
		if !knows(p.Moves, m) {
			continue
		}
		known := false
		for i, o := range s.party {
			if (pl != Place{0, i}) && knows(o.Moves, m) {
				known = true
			}
		}
		if !known {
			var err error
			known, err = q.OtherBoxPokemonKnowsMove(ctx, db.OtherBoxPokemonKnowsMoveParams{AccountID: accountID, Box: int16(pl.Box), Slot: int16(pl.Slot), Move: int16(m)})
			if err != nil {
				return false, fmt.Errorf("release check: %w", err)
			}
		}
		if !known {
			return true, nil
		}
	}
	return false, nil
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

// edit hands change a copy of the Pokémon at each place (all taken, all different), then writes
// them back: box slots one by one, the party once. It answers the party to keep.
func (s *storage) edit(ctx context.Context, q *db.Queries, accountID int64, save time.Time, places []Place, change func([]*Pokemon) error) (Party, error) {
	next, inParty := s.party.Clone(), false
	mons := make([]*Pokemon, len(places))
	for i, pl := range places {
		switch {
		case s.at(pl) == nil:
			return s.party, ErrRefused
		case pl.Box == 0:
			mons[i], inParty = next[pl.Slot], true
		default:
			mons[i] = s.at(pl).Clone()
		}
	}
	if err := change(mons); err != nil {
		return s.party, err
	}
	for i, pl := range places {
		if err := s.writeBoxSlot(ctx, q, accountID, pl, mons[i]); err != nil {
			return s.party, err
		}
	}
	if !inParty {
		return s.party, nil
	}
	return next, Write(ctx, q, accountID, save, next)
}

// MoveHeldItem is ITEM mode's GIVE or SWITCH, inside the caller's transaction: `from`'s held
// item goes to `to`, swapping with `to`'s. ErrRefused when `from` holds nothing or either holds
// MAIL (Item_FromMonToMoving and Task_SwitchSelectedItem check ItemIsMail).
func MoveHeldItem(ctx context.Context, q *db.Queries, accountID int64, save time.Time, party Party, from, to Place) (Party, error) {
	if !valid(from) || !valid(to) || from == to {
		return party, ErrRefused
	}
	s, err := loadStorage(ctx, q, accountID, save, party, from, to)
	if err != nil {
		return party, err
	}
	return s.edit(ctx, q, accountID, save, []Place{from, to}, func(m []*Pokemon) error {
		moving, target := m[0], m[1]
		if moving.HeldItem == itemv1.Item_ITEM_UNSPECIFIED || item.IsMail(moving.HeldItem) || item.IsMail(target.HeldItem) {
			return ErrRefused
		}
		moving.HeldItem, target.HeldItem = target.HeldItem, moving.HeldItem
		return nil
	})
}

// ChangeHeldItem is ITEM mode's BAG and GIVE from the bag, inside the caller's transaction:
// change gets what the Pokémon at pl holds and returns what it holds afterwards, or ErrRefused.
func ChangeHeldItem(ctx context.Context, q *db.Queries, accountID int64, save time.Time, party Party, pl Place, change func(itemv1.Item) (itemv1.Item, error)) (Party, error) {
	if !valid(pl) {
		return party, ErrRefused
	}
	s, err := loadStorage(ctx, q, accountID, save, party, pl)
	if err != nil {
		return party, err
	}
	return s.edit(ctx, q, accountID, save, []Place{pl}, func(m []*Pokemon) error {
		held, err := change(m[0].HeldItem)
		m[0].HeldItem = held
		return err
	})
}
