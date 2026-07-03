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

## Progress (2026-07-03, in-flight)

- Running in worktree `.claude/worktrees/mv-82-mobbin-rebrand-research`, branch `mv-82-mobbin-rebrand-research` off master `115f949`. Mobbin MCP verified live.
- Gate baseline recorded pre-change: typecheck clean, lint 1 pre-existing warning, suite 1 failed/1588 passed — the known 1-July freshness failure owned by MV-80 (in review, zero file overlap).
- Architecture: one research subagent per app (context economy — Mobbin returns inline images); each writes its section to `%LOCALAPPDATA%/Temp/claude/C--Users-thapa-OneDrive-Desktop-work-merovisa/98fd23f5-2f80-41fb-a498-bfe84c84f059/scratchpad/mv82-sections/NN-app.md` (01-phantom … 10-duolingo). Skeleton at `docs/design/2026-07-03-rebrand-research.md` with `<!-- PER-APP TABLES -->`, `<!-- SYNTHESIS -->`, `<!-- IMPLICATIONS -->` markers.
- Cold-resume: if sections exist, assemble them into the skeleton (replace markers), have a synthesis agent read all 10 files and draft 5 wizard patterns + 3 premium tells (each citing ≥2 apps) + MV-83/84/85 implications (validate the three seed palettes: Night indigo / Deep blue / Dusk plum), verify acceptance criteria, board → inreview, PR vs master.
- **2026-07-03 platform pivot (founder directive):** research must target **web**, not mobile — MyVisa ships as a website; mobile research parked for later. iOS pass (complete, incl. synthesis `11/12`) demoted to a quarantined appendix. Web re-sweep running into `scratchpad\mv82-sections-web\` (same 01–10 numbering; 02-linear carried over — already web). Web synthesis lands as `11-synthesis.md`/`12-implications.md` in the SAME web dir. Skeleton now has 6 markers (web tables/synthesis/implications + ios tables/synthesis/implications); `scratchpad\assemble-digest.mjs` fills all six. Memory: `web-first-design-research.md`.
