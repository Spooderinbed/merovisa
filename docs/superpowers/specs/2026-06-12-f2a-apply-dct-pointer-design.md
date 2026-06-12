# F2-A apply (④·3e) — DCT pointer + permanent closures

**Date:** 2026-06-12 · **Status:** user-approved (a1+b+c; a2 declined for now) · **Lane:** value-triage / trust-maintenance
**Origin:** the F2-A research brief's proposal (`docs/research/2026-06-12-nepal-ssvf-financial-scrutiny.md`),
decided by the user 2026-06-12: ship the gov-grounded Document Checklist Tool pointer; keep seasoning in
our-recommendation voice permanently; permanently reject the stronger unsourced wording; do **not** ship the
dated sector-attributed evidence-level line (it stays in the brief + ledger as C.145/C.147).

## The one product copy change (user-locked wording)

A fourth `<li>` in `components/matches/policy-banner.tsx`, directly under the scrutiny line it companions
(the banner renders on results + matches):

> DHA's **Document Checklist Tool** shows exactly what to attach for your passport country and provider.

"Document Checklist Tool" is a `SourceAnchor` link → `https://immi.homeaffairs.gov.au/visas/web-evidentiary-tool`,
with a new `"policy-banner"` entry in the `SourceSurface` union (8th surface — the banner is its own surface,
distinct from the program-card `"matches"` one).

## Wiring (standard slice shape)

- New module `lib/data/policy/au-document-checklist-tool.ts`: one `Sourced` record, `findingRefs: ["C.146"]`,
  `lastVerified: "2026-06-12"` (page fetched substantively that day), **no** `reverifyBy` — the tool is a
  stable mechanism; the brief's volatile-tagging applied only to the declined a2 line.
- Zod schema + `DATA_MODULES` entry (category C).
- C.146 `value_status: "prose-only"` set **before** the flip (no USED_UNSET window), then
  `FLIP_STATUS=1 npx vitest run tests/data/flip-status.run.test.ts` promotes exactly C.146 pending→used.
- **C.147 stays pending/ready untouched** — the line does not render the non-publication claim, so it must
  not claim that ref.

## Permanent closures

- **Negative copy-locks** complete the c) rejections mechanically: `/Assessment Level/i` (already pinned
  absent on the banner), `/case officer/i`, and `/AUD 5,000/` asserted absent on the banner, plan-generator,
  and checklist-generator tests. The rejected strings cannot return without a RED test.
- **Ledger triage** (user-approved disposition, applied via `_tools/apply-triage.js`): C.145 → `use-later`
  ("a2 declined for now; revisit ~2026-09 cycle or if DHA publishes"); C.148 → `use-later` ("seasoning
  permanently recommendation-voice; row retained as recorded justification"). Both leave the
  needs-human-call queue; neither is rejected — they are the recorded justification.
- Packet F2 entry + status blockquote get the ④·3e closing note; PROJECT_STATUS backlog advances to
  **verify-MARN** (slice-③ fast-follow: the "verify your agent's MARN on the OMARA register before paying"
  checklist/plan step, G.077 already used).

## Guardrails

- No scoring change, no version bumps, goldens byte-identical (nothing near the engine).
- Internal `NEPAL_ASSESSMENT_LEVEL` / seasoning constants in `lib/programs/policy.ts` untouched
  (④·3b "engineering labels" call).
- Locks-first TDD: pin the new line RED → edit GREEN. WIP trio untouched. Normal gates
  (suite / typecheck / lint / reconcile / schema / findings-integrity / flip-status guard).
