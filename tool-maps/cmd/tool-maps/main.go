// tool-maps converts, checks, compiles and previews the text maps of lib-maps (docs/maps.md).
// Paths default to the repository layout, run from tool-maps/.
package main

import (
	"errors"
	"flag"
	"fmt"
	"image"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"pokeuniverse/tool-maps/internal/art"
	"pokeuniverse/tool-maps/internal/compile"
	"pokeuniverse/tool-maps/internal/convert"
	"pokeuniverse/tool-maps/internal/firered"
	"pokeuniverse/tool-maps/internal/preview"
	"pokeuniverse/tool-maps/internal/rename"
	"pokeuniverse/tool-maps/internal/validate"
	"pokeuniverse/tool-maps/internal/world"
)

const usage = `usage: tool-maps <command> [flags] [args]

commands:
  convert [--force] [map...]       FireRed maps to text (FireRed names or our IDs; none = all of Kanto)
  validate                         check every map, layout and tileset
  compile                          validate, then write the runtime maps for the client and the server
  tilesets                         render the FireRed tilesets' art to PNG
  preview <map> [--region x,y,w,h] [--scale n] [--collision] [--objects]
                                   draw a map to PNG
  catalog-preview <tileset>        draw a tileset's tiles with their indices
  rename <tileset> <from> <to>     rename a tile in its catalog and every map using it
`

var (
	libDir    = "../lib-maps"
	decompDir = "../references/pokefirered"
	artDir    = "../spa-pokeuniverse/public/firered/tilesets"
	clientDir = "../spa-pokeuniverse/public/maps"
	serverDir = "../mic-core/maps"
	outDir    = "previews"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprint(os.Stderr, usage)
		os.Exit(2)
	}
	commands := map[string]func([]string) error{
		"convert": runConvert, "validate": runValidate, "compile": runCompile, "tilesets": runTilesets,
		"preview": runPreview, "catalog-preview": runCatalogPreview, "rename": runRename,
	}
	run, ok := commands[os.Args[1]]
	if !ok {
		fmt.Fprint(os.Stderr, usage)
		os.Exit(2)
	}
	if err := run(os.Args[2:]); err != nil {
		fmt.Fprintln(os.Stderr, "tool-maps:", err)
		os.Exit(1)
	}
}

func logf(format string, args ...any) { fmt.Printf(format+"\n", args...) }

// flags parses a command's flags wherever they are among its arguments.
func flags(name string, args []string, define func(*flag.FlagSet)) ([]string, error) {
	fs := flag.NewFlagSet(name, flag.ContinueOnError)
	fs.StringVar(&libDir, "lib", libDir, "lib-maps folder")
	define(fs)
	var rest []string
	for len(args) > 0 {
		if err := fs.Parse(args); err != nil {
			return nil, err
		}
		args = fs.Args()
		if len(args) > 0 {
			rest, args = append(rest, args[0]), args[1:]
		}
	}
	return rest, nil
}

func runConvert(args []string) error {
	force := false
	maps, err := flags("convert", args, func(fs *flag.FlagSet) {
		fs.BoolVar(&force, "force", false, "overwrite existing files, catalogs included")
		fs.StringVar(&decompDir, "firered", decompDir, "FireRed decompilation")
	})
	if err != nil {
		return err
	}
	return convert.Run(convert.Options{Decomp: firered.Decomp{Root: decompDir}, Out: libDir, Maps: maps, Force: force, Log: logf})
}

// check loads and validates lib-maps, printing every issue.
func check() (*world.World, *validate.Report) {
	w, problems := world.Load(libDir)
	report := validate.Run(w, problems)
	for _, i := range report.Issues {
		fmt.Println(i)
	}
	fmt.Printf("%d maps, %d layouts, %d tilesets: %d errors, %d warnings\n",
		len(w.Maps), len(w.Layouts), len(w.Tilesets), report.Errors(), report.Warnings())
	return w, report
}

func runValidate(args []string) error {
	if _, err := flags("validate", args, func(*flag.FlagSet) {}); err != nil {
		return err
	}
	if _, report := check(); report.Errors() > 0 {
		return errors.New("validation failed")
	}
	return nil
}

func runCompile(args []string) error {
	if _, err := flags("compile", args, func(fs *flag.FlagSet) {
		fs.StringVar(&clientDir, "client", clientDir, "output folder of the client maps")
		fs.StringVar(&serverDir, "server", serverDir, "output folder of the server maps")
	}); err != nil {
		return err
	}
	_, report := check()
	if err := compile.Run(report, clientDir, serverDir); err != nil {
		return err
	}
	logf("compiled %d maps to %s and %s", len(report.Maps), clientDir, serverDir)
	return nil
}

func runTilesets(args []string) error {
	if _, err := flags("tilesets", args, func(fs *flag.FlagSet) {
		fs.StringVar(&decompDir, "firered", decompDir, "FireRed decompilation")
		fs.StringVar(&artDir, "out", artDir, "output folder of the art")
	}); err != nil {
		return err
	}
	w, problems := world.Load(libDir)
	if len(problems) > 0 {
		return fmt.Errorf("%s (run tool-maps validate)", problems[0])
	}
	return art.Render(w, firered.Decomp{Root: decompDir}, artDir, logf)
}

func runPreview(args []string) error {
	var region string
	opts := preview.Options{}
	rest, err := flags("preview", args, func(fs *flag.FlagSet) {
		fs.StringVar(&region, "region", "", "x,y,w,h in tiles")
		fs.IntVar(&opts.Scale, "scale", 2, "pixels per pixel")
		fs.BoolVar(&opts.Collision, "collision", false, "hatch blocked tiles in red")
		fs.BoolVar(&opts.Objects, "objects", false, "outline warps and objects")
		fs.StringVar(&artDir, "art", artDir, "folder of the tileset art")
		fs.StringVar(&outDir, "out", outDir, "output folder")
	})
	if err != nil {
		return err
	}
	if len(rest) != 1 {
		return errors.New("preview takes one map ID")
	}
	if region != "" {
		if opts.Region, err = parseRegion(region); err != nil {
			return err
		}
	}
	w, _ := world.Load(libDir)
	m, ok := w.Maps[rest[0]]
	if !ok {
		return fmt.Errorf("map %q does not exist", rest[0])
	}
	r, err := w.Resolve(m)
	if err != nil {
		return fmt.Errorf("%w (run tool-maps validate)", err)
	}
	sheet, err := art.Load(artDir, r.Grid.Tileset)
	if err != nil {
		return err
	}
	path := filepath.Join(outDir, m.ID+".png")
	if err := firered.SavePNG(path, preview.Map(r, sheet, opts)); err != nil {
		return err
	}
	logf("wrote %s", path)
	if opts.Objects {
		var keys []string
		for _, mk := range preview.Markers {
			keys = append(keys, fmt.Sprintf("%s #%02x%02x%02x", mk.Kind, mk.Color.R, mk.Color.G, mk.Color.B))
		}
		logf("outlines: %s", strings.Join(keys, ", "))
	}
	return nil
}

func runCatalogPreview(args []string) error {
	scale := 2
	rest, err := flags("catalog-preview", args, func(fs *flag.FlagSet) {
		fs.IntVar(&scale, "scale", scale, "pixels per pixel")
		fs.StringVar(&artDir, "art", artDir, "folder of the tileset art")
		fs.StringVar(&outDir, "out", outDir, "output folder")
	})
	if err != nil {
		return err
	}
	if len(rest) != 1 {
		return errors.New("catalog-preview takes one tileset ID")
	}
	w, _ := world.Load(libDir)
	t, ok := w.Tilesets[rest[0]]
	if !ok {
		return fmt.Errorf("tileset %q does not exist", rest[0])
	}
	// A base has no art of its own when only its derived tilesets were rendered; any of them holds its frames.
	sheet, err := art.Load(artDir, t.ID)
	for _, id := range w.TilesetIDs() {
		if err == nil {
			break
		}
		if w.Tilesets[id].Base == t.ID {
			sheet, err = art.Load(artDir, id)
		}
	}
	if err != nil {
		return err
	}
	path := filepath.Join(outDir, "tileset_"+t.ID+".png")
	if err := firered.SavePNG(path, preview.Catalog(sheet, t, scale)); err != nil {
		return err
	}
	logf("wrote %s", path)
	return nil
}

func runRename(args []string) error {
	rest, err := flags("rename", args, func(*flag.FlagSet) {})
	if err != nil {
		return err
	}
	if len(rest) != 3 {
		return errors.New("rename takes a tileset, the tile's name and its new name")
	}
	w, problems := world.Load(libDir)
	if len(problems) > 0 {
		return fmt.Errorf("%s (run tool-maps validate)", problems[0])
	}
	n, err := rename.Tile(w, rest[0], rest[1], rest[2])
	if err != nil {
		return err
	}
	logf("renamed %s to %s in %d files", rest[1], rest[2], n)
	return nil
}

func parseRegion(s string) (image.Rectangle, error) {
	parts := strings.Split(s, ",")
	if len(parts) != 4 {
		return image.Rectangle{}, errors.New("--region is x,y,w,h")
	}
	var v [4]int
	for i, p := range parts {
		n, err := strconv.Atoi(strings.TrimSpace(p))
		if err != nil {
			return image.Rectangle{}, fmt.Errorf("--region: %w", err)
		}
		v[i] = n
	}
	return image.Rect(v[0], v[1], v[0]+v[2], v[1]+v[3]), nil
}
