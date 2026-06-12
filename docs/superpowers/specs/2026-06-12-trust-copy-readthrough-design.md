# Trust-copy read-through — design (trust-maintenance slice ④·3)

**Date:** 2026-06-12 · **Status:** approved by user 2026-06-12 · **Lane:** value-triage / trust-maintenance
**Deliverable:** `docs/audits/2026-06-12-trust-copy-readthrough.md` — a human read-through packet.
**Hard rule:** no code, data-module, component, test, or ledger changes in this slice. The packet is the only product.

## Goal

A confidence pass over every high-trust copy line a student will rely on, answering one question per line: **are we saying this accurately, calmly, and safely?** The trust-defense triptych (refusal/recovery → GS → agents), the odds wording, the eligibility framing, and the scam warnings have all shipped in the last week, largely authored by the same agent now auditing them — so the pass pairs a mechanical ledger-grounding check (main agent) with three *blind, fresh-eyes* lens reads (subagents), and ends in a packet a human can read in one sitting and turn into a clean fix batch (④·3b).

## Scope — six surfaces + their mirrors

| # | Surface | Rendered by | Copy source |
|---|---------|-------------|-------------|
| 1 | Refusal & recovery | `components/results/refusal-recovery.tsx` | `lib/data/source/nepal-refusal-recovery.ts` (13 rows: 3 grounds, 2 grant rates, 6 recovery, 2 scam) + component headings/intros |
| 2 | Odds / grant-rate wording | matches policy banner, `verdict-card.tsx`, `accuracy-meter.tsx` | `lib/data/policy/visa-outcomes.ts` band + component copy |
| 3 | Genuine Student | `components/results/genuine-student.tsx` | `lib/data/source/au-genuine-student.ts` (20 rows) + section intros |
| 4 | Working with agents | `components/results/working-with-agents.tsx` | `lib/data/source/au-working-with-agents.ts` (16 rows) + the disclaimer + 3 copy-locked trust lines |
| 5 | Eligibility / "what counts" | `factor-bars.tsx` + `lib/results/factor-copy.ts` seam, `cost-to-apply.tsx` | factor copy strings, DHA-capacity framing |
| 6 | Scam / trust warnings | the 2 scam rows (renders in surface 1), agents-panel register/commission lines (surface 4) | cross-cutting index over IDs, no duplicate rows |
| M | Mirrors | plan + checklist | `prepare-gs-answers` plan body, `gs-responses` checklist step, the fix-#4 financial-evidence claims ("Verifies per-band requirements…", "Core financial evidence…", "Addresses a documented refusal ground — financial capacity"), checklist step copy linked via `CHECKLIST_PLAN_LINKS` |

A **line** = what the user actually sees: data-row `label`/`summary` (with value/unit/period as formatted), plus component-added framing (section headings, intro sentences, disclaimers, trust-bearing link labels). Expected inventory ≈ 100–130 lines; the exact count is recorded in the packet.

**Out of scope:** wizard callouts, dashboard prompts, gated teasers, marketing pages, auth emails (listed in the packet's "not covered" section); any edit to `lib/`, `components/`, `tests/`, findings JSONLs, or triage fields. If the pass discovers a *finding* is wrong, that is a packet flag for the human — not an edit.

## Method — approach C (user-locked)

- **Main agent:** builds the full line inventory with stable IDs, checks ledger/source grounding (findings claim text is verbatim in `docs/research-briefs/findings/*.jsonl`), performs the spot-fetches, adjudicates lens flags, and **is the only writer** (packet, status, memory).
- **Lens 1 — anxious student** (clarity / fear level): persona — a 19-year-old in Kathmandu with family savings at stake, reading every line literally, English as a second language. Flags lines that scare beyond what the fact requires, lines that falsely soothe, unexplained jargon, and ambiguity a worried reader will misread. Calm ≠ soft: the VET 36.3% line *should* be sobering.
- **Lens 2 — advice-boundary** (legal-safety / overpromising): Australia restricts who may give immigration assistance (the agents panel itself documents the OMARA rules). MyVisa informs; it never advises. Flags imperative recommendations on visa/legal decisions, guarantees or promises, anything readable as personalised migration advice, overpromising ("prevents refusal"), and contested claims missing attribution.
- **Lens 3 — precision pedant** (paraphrase fidelity / dates / numbers): every number, date, cohort qualifier, period, currency, and modal verb checked against the quoted backing claim. Flags cohort/period drift, "may/must/most/all" fidelity, and unit precision.

**Blindness rule:** each lens agent receives the inventory (IDs + verbatim lines + backing source links), the ratified-decisions register, and read-only repo access (Explore-type subagent — no write tools). They do **not** see the main agent's grounding verdicts or each other's output. Agents are advisory: every accepted flag must survive adjudication by citing the backing finding or a fetched source quote; rejected flags are recorded with the rejection reason (the human can overrule).

## Stable line IDs

Dot-separated, lowercase, three segments: `<surface>.<group>.<row>`.

- Surface keys: `refusal`, `odds`, `gs`, `agents`, `eligibility`, `mirror`.
- Group = the rendered section (e.g. `refusal.grounds`, `refusal.odds`, `refusal.recovery`, `refusal.scam`; `gs.what`, `gs.questions`, `gs.weighing`, `gs.poststudy`, `gs.evidence`; `agents.need`, `agents.register`, `agents.owes`, `agents.form956`, `agents.commission`; `odds.banner`, `odds.verdict`, `odds.accuracy`; `eligibility.factors`, `eligibility.cost`; `mirror.plan`, `mirror.checklist`).
- Row = the data row's id stripped of its group prefix (`recovery-timeline` → `refusal.recovery.timeline`), or the dominant finding id lowercased (`agents.commission.g096`), or a short slug for component-added lines (`gs.what.intro`, `agents.need.disclaimer`).
- IDs are **stable**: ④·3b patches, future read-throughs, and fix discussions key on them. A line appears exactly once; cross-cutting themes (scam warnings) reference IDs rather than duplicating rows.

## Verdict taxonomy (user-locked, four buckets)

Each line gets **one overall verdict** — the worst across the three lenses plus grounding:

1. **must-fix now** — wrong, unsafe, or overpromising; would mislead a student relying on it.
2. **should-fix soon** — drift, tone, or precision issue; not actively harmful.
3. **acceptable but watch** — correct today but fragile: tied to a volatile fact or a known change window (cross-referenced to its `reverifyBy` where one exists).
4. **no issue.**

Every must-fix and should-fix entry **must** carry proposed replacement wording, ready to apply verbatim. Watch entries state exactly what to watch and when.

## Grounding + spot-fetch rule

Ledger-anchored by default: copy is compared against the backing findings' claim text (verified 2026-06-05 → 06-12; the stale class was cleared in ④·2). Live-fetch (≤10 pages, via the sandboxed fetch since immi/art pages resist WebFetch) only where:

- copy paraphrases beyond the finding's claim text, or
- the line is legal/deadline/date-bearing (the 1 June paper-only ART line, "no power to extend", the 31 March 2026 commission ban, the GS four questions), or
- the finding's verification predates a known change window.

## Ratified-decisions register (settled calls — lens agents must not re-litigate)

1. "a main ground", never "#1 refusal ground" (the sourced data ranks no frequencies).
2. The PR line: "wanting permanent residence later doesn't count against you as long as your study plan and stay are genuine under the visa rules" — "temporary" deliberately dropped (GS replaced GTE).
3. "limited exempt persons" softening (G.074).
4. Commission-ban wording is date-precise: "after 31 March 2026" (G.090).
5. G.096 is attributed, not asserted: "the government warned… could expose students to exploitation".
6. Banded verdicts, never percentages, for *personal* chances; corridor-level grant rates are shown as percentages by design (cohort facts, not personal odds).
7. Grant-rate fields are named by cohort (offshore/onshore), never min/max — the two can invert across quarters.
8. The ④·1 ART lines (paper-only since 1 June 2026; deadline non-extendable; ~19-month median) are freshly verified and copy-locked; tone flags remain fair game, the facts are settled.
9. The fix-#4 plan claims were deliberately de-overclaimed; flag regressions, not the fixes.
10. The agents-panel disclaimer deliberately covers both migration assistance and education-agent commissions.

## Packet anatomy

```
# Trust-copy read-through — 2026-06-12
How to read this packet (lenses, verdicts, IDs) · Method · Ratified-decisions register
Per surface (1–6 + mirrors):
  inventory table: ID | rendered line (verbatim) | backing | verdict
  flags detail: ID · current line · lens(es) failed · why · proposed replacement · severity
Fix batch:  must-fix table (ID → current → proposed)
            should-fix table (same shape)
            watch table (ID → what to watch → when/reverifyBy)
Lens-agent flags rejected in adjudication (ID · flag · rejection reason)
Not covered (explicit list)
Human read-through checklist (tick-box per surface)
```

## ④·3b hand-off

The fix-batch tables are the patch list. After the human read-through approves/edits them, the approved rows ship as one separately-gated copy commit (data-module summaries + any copy-lock test updates move together; FLIP_STATUS only if findingRefs change). Nothing in ④·3b is pre-authorized by this spec.

## Success criteria

1. Every line of the six surfaces + mirrors appears in the packet with an ID, backing refs, and a four-bucket verdict.
2. Every must-fix/should-fix carries ready replacement wording; every accepted flag cites its finding or a fetched source quote.
3. Lens agents ran blind and read-only; rejected flags are recorded with reasons.
4. Zero code/data/ledger changes: goldens byte-identical, suite count unchanged (931), typecheck + lint green.
5. The packet is readable in one sitting (≤ ~700 lines) and ends in the tick-box checklist + fix-batch tables that seed ④·3b.

## Gates

Docs-only slice: `npm test` (931, unchanged), `npm run typecheck`, `npm run lint` all green before commit; `git diff` confirms only `docs/` (+ local memory) touched; the pre-existing dirty WIP trio (`CLAUDE.md`, `tests/integration/wizard-to-results.test.tsx`, `docs/debugging/`) stays untouched. Commits: spec first, then packet + status. Report after merge; the slice then **waits for the human read-through** — ④·3b does not auto-start.
