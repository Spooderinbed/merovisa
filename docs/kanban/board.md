# MyVisa — Kanban board

> **Generated from [board.json](board.json) by `npm run board` — do not hand-edit.**
> Edit board.json (state) + [cards/](cards/) (detail), then regenerate. The visual
> dashboard is [board.html](board.html) (open in a browser). See [README.md](README.md)
> for how the board works.
>
> _Last updated: 2026-06-19 · stale threshold: 7d_


## Backlog — 2

- **MV-06** · P2 · Integrate ledger slice E/I — _~195 ready research findings that feed scoring/cost copy. Do after the engines are unified._
- **MV-11** · P3 · AI guide — _Claude Haiku 4.5 + cached-corpus RAG over the TS fact layer. Deferred until the deterministic core is reliable._

## Ready (WIP 5) — 0

_empty_

## In progress (WIP 1) — 0

_empty_

## In review (WIP 3) — 2

- **MV-08** · P2 · [Outcome-validation loop (the moat)](cards/MV-08-outcome-validation-loop.md) — _DESIGN DELIVERED + CODEX REVIEW FOLDED (no code shipped): build spec for the verdict-validation loop — funnel applied/offer/refused/visa linked to the frozen prediction (verdict + RULE_VERSION + scoreSnapshot). Codex (GPT-5) refute-each-decision pass found 3 blockers + 8 should-fixes, all folded into the doc. Schema is now 3 tables: program_predictions (immutable, prediction-run model, UPDATE-guard trigger) -> application_attempts (B1: institution/program/intake attribution layer) -> outcome_events (append-only; explicit gate + reason_code + verification metadata; self_reported excluded from training). Two-gate model (admission vs visa calibrate separately); verdict recomputed server-side (F16); calibration = CIs + Bayesian pooling on verified outcomes (not n>=30), compatibility-group windowing; cold-start ladder. Doc: docs/superpowers/specs/2026-06-19-outcome-validation-loop-design.md. Gate to build: founder approves 3-table migration + answers 4 open Qs._
- **MV-12** · P2 · [Fix CGPA entry in profile academic editor](cards/MV-12-cgpa-editor-normalize.md) — _DONE pending review (committed to master). The signed-in academic editor stored a raw CGPA (e.g. 3.5 / cgpa-4) as gradePercent, so the matches adapter read it as 3.5% and collapsed every program to 'reach' while the verdict path normalized to 87.5% — an internal contradiction. Fix (option a): normalize at the server-side save boundary via a Zod transform on AcademicPatch (new lib/profiles/normalize-academic.ts), so gradePercent is always a true percentage and gradeSystem is never persisted (mirrors profileSectionsFromAssessment; explicit gradeSystem=undefined clears stale values through the merge — self-heals pre-fix rows). F16-safe (no client imports the validation/grade-normalize). No scorer/golden change. Gate green: typecheck/lint/1140 tests (+12). Editor relabel 'Grade percent'→'Grade' deferred as founder-reviewed copy._

## Blocked — 3

- **MV-05** · P1 · [Legal / disclaimer / data boundary](cards/MV-05-legal-disclaimer-boundary.md) — _Engineering slice DONE + merged to master (46752f3; gate green): not-immigration-advice disclaimer on verdict/results/dashboard/matches/plan (VerdictDisclaimer), + working right-to-delete path (POST /api/account/delete removes storage+all owned rows+auth user, partial-failure→500 not ok:true) with a type-to-confirm UI on profile. BLOCKED on founder/lawyer for the rest: final legal wording, retention/ToS/privacy policy text, under-18 stance; consent-at-upload deferred until the privacy policy exists. Card can't reach Done until those land._
- **MV-A2** · [Apply Supabase advisor migration](cards/MV-A2-supabase-migration.md) — _Migration applied to prod; 3 advisor findings cleared (verified 2026-06-18). Only the leaked-password dashboard toggle remains — founder-only._
- **MV-10** · P2 · [Cost-estimate tab](cards/MV-10-cost-estimate-tab.md) `blocked: OSHC` — _Blocked on sourcing OSHC (overseas student health cover) data. Stays an honest 'coming soon' until then._

## Done — 8

- **MV-01** · P1 · [Consolidate the two match engines](cards/MV-01-match-engine-consolidation.md) — _DONE pending review: anon results now read the same DB catalogue + shared computeMatches as signed-in; GPA normalized at the boundary (root cause in from-assessment); program-level anon results; backcompat shape-guard. Gate green (typecheck/lint/test 1086 pass). Pushed to origin/feat/context-budget (8f06f00); PR not yet opened (gh unauthed — founder opens via compare link)._
- **MV-02** · P2 · [Surface swallowed errors](cards/MV-02-surface-swallowed-errors.md) — _DONE pending review (pushed origin 26216c8; PR not opened): a 13-agent audit found 4 real swallows (profile/section, documents DELETE, documents upload, assess signed-in insert) + 5 already-correct routes. All 4 now return a real error status + structured log on a failed write; document-card delete now guards on res.ok; leads catch now logs. Gate green: typecheck/lint/1106 tests (+8). TDD failing-path test per fix._
- **MV-04** · P2 · [Data-freshness UX + stale-fact CI](cards/MV-04-data-freshness-ux.md) — _DONE pending review (pushed origin 26216c8; PR not opened): scoring-critical facts (CONFIG_PROVENANCE) now have a runtime freshness check — past reverifyBy degrades the verdict card (amber warn, treat-as-indicative) instead of showing a stale verdict as current, plus a CI guard (tests/data/scoring-freshness.test.ts) that goes red when a verdict input ages out. Dormant today (armed until 2027-06-07). Gate green: typecheck/lint/1114 tests (+8). No scorer value changed; goldens byte-identical._
- **MV-03** · P3 · [Wire or relabel the dead work input](cards/MV-03-work-input-field.md) — _DONE pending review (pushed origin 26216c8; PR not opened): recon found work.title actually feeds the document checklist, but Relevance/Years imply a verdict effect no scorer reads. Chose context-only relabel — WorkGapEditor now states 'Optional. Your role helps tailor your document checklist — it doesn't change your verdict.' Copy-only, no scoring change, goldens byte-identical. Gate green: typecheck/lint/1115 tests (+1)._
- **MV-07** · P2 · [Surface CRICOS provider codes (trust signal)](cards/MV-07-cricos-trust-signal.md) — _DONE + pushed to origin/master. Scope pivoted at kickoff: the CRICOS 'scrape' was already done (70+ providers sourced in TS, gate-checked) and the GS panel already rich, but the sourced CRICOS data was dormant (no consumer). This slice surfaces it — program cards now show the provider's `CRICOS <code> ↗` linking to the official register, via a pure EXPLICIT id→code lookup (not name-derived: Adelaide=merged 04249J; Melbourne/ANU unsourced→null, render nothing). No scorer/DB; goldens untouched. Gate green: typecheck/lint/1128 tests (+7). DB tables + per-provider evidence levels deferred (speculative / sourcing-blocked)._
- **MV-09** · P3 · [Replace hardcoded FX rates](cards/MV-09-fx-single-source.md) — _DONE pending review (local commit, not pushed; awaiting founder GO): budgetToAud now derives budget→AUD from the canonical FX_RATES table via a shared toAud helper — divergent inline rates + the 'Replace with FX lookup later' TODO removed (one source of truth). NPR corrected ÷100→÷90 (MVP corridor; INR/BDT/PKR now exactly canonical; USD/AUD/NGN unchanged) — an intended match-path diff locked by tests; scoring golden byte-identical (match path, not engine). Codex adversarial pass: no defects. Gate green: typecheck/lint/1121 tests (+6). Two client-side 135 literals (callouts, budget-step) noted as deferred hygiene follow-up — already agree with canonical, not divergent._
- **MV-A1** · [Push feat/context-budget](cards/MV-A1-push-branch.md) — _Pushed to origin/feat/context-budget (upstream set). PR link ready; open via GitHub URL (gh not authed)._
- **MV-D0** · [Phase 0 + Phase 1 (9 slices)](../audits/2026-06-18-EXECUTION-CHECKPOINT.md) — _GPA normalize · conversion/auth · doc re-score removed · matches filter · dashboard cleanup · English test-type · results IA · scholarships · program notes. 1075 tests green._
