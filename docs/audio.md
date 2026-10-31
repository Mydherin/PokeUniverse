# Audio

The game sounds **exactly like FireRed**: music, sound effects and cries are rendered locally from the decompilation (`references/pokefirered`), never downloaded and **never committed**.

## Overview

```
pokefirered (MIDI + instruments) ──► [mid2agb] ──► game song data ──► [poryaaaa_render] ──► WAV master ──► [ffmpeg] ──► .webm (Opus) + .m4a (AAC)
                                       (the game's own converter)       (the GBA sound engine)     (local only)                  (served)
```

- **One command:** `make audio` runs the whole pipeline in a Docker image (no tools to install on the host).
- **Output:** a **gitignored** folder in `spa-pokeuniverse` (`public/firered/audio/`), served like any static file.
- **Reproducible:** the submodule commit, the poryaaaa commit (validated at `a047cde`) and the encoder settings are pinned, so every build gives the same files.

## Source Data

All of it is in `references/pokefirered/sound/`:

| Data | File(s) | Purpose |
|---|---|---|
| Music and sound effects | `songs/midi/*.mid` | Notes, tempo, loop markers |
| Conversion settings per song | `songs/midi/midi.cfg` | `mid2agb` flags: voicegroup (`-G`), volume (`-V`), reverb (`-R`), priority (`-P`), exact gate times (`-E`) |
| Instruments | `voice_groups.inc`, `direct_sound_samples/`, `programmable_wave_samples/`, `keysplit_tables.inc` | Samples, envelopes and GBA square/noise channels |
| Players | `song_table.inc` | Which music player each song uses (`bgm`, `se1`, `se2`, `se3`) |
| Cries | `cry_tables.inc` | Pokémon cries |

## Pipeline

1. **Copy** `references/pokefirered` into the container's temporary folder. Nothing is ever built inside `references/` ([AGENTS.md](../AGENTS.md#reference-repositories)).
2. **Build `tools/mid2agb`** in that copy and convert every `.mid` with its `midi.cfg` flags. The result is the same song data the game is compiled from.
3. **Render** with [poryaaaa](https://github.com/huderlem/poryaaaa)'s `poryaaaa_render --song <song.s> --sample-rate 48000`:
   - Default engine settings already match FireRed's sound mode (`src/m4a.c`): **13,379 Hz** PCM mixer, **5** PCM channels.
   - Sound effects: `--player` from `song_table.inc`. Cries: `--cry <id>`.
   - **Looping songs:** `--loop-count 2 --fadeout 0 --tail 0` (intro + two passes, see [Loops](#loops)).
   - **One-shot songs:** rendered to their end (`FINE`), trailing silence trimmed.
4. **Master:** 48 kHz 16-bit stereo WAV, kept locally only.
5. **Encode** with ffmpeg: **Opus 128 kbps in `.webm`** and **AAC 128 kbps in `.m4a`**.
6. **Manifest:** one entry per sound ID with both files and, for music, the loop points in samples (48 kHz).

## Why poryaaaa

- **Accurate:** it ports the game's own m4a driver (sequencer, PCM mixer, PSG) on a GBA hardware model from mGBA; its author's null tests against mGBA are bit-identical in most cases.
- **No ROM:** it reads the decompilation directly; we feed it the game's own compiled song data (`--song`), so volume, reverb and voicegroup come from the song itself.
- **Command line:** scriptable in the build. MIT license (parts MPL 2.0 / LGPL 2.1); used only as a build tool, never shipped.
- **Rejected:** agbplay (needs a ROM, interactive terminal only), SoundFont + MIDI rips (close, not exact), downloaded soundtrack rips (copyrighted, untrusted, not reproducible).

## Format

Measured on `mus_title` (45 s: intro + one pass):

| Format | Size | Exact? |
|---|---|---|
| WAV 48 kHz | 8.5 MB | Yes (master) |
| FLAC 48 kHz / 32,768 Hz | 5.4 MB / 3.9 MB | Yes |
| **Opus 128 kbps (`.webm`)** | **712 KB** | Perceptually identical |
| Opus 96 kbps | 540 KB | Perceptually identical, less margin |
| AAC 128 kbps (`.m4a`) | 728 KB | Perceptually identical |

- **Opus** is the main format: about **7× smaller** than lossless, 48 kHz native (no resampling), clean loops. Supported by Chrome, Edge, Firefox and Safari 17.4+.
- **AAC** is the fallback for older Safari and Safari's WebM bugs. The browser picks the first format it can play (`canPlayType`).
- **Why not lossless:** bit-exact files are 5–7× larger on every first load, mostly on mobile; 128 kbps leaves a wide margin over transparency for the GBA's simple, low-rate sound.
- **48 kHz stereo:** FireRed pans its tracks, so stereo stays.

## Loops

- Songs mark their loop with `[` / `]` in the MIDI (a `GOTO` in the song data). No two passes are bit-identical, even in the game: the 59.73 fps sound engine doesn't line up with the sample rate.
- The file holds **the intro and two passes**; the loop is **the second pass**. Its start already contains the notes and reverb carried over from the previous pass, so the seam sounds like the game.
- Example, `mus_title`: intro 188,160 samples (3.92 s), pass 1,984,256 samples (41.34 s); loop from 2,172,416 to 4,156,672.
- Played with Web Audio's `loopStart` / `loopEnd` on the decoded buffer, never by restarting the file.

## Playback

- The game uses **sound IDs** (`mus_title`, `se_select`), never file names; the asset manifest maps them to files ([tech-stack.md](tech-stack.md#decoupled-presentation)).
- Phaser's Web Audio, decoded once per sound; audio is unlocked on the first tap or key (required by Safari and iOS).
- Music: one at a time, with FireRed's fades between songs. Sound effects and cries: short, kept decoded in memory.
