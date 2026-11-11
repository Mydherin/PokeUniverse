// Package chat checks the lines players say in a zone's chat (phase-8 D13, D14).
package chat

import "strings"

// MaxLength is a line's length in characters once cleaned (D13: ours; Union Room chat's 15 is
// too short for a typed message).
const MaxLength = 64

// Chars are the printable characters of FireRed's Latin charmap (pokefirered/charmap.txt, the
// font's glyphs), without '▶' (the menu cursor) and '$' (end of string). ’ and ' are the same
// glyph. The SPA's chat input filters with the same list (phase-8 M6): change both together.
const Chars = " ÀÁÂÇÈÉÊËÌÎÏÒÓÔŒÙÚÛÑßàáçèéêëìîïòóôœùúûñºª&+=;¿¡Í%()âí<>0123456789!?.-·…“”‘’'♂♀¥,×/" +
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz:ÄÖÜäöü"

// Clean returns the line as it is said: trimmed, runs of spaces collapsed to one. ok is false
// when it is empty, longer than MaxLength or has a character the font doesn't draw.
func Clean(text string) (line string, ok bool) {
	var b strings.Builder
	n, space := 0, false
	for _, r := range strings.Trim(text, " ") {
		if !strings.ContainsRune(Chars, r) {
			return "", false
		}
		if r == ' ' {
			if space {
				continue
			}
			space = true
		} else {
			space = false
		}
		if n++; n > MaxLength {
			return "", false
		}
		b.WriteRune(r)
	}
	return b.String(), n > 0
}
