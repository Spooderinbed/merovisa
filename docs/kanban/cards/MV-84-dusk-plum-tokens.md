# MV-84 — Rebrand token swap: Dusk plum → `app/globals.css` (names frozen)

**Priority:** P1 · **Owner:** agent · **Branch:** `mv-84-dusk-plum-tokens` (off `origin/master` `095110a`)

Overhaul Phase 0c. The direct hand-off from **MV-83** (founder picked **Dusk plum** — `docs/design/2026-07-04-palette-candidates.md`). This is the values-only rebrand of the design system: every surface in the app reads its colour from these 23 semantic tokens, so swapping the values here re-skins the whole product without touching a single component. It **unblocks every Phase 1 surface** (landing, wizard, results, auth) — they build on top of the new palette.

## Board note (why this card is the value swap, not the ADR doc)

`board.json` previously defined MV-84 as the provisional *"design-system v2 spec (type scale + Motion v2 ADR)"* doc. The founder's live intent (this task + the memory note *"MV-84 = globals value-swap"* + the MV-83 card badge *"hands off to MV-84"* + the palette doc's own **"Hand-off to MV-84"** section) all treat MV-84 as **the Dusk-plum globals.css value swap**. The spec explicitly says card numbers are provisional (*"assign the real next-free IDs when filing"*). So MV-84 was re-pointed to the value swap and the displaced ADR-doc scope was re-filed as **MV-88** (backlog) so nothing is lost.

## Scope

- Swap all **23 semantic tokens × light + dark** in `app/globals.css` from teal-era values to Dusk plum. **Token names frozen** — only hex values change.
- Values are copied **verbatim** from the WCAG-proven single source of truth `scripts/palette-candidates.data.mjs` (the `dusk-plum` candidate), which the harness itself imports — no hand transcription.
- Update the stale value-referencing comment; update the one test that pins literal palette hexes.

Out of scope (belongs to later carved slices under the MV-87 umbrella): `token-contrast.test.ts` permanent guard, `app/global-error.tsx` inline hexes, `themeColor` metadata, favicon regeneration, `CLAUDE.md` Design-Language hex refresh. See **Follow-ups** below.

## What changed

- **`app/globals.css`** — light block (`[data-theme="light"]`) + dark block (`[data-theme="dark"]`) values swapped to Dusk plum. Highlights:
  - Light: `primary` `#0f5e54`→`#6a2b57` (deep plum), paper `bg` `#f6f5f1`→`#f4f1ea` (warm), `reach` `#b1503a`→`#a4472f` (warm-nudged for the plum-adjacency gate), `possible` `#b07d22`→`#8f6218` (darkened so amber clears AA even as text), `possible-ink` `#8a6212`→`#836011`.
  - Dark: `primary` `#4eb39f`→`#c98bb4` (orchid re-hue), `bg` `#111210`→`#141014` (warm near-black). Verdict-trio dark values (`strong`/`possible`/`reach` + tints) **unchanged** — they were already the palette's shared dark set.
  - Rewrote the light `possible`/`possible-ink` comment (dropped the stale `#f6f5f1` / `~5.0:1` literals; now points at `scripts/contrast-check.mjs`). Dark `possible` comment kept — still accurate (values still mirror).
- **`tests/styles/globals-a11y.test.ts`** — test `#10` pinned literal `--possible-ink: #8a6212` / `--possible: #b07d22`; updated to `#836011` / `#8f6218`. (Only test in the repo that hardcodes palette hexes — verified by grep across `tests/` + `components/`.)

## Acceptance criteria — all met

- [x] 23 light + 23 dark values match the `dusk-plum` entry in `palette-candidates.data.mjs` **exactly** (deterministic check: 46/46, 0 mismatches, 0 extras, 0 leaks).
- [x] Token **names unchanged** (values-only; `@theme` `--color-*` mappings untouched).
- [x] `node scripts/contrast-check.mjs` exits **0** (162 checks pass).
- [x] Suite green apart from the pre-existing freshness failure (see below).
- [x] Goldens byte-identical (no component/class-string changes).

## Verification evidence (2026-07-03)

- `node scripts/contrast-check.mjs` → **EXIT 0**, "ALL PAIRS PASS ✓" (162 checks).
- Deterministic transcription check (parse globals.css vs canon): **46/46 match, 0 mismatches**.
- `npm run typecheck` → **0**.
- `npm run lint` → **0 errors** (1 pre-existing `docs/kanban/build.mjs` unused-var warning).
- `npm test` → **Test Files 1 failed | 250 passed (251); Tests 1 failed | 1588 passed (1589)**. The sole failure is `tests/data/freshness.test.ts` — the deferred **MV-80** 1-July freshness timer (16 overdue AU records), **untouched by this slice** and documented as "CI red by design" until re-verified.
- `npx vitest run tests/styles/globals-a11y.test.ts tests/styles/globals-layering.test.ts` → **2 files / 5 tests passed**.

## Follow-ups (not blockers)

- **Browser sweep** — results/dashboard are auth-gated, so light+dark spacing/appearance on real pages is a blind call here; verify on the Vercel preview for `mv-84-dusk-plum-tokens` (375px + desktop, light + dark, keyboard focus ring).
- **Rebrand completeness (later carved slices):** `app/global-error.tsx` 5 inline hexes, `themeColor` meta in `app/layout.tsx`, favicon, `CLAUDE.md` Design-Language hexes, and the permanent `tests/styles/token-contrast.test.ts` guard — per the MV-87 umbrella / overhaul spec.
- **MV-88** — the displaced "design-system v2 spec (ADR)" doc; founder to decide if a standalone doc is still wanted vs. folding into the existing overhaul spec.

## Resume notes (cold agent)

The change is a pure values-only swap; the branch is `mv-84-dusk-plum-tokens` off `origin/master`. Canonical values live in `scripts/palette-candidates.data.mjs` (`dusk-plum`). Founder-gated merge — do **not** self-merge. If reworking, re-run the deterministic check (parse globals.css light/dark blocks, compare to the `dusk-plum` canon) before touching the gates.
