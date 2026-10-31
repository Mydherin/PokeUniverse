package trainer

import "strings"

// NameMaxLength is FireRed's PLAYER_NAME_LENGTH, for the player and the rival.
const NameMaxLength = 7

// nameChars are the characters on the naming screen's keyboard pages.
const nameChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!?♂♀/-…“”‘'"

// ValidName reports whether a name could come from the naming screen: 1 to 7 of its
// characters, not only spaces (the screen keeps the previous name in that case).
func ValidName(name string) bool {
	n := 0
	for _, r := range name {
		if !strings.ContainsRune(nameChars, r) {
			return false
		}
		n++
	}
	return n >= 1 && n <= NameMaxLength && strings.TrimLeft(name, " ") != ""
}
