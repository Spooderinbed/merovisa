# MV-108 — Overhaul Wave A / A3: landing (marketing) non-mascot restyle

**Column:** In review · **Priority:** P2 · **Owner:** agent · **Created:** 2026-07-07
**Branch:** `mv-108-landing-restyle` — **stacked** on the A1 + A2 token branches
(created off `mv-107` @ cea3f6e, then merged `origin/mv-106-type-scale-apply` so
the base carries BOTH the A1 `text-*` type tokens and the A2 `duration-*` /
`animate-*` motion tokens). PRs #62 (MV-106) + #63 (MV-107) were still open when
this was built, so it stacks; rebase `--onto master` once they merge and the
token diff drops away, leaving a landing-only review.
**Applies:** the elevated-calm overhaul spec `docs/design/2026-07-03-elevated-calm-overhaul-spec.md`
**MV-92 (Landing)** — the **non-mascot** portion. Wave A step 3, after A1 (MV-106
type scale) + A2 (MV-107 motion tokens).

## Scope — the non-mascot half of MV-92

MV-92's hero **mascot mark** (320–480 SVG) is BLOCKED on MV-85 (mascot brief ✋) +
MV-86 (imagery-policy ✋) + hand-traced SVGs — **left untouched** (the existing
neutral hero stands). A3 ships everything else MV-92 asks for:

1. **Flag emoji → bordered mono ISO pills** (absorbs the killed MV-49 flag-pill
   half; imagery policy bans flag iconography on marketing surfaces). New shared
   primitive `components/ui/iso-pill.tsx` (`IsoPill`, `aria-hidden`, mono caption
   recipe). Replaces the 🇦🇺 in `hero-preview.tsx` and the flag boxes in
   `destination-card.tsx` + `destination-detail.tsx`. Added an explicit
   `iso: string` to `MarketingDestination` (all 6 entries) — **uk → "GB"** (the
   ISO-3166 alpha-2 for the UK; the `id` stays `"uk"`), so the pill is
   ISO-correct, not a naive `id.toUpperCase()`. No home-country (🇳🇵) iconography
   anywhere on marketing (there was none to begin with).
2. **Two-beat hero entrance** — `animate-rise` on Eyebrow + `<h1>` (beat 1);
   `animate-settle` on the lede/source `<p>`s + CTA `<div>` (beat 2);
   `animate-fade` on the HeroPreview wrapper. **Reduced-motion-safe WITHOUT
   touching the shared guard**: the guard (globals.css 223–232) zeroes
   animation-*duration* but NOT animation-*delay*, so a raw per-item delay
   stagger would flash — `settle` bakes its hold into keyframe phases instead, so
   it collapses to the final state under `prefers-reduced-motion: reduce`.
3. **One reveal per below-fold section** — a single `animate-rise` on the tiles
   `<section>`, the how-it-works `<section>`, and the TrustCallout `<section>`.
   Deliberately mount-based CSS (NOT IntersectionObserver) to stay no-JS / SEO /
   reduced-motion safe — no hidden content for no-JS users.
4. **CTA micro-interaction** — the hero + 2 TrustCallout CTAs stay semantic
   `<Link>` (converting to the `<button>` Button primitive would be a link→button
   a11y regression; Button polymorphism belongs to MV-89). They gain the Button
   press recipe: `transition-[background-color,transform] duration-fast ease-calm
   active:translate-y-px`.

**Corridor-neutral brand:** already satisfied — the landing uses `--primary`
(plum = the global brand, neutral pre-onboarding); corridor accents activate only
post-onboarding (MV-91). The flag→ISO swap reinforces "no corridor iconography on
marketing."

## What changed

- **NEW** `components/ui/iso-pill.tsx` — `IsoPill { code, className }`.
- `lib/marketing/destinations.ts` — `+ iso` field on the interface + all 6 rows
  (AU/CA/GB/DE/US/IE); `flag` field retained (may have other consumers).
- `components/marketing/hero-preview.tsx` — 🇦🇺 → `<IsoPill code="AU" />`.
- `components/destinations/destination-card.tsx` + `destination-detail.tsx` —
  flag box → `<IsoPill code={…iso} />`.
- `components/marketing/eyebrow.tsx` — gained an **optional** `className` (merged
  via `cn`) so the hero Eyebrow can take `animate-rise`; other call sites
  unaffected (prop optional, they animate at section level).
- `app/(marketing)/page.tsx` — hero two-beat + tiles/how-it-works section reveals
  + hero CTA micro-interaction.
- `components/marketing/trust-callout.tsx` — section reveal + both CTA
  micro-interactions.

## Tests (TDD)

- **NEW** `tests/components/ui/iso-pill.test.tsx` — renders "AU", asserts
  `aria-hidden`.
- **NEW** `tests/styles/no-marketing-flag-emoji.test.ts` — ratchet: recursive
  `.tsx` walk of `components/marketing/` + `components/destinations/`,
  regional-indicator regex, `expect(offenders).toEqual([])`. Scoped to those two
  dirs only (dashboard/signed-in surfaces are out of this policy's scope).
- No existing tests needed changes — `destination-card`/`hero-preview` tests
  never asserted the flag emoji (they check name/tagline/verdict/tuition/date and
  the "Visa update" text, all unchanged).

## Evidence — GREEN gate on `mv-108-landing-restyle`

- `tsc --noEmit` — 0 errors.
- `eslint` — 0 errors (pre-existing `docs/kanban/build.mjs` unused-var warning only).
- **full suite — 277 files / 1758 tests passed, 0 failed.**
- **Live-render check** (running dev server): landing HTTP 200; `IsoPill` "AU"
  emits its exact recipe; **0 regional-indicator flag emoji** in the landing HTML
  (was 🇦🇺); `animate-rise`/`settle`/`fade` + `active:translate-y-px` all present.

## Ship

**SHIPPED 2026-07-07 → PR (stacked on #62 + #63), founder-gated merge (never self-merged).**

## Resume notes (cold start)

Wave A step 3 done (non-mascot MV-92). **Stacked on #62/#63** — after the founder
merges those to master, `git fetch` + `git rebase --onto master <new-master>
mv-108-landing-restyle` to shed the token diff → clean landing-only PR. The hero
**mascot mark stays deferred** (Gate G: MV-85 ✋ + MV-86 ✋ + hand-traced SVGs).
Remaining Wave A: **A4** auth non-mascot restyle (`components/auth/auth-card.tsx`,
same token vocabulary), **A5** Phase-2 shell Card/VerdictPill/corridor-accent
sweep. Then Wave B waits on the mascot SVGs.
