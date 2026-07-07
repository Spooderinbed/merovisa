# MV-101 — Overhaul Phase 2 / chrome + cleanup (the LAST non-mascot slice)

**Column:** In review · **Priority:** P2 · **Owner:** agent · **Created:** 2026-07-07
**Branch:** `mv-101-chrome-cleanup` — **stacked off #68** (`mv-100-guide-restyle`),
which carries #62 (MV-106 type) → #63 (MV-107 motion) → #64 (MV-108 landing) →
#65 (MV-109 auth) → #66 (MV-110 dashboard) → #67 (MV-99 profile) → #68 (MV-100 guide).
**8-deep stack**; rebase `--onto master` once that chain merges → clean chrome-only diff.
**PR base = `mv-100-guide-restyle`** so the PR diff is already chrome-only.
**Applies:** the elevated-calm overhaul spec `docs/design/2026-07-03-elevated-calm-overhaul-spec.md`
**MV-101 (Chrome + cleanup)** — the **non-mascot** portion, the LAST non-mascot Phase-2 slice.

## Scope — what MV-101 actually needed

Spec line 64: *"Wordmark/logo refresh; mobile-tab-bar active transitions; delete unused
`public/*.svg` scaffolding; optional branded `opengraph-image.tsx` (first outward brand
asset — NEUTRAL global character only)."* A 2026-07-07 ground-truth pass found:

- **Wordmark/logo** (`components/layout/logo.tsx`) — **already refreshed** to dusk-plum
  tokens + the type scale via the earlier MV-84 token swap (`bg-primary`/`text-on-primary`/
  `text-ink`, `text-title`). A *new logo mark* would be brand-asset work (Gate-G, founder-
  owned) — out of scope. The only safe non-brand delta = a calm hover affordance.
- **Mobile-tab-bar** (`components/layout/mobile-tab-bar.tsx`) — had `transition-colors
  ease-calm` but **no explicit duration token** (relied on Tailwind's implicit default) and
  **no visual active indicator** beyond colour+weight. Real delta = token timing + a calm
  active-accent bar.
- **`public/*.svg`** — the 5 create-next-app scaffold SVGs (`file`/`globe`/`next`/`vercel`/
  `window`), verified **zero references** anywhere in source (`git grep`) → safe delete.
- **`opengraph-image.tsx`** — optional **and outward-facing** (link-preview brand asset).
  The brand character is founder-owned (Gate-G) → **DEFERRED**, keeps the slice non-mascot.

## What changed (presentational only — no data/logic/nav touched)

- **`components/layout/mobile-tab-bar.tsx`** — each tab `<Link>` is now `relative` with
  `transition-colors duration-fast ease-calm` (token-timed colour/weight change), and gains
  an **always-present** `<span aria-hidden>` accent bar as its first child:
  `pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-primary transition-opacity
  duration-fast ease-calm` toggled `opacity-100` (active) / `opacity-0` (inactive). Always
  mounted + opacity-toggled (NOT conditionally rendered) so the 2px flat-plum bar **fades**
  as the active tab changes. Reduced-motion-safe (a transition, not an animation-delay
  stagger; the global guard zeroes transition-duration → it snaps, no flash). All existing
  structure (hrefs, labels, `aria-current`, `isActive`, the nav's `md:hidden`/`fixed`/
  `bottom-0`/safe-area classes) untouched.
- **`components/layout/logo.tsx`** — appended `transition-opacity duration-fast ease-calm
  hover:opacity-80` to the `<Link>` className only (a gentle opacity dip on hover signalling
  clickability). Still a server component; mark/wordmark/colours/sizes unchanged.
- **Deleted 5 unused scaffold SVGs:** `public/file.svg`, `public/globe.svg`, `public/next.svg`,
  `public/vercel.svg`, `public/window.svg`.

## Deferred (NOT built)

- **`opengraph-image.tsx`** (spec line 64, marked *optional*) — the first outward-facing
  brand asset (appears in link previews). The brand's visual character is founder-owned and
  Gate-G-blocked (MV-85 ✋ + MV-86 ✋); an OG image is a real brand decision, not a safe agent
  call. Deferred to the mascot/brand tail. Nothing else in MV-101 depends on it.

## Flagged (judgment call — founder is visual/copy-sensitive)

- **Logo `hover:opacity-80`** — the wordmark was already fully on-token, so the only non-brand
  "refresh" available was a hover affordance. It's a subtle, reversible one-class dip. If you'd
  rather keep the logo byte-identical (no hover), delete that one class string.
- **Tab-bar accent bar height/placement** — a 2px (`h-0.5`) plum bar pinned to the top edge of
  the active tab. Calm and flat by design; if you'd prefer it thinner/at the bottom edge it's a
  one-class tweak. Best eyeballed on the Vercel preview (mobile width, signed in).

## Tests (TDD — extended, not rewritten)

- `tests/components/layout/mobile-tab-bar.test.tsx` — **+3 tests**: active Link is
  `duration-fast`-timed; the always-present `aria-hidden` accent bar is `opacity-100` on the
  active tab / `opacity-0` on an inactive tab (and carries `bg-primary`/`h-0.5`/
  `transition-opacity`); calm-motion ratchets on the active markup
  (`not.toMatch(/transition-all/)`, `/animate-(bounce|ping|pulse)/`, `/duration-\d/`).
- `tests/components/layout/logo.test.tsx` — **+1 test**: the Link carries `transition-opacity`/
  `duration-fast`/`ease-calm`/`hover:opacity-80` with the raw-duration + transition-all guards,
  and the wordmark "MyVisa" + graduation-cap `<svg>` are preserved.

## Evidence — GREEN gate on `mv-101-chrome-cleanup`

- `tsc --noEmit` — 0 errors.
- `eslint` — 0 errors (pre-existing `docs/kanban/build.mjs` unused-var warning only).
- **full suite — 278 files / 1775 passed, 0 failed** (was 278/1771; +4 test guards).
- **Orchestrator re-verified independently:** the 5 scaffold SVGs are unreferenced (`git grep`);
  the affected layout tests + **all `tests/styles/` ratchets** run green (12 files / 41 passed);
  the in-shell `tests/app/app-layout.test.tsx` passes (it mocks `MobileTabBar`, so the new span
  can't affect it); the only `toMatchSnapshot`/golden tests live in `tests/scoring|data` and
  never render this chrome, so no golden captures the changed markup.
- Not browser-verified: this chrome lives inside the auth-gated app shell (needs a running
  server + signed-in session), so verified via the suite + ratchets, consistent with prior
  auth-gated slices. Best eyeballed on the Vercel preview (375px + desktop, light/dark,
  reduced-motion on/off).

## Ship

**SHIPPED 2026-07-07 → PR (stacked, base=#68), founder-gated merge (never self-merged).**

## Resume notes (cold start)

Chrome + cleanup done — **this was the LAST non-mascot Phase-2 slice.** Delivered: mobile-tab-bar
token-timed colour transition + a fading plum active-accent bar; a calm logo hover affordance;
deleted 5 unreferenced scaffold SVGs. **Deferred:** `opengraph-image.tsx` (outward brand asset,
Gate-G). **Stacked 8-deep** (#62→#63→#64→#65→#66→#67→#68→this); after the founder merges that
chain, rebase `--onto master`. **All that remains of the overhaul is the Gate-G mascot tail** —
founder-owned: MV-85 ✋ mascot brief + MV-86 ✋ imagery-policy amendment + hand-traced SVGs, which
unblock MV-96 (mascot foundation), the MV-95/94 mascot slots, the 2 deferred MV-100 mascot pieces
(head-mark avatar + 503 sheltering pose), and this deferred OG image. Also dispose MV-48/49/50.
**The real bottleneck is unchanged: the founder must merge the now-8-deep stack — nothing reaches
production until then; merging even #62+#63 lets me rebase the chain onto master and collapse it.**
