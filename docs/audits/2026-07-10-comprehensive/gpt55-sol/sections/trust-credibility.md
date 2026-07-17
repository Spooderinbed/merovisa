# Trust & Credibility Audit — LandingPad (MeroVisa)

**Auditor lens:** Trust & safety product lead. **Date:** 2026-07-10. **Scope:** the machinery that lets a student believe a life-changing verdict — citations, provenance, freshness, the verifiedCitation chokepoint, banded verdicts, refusal/consultancy panels — plus what is still missing for a decision this heavy.

The headline: LandingPad has built unusually strong trust machinery for an MVP. The freshness degrade (`scoringRulesStale`), the "never a percentage" discipline, refusal-recovery panel, and Estimated/Verified labels are real and tested. But the visible trust story currently contradicts implementation: the verdict calibration is undisclosed hand-tuning, privacy/data-processing copy is false in several places, no privacy/terms pages exist, and **no named human is visibly accountable for the product.** Those gaps override the good machinery until corrected.

---

## What is genuinely built (verify before crediting elsewhere)

| Mechanism | Location | Verdict |
|---|---|---|
| verifiedCitation honesty chokepoint (sourced prints "src · verified <mo>", sample returns `null`) | `lib/marketing/provenance.ts:46` | Real — but **marketing-only** (see F1) |
| Runtime freshness degrade on verdict card | `lib/data/scoring-freshness.ts:63`, `lib/results/assemble.ts:57`, `components/results/verdict-card.tsx:64` | Real, tested, elegant |
| Banded verdicts, score never rendered | `verdict-card.tsx:24-27` (weighted used only to pick copy) | Held rigorously |
| Refusal-risk/recovery panel, every row gov-linked | `components/results/refusal-recovery.tsx:48` | Real, ungated |
| Estimated/Verified confidence on match cards | `components/matches/program-card.tsx:40-43` | Real per-program |
| Not-immigration-advice disclaimer, names real decision-makers | `components/ui/verdict-disclaimer.tsx:13` | Strong copy |
| Correction invitation | `/trust` page §5 | Present but toothless (F5) |

These are not in dispute. The rest of this section is what's wrong or missing.

---

## Findings

### F0 — The live data-handling story is internally contradictory and materially inaccurate. **[P0]**
`/trust` says assessment inputs are used for verdicts/matches and “nothing more”; says uploaded documents replace declared values with verified ones; and says data is not shared with third parties (`app/(marketing)/trust/page.tsx:39-46`). `/how` correctly says files are not read and cannot change scores (`how/page.tsx:74-81`). The Guide sends derived assessment factors, matches, plan and cost context, chat history, and the message to DeepSeek (`app/api/guide/chat/route.ts:50-69`); configured PostHog analytics is also third-party processing. `/trust` then promises both immediate “real deletion” and 12-month assessment retention, while the delete route explicitly deletes assessments (`trust/page.tsx:71-77`; `app/api/account/delete/route.ts:65-74`). Finally, “hosted on Supabase in Australian and EU regions” is unproven and structurally suspicious for one Supabase project, and RLS does not justify the absolute claim that a database breach cannot expose another user. **Fix this copy before exposing Guide or sensitive uploads to real users.** Publish the actual processors, purposes, fields, regions, retention, deletion semantics, lawful/consent basis, and independent verification route.

### F1 — The verifiedCitation chokepoint guards the marketing pages, not the product. **[P2]**
The much-cited "honesty chokepoint" (`lib/marketing/provenance.ts`) enforces the sourced-vs-sample split **only on the landing/marketing demo components** (`freshness-table.tsx`, `plan-steps.tsx`, `guide-thread.tsx`). The actual results surface — where the life-changing verdict lives — cites through a **separate, weaker** primitive, `components/results/source-line.tsx`, which takes a raw `url` + `lastVerified` and prints them with no sourced/sample discipline and no guard that a figure claiming "verified" is actually sourced. So the strongest honesty invariant in the codebase does not run on the page that matters most. The two systems should converge, or the results side should get an equivalent typed guard.

### F2 — The verdict engine's core calibration is unsourced hand-tuning, and `/how` implies otherwise. **[P1]**
This is the deepest trust gap. The dimension **weights** (academic .30 / financial .25 / visa .25 / profileStrength .20), the **verdict cutoffs** (strong ≥72 & min-dim ≥50; possible ≥50 & min-dim ≥30), **FX_RATES** (NPR 135/USD), **FIELD_COMPETITIVENESS** (0.7–0.95), and **FUNDING_RELIABILITY** are all tagged `internal-heuristic` with empty `findingRefs` (`lib/data/policy/verdict-thresholds.ts`, `field-competitiveness.ts`, `fx-rates.ts`). Only the DHA financial floor and the English visa floor are actually government-sourced.

The `/how` page (`app/(marketing)/how/page.tsx:24-25`) leads with "Visa rules come directly from the Department of Home Affairs" and lists the AUD 29,710 figure — true for those two inputs — but **never discloses that the weighting and banding that convert inputs into the Strong/Possible/Reach word are invented, unvalidated numbers.** A student reasonably concludes the whole verdict is DHA-derived. It is not. For a trust-first product, presenting hand-tuned weights as though they were sourced policy is the single most corrosive gap. At minimum `/how` must say, in plain words, "the thresholds that turn your inputs into a band are our own calibration, not a government rule" — and ideally publish the weights and cutoffs (they are not gameable the way a per-user raw score is; see F8).

### F3 — No human is accountable. There is no face, no team, no named verifier. **[P1]**
Grep across `app/**` finds no `/about`, no team page, no named person, no "reviewed by a registered agent." The disclaimer names OMARA and DHA as the people who decide the student's case (`verdict-disclaimer.tsx:13`) — i.e. it names *everyone except LandingPad itself*. The sole thread of human contact is `support@merovisa.app` on `/trust`. A Nepali student is being asked to trust a life-and-savings decision to an anonymous website with a placeholder brand name and no visible humans behind the data. Consultancies win precisely because a named person sits across the desk. **"Who stands behind this?" currently has no answer on the site.** A trust-first platform needs an about/accountability surface: who verifies the data, what their qualifications are (even "we are not migration agents; here is who is"), and a real correction owner.

### F4 — No published privacy policy or terms exist, while the site makes specific data-handling promises. **[P1, compliance exposure]**
`/trust` makes specific deletion, retention, hosting, and security promises, but `app/(marketing)/` has **no `/privacy` and no `/terms` route**. The platform can collect academic/financial/immigration profile data and passports or bank statements; its age field permits minors but no guardian gate exists. This audit does not make a legal conclusion, but public promotion and sensitive-file collection without an accurate notice, terms, processor disclosure, consent/age handling, and verified region/retention facts is an avoidable compliance and trust exposure. Treat it as a launch gate.

### F5 — The correction policy is an invitation, not a mechanism; the "impact on existing verdicts" promise has no surface. **[P2]**
`/trust` §5 promises: "We will update the relevant data point, change the last-verified date, **and note any impact on existing verdicts.**" There is no public changelog, no data-corrections log, and no `where` for that note to appear (grep for changelog/corrections finds nothing). A student whose verdict was computed from a wrong figure has no way to learn it was corrected or whether their band would have changed. For a platform that will inevitably be wrong about a fee or a threshold, a **public, dated corrections log** is table-stakes credibility infrastructure and is entirely absent. The promise currently over-commits relative to the machinery.

### F6 — Independent-verification deep links are uneven; the most consequential number isn't linked at the verdict. **[P2]**
Deep-links-to-primary-source are excellent in some places (refusal panel: every row; match cards: Source/Provider site) but **absent where they matter most.** In `FactorBars` (`components/results/factor-bars.tsx:72`), a `SourceLine` renders **only when `f.source` exists**, and a grep of `lib/scoring/*.ts` shows source is attached to **exactly one factor type** — the English visa floor (`visa.ts:120,127`). The **financial-capacity gate** (AUD 29,710 + tuition — the single input that can force a Reach) surfaces **no source link on the results page** even though it is the most decision-heavy, government-sourced number in the engine, and its provenance exists in `CONFIG_PROVENANCE`. Academic and profile-strength factors link nothing. "Check it yourself next to every figure" is the right standard; the product meets it for programs and refusal context but not for the verdict's own drivers.

### F7 — Confidence signalling conflates two different things and the freshness guard is largely dormant. **[P2]**
`AccuracyMeter` reports confidence, but its value is profile completeness, not prediction or data confidence. Worse, its implementation starts at 25, adds only 3, and can therefore never reach its own 40/75 “Verified”/“Complete” thresholds (`lib/results/accuracy.ts:15-29`). Upload suggestions do not change the meter. Match cards have data-quality labels, but the headline verdict does not separate profile completeness, rule freshness, catalogue quality, and model calibration. The runtime freshness degrade is sound for registered `reverifyBy` facts; coverage remains opt-in and sparse, so most annual-drift facts can age without that signal.

### F8 — Scoring transparency is under-served even within the server-side constraint. **[P2]**
Keeping the engine server-side is correct — exposing per-user scoring rules invites gaming. But that constraint is being used to withhold **aggregate** transparency that is not gameable: the four weights, the band cutoffs, and the list of which inputs are sourced vs heuristic. Publishing "we weight academic 30%, financial 25%…" and "Strong requires ≥72 weighted with no dimension below 50" does not let anyone game their individual inputs, but it lets a skeptical student — or a journalist, or a competing consultancy trying to discredit the tool — verify the method is principled. The current `/how` gives qualitative prose only. The factor bars ("why this recommendation") are good and ungated, but they explain *which factors moved* without ever disclosing *how much each dimension counts.*

### F9 — Anonymous and signed-in verdicts can diverge for the same person. **[P2]**
Per domain-engine ground truth, the anonymous 9-step wizard does not collect `priorRefusals` or `dependents`, but the signed-in re-score does (`from-sections.ts`). A student can see "Possible" anonymously, sign in to save it, and watch it drop to "Reach" — with no explanation. Nothing worse for trust than a number that changes when you commit. Either the wizard must collect those two factors, or the divergence must be pre-disclosed ("your saved verdict may refine once you add refusal/dependent history").

### F10 — Freshness label wording can overstate. **[P3]**
`SourceLine` prints `verified {lastVerified}` where `lastVerified` is the *config* last-verified date, and `program-card.tsx` prints "Estimated · checked {date}" for `derived` rows. "Verified" on a `derived`/inferred datum (data_quality is largely `derived`, not `primary`, per data-layer) risks over-claiming; "Estimated" is the honest word and should propagate anywhere a derived figure is shown, including factor sources.

---

## The path to being the most trusted platform in the space

Ranked by trust-per-unit-effort, not by build size:

1. **Make live copy match actual behavior (F0)** — document storage, AI/analytics processors, retention/deletion, hosting, and RLS claims.
2. **Publish `/privacy` + `/terms` and collection/consent notices (F4).** This is the floor, not a nicety.
3. **Give the platform a face (F3).** Explain who built it, who verifies data, relevant qualifications/limitations, and who owns corrections.
4. **Disclose the heuristic core (F2).** Distinguish official rules from LandingPad calibration; publish enough method detail and version history for independent scrutiny.
5. **Ship a public corrections/change log (F5)** and notify affected saved journeys when a correction can change their result.
6. **Deep-link verdict drivers (F6)** and separate profile completeness, data quality, freshness, and calibration confidence (F7).
7. **Converge citation systems (F1)** and explain why an anonymous result may refine after immigration/dependant details are added (F9).

**Adversarial closing note to the founder:** the instinct to build honest machinery is right and it is already ahead of the field. But trust is not the *sum* of honest mechanisms — it is bounded by the *weakest visible* one. Today the weakest visible facts are: no privacy policy, no human behind the data, and a verdict whose core numbers are presented as sourced when they are hand-tuned. A student cannot see your elegant freshness-degrade predicate; they can see that no one has signed their name to the advice. Fix the face and the floor before adding a single new mechanism.
