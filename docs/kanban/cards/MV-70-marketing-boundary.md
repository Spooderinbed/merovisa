# MV-70 — Resilience: error + loading boundaries for the (marketing) group

**Column:** In Review · **Priority:** P2 · **Owner:** agent · **Branch:** `mv-70-marketing-boundary` (off master)

## Why (student outcome)

The MV-68 ground-truth audit (finding #4) flagged the last route-resilience parity
gap: `(app)` (MV-62) and `(focused)` (MV-66) each have `error.tsx` + `loading.tsx`,
but the **`(marketing)` group has neither** — yet `page.tsx`, `auth/page.tsx`, and
`layout.tsx` all do live `supabase.auth.getUser()` reads. The marketing pages are the
**first-impression surface**: a thrown/slow auth read there used to show a blank frame
or bubble to the document-replacing `global-error.tsx`. Every dead-end on the landing
surface is a bounce before the student ever reaches the journey.

## Scope (Codex gpt-5.5/xhigh confirmed against the installed next@16 docs)

Codex verified the boundary semantics that shape the scope:

1. **`app/(marketing)/error.tsx` does NOT catch a same-segment `layout.tsx` throw** — a
   layout error is *outside* its own segment's error boundary and bubbles to the nearest
   ancestor (`app/global-error.tsx`). It DOES catch `page.tsx` / nested children.
2. **`app/(marketing)/loading.tsx` does NOT cover the same-segment layout's `await`** —
   the Suspense fallback wraps the page *below* the layout, not the layout's own probe.

So the boundary files only protect the **page-level** reads. The audited failure path —
the **layout's** `auth.getUser()` probe on the anonymous homepage — needs a separate fix.
Scope **(d) = both boundary files + a narrowly-scoped layout try/catch**:

- **`app/(marketing)/error.tsx`** (NEW, client) — calm branded retry inside the marketing
  chrome. Copy is honest for an anonymous visitor: **no "saved data is safe" claim** (they
  have nothing saved server-side), unlike the signed-in `(app)` boundary. Catches page reads.
- **`app/(marketing)/loading.tsx`** (NEW, server) — flat-paper skeleton shaped like a
  marketing page (wide hero block + content bands), `aria-busy`. Streams while a page resolves.
- **`app/(marketing)/layout.tsx`** — wrap the session probe in `try/catch`; on failure,
  **degrade to the signed-out `marketing` variant** (the page is unaffected) and
  `console.error` loudly so the failure stays observable, not masked. **Why only the layout:**
  `page.tsx` / `auth/page.tsx` follow their read with `redirect()`, which throws Next's
  redirect signal — a try/catch there would swallow the redirect. The layout has no redirect,
  so it is the one safe place to catch; the error boundary covers the page throws.

## Files

- NEW `app/(marketing)/error.tsx` (client error boundary)
- NEW `app/(marketing)/loading.tsx` (loading skeleton)
- `app/(marketing)/layout.tsx` — session-probe `try/catch` → signed-out degradation + loud log
- `tests/app/error-boundaries.test.tsx` — +2 (marketing error retry + honesty; loading aria-busy)
- NEW `tests/app/marketing-layout.test.tsx` — +3 (signed-in / signed-out / **degrade-on-failure**)

## Acceptance criteria

- [x] `(marketing)/error.tsx` renders a calm retry that calls `reset()`, and makes **no**
  "saved data" claim (anonymous-surface honesty) — `tests/app/error-boundaries.test.tsx`.
- [x] `(marketing)/loading.tsx` announces a busy state to assistive tech (`aria-busy`).
- [x] Layout degrades to the signed-out chrome (does NOT throw) when the session probe
  fails, still renders the page, and logs loudly — `tests/app/marketing-layout.test.tsx`.
- [x] Layout still renders signed-in / signed-out chrome correctly on success.
- [x] `error.tsx` is a valid client error boundary; `loading.tsx`/`layout.tsx` stay server
  components — validated by `npm run build` (route manifest clean).

## Test plan / gate — PASSED

`npm run typecheck` clean · `npm run lint` 0 errors (1 pre-existing `build.mjs` warning) ·
`npm run build` clean (route conventions validated) · full vitest **244 files / 1468 tests
pass** (+5 new, was 1463). Branch `mv-70-marketing-boundary` off master `25b9cd7`.

## Resume notes (cold-start)

Mirrors MV-62/MV-66 exactly for the boundary files. The non-obvious half is the **layout
try/catch** — that, not the boundary files, is what actually protects the audited failure
path, because a same-segment layout throw bubbles past the group `error.tsx` (Codex-verified
next@16 semantics). Do NOT extend the try/catch to `page.tsx`/`auth/page.tsx` — their
post-read `redirect()` would be swallowed. Board state lives on this branch until merge;
flip `MV-70 → done` in `board.json` + `npm run board` on master after the founder merges the PR.
