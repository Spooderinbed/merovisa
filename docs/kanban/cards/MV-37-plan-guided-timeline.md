# MV-37 — Rework "My plan" into a guided sequential timeline

**Column:** Backlog · **Priority:** P2 · **Owner:** founder+agent · **Gate:** founder design sign-off (DESIGN-FIRST)
**Created:** 2026-06-24
**Related:** SUPERSEDES the framing of [[MV-23]] (which shipped "this is your action queue — *not* a strict
timeline" copy); couples with [[MV-27]] (mirrored rows) and [[MV-38]] (the dashboard "next step" inherits plan
order). Evidence: product-review audit `wf_5fb5dfa7-009` (2026-06-24).

## Founder decision (2026-06-24)

> "We need this to be a timeline for students on what to do next — as we are guiding them."

This is a deliberate product reversal. MV-23 part 1 framed the plan as an **impact-ranked action queue** and
explicitly told students it is *not* an ordered timeline. The founder now wants the opposite: a **guided,
sequential "what to do next, in order"** journey. MV-37 is the vehicle; MV-23 stays Done (its framing is
superseded, not reopened).

## Current state (what exists today)

- `components/plan/plan-list.tsx` renders two groups: **"Your next steps"** (impact-ranked: High/Medium/Low),
  and **"Visa preparation"** (the ONLY genuinely sequential section — sorted by `visaPrepOrder` over a
  hand-curated order in `lib/plan/phases.ts`).
- Within an impact band, items are sorted **newest-created-first** (`lib/plan/select.ts:17-20`) — an
  implementation artifact for dashboard/plan agreement, NOT a student-meaningful order.
- Copy currently says "action queue" (the framing to replace).

## Design questions to settle BEFORE building (founder + brainstorm)

1. **What defines "next"?** Most likely a **phase/journey model**, extending the `phases.ts` ordering principle
   from visa-prep to the whole plan. Candidate phases: Build profile / grades → Shortlist programs → Sit
   English test → Gather academic + financial documents → Proof of funds → Apply to programs → Receive CoE →
   Lodge visa → Visa decision.
2. **Strict linear vs phase-grouped-with-priority-inside?** A pure 1→N list is simplest to follow but brittle
   when steps are parallelizable; phase-grouped keeps guidance while allowing within-phase ordering.
3. **Items with no natural sequence position** (profile gaps, optional uplifts) — where do they sit?
4. **How does completion advance the timeline?** (current/next-step emphasis, progress affordance.)
5. **Copy:** replace "action queue" with timeline framing; keep the checklist = per-program reference framing.

## Design refinement — 2026-06-25 (founder steer: parallel tracks; Codex-triangulated realistic Nepal→AU POV)

Founder pushback on the first spine: *"English test can be done while gathering documents — we need to think
more about this whole sequence from a student and realistic POV."* Correct. A strict 1→N list misrepresents
reality: several steps have **no dependency on each other** and run concurrently. Codex (GPT-5) domain pass
surfaced one correction that reorders the whole critical path, plus a Nepal-specific long-lead step we'd missed.

**The load-bearing correction: English is a CoE gate, not an APPLY gate.** Australian unis routinely issue a
**conditional offer** and let the student clear English before the CoE is issued. So a student *without* an
IELTS/PTE result can still apply, receive a conditional offer, accept, and pay a deposit — English clears in
parallel before offer→CoE. Building the timeline as "sit English → then apply" falsely blocks a large share
of students at the English step and loses them.

**Revised model — phase-grouped, sequential between phases, PARALLEL within a phase (the hybrid, not 1→N):**

- **A · Decide** — build profile (grades, English level, finances) → verdict [today's app] → shortlist programs.
- **B · Apply** *(parallel; applying does NOT wait on English)* —
  - **Gather + attest academic documents** — Nepal-specific long-lead: MoEST → MoFA → Australian Embassy
    attestation, **~3–8 weeks**, often the real bottleneck (not English). Flag "start now."
  - **Sit English test** (IELTS/PTE) — book early; needed to clear a conditional offer (→ CoE), **not** to apply.
  - **Draft SoP** (the application statement of purpose — distinct from the visa GS form, see below).
  - **Submit applications** → receive offer (conditional if English still pending).
- **C · Confirm your place** — clear offer conditions (English) → accept offer → **pay deposit** → receive **CoE**.
- **D · Visa prep** *(parallel; all consumed at Subclass 500 lodgement)* —
  - **Financial evidence / proof of funds** (~AUD 29,710 living + tuition + travel) — **visa-stage only**;
    universities do NOT require it to apply or offer. This is why it felt out of place surfaced early ([[MV-38]]).
  - **OSHC** — must cover from course start date; evidence attached at lodgement.
  - **Health exam** (Home Affairs panel physician; ~12-mo validity) — best done pre-lodge.
  - **Police certificate** (Nepal Police, Interpol) — **~6-mo validity, don't start too early** or it expires.
  - **GS statement** — the Department's own format (post-Nov-2023, replaced GTE); **≠ the SoP** sent to the uni.
  - **Lodge Subclass 500**.
- **E · Visa decision** — granted / further-info / refused.

**Answers to the design questions:**
1. *What defines "next":* the **phase model above** (5 phases A–E), extending `phases.ts`'s ordering principle
   from visa-prep to the whole journey.
2. *Strict vs hybrid:* **hybrid** — gates are hard *between* phases (offer → clear-conditions → CoE → lodge →
   decision); *within* a phase, tasks are parallel and the student picks order. Long-lead tasks (attestation,
   English) carry a "start early" nudge.
3. *No-sequence items:* profile gaps / optional uplifts attach to **Phase A** as non-gating "strengtheners,"
   never as blocking timeline steps.
4. *How completion advances:* the **current phase = the earliest phase with an unmet gate**; within-phase tasks
   tick independently with a progress affordance ("2 of 4"). The dashboard "next step" = highest-impact
   incomplete task **in the current phase** — so proof-of-funds only surfaces once the student reaches Phase D
   (this is the clean fix for [[MV-38]]; [[MV-27]] mirrored rows fold into the per-phase view too).

**Still a founder call before build:** confirm the A–E spine + the hybrid (parallel-within-phase) model; whether
to show the realistic long-lead callouts (attestation ~3–8 wks, police 6-mo validity, OSHC-from-course-start);
and how literal to be about conditional offers (English as a CoE gate) without overwhelming a first-time student.

## Codex (GPT-5) review — 2026-06-25: NO-GO as specified · conditional GO

Verdict: the guided-timeline direction is right, but the spine above has **specification errors**. Build only
after these conditions are met. Severity-tagged:

- **BLOCKER · per-application state, not a global phase.** One student with 3 programs (one conditional offer,
  one shortlisted, one accepted) cannot share a single global phase. Track phase **per application**; derive the
  dashboard "primary track" from a user-nominated principal application. The "earliest-unmet-gate (global)" logic
  breaks the moment a 2nd program exists. *(This is the biggest architectural correction.)*
- **BLOCKER · next-step selector must exclude non-actionable tasks.** "Top task in the current phase" will
  surface tasks blocked on a provider response / waiting on an embassy / not-yet-valid-to-start. Add a
  `blocked / waiting / premature` exclusion so the recommended action is always something the student can do today.
- **BLOCKER · entry states.** Students who arrive with an existing IELTS, offer, or CoE must not be marched
  through prior phases — add "I already have…" completion states at onboarding/plan, or the timeline is hostile to
  the most action-ready users.
- **BLOCKER · proof-of-funds figure is mislabelled.** AUD 29,710 is the **living-cost benchmark**, not total
  financial capacity (capacity = first-year tuition + living + travel + any dependants). Label it "calculate your
  required financial capacity," don't show a single fixed number as "proof of funds." (Visa-stage placement is
  correct; the figure/label is not.) Folds into [[MV-38]]. Note: the MV-10 cost tab already composes the fuller
  band (tuition + 29,710 living + OSHC + visa = ~76.9k) — reuse that, don't surface 29,710 alone.
- **CONFLICT to resolve before build · the attestation chain.** The first domain pass called MoEST→MoFA→Embassy
  attestation a universal ~3–8wk Nepal gate; the Codex pass says it is **not** a universal DHA Sub-500 requirement
  and should be sourced **per-provider**, not hard-coded as a global phase step. **Do not assert either as fact
  (trust-first).** Resolution: the timeline must NOT hard-code requirement specifics — those already live in the
  per-program checklist (`lib/checklist/generator.ts` already emits NOC / biometrics / police cert / translations /
  GS / agent MARN). The timeline sequences/【references】the checklist; it does not re-source requirements. This is
  also the clean reframing of [[MV-27]] (the timeline is the scaffold; the checklist is the requirement reference).
- **VERIFY · Nepal MoEST study-permission / NOC** as a real hard gate around offer-accept → deposit/visa. It is
  already a checklist line; confirm placement in the phase sequence (Codex put it in Phase C). Verify against an
  authoritative source before presenting timing as fact.
- **CONDITIONAL tasks, not fixed phase-D items · police certificate + health exam.** Not universally required;
  validity windows matter (police ~6-mo, health ~12-mo). Render as conditional with explain-why copy
  ("do this now" / "don't do this yet"), driven by the student's intake date + requirement set.

**Smallest first increment Codex endorses** (avoid over-engineering): keep the existing plan items, but (1) group
them under the A–E phases via `phases.ts`, (2) replace newest-created-first ordering with phase order, (3) make the
"next step" selector actionable-only, (4) ship "I already have…" entry states. Defer per-application multi-track and
dynamic capacity to a second slice. Re-frame copy from "action queue" → guided timeline.

## Acceptance criteria (post design sign-off)

- [ ] The plan presents as an **ordered, guided journey** (sequenced/numbered or phase-stepped), not an
      impact-ranked list; copy says so.
- [ ] Ordering is student-meaningful (not newest-created-first); `lib/plan/select.ts` ordering reworked.
- [ ] "action queue" framing (MV-23) replaced; checklist cross-reference preserved.
- [ ] Goldens impact assessed: plan ordering likely does NOT touch the scorer — confirm byte-identical or
      regenerate deliberately.
- [ ] TDD RED→GREEN; full suite green.

## Resume notes (cold agent)

- DESIGN-FIRST: do not build before the founder signs off on the phase model (Q1–Q4). Run the brainstorming
  skill first.
- A journey model likely also resolves [[MV-27]] (mirrored visa-prep rows) and reframes [[MV-38]] (proof-of-funds
  as "the next step") — coordinate the three.
- Touch points: `components/plan/plan-list.tsx`, `lib/plan/select.ts` (ordering), `lib/plan/phases.ts` (extend
  to all phases), `lib/plan/generator.ts` (kinds → phases mapping). `lib/checklist/generator.ts` stays the
  per-program reference.
