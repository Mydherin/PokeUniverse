// Package art renders FireRed's tilesets into the PNG sheets maps are drawn with, and loads them.
// Each tileset gets two sheets of 16×16 frames, 16 per row, frame n being tile index n:
// <id>.png (drawn under the player) and <id>.above.png (drawn over them).
// A tileset with a base also holds its base's frames, drawn with its own palettes, as the GBA does.
package art

import (
	"fmt"
	"image"
	"image/draw"
	"image/png"
	"os"
	"path/filepath"

	"pokeuniverse/tool-maps/internal/firered"
	"pokeuniverse/tool-maps/internal/world"
)

const Frame = 16

// Render writes the sheets of every tileset converted from FireRed.
func Render(w *world.World, d firered.Decomp, out string, log func(string, ...any)) error {
	if err := d.Check(); err != nil {
		return err
	}
	for _, id := range w.TilesetIDs() {
		t := w.Tilesets[id]
		if t.FireRed == "" {
			continue
		}
		own, err := d.LoadTileset(t.FireRed)
		if err != nil {
			return err
		}
		pair := firered.Pair{Primary: own}
		if t.Base != "" {
			base, ok := w.Tilesets[t.Base]
			if !ok || base.FireRed == "" {
				return fmt.Errorf("tileset %s: base %q has no FireRed source", id, t.Base)
			}
			if pair.Primary, err = d.LoadTileset(base.FireRed); err != nil {
				return err
			}
			pair.Secondary = own
		}
		below, above := pair.Render()
		if err := firered.SavePNG(filepath.Join(out, id+".png"), below); err != nil {
			return err
		}
		if err := firered.SavePNG(filepath.Join(out, id+".above.png"), above); err != nil {
			return err
		}
		log("render %s (%d frames)", id, pair.Metatiles())
	}
	return nil
}

// Sheet is a tileset's art.
type Sheet struct {
	Below, Above image.Image
}

func Load(dir, id string) (*Sheet, error) {
	below, err := loadPNG(filepath.Join(dir, id+".png"))
	if err != nil {
		return nil, fmt.Errorf("%w (run tool-maps tilesets first)", err)
	}
	above, err := loadPNG(filepath.Join(dir, id+".above.png"))
	if err != nil {
		return nil, err
	}
	return &Sheet{below, above}, nil
}

// Frames is how many frames the sheet holds.
func (s *Sheet) Frames() int { return s.Below.Bounds().Dy() / Frame * 16 }

func (s *Sheet) rect(index int) image.Rectangle {
	return image.Rect(index%16*Frame, index/16*Frame, index%16*Frame+Frame, index/16*Frame+Frame)
}

// Draw draws a tile at a pixel position; layer is s.Below or s.Above.
func (s *Sheet) Draw(dst draw.Image, at image.Point, index int, layer image.Image) {
	r := s.rect(index)
	if !r.In(layer.Bounds()) {
		return
	}
	draw.Draw(dst, image.Rectangle{at, at.Add(image.Pt(Frame, Frame))}, layer, r.Min, draw.Over)
}

func loadPNG(path string) (image.Image, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return png.Decode(f)
}
