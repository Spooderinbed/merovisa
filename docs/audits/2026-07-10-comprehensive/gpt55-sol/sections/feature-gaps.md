# Feature Gap Analysis — LandingPad (Nepal → Australia)

**Auditor role:** Senior PM. **Date:** 2026-07-10. **Lens:** student outcome (journey completeness + reliability), not coverage %.

## Framing

The north star is that the app *replaces the local consultancy*. So the correct question for every gap is not "does a competitor have this feature" but "does the absence of this feature bounce a Nepali student back to an agent?" I graded on that. A student's real journey is: **assess → shortlist → apply → get offer → accept + pay → get CoE → arrange OSHC → write GS/GTE answers → lodge Subclass 500 → biometrics/health/police → visa grant → pre-departure → arrival → settle + work.** LandingPad today is genuinely strong on the *front half* (assess → shortlist → readiness guidance) and thins out sharply at exactly the point where students most fear making a mistake and most reach for a consultancy: **the visa application itself and everything after the offer.**

A recurring and important pattern: **much of the "after-offer" knowledge already exists as sourced data modules but is never rendered.** `lib/data/source/au-arrival-cash-guidance.ts`, `au-student-transport-concessions.ts`, `nepal-forex-cards.ts`, and `lib/data/policy/au-student-visa-limits.ts` (part-time work rules) all carry provenance and pass freshness tests, yet **zero components import them** (verified: `grep -rl` over `components/`+`app/` returns 0 for each). The founder is paying the maintenance cost of this data with none of the student benefit. That is the cheapest cluster of wins in this report.

---

## Critical gaps (P0 — journey-breaking; a student cannot self-serve past this point)

### C1. No Genuine Student preparation workspace — only a paragraph that says "draft yours early" (P0)
The GS response is a high-stakes, high-anxiety part of a Nepali applicant's visa case. Today the entire product response is **one block of explanatory copy** in `lib/plan/generator.ts:215-219` (`prepare-gs-answers`): it describes the requirement and tells the student to draft early. There is **no question-by-question workspace, evidence mapping, consistency check, self-review rubric, or review path.** The guide correctly refuses to ghostwrite submissions (`lib/guide/system-prompt.ts`). The missing product is therefore not an essay generator; it is a structured workspace that helps the student assemble their own truthful evidence and check contradictions. User value: high. Business value: strong differentiation and a natural optional review service. Complexity: medium-high. **Before public launch, but not a controlled-beta launch gate.**

### C2. No email whatsoever — the 3-day expiry has no reminder (P0)
There is **no transactional email in the codebase** (verified: `grep -rilE "resend|sendgrid|nodemailer|smtp|postmark|mailgun"` over `lib/`+`app/` = 0 hits). The only email touchpoint is Google OAuth (Supabase-side) and the `leads` table which *captures* an email but never sends to it. Consequences: (1) the 3-day assessment expiry (`ASSESSMENT_TTL_DAYS`, `lib/assessments/expiry.ts`) — the app's core urgency-and-conversion lever — fires **silently**; a student who doesn't return within 72h loses their results with no warning and no recovery path (anon recovery is Google-claim-only). (2) No "your document expires," no "intake deadline approaching," no re-engagement. For a funnel whose entire conversion thesis rests on urgency, having no way to *deliver* that urgency is a structural hole. Complexity: low-medium (Resend/Supabase + a cron). **MVP-critical** — this is a conversion bug disguised as a missing feature.

### C3. Application submission & tracking is a status dropdown, not a tracker (P1→P0 for the north star)
A student applying to several programs juggles per-university portals, deadlines, document requirements, and offer/CoE states. LandingPad offers `user_program_state` (`shortlisted | applied | withdrawn`) plus a live self-reported outcome funnel backed by frozen predictions, application attempts, and outcome events. That capture is real, but it is **not an application workspace**: there is no per-application deadline, submitted date, portal link, offer-condition list, CoE task set, or per-application document status. Verification/calibration of outcomes is also still blocked. The current status controls record history; they do not reduce enough of the student's operational load. Complexity: medium-high. **Core MVP for the consultancy-replacement north star; post-beta if the launch promise is narrowed to readiness.**

---

## Important gaps (P1 — major; degrades trust or forces an agent for a sub-journey)

### I1. After-offer / pre-departure / arrival guidance exists as data but is never shown (P1)
`au-arrival-cash-guidance`, `au-student-transport-concessions`, `nepal-forex-cards`, `au-student-visa-limits` are sourced, fresh, and **orphaned** (0 UI imports, verified). The plan generator ends at `track-visa-decision` — there is **no pre-departure checklist and no arrival module** despite the raw material being written and paid for. A student who gets a visa grant then hits a self-serve dead-end on money transfer, SIM/transport, first-week cash, and accommodation — and calls an agent's "landing support." Wiring these four modules into a "Before you fly / When you land" panel is arguably the **highest ROI item in this report**: the research is done, only rendering remains. Complexity: low. **MVP-cheap.**

### I2. Part-time work rules are one marketing word, not an in-app feature (P1)
`au-student-visa-limits.ts` encodes the 48-hours/fortnight cap and conditions, but it is unreferenced in-app; the only student-facing mention is a single `Work rights` fact string on the *marketing* destination page (`components/destinations/destination-detail.tsx:68`). Work rights + realistic earning expectations are central to whether a Nepali student (and their sponsor) believes the plan is financially survivable — and to honest expectation-setting the brand claims to own. No job-finding help at all (out of scope for MVP, but the *rules* should be surfaced). Complexity: low. **MVP.**

### I3. No deadlines / intake calendar or reminders (P1)
`IntakeTimingCard` (`components/results/intake-timing.tsx`) shows the next intake window, and MV-54 shipped scholarship key-dates — but there is **no consolidated deadline view and no calendar/ICS export** (verified: no `.ics`/ical/addToCalendar in `components/`). Combined with C2 (no email), a student has no system-driven way to not-miss an intake or scholarship close. The knowledge is present; the reminder layer is absent. Complexity: low-medium. **MVP-adjacent.**

### I4. English-test prep and booking — plan steps only, no resources (P1)
Plan kinds `add-english-score` / `upload-ielts-report` prompt the student to *have* a score but offer no prep guidance, no test-format explainer, no booking links, no band-target mapping to their shortlist. Given English is a scored dimension and a common gap, a "here's your target band per program and how to book" module would keep students in-app. Complexity: low (reference content). **Later-MVP.**

### I5. Financial planning is a scoring gate, not a tool (P1)
The engine gates on a financial-capacity floor and the plan covers source-of-funds/remittance/sponsor documentation. But there is **no interactive cost/loan calculator, no “how much in NPR, by when?” planner, and `nepal-forex-cards` is orphaned.** Funding is central to the sponsor decision and financial evidence can be material to the visa case. An editable course/city/family total-cost and funding-gap tool would directly serve the person funding the journey. Complexity: medium. **MVP-adjacent.**

---

## Nice-to-have (P2 — real value, not journey-blocking)

| Gap | Evidence / state | Why it matters | Complexity |
|---|---|---|---|
| **Parent / sponsor-facing view** | 0 references; no share/read-only mode | Parents fund and veto the decision; a calm, sourced, shareable "here's the real cost and chances" page is a conversion multiplier and on-brand (anti-agent). No PII risk if band-only. | Medium |
| **Nepali language** | English-only; no i18n (`i18n`=0, "locale" refs are grade-systems not UI language) | Parents/sponsors often don't read English comfortably; the *parent view* especially should be bilingual. Full-app i18n is heavy; a bilingual parent/cost view is targeted. | Med-High (full) / Low (parent view) |
| **PWA / installable** | No `manifest`, no service worker (verified 0) | MobileTabBar gives responsive web, but a home-screen install + offline-read of a saved plan suits a mobile-first, intermittent-connectivity audience. | Low-Med |
| **Scholarships how-to depth** | `ScholarshipsPanel` is a real curated *reference* list w/ sources (`select-scholarships.ts`), MV-58 shipped; MV-55 (application how-to) research-blocked | Already honestly partial; the gap is per-scholarship application steps, not existence. Correctly carded. | Med (research-bound) |
| **Accommodation** | 0 references | Post-offer need; agents monetize it. Reference-level links + on/off-campus explainer would extend the journey. | Low (reference) |
| **Human-escalation hatch** | 0 references; deliberate | Anti-consultancy brand means no agent handoff — but a stuck student with *no* "what if I'm still lost" exit may bounce anyway. A curated, non-commission "verified migration agent (MARN)" explainer (the plan already has `verify-agent-marn`) could be the honest hatch. | Low |

---

## Future (P3 — post-MVP / post-corridor)

- **Flights** (0 refs) — reference-tier only; low differentiation, agents don't own it. Defer.
- **Community / peer forum** (0 real refs) — high moderation + trust-safety cost; a Nepal→AU cohort feed is powerful but a v2+ bet, not MVP.
- **Third-party integrations** — VEVO/ImmiAccount status pull, Gmail outcome capture (already researched + rejected for MVP per memory), university-portal deep links. Gated on MV-08 legal work; correctly deferred.
- **Multi-corridor** — out of scope until the AU journey is reliable. The current architecture only partially supports it: source/destination IDs exist, but profile adapters, financial rules, namespaces, and copy are hardcoded to Nepal→Australia.

---

## What is NOT a gap (checked, to prevent false "missing" findings)

- **CoE / offer handling exists** at guidance depth: plan kinds `accept-offer`, `get-coe`, `arrange-oshc` (`lib/plan/generator.ts`), and `coe`/`offer-letter` are `DocumentKind` slots in the vault. It's guidance + a document slot, not a tracker — real but shallow (see C3).
- **Visa lodgement guidance is good:** `lodge-subclass-500` (`generator.ts:377-381`) names ImmiAccount, the self-lodge path, and the AUD 2,500 fee (hedged/sourced). This is genuinely helpful copy — the gap is interactivity/tracking, not knowledge.
- **Biometrics / health / police cert** are covered as sequenced, post-lodgement plan steps (`generator.ts:264-292`). Good.
- **Scholarships** are not absent — a sourced reference list ships today; only the how-to is blocked (MV-55).
- **Outcome capture** is live for self-reporting. Database-enforced integrity, verification, consent, and calibration remain blocked; those are the gap.

---

## Consolidated feature-priority matrix

| Feature/gap | Tier | Why / user value | Business value | Complexity | Timing |
|---|---|---|---|---|---|
| Correct match input/field/budget semantics | Critical | Prevents wrong life/financial decisions | Core trust and conversion quality | M | **MVP blocker** |
| Accurate privacy/AI/deletion/verification disclosure | Critical | Informed consent and an honest mental model | Legal/trust launch gate | M + founder/legal | **MVP blocker** |
| Anonymous retention purge/deletion | Critical | Real control over sensitive data | Reduces privacy liability | M | **MVP blocker** |
| Outcome integrity boundary | Critical | Preserves truthful application history | Makes future calibration/B2B possible | M–L | **MVP blocker for outcomes; beta can hide it** |
| Email/magic-link/result delivery | Critical | Saves/retrieves work without Google; reminders | Claim conversion and retention | M | **MVP** |
| Course/family funding planner | Critical | Answers “how much in NPR, by when?” | Differentiated sponsor value | M | **MVP** |
| Relevant curated catalogue depth | Critical | Avoids unrelated matches; enables real comparison | Product credibility/SEO | L + research | **MVP narrow scope** |
| Journey-scoped application tracker | Important | Deadlines, offers, CoE, documents in one place | Retention and consultancy replacement | L | Before broad launch |
| Genuine Student evidence workspace | Important | Helps assemble truthful evidence without ghostwriting | Premium review/differentiation | L | Before broad launch |
| Reach/unsupported off-ramp | Important | Gives highest-need users improvement/pathway options | Trust and referrals | M | MVP or next month |
| Policy/deadline/change reminders | Important | Provides a legitimate reason to return | Retention | M | After email + freshness |
| Verified outcome ingestion/calibration | Important | Evidence of what happened to similar profiles | Long-term moat/analytics | XL + time/data | Post-beta |
| Pre-departure/arrival hub | Important | Continues support after grant | Retention + partner surface | M initially | Next month/post-launch |
| Human/licensed escalation | Important | Handles edge cases safely | Service revenue without pretending automation is enough | M–L ops/legal | Later |
| Scholarship eligibility/workflow | Important | Converts references into actionable funding options | Acquisition/retention | M–L research | Later MVP |
| Parent/sponsor summary + Nepali labels | Nice | Supports the actual family decision | Sharing/conversion | M | Next month |
| PWA/offline checklist | Nice | Useful on intermittent/low-cost mobile data | Retention | M | Post-launch |
| Accommodation/jobs/community | Future | Supports settlement and lived experience | Marketplace/network potential | L–XL | Post-PMF, staged |
| Native app | Future | Only valuable after repeat behaviour exists | Distribution/retention at scale | XL | Not before PMF |
| Multi-country | Future | Expands market | Revenue/scale | XL + data ops | After Nepal→AU PMF |

**Never build:** pay-to-rank; hidden sponsored recommendations; uncalibrated percentage visa/admission odds; raw lead sales; unlicensed immigration advice; automatic GS/SOP ghostwriting; or OCR that silently changes a verdict without explicit user review.

---

## Priority recommendation (student-outcome order)

1. **Correct the P0 promise/behaviour and matching defects first** (privacy/AI disclosure, deletion/retention, budget math, missing-as-zero matches, unsupported seasoning claim, English inputs).
2. **C2 — transactional email + result delivery/recovery.** Fixes a silent conversion leak and unblocks reminders.
3. **I1 — wire the sourced after-offer/arrival modules into a pre-departure panel.** Low implementation cost; meaningful journey extension.
4. **C3 — turn the status history into a real application tracker** (deadlines, offer/CoE state, per-app docs).
5. **C1 — build a Genuine Student preparation workspace** after the legal/content boundary is explicit.
6. **I5/I2 — funding calculator (NPR) + work-rights guidance** for the sponsor conversation.

The uncomfortable through-line: LandingPad is excellent at telling a student *whether* to go and *what's required*, and weakest at *helping them actually do the visa application and land* — which is precisely the labor a consultancy sells. Closing C1 + I1 + C3 is what makes "replace the consultancy" true rather than aspirational.
