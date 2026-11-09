package item

import (
	"context"
	"errors"
	"fmt"
	"time"

	itemv1 "pokeuniverse/lib-contracts/gen/go/pokeuniverse/item/v1"
	"pokeuniverse/mic-core/internal/db"
)

// ErrStaleSave: the trainer was replaced by a New Game; the old save's items are not saved.
var ErrStaleSave = errors.New("item: stale save")

// Load reads the trainer's bag and PC; `row` holds the rest of the state.
func Load(ctx context.Context, q *db.Queries, accountID int64, row db.GetTrainerRow) (*State, error) {
	rows, err := q.ListTrainerItems(ctx, accountID)
	if err != nil {
		return nil, fmt.Errorf("load items: %w", err)
	}
	bag := NewBag()
	for _, r := range rows {
		id := itemv1.Item(r.Item)
		if info, ok := Info(id); ok && info.Pocket == itemv1.Pocket(r.Pocket) {
			bag.pockets[info.Pocket] = append(bag.pockets[info.Pocket], Slot{id, int(r.Quantity)})
		}
	}
	if bag.Quantity(itemv1.Item(row.RegisteredItem)) > 0 {
		bag.Registered = itemv1.Item(row.RegisteredItem)
	}
	stored, err := q.ListTrainerPcItems(ctx, accountID)
	if err != nil {
		return nil, fmt.Errorf("load pc items: %w", err)
	}
	pc := &PC{}
	for _, r := range stored {
		pc.Add(itemv1.Item(r.Item), int(r.Quantity))
	}
	return &State{Bag: bag, PC: pc, RepelSteps: int(row.RepelSteps), Flute: Flute(row.Flute), Coins: int(row.Coins), BerryPowder: int(row.BerryPowder)}, nil
}

// Write saves what an action changed inside the caller's transaction (one action, one
// transaction), only into the save it belongs to (`save`: the trainer's created_at).
func Write(ctx context.Context, q *db.Queries, accountID int64, save time.Time, s *State, changed Changed) error {
	n, err := q.UpdateTrainerItemState(ctx, db.UpdateTrainerItemStateParams{
		AccountID: accountID, RegisteredItem: int16(s.Bag.Registered), RepelSteps: int16(s.RepelSteps),
		Flute: string(s.Flute), Coins: int32(s.Coins), BerryPowder: int32(s.BerryPowder), CreatedAt: save,
	})
	if err != nil {
		return fmt.Errorf("save item state: %w", err)
	}
	if n == 0 {
		return ErrStaleSave
	}
	for _, p := range changed.Pockets {
		if err := writePocket(ctx, q, accountID, p, s.Bag.pockets[p]); err != nil {
			return err
		}
	}
	if changed.PC {
		return writePC(ctx, q, accountID, s.PC.slots)
	}
	return nil
}

// Reset gives a New Game's trainer FireRed's starting items, inside New Game's transaction: an
// empty bag (ClearBag) and the starting PC (NewGameInitPCItems).
func Reset(ctx context.Context, q *db.Queries, accountID int64) error {
	if err := q.DeleteTrainerItems(ctx, accountID); err != nil {
		return fmt.Errorf("reset items: %w", err)
	}
	return writePC(ctx, q, accountID, StartingPC().slots)
}

func writePC(ctx context.Context, q *db.Queries, accountID int64, slots []Slot) error {
	if err := q.DeleteTrainerPcItems(ctx, accountID); err != nil {
		return fmt.Errorf("save pc: %w", err)
	}
	if len(slots) == 0 {
		return nil
	}
	items, quantities := columns(slots)
	if err := q.InsertTrainerPcItems(ctx, db.InsertTrainerPcItemsParams{AccountID: accountID, Items: items, Quantities: quantities}); err != nil {
		return fmt.Errorf("save pc: %w", err)
	}
	return nil
}

// columns is the slots as the item and quantity arrays the inserts take.
func columns(slots []Slot) (items, quantities []int16) {
	items, quantities = make([]int16, len(slots)), make([]int16, len(slots))
	for i, s := range slots {
		items[i], quantities[i] = int16(s.Item), int16(s.Quantity)
	}
	return items, quantities
}

func writePocket(ctx context.Context, q *db.Queries, accountID int64, p itemv1.Pocket, slots []Slot) error {
	if err := q.DeleteTrainerPocket(ctx, db.DeleteTrainerPocketParams{AccountID: accountID, Pocket: int16(p)}); err != nil {
		return fmt.Errorf("save pocket: %w", err)
	}
	if len(slots) == 0 {
		return nil
	}
	items, quantities := columns(slots)
	if err := q.InsertTrainerPocket(ctx, db.InsertTrainerPocketParams{AccountID: accountID, Pocket: int16(p), Items: items, Quantities: quantities}); err != nil {
		return fmt.Errorf("save pocket: %w", err)
	}
	return nil
}
