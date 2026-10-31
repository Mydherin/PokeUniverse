package preview

import (
	"image"
	"image/color"
	"image/draw"
	"strconv"
)

// A 3×5 pixel font for the numbers drawn on previews, one row of bits per line.
var digits = [10][5]uint8{
	{7, 5, 5, 5, 7}, {2, 6, 2, 2, 7}, {7, 1, 7, 4, 7}, {7, 1, 7, 1, 7}, {5, 5, 7, 1, 1},
	{7, 4, 7, 1, 7}, {7, 4, 7, 5, 7}, {7, 1, 1, 1, 1}, {7, 5, 7, 5, 7}, {7, 5, 7, 1, 7},
}

// label draws a number on a dark box, scale pixels per font pixel, with its top-left at p.
func label(dst draw.Image, p image.Point, n, scale int, fg color.Color) {
	s := strconv.Itoa(n)
	box := image.Rect(p.X, p.Y, p.X+(len(s)*4+1)*scale, p.Y+7*scale)
	draw.Draw(dst, box, image.NewUniform(color.NRGBA{0, 0, 0, 170}), image.Point{}, draw.Over)
	for i, c := range s {
		glyph := digits[c-'0']
		for y, bits := range glyph {
			for x := range 3 {
				if bits&(4>>x) != 0 {
					px := p.X + (1+i*4+x)*scale
					py := p.Y + (1+y)*scale
					draw.Draw(dst, image.Rect(px, py, px+scale, py+scale), image.NewUniform(fg), image.Point{}, draw.Src)
				}
			}
		}
	}
}

// labelWidth is how wide label draws a number.
func labelWidth(n, scale int) int { return (len(strconv.Itoa(n))*4 + 1) * scale }
