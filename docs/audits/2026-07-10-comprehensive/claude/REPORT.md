# LandingPad — Comprehensive Product & Codebase Audit

**Date:** 2026-07-10 · **Method:** 33-agent orchestrated audit (6 ground-truth readers → 13 Opus section auditors → per-section adversarial fact-checking against the repo → completeness critic), synthesized and reviewed by the orchestrator. 96 falsifiable claims were extracted; ~85% CONFIRMED against code, the rest REFUTED or PARTIAL and corrected below.
**Full section files (appendices):** [`sections/`](sections/) — product-walkthrough · feature-gaps · journey-audit · ux-audit · technical-audit · database-strategy · content-pipeline · trust-credibility · roadmap-audit · mvp-definition · scalability-plan · competitive-analysis · monetization.
**Naming note:** the founder's brief titles the product "LandingPad"; production ships three identities (footer "MyVisa", email @merovisa.app, repo MeroVisa). Treated here as LandingPad, flagged as a launch blocker (§Register, F-4).

---

## 1. Executive summary — are we building the right product, in the right order?

**The right product: mostly yes, with one honest reframe needed.** The assess → verdict → plan → checklist spine is genuinely differentiated: no consultancy, government site, Reddit thread, or ChatGPT gives a Nepali student an unconflicted, sourced, personalized Strong/Possible/Reach verdict before anyone gets paid. The provenance discipline (findingRefs → reconcile harness → CI) is real engineering no competitor has. **But "replaces the consultancy" currently over-claims.** The consultancy's monetized value is *doing* — paperwork, GS statement, lodgement — and the product today owns the first ~10% of the journey (assess, shortlist, prepare) and hard-stops at "track your visa in ImmiAccount." The realistic user story today is *"LandingPad told me I'm Possible — now I'll take that to an agent."* That's a **companion**, not a replacement. The path to the north star runs through: (a) the GS/GTE preparation workspace (the #1 refusal artifact and the consultancy's crown-jewel fee), (b) an application tracker that holds the student through offer → CoE → lodgement → RFI, and (c) turning on the outcome loop.

**The right order: no — three inversions.** (1) The next spend on the board is a mascot/imagery cluster (MV-48/49/50/85/86/87) while the funnel has a hard wall (Google-only sign-in) and production collects sensitive data with no published privacy policy. (2) Five sourced, maintained late-journey data modules render to **zero** UI surfaces — the founder pays their maintenance cost while students get none of the value; wiring them is near-free journey depth. (3) The single most on-brand missing feature — an honest off-ramp for "Reach" students — isn't on the board at all.

**The single most damaging finding** is a trust-integrity break, not a gap: the anonymous wizard never asks about prior visa refusals, but the scorer penalizes them (−15/−35). A refused student gets an optimistic anonymous verdict, converts, fills the immigration profile section, and watches her band silently drop. That is a bait-and-switch aimed at exactly the cohort a trust-first product must never mislead — and it's a small fix.

**Launch readiness:** the corridor data is sufficient; launch is blocked by **legal (privacy/terms + minor-consent), identity (name), the auth wall, and operational blindness (no error monitoring)** — not by product breadth.

---

## 2. What is verifiably strong (don't break these)

- **Provenance machinery**: every datum carries `findingRefs`/`source`/`lastVerified`; `reconcile.js` runs in CI so a value drifting from its cited finding fails the build. A `seed-migration-parity` test guards the TS→SQL programs bridge (the auditors initially missed this — see §4).
- **Honest verdict discipline**: banded verdicts, score never rendered; `scoringRulesStale` runtime degrade wired to the verdict card; Estimated/Verified labels; a guide that refuses to ghostwrite.
- **Security fundamentals**: RLS forced on every table, FKs indexed, owner server-derived, service-role writes owner-fenced; no RLS hole found by either the technical or database auditor.
- **A11y/UX primitives**: per-group error boundaries, reduced-motion, focus-visible, roving tabindex, persist-miss retry. ~297 test files / 1,900+ tests.
- **MV-08 outcome capture is more alive than anyone thought** (§4).

---

## 3. Verified P0/P1 register (deduped across sections)

### Trust integrity
| # | Sev | Finding | Evidence | Fix effort |
|---|-----|---------|----------|-----------|
| F-1 | **P0** | **Anonymous wizard omits prior-refusal question; scorer penalizes it** → dishonestly optimistic anonymous verdict, silent band-drop after sign-in. Fact-checked CONFIRMED. | `components/wizard/wizard.tsx:23-33` (no refusal step); `lib/scoring/visa.ts` (REFUSAL_VISA_PENALTY −15/−35); `lib/scoring/from-sections.ts:60` → `lib/assessments/re-score.ts` | **S** — add one wizard step (or badge the anonymous verdict "assumes no prior refusals" until asked) |
| F-2 | **P0** | **No `/privacy` or `/terms` in production** while storing grades, funding, age, dependents + a documents vault that holds passports/bank statements. No consent/guardian gate; age is a free-text 15–80 integer, not DOB. MV-05 engineering is merged; blocked only on four founder-suppliable facts. | routes absent; `components/layout/footer.tsx:6-22` (no legal links); MV-05 dossier D1/D3 | **S** (founder supplies facts; publish) |
| F-3 | P1 | **English scoring bug**: `profile-strength.ts` compares raw PTE/TOEFL scores against IELTS bands (≥7.5/≥7.0), so any non-IELTS taker gets the max bonus and UI renders "Strong English (58.0)". `visa.ts` normalizes correctly via `toIeltsEquivalent`; profile-strength doesn't. **Re-verified by orchestrator.** | `lib/scoring/profile-strength.ts:15-17,48-52` | **S** |
| F-4 | P1 | **Three product identities ship simultaneously** ("MyVisa" footer, @merovisa.app, "LandingPad" brief). Blocks legal entity naming, domain, privacy policy, marketing. | footer, /trust contact | Founder decision + **S** |
| F-5 | P1 | **Verdict core is unsourced hand-tuning** (dimension weights .30/.25/.25/.20, band cutoffs, FX rates, field competitiveness — all `internal-heuristic`, empty findingRefs) while `/how` implies the verdict comes from Home Affairs. Honest disclosure gap, not a calibration demand. | `lib/data/policy/*`, `lib/data/scoring-config.ts` | **S** (disclose "our calibration, our judgment" on /how + results) |

### Funnel & conversion
| # | Sev | Finding | Evidence | Fix effort |
|---|-----|---------|----------|-----------|
| F-6 | **P0** | **Google-only sign-in** ("Email sign-in isn't ready yet"). Saving, converting, every `(app)` route, and the only anonymous-recovery path all require Google. Not carded on the board. | `components/auth/auth-card.tsx:38-63` | **M** (Supabase magic-link email auth) |
| F-7 | P1 | **3-day expiry is a silent data-loss trap**: no email capability exists anywhere in the codebase (grep resend/sendgrid/nodemailer/postmark = 0), so the core conversion lever fires with no reminder, no deliver-a-copy, no recovery. Also a values tension: an anti-dark-pattern product deleting a student's assessment to manufacture urgency. | `conversion-paths.tsx:51,57`; `lib/assessments/expiry.ts` | **M** (email touch) + policy decision on expiry length |
| F-8 | P1 | **No re-engagement loop at all** (no email/push/reminder); dashboard is a static mirror of user-entered state. Critic caveat: for this demographic the channel may be **Viber/WhatsApp/Messenger**, not email — don't assume email closes this alone; a share/save-to-WhatsApp affordance may outperform. | repo-wide | M (email) + **S** (WhatsApp share) |
| F-9 | P1 | **No human fallback on any dead-end** (unsupported destination, guide 503, no-Google, expired assessment) except a mailto buried in /trust; no /about, no named human accountable anywhere. | `app/(app)/guide/page.tsx`, `destination-notice.tsx` | **S** |

### Journey depth (the consultancy-replacement gap)
| # | Sev | Finding | Evidence | Fix effort |
|---|-----|---------|----------|-----------|
| F-10 | P1 | **Journey hard-stops at "track-visa-decision"**: application = one generic step, waiting period = one line (no processing-time expectations, no RFI coaching), and all 9 post-grant stages (pre-departure → arrival → work → accommodation → community → PR) are **Absent**. See journey table in [`sections/journey-audit.md`](sections/journey-audit.md). | `lib/plan/generator.ts:322-329,388-396` | L (staged) |
| F-11 | P1 | **Five sourced data modules render to ZERO surfaces**: `au-arrival-cash-guidance`, `nepal-forex-cards`, `au-student-worker-wages`, `au-student-transport-concessions`, `au-skilled-visa-directory`. Maintenance paid, zero student value. Cheapest journey-depth win available. | 0 imports outside lib/data + tests | **S–M** |
| F-12 | P1 | **No GS/GTE authoring support** — the #1 refusal driver and the artifact consultancies most earn their fee on gets one paragraph ("draft yours early"); the guide is hard-ruled against drafting. A guided *workspace* (evidence mapper, structure prompts, self-review rubric — not ghostwriting) is the consultancy-replacement core and preserves the ethics line. | `lib/plan/generator.ts` (prepare-gs-answers); `lib/guide/system-prompt.ts` | **L** |
| F-13 | P1 | **No off-ramp for "Reach" students** — bare band label, no improve-path (retake IELTS, pathway/diploma providers, regional universities, defer intake), then a 3-day delete. The crown-jewel differentiator (honest verdict) is a trust failure for the highest-need user. | `verdict-labels.ts` | **M** |
| F-14 | P2 | Application tracking is a 3-value dropdown (`shortlisted|applied|withdrawn`) — no deadlines, offer/CoE states, per-app documents, or consolidated calendar. | `user_program_state` | M–L |

### Operations & technical
| # | Sev | Finding | Evidence | Fix effort |
|---|-----|---------|----------|-----------|
| F-15 | P1 | **No production error monitoring** — Sentry in docs/.env.example but zero `@sentry/*` dependency, no instrumentation.ts. Production errors invisible. | package.json | **S** |
| F-16 | P2 | `POST /api/assess` re-reads the full catalogue 2–3× per request with `select(*)`, two admin clients per request; `sign-claim` is an unauthenticated, unrate-limited HMAC oracle; rate limiting fails open and covers ~4 routes; no CSP despite rendering LLM + user text. | technical-audit section | S–M each |
| F-17 | P2 | Two verdict systems can visibly contradict (profile-strength vs engine); goal step remains scoring/plan-inert (asked, then unused); documents vault inert by design — the *trust-correct* choice (self-uploads can't be verified; see fraud note §6) but never explained to the student in-product. | sections | S–M |

### Data & freshness
| # | Sev | Finding | Evidence | Fix effort |
|---|-----|---------|----------|-----------|
| F-18 | P1 | **Freshness guard watches <5% of dated facts** (23/~498 carry `reverifyBy`; guards fire only on it). All annual-drift modules — tuition, OSHC, provider fees, scholarships, banks — carry zero. 15 guarded facts all re-verify on one day (2027-07-01) behind a one-person manual model. | `tests/data/freshness*`; lib/data | **S–M** |
| F-19 | P1 | **Expired scholarship deadline shipping as current**: Australia Awards `applicationCloses: 2026-04-30` — 71 days past — with no embedded-date-passed guard. | `lib/data/source/australia-awards-scholarship.ts` | **S** |
| F-20 | P1 | **FX_RATES gate the DHA financial verdict but are invisible to every guard** — hand-typed, `internal-heuristic`, empty findingRefs, `lastVerified 2026-06-02`, no reverifyBy/volatility. The number that can force a Reach has no source and no watchdog. | `lib/data/policy/fx-rates.ts:14-17` | **S** |
| F-21 | P2 | Fabricated placeholder policy tables for 5 unsupported destinations (invented English floors/cost bands, empty findingRefs) — inert only because `SUPPORTED_DESTINATIONS` gates them; one line flips them live and breaks the "every figure sourced" promise. | `english-thresholds.ts` etc. | S (mark + assert) |

### Strategy & scale
| # | Sev | Finding | Evidence | Fix effort |
|---|-----|---------|----------|-----------|
| F-22 | P1 | **"Expansion without code changes" is false today**: `from-sections.ts` pins nepal/australia/percentage-nepal; `financial.ts:71+` runs the capacity gate only for Australia; flat `nepal-*`/`au-*` module namespace; no i18n infra (~140 hardcoded-English tsx files). Corridor #2 is an engine refactor, not a content drop. Recommended second corridor: **India→Australia** (reuses the whole AU side, forces the de-hardcoding). CLAUDE.md's claim should be corrected. | scalability section | L (defer until corridor #2 is real) |
| F-23 | P1 | **Mascot/imagery cluster is the wrong next spend** — 3 P1 cards fund decoration for an intentionally imageless body, none with dossiers, all gated on the un-made brand pick. Park until the name lands and the P0s clear. | board.json | S (re-column) |
| F-24 | P2 | **No distribution plan** — creators/FB groups own top-of-funnel; the incumbent is a walk-in high-street shop. Zero acquisition instrumentation (`assessment_claimed` event missing). | — | non-code + S |

---

## 4. Corrections — where the audit itself was initially wrong (and what that teaches)

The adversarial verification pass earned its keep. Treat these as canon:

1. **MV-08 outcome loop is NOT inert.** Four sections (product, feature-gaps, competitive, monetization, and the original ground-truth brief) called it "shipped but inert / no write path." **Refuted**: `app/api/shortlist/route.ts:44-45` calls `captureApplication()` on `applied`; `lib/outcomes/on-apply.ts` freezes the prediction and opens an attempt; four `app/api/outcomes/*` routes exist; dashboard self-report writes events. What's blocked (legitimately, on MV-05/consent) is *verification and calibration*, not capture. The moat is already filling — the roadmap consequence is to **publish legal + consent so the captured data becomes usable**, not to build capture.
2. **The TS→SQL programs bridge IS parity-tested** — `tests/programs/seed-migration-parity.test.ts` parses the migration SQL and asserts agreement with the TS fact layer. The database section's "a migration typo ships silently with a green suite" P1 is refuted; residual risk is narrower (fields outside the parity test's coverage).
3. **Catalogue size**: 83 programs / 15 universities in seed (not "64"), across 6 fields — the six-fields narrowness stands.
4. **Board duplicate IDs**: MV-99 and MV-101 each appear twice (known latent hazard); MV-100 does not.
5. **"Collects minors' DOB/passports"** overstates: it's self-reported age (15–80 integer), no DOB — which is *worse* for compliance (no way to detect a minor) but different in kind. The vault can hold passports users upload.
6. **The "3-day expiry is punitive" framing is opinion**, not evidence — but the underlying tension (trust-first product deleting data to force conversion, against a family-consultation decision cadence) is real and worth a deliberate founder decision (7 days? deliver-a-copy? save-without-account via link?).

---

## 5. Section syntheses (§2–§13, §15 of the brief)

One paragraph each; full depth in the linked appendix.

- **Student walkthrough** ([appendix](sections/product-walkthrough.md)): Aarav's clean-profile path is strong — calm, sourced, anxiety-aware. Priya (prior refusal) is misled (F-1), and neither persona has a reason to return (F-8). Emotional gaps: refusal-recovery content is folded away by default; guide oversells anonymous access (redirects to /auth); a non-AU pick wastes all 9 wizard steps before dead-ending.
- **Feature gaps** ([appendix](sections/feature-gaps.md)): Critical = GS/GTE workspace (F-12), transactional email (F-7), real application tracker (F-14). Important = wiring orphaned modules (F-11), deadlines calendar, NPR funding-gap calculator, part-time-work surfacing. Nice = parent/sponsor view (see §6), PWA, Nepali language. Correctly deferred = community, flights, multi-corridor.
- **Journey** ([appendix](sections/journey-audit.md)): Strong on eligibility/visa-understanding/document-prep; Partial on selection/application; **Absent on all 9 post-decision stages**. Every Absent row is a consultancy bounce point. The five orphaned modules map exactly onto the first Absent stages — wire them first.
- **UX** ([appendix](sections/ux-audit.md)): Primitives strong; orchestration-layer gaps — no Enter-to-advance or focus management in the wizard, guide replies not announced to screen readers, no branded 404 (expired assessments fall to Next's default — hitting returning high-intent users), unglossed jargon (CoE, CRICOS) at UI edges, no skip-link, "9 quick questions" vs "Step 1 of 8" mismatch.
- **Technical** ([appendix](sections/technical-audit.md)): Unusually disciplined MVP; real items are F-3, F-15, F-16. Scale-out is bounded by catalogue caching + per-user limits, not architecture.
- **Database strategy** ([appendix](sections/database-strategy.md)): TS-in-git + Supabase-for-users is the **right** call for v1 (audit trail a DB column can't match). Cracks: source-axis hardcoding (F-22), `profiles.sections` as an unversioned JSON blob (already drifted once), document-kind enum triplicated, 4 modules escaping the reconcile walker. Don't move knowledge into the DB yet; do add corridor keys and version the blob.
- **Content pipeline** ([appendix](sections/content-pipeline.md)): Provenance is machine-enforced (real moat); the freshness *guard* is opt-in and under-applied (F-18/19/20). Extend existing machinery: `reverifyBy` on annual-drift modules, embedded-date-passed assertion, a "freshness due" forward report, then schedule the existing harvest script into a monthly diff→PR. That defers the one-person bottleneck by ~a year.
- **Trust** ([appendix](sections/trust-credibility.md)): More honest-trust machinery than any competitor, but three visible holes: no legal pages (F-2), **no accountable human anywhere** (F-9 — no /about, no named verifier; the disclaimer names DHA and OMARA but never who runs LandingPad), and the unsourced verdict core presented as gov-derived (F-5). Also: corrections policy promises verdict-impact notes with no changelog surface; the financial-capacity gate (the number that forces Reach) lacks a source deep-link.
- **Roadmap** ([appendix](sections/roadmap-audit.md)): Reordered list adopted into §7 below. Stop: mascot cluster (F-23). Unblock: MV-05 is founder-suppliable facts, not truly blocked; MV-55 is mislabeled Blocked per its own dossier. Elevate: MV-38 (documents-vault honesty). Board hygiene: MV-99/101 shipped but sit In Review; duplicate-ID hazard.
- **MVP** ([appendix](sections/mvp-definition.md)): Past-MVP in breadth, pre-MVP in launch-readiness. Ship-gate = legal + name + email-auth + Sentry + F-1/F-3 honesty fixes. Never build: application-submission portal, paywalled core, community-at-MVP. First metric: `assessment_claimed` funnel event.
- **Scalability** ([appendix](sections/scalability-plan.md)): F-22. Decide now: corridor keys on new data modules, no premature i18n framework, second corridor = India→AU (~2–4 wks) not a new destination (~8–12 wks).
- **Competitive** ([appendix](sections/competitive-analysis.md)): Unique axis = unconflicted sourced personalized verdict. Weaker vs communities/creators on recent-outcome proof and vernacular trust (MV-08 data + Nepali-language surfaces are the answers), vs ChatGPT on breadth/freeness (grounding + personalization + honesty is the counter). Positioning: *"Know where you stand before anyone profits from you."*
- **Monetization** ([appendix](sections/monetization.md)): **No revenue before or at launch** (trust accrual phase; legal prerequisite anyway). Post-PMF: disclosed, benefit-ranked ancillary commerce businesses pay for — **OSHC comparison first** (mandatory purchase, data exists, /trust already pre-authorizes disclosed affiliates), then forex/remittance, then AU student banking. At 100k+: B2B market intelligence on MV-08 outcome data (consented, aggregated) + firewalled university "verified listings" + dataset API. At 1M+: white-label the assessment engine. **Reject permanently, in writing**: consultancy/agent referrals (brand-fatal vs the "No agents" hero), display ads, paywalling the core journey, paid visa assistance (OMARA-regulated, becomes the thing it replaces). Add an executable neutrality firewall: a test asserting no scorer/matcher reads any partner/commission field. Likely 5–10-yr dominant streams: B2B intelligence + engine licensing, with ancillary commerce as the steady floor.

---

## 6. Blind spots the whole panel shared (critic pass, orchestrator-endorsed)

1. **Channel reality**: Nepali students live on Viber/WhatsApp/Messenger; email is necessary infrastructure (auth, deliver-a-copy) but may be weak for re-engagement. Cheap test: "Send my results to WhatsApp" button + share cards.
2. **Parents/sponsors are the real deciders and payers** — the consultancy ritual is a sit-down *with the family*. A shareable/printable one-page family summary (verdict + costs in NPR + plan) is cheap and directly attacks the consultancy's strongest moment. (Nepali-language for the *parent artifact* first — before any full UI i18n.)
3. **Agent-fraud dynamics are absent**: doctored bank statements and ghostwritten SOPs are a leading refusal driver in this market. "How to do this *without* fraud (and why fraud gets you banned)" content is high-trust, high-SEO, deeply on-mission — and reframes the inert documents vault as a feature (we don't launder documents; see F-17).
4. **NAATI/certified translation + notarization** is in the data layer but unaudited as a journey step — a concrete, expensive bounce point.
5. **Dependents/spouse journey** unbuilt despite `dependents` living in scoring + costs (spouse work rights, kids' schooling).
6. **Low-bandwidth reality**: the imageless design law is already a bandwidth win — nobody has claimed it. PWA/offline for the checklist is worth more in Nepal than anywhere.
7. **Retention honesty**: visa journeys have long legitimate dead-waits. Don't manufacture engagement; own it — "nothing to do until X; we'll tell you when" (once a channel exists) is *itself* a trust feature no consultancy offers.
8. **PR-pathway honesty**: for many students, study is instrumental to migration; `au-temporary-graduate-visa` + `au-skilled-visa-directory` data exists, unrendered. Surfacing 485/PR-pathway facts honestly (without selling the migration dream) is differentiated and already paid for.

---

## 7. §14 — Prioritized action plan

Effort: S ≤ 1 day · M = 2–5 days · L = 1–3 weeks. Impact: student / business.

### Today (immediate)
| Task | Pri | Effort | Deps | Impact |
|---|---|---|---|---|
| Fix F-3 English normalization (use `toIeltsEquivalent` in profile-strength + label) | P0 | S | — | Scoring correctness; kills a visible absurdity ("Strong English (50.0)") |
| Fix F-19 expired Australia Awards deadline + add embedded-date-passed assertion for all deadline-bearing data | P0 | S | — | A provably-wrong fact is live on a trust-first product |
| Board hygiene: move MV-99/MV-101 → Done, re-column mascot cluster to Icebox/Backlog-low, card the P0s from this report | P1 | S | — | Board stops lying; order reflects strategy |
| Founder: decide the name (LandingPad?) and supply MV-05's four facts | P0 | founder | — | Unblocks F-2, F-4, brand, marketing |

### Next sprint
| Task | Pri | Effort | Deps | Impact |
|---|---|---|---|---|
| F-1: refusal question in wizard (or "assumes no refusals" verdict badge) + re-score delta explanation ("your band changed because…") | P0 | S–M | — | Closes the worst trust break |
| F-2: publish /privacy + /terms + age/consent gate | P0 | S–M | name, facts | Legal launch gate |
| F-6/F-7: Supabase magic-link email auth + deliver-a-copy email + day-2 reminder (one email touch closes four findings) | P0 | M | name (sender domain) | Funnel wall down; expiry no longer silent |
| F-15: wire Sentry (@sentry/nextjs + instrumentation) | P1 | S | — | Production stops being invisible |
| "Send my results to WhatsApp" share affordance | P1 | S | — | Channel-correct re-engagement + organic distribution |
| F-9: human-fallback CTA on all four dead-ends + a minimal /about with a named human | P1 | S | — | Dead-ends stop bouncing to consultancies |

### Next month
| Task | Pri | Effort | Deps | Impact |
|---|---|---|---|---|
| F-11: wire the five orphaned modules into plan/checklist/matches (pre-departure, arrival, work-rights, transport, 485/PR note) | P1 | S–M | — | ~5 journey stages go Absent→Partial at near-zero data cost |
| F-13: Reach off-ramp (improve-paths: IELTS retake, pathway providers, regional options, defer) | P1 | M | — | Most on-brand build; serves the highest-need cohort |
| F-18/F-20: `reverifyBy` on annual-drift modules; source + guard FX_RATES; "freshness due" forward report | P1 | M | — | Freshness guard goes from <5% to meaningful coverage |
| F-5: disclose the heuristic verdict core on /how + results ("our calibration"); deep-link the financial-capacity gate to its DHA source | P1 | S | — | Trust story becomes airtight |
| F-16: sign-claim rate-limit, fail-closed rate limiting on mutators, CSP header, catalogue caching | P1 | M | — | Security/scale hygiene |
| UX batch: branded 404, wizard focus/Enter-to-advance, aria-live on guide, jargon gloss, skip-link | P2 | M | — | Funnel-edge polish |
| Family summary page (printable/shareable, NPR costs, Nepali labels) | P2 | M | — | Attacks the consultancy's family sit-down moment |

### Before MVP launch (gate)
All of: F-1, F-2, F-3, F-4, F-6, F-7 (deliver-a-copy at minimum), F-15, F-19 + `assessment_claimed` funnel event + expiry policy decision (recommend 7 days + deliver-a-copy). **Do not gate launch on**: post-arrival content completeness, GS workspace, monetization, corridor #2.

### Before public launch (scale of attention)
GS/GTE guided workspace (F-12, L — the consultancy-replacement core) · application tracker upgrade (F-14, M–L) · anti-fraud content hub (§6.3, doubles as SEO distribution) · NAATI/translation journey step · monthly harvest→diff→PR automation · distribution plan (creator partnerships, FB-group presence, SEO on refusal/GS queries).

### After launch
Outcome-loop verification once consent exists (MV-08 calibration) · dependents/spouse journey · PWA/offline checklist · Nepali-language parent artifacts → UI · corridor #2 = India→AU with de-hardcoding (F-22) · post-PMF monetization per §5 (OSHC first) · neutrality-firewall test.

---

## 8. The single ranked checklist

1. Founder: pick the name + supply MV-05's four facts (everything legal/brand hangs on it).
2. Fix English normalization bug (`profile-strength.ts`).
3. Fix expired-scholarship data + embedded-date-passed guard.
4. Add refusal question to wizard + re-score delta transparency.
5. Publish /privacy + /terms + age/consent gate.
6. Email magic-link auth.
7. Deliver-a-copy + day-2 reminder email; extend expiry to 7 days.
8. Wire Sentry.
9. WhatsApp share affordance.
10. Human fallback on all dead-ends + minimal /about.
11. Wire the five orphaned late-journey modules.
12. Reach-verdict off-ramp.
13. Freshness: reverifyBy on annual-drift modules + FX_RATES sourcing/guard.
14. Disclose heuristic verdict core + deep-link the capacity gate.
15. Security batch (sign-claim limits, fail-closed limiter, CSP, catalogue cache).
16. UX funnel-edge batch (404, wizard keys/focus, aria-live, gloss, skip-link).
17. Printable family summary (NPR, Nepali labels).
18. `assessment_claimed` + funnel instrumentation.
19. GS/GTE guided workspace.
20. Application tracker (deadlines, offer/CoE, per-app docs).
21. Anti-fraud content hub + distribution/SEO plan.
22. NAATI/translation step; dependents journey.
23. Harvest automation (monthly diff→PR).
24. MV-08 verification/calibration once consent lands.
25. Corridor #2 (India→AU) + pipeline de-hardcoding; then monetization stage 1 (OSHC).

*Generated by a 33-agent orchestrated audit; all P0/P1 claims adversarially fact-checked against the repo; corrections in §4. Section appendices carry full detail and file-level evidence.*
