# MV-142 — Closed application windows read as closed (F-19)

**Priority:** P1 · **Owner:** agent · **Merge:** _founder-gated_ · **PR:** [#91](https://github.com/Spooderinbed/merovisa/pull/91)
**Split from:** [MV-124](MV-124-audit-remainder-slices-2-9.md) **Slice 6** (audit F-19).
**Build order:** `docs/audits/2026-07-10-comprehensive/VERIFIED-BUILD-ORDER.md` Slice 6.

## The bug (verified live 2026-07-18)

Under "Scholarships you may be able to apply for," the Australia Awards row renders its
application window unconditionally in the **present tense**:

> Applications open 1 Feb 2026, close 30 Apr 2026

The window closed **2026-04-30**. Today is **2026-07-18** — 79 days later — yet the line
still reads as though a student can apply *now*. For a trust-first product whose whole job
is to keep a Nepal→Australia student off a consultancy, telling them a shut door is open is
exactly the kind of quiet dishonesty that sends them to one when they find out.

Root cause: [`selectScholarships()`](../../../lib/data/select-scholarships.ts) builds
`applicationWindow: formatWindow(opens, closes)` with no awareness of the current date, and
it takes no `today` — so the rendering can never know the window has passed.

## Scope — Parts 2 + 3 (Part 1 is founder-gated)

The build order splits F-19 into three parts:

1. **Part 1 — the `reverifyBy` date on the Australia Awards record.** _Founder-gated_:
   needs a DFAT check on when the next intake round opens. Setting it to the known close
   date (2026-04-30) would fire the freshness guard immediately (it is already past), and
   inventing a future date is the worse bug the finding warns against. **Deferred** — this
   card does not touch `lib/data/source/australia-awards-scholarship.ts`.
2. **Part 2 — closed-aware rendering** (this card). Inject `today`; once the window has
   closed, say so and state that the next round's dates are unpublished — never invent them.
3. **Part 3 — a display-freshness guard** (this card). A clock-independent regression guard
   so a passed window can never again render in the present tense.

## Fix

1. `selectScholarships(today: string)` — take an **injected** ISO `today` (never read
   `new Date()` inside the selector; that is the clock-dependent, self-expiring trap that
   produced this finding).
2. When `today >= applicationCloses` (ISO lexicographic), render a closed line instead of
   the open/close line:
   `Applications closed 30 Apr 2026 — check DFAT for the next round's dates.`
   The record holds only a calendar date (no intra-day cutoff), so the close date itself
   reads **closed** — erring toward "closed" so we never tell a student a shut window is
   still open (the F-19 failure direction). The copy points to the funder rather than
   claiming the next round is "unpublished" — a status the record can't support and that
   would go false the day DFAT publishes it. The open/close key-dates line is unchanged
   while the window is still open (or not yet open — a future window reads present tense).
3. `ScholarshipsPanel` gains an optional `today?: string` prop defaulting to the real date
   (`new Date().toISOString().slice(0,10)`), so production shows "now" and tests inject a
   fixed date. The composition root is where "now" legitimately enters — the selector stays
   pure.
4. Display-freshness guard in `tests/data/freshness.test.ts`: at a far-future `today` every
   held window renders closed (no present-tense "applications open"); within the window it
   renders open. Clock-independent, so it is a permanent guard, not self-expiring.

## Acceptance criteria

- [x] `selectScholarships(today)` requires an injected `today`; no `new Date()` in the selector.
- [x] A `today` on or after the close date renders "Applications closed 30 Apr 2026 — check DFAT for the next round's dates." (no present-tense "open").
- [x] A `today` within the window still renders "Applications open 1 Feb 2026, close 30 Apr 2026".
- [x] The next round's dates are never invented, no publication-status claim that can go stale, and the source record is untouched (Part 1 stays founder-gated).
- [x] `ScholarshipsPanel` renders closed for the real today (post-close) and open when a within-window `today` is injected.
- [x] Display-freshness guard: a passed window can never render present-tense open (clock-independent).
- [x] Gate: typecheck 0 · lint 0 (1 pre-existing build.mjs warning) · full suite **302 files / 1986 tests** passing.

## Evidence (2026-07-18)

- **TDD red→green:** 4 assertions failed first for the right reason — the selector always
  rendered the present-tense window, so the closed-tense / self-heal / no-invent cases
  failed while the open-window cases passed. Then green after the reorder.
- **New/changed tests:** `tests/data/select-scholarships.test.ts` (+4: open-while-live,
  inclusive-close-day, closed-after-deadline pinning the exact copy, never-invents-next-intake),
  `tests/components/scholarships-panel.test.tsx` (open injected + a closed-window case),
  `tests/data/freshness.test.ts` (+2: the display-freshness self-heal guard). The `toBe`
  in the closed test pins the exact copy so a careless reword can't slip the guard.
- **Boundary:** `today > applicationCloses` on zero-padded ISO strings — lexicographic, so
  the close day itself stays open (deadline inclusive) and everything after reads closed.
- **No regressions:** full suite 302/1986 green; typecheck clean; only `ScholarshipsPanel`
  calls `selectScholarships`, and a repo grep found no other test/surface asserting the
  window text, so the required-`today` signature change is contained.
- **Live pixel pass:** not possible — the scholarships panel is behind Google-only OAuth
  with no dev bypass (same limitation as MV-121 / MV-129). This is a text/logic change
  (which line renders), not a layout change, so RTL against the *real* component with an
  injected/real `today` is complete proof for both branches.
- **Codex adversarial review** (GPT-5, cross-model): no criticals; completeness check clean
  (sole call site is `ScholarshipsPanel`, mounted only from the matches page). Two material
  findings, both adopted — (1) `>` showed "open" ~20h past the real close on the close day →
  flipped to `>=` (err toward closed); (2) "not yet published" was a self-expiring claim →
  reworded to point at the funder. Declined its suggestion to model a real AEST cutoff
  instant (would edit sourced provenance on an unverified time — out of scope).

## Live-browser pass

Slice 6 is on the build order's live-pass list (cross-page date claim). The scholarships
panel is auth-gated behind Google-only OAuth (no dev bypass), same limitation as MV-121 /
MV-129 — covered via RTL against the real component with an injected/real `today`.

## Resume notes

- Only `ScholarshipsPanel` calls `selectScholarships`; making `today` required touches the
  component + the two test files, nothing else (`app/(app)/matches/page.tsx` renders
  `<ScholarshipsPanel />` with no props → real-date default).
- `AUSTRALIA_AWARDS_SCHOLARSHIPS` IS registered in `DATA_MODULES` (registry.ts), so a
  `reverifyBy` added later (Part 1) is automatically covered by the freshness walk — but its
  value is founder-gated. Do not add it here.
- The close-tense boundary is `today >= applicationCloses` — the close date itself reads
  closed. Chosen after a Codex adversarial review flagged that `>` shows "open" for up to
  ~20h after the real (intra-day, 14:00 AEST) cutoff; with only a calendar date on record,
  err toward closed so we never show a shut window as open. Modelling the real cutoff
  instant would mean adding a verified time+timezone to the sourced record — out of scope
  for a display slice, noted as a possible future data enhancement.
- The closed copy ("check DFAT for the next round's dates") makes no publication-status
  claim, so it cannot silently go stale the way "next round's dates not yet published"
  would once DFAT publishes — which matters because Part 1's `reverifyBy` guard is deferred.
