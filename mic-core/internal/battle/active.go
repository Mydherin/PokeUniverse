package battle

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

// Active is the battle a player is in: Redis key player:<id>:battle, set before the battle
// starts and deleted once its outcome is saved, so a restart finds it (resume). A player who
// leaves mid-battle drops it: nothing it changed was saved (rollback).
type Active struct {
	ID string `json:"id"`
	// The NPC trainer of the table.
	Trainer string `json:"trainer"`
	// The save it belongs to (the trainer's created_at, Unix microseconds): a New Game drops it.
	Save int64 `json:"save"`
	// battlev1.StartBattle: sent again on resume, so the battle exists even if mic-battles never
	// got the first one (a repeated start changes nothing).
	Start []byte `json:"start"`
	// Bag items used so far (itemv1.Item): taken from the bag in memory, saved with the outcome.
	Spent []int32 `json:"spent,omitempty"`
	// Those that change their target's friendship, applied with the outcome.
	Friendship []ItemFriendship `json:"friendship,omitempty"`
}

// ItemFriendship is a bag item used on the Pokémon in a party slot.
type ItemFriendship struct {
	Item int32 `json:"item"`
	Slot int32 `json:"slot"`
}

// activeTTL matches mic-battles' battle:<id> (a player may come back to it within a week).
const activeTTL = 7 * 24 * time.Hour

type Store struct{ rdb *redis.Client }

func NewStore(rdb *redis.Client) *Store { return &Store{rdb: rdb} }

func activeKey(accountID int64) string { return fmt.Sprintf("player:%d:battle", accountID) }

// Active is the player's battle; nil when they're in none.
func (s *Store) Active(ctx context.Context, accountID int64) (*Active, error) {
	data, err := s.rdb.Get(ctx, activeKey(accountID)).Bytes()
	if errors.Is(err, redis.Nil) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("load battle: %w", err)
	}
	a := &Active{}
	if err := json.Unmarshal(data, a); err != nil {
		return nil, fmt.Errorf("load battle: %w", err)
	}
	return a, nil
}

func (s *Store) SetActive(ctx context.Context, accountID int64, a Active) error {
	data, _ := json.Marshal(a)
	if err := s.rdb.Set(ctx, activeKey(accountID), data, activeTTL).Err(); err != nil {
		return fmt.Errorf("save battle: %w", err)
	}
	return nil
}

// ClearActiveIf deletes the player's battle only if it is still battle `id` (a newer one stays).
func (s *Store) ClearActiveIf(ctx context.Context, accountID int64, id string) error {
	key := activeKey(accountID)
	err := s.rdb.Watch(ctx, func(tx *redis.Tx) error {
		data, err := tx.Get(ctx, key).Bytes()
		if errors.Is(err, redis.Nil) {
			return nil
		}
		if err != nil {
			return err
		}
		a := Active{}
		if json.Unmarshal(data, &a) != nil || a.ID != id {
			return nil
		}
		_, err = tx.TxPipelined(ctx, func(p redis.Pipeliner) error {
			p.Del(ctx, key)
			return nil
		})
		return err
	}, key)
	if err != nil {
		return fmt.Errorf("clear battle: %w", err)
	}
	return nil
}

func (s *Store) ClearActive(ctx context.Context, accountID int64) error {
	if err := s.rdb.Del(ctx, activeKey(accountID)).Err(); err != nil {
		return fmt.Errorf("clear battle: %w", err)
	}
	return nil
}
