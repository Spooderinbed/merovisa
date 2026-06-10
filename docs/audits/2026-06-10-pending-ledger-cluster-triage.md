# Pending-ledger cluster triage — ranked report

**Date:** 2026-06-10
**Governing memo:** `docs/audits/2026-06-10-data-governance-and-triage.md`
**Method:** ten parallel read-only agents (one per category A–J) classified every `pending` finding
against the triage vocabulary and grouped them into thematic clusters; the main loop validated and
applied centrally via `docs/research-briefs/_tools/apply-triage.js` (zero validation errors; a
field-level diff proved only `triage`/`triage_reason` changed on exactly 697 rows; all ledger guards
green). Conservative default: uncertainty routed to `needs-human-call`. Cluster names live in this
report; ledger rows carry only the per-finding triage + one-line reason.

## Topline

697 pending findings, 102 clusters:

| triage | count | meaning |
|---|---|---|
| `ready` | 280 | gov/primary-backed, maps to a shipped or adjacent surface, unblocked |
| `use-later` | 298 | real but not near-term (enumeration tails, contact rows, depth, dups of used) |
| `needs-human-call` | 104 | trust-sensitive non-gov claims, unresolved conflicts, recommend-rejects, gap markers |
| `stale` | 15 | expiring fact classes whose figures have likely moved — re-verify before any use |

## Headline 1 — the Genuine Student slice is confirmed, and it's bigger than category F

The F hypothesis ("Genuine Student credibility is the code-ready next slice") survives contact with
the evidence — and three categories converge on it independently. The slice core:

| Cluster | Cat | Size | Publishers |
|---|---|---|---|
| MD106 assessment factors & red flags | F | 17 | gov 17 |
| GS regime basics & questionnaire mechanics | F | 6 | gov 5 (+1 dup defers to gov) |
| Official GS prompt set (G32) | F | 4 | gov 4 |
| Post-study honesty & 485 reality | F | 8 | gov 6 (+2 human-check) |
| Genuine Student mechanics (DHA) | E | 8 | gov 8 |
| GS requirement & framework | C | 7 | gov 7 |
| English-evidence rules & online-test red flag | E | 2 | gov 2 |

≈ 50 findings, ~49 gov, all `ready` (two flagged rows `needs-human-call`). Content shape: what GS
*is* (4 questions, 150 words, English, in-form), what officers actually weigh (MD106: ties,
economics, course value, progression, scrutiny triggers), the myth-busters agents get wrong ("PR
intent is not disqualifying", "migration desire no longer disqualifying", "not a checklist"), and
the online-English-test red flag. The all-consultancy "GS answer coaching" layer (16 findings) stays
out — `needs-human-call`, human owns voice/compliance.

## Headline 2 — G is not human-only after all: a gov agent-risk core exists

The standing assumption was "G needs human sourcing first, not code." The triage found a
**23-finding gov spine** inside G that is code-ready now:

| Cluster | Cat | Size | Publishers |
|---|---|---|---|
| OMARA lawful-assistance rules & formal representation | G | 16 | gov 16 |
| 2026 onshore commission reform | G | 7 | gov 7 |
| Agent-vs-direct application routes | D | 3 | university 3 |
| Provider closure red-flags (TPS/ASQA) | D | 4 | gov 3, uni 1 |

A "working with agents" trust surface can ship from gov facts alone: agents are optional; only
OMARA-registered advisers may charge; how to verify a MARN; what an agent legally owes you (your
documents, progress updates, fee discussion); the dated 2026 onshore commission ban and the
hidden-commission warnings; which providers Deakin/JCU say need no agent (and Deakin's Nepal agent
mandate); gov-confirmed dead providers. The ~84 consultancy self-claims (97% success rates, "free"
counselling, fee schedules, the Aspire entity question) remain `needs-human-call` — they are the
*editorial* task, now precisely scoped.

## Recommended slice sequence

1. **Genuine Student credibility module** (~50 findings, gov-backed; the convergence above).
   Surfaces: a GS panel (journey/results) + plan/checklist enrichment.
2. **Working with agents — gov core** (~30 findings). The lane's PRIMARY weighting topic,
   shippable without waiting for the editorial task.
3. **Source-of-funds deepening** (~30 findings): DHA funds formula + current amounts (C, 8),
   sponsor income→evidence map from Lalitpur certification practice (A, 8), DHA evidence scope
   (I, 6), bank forex/remittance path (B, 4), DHA money rules (E, 4).
4. **Refusal & recovery panel extension** (~21 findings): ART logistics incl. the in-force
   2026-06-01 paper-only review change, rigid deadlines, the honest 19-month median (I, 10+3);
   health undertakings that counter auto-refusal myths (C, 8).

Second wave (slice-now ranked lower, mostly smaller or third-priority): C application mechanics &
lodgement tooling/MD115 (14), C health-exam sequencing (7), E program English requirements (21,
completes half-integrated seed records), E health-program registration traps (9), B university
payment channels & scam warning (6) + USyd tuition band (5) + refund tiers (2), A English thresholds
(3) + civil documents & remediation (11) + NOC attachments (12) + TU equivalence (4), D MD115
prioritisation (3) + Nepal entry benchmarks (2), H work rights & exploitation (7) + TFN/tax (2) +
transport patch (4), I checklist evidence scope (6).

## The human queue (104 `needs-human-call`)

By theme, largest first:
- **Consultancy/practitioner agent-risk claims (G, ~30 + I, 14 + F, 16):** success rates, "free"
  counselling, fee schedules (G.097–099 disagree AUD 950–5,000), refusal red-flag lists, GS answer
  coaching/templates. This is the agent-risk editorial/framing task — gov-corroborate or frame as
  self-claims.
- **Nepal job-ad salary snapshots (E, 17 + 3 stale):** single-ad non-gov figures; needs a
  salary-evidence policy (aggregate or official source) before any course→career surface.
- **Unsourced gap markers (D, 6 + B, 3 + I, 2 + H, ~5):** research TODOs masquerading as findings —
  TU cut-offs, MD115 tier list, UniMelb/ANU CRICOS, PCC fee, Nepal RHCA status, TOEFL/PTE Nepal fees.
  Commission or close.
- **Provider marketing stats (D, 4 + E, 2):** transition/offer rates ("96%", "guarantees entry") —
  need a framing policy.
- **Verification one-offs:** Nepal panel-clinic locator re-pull (C.086/087), Pokhara ABCC asterisk
  (C.124), Nepal TB-risk classification (C.108), Aspire entity identity (G.104–108), MoEST registry
  proper sourcing (G.001), F.040 PR-odds declaration paraphrase, F.099/F.104 LOR-length conflict.

## The stale queue (15)

Daily NRB forex rates (D.003/004 — need a live feed, not a ledger), monthly DHA processing medians
(A.032, C.078), FY-window stats superseded by BP0015 2026-04-30 (I.040/041), the ART fee 1-July
revision (I.047), dated job-ad salaries (E.158–160), promo-window airline perks (H.012), a 2025
annual-report stat (H.016), the 2024-07 two-year pilot likely lapsing 2026-07 (H.077), an undated
TOEFL fee (J1.015), a 2024-05 prep-fee estimate (G.050). These — plus the already-shipped volatile
facts (DHA charge/capacity figures, grant rates) — are the phase-3 refresh list, which also
backfills `volatility`/`reverifyBy` so the freshness guard takes over the reminders.

## Full cluster inventory

| Cat | Cluster | n | Value class | Recommendation |
|---|---|---|---|---|
| A | DHA minor & dependant rules | 4 | signed-in-depth | slice-later |
| A | DHA English evidence & thresholds | 3 | pre-signup-trust | slice-now |
| A | Visa lodgement logistics | 6 | signed-in-depth | slice-later |
| A | Nepal civil documents & remediation | 11 | signed-in-depth | slice-now |
| A | NOC requirements & attachments | 12 | signed-in-depth | slice-now |
| A | University document services | 9 | signed-in-depth | needs-human-sourcing |
| A | TU equivalence rules | 4 | signed-in-depth | slice-now |
| A | Legalization & apostille status | 3 | trust-defense | needs-human-sourcing |
| A | Police clearance leftovers | 3 | signed-in-depth | park |
| A | Sponsor income & funds certification | 8 | trust-defense | slice-now |
| A | Sponsor property evidence | 6 | trust-defense | slice-later |
| B | Nepal gov document services | 3 | signed-in-depth | slice-later |
| B | DHA personalised evidence workflow | 1 | trust-defense | slice-now |
| B | Bank forex remittance path & loan-fee nuance | 4 | trust-defense | slice-now |
| B | VFS Australia service scope | 2 | trust-defense | park |
| B | University payment channels & scam warnings | 6 | trust-defense | slice-now |
| B | Payment platform marketing detail | 7 | packaging | park |
| B | Unverified cost figures | 3 | signed-in-depth | needs-human-sourcing |
| B | Panel-clinic eMedical turnaround | 1 | signed-in-depth | slice-later |
| B | USyd tuition reality & offer timing | 5 | pre-signup-trust | slice-now |
| B | USyd withdrawal refund schedule | 2 | trust-defense | slice-now |
| B | OSHC mandate restatement | 1 | pre-signup-trust | needs-human-sourcing |
| C | Subclass 500 application mechanics & charge | 6 | pre-signup-trust | slice-now |
| C | Financial capacity & source-of-funds amounts | 8 | trust-defense | slice-now |
| C | Genuine Student requirement & framework | 7 | trust-defense | slice-now |
| C | Lodgement tooling & processing priorities | 8 | signed-in-depth | slice-now |
| C | Student visa work rights & family rules | 4 | pre-signup-trust | slice-later |
| C | Guardian, minor & visitor context | 8 | out-of-scope | park |
| C | Post-study & skilled pathway catalogue | 16 | pre-signup-trust | slice-later |
| C | Health exam sequencing & tracking | 7 | signed-in-depth | slice-now |
| C | Nepal panel clinics & locator verification | 5 | trust-defense | needs-human-sourcing |
| C | Health requirement outcomes & undertakings | 8 | trust-defense | slice-now |
| C | Medical test triggers & special cohorts | 13 | signed-in-depth | slice-later |
| C | Biometrics step (Nepal) | 6 | signed-in-depth | slice-later |
| D | MD115 provider prioritisation | 3 | trust-defense | slice-now |
| D | DHA visa entitlement rules | 6 | pre-signup-trust | slice-later |
| D | Application workflow & Nepal NOC steps | 3 | signed-in-depth | slice-later |
| D | Provider closure red-flags | 4 | trust-defense | slice-now |
| D | Agent-vs-direct application routes | 3 | trust-defense | slice-now |
| D | Nepal entry benchmarks | 2 | pre-signup-trust | slice-now |
| D | Per-provider required documents | 3 | signed-in-depth | slice-later |
| D | Pathway transition marketing claims | 4 | trust-defense | needs-human-sourcing |
| D | Pathway & VET program facts | 3 | signed-in-depth | slice-later |
| D | Provider seed-data completions | 3 | signed-in-depth | slice-later |
| D | Unsourced gap markers | 6 | pre-signup-trust | needs-human-sourcing |
| D | Non-ledger rows (forex rates, schema note) | 3 | out-of-scope | park |
| E | DHA money rules: visa charge & capacity | 4 | trust-defense | slice-now |
| E | Genuine Student mechanics (DHA) | 8 | trust-defense | slice-now |
| E | English-evidence rules & online-test red flag | 2 | trust-defense | slice-now |
| E | Post-study 485 & skilled-occupation rules | 8 | signed-in-depth | slice-later |
| E | Course demand/popularity marketing signals | 11 | pre-signup-trust | needs-human-sourcing |
| E | Program English & admission requirements | 21 | pre-signup-trust | slice-now |
| E | Health-program registration pathways & traps | 9 | trust-defense | slice-now |
| E | Nepal employer & institution anchors | 23 | signed-in-depth | slice-later |
| E | Nepal job-ad salary snapshots | 20 | signed-in-depth | needs-human-sourcing |
| E | Unverified VET/CRICOS coverage gaps | 2 | pre-signup-trust | needs-human-sourcing |
| F | GS regime basics & questionnaire mechanics | 6 | trust-defense | slice-now |
| F | Official GS prompt set (G32) | 4 | trust-defense | slice-now |
| F | MD106 assessment factors & red flags | 17 | trust-defense | slice-now |
| F | Post-study honesty & 485 reality | 8 | trust-defense | slice-now |
| F | Lodgement & document mechanics | 6 | signed-in-depth | slice-later |
| F | Practitioner GS answer coaching (Nepal layer) | 16 | trust-defense | needs-human-sourcing |
| F | University statement norms & GS screening | 7 | signed-in-depth | slice-later |
| F | Program-specific requirement details | 28 | signed-in-depth | slice-later |
| F | Referee integrity & contactability | 4 | trust-defense | slice-later |
| F | LOR format norms (practitioner) | 8 | signed-in-depth | slice-later |
| G | OMARA lawful-assistance rules & representation | 16 | trust-defense | slice-now |
| G | 2026 onshore commission reform | 7 | trust-defense | slice-now |
| G | Nepal MoEST consultancy registry | 1 | trust-defense | needs-human-sourcing |
| G | University approved-agent register listings | 7 | trust-defense | slice-later |
| G | Legitimate agent role & direct option | 4 | trust-defense | slice-later |
| G | Fee & free-counselling self-claims | 10 | trust-defense | needs-human-sourcing |
| G | Australia visa-help fee ranges | 3 | trust-defense | needs-human-sourcing |
| G | Credibility self-claims (success, scale, stale advice) | 14 | trust-defense | needs-human-sourcing |
| G | Consultancy service catalogues | 20 | packaging | park |
| G | Consultancy office address directory | 14 | packaging | slice-later |
| G | Aspire entity-identity question | 5 | trust-defense | needs-human-sourcing |
| G | Non-Nepal agent entities | 6 | out-of-scope | park |
| H | Flights & fare heuristics KTM-AU | 11 | signed-in-depth | park |
| H | Airline student perks | 5 | packaging | slice-later |
| H | Arrival prep & connectivity | 5 | signed-in-depth | slice-later |
| H | Banking & money access | 10 | signed-in-depth | slice-later |
| H | OSHC & health system access | 13 | signed-in-depth | needs-human-sourcing |
| H | TFN & tax residency | 2 | signed-in-depth | slice-now |
| H | Work rights & exploitation protections | 7 | trust-defense | slice-now |
| H | Part-time job market expectations | 5 | signed-in-depth | slice-later |
| H | Transport concession leftovers | 4 | signed-in-depth | slice-now |
| H | Campus onboarding & student ID | 4 | signed-in-depth | park |
| H | First-arrival housing risk & costs | 3 | trust-defense | needs-human-sourcing |
| I | GS process mechanics | 5 | signed-in-depth | slice-later |
| I | Subclass 500 clause & PIC enumeration | 9 | trust-defense | slice-later |
| I | Financial capacity thresholds (2024-05) | 4 | signed-in-depth | park |
| I | DHA checklist evidence scope | 6 | trust-defense | slice-now |
| I | Grant-rate dataset meta | 2 | packaging | park |
| I | Nepal volume & ranking stats FY2024-25 | 6 | pre-signup-trust | slice-later |
| I | Unsourced Nepal refusal-breakdown gaps | 2 | trust-defense | needs-human-sourcing |
| I | ART review logistics & 2026 changes | 10 | trust-defense | slice-now |
| I | Ministerial intervention depth | 3 | trust-defense | slice-now |
| I | Practitioner refusal red flags | 14 | trust-defense | needs-human-sourcing |
| I | Nepal NOC outbound rules | 1 | signed-in-depth | slice-later |
| J | TOEFL Nepal logistics & acceptance marketing | 3 | signed-in-depth | needs-human-sourcing |
| J | PTE test-centre exclusivity (Nepal) | 1 | signed-in-depth | needs-human-sourcing |

Notes captured during triage worth keeping: I.030 points at a fresher grant-rate dataset
(BP0015, 2026-04-30) — schedule a band refresh; I.051's paper-only ART review change is in force
since 2026-06-01 and materially affects shipped recovery copy; I.058 overturned its prior park
(gov myth-buster: an MI request is not permission to stay).
