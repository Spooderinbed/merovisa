# MV-128 — 46 dossiers store a stale column; the README already forbids the field

**Priority:** P2 · **Owner:** agent
**Merge:** _founder-gated_ · **Tooling, not product** - no student-facing effect.
**Found:** 2026-07-17, while building [MV-123](MV-123-board-duplicate-id-collision.md).
Split off deliberately rather than folded in (see "Why this is not part of MV-123").

## The bug (verified 2026-07-17)

[README.md](../README.md) anti-drift rule 1 says card state lives **only** in `board.json`,
and states the consequence outright: *"This is why dossiers have no `Column:` field."*

Reality never matched the rule. **59 dossiers carry a `**Column:**` line, and 49 of them
disagree with `board.json`** - every one claiming `In Review` / `In Progress` / `Backlog`
for work `board.json` records as `done`. MV-123 fixed 3 of them (the renamed MV-125/126/127),
so **46 remain**.

Detection:

```
node -e "const fs=require('fs');const b=JSON.parse(fs.readFileSync('docs/kanban/board.json','utf8'));const m={};b.cards.forEach(c=>{if(c.file)m[c.file.split('/').pop()]=c.col});const n=s=>s.toLowerCase().replace(/[^a-z]/g,'');let bad=0;fs.readdirSync('docs/kanban/cards').filter(f=>f.endsWith('.md')).forEach(f=>{const t=fs.readFileSync('docs/kanban/cards/'+f,'utf8');const x=t.match(/^\*\*Column:\*\*\s*([A-Za-z ]+)/m);if(!x||!m[f])return;if(n(x[1])!==n(m[f]==='inreview'?'In review':m[f]==='inprogress'?'In progress':m[f]))bad++});console.log(bad+' dossiers disagree with board.json')"
```

## Why it matters

A second, stale copy of state is exactly how an agent reaches a wrong conclusion confidently.
It nearly happened while building MV-123: the dossiers for the two cards being renamed both
said `In review` for work that merged on 2026-07-07, and only a code-level check
(`git merge-base --is-ancestor`) settled the truth. An agent trusting the dossier would have
"resumed" finished work.

This is the same family as MV-123 (the board asserting something untrue), just in the
dossiers rather than `board.json`.

## Fix

1. Strip the `**Column:**` field from all 46 remaining dossiers (it is one field inside an
   existing header line; the `Priority`/`Owner`/`Created` fields on that line stay).
2. **Add rule 5 to [validate.mjs](../validate.mjs): no dossier may contain a `Column:` line.**
   The rule is the deliverable - a cleanup without it drifts straight back, which is how the
   board got here.
3. Re-run `npm run board`; confirm 129 cards and no card dropped.

## Why this is not part of MV-123

**The guard rule cannot land while branches are in flight that still write `Column:`.**
When MV-123 was built, PR #81 carried four new dossiers (MV-121/122/123/124), at least one
of which has a `Column:` line. Adding rule 5 to MV-123 would have made `npm run board` fail
the moment #81 merged - booby-trapping the founder's own merge with a guard they did not ask
for. And the cleanup **without** rule 5 is low-value churn that drifts back.

So this card is correctly sequenced **after** #81 lands, not folded into MV-123.

## Acceptance criteria

- [ ] Zero dossiers contain a `Column:` line.
- [ ] `npm run board` **fails** on a dossier with a `Column:` line reintroduced (prove the
      rule; the rule is the actual deliverable).
- [ ] Card count before == card count after.
- [ ] Gate green: `npm run typecheck` + `npm run lint` + `npm test`.

## Resume notes

- **Blocked-by: PR #81 merging** (it carries dossiers that would fail the new rule). Check
  first; if #81 is merged, this is unblocked and needs no founder input.
- Do NOT "fix" the stale values by correcting them to match `board.json`. The field itself is
  the bug - a second copy of state that drifts. Delete it.
- The `Priority:` / `Owner:` / `Created:` fields on the same line are NOT state that drifts;
  leave them.
- MV-123 already did MV-125/126/127; do not redo them.
