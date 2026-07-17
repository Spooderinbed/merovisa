# LandingPad — Unified Comprehensive Audit (Triangulated)

**Date:** 2026-07-10
**Method:** Two independent 13-section audits of the same 15-part founder brief — a Claude (Opus) 33-agent orchestrated audit and a GPT-5 "Sol" audit — reconciled here by a third code-adjudication pass. Every disagreement was resolved against the checked-out repository; those resolutions are binding and recorded in §5.
**Source audits (survive untouched):**
- Claude master: [`claude/REPORT.md`](claude/REPORT.md) + [`claude/sections/`](claude/sections/)
- Sol master: [`gpt55-sol/REPORT.md`](gpt55-sol/REPORT.md) + [`gpt55-sol/sections/`](gpt55-sol/sections/)

**Naming note.** The founder's brief titles the product **"LandingPad."** Production still ships three identities at once: footer "MyVisa", email `@merovisa.app`, repo `MeroVisa`. Treated here as LandingPad; the unsettled name is a launch blocker (F-4).

**Evidence boundary.** This report verifies checked-out code and the local kanban only. It does not claim access to production analytics, the production database, support logs, contracts, processor DPAs, legal advice, or student interviews. Claims needing those are labelled recommendations or founder gates, never facts.

---

## 1. How to read this report

Two audits ran blind to each other against the same brief and the same tree. Where they **independently converged**, the finding is beyond reasonable doubt — that is the highest-confidence signal a two-model audit can produce, and §3 collects those. Where only one audit found something, §4 credits it but only after it survived the code-check. Where they **disagreed**, §5 shows what the code actually says and which side won — including a corrections log of claims from *either* audit that failed verification.

The single most important structural difference between the two: **Claude audited the product as an architecture and a strategy; Sol additionally ran the product in a browser and read the matcher line-by-line.** That is why Sol carries a whole layer of *live decision-correctness* defects (C-1..C-12) and *database-integrity* defects (O-1..O-6) that Claude's report lacks. On the two canon items where Claude's early drafts were wrong (MV-08 "inert", the parity test), Claude's own adversarial pass had already self-corrected in §4 of its master — but several of Claude's *section* bodies still carried the stale "inert / no write path / 64 programs" claims, and those are struck below.

---

## 2. Executive summary — right product, right order?

**Right product: yes, with one honest reframe.** The assess → verdict → plan → checklist spine is genuinely differentiated: no consultancy, government site, Reddit thread, or ChatGPT gives a Nepali student an unconflicted, sourced, personalized Strong/Possible/Reach verdict *before anyone gets paid*. The provenance discipline (`findingRefs` → reconcile harness → CI, plus the `seed-migration-parity` test) is real engineering no competitor has. **But "replaces the consultancy" over-claims today.** The consultancy's monetized value is *doing* — paperwork, the Genuine Student statement, lodgement — and LandingPad owns roughly the first 10% of the journey and hard-stops at "track your visa in ImmiAccount." The honest promise today is a **companion**: *"know what's official, where you look ready, what's uncertain, and what to do next — before anyone profits from your decision."* Both audits reached this framing independently.

**Right order: no.** Both audits independently name the same inversion: the next spend on the board is a mascot/imagery cluster (MV-48/49/50/85/86/87) while the funnel has a hard wall (Google-only sign-in), production stores sensitive data with **no published privacy policy**, five sourced late-journey data modules render to **zero** surfaces, and the most on-brand missing feature — an honest off-ramp for "Reach" students — isn't carded at all.

**Single most damaging cluster.** Both audits flag F-1 (the anonymous wizard never asks about prior visa refusals, yet the scorer penalizes them -15/-35 — a silent post-sign-in band-drop aimed at exactly the cohort a trust-first product must never mislead). **Sol goes further and, per the adjudication, correctly:** F-1 is one instance of a broader *live decision-incorrectness* cluster that Claude's strategy sections wrongly called "sufficient." Browser- and code-verified: selecting **Law** returns a full list of Accounting/MBA programs labelled Strong/Possible (`lib/matches/compute.ts:38-49` — field is a soft sort, never a filter); an all-in tuition+living budget is compared only against `tuitionMin` and printed as "covers tuition" (`compute.ts:86`, `budget-step.tsx:84`); missing inputs default to `0` and manufacture confident "Reach" gaps (`compute.ts:73-86`); and "6 months bank seasoning expected (Nepal AL3)" ships as a rule in matcher, plan, and checklist **despite the repo's own research** that DHA publishes no such duration (`compute.ts:153-159`; `docs/research/2026-06-12-nepal-ssvf-financial-scrutiny.md`). These invalidate the product's core claim at the exact moment a student decides whether to trust it. **Adjudicated verdict: correctness is the top launch blocker, ahead of auth and email.** Claude's "corridor data is sufficient" framing is refuted by code.

**Launch readiness.** The corridor is broad enough for a *controlled beta*, not a public launch. Blockers: (a) the correctness/integrity cluster above, (b) legal disclosure + consent (no `/privacy`, no `/terms`, no guardian gate; auth is Google-only; no email-sending code exists anywhere), (c) the unsettled name, (d) the auth wall, (e) operational blindness (Sentry in docs, zero `@sentry/*` instrumentation). Not blocked by product breadth.

---

## 3. Convergent findings register — found independently by both audits

These are beyond reasonable doubt: both models found them separately and each survived the code-check. Severities are the adjudicated single value. Effort: S ≤ 1 day · M = 2–5 days · L = 1–3 weeks.

| # | Sev | Finding | Evidence | Effort |
|---|-----|---------|----------|--------|
| F-1 | **P0** | Anonymous wizard omits the prior-refusal question; scorer penalizes refusals → optimistic anonymous verdict, silent band-drop after sign-in (CANON #6, verified 8/8). | `components/wizard/wizard.tsx:23-33`; `lib/scoring/visa.ts` (-15/-35); `lib/scoring/from-sections.ts:60` | S |
| F-2 | **P0** | No `/privacy` or `/terms` in production while storing grades, funding, age, dependents + a vault holding passports/bank statements. No consent/guardian gate; age is a 15–80 free-text integer, not DOB (CANON #7). MV-05 engineering merged; blocked on four founder facts. | routes absent; `components/layout/footer.tsx:6-22`; MV-05 dossier | S |
| F-3 | **P1** | English scoring bug — `profile-strength.ts` compares raw PTE/TOEFL scores against IELTS bands (≥7.5/≥7.0), so any non-IELTS taker gets max bonus and the UI renders "Strong English (58.0)". `visa.ts` normalizes correctly; profile-strength doesn't (CANON #4, re-verified). | `lib/scoring/profile-strength.ts:15-17,48-52` | S |
| F-4 | P1 | Three product identities ship at once (footer "MyVisa", `@merovisa.app`, brief "LandingPad"). Blocks legal entity, domain, privacy policy, marketing. | footer, `/trust` contact | Founder + S |
| F-5 | P1 | Verdict core is unsourced hand-tuning (weights .30/.25/.25/.20, band cutoffs, FX, field competitiveness — all `internal-heuristic`, empty `findingRefs`) while `/how` implies the verdict is Home-Affairs-derived. Disclosure gap, not a calibration demand. | `lib/data/policy/*`, `lib/data/scoring-config.ts` | S |
| F-6 | **P0** | Google-only sign-in ("Email sign-in isn't ready yet"). Saving, converting, every `(app)` route, and the only anonymous-recovery path all require Google. Not on the board. | `components/auth/auth-card.tsx:38-63` | M |
| F-7 | P1 | 3-day expiry is a silent data-loss trap: **no email capability exists anywhere** (grep resend/sendgrid/nodemailer/postmark = 0), so the core conversion lever fires with no reminder, no deliver-a-copy, no recovery. Values tension: an anti-dark-pattern product deleting a student's assessment to manufacture urgency. | `conversion-paths.tsx:51,57`; `lib/assessments/expiry.ts` | M + policy |
| F-8 | P1 | No re-engagement loop at all; dashboard is a static mirror of user-entered state. Channel caveat: this cohort lives on Viber/WhatsApp/Messenger — email may not close it alone. | repo-wide | M + S (share) |
| F-9 | P1 | No human fallback on any dead-end (unsupported destination, guide 503, no-Google, expired assessment) except a buried `/trust` mailto; no `/about`, no named accountable human. | `guide/page.tsx`, `destination-notice.tsx` | S |
| F-10 | P1 | Journey hard-stops at "track-visa-decision": application = one generic step, waiting = one line (no processing-time/RFI coaching), all 9 post-grant stages Absent. | `lib/plan/generator.ts:322-329,388-396` | L |
| F-11 | P1 | Five sourced data modules render to **zero** surfaces: `au-arrival-cash-guidance`, `nepal-forex-cards`, `au-student-worker-wages`, `au-student-transport-concessions`, `au-skilled-visa-directory`. Maintenance paid, zero student value — cheapest journey-depth win. | 0 imports outside lib/data + tests | S–M |
| F-12 | P1 | No Genuine Student / GS-GTE preparation workspace — the #1 refusal artifact and the consultancy's crown-jewel fee gets one paragraph; the guide is correctly hard-ruled against ghostwriting. A guided *workspace* (evidence mapper, structure prompts, consistency checks, self-review rubric) is the replacement core and keeps the ethics line. | `lib/plan/generator.ts` (prepare-gs-answers); `lib/guide/system-prompt.ts` | L |
| F-13 | P1 | No off-ramp for "Reach" students — bare band, no improve-path (IELTS retake, pathway/diploma providers, regional universities, defer intake), then a 3-day delete. The crown-jewel differentiator becomes a trust failure for the highest-need cohort. | `verdict-labels.ts` | M |
| F-14 | P2 | Application tracking is a 3-value dropdown (`shortlisted\|applied\|withdrawn`) — no deadlines, offer/CoE states, per-app documents, or calendar. | `user_program_state` | M–L |
| F-15 | P1 | No production error monitoring — Sentry in docs/.env.example but zero `@sentry/*` dependency, no `instrumentation.ts`. Production errors invisible. | package.json | S |
| F-16 | P2 | `POST /api/assess` re-reads the full catalogue 2–3× per request with `select(*)`, two admin clients per request; `sign-claim` is an unauthenticated, unrate-limited HMAC oracle; rate limiting fails open and covers ~4 routes; no CSP despite rendering LLM + user text. | technical-audit section | S–M each |
| F-18 | P1 | Freshness guard watches <5% of dated facts (23/~498 carry `reverifyBy`; guards fire only on it). All annual-drift modules — tuition, OSHC, provider fees, scholarships, banks — carry zero. The 15 guarded facts all re-verify on one day (2027-07-01) behind a one-person manual model. | `tests/data/freshness*`; lib/data | S–M |
| F-19 | P1 | Expired scholarship deadline shipping as current: Australia Awards `applicationCloses: 2026-04-30` (71 days past), `lastVerified 2026-06-07`, no `reverifyBy`, no embedded-date-passed guard. Both audits spot-checked this. | `lib/data/source/australia-awards-scholarship.ts:23` | S |
| F-20 | P1 | `FX_RATES` gate the DHA financial verdict but are invisible to every guard — hand-typed, `internal-heuristic`, empty `findingRefs`, no `reverifyBy`/volatility. The number that can force a Reach has no source and no watchdog. | `lib/data/policy/fx-rates.ts:14-17` | S |
| F-21 | P2 | Fabricated placeholder policy tables for 5 unsupported destinations (invented English floors/cost bands, empty `findingRefs`) — inert only because `SUPPORTED_DESTINATIONS` gates them; one line flips them live and breaks the "every figure sourced" promise. | `english-thresholds.ts` etc. | S |
| F-22 | P1 | "Expansion without code changes" is false today: `from-sections.ts` pins nepal/australia/percentage-nepal; `financial.ts:71` runs the capacity gate only for Australia; flat `nepal-*`/`au-*` namespace; no i18n (~140 hardcoded-English tsx). Corridor #2 is an engine refactor. Recommended: India→Australia (reuses the AU side, forces de-hardcoding). Correct CLAUDE.md's claim. | scalability section | L |
| F-23 | P1 | Mascot/imagery cluster is the wrong next spend — 3 P1 cards fund decoration for an intentionally imageless body, none with dossiers, all gated on the un-made brand pick. Park until the name lands and the P0s clear. | board.json | S (re-column) |
| F-24 | P2 | No distribution plan — creators/FB groups own top-of-funnel; the incumbent is a walk-in high-street shop. Zero acquisition instrumentation (`assessment_claimed` event missing). | — | non-code + S |

Both audits also independently affirm the same **strengths not to break**: provenance machinery (`findingRefs`/reconcile/parity in CI), honest verdict discipline (banded, score never rendered, `scoringRulesStale` runtime degrade, guide refuses to ghostwrite), RLS forced on every table, and the A11y/UX primitives (~297 test files / 1,911 passing tests).

---

## 4. Single-audit findings that survived the code-check

Credited to the audit that found them. All were verified against the repository during adjudication.

### Sol-unique — live decision-correctness cluster (browser/code-verified)

This is the layer Claude's report entirely lacks, and per the adjudication it outranks several of Claude's P1s for a trust-first product.

| # | Sev | Finding | Evidence |
|---|-----|---------|----------|
| C-1 | **P0** | The privacy story is materially false live: `/trust` says data is used for verdicts/matches and "nothing more" and "no third parties", but Guide sends derived assessment/match/plan/cost/chat context to DeepSeek and PostHog is a configured processor. | `trust/page.tsx:39-46`; `guide/chat/route.ts:50-69`; `lib/analytics/*` |
| C-2 | **P0** | Deletion/retention promises contradict code: `/trust` says "real deletion" **and** 12-month retention; the delete route deletes assessment rows before the auth identity. | `trust/page.tsx:71-77`; `account/delete/route.ts:65-74` |
| C-3 | **P0** | Budget answers the wrong question — wizard collects tuition **plus** living, `computeMatches` compares the whole amount only to tuition, prints "budget covers tuition." | `budget-step.tsx:80-84`; `compute.ts:73-86,139-149` |
| C-4 | **P0** | Incomplete profiles become fabricated zeroes — a name-only profile passes the empty-object gate; missing grade/English/budget default to `0`, producing confident Reach gaps instead of "unknown." | `matches/page.tsx:43-57`; `compute.ts:73-76` |
| C-5 | **P0** | Unsupported "6 months bank seasoning expected (Nepal AL3)" ships as a rule in matcher/plan/checklist despite the repo's own research that DHA publishes no fixed duration. | `compute.ts:153-157`; `plan/generator.ts:196-203`; `checklist/generator.ts:244`; `docs/research/2026-06-12-nepal-ssvf-financial-scrutiny.md:12-19` |
| C-6 | P1 | The "profile accuracy" meter can never reach its Verified(40)/Complete(75) states — starts at 25, adds only 3 (max 28), always "Basic". | `lib/results/accuracy.ts:15-29` |
| C-7 | P1 | PTE/TOEFL profile entry is internally inconsistent — overall uses test-specific maxima but sub-scores stay capped at IELTS 9 / 0.5 steps. | `english-editor.tsx:24-29,69-85` |
| C-8 | P1 | Document replacement is destructive before validation — object+row removed, **then** bytes read and magic-byte checked (can 422 after deletion) → a bad replacement erases a good passport/transcript. | `documents/upload/route.ts:65-91` |
| C-9 | P1 | OAuth claim failures are swallowed — callback redirects to `/assess?error=…` but `/assess` reads only `new`; a high-intent user gets no recovery. | `auth/callback/route.ts:36-60`; `assess/page.tsx:6-14` |
| C-10 | **P0** | Wizard offers fields the catalogue can't match, then labels unrelated programs as matches — browser-verified: Law → "60 matched," led by Accounting/MBA marked Strong/Possible. Field is a sort tier only. | `field-step.tsx`; `compute.ts:29-48`; browser-verified 2026-07-10 |
| C-11 | P1 | Unsupported destinations marketed as "Six countries, done well" — Canada/UK/Germany/USA/Ireland publish changing cost/policy snippets but cannot produce an assessment; expands freshness liability. | `destinations/page.tsx:9-14`; `SUPPORTED_DESTINATIONS` |
| C-12 | P1 | Guide grounding is a prompt promise, not an enforced citation contract — no source-ID schema, URL allow-list, post-gen verifier, evals, persistence, or cost audit; landing says answers have the source attached and the guide "remembers you" while chats vanish on refresh. | `lib/guide/deepseek.ts`; `system-prompt.ts`; `guide-chat.tsx` |

### Sol-unique — outcome/database integrity (code-verified)

| # | Sev | Finding | Evidence |
|---|-----|---------|----------|
| O-1 | **P0** | Outcome/calibration data is forgeable through Supabase's exposed Data API — RLS proves ownership but not the semantic validity of owner-inserted prediction/attempt/outcome rows; validation lives only in route code. *Note: the RLS does pin `source='self_reported'` + `verified_by IS NULL` and re-asserts parent ownership, so a "verified" row cannot be forged; the real gap is that the frozen predicted band is not validated against engine output.* The loop must not feed calibration/B2B analytics in this state. | `supabase/migrations/20260620000000_add_outcome_validation.sql:137-193` |
| O-2 | **P0** | 3-day expiry is access expiry, not deletion — anonymous rows hold profile/result JSON + `expires_at`, but no cron/purge/delete path exists and anonymous users have no deletion control. | initial assessments migration; `lib/assessments/repo.ts`; repo-wide no purge job |
| O-3 | P1 | Critical workflows are non-transactional — claim/bootstrap/primary-switch/lead and apply→freeze→attempt→event are best-effort separate writes; mid-flow failure strands or contradicts state. | `claim.ts:26-84`; `shortlist/route.ts:36-46`; `on-apply.ts:28-73` |
| O-4 | P1 | Profile JSON writes can lose concurrent edits — whole-document read/merge/overwrite, no revision predicate; multi-tab or upload-triggered flags overwrite each other. | `lib/profiles/repo.ts:48-66` |
| O-5 | P2 | Real-DB safety is advisory — Supabase integration CI is `continue-on-error`, references a missing seed file, auto-exposes new tables; no browser E2E gate. | `.github/workflows/ci.yml:27-38` |
| O-6 | P2 | Marketing auth personalization catches Next static-bailout errors and keeps public routes dynamic; Google Fonts makes a clean build depend on network access. | `app/(marketing)/layout.tsx:14-20`; `app/layout.tsx` |
| — | P2 | False-empty-state repositories: `lib/programs/repo.ts` et al return `[]`/`null` on DB error → a false "no programs" state instead of an outage. | `lib/programs/repo.ts` |

### Claude-unique — that survived the code-check

| Finding | Note |
|---------|------|
| Verified dependents **are now collected** (`budget-step.tsx:65-77`), narrowing F-1's live scope to refusals only. | Claude did the extra check Sol didn't; keeps F-1 precise. |
| "GS/GTE authoring workspace is the moat, **not** MV-08" — sharpest strategic prioritization; names it the #1 reason a student still pays an agent, and cites guide system-prompt hard-rule #3 as the exact refusal point. | Strategy framing, not a code defect; adopted into §6. |
| Ranks F-11 (wire 5 orphaned modules) the "highest-ROI item" with an explicit 5-step student-outcome order. | Adopted into §6. |
| Concrete board-staleness anchors (`mobile-tab-bar.tsx:42`, `logo.tsx:5`, `completeness-ring.tsx:11`, commit `4efb379`) — most auditable evidence that the board lies. | Adopted into §6 "Today." |
| Content-pipeline specifics: guarded-surface table (498 `lastVerified` vs 23 `reverifyBy`), the 2026-07-01 avalanche precedent (MV-80, 16 records, 12 changed) as proof the manual model already strained, and a 4-step "cheapest automation that defers the break." | Strongest freshness remediation detail; adopted into §6 "Next month." |
| Monetization specifics: "OSHC = cleanest first dollar" with `au-oshc-premiums.ts` (5 gov-approved providers), price-ranked-with-test enforcement. | Adopted into §8. |

---

## 5. Adjudicated disagreements + corrections log

Every row resolved against the code. The resolution is binding.

| Topic | Claude said | Sol said | What the code shows | Resolution |
|---|---|---|---|---|
| **MV-08 outcome capture** | "shipped but inert / no write path" (in several section bodies) | Capture is live; only verification/calibration blocked | `shortlist/route.ts:44-45` calls `captureApplication`; `on-apply.ts` writes attempt+event; `outcomes/*` routes append events (CANON #1) | **Sol.** Claude's section-level "inert" is false and self-contradicting (its own §4 already corrected it). Flips C3/tracker severity from "inert plumbing" to "capture works, verification is the gap." |
| **TS→SQL programs bridge guarded?** | Central DB P1: "a migration typo ships silently with a green suite" | Downgraded; parity tests exist | `tests/programs/seed-migration-parity.test.ts` **and** `bridge-fact-parity.test.ts` compare SQL rows to SEED_PROGRAMS/fact modules (CANON #2) | **Sol.** Claude's headline DB finding is the section's biggest error; residual risk is only fields outside parity coverage. |
| **Seeded catalogue size** | "~64 programs" (used throughout several sections) | 83 programs / 15 universities / 6 fields | `grep universityId:` = 83 (CANON #3); 64 was the base seed before the fact-layer bridge | **Sol.** Claude used the stale count in journey, competitive, technical, content sections. |
| **Unsupported-field matches** | "no matches" (journey) | Full list of unrelated programs labelled Strong/Possible | `compute.ts:38-49` — soft sort, no field filter; unsupported field → primary=[], all 83 shown as verdicted matches | **Sol.** A genuine trust break (C-10); Claude's "no matches" is wrong. |
| **Budget stage severity** | Budget compared to tuition (mild) | Total funds vs tuition only = wrong-question P0 | `compute.ts:86` `tuitionGap = tuitionMin - budget`, `budget = finance.total` | **Sol** (C-3, code-accurate). |
| **Is core output correct enough to launch?** | "corridor data is sufficient / correctness is fine" | Live decision-incorrectness is the top blocker | `compute.ts:86,143,73-86,153-159,38-49` — four verified user-facing defects | **Sol.** Claude's "sufficient" framing is refuted by code; correctness outranks auth/email. |
| **Profile "accuracy" meter** | Conflation of completeness vs confidence (true but incomplete) | Mathematically cannot exceed 28, never reaches Verified(40)/Complete(75) | `accuracy.ts:16` starts 25, `:23` +=3, `:28` thresholds 40/75 | **Sol** more precise (C-6); Claude partial. |
| **Live data-handling copy** | (not found) | P0 copy-vs-code contradiction cluster | `trust/page.tsx:44-46,73-75` vs `guide/chat/route.ts:50-55` and `account/delete/route.ts:66-69` | **Sol** (C-1/C-2) — significant P0 unique to Sol, load-bearing for a trust-first product. |
| **Six-month bank seasoning as policy** | Missed (or P0-aggressive without the research contradiction) | Unsupported rule shipped despite repo's own research | `compute.ts:153-158`, `plan/generator.ts`, `checklist/generator.ts` emit it; research doc says DHA publishes no duration | **Sol** (C-5, code-verified). |
| **Destructive document replacement** | Missed | Real data-loss path | `documents/upload/route.ts:65-79` deletes then validates | **Sol** (C-8, code-verified). |
| **Outcome-row integrity** | (not raised) | Semantically forgeable via Data API | Migration grants owner-only insert, no server-derivation of verdict/rule-version | **Both correct on wiring; Sol adds a real modest integrity gap (O-1)** — but Sol's "semantically forged" overstates: `verified_by`/`source`/parent-ownership guards mean a *verified* row can't be faked; the predicted band isn't engine-checked. Directionally valid, low stakes today. |
| **Multi-corridor readiness** | CLAUDE.md "no code changes" (repeated) | Skeptical: hardcodes everywhere | `theme/corridor.ts`, `from-assessment.ts`, `grade-scale.ts` corridor-specific; `financial.ts:71` AU-only | **Sol** more accurate (plausible, not exhaustively verified). |
| **Corridor #2 effort** | Crisp marginal-cost table, ~2–4 wks India→AU | Un-costed journey/RLS/content-ops work; 2–4 wk estimate unjustified | Forward estimate, not code-checkable | **Both partial** — Claude more concrete, Sol more defensibly hedged. Direction (source-first, India→AU) agreed. |
| **Board duplicate IDs** | "MV-99 and MV-101 dup; MV-100 does not" | Same | `board.json`: MV-99 ×2, MV-101 ×2, MV-100 ×1 (CANON #5) | **Both correct.** (An earlier draft error claiming MV-100 was fixed pre-merge; noted for the record.) |

**Corrections log — claims that failed the code-check (do not propagate):**
1. *Claude, several sections:* MV-08 "inert / no write path" — **false** (CANON #1). Capture is live; only verification/calibration is consent-blocked.
2. *Claude, database section headline:* TS→SQL bridge unguarded — **false** (CANON #2). Two parity tests exist.
3. *Claude, throughout:* "~64 programs" — **stale** (CANON #3). It's 83/15/6.
4. *Claude, journey/executive:* "unsupported field → no matches" and "correctness is fine" — **false** (C-10, C-3/4/5).
5. *Claude, journey:* an explicit "~45% complete" stage tally — leans on the **retired %-complete vanity metric** the founder killed; Sol deliberately avoided it. Drop the percentage; keep the Strong/Partial/Absent narrative.
6. *Sol, ux-audit:* a P0 "profile **accuracy** meter cannot reach its labels" — the component is a `CompletenessRing`; grep for "accuracy" across `components/profile`/`lib/profile` is empty. The *real* accuracy bug is `lib/results/accuracy.ts` (C-6), a different surface. Keep C-6; drop the "profile accuracy meter" label.
7. *Sol, O-1:* "semantically forged outcome rows" — **overstated**; the `verified_by`/`source`/parent-ownership guards block forging a *verified* row. Reframe as "predicted band not engine-validated."

---

## 6. Unified prioritized action plan

Merged from both plans. Where orderings differed, the adjudicated resolution wins and the reason is given in one clause. Effort: S ≤ 1 day · M = 2–5 days · L = 1–3 weeks. Impact split student / business.

### Today (immediate)
| Task | Pri | Effort | Deps | Student impact | Business impact |
|---|---|---|---|---|---|
| Stop/hide the live false claims: `/trust` "no third parties"/"nothing more", deletion-vs-12-month-retention, uploads-change-verdict, "all figures current," 485 "2–4 years," and the "six countries done well" destination copy | **P0** | S | owner approves temp copy | Removes demonstrably false guidance | Protects the trust moat + legal posture |
| Remove or clearly re-label the fixed "6 months bank seasoning expected" in matches/plan/checklist (C-5) | **P0** | S | content owner | Stops consultancy folklore posing as a rule | Prevents a high-severity correction event |
| Suppress irrelevant-field results — no "matched your profile" when the catalogue has zero programs in the selected field (C-10) | **P0** | S–M | coverage map | A Law student stops seeing Accounting as "Strong" | Prevents catastrophic first-session trust loss |
| Fix F-3 English normalization (use `toIeltsEquivalent` in profile-strength + label) | **P0** | S | — | Correct output for non-IELTS users | Kills a visible absurdity ("Strong English (58.0)") |
| Fix F-19 expired Australia Awards deadline + add an embedded-date-passed assertion for all deadline-bearing data | **P0** | S | — | A provably-wrong fact is live | Trust-first product cannot ship a stale rule |
| Treat all current outcome rows as untrusted for calibration/export; card O-1/O-2 as blockers | **P0** | XS | — | none | Prevents poisoned analytics/business decisions |
| Founder: decide the name and supply MV-05's four facts (entity/jurisdiction/region/retention) | **P0** | Founder | — | Consistent identity | Unblocks F-2, F-4, domain, email, launch |
| Board hygiene: move MV-99/MV-101 → Done, re-column the mascot cluster to Icebox/low, card every P0 here (anchors: `mobile-tab-bar.tsx:42`, `logo.tsx:5`, `completeness-ring.tsx:11`, commit `4efb379`) | P1 | S | — | — | Board stops lying; order reflects risk |

*Ordering note:* Sol's correctness P0s (C-3/4/5/10, F-3) lead the day **ahead of** auth/email — adjudicated: a trust-first product cannot ship known-wrong verdicts, and these outrank Claude's original F-6/F-7 "Today" placement.

### Next sprint
| Task | Pri | Effort | Deps | Student | Business |
|---|---|---|---|---|---|
| F-1: refusal question in wizard (or "assumes no prior refusals" badge) + re-score delta explanation | **P0** | S–M | — | Closes the worst trust break | Removes bait-and-switch |
| C-3: split budget into tuition / living / dependants / total first-year funds with NPR↔AUD shown | **P0** | M | cost model | Sponsors get an actionable funding answer | Major differentiation; fewer misleading leads |
| C-4: gate matches on complete inputs; render "unknown," never `0` | **P0** | S–M | min-input contract | Stops fabricated Reach gaps | Result validity + conversion quality |
| O-1: revoke direct authenticated outcome inserts; one transactional capture RPC/server boundary with DB-enforced ownership/consistency/transitions/idempotency | **P0** | M–L | migration + RLS tests | Protects application history | Makes the outcome moat eventually usable |
| O-2: scheduled anonymous-assessment purge + anonymous deletion + retention monitoring | **P0** | M | retention decision | Real deletion for non-account users | Closes a hidden privacy/data-liability gap |
| F-2: publish accurate `/privacy` + `/terms` + collection/AI-processor disclosure + age/guardian gate + footer links | **P0** | M | name, facts | Informed choice before sensitive data | Public-beta gate |
| F-6/F-7: Supabase magic-link email auth + deliver-a-copy + day-2 reminder (one email touch closes four findings) | **P0** | M | sender domain | Funnel wall down; expiry no longer silent | Higher claim conversion + retention |
| F-15: wire Sentry (`@sentry/nextjs` + instrumentation), request IDs, rule/data versions, alerts | P1 | S–M | monitoring acct | More reliable experience | Production stops being invisible |
| C-8: make document replacement non-destructive (upload/validate → switch metadata → delete old) + failure tests | P1 | S–M | storage design | A failed replacement can't erase a passport | Enables safer vault adoption |
| C-6/C-7: fix PTE/TOEFL component scales; redesign the accuracy meter as completeness | P1 | S | — | Correct, reachable states | Removes visible correctness defects |
| O-3/O-4: transactionalize claim/bootstrap/primary/lead; optimistic concurrency on profile JSON | P1 | M–L | DB functions | No stranded claims or lost multi-tab edits | Fewer support/data-corruption incidents |
| C-9: surface OAuth claim-failure recovery on `/assess` | P1 | S | — | High-intent users recover | Fewer silent drop-offs |
| F-9: human-fallback CTA on all four dead-ends + a minimal `/about` with a named human | P1 | S | — | Dead-ends stop bouncing to agents | Accountability |
| "Send my results to WhatsApp" share affordance | P1 | S | — | Channel-correct re-engagement | Organic distribution |

### Next month
| Task | Pri | Effort | Deps | Student | Business |
|---|---|---|---|---|---|
| F-11: wire the five orphaned modules into plan/checklist/matches (Claude's highest-ROI item) | P1 | S–M | — | ~5 stages Absent→Partial at near-zero data cost | Journey depth cheaply |
| F-13: Reach off-ramp (IELTS retake, pathway providers, regional options, defer) + explicit "insufficient information" state | P1 | M | catalog/pathway data | Highest-need cohort gets a next move | Word-of-mouth vs abandonment |
| F-18/F-20: `reverifyBy` on annual-drift modules; source + guard `FX_RATES`; a "freshness due" forward report; embedded-date guards; schedule the existing harvest into a monthly diff→PR (Claude's 4-step) | P1 | M–L | review owner | Fewer stale rules/deadlines | Defers the one-person bottleneck ~a year |
| F-5: disclose the heuristic verdict core on `/how` + results ("our calibration, our judgment"); deep-link the capacity gate to its DHA source | P1 | S | — | Trust story becomes airtight | Honesty as differentiation |
| F-16: sign-claim rate-limit, fail-closed limiter on mutators, CSP, catalogue caching | P1 | M | — | — | Security/scale hygiene |
| Deepen the 83-course catalogue (CRICOS, campus, mode, duration, prerequisites, deadlines, deep sources, current fees) and **hard-filter by field** | P1 | L | data pipeline | Shortlist becomes decision-grade | Competes on depth not impossible breadth |
| UX batch: branded 404/expired flow, wizard focus/Enter-to-advance, aria-live on guide, jargon gloss (CoE/CRICOS), skip-link, menu/modal focus | P2 | M | — | Lower friction | Completion + support burden |
| Printable/WhatsApp family summary (NPR scenarios, targeted Nepali labels) | P2 | M | correct cost model | Supports the real family decision | Organic distribution + sponsor trust |
| O-5: required Supabase reset/RLS/storage integration CI + 3–5 browser E2E + axe smoke | P1 | M–L | reliable seed | Fewer broken critical flows | Safer deploys at growth |

### Before controlled MVP beta (gate)
All P0s above closed + an independent privacy/security review. Plus: interview 8–12 active Nepal applicants, 3–5 recent arrivals, and several parents/sponsors; usability-test low-end mobile/low bandwidth (Sol's evidence-gathering gate — adopted because the verdict is hand-calibrated and the plan should be checked against real behaviour before broad build). Instrument `assessment_claimed`, relevant-match rate, shortlist/apply transitions, correction reports, support dead-ends. Establish a support/correction SLA, incident playbook, backup/PITR restore drill, and a named accountability page. **Do not gate the beta on**: post-arrival completeness, the GS workspace, monetization, corridor #2.

### Before broad public launch
GS/Genuine-Student guided workspace (F-12, L — the consultancy-replacement core; no ghostwriting) · complete application/offer/CoE/waiting/RFI workflow + verified-outcome pilot (F-14/F-10) · anti-fraud + NAATI/translation + dependant + refusal-recovery + licensed-escalation pathways · launch distribution plan (creator partnerships, campus ambassadors, SEO on refusal/GS queries, WhatsApp sharing) with a sponsorship-disclosure firewall.

### After launch
Post-arrival stages (accommodation, banking/SIM/TFN, work rights, community) staged · monetization experiments per §8 (OSHC first) · verified outcome calibration once O-1 is fixed and consent exists (MV-08) · corridor #2 = India→AU with de-hardcoding (F-22) · neutrality-firewall test.

---

## 7. The single ranked checklist (~25)

Front-loaded with the code-verified highest-severity items per the adjudication (a trust-first product cannot ship live-wrong verdicts); auth/email follow.

1. Remove or hide the live false claims (uploads/AI-sharing/deletion-retention/hosting/freshness/unsupported-countries/485 duration). *(C-1/C-2)*
2. Suppress irrelevant-field results — never call Accounting a match for a Law selection. *(C-10)*
3. Require complete match inputs; represent missing values as unknown, never zero. *(C-4)*
4. Split budget into tuition / living+dependants / fees+travel / total first-year funds. *(C-3)*
5. Remove the unsupported fixed six-month bank-seasoning rule. *(C-5)*
6. Fix PTE/TOEFL normalization + component scales and the impossible accuracy meter. *(F-3/C-6/C-7)*
7. Correct the expired deadline + add embedded-date/freshness guards. *(F-19)*
8. Freeze use/export of current outcome rows; treat them as untrusted self-reports. *(O-1)*
9. Revoke direct Supabase outcome inserts; land one transactional, DB-validated capture boundary. *(O-1)*
10. Implement observable purge/deletion for expired anonymous assessments. *(O-2)*
11. Founder: choose the canonical name + supply legal entity/jurisdiction/region/retention facts. *(F-4)*
12. Publish `/privacy` + `/terms` + collection/AI notices + age/guardian/upload consent. *(F-2)*
13. Add the refusal question (or an explicit anonymous-assumption badge) + re-score delta explanation. *(F-1)*
14. Add magic-link email auth + deliver a result copy; choose expiry from user evidence, not manufactured urgency. *(F-6/F-7)*
15. Wire Sentry/observability; fix the render-time state update + dynamic marketing bailout + CSP/rate-limit gaps. *(F-15/F-16/O-6)*
16. Make document replacement non-destructive; add versions/failure-path tests. *(C-8)*
17. Transactionalize claim/bootstrap/primary/lead; add optimistic concurrency to profile writes. *(O-3/O-4)*
18. Replace swallowed repository errors with typed failure states; never auto-close/re-score from a failed read.
19. Wire the five orphaned late-journey modules into plan/checklist/matches. *(F-11)*
20. Add the Reach off-ramp with sourced improvement paths. *(F-13)*
21. Disclose the heuristic verdict core + deep-link the capacity gate; add `reverifyBy` on annual-drift modules + source/guard `FX_RATES`. *(F-5/F-18/F-20)*
22. Deepen the 83-course catalogue + hard-filter to relevant supported fields.
23. Human fallback on all dead-ends + minimal `/about`; printable/WhatsApp family summary (NPR, Nepali labels); `assessment_claimed` + funnel instrumentation. *(F-9/F-8/F-24)*
24. Make disposable-Supabase/RLS/storage integration + critical browser journeys required CI checks. *(O-5)*
25. Interview active applicants, recent arrivals, and parents; low-bandwidth mobile test; revise scope from evidence — then build the Genuine Student workspace, application tracker, and verified-outcome pilot; launch broadly only after the gate + independent privacy/security review. *(F-12/F-14/F-10)*

---

## 8. Monetization roadmap (merged)

Both audits agree on the shape: **no revenue before or at launch** (trust-accrual phase, and a legal prerequisite anyway); core truth and recommendation rationale stay free forever; ancillary commerce the student would buy anyway pays the bills. Reconciled stage-gates:

- **Pre-launch (probe, not revenue).** A capped concierge / document-readiness pilot as a willingness-to-pay probe after consent/legal gates clear (Sol). Free otherwise.
- **Post-PMF, first dollar.** Disclosed, benefit-ranked, neutrality-firewalled ancillary comparisons — **OSHC first** (mandatory purchase, data already exists in `au-oshc-premiums.ts`, 5 gov-approved providers, `/trust` already pre-authorizes disclosed affiliates), then forex/remittance, then AU student banking, then accommodation (Claude's concrete OSHC-first + Sol's ordering).
- **Split on premium.** Adjudicated: the *core journey stays free* but *optional workflow and narrowly-scoped human review can be student-paid* (Sol's "core-truth-free vs core-journey-free" distinction is the more defensible reading of the mission metric). A paid GS/Genuine-Student review is the strongest wedge.
- **At 100k+.** Fixed-fee institution/employer workflow + privacy-safe aggregate analytics on **consented, integrity-fixed** MV-08 outcome data (blocked until O-1 lands) + API licensing.
- **At 1M+.** Multi-corridor infrastructure / white-label the assessment engine.
- **Reject permanently, in writing.** Pay-to-rank, hidden sponsored results, raw lead sales, targeted ads inside guidance, uncalibrated percentage odds, and unlicensed (OMARA-regulated) immigration assistance — the last would make LandingPad the thing it replaces. Licensed legal/migration help may later exist only as a separated, transparently ranked marketplace. Ship an **executable neutrality firewall**: a test asserting no scorer/matcher reads any partner/commission field.

Likely dominant 5–10-year streams: B2B market intelligence on outcome data + engine licensing, with disclosed ancillary commerce as the steady floor — **contingent on the outcome-integrity fix (O-1) and consent (F-2) landing first.**

*Triangulated from two independent 13-section audits; every P0/P1 and every disagreement adjudicated against the checked-out repository. Source audits preserved under `claude/` and `gpt55-sol/`; §5 records what each got wrong.*
