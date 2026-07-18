# MV-123 — board.json has duplicate card ids; the next batch flip will corrupt state

**Priority:** P2 · **Owner:** agent
**Merge:** _founder-gated_ · **Tooling, not product** — no student-facing effect.

## The bug (verified 2026-07-17, still live)

`docs/kanban/board.json` contains **two different cards under `MV-99` and two under `MV-101`**.
Confirmed by direct scan of the live file, not from prose:

```
DUPLICATE IDS: MV-99,MV-101
```

Any tool that looks a card up by id gets whichever it hits first. That is not hypothetical:

- **It has already caused one incident.** The 2026-07-07 batch flip (`a4a881b`) stamped merge
  badges onto the **wrong duplicates**, which left MV-99 and MV-101 stranded in In Review for ten
  days even though both had merged. Corrected by hand on 2026-07-17 after verifying the real state
  from code (`completeness-ring.tsx:11`, `mobile-tab-bar.tsx:42`, `logo.tsx:5`, and commits
  `4efb379` / `2dc11db` being ancestors of master) rather than from the board.
- **It has already destroyed data once.** Per the 2026-07-09 stack-merge lesson, a dedup-union of
  `board.json` **dropped cards** precisely because of these collisions, which is why the merge
  recipe is now "APPEND-ONLY union".

The board is the durable memory that survives compaction. A memory that silently returns the wrong
record is worse than one that is merely incomplete.

## Fix

1. Give the four colliding cards unique ids (new ids for the two later ones; the two originals
   keep theirs). Update every `file:` pointer and any cross-references in card prose.
2. **Add a uniqueness guard to `docs/kanban/build.mjs`** so `npm run board` fails loudly on a
   duplicate id instead of generating a plausible-looking board. Without this the class of bug
   returns the next time two slices are named in parallel.
3. Re-run `npm run board`; confirm 124 cards still render and no card vanished.

## Acceptance criteria

- [ ] Zero duplicate ids in `board.json`.
- [ ] `npm run board` **fails** on an intentionally-introduced duplicate (prove the guard works;
      the guard is the actual deliverable — the rename alone just resets the clock).
- [ ] Card count before == card count after; no card silently dropped.
- [ ] The append-only merge recipe still works.

## Resume notes

- Full incident history in memory `2026-07-08-jsdom-blind-to-layout.md` (stack-merge lesson) and
  `2026-07-03-elevated-calm-overhaul.md` (the `a4a881b` batch flip).
- Detection one-liner:
  ```
  node -e "const b=require('./docs/kanban/board.json');const s={},d=[];b.cards.forEach(c=>{if(s[c.id])d.push(c.id);s[c.id]=1});console.log(d)"
  ```
- `board.md` / `board.html` are GENERATED — never hand-edit; fix `board.json` then `npm run board`.
