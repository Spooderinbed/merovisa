# MV-121 — An all-Reach student opens an empty matches page

**Column:** In Review · **Priority:** P1 · **Owner:** agent
**Branch:** `mv-121-reach-group-collapsed` (off `origin/master` `13a0775`) · **Merge:** _founder-gated_

## ✅ BUILT 2026-07-18 — In Review

Unblocked once #81/#82/#83 all merged (master `13a0775`). Branched cleanly off `origin/master`,
built option 1 via TDD. **The fix is one conditional prop** in `app/(app)/matches/page.tsx`:
`initialVisible={strong.length === 0 && possible.length === 0 ? 3 : 0}` on the Reach `VerdictGroup`.
Gate green (typecheck 0, lint 0 errors, **1943 tests**). See Evidence below.

## ✅ Design decision — MADE 2026-07-17 (founder): **Option 1**

**Reveal Reach when it is all there is.** If `strong.length === 0 && possible.length === 0`, render
the Reach group expanded (or `initialVisible={3}`); otherwise keep it collapsed exactly as today.
Chosen over always-show-3 (partly undoes disclosure for everyone) and over the empty-state rewrite
(bigger build; may still be worth its own card later, but is NOT this slice).

Build option 1 only. Do not re-open the choice.
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

## The design question — ANSWERED (kept for the reasoning)

The options were not equivalent, so this went to the founder rather than being guessed:

1. **Reveal Reach when it is all there is** — ✅ **CHOSEN**. Smallest change; keeps the collapse for
   students who do have better bands. Does not pretend a reach is not a reach.
2. Always show N reach cards (`initialVisible={3}` unconditionally) — rejected: partly undoes the
   disclosure win for everyone, including students the collapse was written for.
3. Empty-state copy instead of cards ("nothing clears your budget yet — here is the gap and what
   would close it") — **not rejected on merit**, deferred as too big for this slice. It is arguably
   the most useful answer to "what do I do now?", and is worth its own card if the founder wants a
   guidance surface later.

## Acceptance criteria

- [x] A student whose every match is a Reach sees actual cards (or a real empty-state), never a
      page whose only content is a heading and a Show button. — new page test "renders the reach
      cards … when every match is a Reach (MV-121)".
- [x] A student who has Strong/Possible cards still gets the Reach group collapsed — the
      wall-of-cards protection survives for the population it was written for. — new page test
      "keeps the reach group collapsed when the student has a stronger band (MV-121)".
- [x] The verdict itself is unchanged. This card must not re-inflate any band; MV-120's deflation
      is correct and is not under review here. — the C-3 verdict test is untouched and still green;
      the diff touches only `initialVisible`, never the scorer.
- [x] Reason copy stays honest and visible (the shortfall line is the point of the card). — the
      shortfall reason lives on `ProgramCard`, which now renders for the all-Reach student.
- [x] Gate green: `npm run typecheck` (0) + `npm run lint` (0 errors) + `npm test` (1943 passed).
- [⚠] **Live browser pass** — NOT self-serviceable: the signed-in `/matches` page is behind
      Google-only OAuth and the repo has no dev-auth bypass, so an agent cannot authenticate to
      drive it. **Mitigation:** unlike the MV-120 layout case, this bug is a mount/don't-mount
      decision, and the new test renders the *real* `MatchesPage` server component and asserts the
      reach `ProgramCard` is in the DOM — the exact assertion the old heading-only test lacked.
      `VerdictGroup` mounts cards (never CSS-hides them), so DOM presence == on-screen. **Founder
      one-look confirm:** sign in, set finance total to ~AUD 45,000, open `/matches` → the Reach
      cards (with the "Budget short by …" line) should now render instead of a bare Show button.

## Test plan (TDD — red first)

1. All-Reach student → matches page renders at least one `ProgramCard`. **Red today.**
2. Mixed student (>=1 strong) → Reach group still collapsed; `Show N reach matches` present.
3. `VerdictGroup` unit: `initialVisible={0}` with a non-empty list still renders its heading + count
   (guards the existing contract while the page-level rule changes).
4. No verdict changes: a fixture's banded verdict is identical before and after.

## Evidence (2026-07-18)

**Diff — one file, one conditional prop:**
- `app/(app)/matches/page.tsx` — Reach `VerdictGroup` now takes
  `initialVisible={strong.length === 0 && possible.length === 0 ? 3 : 0}` (was a bare `{0}`). When
  Strong and Possible are both empty, Reach shows like any band; otherwise it stays collapsed. No
  other file changed; the scorer and `VerdictGroup` are untouched.

**Tests — `tests/app/matches-page.test.tsx` (+2, TDD red→green):**
1. "renders the reach cards … when every match is a Reach (MV-121)" — 45,000 budget, one program,
   all-Reach. **Watched RED** ("Unable to find text: Master of IT" — the card was collapsed), then
   green after the fix. Asserts `Reach (1)` heading, the `ProgramCard` text on screen, and **no**
   "Show N reach match" button.
2. "keeps the reach group collapsed when the student has a stronger band (MV-121)" — 70,000 budget,
   p1 strong + p2 (minGrade 90 → an 18-pt gap → unambiguous reach). Asserts Strong visible, Reach
   collapsed (card absent, "Show 1 reach match" present). Passed before and after → proves the fix
   does not over-reach and undo the disclosure win.
- Test-plan item 3 is already covered by the existing `verdict-group.test.tsx` "defaults a Reach
  band to fully collapsed when initialVisible is 0". Item 4 (no verdict change) is covered by the
  untouched C-3 test staying green.

**Gate:** `npm run typecheck` 0 · `npm run lint` 0 errors (1 pre-existing `build.mjs` warning from
#82, unrelated) · full suite **1943 passed / 298 files** (1941 at the merged tip + these 2).

**Reach-fixture gotcha (recorded for next time):** a mere budget shortfall bands as *Possible*, not
*Reach* — `compute.ts` only forces reach on `gradeGap > 10`, `englishGap > 1`, or
`budget < reachRatio × requiredTotal`. To make a deterministic reach fixture, miss the grade by
>10 rather than relying on the exact `reachRatio`.

## Resume notes

- Evidence for the live all-Reach case is on the MV-120 dossier (60/60 Reach at A$45,000, with the
  exact shortfall copy verified to the dollar on Adelaide and UQ).
- `VERDICT_LABELS` (`lib/scoring/verdict-labels.ts:11-13`): reach's `groupLabel` is **"Reach"**, not
  "Reach matches" — a test asserting `/Reach matches/` will fail. Strong's is "Strong matches".
- `VerdictGroup` does NOT mount hidden cards (`verdict-group.tsx:34`) — that is the real perf win,
  so any fix should keep lazy mounting rather than render all 60 eagerly.
