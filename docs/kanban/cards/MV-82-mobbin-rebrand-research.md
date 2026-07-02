# MV-82 — Overhaul Phase 0a: Mobbin rebrand research digest

**Lane:** Elevated-calm UI/UX overhaul (Phase 0 brand sprint) · **Spec:** `docs/design/2026-07-03-elevated-calm-overhaul-spec.md` · **Branch:** `design/brand-sprint`

## Why

First slice of the founder-approved whole-app overhaul. Every downstream decision (palette candidates MV-83, design-system v2 MV-84, mascot brief MV-85) is supposed to be evidence-driven from this digest, not vibes.

## Constraint that shapes execution

**Requires a fresh Claude session.** The Mobbin MCP was authenticated on 2026-07-02, but its tools only register in sessions started *after* auth. Verify with a Mobbin tool call before starting; if tools are absent, restart the session.

## Task

Sweep Mobbin for the reference set and produce `docs/design/2026-07-XX-rebrand-research.md`.

- **Apps:** Phantom (the pole — study its placeless ghost, restraint, dark-first palette), Linear, Headspace, Airbnb, Notion, Wise, Revolut, Cleo, Cash App, Duolingo (**flow mechanics ONLY** — quiz pacing, progress affordance; never style).
- **Flows:** onboarding quiz/wizard, sign-up/auth, results/score reveal, conversion prompts, empty states, error states, dark-mode handling.
- **Extract per app — fixed table, not prose:** primary hue + saturation strategy · neutral/paper strategy (warm vs cool, tint count) · accent count · radius scale · type scale estimate + weight usage · motion notes (what moves on step change, reveal choreography, durations) · mascot/illustration usage (where it appears, where it pointedly doesn't) · dark-mode derivation rule (invert vs re-pick).
- **Synthesis:** 5 named patterns for "calm but Gen-Z" wizards; the 3 tells that make fintech-calm feel premium.

## Acceptance criteria

- [ ] Digest doc exists with the per-app fixed table completed for ≥9 of the 10 apps (note any Mobbin coverage gaps honestly)
- [ ] Duolingo rows contain flow mechanics only (no visual-style extraction)
- [ ] Synthesis section present (5 wizard patterns + 3 premium tells), each pattern citing ≥2 source apps
- [ ] Doc ends with "Implications for MV-83/84/85" — explicit hand-off bullets
- [ ] No product code touched; doc-only slice on `design/brand-sprint`

## Test plan

Docs-only slice: gate = `npm run typecheck && npm run lint && npm test` stay green (untouched), board regenerated (`npm run board`), digest committed.

## Resume notes

- Filed 2026-07-03 from the plan-approval session (spec committed same day; PR carries spec + Phase 0 cards).
- Founder decisions already locked: Elevated-calm direction, global placeless brand, full palette rebrand, funnel-first, corridor theming post-onboarding (see spec Context §5).
- After this card: MV-83 (palettes, founder pick) + MV-84 (system spec, ADR) can run in parallel off the digest; batch their founder reviews.
