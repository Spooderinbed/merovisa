# MV-54 — Scholarships: surface held application open/close dates

**Status:** IN REVIEW — SHIPPED 2026-06-26 on branch `mv-51` (branch+PR flow). Founder closes to Done after merge.

Relates to: the scholarships reference surface (`components/matches/scholarships-panel.tsx`, `lib/data/select-scholarships.ts`). Source: 2026-06-26 founder-gap triage (gap #3 — "scholarships is a flat, guidance-free list; quick win = surface the open/close dates already held but never rendered"). Pairs with the research-backed eligibility/how-to half (**MV-55**).

## Problem

The Australia Awards record holds a fixed application window — `applicationOpens: "2026-02-01"`, `applicationCloses: "2026-04-30"` (`lib/data/source/australia-awards-scholarship.ts:22-23`) — but the window was surfaced **nowhere**: `ScholarshipRow` carried no field for it, `selectScholarships()` never mapped it, and the panel never rendered it. A held, machine-checked fact a student needs (when to apply) was invisible.

The three `au-scholarships.ts` rows (Destination Australia, UniMelb GRS, USyd) hold **no** open/close dates — so surfacing this must not invent one for them.

## What shipped

`lib/data/select-scholarships.ts` (wiring + formatting only — no new data, no schema change):

1. **`ScholarshipRow.applicationWindow?: string`** — a new optional, pre-formatted field (the selector owns formatting; the panel stays presentational, matching the existing `amount`/`whatItCovers` pattern).
2. **Deterministic date formatting** — `formatIsoDate("2026-02-01") → "1 Feb 2026"` by slicing the fixed `YYYY-MM-DD` parts (no `Date()`, so no timezone drift). `formatWindow(opens, closes) → "Applications open 1 Feb 2026, close 30 Apr 2026"`.
3. **Mapped onto the Australia Awards row only** — from the held `applicationOpens`/`applicationCloses`. The au-scholarships rows hold no dates, so `applicationWindow` stays `undefined` for them.

`components/matches/scholarships-panel.tsx`: renders a calm mono key-dates line **only when `row.applicationWindow` is present** — so rows without held dates show no line.

**Trust-first held:** the key-dates line appears only where the funder publishes a fixed window; absence is honest, never back-filled. No scorer path touched; verdicts stay banded, no raw %.

## Test plan / evidence (TDD RED→GREEN, +3)

`tests/data/select-scholarships.test.ts` (+2):
- **surfaces the held window** — `australia-awards-nepal` row's `applicationWindow` matches `/open/i`, `/close/i`, `1 Feb 2026`, `30 Apr 2026`. *(RED: field was undefined.)*
- **honest absence** — all three au-scholarships rows keep `applicationWindow` undefined. *(GREEN from the start — the absence guard; locks the no-fabrication contract.)*

`tests/components/scholarships-panel.test.tsx` (+1):
- **renders the key-dates line** — the panel shows `Applications open 1 Feb 2026, close 30 Apr 2026`. *(RED: line absent.)*

**Gate green:** `npm run typecheck` clean · `npm run lint` 0 errors (1 pre-existing `docs/kanban/build.mjs` warning, unrelated) · full suite **1371 passed** (231 files, was 1368 — +3). No snapshot/golden coverage of the panel (grep-confirmed), so the additive optional field + conditional line is safe.

## Out of scope (do NOT add here)

- **Application windows for the au-scholarships rows** (Destination Australia / UniMelb / USyd) — not held; sourcing them is part of MV-55's research, not this wiring slice. Inventing them would break trust-first.
- **The 2027-intake nuance** — the held provenance note records that the 2026 window is for the 2027 intake; that context belongs to the MV-55 eligibility/how-to slice, and the Source link already carries the full DFAT booklet. The row states only the literal open/close dates, which are factually exact.
- **Per-row eligibility / how-to-apply guidance** — MV-55 (research-backed).

## Founder-owned residuals (not blockers)

- **Merge the PR to master** (the single founder-gated step) → then close this card to **Done**.

## How a cold agent resumes

Done. `lib/data/select-scholarships.ts` (new `applicationWindow?` field on `ScholarshipRow`, `MONTHS`/`formatIsoDate`/`formatWindow` helpers near `joinBenefits`, `applicationWindow` set on the Australia Awards `awardsRows` map) + a conditional `<p>` in `scholarships-panel.tsx` after the description + 3 tests. If MV-55 later sources real windows for the au-scholarships providers, add `applicationOpens`/`applicationCloses` to those records + schema and map them through the same `formatWindow` — do **not** hard-code dates in the selector.
