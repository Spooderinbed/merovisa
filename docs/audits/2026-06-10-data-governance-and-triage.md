# Data governance & ledger triage — review memo

**Date:** 2026-06-10
**Status:** agreed with user 2026-06-10 (sequencing + the status/triage ownership split confirmed verbatim)
**Companion docs:** `docs/audits/2026-06-10-visual-audit-and-fix-order.md` (the shipped UX fix order), `docs/research-briefs/_tools/` (the ledger machinery this memo governs)

## The critique

Eleven ledger slices (A–K) shipped by walking the research categories in finding order. The machinery
worked — 417 of 1,114 findings are live in product with provenance guards — but *selection* was
momentum-driven: the next slice was whatever came next in the file, not whatever the product most
needed. The 2026-06-10 value audit corrected course once (slice K, refusal & recovery, came from a
value-to-feasibility triage rather than file order) and surfaced what is still missing:

1. **The 697 pending findings carry no human triage state.** "Pending" conflates four different
   situations: ready to ship, park for later, needs a human judgment call, and probably stale.
2. **Freshness is recorded but unmanaged.** Sourced records carry `lastVerified`, yet nothing forces
   re-verification of facts that expire — visa fees, grant rates, DHA financial-capacity figures, the
   ART review fee, English rules, processing times. A `lastVerified` from six months ago looks
   identical to one from yesterday.
3. **Zero usage signal.** PostHog is in the stack docs but not in the code. We do not know which
   panels users read, which sources they click, or which plan items they act on.
4. **Trust-sensitive copy has never had a structured human read-through** (refusal grounds, odds,
   eligibility, scams, agent-risk language).

## What we keep

The slice machinery is good and unchanged: slice-kit rituals and TDD per slice; the FLIP_STATUS
derivation (`status` as a pure, self-healing function of code `findingRefs`); reconcile's three
passes (refs exist, refs are used, value-fidelity) and the conflict gate; `cluster_triage` shape
tags from build-ledger (`enumeration` / `contradiction` / `duplicate`). The gap was never the
machinery — it was selection and upkeep.

## Operating rules

1. **No more row-by-row slicing by default.** Product/data slices are chosen from ranked clusters
   (value-to-feasibility; trust-defense primary, pre-signup decision trust secondary, signed-in depth
   third). Non-slice outcomes — needs human sourcing, park, reject — are first-class triage results,
   not failures.

2. **Ownership split: `status` is machine-owned; `triage` is human-owned.**
   - `status` ∈ `used` | `pending` | `rejected:<reason>` — written by FLIP_STATUS from code refs.
     (`rejected:*` is the one human-set status; the machine never writes it, only respects it.)
   - `triage` ∈ `ready` | `use-later` | `needs-human-call` | `stale`, with a required one-line
     `triage_reason` — written by humans (or human-reviewed agents), never by automation.
   - `status` answers *has this been wired into the product?* `triage` answers *what should humans
     do with it next?*
   - `triage` is valid only while `status` is `pending`. Integrating a `ready` finding (code ref →
     FLIP_STATUS promotes it to `used`) or rejecting one requires clearing its triage in the same
     change — the finding schema fails the suite otherwise. That friction is the design: the human
     confirms the triage outcome; the machine never touches human fields.
   - `cluster_triage` is unchanged and orthogonal: it describes a cluster's *shape*
     (enumeration/contradiction/duplicate), not the human decision about it.

3. **Freshness is enforced, not decorative.** Sourced records whose facts expire carry
   `volatility` (`stable` | `annual` | `volatile`) on their provenance; non-stable volatility
   requires `reverifyBy` (ISO date). A suite-level guard fails when any `reverifyBy` date arrives —
   the suite going red *is* the re-verification reminder. Set `reverifyBy` to the date the fact may
   change (e.g. DHA fees on the 1 July financial-year boundary), not an arbitrary TTL. New slices
   classify volatility at integration time. Ledger-side staleness is expressed as `triage: "stale"`
   on pending findings — the sourced layer is the operational surface; findings are research inputs.
   Known gap: the legacy pre-ledger data (`lib/data/destination/`, `lib/data/universities/`,
   `lib/data/source/nepal.ts`) sits outside the registry walk; the refresh phase decides whether to
   register or retire it.

4. **Graduation rule.** A cluster ships only when (a) its value class justifies the work under the
   weighting above, (b) publisher provenance supports the claims — gov/primary for anything
   trust-sensitive, and (c) trust-sensitive copy passes human read-through before exposure.
   (This is why category G — agent/consultancy risk, ~65/107 non-gov self-claims — stays a
   human-sourcing task, not a code slice.)

5. **"Done" for the ledger ≠ 1,114/1,114 used.** Enumeration members, duplicates, conflict losers,
   and out-of-scope findings are *supposed* to end as `use-later` / `needs-human-call` / rejected,
   with reasons. The ledger is done when every pending finding carries a triage, not when every
   finding ships.

## Field reference

| Layer | Field | Values | Owner |
|---|---|---|---|
| findings JSONL | `status` | `used` / `pending` / `rejected:<reason>` | machine (FLIP_STATUS); `rejected:*` human |
| findings JSONL | `triage` | `ready` / `use-later` / `needs-human-call` / `stale` | human, pending-only |
| findings JSONL | `triage_reason` | one line, required with `triage` | human |
| findings JSONL | `cluster_triage` | `enumeration` / `contradiction` / `duplicate` | build-ledger (shape, not decision) |
| provenance (lib/data) | `volatility` | `stable` / `annual` / `volatile` | integrator, at slice time |
| provenance (lib/data) | `reverifyBy` | ISO date; required when volatility ≠ stable | integrator; guard goes red on the date |

## The plan

- **Phase 1 (this change):** this memo; `triage`/`triage_reason` in the finding schema;
  `volatility`/`reverifyBy` on both provenance schemas; the overdue guard.
- **Phase 2:** cluster-level triage of the 697 pending findings — parallel per-category agents,
  classifying conservatively (uncertainty routes to `needs-human-call`); output is a ranked cluster
  report plus JSONL triage fields only — claim text and sources stay byte-untouched; reconcile,
  conflict gate, and FLIP_STATUS stay green. Analytics instrumentation (PostHog) runs in parallel as
  app code — no ledger overlap. Event payloads carry ids/kinds, never profile values.
- **Phase 3:** volatile-fact refresh against current official sources (AI-drafted diffs,
  human-verified before merge), which also backfills `volatility`/`reverifyBy` so the guard starts
  protecting real facts; plus the human compliance read-through packet (refusal, odds, eligibility,
  scams, agent-risk language) assembled for a 1–2 hour human pass.
- **Then:** choose the next product/data lane from the ranked clusters and evidence. F (Genuine
  Student credibility, 104 pending / 0 used, gov-heavy) is the current hypothesis — it must win on
  evidence, not momentum.
