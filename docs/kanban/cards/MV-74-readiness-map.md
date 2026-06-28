# MV-74 — Dashboard "readiness map" (decomposed verdict)

**Column:** Ready · **Priority:** P2 · **Owner:** agent · **Branch:** `mv-74-readiness-map` (off master)

A dashboard card titled **"Your readiness"** that decomposes the single banded verdict into an
honest map — **what's strong, what needs work, what's a risk** — each row backed by a signal the
scoring engine already computes. Answers the student's real question ("what's holding me back?"),
not the org's ("where am I in the funnel?").

**Design spec (authoritative):** `docs/superpowers/specs/2026-06-28-readiness-map-design.md`.

> **Supersedes** the rejected global journey-rail design
> (`2026-06-28-global-journey-rail-design.md`, abandoned `mv-74-global-journey-rail` branch) —
> rejected after a Codex gpt-5.5 + dashboard-read validation: linear "step N of 6" imposed a false
> funnel, duplicated `PromptCard` + `StatsRow`, and the always-on marker was nagging chrome.

## Why (north star)

A student who can see *what* is dragging their chances down (and what's strong) never hits the
"what now?" dead-end that bounces them to a consultancy. The engine already scores four dimensions
(`academic`/`financial`/`visa`/`profileStrength`) with per-factor `positive`/`neutral`/`risk`
labels — this surfaces that, nothing invented. Funds + English are collected in the wizard and
scored (not data-blocked, as first feared).

## Scope

Four rows — **Academics & English · Money & funding · Visa readiness · Documents**. The first
three derive a word+colour band (strong/needs-work/risk/add-detail) from their dimension's factor
influences; documents is a cheap honest count (not-started / in-progress, never "ready"). Profile
completeness is a quiet header line, not a row. Applications stay in the existing `OutcomeFunnel`.
Dashboard-only; the rejected global marker is dropped.

Architecture mirrors `buildOutcomeRail`: pure `buildReadiness(signals)` helper + presentational
`ReadinessMap` that **replaces `StatsRow`**. Dashboard derives signals from data it already loads
(the `primary` AssessmentPayload's `dimensions`, `completenessPct`, `documents.length`) — zero
extra queries.

## Acceptance criteria

- [ ] `lib/readiness/readiness.ts` — pure `buildReadiness(ReadinessSignals): Readiness`; band per
      dimension row from factor influences (risk→risk, only-positive→strong, else→needs-work,
      under-informed→add-detail); documents 0→not-started / >0→in-progress; `dimensions: null`
      (no assessment) → dimension rows `add-detail` → wizard; why-line = most decision-relevant
      factor; never emits a numeric score into a row; honest `ariaLabel`.
- [ ] `components/dashboard/readiness-map.tsx` — "Your readiness" card; header completeness line;
      4 `next/link` rows with word+colour band pills (verdict palette: teal/amber/reach-red +
      neutral); reach-red only for a genuine `risk` band; no raw `%` in any row; same
      calm-authority tokens; `aria` band words; 44px targets.
- [ ] `app/(app)/dashboard/page.tsx` — build `ReadinessSignals` from already-loaded `primary` /
      `completenessPct` / `documents.length`; render `ReadinessMap` in the `StatsRow` slot; remove
      the old "Your journey was removed…" comment. Zero extra queries.
- [ ] `components/dashboard/stats-row.tsx` removed if unreferenced after the swap (verify first).
- [ ] No migration / no scoring change; verdict + copy goldens byte-identical.

## Test plan (TDD)

Per spec "Testing plan": `tests/readiness/readiness.test.ts` (helper — risk→risk+why,
only-positive→strong, neutral→needs-work, under-informed→add-detail, null-dimensions→add-detail+
wizard href, documents 0/>0, no numeric % in rows, honest ariaLabel, hrefs) +
`tests/components/dashboard/readiness-map.test.tsx` (4 links, band words, risk wording, no raw %,
hrefs) + update/remove the dashboard + stats-row tests for the swap.

**Gate:** `npm run typecheck` + `npm run lint` + `npx vitest run` (full suite) before PR.

## Resume notes (cold-agent)

Design is LOCKED + founder-approved (2026-06-28) via brainstorming + Codex gpt-5.5 student-UX
validation. Spec is the source of truth. **Build order (TDD):** (1) verify the EXACT shape of
`AssessmentResult.dimensions` (academic/financial/visa) and its `factors[].influence` values in
`lib/scoring/types.ts` + `lib/results/types.ts`, and how `primary` (AssessmentPayload) exposes
them on the dashboard — the band predicate is finalised against this real shape and locked by
tests; (2) pure `buildReadiness` (TDD); (3) `ReadinessMap` component (TDD); (4) dashboard rewire +
remove `StatsRow`; (5) full gate → PR (founder-gated merge). Branch `mv-74-readiness-map` already
exists off master with the spec + this card. Do NOT touch the scoring engine, `lib/outcomes/*`
(MV-73), or `PromptCard`/`selectNextStep` — the map reads existing signals, it changes none.
