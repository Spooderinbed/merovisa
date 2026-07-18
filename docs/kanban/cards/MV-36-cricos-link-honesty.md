# MV-36 — Honest CRICOS link (provider-code framing; subject deep-link is infeasible)

**Priority:** P2 · **Owner:** agent · **Gate:** typecheck/lint/suite green
**Created:** 2026-06-24 · **Branch:** `mv-36-cricos-honesty` · **Shipped:** 2026-06-26
**Related:** [[MV-07]] (shipped the `CRICOS <code>` link; deliberately chose the register homepage),
[[MV-24]] (harvested the provider directory). Evidence: product-review audit `wf_5fb5dfa7-009` + live probe
of `cricos.education.gov.au` (both 2026-06-24).

## Founder question (#1)

*"Why don't we redirect students to the actual CRICOS link of their intended subject?"*

## Verified answer — recorded so nobody re-investigates (probed live 2026-06-24)

Linking a student to their **subject's** CRICOS page is infeasible today, for **two independent reasons**:

1. **We hold only PROVIDER (institution) codes — never per-COURSE codes.** `au-cricos-codes.ts` (finding-traced),
   `au-cricos-directory.ts` (1,669-provider DHA directory), and `au-nepal-evidence-levels.ts` are **all keyed
   by institution CRICOS code** (Sydney = `00026A` = the whole University of Sydney). A course CRICOS code
   (a different number, e.g. the Master of IT's own code) was never sourced — we have nothing to deep-link a
   subject *with*. `cricos-lookup.ts` returns a provider resolution only.
2. **The register itself is not deep-linkable.** `cricos.education.gov.au` is a classic ASP.NET **WebForms**
   site — nav is `Course/CourseSearch.aspx` / `Institution/InstitutionSearch.aspx`, driven by form-POST +
   ViewState; the only API surface is `/api/js`. There is **no `?code=` GET URL** that opens a specific course
   or even a specific provider. The homepage is the only stable, shareable URL — which is exactly why
   [[MV-07]] hard-coded `CRICOS_REGISTER = "https://cricos.education.gov.au/"` and a pinned test
   (`tests/components/matches/program-card.test.tsx:124`) asserts that homepage href.

So "deep-link the subject" would require BOTH a large new data project (harvest per-course CRICOS codes, which
the DHA tool we already mined does not expose) AND a register that supports deep-links (it doesn't). Out of
MVP scope.

## Scope (agent-ownable — make the existing link HONEST instead of faking a deep-link)

- Relabel the program-card CRICOS line so it's clear this is the **provider / institution** code, not the
  course code a student needs for visa form 157A (audit P2: false-confidence risk — the code sits under a
  specific program name today).
- Make the link honest: keep the register link, but add a one-line helper (e.g. "search this code on the
  official register") so a student isn't dropped on a bare search box expecting their entry to load (audit P1).
- Update the pinned test (`program-card.test.tsx:124`) to match the new copy/behaviour.

## Out of scope

- Per-course CRICOS code harvest (large data project, infeasible source). Deep-link to a course/provider page
  (register doesn't support it). Anon-results MatchCard CRICOS parity (P3, own slice if wanted — Nepal-evidence
  already shows there via [[MV-25]]).

## Acceptance criteria

- [x] Card copy distinguishes provider/institution code from course code (no false confidence).
- [x] The register link is framed honestly ("search the register"), not as a direct deep-link.
- [x] Pinned CRICOS test updated; goldens byte-identical (presentational only).

## What shipped

- `components/matches/program-card.tsx`: the CRICOS line label changed from
  `CRICOS {code} ↗` to **`Provider CRICOS {code} · search the register ↗`** — naming it as the
  provider/institution code and the link as a register **search** (the register is WebForms with
  no deep-link). The `title` tooltip now spells out that `{code}` is the provider code, **not** the
  course code needed on **visa form 157A**, and that the register has no direct link so you search
  the code there. `cricos.source` (register homepage) and the lookup are unchanged — no data work.
- `tests/components/matches/program-card.test.tsx`: the pinned test now asserts the
  `Provider CRICOS 00026A`/`search the register` label, the homepage href, and the `course code`
  tooltip framing.

## Gate

- `npm run typecheck` — clean · `npm run lint` — 0 errors (pre-existing build.mjs warning only).
- Full suite — **1395 passed (235 files)** · goldens N/A/byte-identical (presentational; no scorer path).

## Resume notes (cold agent)

- Do NOT try to build a deep-link — the live probe above proves it's infeasible at the data layer AND the
  register layer. The slice is copy/labeling honesty only.
- Out-of-scope follow-up: anon-results MatchCard CRICOS parity (P3, own slice).
