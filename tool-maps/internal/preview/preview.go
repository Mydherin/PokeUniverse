// Package preview draws maps and tilesets to PNG so they can be checked by eye:
// maps with numbered rows and columns, tilesets with every tile's index.
package preview

import (
	"image"
	"image/color"
	"image/draw"

	"pokeuniverse/tool-maps/internal/art"
	"pokeuniverse/tool-maps/internal/format"
	"pokeuniverse/tool-maps/internal/world"
)

type Options struct {
	Region    image.Rectangle // in tiles; empty for the whole map
	Scale     int
	Collision bool // hatch blocked tiles in red
	Objects   bool // outline warps and objects
}

// Marker colors, also printed by the preview command.
var Markers = []struct {
	Kind  string
	Color color.NRGBA
}{
	{"warp", color.NRGBA{0, 220, 255, 255}},
	{format.ObjectNPC, color.NRGBA{255, 60, 200, 255}},
	{format.ObjectSign, color.NRGBA{255, 230, 0, 255}},
	{format.ObjectHiddenItem, color.NRGBA{60, 255, 60, 255}},
	{format.ObjectTrigger, color.NRGBA{255, 140, 0, 255}},
}

func marker(kind string) color.NRGBA {
	for _, m := range Markers {
		if m.Kind == kind {
			return m.Color
		}
	}
	return color.NRGBA{255, 255, 255, 255}
}

// Map draws a resolved map as the game shows it, then the asked overlays and rulers.
func Map(r *world.Resolved, sheet *art.Sheet, o Options) *image.NRGBA {
	region := o.Region
	if region.Empty() {
		region = image.Rect(0, 0, r.Width, r.Height)
	}
	region = region.Intersect(image.Rect(0, 0, r.Width, r.Height))
	f := art.Frame
	img := image.NewNRGBA(image.Rect(0, 0, region.Dx()*f, region.Dy()*f))
	draw.Draw(img, img.Bounds(), image.NewUniform(color.Black), image.Point{}, draw.Src)
	at := func(x, y int) image.Point { return image.Pt((x-region.Min.X)*f, (y-region.Min.Y)*f) }
	for y := region.Min.Y; y < region.Max.Y; y++ {
		for x := region.Min.X; x < region.Max.X; x++ {
			i := y*r.Width + x
			sheet.Draw(img, at(x, y), r.Tiles[i].Index, sheet.Below)
			sheet.Draw(img, at(x, y), r.Tiles[i].Index, sheet.Above)
			if o.Collision && !r.Walkable[i] {
				hatch(img, at(x, y), f)
			}
		}
	}
	if o.Objects {
		box := func(p format.Point, inset int, c color.NRGBA) {
			if !image.Pt(p.X(), p.Y()).In(region) {
				return
			}
			a := at(p.X(), p.Y())
			outline(img, image.Rect(a.X+inset, a.Y+inset, a.X+f-inset, a.Y+f-inset), c)
		}
		for _, w := range r.Map.Warps {
			box(w.At, 0, marker("warp"))
		}
		for _, obj := range r.Map.Objects {
			box(obj.At, 2, marker(obj.Type))
		}
	}
	return rulers(scale(img, max(o.Scale, 1)), region, f*max(o.Scale, 1))
}

// Catalog draws a tileset's own tiles, 16 per row, each with its index.
func Catalog(sheet *art.Sheet, t *format.Tileset, factor int) *image.NRGBA {
	lo, hi := -1, -1
	for _, tile := range t.Tiles {
		if lo < 0 || tile.Index < lo {
			lo = tile.Index
		}
		hi = max(hi, tile.Index)
	}
	if lo < 0 {
		return image.NewNRGBA(image.Rect(0, 0, 1, 1))
	}
	lo -= lo % 16
	f, gap := art.Frame, 1
	cell := f + gap
	rows := (hi-lo)/16 + 1
	img := image.NewNRGBA(image.Rect(0, 0, 16*cell, rows*cell))
	draw.Draw(img, img.Bounds(), image.NewUniform(color.NRGBA{40, 40, 48, 255}), image.Point{}, draw.Src)
	for _, tile := range t.Tiles {
		n := tile.Index - lo
		p := image.Pt(n%16*cell, n/16*cell)
		draw.Draw(img, image.Rect(p.X, p.Y, p.X+f, p.Y+f), image.NewUniform(color.Black), image.Point{}, draw.Src)
		sheet.Draw(img, p, tile.Index, sheet.Below)
		sheet.Draw(img, p, tile.Index, sheet.Above)
	}
	out := scale(img, factor)
	s := max(factor, 1)
	for _, tile := range t.Tiles {
		n := tile.Index - lo
		label(out, image.Pt(n%16*cell*s, n/16*cell*s), tile.Index, 1, color.White)
	}
	return out
}

// rulers adds the column numbers above and the row numbers left of the map.
func rulers(img *image.NRGBA, region image.Rectangle, tile int) *image.NRGBA {
	margin := labelWidth(region.Max.Y, 1) + 2
	out := image.NewNRGBA(image.Rect(0, 0, img.Bounds().Dx()+margin, img.Bounds().Dy()+9))
	draw.Draw(out, out.Bounds(), image.NewUniform(color.NRGBA{24, 24, 32, 255}), image.Point{}, draw.Src)
	draw.Draw(out, img.Bounds().Add(image.Pt(margin, 9)), img, image.Point{}, draw.Src)
	for x := region.Min.X; x < region.Max.X; x++ {
		if w := labelWidth(x, 1); w <= tile || x%5 == 0 {
			label(out, image.Pt(margin+(x-region.Min.X)*tile+(tile-w)/2, 1), x, 1, color.White)
		}
	}
	for y := region.Min.Y; y < region.Max.Y; y++ {
		label(out, image.Pt(1, 9+(y-region.Min.Y)*tile+(tile-7)/2), y, 1, color.White)
	}
	return out
}

// hatch marks a blocked tile with red diagonal lines, visible on any color.
func hatch(img *image.NRGBA, p image.Point, size int) {
	for y := range size {
		for x := range size {
			if (x+y)%4 == 0 {
				img.SetNRGBA(p.X+x, p.Y+y, color.NRGBA{255, 0, 0, 255})
			}
		}
	}
}

func outline(img *image.NRGBA, r image.Rectangle, c color.NRGBA) {
	for x := r.Min.X; x < r.Max.X; x++ {
		img.SetNRGBA(x, r.Min.Y, c)
		img.SetNRGBA(x, r.Max.Y-1, c)
	}
	for y := r.Min.Y; y < r.Max.Y; y++ {
		img.SetNRGBA(r.Min.X, y, c)
		img.SetNRGBA(r.Max.X-1, y, c)
	}
}

// scale enlarges an image by an integer factor, keeping pixels sharp.
func scale(src *image.NRGBA, n int) *image.NRGBA {
	if n <= 1 {
		return src
	}
	b := src.Bounds()
	dst := image.NewNRGBA(image.Rect(0, 0, b.Dx()*n, b.Dy()*n))
	for y := range dst.Rect.Dy() {
		for x := range dst.Rect.Dx() {
			dst.SetNRGBA(x, y, src.NRGBAAt(x/n, y/n))
		}
	}
	return dst
}
