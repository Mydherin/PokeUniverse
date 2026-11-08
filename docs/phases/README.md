# Phases

High-level plan to build the **MVP: all of Kanto, including social features**.

## Principles

- **Each phase ends with something working and testable.**
- **Foundations before features:** later phases only add pieces.
- **Global systems before content:** what affects the whole game (battles, items on Pokémon, multiplayer, social) is built first, on test content. Maps and events come last. *Why: content built on finished systems isn't redone.*
- **Server-authoritative from day one:** even single-player movement goes through the server.
- **Faithful first, then better:** the start of the game (intro, Oak, room, Pallet Town) is rebuilt exactly like FireRed with its original art, then upgraded with public art.
- **FireRed system, Gen 4 rules:** every phase matches FireRed unless it conflicts with the MMO, with Gen 4 battle and Pokémon rules ([vision.md](../vision.md#firered-as-reference)).
- **Riskiest parts early:** the map pipeline and client-server movement validate the approach.

## How a Phase Is Tracked

The phase file is the source of its goal, scope, technical details and progress, self-contained enough to resume with no other read. [AGENTS.md](../../AGENTS.md#current-work) points at the file to resume.

- **Every phase file:** goal, **Resume Here** while it is open (exact next step, what is left), scope with ✅ per item, done when, and the technical details found so far.
- **A phase too big for one file** becomes a folder, like [Phase 5](phase-5-battle-system/phase-5-battle-system.md):

  ```
  phase-N-name/
    phase-N-name.md       goal, Resume Here, milestone table with status, scope, done when
    milestones/
      mNN-name.md         tasks, Resume Here, files, commands, decisions, gotchas: enough alone to resume
      context.md          optional: decisions and details milestones share, read by section
      references.md       optional: where things are in the reference repositories
      log.md              optional: session history, not needed to resume
  ```

- **Planning a milestone:** list every piece, on every layer: contract, server, client screens, and what FireRed shows for it (scenes, art, strings, sounds, with their functions and files). What's missing gets rediscovered at full cost. If it won't fit one session (about 14% of the context after the start, reading included), split it.
- **When a milestone is ✅,** cut its file down to what later milestones use.
- **Code comments** cite a phase's milestones and decisions by short name: `phase-5 M7`, `phase-5 D9` (decisions are in its `context.md`).

## Phases

The list of phases, each one's state and what is still open: [index.md](index.md).
