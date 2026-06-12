# Source-of-funds deepening — sponsor income→evidence map + corroboration pass (slice ⑥)

**Date:** 2026-06-13 · **Status:** approach user-approved (A: generator-depth · new conditional plan action · formula trio included); **exact copy below awaits sign-off** · **Lane:** value-triage / trust-maintenance
**Origin:** Phase-2a ranked cluster #3 (`docs/audits/2026-06-10-pending-ledger-cluster-triage.md`). The cluster's
"~30 findings" resolve to ~22 shippable rows; the consultancy refusal red-flags (I.064+) stay in the human queue.

## Part 1 — the sponsor income→evidence map (the new user value)

**New module** `lib/data/source/nepal-income-certification.ts` (category A, prose-only, 9 rows: A.104–A.110,
A.112, A.114) — Lalitpur Metropolitan City's published income-certification requirements
(`https://lalitpurmun.gov.np/faq`, verified 2026-06-05), one row per income type → required documents.
A.111 stays `needs-human-call` (its admission-proof item is named "I-20" — US-flavored sourcing).

**Checklist** (`lib/checklist/generator.ts`): new conditional info row directly after `fin-sponsor` in the
`parents-family` and `mixed` branches — key `sponsor-income-cert`, `kind: null` + `infoKind: "step"`,
group financial, stage now, requirement `recommended`, source → the Lalitpur FAQ.
**`fin-sponsor` itself is vault-bound (`sponsor-income`) and stays unmapped** — the medical-row rule: vault
rows never get plan mirrors (two completion authorities). The info row is the mirror target instead
(the verify-MARN composition).

- Label: **"Sponsor income certification (ward office)"**
- Note (draft for sign-off): **"In Nepal, sponsor income is typically certified at the local ward office —
  Lalitpur Metropolitan City publishes the document list: rental income needs the tenancy agreement; business
  or agricultural income the business-registration certificate plus audit report; salary or pension the
  original letter from the employer; fixed-deposit or savings interest a bank certificate; foreign income a
  recommendation letter authenticated by the Nepali embassy there or that country's embassy in Nepal. For an
  English income statement, include citizenship and relationship certificates."**
  - Open wording question: "typically certified at the local ward office" generalizes from one
    municipality's FAQ. Alternatives at sign-off: name Lalitpur only, or keep the hedged "typically".

**Plan** (`lib/plan/generator.ts`): new kind `certify-sponsor-income`, emitted when
`finance.source ∈ {parents-family, mixed}`; appended **last** to `VISA_PREP_KINDS`; mirrored via
`CHECKLIST_PLAN_LINKS` (`"sponsor-income-cert": "certify-sponsor-income"`); no `liftEstimate`
(GS/NOC precedent); `timeEstimate: "1-2 days"`; `impact: "medium"`.

- Title: **"Certify your sponsor's income at the ward office"**
- Body (draft for sign-off): **"If a parent or family member funds your study, their income needs to be
  documented, not just stated. Ward offices certify each income type with specific papers — Lalitpur
  Metropolitan City's published list: rental income needs the tenancy agreement; business or agricultural
  income the business-registration certificate plus audit report; salary or pension the original letter from
  the employer; fixed-deposit or savings interest a bank certificate; foreign income a recommendation letter
  authenticated by the Nepali embassy in that country or that country's embassy in Nepal. For the English
  income statement, include citizenship and relationship certificates. Gather the set for your sponsor's
  income type before you go."**

## Part 2 — the corroboration ref pass (zero copy, provenance depth)

Additional `findingRefs` on existing records; numeric rows value-matched by reconcile, rule rows prose-only:

| Landing record | New refs | Nature |
|---|---|---|
| `au-student-visa-requirements` financial-coverage row | C.011, C.012, C.013, C.014 | DHA financial-capacity page restates the four-component formula (prose-only). C.011/013/014 re-triaged `use-later → ready` first (user-approved; same page/tier as C.012). |
| `AU_DHA_LIVING_CAPACITY_AUD` | C.015, E.003 | 29,710 (numeric match) |
| `AU_DHA_PARTNER_CAPACITY_AUD` | C.016 | 10,394 |
| `AU_DHA_CHILD_CAPACITY_AUD` | C.017 | 4,449 |
| `AU_DHA_SCHOOL_COSTS_AUD` | C.018 | 13,502 |
| `AU_DOCUMENT_CHECKLIST_TOOL` | I.021–I.024 | the DCT's own enumeration (prose-only) |
| `AU_SUBCLASS_500_APPLICATION_CHARGE_AUD` | E.001 **iff value-matches** | E.001 says "from AUD 2,000" — if it mismatches the config value it stays pending and becomes input to the 1 July re-verify instead. |

## Part 3 — the forex bridge (sign-off choice)

B.094/B.095 (Standard Chartered Nepal: outward telex for tuition; education USD prepaid card issued against
the MoEST No Objection Letter) — the NOC→bank-instrument link. Draft sentence appended to the plan
`prepare-fund-remittance` body: **"Banks also offer NOC-linked instruments — Standard Chartered Nepal, for
example, issues its education USD prepaid card against the Ministry's No Objection Letter and wires tuition
by outward telex transfer."**
- Open question: naming one commercial bank in product copy is a first (implicit-endorsement risk). Options:
  ship as drafted (attributed example) · drop B.094/095 from the slice (rows stay `ready`).

## Mechanics & gates

- Flips: the 9 map rows + the pass rows, `value_status: "prose-only"` set on prose rows **before** the flip;
  re-triage C.011/013/014 via apply-triage (reasons quoting the user call) before FLIP_STATUS; one FLIP_STATUS
  run promotes everything; build-ledger rerun.
- Tests: copy-locks on the note + plan body (+ remittance sentence if kept); `CHECKLIST_PLAN_LINKS` exact-map
  pin extended RED-first; conditional emission tests (parents-family/mixed emit, self-funded/loan don't);
  schema/reconcile/findings-integrity/flip guards.
- **No scoring change, no version bumps, goldens byte-identical** (capacity records gain refs, never values);
  no analytics change; WIP trio untouched; explicit git adds; normal gates.
- Auth-gated generator surfaces — copy-locks are the proof (④·3b/③c precedent).
