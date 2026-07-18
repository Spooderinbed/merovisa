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

## Fix direction

Per-test min/max/step for the sub-score inputs, keyed off the already-selected test type.
Do NOT convert to IELTS at input time — store the score in its native scale and let the
scoring layer (F-3 / MV-124 slice 2) do any band mapping. Keep the two fixes distinct:
this card is the input surface only.

## Acceptance criteria

- [ ] A PTE / TOEFL student can enter a valid native-scale sub-score; an IELTS student is
      unchanged.
- [ ] Out-of-range entry for the selected test is rejected with an honest message.
- [ ] No score is silently coerced onto the wrong scale.
- [ ] Gate green: typecheck + lint + test. Editor is auth-gated, so cover via RTL + a
      live pass once signed in.

## Resume notes

- Paths verified 2026-07-17: `components/profile/editors/english-editor.tsx`,
  `components/wizard/steps/english-step.tsx` both exist.
- Coordinate with MV-124 slice 2 (F-3, raw PTE/TOEFL-vs-IELTS scoring bug) — same test
  ranges, different layer. Ideally land the scale table once and share it.
