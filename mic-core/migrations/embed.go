// Package migrations embeds the versioned SQL migrations (goose format).
// sqlc reads the same files as its schema.
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS
