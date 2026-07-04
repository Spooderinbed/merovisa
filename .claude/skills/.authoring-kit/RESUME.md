# Skill-library build — RESUME (retiring-fellow library)

Status as of 2026-07-04: **Phase 1 (discovery) DONE. Phase 2 (authoring) BLOCKED on account session/usage
limit — all 15 authors died mid-verify, resets ~7:10am Australia/Sydney. Nothing was written to disk yet.**

This dir (`.claude/skills/.authoring-kit/`) is a temporary resume aid — **delete it at the end of Phase 3.**
It is not a skill (no SKILL.md, dot-prefixed, won't register in skill discovery).

## Artifacts here
- `skill-library-brief.md` — the full authoring brief: mission, audience (Sonnet-class agent sessions),
  founder doctrine, HARD authoring rules, format contract, sibling map + ownership boundaries, and all 15
  charters. **This is the source of truth for Phase 2.** The agents must Read it in full.
- `discovery-raw.json` — the 9-agent Phase-1 discovery dump (JSON; detail under `.result.<area>.key_facts`).
  Optional extra leads for authors; NEVER cited inside a skill.

## Founder answers already collected (folded into the brief)
1. Hardest live problem / campaign target = **data freshness / re-verification** (MV-80, PR #36).
2. Non-negotiables = **founder-gates everything outward** (never self-merge/push to master = production) +
   **trust-first copy bar** (no fabricated claims/dates/stats; verdicts are bands not %; honest states).
3. Audience = **Sonnet-class AI agent sessions, zero memory** (secondary: junior/mid humans).
4. "Advance SOTA" = all four: outcome-calibrated accuracy; self-maintaining sourced data;
   trust/provenance UX; consultancy-grade AI guide.

## The 15 skills to author (one agent each, parallel)
1 merovisa-change-control · 2 merovisa-debugging-playbook · 3 merovisa-failure-archaeology ·
4 merovisa-architecture-contract · 5 np-au-corridor-reference · 6 merovisa-sourced-data-and-freshness ·
7 merovisa-build-and-env · 8 merovisa-run-and-operate · 9 merovisa-testing-and-validation ·
10 merovisa-design-system · 11 merovisa-trust-and-copy · 12 merovisa-docs-and-writing ·
13 merovisa-freshness-campaign · 14 merovisa-research-methodology · 15 merovisa-research-frontier

## How to resume (after the limit resets)
- **Phase 2:** re-run the authoring workflow. The persisted script is at
  `C:\Users\thapa\.claude\projects\C--Users-thapa-OneDrive-Desktop-work-merovisa\01ecc8d1-99ab-4bfa-834d-e98f11c3f0fc\workflows\scripts\merovisa-skill-library-author-wf_72fe04ea-bb6.js`
  Invoke `Workflow({scriptPath: "<that path>"})`. It reads this brief by absolute path — if scratchpad was
  wiped, edit the script's `BRIEF` const to point at
  `.claude/skills/.authoring-kit/skill-library-brief.md` (and `DISCOVERY` at `.claude/skills/.authoring-kit/discovery-raw.json`).
  Nothing was cached (all 15 failed), so a plain re-run authors all 15 fresh.
  **Consider throttling** (author in 2 batches of ~7–8) to stay under the session limit — 15×~75k tokens was
  what tripped it on top of discovery.
- **Phase 3 (after ALL 15 SKILL.md exist):** 3 parallel reviewers over the complete set + 1 fixer.
  - FACTUAL: re-verify every flag/path/command/citation against the repo; flag invented/stale (severity =
    would it send an engineer down a wrong path?).
  - DOCTRINE: contradictions with CLAUDE.md or between skills; overstated claims; missing gating on anything
    that changes behavior; no skill routes around the founder merge gate.
  - USABILITY: description trigger quality; one-home-per-fact (dedupe, cross-ref); self-containedness; scannability.
  - FIXER applies blocking + important fixes.
- **Deliverable to founder:** skill inventory (one-line each), what was spot-checked, what remains uncertain.
- **Cleanup:** `rm -rf .claude/skills/.authoring-kit` once Phase 3 is reported.

## Guardrails (unchanged)
Authors write ONLY inside `.claude/skills/<name>/`. No mutating git. No `npm run board`, no harvest scripts,
no `WRITE_GOLDENS=1`/`FLIP_STATUS=1`. Ground-truth every claim (`file:line`); date-stamp volatile facts;
each skill ends with `## Provenance and maintenance`. Windows/PowerShell command forms.
