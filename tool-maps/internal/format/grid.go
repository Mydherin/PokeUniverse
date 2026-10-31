package format

import (
	"fmt"
	"strconv"
	"strings"
	"unicode/utf8"
)

// Grid text: one character per cell, each row prefixed by its number and two spaces,
// with "#" header lines numbering the columns:
//
//	#   0         1
//	#   01234567890
//	00  ###########
//	01  #.........#

// FormatGrid writes rows of cells in the grid text format.
func FormatGrid(rows [][]rune) string {
	if len(rows) == 0 {
		return ""
	}
	width := len(rows[0])
	pad := rowDigits(len(rows))
	var b strings.Builder
	places := len(strconv.Itoa(max(width-1, 0)))
	for place := places - 1; place >= 0; place-- {
		unit := pow10(place)
		line := []byte("#" + strings.Repeat(" ", pad+1))
		for x := range width {
			// Higher places are written only where they change, at multiples of their unit.
			if place == 0 || x%unit == 0 {
				line = append(line, byte('0'+x/unit%10))
			} else {
				line = append(line, ' ')
			}
		}
		b.WriteString(strings.TrimRight(string(line), " ") + "\n")
	}
	for y, row := range rows {
		fmt.Fprintf(&b, "%0*d  %s\n", pad, y, string(row))
	}
	return b.String()
}

// ParseGrid reads a grid of exactly width × height cells.
func ParseGrid(text string, width, height int) ([][]rune, error) {
	var rows [][]rune
	for n, line := range strings.Split(text, "\n") {
		line = strings.TrimRight(line, " \t\r")
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		digits := 0
		for digits < len(line) && line[digits] >= '0' && line[digits] <= '9' {
			digits++
		}
		if digits == 0 || !strings.HasPrefix(line[digits:], "  ") {
			return nil, fmt.Errorf("line %d: expected a row number and two spaces before the cells", n+1)
		}
		y, _ := strconv.Atoi(line[:digits])
		if y != len(rows) {
			return nil, fmt.Errorf("line %d: row %d where row %d was expected", n+1, y, len(rows))
		}
		cells := []rune(line[digits+2:])
		if len(cells) != width {
			return nil, fmt.Errorf("row %d: %d cells, the map is %d wide", y, len(cells), width)
		}
		rows = append(rows, cells)
	}
	if len(rows) != height {
		return nil, fmt.Errorf("%d rows, the map is %d high", len(rows), height)
	}
	return rows, nil
}

// IsCellChar tells whether a legend character can be written in a grid.
func IsCellChar(s string) bool {
	r, size := utf8.DecodeRuneInString(s)
	return size == len(s) && r != utf8.RuneError && r > ' ' && r != '"' && r != '\\' && r != 0x7f
}

func rowDigits(height int) int { return max(2, len(strconv.Itoa(max(height-1, 0)))) }

func pow10(n int) int {
	p := 1
	for range n {
		p *= 10
	}
	return p
}
