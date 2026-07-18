# MV-140 — A match card's reasons must all be true (C-10 + C-5)

**Priority:** P1 · **Owner:** agent
**Merge:** _founder-gated_
**Split from:** [MV-124](MV-124-audit-remainder-slices-2-9.md) **Slice 4** (audit C-10 + C-5).

## The bugs (verified live 2026-07-18)

Field is a **soft sort, not a hard filter** ([compute.ts `rankByField`](../../../lib/matches/compute.ts)) —
deliberately, because only ~7 of the 12 wizard fields have catalogue programs and a hard
filter would empty many students' lists. Two honesty defects rode on that:

- **C-10 — off-field cards claimed nothing.** The field branch had a primary-match arm and
  an also-considering arm but **no `else`**, so a program that was neither (a pure off-field
  program) carried **no field reason at all** — reading as aligned. And **5 of 12 wizard
  fields have zero programs** (law, arts, hospitality, agriculture, other): a Law student got
  a full page of nursing/IT programs presented as *their* matches, with nothing saying we
  don't list Law.
- **C-5 — the AL3 line spoke in DHA's voice.** Every card's Nepal financial reason read
  `"…6 months bank seasoning expected (Nepal AL3)."` — authority voice ("expected" = a rule
  already failed), contradicting the [PolicyBanner](../../../components/matches/policy-banner.tsx)'s
  approved recommendation voice on the same page.

(Per the MV-124 correction block: C-10 was **understated** in the report — it's "no field
reason at all," and `computeMatches` has three callers, not one. C-5 was **overstated** — only
the *matcher* frames seasoning as a rule; the plan/checklist already use recommendation voice
and the research brief says to keep them, so they were left untouched.)

## Fix (shipped)

- **C-5 voice (one edit, both callers):** [compute.ts](../../../lib/matches/compute.ts) AL3
  reason → `"We recommend a Genuine Student narrative and around 6 months of bank seasoning
  (Nepal AL3)."` Both the signed-in and anonymous paths run through `computeMatches`, so one
  edit keeps them identical (`anon-equivalence` stays green automatically).
- **C-10 per-card:** added the missing `else if (inputs.userField)` arm — a pure off-field
  program now gets a truthful negative reason (`kind: "field-outside"`, new union member in
  [types.ts](../../../lib/matches/types.ts), rendered as a muted bullet like every other
  `positive: false` reason). Text: `"Outside your intended field (<field>)."`
- **C-10 page-level:** new shared helper [`uncoveredField(userField, programs)`](../../../lib/matches/coverage.ts)
  — derived from the **catalogue actually passed in** (never a hardcoded list), so a field the
  live DB gains is never falsely disclosed as missing; returns null for an empty catalogue (a
  read-outage/empty-state concern, MV-133, not a per-field claim). Surfaced by a new
  [`FieldCoverageNotice`](../../../components/results/field-coverage-notice.tsx) (calm `Card`
  tint, no fear language; `"other"` gets its own reference-only copy) on **both** the anonymous
  results page ([results.tsx](../../../components/results/results.tsx), carried on
  `AssessmentPayload.fieldCoverageNotice`) and the signed-in matches page
  ([matches/page.tsx](../../../app/(app)/matches/page.tsx)).

## Acceptance criteria

- [x] A pure off-field program carries an honest `field-outside` reason, never silently reads as aligned.
- [x] Primary-field program still gets the positive `field` reason and no off-field reason.
- [x] The AL3 line is recommendation voice (`/recommend/`, no `/expected/`), on both callers.
- [x] An uncovered field (law/arts/hospitality/agriculture/other) surfaces a page-level notice on the anonymous results page AND the signed-in matches page.
- [x] Coverage is derived from the injected catalogue, not a hardcoded list; an empty catalogue discloses nothing.
- [x] No fear/dead-end language in the notice; `"other"` gets a reference-only framing.
- [x] Match order and verdicts unchanged; `anon-equivalence` still green.
- [x] Gate: typecheck 0 · lint 0 · **1994 tests / 304 files**.

## Evidence (2026-07-18)

- **TDD:** 4 behaviours red-first for the right reason (AL3 still said "expected"; no
  `field-outside` kind; no `fieldCoverageNotice` on the payload; the two new modules didn't
  resolve), then green. New tests: `tests/matches/coverage.test.ts`,
  `tests/components/results/field-coverage-notice.test.tsx`; added cases in
  `tests/matches/compute.test.ts`, `tests/results/assemble.test.ts`, and a real page-render
  case in `tests/app/matches-page.test.tsx` (renders the signed-in server component and
  asserts the notice text is in the DOM — not jsdom-blind to the mount).
- **No regressions:** full suite 1994/304 green; `anon-equivalence` unchanged (both callers
  go through `computeMatches`).
- **Live pixel pass deferred:** the notice reuses the PolicyBanner `Card tone="tint"` idiom
  verbatim and the reason renderer keys off `positive` only (no kind-switch to break), so
  layout risk is low; a browser pass on the anon results flow is an optional follow-up.

## Resume notes

- **Do NOT convert the soft field sort to a hard filter** (the build order's explicit C-5/C-10
  risk): that trades a dishonest list for an empty page — the worse bounce. The fix discloses;
  it never removes programs.
- Coverage must stay derived from the **passed-in `programs`**, not a hardcoded field list —
  that's the over-disclosure guard.
- C-5 was scoped to the matcher ONLY. The plan/checklist recommendation voice is correct and
  research-mandated to keep — do not "fix" it.
- MV-124 Slice 4 is DONE via this card. Remaining open slices on MV-124: 5, 6 (2, 3 status per
  the tracking table); 8 founder-gated.
