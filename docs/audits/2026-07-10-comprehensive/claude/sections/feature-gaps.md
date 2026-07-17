# Feature Gap Analysis — LandingPad (Nepal → Australia)

**Auditor role:** Senior PM. **Date:** 2026-07-10. **Lens:** student outcome (journey completeness + reliability), not coverage %.

## Framing

The north star is that the app *replaces the local consultancy*. So the correct question for every gap is not "does a competitor have this feature" but "does the absence of this feature bounce a Nepali student back to an agent?" I graded on that. A student's real journey is: **assess → shortlist → apply → get offer → accept + pay → get CoE → arrange OSHC → write GS/GTE answers → lodge Subclass 500 → biometrics/health/police → visa grant → pre-departure → arrival → settle + work.** LandingPad today is genuinely strong on the *front half* (assess → shortlist → readiness guidance) and thins out sharply at exactly the point where students most fear making a mistake and most reach for a consultancy: **the visa application itself and everything after the offer.**

A recurring and important pattern: **much of the "after-offer" knowledge already exists as sourced data modules but is never rendered.** `lib/data/source/au-arrival-cash-guidance.ts`, `au-student-transport-concessions.ts`, `nepal-forex-cards.ts`, and `lib/data/policy/au-student-visa-limits.ts` (part-time work rules) all carry provenance and pass freshness tests, yet **zero components import them** (verified: `grep -rl` over `components/`+`app/` returns 0 for each). The founder is paying the maintenance cost of this data with none of the student benefit. That is the cheapest cluster of wins in this report.

---

## Critical gaps (P0 — journey-breaking; a student cannot self-serve past this point)

### C1. No GTE / Genuine Student authoring help — only a paragraph that says "draft yours early" (P0)
The GS statement is the single highest-leverage, highest-anxiety artifact for a Nepali applicant and the most common refusal driver. Today the entire product response is **one block of explanatory copy** in `lib/plan/generator.ts:215-219` (`prepare-gs-answers`): it correctly describes the requirement, the word limit, and that PR intent is allowed — then tells the student "Draft yours early; they anchor your whole application." There is **no drafting surface, no per-question prompts, no evidence-mapping, no review, no examples.** The guide chat *could* help, but its system prompt (`lib/guide/system-prompt.ts`) hard-rule #3 forbids writing submissions. So the product explicitly refuses at the exact moment the consultancy earns its fee. **This is the #1 reason a student who used LandingPad still pays an agent.** User value: enormous. Business value: this is the moat, not MV-08. Complexity: medium-high (structured questionnaire + guardrailed drafting that assists without "writing the application" — a real policy/legal line to walk). **MVP-critical.**

### C2. No email whatsoever — the 3-day expiry has no reminder (P0)
There is **no transactional email in the codebase** (verified: `grep -rilE "resend|sendgrid|nodemailer|smtp|postmark|mailgun"` over `lib/`+`app/` = 0 hits). The only email touchpoint is Google OAuth (Supabase-side) and the `leads` table which *captures* an email but never sends to it. Consequences: (1) the 3-day assessment expiry (`ASSESSMENT_TTL_DAYS`, `lib/assessments/expiry.ts`) — the app's core urgency-and-conversion lever — fires **silently**; a student who doesn't return within 72h loses their results with no warning and no recovery path (anon recovery is Google-claim-only). (2) No "your document expires," no "intake deadline approaching," no re-engagement. For a funnel whose entire conversion thesis rests on urgency, having no way to *deliver* that urgency is a structural hole. Complexity: low-medium (Resend/Supabase + a cron). **MVP-critical** — this is a conversion bug disguised as a missing feature.

### C3. Application submission & tracking is a status dropdown, not a tracker (P1→P0 for the north star)
A student applying to 4-6 programs juggles per-university portals, deadlines, document requirements, and offer/CoE states. LandingPad offers only `user_program_state` with three values — `shortlisted | applied | withdrawn` (`components/matches/shortlist-button.tsx:5`). There is **no per-application deadline, no submitted-date, no portal link, no offer-received/CoE-received state, no per-application document status.** The `OutcomeFunnel` renders an applied→offer→visa lineage, but the tables that back it (`outcome_events`, `application_attempts`, `program_predictions`) are **inert — no write path exists** (MV-08, blocked). So a student mid-applications gets a shortlist with a status pill and nothing that reduces the cognitive load a consultancy currently absorbs. **This is where "replace the consultancy" is won or lost.** Complexity: medium. **MVP for the north star.**

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
The engine gates on the DHA capacity floor and the plan walks source-of-funds / seasoning / remittance / sponsor income (MV-56 shipped). But there is **no interactive cost/loan calculator, no "how much do I actually need, in NPR, by when" planner, and `nepal-forex-cards` is orphaned.** Funding is the #1 sponsor conversation and a top refusal cause; an editable total-cost + funding-gap tool (tuition + OSHC + living + visa fee + travel, in NPR) would directly serve the sponsor who signs the cheque. Complexity: medium. **MVP-adjacent.**

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
- **Multi-corridor** — architecture supports it; out of scope until the AU journey is complete (correct).

---

## What is NOT a gap (checked, to prevent false "missing" findings)

- **CoE / offer handling exists** at guidance depth: plan kinds `accept-offer`, `get-coe`, `arrange-oshc` (`lib/plan/generator.ts`), and `coe`/`offer-letter` are `DocumentKind` slots in the vault. It's guidance + a document slot, not a tracker — real but shallow (see C3).
- **Visa lodgement guidance is good:** `lodge-subclass-500` (`generator.ts:377-381`) names ImmiAccount, the self-lodge path, and the AUD 2,500 fee (hedged/sourced). This is genuinely helpful copy — the gap is interactivity/tracking, not knowledge.
- **Biometrics / health / police cert** are covered as sequenced, post-lodgement plan steps (`generator.ts:264-292`). Good.
- **Scholarships** are not absent — a sourced reference list ships today; only the how-to is blocked (MV-55).
- **Outcome capture** is carded (MV-08) and legally blocked, not overlooked.

---

## Priority recommendation (student-outcome order)

1. **C1 — GTE/GS authoring assistant.** The one feature that most directly replaces the agent. Highest strategic value; do the legal/policy thinking now.
2. **I1 — wire the four orphaned after-offer/arrival modules into a pre-departure panel.** Near-zero cost, closes the journey's back half, stops the "landing support" bounce.
3. **C2 — transactional email + expiry reminder.** Fixes a silent conversion leak; unblocks I3.
4. **C3 — turn the shortlist into a real application tracker** (deadlines, offer/CoE state, per-app docs).
5. **I5/I2 — funding calculator (NPR) + surface work rules** for the sponsor conversation.

The uncomfortable through-line: LandingPad is excellent at telling a student *whether* to go and *what's required*, and weakest at *helping them actually do the visa application and land* — which is precisely the labor a consultancy sells. Closing C1 + I1 + C3 is what makes "replace the consultancy" true rather than aspirational.
