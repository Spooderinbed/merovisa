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
- [ ] A clear, persistent "**This is a rules-based estimate, not immigration advice**" disclaimer near every verdict and on results/plan.
- [ ] Consent language at the point we collect sensitive documents (passport, bank statement).
- [ ] A stated data-retention + deletion policy, and a working deletion path (user can delete their data).
- [ ] An under-18 handling decision (we advise minors) — documented, lawyer-reviewable.
- [ ] Copy stays honest about the cold-start limit: verdicts are estimates, not validated outcomes (until MV-08 exists).

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

## Done evidence
_pending_
