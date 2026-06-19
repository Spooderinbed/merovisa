# MV-05 — Legal / disclaimer / data boundary

**Priority:** P1 (gate before public traffic)   **Owner:** founder + agent
**Goal:** Before any public traffic or monetization, the app has a verified "not
immigration advice" boundary, consent language, and a data-retention/deletion policy —
appropriate to a product that stores passports + bank statements and advises (often) minors.

## Context links
- Round-1 audit / Codex "what we're missing" §3.2: `docs/audits/2026-06-18-full-app-evaluation.md`
- Forward plan §3 (legal/compliance) + §5 Phase 2: `.claude/plans/tender-bouncing-locket.md`
- Storage/RLS for sensitive docs: `supabase/migrations/*`, `app/api/documents/*`

## Acceptance criteria
- [x] A clear, persistent "**This is a rules-based estimate, not immigration advice**" disclaimer near every verdict and on results/plan. — **DONE** (`VerdictDisclaimer` on VerdictCard → results + dashboard snapshot; tailored copy on matches + plan pages).
- [ ] Consent language at the point we collect sensitive documents (passport, bank statement). — **DEFERRED** (entangled: the consent text must reference a Privacy Policy that does not exist yet, and recording `consented_at` needs a prod migration. Rides with the founder's retention-policy decision below.)
- [~] A stated data-retention + deletion policy, and a working deletion path (user can delete their data). — **deletion path DONE** (`POST /api/account/delete` + profile "Delete your account" control); **retention/deletion POLICY TEXT = founder/lawyer.**
- [ ] An under-18 handling decision (we advise minors) — documented, lawyer-reviewable. — **FOUNDER/LAWYER** (parked; no code can decide this).
- [x] Copy stays honest about the cold-start limit: verdicts are estimates, not validated outcomes (until MV-08 exists). — **DONE** (disclaimer copy: "not a guarantee of any visa or admission outcome").

## Test plan
- Component tests asserting the disclaimer renders on verdict/results/plan surfaces.
- A test for the deletion path (data is actually removed).

## Integration gate
`npm run typecheck` · `npm run lint` · `npm test`

## Dependencies / blocked-by
- **Founder decision** on the legal text and the under-18 stance (this card has a non-code component — a lawyer-reviewed boundary). The engineering (disclaimer placement, deletion path) can proceed in parallel on a private branch.

## Risk notes
- This is a **hard gate before public launch / monetization**, NOT a blocker for private-branch engineering (MV-01/02/03/04 can ship first).
- Storing passports/bank statements without a retention/deletion policy is the highest-severity compliance exposure.

## Agent resume notes (cold start)
1. Inventory where verdicts/sensitive data appear (results, plan, documents upload).
2. Implement the disclaimer + consent + deletion path as code; flag the *legal wording* + under-18 stance as a founder/lawyer decision (don't invent legal text).

## Decision log
- 2026-06-18 — Created. Codex: not a blocker for private work, but a hard gate before public traffic.
- 2026-06-18 — Engineering slice built (agent). Codex re-consulted on sequencing: do the fully-ownable engineering (deletion path = highest-risk + cheapest while schema is clean; disclaimer = honest copy already in AC) now; park legal wording + under-18 for founder; MV-02 next. Consent-at-upload deliberately deferred (its text needs a Privacy Policy that doesn't exist yet + a prod migration for `consented_at`) rather than ship a checkbox pointing at a non-existent policy.

## Legal research (2026-06-20 — research fan-out, 4 gov-sourced agents)

Self-serve "workaround" research to author the parked legal copy. **I am not a lawyer — this is a
credible interim shield that materially lowers risk, not legal sign-off.** Sources: AustLII
(Migration Act 1958 ss275/276/280/281), ASQA/Dept of Education (ESOS), OAIC (APPs, small-business,
children). Full distilled findings in the workflow output; conclusions:

- **OMARA / s276 immigration assistance.** Run MyVisa strictly as general-info + a *banded* estimate
  (we already band ✓), modelled on the govt **Visa Finder** tool (the precedent that a
  non-individualised info tool is lawful, no OMARA registration). Must: output generic rules-based
  info only; state every result is an estimate, not advice/guarantee; direct case-specific users to
  an OMARA-registered agent or lawyer (link the OMARA register); carry accuracy/no-reliance-liability
  disclaimers; sell access to the *product*, not "a fee to assess your individual chances" (s281 = up
  to 10 yrs). **Never:** advice about the user's own application ("you should lodge 500"), guarantees
  or precise % ("95% chance"), holding out as an agent/lawyer, preparing/lodging forms, telling users
  what to write on GS statements, or contacting DHA. Strict liability (s280) — design so accidental
  drift can't happen.
- **ESOS / education agent.** MyVisa is **outside** the education-agent regime today (info-only, not
  recruiting, no provider consideration; s6BA triggers on recruiting/representing a CRICOS provider
  *for consideration*). Stay provider-neutral; take **no** provider commissions/referral fees tied to
  recruitment/enrolment/transfers; if monetisation ever touches providers → dated AU legal advice
  (regime is mid-reform: 2025 Act + Jan-2026 National Code amendment).
- **Privacy Act 1988 / APPs.** Build to **full** APP compliance now — do **not** rely on the
  small-business (<AUD 3M) exemption (defeated by sensitive-info handling + any referral model).
  Need: **APP 1** privacy policy (the 7 mandatory contents); **APP 5** just-in-time collection notice
  at the upload/wizard step (distinct from the policy); **APP 3.3** express, granular, per-category
  consent before collecting sensitive info (passport / bank statements / academic records) — not
  bundled into "I accept the Terms"; **APP 9** never use a passport number as our identifier/PK
  (attribute only); **APP 8** cross-border (Supabase/Vercel hosting region) disclosed; **APP 11.1**
  security (encryption + RLS ✓); **APP 11.2** retention + destruction once no longer needed; **NDB**
  breach-response plan (30-day assessment clock).
- **Under-18 (minors).** No fixed age of consent in the Act (OAIC: capacity, generally 15+).
  **Recommended stance: 16+ self-serve + guardian-gated under-16; capture DOB at sign-up (not an
  18+ checkbox).** 16–17 self-serve with capacity presumed but a separate plain-language consent
  before any passport/bank upload; under-16 require verified guardian consent. Short retention +
  deletion path (we have the deletion path ✓). Design toward the draft **Children's Online Privacy
  Code** (registration due 10 Dec 2026) — cite as direction, not settled law.

## Copy packet plan + founder decisions (2026-06-20)

Deliverable = a **copy packet for founder sign-off BEFORE wiring any pages** (founder reviews copy
closely). Then wire `/privacy` + `/terms` + footer links + an APP 5 collection-notice at upload.
Packet to draft: (1) **Privacy & data-retention policy** (APP 1 seven contents + retention +
deletion + cross-border + breach); (2) **Terms of Service** (not-immigration-advice + not-an-agent +
no-guarantee + accuracy/no-reliance-liability + governing law); (3) tightened **not-advice
disclaimer** (fold in "estimate, not advice; legislation + the decision-maker decide; see an OMARA
agent/lawyer for your case"); (4) **under-18 stance** statement.

**Founder must decide before wiring:** (a) **under-18 stance** — recommended **16+ self-serve,
guardian-gated under-16** (vs 18+-only, simpler but loses real 17-yr-old applicants); (b) the
**retention period** for uploaded sensitive docs (e.g. delete N days after assessment expiry / on
inactivity); (c) **business identity + contact** for the policy (legal entity name, contact email,
jurisdiction/governing law). I'll draft the full copy with the recommended defaults and present it.

## Copy packet DRAFTED + Codex-reviewed (2026-06-20) — awaiting founder sign-off

**Packet:** `docs/legal/2026-06-20-mv-05-legal-copy-packet.md` — full text for review:
(1) tightened **not-advice disclaimer** (short + tailored + footer forms); (2) **at-collection
notice + consent** copy (APP 5 + APP 3.3, shown at upload); (3) **Privacy & data-retention
policy** (`/privacy`, seven APP 1 contents + retention + APP 8 cross-border + NDB + access/
complaint); (4) **Terms of Service** (`/terms`, not-advice + not-an-agent + provider-neutral/
no-commissions + no-guarantee + accuracy/no-reliance + governing law); (5) **under-18 stance**.

**Codex (GPT-5) adversarial review folded** (5 blockers + 6 should-fixes): added the missing APP 5
notice copy; fixed advice-drift in Privacy §3 (general info, not personalised advice); fixed the
disclaimer's DHA/admission conflation (DHA decides visas, institutions decide admission); softened
two overclaims ("full APP compliance" → "drafted to the APPs, operative compliance depends on the
wired flows"; "lawyer edits wording not architecture" → a goal, not a legal conclusion); added
complaint-handling (30 days), named the likely overseas country (Vercel/US), clarified minor
consent is plain-language + guardian-account ownership, removed the automated-decision claim, and
made provider-neutrality user-facing. Codex confirmed the D1/D2/D3 **recommended defaults are sound**.

**Founder decisions (2026-06-20):** **D1 ✅ DECIDED — 16+ self-serve, under-16 guardian-gated,
DOB at sign-up** (chosen recommended). **D2 ✅ DECIDED — retain until account deletion (no
automatic time-based deletion)**; packet Privacy §7 reworded to this posture + an eyes-open APP 11.2
reviewer note (weakest data-minimisation posture for sensitive docs; an inactivity sweep is the
low-cost future hardening). **D3 ⛔ STILL NEEDED — legal entity name + privacy contact email +
governing-law jurisdiction (+ confirm Vercel region).**

**Copy sign-off:** founder delegated approval to Codex 2026-06-20 → **Codex verdict APPROVED-WITH-NITS**
(OMARA + ESOS + APP + under-18 boundaries all hold; D2 defensible as written). Nits applied: removed
the internal `[D1]` marker, linked the OMARA register, softened "when you delete, we delete", named
the likely overseas country, etc.

**WIRED 2026-06-20 (shipped to master):** the tightened, Codex-approved **not-advice disclaimer**
(`NOT_ADVICE_DISCLAIMER` + the matches/plan tailored variants) now names the real decision-makers
(DHA for the visa, each institution for admission) and routes case-specific questions to an OMARA
agent/lawyer — live on results/dashboard (VerdictCard), matches, and plan. TDD (+1 test); gate green
(typecheck/lint/1171 tests).

**Card stays Blocked** on the remainder: **(a) founder supplies D3** (legal entity name + contact
email + governing-law jurisdiction + confirm Vercel region) — required before the `/privacy` +
`/terms` pages can publish (won't fabricate a legal entity/governing law for a live legal doc); then
those static pages + footer links; **(b)** the consent/DOB/guardian sub-slice (its own card — needs
founder DB approval for the `consented_at`/`consent_version`/DOB migration).

## Done evidence

**Engineering slice — DONE locally (NOT pushed; awaiting founder GO + review). Gate green: typecheck clean, lint 0 errors, 1098/1098 tests (was 1086, +12).**

1. **Not-immigration-advice disclaimer** — `components/ui/verdict-disclaimer.tsx` (`VerdictDisclaimer` + exported `NOT_ADVICE_DISCLAIMER`). Placed on:
   - `components/results/verdict-card.tsx` → covers the anonymous **results** page + the **dashboard** snapshot (both reuse VerdictCard).
   - `app/(app)/matches/page.tsx` (tailored: "Program matches are rules-based estimates… not immigration advice").
   - `app/(app)/plan/page.tsx` (tailored: "ranked by rules-based impact estimates, not immigration advice").
   - Tests: `tests/components/ui/verdict-disclaimer.test.tsx` (3), + assertions added to `verdict-card`, `matches-page`, `plan-page` tests.
2. **Right-to-delete path** — `app/api/account/delete/route.ts` (`POST`): same-origin CSRF check (mirrors `/auth/signout`) → removes Storage objects from the private `documents` bucket → deletes every owned row (`plan_items`, `user_program_state`, `documents`, `profiles`, `assessments`; `leads` cascades via assessments) → deletes the auth identity (`admin.auth.admin.deleteUser`) → signs out. Idempotent (scoped by `owner`), so retry-safe; **surfaces partial failure as 500 with `failedSteps`, never `ok:true` on a partial delete** (honors the MV-02 no-silent-failure principle).
   - UI: `components/account/delete-account-section.tsx` — type-"DELETE"-to-confirm control, mounted in `app/(app)/profile/page.tsx` ("Delete your account").
   - Tests: `tests/api/account/delete.test.ts` (5: full delete, no-docs, partial-failure→500-no-signout, cross-origin→403, 401) + `tests/components/account/delete-account-section.test.tsx` (3: confirm-gating, posts when armed, surfaces error).

**PARKED — founder/lawyer (card cannot reach Done until these land):**
- Final legal wording for the disclaimer + a real **data-retention/deletion policy** + **ToS / privacy policy** page.
- **Under-18 handling stance** (we advise minors).
- **Consent-at-upload** sub-slice (unblocks once the privacy-policy text exists; then add `consented_at`/`consent_version` via migration + a consent gate on `components/documents/document-card.tsx`).

**Not browser-verified:** disclaimer surfaces are auth-gated (matches/plan/profile) or wizard-gated (results); the page modules are executed + rendered in the passing suite, so the render path is covered. A visual pass can be done on request.
