// Package maps holds the ServerMaps `make maps` compiles from lib-maps into this folder
// (docs/factory/context/maps.md#outputs), built into the binary so every replica plays the same world.
package maps

import "embed"

//go:embed *.binpb
var FS embed.FS
