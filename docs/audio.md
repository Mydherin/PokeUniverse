# Audio

The game sounds **exactly like FireRed**: music, sound effects and cries are rendered locally from the decompilation (`references/pokefirered`), never downloaded and **never committed**.

## Overview

```
pokefirered (MIDI + instruments) ──► [mid2agb] ──► game song data ──► [poryaaaa_render] ──► WAV master ──► [ffmpeg] ──► .webm (Opus) + .m4a (AAC)
                                       (the game's own converter)       (the GBA sound engine)     (local only)                  (served)
```

- **One command:** `make audio` runs the whole pipeline in a Docker image (`infra/audio/`: `Dockerfile` + `render.sh`, run as the host user; no tools to install on the host). `make up` runs it first.
- **Input:** the sound list, `spa-pokeuniverse/src/game/firered/sounds.json` (sound ID → song or cry). Adding a sound is one line there.
- **Species cries:** every species' cry (1-493) from `make pokemon`'s `cries.json` (which `make audio` runs first): FireRed's cry number for 1-386, rendered as above; `pokeemerald-expansion`'s sample for 387-493 (`sound/direct_sound_samples/cries/<name>.wav`), resampled to 48 kHz; both trimmed and encoded the same way to `audio/cries/<nnn>.webm|.m4a`, rendered once.
- **Faint cries** (phase-5 D15): each species' cry in FireRed's faint mode (`CRY_MODE_FAINT`: release 200, pitch 14440) to `audio/cries/<nnn>_faint.webm|.m4a`; the expansion's samples lowered by the same pitch (×0.8125). Rendered once.
- **Output:** a **gitignored** folder in `spa-pokeuniverse` (`public/firered/audio/`), served like any static file.
- **Incremental:** a sound is rendered again only when the list is newer than its files; species cries only once.
- **Reproducible:** the submodule commit, the poryaaaa commit (validated at `a047cde`) and the encoder settings are pinned, so every build gives the same files.

## Source Data

All of it is in `references/pokefirered/sound/`:

| Data | File(s) | Purpose |
|---|---|---|
| Music and sound effects | `songs/midi/*.mid` | Notes, tempo, loop markers |
| Conversion settings per song | `songs/midi/midi.cfg` | `mid2agb` flags: voicegroup (`-G`), volume (`-V`), reverb (`-R`), priority (`-P`), exact gate times (`-E`) |
| Instruments | `voice_groups.inc`, `direct_sound_samples/`, `programmable_wave_samples/`, `keysplit_tables.inc` | Samples, envelopes and GBA square/noise channels |
| Players | `song_table.inc` | Which music player each song uses (`bgm`, `se1`, `se2`, `se3`) |
| Cries | `cry_tables.inc` | Pokémon cries (by cry number) |

## Pipeline

1. **Copy** `references/pokefirered` into the container's temporary folder. Nothing is ever built inside `references/` ([AGENTS.md](../AGENTS.md#reference-repositories)).
2. **Build `tools/mid2agb`** in that copy and convert every `.mid` with its `midi.cfg` flags. The result is the same song data the game is compiled from.
3. **Render** with [poryaaaa](https://github.com/huderlem/poryaaaa)'s `poryaaaa_render --song <song.s> --sample-rate 48000`:
   - Default engine settings already match FireRed's sound mode (`src/m4a.c`): **13,379 Hz** PCM mixer, **5** PCM channels.
   - Songs and sound effects: `--player` from `song_table.inc` (0 `bgm`, 1 `se1`, 2 `se2`, 3 `se3`).
   - **Cries:** `--cry <number>` plus the call's mode as `--cry-length`, `--cry-release`, `--cry-pan`, `--cry-pitch`, `--cry-volume`, `--cry-chorus` (e.g. Nidorino in doubles mode: length 20, release 225, pan 63, from `PlayCry_ByMode`); trailing silence trimmed.
   - **Looping songs** (a `GOTO` in the song data): rendered with `--loop-count 1` and again with `--loop-count 2`, both `--fadeout 0 --tail 0`; the second file is kept, and the first one's length is where the loop starts (see [Loops](#loops)).
   - **One-shot songs:** rendered to their end (`FINE`), trailing silence trimmed.
4. **Master:** 48 kHz 16-bit stereo WAV, kept locally only.
5. **Encode** with ffmpeg: **Opus 128 kbps in `.webm`** and **AAC 128 kbps in `.m4a`**.
6. **Output per sound:** `<id>.webm`, `<id>.m4a`, and `manifest.json` for all of them: sound ID → `{ "loop": [start, end] }` in samples at 48 kHz for looping songs, `{}` otherwise.

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

- The game uses **sound IDs** (`mus_title`, `se_select`), never file names; the FireRed manifest maps them to files ([tech-stack.md](tech-stack.md#decoupled-presentation)).
- Phaser's Web Audio context, each sound decoded once and kept in memory (`src/game/gba/sound.ts`). The browser gets `.webm` if it can play Opus (`canPlayType`), otherwise `.m4a`.
- **Species cries load on demand** (`cry_<nnn>`, `cry_<nnn>_faint`; not in `manifest.json`: cries don't loop), the first time a screen plays them (`Flow.playCry`, the battle's send-outs and faints), on the cry player.
- **Battle sounds** (`BATTLE_SOUNDS` in the manifest: the battle and victory music, the effectiveness, faint, low HP and stat sounds) load with the battle set when a trainer's script starts. **Script music** (`ScriptStep.music`, e.g. `mus_encounter_boy` during a trainer's intro) loads when played; the map's music comes back when the script ends.
- **Players** like the game's: one **BGM** at a time (starting a song stops the one playing, as FireRed's music player does); sound effects and cries on their own players, over the music.
- **Mono or stereo** by the trainer's SOUND option: every player goes through one output, downmixed to mono by default (FireRed's MONO), stereo as rendered with STEREO.
- **Fade out** as in the game: the BGM volume drops 1/16 every *n* frames, then it stops; the title screen waits for it.
- Audio is unlocked on the first tap or key (required by Safari and iOS): opening `/play` directly shows "Tap or press any key to start" first ([ui.md](ui.md#audio-unlock)).
- Paused with the tab hidden.

## Intro Sounds

| ID | Source | Player |
|---|---|---|
| `mus_game_freak` | Song | BGM |
| `mus_intro_fight` | Song (includes the "blast") | BGM |
| `mus_title` | Song, looping | BGM |
| `se_select` | Sound effect | SE |
| `cry_nidorino_doubles` | Cry 32, doubles mode | Cry |
| `cry_charizard` | Cry 5 | Cry |

## New Game Sounds

Loaded in the background after boot (with the New Game art and text), so the intro starts as fast as before.

| ID | Source | Player |
|---|---|---|
| `mus_new_game_instruct` | Song, looping (controls guide) | BGM |
| `mus_new_game_intro` | Song, looping (Pikachu pages) | BGM |
| `mus_new_game_exit` | Song (end of the Pikachu pages) | BGM |
| `mus_route24` | Song, looping (Oak's speech) | BGM |
| `se_ball_open`, `se_ball_trade` | Sound effects (Nidoran♀'s Poké Ball) | SE |
| `se_ball`, `se_win_open` | Sound effects (naming screen: delete, page swap; `se_win_open` also opens the START menu) | SE |
| `se_warp_in` | Sound effect (the player shrinks) | SE |
| `se_card_open`, `se_card_flip`, `se_card_flipping` | Sound effects (Trainer Card: shown, flip, mid-flip) | SE |
| `se_bag_cursor`, `se_bag_pocket` | Sound effects (Bag: cursor moved, pocket switched) | SE |
| `se_repel`, `se_glass_flute` | Sound effects (a REPEL used; the WHITE or BLACK FLUTE) | SE |
| `cry_nidoran_f` | Cry 28 | Cry |
