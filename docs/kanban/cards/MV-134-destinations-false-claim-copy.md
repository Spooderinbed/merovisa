# MV-134 — Destinations page markets corridors the product doesn't support (audit C-11)

**Priority:** P1 · **Owner:** agent · **Merge:** _founder-gated_ (live marketing copy)
**Source:** 2026-07-10 audit finding **C-11** + the §6-Today "stop the live false claims"
P0, confirmed uncarded 2026-07-17. Sibling of MV-122 (trust page) — SAME class of bug,
DIFFERENT surface. MV-122/slice 7 touches `trust/page.tsx` only.

## Why (student outcome)

`app/(marketing)/destinations/page.tsx` presents "six countries, done well" (and related
claims) while the product only actually supports Nepal→Australia. A Nepali student
researching, say, Canada is told the product handles it, invests trust, and hits a
dead-end — the exact consultancy-bounce the app exists to prevent, caused by our own copy.

This is a LIVE false claim in production, which is why it is a P0 and not backlog.

## The bug

- `app/(marketing)/destinations/page.tsx` — the "six countries, done well" framing markets
  unsupported corridors.
- Grep the same file + `destinations/[id]/page.tsx` for adjacent overclaims the audit
  flagged (e.g. a "485 = 2–4 years" duration, "all figures current"). Fix them together —
  the point is that the destinations surface stops asserting what isn't true.

## Fix direction

Make the copy match what is actually supported today: Nepal→Australia is real; other
corridors are roadmap, not shipped. Either present them honestly as "coming" / not-yet, or
remove the claim. Founder owns the exact wording (it is outward marketing).

## Acceptance criteria

- [x] The destinations surface no longer claims support for corridors the product cannot
      serve.
- [x] Any "coming soon" framing is honest, not a disguised overclaim.
- [x] Founder has approved the wording.
- [x] Grep for the same claim across marketing surfaces before closing (MV-122 exists
      because the same false claim lived in two places).

## Resume notes

- Paths verified 2026-07-17: `app/(marketing)/destinations/page.tsx`, `destinations/[id]/page.tsx`.
- Pair with MV-122 (trust page upload claim) — both are the "trust page describes the system
  we actually built" theme (VERIFIED-BUILD-ORDER slice 7).

---

## Scope correction (verified on `origin/master` @ `0e673b0`, 2026-08-07)

**The card prose above overstates the work.** The per-destination honesty treatment was
already built and shipped before this card was picked up — it must not be rebuilt:

- `components/destinations/destination-card.tsx:20` already renders a **"Not yet available"**
  pill whenever `supported` is false.
- `components/destinations/destination-detail.tsx:30,90,102` already render "Not yet
  available", "We don't assess Nepal → {name} yet", and a "See where you stand for
  Australia →" CTA.
- `lib/marketing/destinations.ts` already carries `supported: true` on Australia and
  `supported: false` on the other five.

So the residual live false claim was a **single line**: the index headline.

## The cross-surface sweep (acceptance criterion 4)

Run on `origin/master` @ `0e673b0` before and after the change.

| | |
|---|---|
| **Pattern** | `six countr\|all figures\|figures current\|done well` (case-insensitive) |
| **Surfaces** | `app/**`, `components/**`, `lib/**` — every `.ts` / `.tsx` |
| **Hits** | **exactly one** — `app/(marketing)/destinations/page.tsx:10` |

A second, wider sweep (`\b(six\|6)\b …(countr\|destination\|corridor)`, plus
`(countr\|destination\|corridor)…(we\|our)…(cover\|support\|assess\|handle)`, `all (six\|6)`,
`every (countr\|destination\|corridor)`) over `app/**`, `components/**`, `lib/**`, `content/**`
returned five further hits, **all of them already honest or unrelated**:
`destination-detail.tsx:95` and `results/destination-notice.tsx:19,37` correctly say Australia
is the only corridor covered; `lib/journey/signals.ts:18` and `matches/verdict-group.tsx:15`
are unrelated code comments.

**"All figures current" does not exist anywhere in the codebase.** The card's prose flagged it
from the audit; it is not a live string. Non-shipped hits deliberately left alone: `index.html`
(design-language prototype, not production per CLAUDE.md), `design-extract/**` (not imported by
`app`/`components`/`lib` — verified), and the audit/kanban docs that are evidence, not surfaces.

## What changed

`app/(marketing)/destinations/page.tsx` only.

- **Headline** → two block spans: `Six countries researched.` / `One corridor we assess
  end-to-end.` (founder-approved wording, chosen by AskUserQuestion.)
- **Lead** → gains the caveat `… — but today we only assess your standing for Nepal → Australia.`
- **`max-w-[700px]` → `max-w-[860px]`** on the `h1`. Not cosmetic drift: measured live, the
  second line is **834px** at the `clamp(…,52px)` max, so the old 700px cap wrapped it and
  rendered the two-line headline as three ragged lines. jsdom has no layout engine and could
  not have caught this — see the live-browser evidence below.

## Rot guard (`tests/app/destinations-index.test.tsx`)

"Six" and "one" are hardcoded counts that become this same false claim the day a seventh
destination lands or a second corridor flips `supported: true`. The guard reads the counts back
out of the **rendered** headline and compares them to `MARKETING_DESTINATIONS` — the test never
hardcodes 6 and 1 a second time.

Proven to bite by **mutating the data fixture**, not by reading the code:

| Mutation to `lib/marketing/destinations.ts` | Result |
|---|---|
| Added a 7th destination | ❌ `headline destination total: expected 6 to be 7` |
| Flipped Canada to `supported: true` | ❌ `headline supported-corridor count: expected 1 to be 2` |
| (reverted) | ✅ 5 passed |

A companion test feeds `statedCount` known strings (`"Seven countries researched"` → 7,
`"Countries researched"` → NaN, `undefined` → NaN) so the guard cannot pass vacuously — the
failure mode recorded in the repo's own "RLS negative probes are inert" note.

⚠️ **CRLF trap hit during this work.** The first attempt at the second mutation used `\n` in a
JS string replace; the working tree is CRLF, so it silently matched nothing and the suite went
**green against an unmutated fixture**. Caught by asserting the mutation landed on disk before
trusting the run. Split on `/\r?\n/` — the repo convention.

## Gate

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx eslint` | exit 0 |
| `npx vitest run` | **333 files / 2677 tests passed** |
| Live browser, desktop 1280 | both headline lines = 1 visual line each |
| Live browser, tablet 768 + dark | both lines = 1 each; bg `#141014`; no overflow |
| Live browser, mobile 375 | each sentence wraps to 2 lines (expected at 34px in a 335px column); **no horizontal overflow**; the two sentences still start on their own lines |

No worktree in this repo had usable `node_modules`; deps were installed to
`%LOCALAPPDATA%\Temp\mv134deps` and junctioned in, per the sibling-worktree recipe — never
`npm ci` into OneDrive.

## Deliberately NOT done

- **`destination-card.tsx` and `destination-detail.tsx` are untouched.** The honesty treatment
  there already shipped; rebuilding it was explicitly out of scope.
- **The 485 duration was NOT edited — and is NOT verified by this card.**
  `lib/marketing/destinations.ts` carries `postStudy: "Temporary Graduate visa (485): 2–4 yrs"`
  for Australia. The card prose flags it as a possible overclaim, but that is a **data-accuracy**
  question against the Home Affairs source, not a scope claim, and the AU records were
  re-verified under MV-80. **Left as-is: changing a sourced figure without re-reading the source
  would be the same trust failure in the other direction.** If it is wrong it needs its own
  card with a citation.
- **No `.gitattributes` was added** for the CRLF issue — the repo convention is to split on
  `/\r?\n/`, not to change checkout behaviour under a copy card.
