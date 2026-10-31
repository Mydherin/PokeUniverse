package firered

import (
	"bufio"
	"encoding/binary"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// The GBA's map VRAM: a primary tileset fills the first slots, its secondary the rest.
const (
	PrimaryTiles     = 640
	PrimaryMetatiles = 640
	PrimaryPalettes  = 7
	tilesPerMetatile = 8 // 2 layers of 2×2 tiles of 8×8 pixels
)

// Metatile attributes (metatile_attributes.bin), one u32 per metatile.
const (
	attrBehaviorMask = 0x1ff
	attrEncounter    = 24
	attrLayer        = 29
)

// Layer types: which of a metatile's two layers are drawn above the player.
const (
	layerNormal  = 0 // bottom below, top above
	layerCovered = 1 // both below
	layerSplit   = 2 // bottom below, top above
)

// Encounter types.
const (
	EncounterNone  = 0
	EncounterLand  = 1
	EncounterWater = 2
)

type Tileset struct {
	Dir        string
	Secondary  bool
	Metatiles  []uint16 // 8 tile entries per metatile
	Attributes []uint32
	Tiles      *image.Paletted
	Palettes   [16][16]color.NRGBA
}

func (t *Tileset) Count() int { return len(t.Attributes) }

func (t *Tileset) Behavior(local int) int  { return int(t.Attributes[local] & attrBehaviorMask) }
func (t *Tileset) Encounter(local int) int { return int(t.Attributes[local]>>attrEncounter) & 7 }
func (t *Tileset) layer(local int) int     { return int(t.Attributes[local]>>attrLayer) & 3 }

// LoadTileset reads a tileset folder: metatiles, attributes, tile pixels and palettes.
func (d Decomp) LoadTileset(dir string) (*Tileset, error) {
	t := &Tileset{Dir: dir, Secondary: strings.Contains(dir, "/secondary/")}
	meta, err := os.ReadFile(d.path(dir + "/metatiles.bin"))
	if err != nil {
		return nil, err
	}
	for i := 0; i+1 < len(meta); i += 2 {
		t.Metatiles = append(t.Metatiles, binary.LittleEndian.Uint16(meta[i:]))
	}
	attrs, err := os.ReadFile(d.path(dir + "/metatile_attributes.bin"))
	if err != nil {
		return nil, err
	}
	for i := 0; i+3 < len(attrs); i += 4 {
		t.Attributes = append(t.Attributes, binary.LittleEndian.Uint32(attrs[i:]))
	}
	f, err := os.Open(d.path(dir + "/tiles.png"))
	if err != nil {
		return nil, err
	}
	defer f.Close()
	img, err := png.Decode(f)
	if err != nil {
		return nil, fmt.Errorf("%s/tiles.png: %w", dir, err)
	}
	var ok bool
	if t.Tiles, ok = img.(*image.Paletted); !ok {
		return nil, fmt.Errorf("%s/tiles.png: expected an indexed PNG", dir)
	}
	for p := range t.Palettes {
		if t.Palettes[p], err = readPal(d.path(fmt.Sprintf("%s/palettes/%02d.pal", dir, p))); err != nil {
			return nil, err
		}
	}
	return t, nil
}

// readPal reads a JASC palette as the GBA shows it: 5 bits per channel, expanded to 8.
func readPal(path string) ([16]color.NRGBA, error) {
	var out [16]color.NRGBA
	f, err := os.Open(path)
	if err != nil {
		return out, err
	}
	defer f.Close()
	s := bufio.NewScanner(f)
	for line := 0; s.Scan(); line++ {
		if i := line - 3; i >= 0 && i < 16 {
			var rgb [3]uint8
			for c, v := range strings.Fields(s.Text())[:3] {
				n, _ := strconv.Atoi(v)
				five := uint8(n) >> 3
				rgb[c] = five<<3 | five>>2
			}
			out[i] = color.NRGBA{rgb[0], rgb[1], rgb[2], 255}
		}
	}
	return out, s.Err()
}

// Pair is what a map loads: a primary tileset and, optionally, its secondary.
type Pair struct {
	Primary, Secondary *Tileset
}

// Metatiles is how many metatile slots the pair spans.
func (p Pair) Metatiles() int {
	if p.Secondary == nil {
		return p.Primary.Count()
	}
	return PrimaryMetatiles + p.Secondary.Count()
}

// Owner returns the tileset holding a metatile and its index inside it.
func (p Pair) Owner(id int) (*Tileset, int) {
	if id < PrimaryMetatiles || p.Secondary == nil {
		return p.Primary, id
	}
	return p.Secondary, id - PrimaryMetatiles
}

// Render draws every metatile of the pair as 16×16 frames, 16 per row: frame n is metatile n.
// below holds what is drawn under the player, above what covers them (often empty).
func (p Pair) Render() (below, above *image.NRGBA) {
	count := p.Metatiles()
	rows := (count + 15) / 16
	below = image.NewNRGBA(image.Rect(0, 0, 256, rows*16))
	above = image.NewNRGBA(image.Rect(0, 0, 256, rows*16))
	for n := range count {
		owner, local := p.Owner(n)
		if local >= owner.Count() || (local+1)*tilesPerMetatile > len(owner.Metatiles) {
			continue
		}
		at := image.Pt(n%16*16, n/16*16)
		entries := owner.Metatiles[local*tilesPerMetatile : (local+1)*tilesPerMetatile]
		p.drawLayer(below, at, entries[:4])
		if owner.layer(local) == layerCovered {
			p.drawLayer(below, at, entries[4:])
		} else {
			p.drawLayer(above, at, entries[4:])
		}
	}
	return below, above
}

// drawLayer draws one layer's 2×2 tiles; color 0 of every palette is transparent.
func (p Pair) drawLayer(dst *image.NRGBA, at image.Point, entries []uint16) {
	for k, e := range entries {
		tile, hflip, vflip, pal := int(e&0x3ff), e&0x400 != 0, e&0x800 != 0, int(e>>12)
		src := p.Primary
		if tile >= PrimaryTiles && p.Secondary != nil {
			src, tile = p.Secondary, tile-PrimaryTiles
		}
		palettes := &p.Primary.Palettes
		if pal >= PrimaryPalettes && p.Secondary != nil {
			palettes = &p.Secondary.Palettes
		}
		cols := src.Tiles.Rect.Dx() / 8
		tx, ty := tile%cols*8, tile/cols*8
		if ty+8 > src.Tiles.Rect.Dy() {
			continue
		}
		ox, oy := at.X+k%2*8, at.Y+k/2*8
		for y := range 8 {
			for x := range 8 {
				sx, sy := x, y
				if hflip {
					sx = 7 - x
				}
				if vflip {
					sy = 7 - y
				}
				if idx := src.Tiles.ColorIndexAt(tx+sx, ty+sy) & 15; idx != 0 {
					dst.SetNRGBA(ox+x, oy+y, palettes[pal][idx])
				}
			}
		}
	}
}

// SavePNG writes an image, creating its folder.
func SavePNG(path string, img image.Image) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	if err := (&png.Encoder{CompressionLevel: png.BestCompression}).Encode(f, img); err != nil {
		f.Close()
		return err
	}
	return f.Close()
}
