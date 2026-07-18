# MV-35 — Fix the dashboard "Universities" tile (counted programs, mislabeled)

**Priority:** P1 · **Owner:** agent
**Branch:** `mv-35-saved-programs-tile` · **Shipped:** 2026-06-26
**Evidence:** product-review audit `wf_5fb5dfa7-009` (#5).

## The bug

The dashboard's "Universities" tile rendered `shortlist.length`
(`app/(app)/dashboard/page.tsx:88`). `listShortlistForUser` returns **one row per
shortlisted program** — so three degrees at one university read "Universities = 3", and a
brand-new user saw a bare "0" under "Universities" that could read as "0 universities
exist" on a trust-first product.

No fabrication and no raw % — the value is a faithful count of the student's own rows. It
was only **mislabeled**.

## Fix (honest relabel — the value already matches)

Relabel the tile to **"Saved programs"** and rename the prop `universities` →
`savedPrograms` (the internal name carried the same mislabel). The count already equals the
number of shortlisted programs, so no recomputation is needed. "Saved programs: 0" now reads
plainly as "you haven't saved any yet," resolving the bare-0 misread too.

Chose the relabel over computing a distinct-university count because the student shortlists
**programs**, not universities — "saved programs" is both the truthful and the more useful
number, and it keeps the change surgical (no university-id plumbing into the dashboard).

The "withdrawn programs still increment the count" P2 from the audit is **not actioned**:
the summary itself notes `withdrawn` is unreachable in the live UI, so there is no code path
to exercise it.

## Acceptance criteria

- [x] The tile no longer claims "Universities" for a per-program count.
- [x] Label reads "Saved programs"; value unchanged (faithful program count).
- [x] A bare 0 reads as "none saved yet," not "0 universities exist."
- [x] No fabrication, no raw %.

## Test evidence

- `tests/components/dashboard/stats-row.test.tsx` — updated to the `savedPrograms` prop and
  asserts the tile shows "Saved programs" (and *not* "Universities"), still links to
  `/matches`.

## Gate

- `npm run typecheck` — clean.
- `npm run lint` — 0 errors (1 pre-existing warning in untouched `docs/kanban/build.mjs`).
- Full suite — **1395 passed (235 files)**.
- Goldens — N/A (presentational; no scorer path).

## Files touched

- `components/dashboard/stats-row.tsx`
- `app/(app)/dashboard/page.tsx`
- `tests/components/dashboard/stats-row.test.tsx`
- `docs/kanban/board.json` + regenerated `board.md` / `board.html`
