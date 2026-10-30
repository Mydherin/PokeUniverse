package auth

import (
	"crypto/ed25519"
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	// AccessTokenTTL is the lifetime of an access token.
	AccessTokenTTL = 15 * time.Minute

	tokenIssuer   = "pokeuniverse"
	tokenAudience = "pokeuniverse"
)

var ErrInvalidAccessToken = errors.New("invalid access token")

// Principal is the verified identity carried by an access token.
type Principal struct {
	AccountID int64
	Roles     []string
	ExpiresAt time.Time
}

type claims struct {
	Roles []string `json:"roles"`
	jwt.RegisteredClaims
}

// Tokens signs and verifies access tokens (JWT, EdDSA).
// Verification is local: no database or network call.
type Tokens struct {
	keyID      string
	privateKey ed25519.PrivateKey
	// publicKeys by key ID; holds previous keys during a rotation.
	publicKeys map[string]ed25519.PublicKey
	parser     *jwt.Parser
}

func NewTokens(keyID string, privateKey ed25519.PrivateKey) *Tokens {
	return &Tokens{
		keyID:      keyID,
		privateKey: privateKey,
		publicKeys: map[string]ed25519.PublicKey{keyID: privateKey.Public().(ed25519.PublicKey)},
		parser: jwt.NewParser(
			jwt.WithValidMethods([]string{jwt.SigningMethodEdDSA.Alg()}),
			jwt.WithIssuer(tokenIssuer),
			jwt.WithAudience(tokenAudience),
			jwt.WithExpirationRequired(),
			jwt.WithLeeway(5*time.Second),
		),
	}
}

// Issue creates a signed access token for an account.
func (t *Tokens) Issue(accountID int64, roles []string) (string, time.Time, error) {
	now := time.Now()
	expiresAt := now.Add(AccessTokenTTL)
	token := jwt.NewWithClaims(jwt.SigningMethodEdDSA, claims{
		Roles: roles,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    tokenIssuer,
			Audience:  jwt.ClaimStrings{tokenAudience},
			Subject:   strconv.FormatInt(accountID, 10),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
		},
	})
	token.Header["kid"] = t.keyID
	signed, err := token.SignedString(t.privateKey)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("sign access token: %w", err)
	}
	return signed, expiresAt, nil
}

// Verify checks an access token and returns who it belongs to.
func (t *Tokens) Verify(raw string) (Principal, error) {
	var c claims
	_, err := t.parser.ParseWithClaims(raw, &c, func(token *jwt.Token) (any, error) {
		kid, _ := token.Header["kid"].(string)
		key, ok := t.publicKeys[kid]
		if !ok {
			return nil, fmt.Errorf("unknown key id %q", kid)
		}
		return key, nil
	})
	if err != nil {
		return Principal{}, fmt.Errorf("%w: %v", ErrInvalidAccessToken, err)
	}
	id, err := strconv.ParseInt(c.Subject, 10, 64)
	if err != nil {
		return Principal{}, fmt.Errorf("%w: bad subject", ErrInvalidAccessToken)
	}
	return Principal{AccountID: id, Roles: c.Roles, ExpiresAt: c.ExpiresAt.Time}, nil
}
