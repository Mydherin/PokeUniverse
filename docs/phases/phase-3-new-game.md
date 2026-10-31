# Phase 3: New Game with Oak

**Goal:** a new player goes through FireRed's New Game exactly like the original: controls guide, Pikachu pages and Professor Oak's introduction.

**Status:** done.

## Scope

- [x] **NEW GAME** on the main menu fades out into New Game, as in FireRed (from the NEW GAME-only window, or below CONTINUE). CONTINUE still only plays the select sound (Phase 4).
- [x] **Controls guide:** the 3 pages explaining the buttons (A next, B back), with the bobbing arrow and `mus_new_game_instruct`.
- [x] **Pikachu pages:** the 3 pages with the animated Pikachu and their cross-fade, `mus_new_game_intro`, then `mus_new_game_exit`.
- [x] **Oak's speech** in FireRed's order, text and art, with `mus_route24`: welcome; Nidoran♀ out of its Poké Ball (sparkles, white flash, cry) and back; BOY or GIRL; the player's name (naming screen, then YES/NO); the rival's name (NEW NAME or 4 presets, then YES/NO); "Let's go!"; the shrink, the white flash and the fade to black. Pictures fade in and out over the platform; the name menus slide the picture aside.
- [x] **Text box like FireRed:** letter-by-letter text at text speed MID, A/B to speed up, the down arrow, scrolling and new pages, reusable for every dialogue. The game's own strings, encoded at build time by `make text` (never committed).
- [x] **Naming screen like FireRed:** the letter grid (upper, lower, symbols pages, swapped with Select or the page button), BACK and OK, the flashing cursor, B to delete, Start to OK, the player's walking sprite or the rival's icon. No device keyboard: the grid works with the D-pad and A/B/Select/Start (touch buttons on mobile).
- [x] **Names checked by the server:** 1 to 7 characters of the naming screen's keyboard, not only spaces. As in FireRed, an empty name keeps the default (a random preset for the player, the first preset for the rival).
- [x] **Saved at the end only:** the trainer (gender, name, rival name) goes to the server (`PUT /api/trainer`) as the player shrinks, in one statement, replacing the account's trainer as a new game replaces the save; the scene ends only once it is saved, retrying if needed. Leaving mid-speech saves nothing: the next New Game starts again.
- [x] After the fade to black the screen stays black until the player's room exists (Phase 4).

## Done When

- [x] A new player finishes Oak's speech, and the next Play shows **Continue** with their trainer.
