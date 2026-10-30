// Package config loads mic-core settings from environment variables.
package config

import (
	"crypto/ed25519"
	"encoding/base64"
	"errors"
	"fmt"
	"net/url"
	"os"
)

type Config struct {
	HTTPAddr string
	// PublicURL is the origin players use in the browser (e.g. https://pokeuniverse.example).
	PublicURL *url.URL

	DatabaseURL string

	RedisAddr     string
	RedisPassword string

	NATSURL      string
	NATSUser     string
	NATSPassword string

	// Google sign-in is disabled while these are empty.
	GoogleClientID     string
	GoogleClientSecret string

	JWTKeyID      string
	JWTPrivateKey ed25519.PrivateKey
}

// Load reads and validates the configuration.
func Load() (Config, error) {
	var errs []error
	required := func(name string) string {
		v := os.Getenv(name)
		if v == "" {
			errs = append(errs, fmt.Errorf("%s is required", name))
		}
		return v
	}

	cfg := Config{
		HTTPAddr:           envOr("HTTP_ADDR", ":8081"),
		DatabaseURL:        required("DATABASE_URL"),
		RedisAddr:          required("REDIS_ADDR"),
		RedisPassword:      os.Getenv("REDIS_PASSWORD"),
		NATSURL:            required("NATS_URL"),
		NATSUser:           os.Getenv("NATS_USER"),
		NATSPassword:       os.Getenv("NATS_PASSWORD"),
		GoogleClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
		GoogleClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
		JWTKeyID:           required("JWT_KEY_ID"),
	}

	if raw := required("PUBLIC_URL"); raw != "" {
		u, err := url.Parse(raw)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
			errs = append(errs, errors.New("PUBLIC_URL must be an absolute http(s) URL"))
		} else {
			cfg.PublicURL = &url.URL{Scheme: u.Scheme, Host: u.Host}
		}
	}

	if raw := required("JWT_PRIVATE_KEY"); raw != "" {
		seed, err := base64.StdEncoding.DecodeString(raw)
		if err != nil || len(seed) != ed25519.SeedSize {
			errs = append(errs, errors.New("JWT_PRIVATE_KEY must be the base64 of a 32-byte Ed25519 seed"))
		} else {
			cfg.JWTPrivateKey = ed25519.NewKeyFromSeed(seed)
		}
	}

	return cfg, errors.Join(errs...)
}

// SecureCookies reports whether cookies must carry the Secure flag.
func (c Config) SecureCookies() bool { return c.PublicURL.Scheme == "https" }

// Origin is the exact value browsers send in the Origin header.
func (c Config) Origin() string { return c.PublicURL.String() }

func envOr(name, fallback string) string {
	if v := os.Getenv(name); v != "" {
		return v
	}
	return fallback
}
