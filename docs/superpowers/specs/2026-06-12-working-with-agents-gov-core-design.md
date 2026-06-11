# Working with an agent — gov-core module — design spec

**Date:** 2026-06-12
**Status:** APPROVED by user 2026-06-12 with four copy tweaks (broader disclaimer scope; G.074 softened to "limited exempt persons"; G.090 made date-precise; G.096 re-sourced to "the government warned … could expose"). Slice ③ of the user-ratified sequence; evidence basis: `docs/audits/2026-06-10-pending-ledger-cluster-triage.md` (both G clusters marked `slice-now`).
**Findings:** 16 gov-backed, `ready`-triaged findings from category **G** — 12 OMARA / DHA lawful-assistance rules (G.074–G.089 ready subset) + 4 from the 2026 onshore-commission reform (G.090, G.092, G.094, G.096). The 7 `use-later` rows in these clusters (G.078, G.082, G.083, G.086, G.091, G.093, G.095) stay **pending**; the 66 consultancy + 18 university self-claims stay **pending** (human/editorial).

## Problem

"Working with an agent" is the single most agent-coached, lowest-trust surface for Nepali students.
Consultancies present themselves as mandatory, blur the line between admissions help and paid
*immigration assistance*, and — as of the 2026 reform — sit inside a changing commission regime that
students can't see. The product currently says **nothing** about it: there is no agents surface at
all. A student finishes our results page with no government-grounded answer to "do I even need an
agent, how do I check one is real, what do they legally owe me, and what's changed about how they get
paid?" This module closes that gap from government sources only — the same trust-defense posture as
the refusal and Genuine Student panels it sits beside.

## Decisions

1. **New sourced module** `lib/data/source/au-working-with-agents.ts` (+ `lib/data/schema/au-working-with-agents.schema.ts`,
   + one `DATA_MODULES` registry entry, category `G`). New interface `WorkingWithAgentsFact extends Provenanced`
   in `lib/data/types.ts`, mirroring `GenuineStudentFact`: `{ id, section, label, summary, source, lastVerified? }`,
   **prose-only** (no structured values — nothing here is a number the reconciler must match; the AUD 510
   in G.094 renders as narrative, not a typed config the verdict reads). `section` is a 5-value union:
   `"do-you-need-one" | "verify-register" | "what-they-owe" | "formal-representation" | "commission-ban"`.
   `lastVerified` = `"2026-06-05"` (every integrated finding's verification date). Fact-only: no scorer reads it.
   **No cross-category rewire** — unlike GS's I.008, all 16 findingRefs are fresh category-G rows flipping
   to `used` for the first time.
2. **Results panel** `components/results/working-with-agents.tsx`, rendered **directly after
   `GenuineStudent`** in `results.tsx` — completing the trust-defense triptych (RefusalRecovery → why
   applications fail; GenuineStudent → the test behind a main ground; WorkingWithAgents → who to trust
   for help). Same calm-authority shell as GenuineStudent (mono eyebrow, `bg-bg-tint` aside, per-row
   source links). Both modes (anonymous + owned), **not gated** — the product thesis is helping students
   *before engaging consultancies*, so this content must be visible pre-signup. **Collapsible sections:**
   five native `<details>`/`<summary>` blocks — section 1 ("Do you need an agent?") `open` by default,
   the rest collapsed — so the page footprint stays near the GS panel's despite 16 rows. Native
   `<details>` keeps all rows in the DOM (accessible + crawlable + test-queryable) and needs no client
   state, so the **panel stays a server component**; the per-row `SourceAnchor` client leaf provides the
   only interactivity. `<summary>` styled as the mono-uppercase section header with a CSS chevron marker.
3. **Source links** use the analytics `SourceAnchor` with a new surface `"working-with-agents"` added to
   the `SourceSurface` union (one-line catalog change + `expectTypeOf` pin update) — becomes the 7th
   surface member; the lane can then measure whether agents sources get opened.
4. **Surface-only — no plan enrichment.** Neither generator carries agent content today, so a touchpoint
   would mean a *new* plan item + checklist step from scratch (more scope than GS, which reused an
   existing plan item). The actionable **"verify your agent's MARN before paying"** step is the noted
   **fast-follow**, greenlit separately — not in this slice.
5. **No checklist step** (same reasoning as #4).
6. **Findings accounting:** the 16 gov findings flip pending→used (FLIP_STATUS) with their triage fields
   cleared in the same change (the Phase-1 schema rule enforces it; the `applyChange` triage-clear helper
   added in the GS slice handles the promotion). `value_status` set to `prose-only` on all 16 (SLICE-TEMPLATE
   step 3 — skipping it fails CI `USED_UNSET`). The 7 `use-later` rows stay pending with triage intact.
   Ledger moves used 466→482, pending 648→632.

## Rendered copy (the review surface)

Panel eyebrow: `Working with an agent (Australia)`
Closing disclaimer (copy-locked): `General context on migration assistance and education-agent commissions for Australia, not legal advice.`

Each row renders `summary` with `label` as its linked source text (GenuineStudent layout). Sections and rows:

### Section 1 — Do you need an agent? *(open by default)*
| Row id | Summary (rendered) | findingRefs | Link |
|---|---|---|---|
| `agent-optional` | You don't have to use a registered migration agent — you can apply for the visa yourself. | G.075 | OMARA |
| `who-can-assist` | Immigration assistance can only be given by registered migration agents, Australian legal practitioners, or limited "exempt persons". | G.074 | OMARA |
| `agent-complex-cases` | OMARA says a registered agent may be especially helpful if your case is complex. | G.076 | OMARA |
| `pay-use-registered` | If you pay for immigration help, the Department says use a registered migration agent listed with OMARA. | G.084 | DHA scams |

### Section 2 — Check the register first
| `verify-marn` | Confirm your agent on the OMARA public register — you can search it by their MARN. | G.077 | OMARA register |
| `agent-standards` | Registered agents must keep meeting OMARA's professional standards to stay on the register. | G.085 | OMARA |

### Section 3 — What your agent owes you
| `owes-documents` | Your agent must give you the documents the Department sends about your case. | G.088 | OMARA |
| `owes-updates` | Your agent must keep you updated on your visa application's progress. | G.089 | OMARA |
| `owes-fee-agreement` | OMARA lists agreeing the written service agreement and fees as a step in choosing an agent — settle it upfront. | G.087 | Choosing an agent |
| `exempt-no-charge` | "Exempt persons" must not charge a fee for immigration assistance. | G.079 | OMARA |

### Section 4 — Formal representation
| `form-956` | Form 956 is what formally appoints a registered agent, legal practitioner, or exempt person to act for you. | G.080 | Form 956 |
| `authorised-recipient` | Once you appoint an authorised recipient, the Department sends all written communication about your visa to them. | G.081 | Form 956 |

### Section 5 — The 2026 commission ban
| `commission-ban` | Education providers cannot pay agent commissions for student transfers between onshore providers after 31 March 2026. | G.090 | Study Australia |
| `hidden-commissions` | The ban's definition is written to catch hidden commissions too — including bonuses. | G.092 | Impact analysis |
| `avg-commission` | The government's analysis put the 2025 average onshore-transfer commission at about AUD 510. | G.094 | Impact analysis |
| `direct-pay-risk` | The government warned that direct payments to agents for transfers could expose students to exploitation. | G.096 | Impact analysis |

16 rows / 16 findings, 1:1 (no row carries more than one findingRef — these gov facts are atomic).
Coverage check: G.074, G.075, G.076, G.077, G.079, G.080, G.081, G.084, G.085, G.087, G.088, G.089 (12 OMARA/DHA) + G.090, G.092, G.094, G.096 (4 commission) = 16.

**Copy-locked rows (verbatim component-test pins — the trust-sensitive lines):** the disclaimer,
`who-can-assist` (G.074), `commission-ban` (G.090, date-precise), and `direct-pay-risk` (G.096, sourced warning).

**Source URLs (resolved, all verified 2026-06-05):**
- OMARA (`www.mara.gov.au`): `who-can-assist` /steps-to-register/overview · `agent-optional` + `agent-complex-cases` /get-help-with-a-visa/help-from-registered-agents/how-registered-agents-can-help · `exempt-no-charge` /get-help-with-a-visa/helpers-not-registered · `agent-standards` /get-help-with-a-visa/help-from-registered-agents/steps-to-choose/overview · `owes-fee-agreement` …/steps-to-choose/step-by-step · `owes-documents` + `owes-updates` …/after-you-choose-a-registered-agent/what-your-agent-must-do
- OMARA register (`portal.mara.gov.au`): `verify-marn` /search-the-register-of-migration-agents/
- DHA (`immi.homeaffairs.gov.au`): `form-956` + `authorised-recipient` /form-listing/forms/956.pdf · `pay-use-registered` /help-support/visa-scams/what-you-need-to-know
- Study Australia (`www.studyaustralia.gov.au`): `commission-ban` /en/Agent-Hub/agent-news-index/new-rules-on-agent-commissions-for-onshore-student-transfers
- Office of Impact Analysis (`oia.pmc.gov.au`): `hidden-commissions` + `avg-commission` + `direct-pay-risk` → Onshore transfer commission ban Impact Analysis Addendum 2026

## Out of scope

The verify-MARN checklist/plan action (noted fast-follow); the 7 `use-later` G findings (later/deeper
slice); the 66 consultancy + 18 university self-claims (needs-human-call / editorial queue — 97%-success
claims, "free" counselling, fee schedules, the Aspire entity question); the MoEST CIMS registry list
(G.001, needs-human-sourcing); freshness backfill of the dated commission findings (Phase 3 owns
volatility/reverifyBy); any scoring-engine change.

## Acceptance criteria (tests)

1. Registry walk green: schema validates (provenance required, URL/ISO formats, unique ids, 5-value
   section enum), every findingRef resolves to a `used` G row, reconcile passes;
   `golden-assessments.json` byte-identical (no scorer reads this module).
2. FLIP_STATUS flips exactly the 16 findings pending→used with triage fields cleared in the same change;
   `value_status` is `prose-only` on all 16 (findings-integrity suite green, no `USED_UNSET`); the 7
   `use-later` rows and all consultancy/university rows remain pending with triage intact.
3. Panel renders all five sections as `<details>` with section 1 `open` and the rest collapsed (all 16
   rows present in the DOM); every row's source goes through `SourceAnchor` with surface
   `"working-with-agents"`; the disclaimer, `who-can-assist`, `commission-ban`, and `direct-pay-risk`
   rows are copy-locked verbatim by the component test.
4. `SourceSurface` union gains `"working-with-agents"` (catalog `expectTypeOf` pin updated).
5. No generator/golden/scoring churn: plan + checklist generators untouched; no new checklist or plan tests.
6. Full gate: typecheck + lint + suite green; panel browser-verified on anonymous results, directly
   after the Genuine Student panel.
