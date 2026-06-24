# MV-38 — Proof-of-funds as "next step" + what `/documents` is FOR

**Column:** Backlog · **Priority:** P2 · **Owner:** founder · **Gate:** founder product decision (DECIDE-FIRST)
**Created:** 2026-06-24
**Related:** couples with [[MV-37]] (the dashboard "next step" is the top plan item, so plan ordering drives
this), [[MV-08]] / Phase 5 documents. Evidence: product-review audit `wf_5fb5dfa7-009` (2026-06-24).

## Founder critique (#4)

> "Why is [proof of funds] there on the home page — it looks out of place and it's placed as the next step for
> the student. Uploading documents doesn't do anything for the student's actual process."

Two valid points: (a) why does proof-of-funds appear as the dashboard "Next step," and (b) does a store-only
document upload deserve to be surfaced as a process-advancing step at all?

## Why it's there (recorded, verified)

- The plan generator emits `upload-proof-of-funds` ("Add proof of funds") whenever `s.finance?.proofUploaded`
  is falsy (`lib/plan/generator.ts:122-131`); the figure (AUD 29,710) is **real, DHA-sourced** — not a stub or
  fabrication.
- The dashboard surfaces the **single top-ranked open plan item** as the teal "Next step" card
  (`app/(app)/dashboard/page.tsx:30-36`, `selectNextStep`/`pickPrompt`). So proof-of-funds shows whenever it is
  the highest-impact incomplete item — which makes its presence feel arbitrary ("a section"), and surfaces it
  out of journey context.

## The real issue to decide

`/documents` is **store-only** — a personal locker: *"Upload photos so you can pull them up when you need them"*
(`app/(app)/documents/page.tsx:27-30`); completion = mere presence of an upload (`lib/plan/completion.ts`,
`lib/documents/flags.ts:18`). It does **not** submit anything to DHA or a university, and does not validate the
amount / Class-A bank / AUD 29,710 floor. So presenting "Upload in documents" as *the next step* can read as
"I've handled proof of funds" when nothing in the student's real process advanced.

## Options (founder call)

- **(a) Reframe `/documents` as a readiness checklist** — "get your evidence ready," explicitly prep not
  submission — and label uploads as store-only.
- **(b) Demote document-upload items** from the single dashboard "Next step" so they don't masquerade as
  process-advancing (still live on the plan).
- **(c) Keep, but make the value explicit** on the card (this is preparation; it doesn't submit or verify).
- Likely best resolved **together with [[MV-37]]**: in a guided journey, proof-of-funds lands in the
  financial-evidence PHASE, not as a context-free "the next step."

## Acceptance criteria (post decision)

- [ ] Founder picks the role of `/documents` (readiness aid vs. something more) and whether store-only uploads
      may be surfaced as dashboard "next steps."
- [ ] Copy/placement updated so a store-only upload doesn't imply the real visa/application process advanced.
- [ ] No fabricated data; AUD 29,710 keeps its DHA provenance (add a "source: DHA" line on the card — audit P3).

## Resume notes (cold agent)

- DECIDE-FIRST: this is a product call, not an agent build — get founder direction before changing copy/flow.
- Do not delete `/documents`; it's a deliberate Phase 5 surface. The question is framing + whether it belongs
  in the single dashboard "next step" slot.
