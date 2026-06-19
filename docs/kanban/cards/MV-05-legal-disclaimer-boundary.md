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
