package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"pokeuniverse/mic-core/internal/db"
)

// SessionTTL is the sliding refresh-token lifetime: every refresh restarts it.
const SessionTTL = 30 * 24 * time.Hour

var (
	ErrInvalidRefreshToken = errors.New("invalid refresh token")
	// ErrRefreshTokenReused means an already rotated token came back: a sign of theft.
	ErrRefreshTokenReused = errors.New("refresh token reused")
)

// Sessions issues, rotates and revokes opaque refresh tokens.
// Only their SHA-256 hash is stored.
type Sessions struct {
	pool *pgxpool.Pool
}

func NewSessions(pool *pgxpool.Pool) *Sessions {
	return &Sessions{pool: pool}
}

// Create starts a new session for an account.
func (s *Sessions) Create(ctx context.Context, accountID int64) (string, time.Time, error) {
	return createRefreshToken(ctx, db.New(s.pool), accountID)
}

// Rotate exchanges a refresh token for a new one and returns the account it belongs to.
// Reusing a rotated token revokes every session of that account.
func (s *Sessions) Rotate(ctx context.Context, token string) (int64, string, time.Time, error) {
	var (
		accountID int64
		next      string
		expiresAt time.Time
		reused    bool
	)
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		q := db.New(tx)
		row, err := q.GetRefreshTokenForUpdate(ctx, hashToken(token))
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrInvalidRefreshToken
		}
		if err != nil {
			return fmt.Errorf("get refresh token: %w", err)
		}
		accountID = row.AccountID
		if row.RevokedAt != nil {
			reused = true
			return q.RevokeAccountRefreshTokens(ctx, row.AccountID)
		}
		if time.Now().After(row.ExpiresAt) {
			return ErrInvalidRefreshToken
		}
		if err := q.RevokeRefreshToken(ctx, row.ID); err != nil {
			return fmt.Errorf("revoke refresh token: %w", err)
		}
		next, expiresAt, err = createRefreshToken(ctx, q, row.AccountID)
		return err
	})
	if err != nil {
		return 0, "", time.Time{}, err
	}
	if reused {
		return accountID, "", time.Time{}, ErrRefreshTokenReused
	}
	return accountID, next, expiresAt, nil
}

// Revoke ends the session of a refresh token (logout).
func (s *Sessions) Revoke(ctx context.Context, token string) error {
	return db.New(s.pool).RevokeRefreshTokenByHash(ctx, hashToken(token))
}

// DeleteExpired removes refresh tokens past their expiry.
func (s *Sessions) DeleteExpired(ctx context.Context) (int64, error) {
	return db.New(s.pool).DeleteExpiredRefreshTokens(ctx)
}

func createRefreshToken(ctx context.Context, q *db.Queries, accountID int64) (string, time.Time, error) {
	token := randomString(32)
	expiresAt := time.Now().Add(SessionTTL)
	err := q.CreateRefreshToken(ctx, db.CreateRefreshTokenParams{
		AccountID: accountID,
		TokenHash: hashToken(token),
		ExpiresAt: expiresAt,
	})
	if err != nil {
		return "", time.Time{}, fmt.Errorf("create refresh token: %w", err)
	}
	return token, expiresAt, nil
}

func hashToken(token string) []byte {
	sum := sha256.Sum256([]byte(token))
	return sum[:]
}

// randomString returns n random bytes, base64url encoded.
func randomString(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b) // crypto/rand never fails on supported platforms.
	return base64.RawURLEncoding.EncodeToString(b)
}
