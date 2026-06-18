# MyVisa — Kanban board

> **Generated from [board.json](board.json) by `npm run board` — do not hand-edit.**
> Edit board.json (state) + [cards/](cards/) (detail), then regenerate. The visual
> dashboard is [board.html](board.html) (open in a browser). See [README.md](README.md)
> for how the board works.
>
> _Last updated: 2026-06-18 · stale threshold: 7d_


## Backlog — 5

- **MV-06** · P2 · Integrate ledger slice E/I — _~195 ready research findings that feed scoring/cost copy. Do after the engines are unified._
- **MV-07** · P2 · CRICOS scrape pipeline — _Generated-data pipeline → providers + evidence tables → a real per-provider Genuine-Student answer._
- **MV-08** · P2 · Outcome-validation loop (the moat) — _Capture applied / offer / refused / visa to validate verdicts. Design the model soon; build after traffic._
- **MV-09** · P3 · Replace hardcoded FX rates — _Static currency rates in budgetToAud → a real lookup._
- **MV-11** · P3 · AI guide — _Claude Haiku 4.5 + cached-corpus RAG over the TS fact layer. Deferred until the deterministic core is reliable._

## Ready (WIP 5) — 4

- **MV-05** · P1 · [Legal / disclaimer / data boundary](cards/MV-05-legal-disclaimer-boundary.md) — _Not-immigration-advice + consent + retention/deletion. Gate before public traffic; we store passports + advise minors._
- **MV-02** · P2 · [Surface swallowed errors](cards/MV-02-surface-swallowed-errors.md) — _ok:true returned on failed re-score/plan/profile mutations — a silent write failure is itself a trust bug._
- **MV-04** · P2 · [Data-freshness UX + stale-fact CI](cards/MV-04-data-freshness-ux.md) — _Stale scoring-critical facts must degrade visibly instead of showing a stale 'strong' verdict as current._
- **MV-03** · P3 · [Wire or relabel the dead work input](cards/MV-03-work-input-field.md) — _Collected but no scorer reads it. Default: honestly relabel optional._

## In progress (WIP 1) — 1

- **MV-01** · P1 · [Consolidate the two match engines](cards/MV-01-match-engine-consolidation.md) — _WIP: understand+design done (engines mapped, shared-core decision made). Plan on the card; implementation pending. The GPA fix + field/level filter don't reach anonymous users yet._

## In review (WIP 3) — 0

_empty_

## Blocked — 2

- **MV-A2** · [Apply Supabase advisor migration](cards/MV-A2-supabase-migration.md) — _Migration applied to prod; 3 advisor findings cleared (verified 2026-06-18). Only the leaked-password dashboard toggle remains — founder-only._
- **MV-10** · P2 · [Cost-estimate tab](cards/MV-10-cost-estimate-tab.md) `blocked: OSHC` — _Blocked on sourcing OSHC (overseas student health cover) data. Stays an honest 'coming soon' until then._

## Done — 2

- **MV-A1** · [Push feat/context-budget](cards/MV-A1-push-branch.md) — _Pushed to origin/feat/context-budget (upstream set). PR link ready; open via GitHub URL (gh not authed)._
- **MV-D0** · [Phase 0 + Phase 1 (9 slices)](../audits/2026-06-18-EXECUTION-CHECKPOINT.md) — _GPA normalize · conversion/auth · doc re-score removed · matches filter · dashboard cleanup · English test-type · results IA · scholarships · program notes. 1075 tests green._
