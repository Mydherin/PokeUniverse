// Package account owns player accounts and their roles.
package account

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"pokeuniverse/mic-core/internal/db"
)

// DefaultRole is given to every new account.
const DefaultRole = "user"

var ErrNotFound = errors.New("account not found")

type Account struct {
	ID          int64
	Email       string
	DisplayName string
	PictureURL  string
	Roles       []string
	CreatedAt   time.Time
}

// GoogleProfile is the identity Google verified for a sign-in.
type GoogleProfile struct {
	Subject    string
	Email      string
	Name       string
	PictureURL string
}

type Service struct {
	pool *pgxpool.Pool
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool}
}

// SignInWithGoogle loads the account for a Google identity, creating it on first sign-in.
// Sign-up and login are the same use case.
func (s *Service) SignInWithGoogle(ctx context.Context, p GoogleProfile) (Account, error) {
	var acc Account
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		q := db.New(tx)
		row, err := q.UpsertGoogleAccount(ctx, db.UpsertGoogleAccountParams{
			GoogleSub:   p.Subject,
			Email:       p.Email,
			DisplayName: displayName(p),
			PictureURL:  p.PictureURL,
		})
		if err != nil {
			return fmt.Errorf("upsert account: %w", err)
		}
		if row.Created {
			if err := q.AssignRole(ctx, db.AssignRoleParams{AccountID: row.ID, Name: DefaultRole}); err != nil {
				return fmt.Errorf("assign default role: %w", err)
			}
		}
		roles, err := q.ListAccountRoles(ctx, row.ID)
		if err != nil {
			return fmt.Errorf("list roles: %w", err)
		}
		acc = Account{
			ID:          row.ID,
			Email:       row.Email,
			DisplayName: row.DisplayName,
			PictureURL:  row.PictureURL,
			Roles:       roles,
			CreatedAt:   row.CreatedAt,
		}
		return nil
	})
	return acc, err
}

// Get loads an account with its roles.
func (s *Service) Get(ctx context.Context, id int64) (Account, error) {
	q := db.New(s.pool)
	row, err := q.GetAccount(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return Account{}, ErrNotFound
	}
	if err != nil {
		return Account{}, fmt.Errorf("get account: %w", err)
	}
	roles, err := q.ListAccountRoles(ctx, id)
	if err != nil {
		return Account{}, fmt.Errorf("list roles: %w", err)
	}
	return Account{
		ID:          row.ID,
		Email:       row.Email,
		DisplayName: row.DisplayName,
		PictureURL:  row.PictureURL,
		Roles:       roles,
		CreatedAt:   row.CreatedAt,
	}, nil
}

// displayName falls back to the email's local part when Google sends no name.
func displayName(p GoogleProfile) string {
	if name := strings.TrimSpace(p.Name); name != "" {
		return name
	}
	local, _, _ := strings.Cut(p.Email, "@")
	return local
}
