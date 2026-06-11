# Genuine Student credibility module — design spec

**Date:** 2026-06-10
**Status:** APPROVED by user 2026-06-10 with two copy tweaks (refusal-ground framing softened off any "#1" ranking; PR line tied to genuineness/eligibility + I.008 anchor) and one UX decision (collapsible `<details>` sections). Slice ② of the user-ratified sequence; evidence basis: `docs/audits/2026-06-10-pending-ledger-cluster-triage.md`, Headline 1.
**Findings:** 49 gov-backed findings across three categories (F MD106/prompts/basics/post-study, E GS mechanics + English red flag, C GS framework). 3 practitioner rows stay pending (below).

## Problem

The Genuine Student requirement is a central refusal axis (our own refusal panel lists it among the
main grounds) and a heavily agent-coached surface in Nepal — consultancies sell "GS answer writing"
and spread the myth that mentioning future migration intent kills your application. The product currently says
almost nothing about it: one refusal-ground row and one plan card. A student leaves our results page
knowing GS exists but not what it asks, how officers weigh it, or which agent claims about it are
false. That's the trust-defense gap this module closes — from government sources only.

## Decisions

1. **New sourced module** `lib/data/source/au-genuine-student.ts` (+ `lib/data/schema/au-genuine-student.schema.ts`,
   + one `DATA_MODULES` registry entry, category `F`). Row shape mirrors `NepalRefusalRecovery`:
   `{ id, kind, label, summary, source, lastVerified, provenance: { findingRefs, source, note } }`,
   prose-only (no structured values — nothing here is a number the reconciler must match).
   Cross-category findingRefs (C.*, E.*) reconcile globally — the established A.001/B.001 precedent.
   `lastVerified` = each category brief's verification date (resolved at build). Fact-only: no scorer reads it.
2. **Results panel** `components/results/genuine-student.tsx`, rendered **directly after
   `RefusalRecovery`** in `results.tsx` (refusal names Genuine Student among its main grounds; this
   panel explains the test it refers to). Same calm-authority shell as RefusalRecovery/CostToApply
   (mono eyebrow, bg-tint aside, per-row source links). Both modes (anonymous + owned), not gated.
   **Collapsible sections (UX tweak):** the five sections render as native `<details>`/`<summary>`
   blocks — section 1 ("What it is") `open` by default, the rest collapsed — so the page footprint
   stays near the refusal panel's despite 18 rows. Native `<details>` keeps all rows in the DOM
   (accessible + crawlable + test-queryable) and needs no client state, so the **panel stays a
   server component**; the per-row `SourceAnchor` client leaf provides the only interactivity.
   `<summary>` styled as the mono-uppercase section header with a CSS chevron marker (calm-authority:
   thin, no shadow).
3. **Source links** use the analytics `SourceAnchor` with a new surface `"genuine-student"` added to
   the `SourceSurface` union (one-line catalog change + test pin update) — the lane can then measure
   whether GS sources get opened.
4. **Plan enrichment, not a new plan kind:** the existing `prepare-gs-answers` item
   (`lib/plan/generator.ts`) gets its body rebuilt from this module (exact copy below).
   `invalidatePlan`'s copy-refresh (da59c82) carries it to existing open rows automatically.
5. **Checklist enrichment:** one new after-offer visa **step** row (`key: "gs-responses"`, kind null,
   infoKind "step", exact copy below) + a `CHECKLIST_PLAN_LINKS` entry
   `"gs-responses" → "prepare-gs-answers"` so it mirrors the plan item's state (the fix-#5 pattern —
   the plan stays the single completion authority).
6. **Findings accounting:** the 49 gov findings flip pending→used (FLIP_STATUS) and their triage
   fields are cleared in the same change (the Phase-1 schema rule enforces this). Three rows stay
   pending untouched: **F.040** (AHC Lawyers declaration claim — triage says needs a human check),
   **F.041** (KIEC) and **F.055** (Aussizz) — practitioner corroborations of facts the gov rows
   already carry; trust-sensitive content renders from gov sources only (the graduation rule).

## Rendered copy (the review surface)

Panel eyebrow: `The Genuine Student test (Australia)`
Closing disclaimer (verbatim, mirrors slice K): `General context for the Australian Genuine Student requirement, not legal advice.`

Each row renders `summary` with `label` as its linked source text (RefusalRecovery layout). Sections and rows:

### Section 1 — What it is
| Row id | Summary (rendered) | findingRefs | Link |
|---|---|---|---|
| `gs-since-2024` | Every student visa lodged on or after 23 March 2024 is assessed on the Genuine Student requirement — it replaced the old Genuine Temporary Entrant test. | F.001, F.002, C.005 | immi GS page |
| `gs-format` | You answer in the application form itself — 150 words or less per question, in English. DHA prefers in-form answers over a separate statement. | F.004, E.006, F.003, E.007, C.133, E.005 | immi GS page |
| `gs-extra-question` | There's an additional question if you've held a student visa before, or you're applying in Australia from a non-student visa. | F.005, C.135, C.136 | immi GS page |

### Section 2 — The questions you'll answer
| `gs-q-circumstances` | Your current circumstances — your ties to family, community, employment and your economic situation. | F.006 | immi GS page |
| `gs-q-why-course` | Why this course, in Australia, with this provider — and what you understand about the course's requirements and about studying and living in Australia. | F.007, F.008 | immi GS page |
| `gs-q-benefit` | How completing the course will benefit you. | F.009 | immi GS page |

### Section 3 — How officers actually weigh it
| `md106-not-checklist` | Direction 106 tells decision makers not to treat the factors as a checklist — your circumstances are weighed as a whole. | F.014, F.010 | Direction 106 |
| `md106-ties` | Your personal ties to Nepal — family, community, employment — and your economic circumstances relative to Australia. | F.018, F.019 | Direction 106 |
| `md106-research` | How much you actually know: the course, the provider, living arrangements — the depth of your research counts. | F.020, F.021 | Direction 106 |
| `md106-home-course` | Whether a similar course is available at home or in the region, and your reasons for studying it in Australia instead. | F.017, E.010 | Direction 106 |
| `md106-course-value` | Whether the course fits your past study or work — reasonable career changes are accepted — and the pay you could expect with the qualification at home or elsewhere. | F.023, F.024, E.011 | Direction 106 |
| `md106-history` | Your immigration history counts: previous visa applications and refusal circumstances (Australia and other countries), compliance with visa conditions, and — if you've held a student visa — logical course progression. | F.025, F.011, F.012, F.026 | Direction 106 |
| `md106-scrutiny` | Closer scrutiny is flagged for: a field unrelated to your past study or work, inconsistencies in the application, study that looks like maintaining residence, and patterns of changing, deferring or gapping courses. | F.015, F.016, F.022, F.027 | Direction 106 |
| `ssvf-evidence-level` | Under the Simplified Student Visa Framework, documentation expectations also depend on your provider's evidence level — which is based on the student visas linked to that institution. | C.007, C.008 | immi SSVF page |

### Section 4 — Post-study honesty
| `gs-pr-not-disqualifying` | Wanting to apply for permanent residence later does not count against you — as long as your study plan and stay are genuine under the visa rules. Post-study pathways exist, but only for those who are eligible. | C.006, I.008, F.013, E.012 | immi GS page |
| `gs-say-it-straight` | Study Australia says the requirement removed the old confusion about whether you can express a desire to migrate. | F.034 | studyaustralia.gov.au |

> **I.008 note:** clause 500.212 (genuine applicant for entry and stay as a student) is **already
> `used`** by the refusal module (`ground-genuine-student`); referencing it here is provenance reuse,
> not a new flip. It anchors the "genuine under the visa rules" clause and is **not** one of the 49
> pending→used findings. "temporary" deliberately dropped from the user's draft phrasing: GS replaced
> the Genuine Temporary Entrant test (F.034), so re-introducing "temporary stay" risks the exact
> intent-to-leave confusion this row clears.
| `gs-485-reality` | The Temporary Graduate visa (485) lets you live, work and study in Australia temporarily after graduating — but applicants must generally be 35 or under, and since 1 July 2024 you can't apply for a student visa from inside Australia while holding it. | F.035, F.036, F.037, F.038 | immi 485 page |

### Section 5 — Evidence & what not to trust
| `gs-evidence-weight` | DHA gives more weight to answers supported by evidence — attach your documents in ImmiAccount along with your responses. | E.009, E.008 | immi GS page |
| `gs-online-tests` | DHA does not accept English tests delivered completely online. | E.013 | immi English page |
| `gs-test-validity` | English test results from on or before 6 August 2025 can be used as visa evidence until 6 August 2028, depending on the visa. | E.014 | immi English page |

18 rows / 49 findings. Coverage check: C.005–C.008, C.133, C.135–136 (7) + E.005–E.014 (10) + F.001–F.027 less F.013 reorder (26) + F.013, F.034–F.038 (6) = 49.

### Plan body (`prepare-gs-answers`, generator-composed from this module)
> Every Australian student visa (lodged since 23 March 2024) is assessed on the Genuine Student
> requirement. You'll answer short questions in the visa form — your circumstances and ties, why
> this course and this provider, and how it benefits you — each in 150 words or less, in English.
> Answers backed by evidence carry more weight, and wanting permanent residence later doesn't count
> against you as long as you're a genuine student. Draft yours early; they anchor your whole application.

### Checklist row (`gs-responses`, after-offer · visa · step)
> **Genuine Student responses** — Short answers in the visa form — 150 words each, in English.
> Attach supporting evidence in ImmiAccount; evidence-backed answers carry more weight.
> (source: immi GS page; mirrors the `prepare-gs-answers` plan item via plan-links)

## Out of scope

A GS answer-drafting tool (Phase 6 AI guide territory); the 16 practitioner "GS answer coaching"
findings (needs-human-sourcing queue); university GS-screening norms (slice-later cluster);
the working-with-agents module (ratified slice ③).

## Acceptance criteria (tests)

1. Registry walk green: schema validates, every findingRef resolves (cross-category included — the
   row's I.008 ref resolves to the already-`used` clause-500.212 finding), reconcile passes;
   `golden-assessments.json` byte-identical (no scorer reads this module).
2. FLIP_STATUS flips exactly the 49 findings pending→used with triage fields cleared in the same
   change; I.008 is untouched (already used); F.040/F.041/F.055 remain pending with their triage
   intact (findings-integrity suite green).
3. Panel renders all five sections as `<details>` with section 1 `open` and the rest collapsed (all
   rows present in the DOM); every row's source goes through `SourceAnchor` with surface
   `"genuine-student"`; the disclaimer and the `gs-pr-not-disqualifying` row are copy-locked verbatim
   by the component test (the trust-sensitive lines).
4. Generator test pins the enriched `prepare-gs-answers` body; checklist test pins the
   `gs-responses` row (stage, group, source) and its plan-link mirror states (fix-#5 pattern).
5. `SourceSurface` union gains `"genuine-student"` (catalog type test updated).
6. Full gate: typecheck + lint + suite green; panel browser-verified on anonymous results.
