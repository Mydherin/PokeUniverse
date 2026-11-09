package pokemon

import (
	"context"
	"fmt"
	"strconv"
	"time"

	partyv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/party/v1"
	"pokeuniverse/mic-core/internal/db"
)

const (
	// BoxCount and BoxSize are FireRed's TOTAL_BOXES_COUNT and IN_BOX_COUNT. Boxes count from 1:
	// box 0 in the table is the party.
	BoxCount = 14
	BoxSize  = 30

	// The wallpapers a box starts with cycle through FireRed's first four (MAX_DEFAULT_WALLPAPER).
	defaultWallpapers = 4
)

// BoxInfo is what the screen shows of a box without opening it.
type BoxInfo struct {
	Name      string
	Wallpaper int
	Count     int
}

// Box is one box's Pokémon by slot; an empty slot is nil.
type Box [BoxSize]*Pokemon

// LoadBoxes reads every box's name, wallpaper and count, in order (boxes[0] is box 1).
func LoadBoxes(ctx context.Context, q *db.Queries, accountID int64) ([]BoxInfo, error) {
	boxes := make([]BoxInfo, BoxCount)
	for i := range boxes {
		// ResetPokemonStorageSystem's names and wallpapers.
		boxes[i] = BoxInfo{Name: "BOX" + strconv.Itoa(i+1), Wallpaper: i % defaultWallpapers}
	}
	changed, err := q.ListTrainerBoxes(ctx, accountID)
	if err != nil {
		return nil, fmt.Errorf("load boxes: %w", err)
	}
	for _, c := range changed {
		boxes[c.Box-1].Name, boxes[c.Box-1].Wallpaper = c.Name, int(c.Wallpaper)
	}
	counts, err := q.CountBoxPokemon(ctx, accountID)
	if err != nil {
		return nil, fmt.Errorf("load boxes: %w", err)
	}
	for _, c := range counts {
		boxes[c.Box-1].Count = int(c.Count)
	}
	return boxes, nil
}

// LoadBox reads one box (1-14).
func LoadBox(ctx context.Context, q *db.Queries, accountID int64, box int) (*Box, error) {
	rows, err := q.ListBoxPokemon(ctx, db.ListBoxPokemonParams{AccountID: accountID, Box: int16(box)})
	if err != nil {
		return nil, fmt.Errorf("load box %d: %w", box, err)
	}
	var out Box
	for _, r := range rows {
		out[r.Slot] = fromRow(db.ListTrainerPokemonRow(r))
	}
	return &out, nil
}

// ViewBox reads what the box screen shows, inside the caller's transaction: box 0 is the current
// box, any other becomes the current one.
func ViewBox(ctx context.Context, q *db.Queries, accountID int64, save time.Time, box int) (*partyv1.BoxView, error) {
	if box == 0 {
		current, err := q.GetTrainerCurrentBox(ctx, accountID)
		if err != nil {
			return nil, fmt.Errorf("current box: %w", err)
		}
		box = int(current)
	} else if err := q.UpdateTrainerCurrentBox(ctx, db.UpdateTrainerCurrentBoxParams{AccountID: accountID, CurrentBox: int16(box), CreatedAt: save}); err != nil {
		return nil, fmt.Errorf("current box: %w", err)
	}
	infos, err := LoadBoxes(ctx, q, accountID)
	if err != nil {
		return nil, err
	}
	mons, err := LoadBox(ctx, q, accountID, box)
	if err != nil {
		return nil, err
	}
	view := &partyv1.BoxView{Box: uint32(box)}
	for _, b := range infos {
		view.Boxes = append(view.Boxes, &partyv1.BoxInfo{Name: b.Name, Wallpaper: uint32(b.Wallpaper), Count: uint32(b.Count)})
	}
	for slot, p := range mons {
		if p != nil {
			view.Pokemon = append(view.Pokemon, &partyv1.BoxPokemon{Slot: uint32(slot), Pokemon: p.Proto()})
		}
	}
	return view, nil
}

// AddCaught is GiveMonToPlayer: into the party while it has room, else SendMonToPC, inside the
// caller's transaction. It answers the party to keep (the caller holds it in memory) and the box
// the Pokémon went to, 0 for the party. With every box full the Pokémon isn't added: full is true
// (MON_CANT_GIVE).
func AddCaught(ctx context.Context, q *db.Queries, accountID int64, save time.Time, party Party, p *Pokemon) (kept Party, box int, full bool, err error) {
	if len(party) < PartySize {
		kept = append(party, p)
		return kept, 0, false, Write(ctx, q, accountID, save, kept)
	}
	if err := lock(ctx, q, accountID, save); err != nil {
		return party, 0, false, err
	}
	box, slot, err := freeBoxSlot(ctx, q, accountID)
	if err != nil {
		return party, 0, false, err
	}
	if box == 0 {
		return party, 0, true, nil
	}
	// A box keeps neither HP nor status (BoxPokemon), and SendMonToPC restores the PP.
	p.Heal()
	if err := q.InsertTrainerPokemon(ctx, toRow(accountID, box, slot, p)); err != nil {
		return party, 0, false, fmt.Errorf("add to box: %w", err)
	}
	return party, box, false, nil
}

// StorageFull is IsPlayerPartyAndPokemonStorageFull's box half: no box has a free slot.
func StorageFull(ctx context.Context, q *db.Queries, accountID int64) (bool, error) {
	box, _, err := freeBoxSlot(ctx, q, accountID)
	return box == 0 && err == nil, err
}

// freeBoxSlot is SendMonToPC's search: the first empty slot from the current box on, wrapping
// around; box 0 when every box is full.
func freeBoxSlot(ctx context.Context, q *db.Queries, accountID int64) (box, slot int, err error) {
	current, err := q.GetTrainerCurrentBox(ctx, accountID)
	if err != nil {
		return 0, 0, fmt.Errorf("current box: %w", err)
	}
	rows, err := q.ListBoxSlots(ctx, accountID)
	if err != nil {
		return 0, 0, fmt.Errorf("box slots: %w", err)
	}
	var taken [BoxCount][BoxSize]bool
	for _, r := range rows {
		taken[r.Box-1][r.Slot] = true
	}
	for i := range BoxCount {
		b := (int(current) - 1 + i) % BoxCount
		for s := range BoxSize {
			if !taken[b][s] {
				return b + 1, s, nil
			}
		}
	}
	return 0, 0, nil
}
