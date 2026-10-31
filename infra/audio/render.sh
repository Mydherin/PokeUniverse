#!/bin/sh
# Renders FireRed's sounds exactly from the decompilation (docs/audio.md). Run by `make audio` in infra/audio's image.
# Input: the sound list (sound ID -> song or cry). Output: <id>.webm (Opus), <id>.m4a (AAC) and manifest.json (loop points).
# Then every species' cry (make pokemon's cries.json) to cries/<nnn>.webm|.m4a, loaded on demand.
set -eu

SRC=/repo/references/pokefirered
LIST=/repo/spa-pokeuniverse/src/game/firered/sounds.json
CRIES=/repo/spa-pokeuniverse/public/firered/pokemon/cries.json
OUT=/repo/spa-pokeuniverse/public/firered/audio
RATE=48000

# Never build inside references/: work on a copy.
cp -r "$SRC" /tmp/fr
make -s -C /tmp/fr/tools/mid2agb >/dev/null
mkdir -p "$OUT" /tmp/work

samples() { ffprobe -v error -select_streams a:0 -show_entries stream=duration_ts -of csv=p=0 "$1"; }
render() { poryaaaa_render /tmp/fr "$@" --sample-rate "$RATE" >/dev/null; }
# Trailing digital silence only; the start stays as the game plays it.
trim() { ffmpeg -y -v error -i "$1" -af areverse,silenceremove=start_periods=1:start_threshold=-100dB,areverse "$2"; }

for id in $(jq -r 'keys[]' "$LIST"); do
  entry=$(jq -c --arg id "$id" '.[$id]' "$LIST")
  # Already rendered since the list last changed.
  if [ -f "$OUT/$id.webm" ] && [ -f "$OUT/$id.m4a" ] && [ -f "$OUT/$id.json" ] && [ "$OUT/$id.webm" -nt "$LIST" ]; then
    continue
  fi
  echo "audio: $id"
  loop=""
  song=$(echo "$entry" | jq -r '.song // empty')
  if [ -n "$song" ]; then
    # The game's own conversion: mid2agb with the song's midi.cfg flags, on the player song_table.inc gives it.
    flags=$(sed -n "s/^$song\.mid:[[:space:]]*//p" /tmp/fr/sound/songs/midi/midi.cfg)
    /tmp/fr/tools/mid2agb/mid2agb "/tmp/fr/sound/songs/midi/$song.mid" "/tmp/work/$song.s" $flags
    player=$(sed -n "s/^[[:space:]]*song $song, \([0-9]\).*/\1/p" /tmp/fr/sound/song_table.inc)
    player=$(echo "bgm se1 se2 se3" | cut -d' ' -f$((player + 1)))
    if grep -q GOTO "/tmp/work/$song.s"; then
      # Intro + two passes; the loop is the second pass (docs/audio.md#loops).
      render --song "/tmp/work/$song.s" --player "$player" --loop-count 1 --fadeout 0 --tail 0 --output /tmp/work/one.wav
      render --song "/tmp/work/$song.s" --player "$player" --loop-count 2 --fadeout 0 --tail 0 --output /tmp/work/master.wav
      loop="[$(samples /tmp/work/one.wav), $(samples /tmp/work/master.wav)]"
    else
      render --song "/tmp/work/$song.s" --player "$player" --output /tmp/work/raw.wav
      trim /tmp/work/raw.wav /tmp/work/master.wav
    fi
  else
    cry=$(echo "$entry" | jq -r '.cry')
    set -- --cry "$cry"
    for opt in length release pan pitch volume chorus; do
      value=$(echo "$entry" | jq -r --arg o "$opt" '.[$o] // empty')
      [ -n "$value" ] && set -- "$@" "--cry-$opt" "$value"
    done
    render "$@" --output /tmp/work/raw.wav
    trim /tmp/work/raw.wav /tmp/work/master.wav
  fi
  ffmpeg -y -v error -i /tmp/work/master.wav -c:a libopus -b:a 128k "$OUT/$id.webm"
  ffmpeg -y -v error -i /tmp/work/master.wav -c:a aac -b:a 128k "$OUT/$id.m4a"
  if [ -n "$loop" ]; then echo "{\"loop\": $loop}" > "$OUT/$id.json"; else echo "{}" > "$OUT/$id.json"; fi
done

# One manifest: sound ID -> { loop: [start, end] } in samples at 48 kHz.
for id in $(jq -r 'keys[]' "$LIST"); do jq -c --arg id "$id" '{($id): .}' "$OUT/$id.json"; done | jq -s 'add' > "$OUT/manifest.json"

# Species cries: FireRed's rendered as PlayCry_Normal plays them (1-386), the expansion's samples (387-493)
# converted. Cries never change: skipped once rendered.
mkdir -p "$OUT/cries"
for nnn in $(jq -r 'keys[]' "$CRIES"); do
  [ -f "$OUT/cries/$nnn.webm" ] && [ -f "$OUT/cries/$nnn.m4a" ] && continue
  echo "audio: cry $nnn"
  cry=$(jq -r --arg n "$nnn" '.[$n].cry // empty' "$CRIES")
  if [ -n "$cry" ]; then
    render --cry "$cry" --output /tmp/work/raw.wav
  else
    ffmpeg -y -v error -i "/repo/$(jq -r --arg n "$nnn" '.[$n].wav' "$CRIES")" -ar "$RATE" /tmp/work/raw.wav
  fi
  trim /tmp/work/raw.wav /tmp/work/master.wav
  ffmpeg -y -v error -i /tmp/work/master.wav -c:a libopus -b:a 128k "$OUT/cries/$nnn.webm"
  ffmpeg -y -v error -i /tmp/work/master.wav -c:a aac -b:a 128k "$OUT/cries/$nnn.m4a"
done
