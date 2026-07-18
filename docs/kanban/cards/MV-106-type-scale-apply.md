# MV-106 — Overhaul Phase 1: apply the type scale (`text-[Npx]` → named 9-step tokens)

**Priority:** P2 · **Owner:** agent · **Created:** 2026-07-06
**Branch:** `mv-106-type-scale-apply` off `origin/master 92a5c77`
**Applies:** `docs/design/2026-07-03-type-scale-adr.md` (MV-88 decision, PR #47 shipped the doc only). This is the follow-on "application" slice the ADR explicitly deferred — Wave A step 1 of continuing the elevated-calm overhaul.

## Why

Font sizes were baked as Tailwind arbitrary values — `text-[15px]`, `text-[11.5px]`, … **414 occurrences across 109 files, 19 distinct pixel values** jittering in a 16px range. No single source of truth for type; silent 1px drift; the role is invisible at the call site. The signed ADR names a 9-step scale (`text-caption` … `text-display`) as the only sanctioned source. Tokenising makes "make body 15.5" a one-line edit and lets a lint ratchet *prevent* regression.

## What (mechanic)

- **`app/globals.css`**: added the 9-step scale to `@theme` (caption 11 · small 13 · meta 14 · body 15 · control 16 · lead 17 · title 20 · headline 21 · display 24). Tailwind v4 generates `text-<token>` utilities the same way the `--color-*` tokens generate `text-<colour>` — **build-confirmed** (`.text-body{font-size:var(--text-body)}` emitted). Line-height stays per-site (`leading-*`) per ADR v1.
- **414 `text-[Npx]` sites → `text-<token>`** across 109 `.ts`/`.tsx` files (scratchpad codemod, nearest-step snap map). 262 pure renames; the rest snap ≤2px to their nearest step, each staying **within its semantic role**:
  - Integer snaps (ADR): `10→caption`, `12→small`, `18/19→title`, `22/26→display`.
  - **Fractional snaps (new — post-ADR sprawl the ADR predates):** `10.5/11.5→caption`, `12.5/13.5→small`. 125 sites, 0.5px each, same role (mono-up labels / micro-meta = caption; supporting text = small). This is de-jittering, not redesign.
- **`lib/utils.ts` `cn`**: registered the scale in tailwind-merge's `font-size` group via `extendTailwindMerge`. **Required** — bare-word size tokens (`text-body`) otherwise collide with `text-<colour>` (`text-reach`) and twMerge silently drops the size wherever both meet in one `cn()` call (caught by the VerdictPill exact-string test). With the fix: size + colour coexist, two sizes dedupe (later wins), an arbitrary `text-[13px]` override still wins.

**Net rendered change = only the intended pixel snaps.** The `cn` fix *restores* the exact pre-codemod output (arbitrary `text-[Npx]` already coexisted with colours under twMerge), so nothing else moves.

## Test plan (TDD, red-first)

1. `tests/styles/type-scale-ratchet.test.ts` (new, +2): the 9 `--text-*` tokens exist in globals.css; **zero `text-[Npx]` left** in `components/` + `app/` (`.tsx?`). Red first (414 offenders + missing tokens) → green.
2. `tests/utils.test.ts` (+2): `cn` keeps a scale size beside a colour utility; dedupes two sizes / lets `text-[13px]` override. Guards the `extendTailwindMerge` fix against revert.
3. Updated stale assertions in `tests/components/ui/button.test.tsx` (sm → `text-meta`) and `tests/components/ui/verdict-pill.test.tsx` (md string → `text-caption`, sm → `text-caption`, lg → `text-small`, override → strips `text-small`).

## Evidence

- RED: ratchet failed 2/2 (offenders + missing tokens) before migration; VerdictPill exact-string test failed post-codemod, pre-`cn`-fix (surfaced the twMerge size/colour collision — a real regression the naive rename would have shipped).
- GREEN gate on `mv-106-type-scale-apply`:
  - `tsc --noEmit` — 0 errors.
  - `eslint` — 0 errors (pre-existing `docs/kanban/build.mjs` unused-var warning only).
  - **full suite — 274 files / 1751 tests passed, 0 failed.**
  - `next build` — compiled clean; scale utilities emitted into the built CSS.
- Verify: `git grep text-\[Npx\]` in components+app = 0 real usages (only the literal inside the globals.css explanatory comment, which the ratchet does not scan).

## Blind-call flags (for founder review)

- **Fractional de-jitter (125 sites, 0.5px):** the ADR never saw `11.5`/`12.5` (they arrived with the wizard/journey work). Snapped to nearest named step, same role. If any specific micro-label should stay larger, the anchor is a **one-line `@theme` edit** — e.g. `--text-caption: 11px → 11.5px` retunes all 116 caption sites at once (that is the payoff of tokenising). Flagged because 86 of these are the app's most common label size and dropping them 0.5px is a real, if sub-pixel, change on auth-gated screens.
- **Anchor values shipped verbatim from the ADR** (caption 11, not 11.5-by-frequency). Tunable in one line at review.
- The three integer snaps that shift 2px (`18→20`, `22→24`, `26→24`) are 8 sites total — the ADR's own accepted cost.

## Ship

**SHIPPED 2026-07-06 → PR [#62](https://github.com/Spooderinbed/merovisa/pull/62)** (branch `mv-106-type-scale-apply` off `origin/master 92a5c77`). In Review, founder-gated merge (never self-merged). Board disjoint from any other branch except `board.json` (append-at-end).

## Resume notes (cold start)

Wave A step 1 of the overhaul continuation is done. The scale is live and enforced by the ratchet — new `text-[Npx]` now fails CI. Remaining Wave A (ungated): A2 motion follow-ons (`--dur-*` tokens + lint-ban `transition-all`), A3 landing restyle (non-mascot), A4 auth restyle (non-mascot), A5 Phase-2 shell Card/VerdictPill/corridor-accent sweep. Gate G (founder): MV-85 mascot brief ✋, MV-86 imagery amendment ✋, dispose MV-48/49/50. Wave B waits on mascot SVGs. The codemod lives in the session scratchpad (one-time; the durable enforcement is the ratchet + the `cn` guard).
