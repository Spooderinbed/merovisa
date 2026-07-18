# MV-129 — English editor caps PTE/TOEFL sub-scores to the IELTS scale (audit C-7)

**Priority:** P1 · **Owner:** agent · **Merge:** _founder-gated_
**Source:** 2026-07-10 audit finding **C-7**, confirmed uncarded by the 2026-07-17
coverage pass. Sibling of [MV-124](MV-124-audit-remainder-slices-2-9.md) slice 2 (F-3),
but a DIFFERENT surface — slice 2 fixes scoring; this fixes the editor input.

## Why (student outcome)

A student who took PTE or TOEFL cannot enter their real score. The profile English
editor constrains sub-scores to the IELTS range (0–9, half-band steps), so a PTE 79 or
a TOEFL 100 has no honest representation. The student either mis-enters or bounces — and
a bounce is a bounce to a consultancy.

## The bug

`components/profile/editors/english-editor.tsx` (and check `components/wizard/steps/english-step.tsx`
for the same defect) validates/steps every English sub-score against the IELTS 0–9 / 0.5
scale regardless of the selected test. PTE (10–90) and TOEFL iBT (0–120) have entirely
different ranges and granularity.

## Scope built — "Scoring + input" (founder choice, 2026-07-18)

An understand-phase read overturned the card's original premise. Two corrections:

1. **The live harm was the SCORING bug, not the input.** The card punted the raw
   PTE/TOEFL-vs-IELTS scoring bug to "MV-124 slice 2 / F-3", but that bug is live in
   production today and silently over-scores every PTE/TOEFL taker. The founder chose to
   fold it in here rather than leave it split ("Scoring + input"). So this slice fixed
   **both** the scoring reads and the input surface.
2. **The input fix is HIDE, not rescale.** The overall input already scaled per-test
   (`OVERALL_SCALE`); the only IELTS-only remnant was the four per-band sub-inputs
   (listening/reading/writing/speaking), hardcoded to 0–9/0.5. PTE and TOEFL do not report
   an IELTS-style 4-band breakdown — validation already assumes "PTE/TOEFL fill overall
   only" — so the honest fix is to **hide** those sub-inputs for non-IELTS (and not save
   stale band values under a non-IELTS test), not to rescale them.

### What changed
- **`lib/scoring/profile-strength.ts`** — routed `englishScore` through
  `toIeltsEquivalent(score, englishTest)` before the 7.5/7.0 strong-English thresholds,
  and labelled the factor with the IELTS-equivalent band (was "Strong English (58.0)" for
  a PTE 58; now "Strong English (6.5)" — and 6.5 no longer earns the bonus at all).
- **`lib/callouts/rules.ts`** — the `ielts-low-au` warning now compares the IELTS
  equivalent, so a struggling PTE/TOEFL taker (e.g. PTE 42 ≈ IELTS 5.5) finally sees it.
- **`components/profile/editors/english-editor.tsx`** — per-band sub-inputs hidden for
  PTE/TOEFL; `onSave` no longer writes band values when they're hidden.

### Confirmed-safe (checked, not the raw-score bug)
- `lib/plan/generator.ts:108` — a presence-only `overall == null` null check; never
  compares a score to a threshold. (Copy "Add your IELTS overall score" is IELTS-assuming
  but cosmetic, out of scope.)
- `components/wizard/steps/english-step.tsx` — **already correct**: per-test `TEST_SCALE`,
  a single overall slider (no per-band inputs), and an "≈ IELTS X equivalent" hint.
- `lib/checklist/generator.ts:200` — reads the test *name* (never the score) to pick a
  document kind, but then labels the IELTS threshold with it ("This program lists PTE
  6.5"). A separate display-honesty bug, not the raw-score bug — flagged as a follow-up.

## Acceptance criteria

- [x] A PTE / TOEFL student's score is scored on its true IELTS equivalent; an IELTS
      student is byte-identical (passthrough — full suite unchanged, no golden drift).
- [x] No score is silently coerced onto the wrong scale; the profile editor shows only the
      inputs that are meaningful for the selected test.
- [x] Gate green: typecheck (clean) + lint (0 errors) + test (298 files / 1954 passing).
      Editor is auth-gated (Google-only OAuth, no dev bypass) — covered via RTL, per the
      same live-pass limitation as MV-121.

## Evidence (2026-07-18)

- TDD red→green: 9 driving assertions failed for the right reason (over-award `71` vs
  correct `63`; callouts returned `false`; label read `73.0` not `7.5`), then passed after
  the fix; 4 guard tests held throughout.
- New tests: `tests/scoring/profile-strength.test.ts` (+5), `tests/callouts/rules.test.ts`
  (+4), `tests/components/profile/english-editor.test.tsx` (+4).
- Full suite: **298 files, 1954 tests passing**; typecheck clean; lint 0 errors.

## Resume notes

- The shared converter is `lib/scoring/english-equivalent.ts` (`toIeltsEquivalent`);
  omitted/`ielts` test ⇒ passthrough, which is why the IELTS goldens never moved.
- The checklist "PTE 6.5" threshold-mislabel (above) is worth its own card if the founder
  wants it — it mislabels an IELTS admission threshold with the student's test name.
