package firered

import (
	"strings"
	"unicode"
)

// Snake turns FireRed names into our IDs: "PalletTown_PlayersHouse_2F" → "pallet_town_players_house_2f",
// "SSAnne" → "ss_anne", "Route21" → "route_21".
func Snake(s string) string {
	r := []rune(s)
	var b strings.Builder
	for i, c := range r {
		if i > 0 && r[i-1] != '_' && c != '_' {
			prev := r[i-1]
			nextLower := i+1 < len(r) && unicode.IsLower(r[i+1])
			switch {
			case unicode.IsUpper(c) && (unicode.IsLower(prev) || unicode.IsDigit(prev) && nextLower):
				b.WriteByte('_')
			case unicode.IsUpper(c) && unicode.IsUpper(prev) && nextLower:
				b.WriteByte('_')
			case unicode.IsDigit(c) && unicode.IsLower(prev):
				b.WriteByte('_')
			}
		}
		b.WriteRune(unicode.ToLower(c))
	}
	return strings.Trim(strings.ReplaceAll(b.String(), "__", "_"), "_")
}

// Constant strips a constant's prefix and lowercases it: ("MUS_PALLET", "") → "mus_pallet",
// ("OBJ_EVENT_GFX_MOM", "OBJ_EVENT_GFX_") → "mom". Empty for "0", "NONE" and the like.
func Constant(s, prefix string) string {
	s = strings.TrimPrefix(s, prefix)
	switch s {
	case "", "0", "NONE", "NULL", "0x0":
		return ""
	}
	return strings.ToLower(s)
}
