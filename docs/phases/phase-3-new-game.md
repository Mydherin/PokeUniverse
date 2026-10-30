# Phase 3: New Game with Oak

**Goal:** a new player goes through Professor Oak's introduction exactly like in FireRed.

## Scope

- Oak's speech in FireRed's order, text and art: welcome, the world of Pokémon, boy or girl, player name, rival name, and the shrink transition into the player's room.
- Text box like FireRed (letter-by-letter text, arrow, A/B to advance), reusable for every dialogue.
- Name entry with preset names; physical keyboard on desktop, mobile keyboard handling on mobile ([ui.md](../ui.md#mobile-keyboard)).
- Names validated by the server (length, allowed characters).
- Trainer (gender, name, rival name) saved in PostgreSQL in one transaction at the end of the speech; the game continues only after it's saved.
- Leaving mid-speech starts it again next time (nothing is saved until the end).

## Done When

- A new player finishes Oak's speech, and the next Play shows **Continue** with their trainer.
