# MV-89 — Overhaul Phase 0c-2: rebrand completion (off-globals surfaces + permanent contrast guard)

**Column:** In Review (founder-gated merge) · **Priority:** P1 · **Owner:** agent
**Branch:** `mv-89-rebrand-completion` (STACKED on `mv-84-dusk-plum-tokens`) · **Merge after PR #41.**
**Spec:** docs/design/2026-07-03-elevated-calm-overhaul-spec.md (Phase 0c hand-off) · Umbrella: MV-87.

## Why

MV-84 swapped the 23 tokens in `app/globals.css`, but four brand surfaces live
*outside* the CSS custom-property cascade and still carried teal-era values — and
nothing guarded the live tokens against a future contrast regression.

## Scope (all shipped)

1. **`app/global-error.tsx`** — the document-replacing last-resort boundary
   hard-codes colours on purpose (the app's CSS may be exactly what failed).
   5 inline hexes swapped: bg `#f6f5f1→#f4f1ea`, ink `#23231f→#211a20`
   (old value was a drifted approximation of `--ink`), soft `#55554e→#5c5058`,
   CTA `#0f5e54→#6a2b57`, CTA text `#ffffff→#fdf7fb` (now the real on-primary).
2. **`app/layout.tsx`** — scout finding: there was **no** themeColor at all.
   Added a `viewport: Viewport` export with per-scheme themeColor = `--bg`
   (`#f4f1ea` light / `#141014` dark). Correct because MV-43 makes the app follow
   the OS scheme pre-hydration, so the media query matches the served theme.
   *Known minor:* a user who manually forces the non-OS theme gets an
   OS-coloured browser chrome tint (static meta can't follow `data-theme`).
3. **Icons** — new `app/icon.svg` (plum rounded square + on-primary "M"
   polyline; **provisional** — superseded by the Wayfinder mascot mark, MV-85);
   `app/favicon.ico` **regenerated** as PNG-in-ICO (16px+32px) by the new
   zero-dependency `scripts/generate-favicon.mjs` (SDF rasteriser of the same
   geometry; re-run after any brand change: `node scripts/generate-favicon.mjs`).
4. **`CLAUDE.md`** Design-Language hexes → plum era (primary/bg/verdicts lines +
   "deep teal"→"dusk plum" wording; "Calm authority" name untouched — renaming
   the design language belongs to the overhaul spec, not this slice).
5. **NEW `tests/styles/token-contrast.test.ts`** — permanent WCAG 2.1 guard over
   the LIVE `app/globals.css`: imports the pair policy from
   `scripts/palette-candidates.data.mjs` (guard and harness can never disagree on
   WHAT to check), replicates the harness math exactly (float composite,
   TINT_BASE ambient-base map, `1e-9` epsilon), asserts all pairs × both themes
   ≥ 4.5:1 text / 3:1 ui, plus a 23-tokens-per-theme names-frozen count.
6. **NEW `tests/styles/brand-surfaces.test.ts`** — pins surfaces (1)–(3) to the
   plum literals and asserts the retired teal set (`#f6f5f1 #0f5e54 #4eb39f
   #111210 #23231f #55554e`) never reappears on them.

## Evidence (gate)

- TDD: brand-surfaces red-first (4 failures), then green; token-contrast guard
  green against the live plum tokens on first run (54 pair-checks + 2 counts).
- `npm run typecheck` clean (after 2 strict index-access fixes in the new test).
- `npx eslint` on all touched files: 0 errors.
- favicon generator evidence: `sample pixel (4,16)@32px = #6a2b57 alpha=255`.
- Full suite / contrast harness / prod build: recorded on the PR (only expected
  red = pre-existing `tests/data/freshness.test.ts`, deferred MV-80 1-July timer).

## Resume notes (cold agent)

- Branch stacks on `mv-84-dusk-plum-tokens` (PR #41). If #41 has merged, rebase
  onto `origin/master` and retarget the PR base to master before merging.
- Plum literal values come from `scripts/palette-candidates.data.mjs`
  (`dusk-plum`) — never hand-transcribe from memory.
- If the favicon design changes, edit geometry in BOTH `app/icon.svg` and
  `scripts/generate-favicon.mjs`, re-run the script, keep brand-surfaces green.

## Follow-ups (not this slice)

- MV-85 Wayfinder mascot → replaces the provisional icon mark (icon.svg +
  generator geometry + optionally an `apple-icon`).
- Dynamic themeColor sync for manually-forced themes (tiny client effect) — only
  if the founder cares about the chrome-tint edge.
- `docs/superpowers/specs/2026-06-02-onboarding-mvp-design.md` Section 7 token
  reference still lists teal-era values — historical spec, owned by the overhaul
  spec rewrite, deliberately untouched here.
