# MV-121 — An all-Reach student opens an empty matches page

**Column:** Ready · **Priority:** P1 · **Owner:** agent
**Branch:** `mv-121-reach-group-collapsed` (off `origin/master`, AFTER MV-120 merges) · **Merge:** _founder-gated_
**Found:** 2026-07-17, during the MV-120 live browser pass. **Not in any audit** — jsdom could not
see it, and it did not exist until MV-120 corrected the verdicts.
**Depends on:** MV-120 (PR #81). This is a direct consequence of that slice's deflation.

## Why this is next

MV-120 was correct and is not in question. But it changed the *population* of the Reach band from
"a small tail" to "most students", and the page was built for the old distribution. The north star
says every self-serve dead-end is a bounce to a consultancy; this is a new dead-end that MV-120
created, so it should land close behind it rather than sit in a backlog.

## The bug

`app/(app)/matches/page.tsx:80` renders the Reach group with `initialVisible={0}`:

```tsx
<VerdictGroup verdict="strong"   matches={strong}   statusById={statusById} />
<VerdictGroup verdict="possible" matches={possible} statusById={statusById} />
<VerdictGroup verdict="reach"    matches={reach}    statusById={statusById} initialVisible={0} />
```

`VerdictGroup` returns `null` for an empty group (`verdict-group.tsx:30`). So a student whose every
card is a Reach — now common, and the exact case verified live in MV-120 (60/60 Reach at a 45k
budget) — sees the Strong and Possible sections vanish entirely and the Reach section render as a
bare heading plus a `Show 60 reach matches` button. **Zero cards on screen.**

The page reads as broken or empty at the precise moment the student most needs to understand *why*
they are short and what to do about it. The reasons are already computed and honest
(_"Budget short by AUD 29,710 for tuition + living costs"_) — they are just hidden behind a click.

**Scope: signed-in `/matches` only.** The anonymous `/assess` results page renders reach cards
inline and was verified fine during the MV-120 live pass. Do not "fix" that page.

## Why `initialVisible={0}` was right before, and is wrong now

It is not a bug in isolation — it is progressive disclosure protecting the page from a wall of ~86
cards, and the header still shows the true total. The premise it relied on (Strong/Possible carry
the page; Reach is an afterthought students rarely want) stopped being true when MV-120 landed.
**Do not simply delete it** — the wall-of-cards problem it solves is real and will come back.

## The design question (needs a founder call — do not guess)

The honest options are not equivalent, and this is a product decision, not a correctness one:

1. **Reveal Reach when it is all there is.** If `strong.length === 0 && possible.length === 0`,
   render Reach expanded (or `initialVisible={3}`). Smallest change; keeps the collapse for
   students who do have better bands. Does not pretend a reach is not a reach.
2. **Always show N reach cards** (`initialVisible={3}` unconditionally). Simpler rule, but partly
   undoes the disclosure win for everyone.
3. **Empty-state copy instead of cards.** Say plainly "nothing clears your budget yet — here is the
   gap and what would close it", and let Reach stay collapsed behind it. Most honest framing,
   biggest build, and arguably the most useful: it answers "what do I do now?" rather than showing
   60 cards the student cannot afford.

**Recommendation: option 1 first** (it removes the dead-end with the least product surface), with
option 3 as its own follow-up if the founder wants the guidance surface. Confirm before building.

## Acceptance criteria

- [ ] A student whose every match is a Reach sees actual cards (or a real empty-state), never a
      page whose only content is a heading and a Show button.
- [ ] A student who has Strong/Possible cards still gets the Reach group collapsed — the
      wall-of-cards protection survives for the population it was written for.
- [ ] The verdict itself is unchanged. This card must not re-inflate any band; MV-120's deflation
      is correct and is not under review here.
- [ ] Reason copy stays honest and visible (the shortfall line is the point of the card).
- [ ] Gate green: `npm run typecheck` + `npm run lint` + `npm test`.
- [ ] **Live browser pass** — jsdom cannot see this (it is exactly what MV-120's live pass caught
      and the suite did not). Drive the signed-in `/matches` page at a budget that deflates every
      card to Reach and confirm cards render.

## Test plan (TDD — red first)

1. All-Reach student → matches page renders at least one `ProgramCard`. **Red today.**
2. Mixed student (>=1 strong) → Reach group still collapsed; `Show N reach matches` present.
3. `VerdictGroup` unit: `initialVisible={0}` with a non-empty list still renders its heading + count
   (guards the existing contract while the page-level rule changes).
4. No verdict changes: a fixture's banded verdict is identical before and after.

## Resume notes

- Evidence for the live all-Reach case is on the MV-120 dossier (60/60 Reach at A$45,000, with the
  exact shortfall copy verified to the dollar on Adelaide and UQ).
- `VERDICT_LABELS` (`lib/scoring/verdict-labels.ts:11-13`): reach's `groupLabel` is **"Reach"**, not
  "Reach matches" — a test asserting `/Reach matches/` will fail. Strong's is "Strong matches".
- `VerdictGroup` does NOT mount hidden cards (`verdict-group.tsx:34`) — that is the real perf win,
  so any fix should keep lazy mounting rather than render all 60 eagerly.
