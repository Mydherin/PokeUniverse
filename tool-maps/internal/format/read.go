package format

import (
	"bytes"
	"errors"
	"io"
	"os"

	"go.yaml.in/yaml/v3"
)

// UnmarshalYAML accepts "route_1" as well as "{ map: route_1, offset: 3 }".
func (c *Connection) UnmarshalYAML(node *yaml.Node) error {
	if node.Kind == yaml.ScalarNode {
		c.Map = node.Value
		return nil
	}
	type plain Connection
	return node.Decode((*plain)(c))
}

func ReadMap(path string) (*Map, error)         { return read[Map](path) }
func ReadLayout(path string) (*Layout, error)   { return read[Layout](path) }
func ReadTileset(path string) (*Tileset, error) { return read[Tileset](path) }

// read decodes one file strictly: unknown fields are errors, so typos never pass silently.
func read[T any](path string) (*T, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	dec := yaml.NewDecoder(bytes.NewReader(data))
	dec.KnownFields(true)
	var v T
	if err := dec.Decode(&v); err != nil && !errors.Is(err, io.EOF) {
		return nil, err
	}
	return &v, nil
}
