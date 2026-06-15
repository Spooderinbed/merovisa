# Refusal / recovery extension — ART deepening (gov) — Design

**Date:** 2026-06-15
**Lane:** trust-defense (value-triage). Slice after provenance round 2.
**Surface:** `components/results/refusal-recovery.tsx` + data `lib/data/source/nepal-refusal-recovery.ts` (category I).
**Type:** data + presentation (no scoring). Goldens byte-identical expected — no scorer reads category I.

## Context

The `RefusalRecovery` panel is the lane's first trust-defense surface: four gov-sourced sections — why applications are refused, sector grant rates (HE vs VET), "if you're refused" (recovery paths), and "what not to trust". It is honest and comprehensive, but a refused student still can't see two things from it: **how long a review really takes at the tail**, **whether they're even allowed to apply**, and **what a review can actually result in**. The ART ledger (category I) already carries gov-sourced findings for all of this, triaged but unshipped.

This slice deepens the existing panel with ART/gov rows only. It does **not** touch scoring, the already-approved rows, or the gov-only sourcing posture.

## Scope

**In (7 rows, all ART/gov):**
- `I.049` — 95% of student refusal reviews finish within 2 years (tail companion to the existing `I.048` "50% within 19 months").
- `I.056` — the Department's decision letter tells you whether the decision is reviewable and whether you can apply.
- `I.053` / `I.054` / `I.055` — the three ART review outcomes (affirm / set aside & substitute / remit), as a new cohesive section.
- `I.052` — pre-1-June-2026 hearing-notice cases still get their hearing.
- `I.062` — the Tribunal can refer a matter for ministerial intervention.

**Out (explicit):**
- `I.063–I.070` — AHC Lawyers / Aussizz refusal-reason breakdowns. **Non-gov consultancy self-claims; stay `needs-human-call` / editorial.** Shipping them would put consultancy sources on a trust panel for the first time — the gov-only posture is preserved by design.
- No scoring change, no new analytics surface, no edits to the existing approved rows.

## Presentation (user-locked: option A)

Add a new discriminated `kind: "review-outcome"` and a fifth panel section **"What a review can result in"**, placed **between** "If you're refused" and "What not to trust". The `I.049/052/056/062` rows insert into the existing "If you're refused" section between existing rows; the existing rows keep their copy and relative order (no reorganizing).

`components/results/refusal-recovery.tsx` `SECTIONS` becomes:
1. refusal-ground — "Why applications are refused"
2. grant-rate — "Honest odds — by sector"
3. recovery-path — "If you're refused"
4. **review-outcome — "What a review can result in"** (new)
5. scam-warning — "What not to trust"

No section footnote on the new section (only `grant-rate` carries the VET guard).

## Exact copy (approved verbatim)

### New section — "What a review can result in" (`kind: "review-outcome"`)

| id | finding | label (link) | summary | source |
|---|---|---|---|---|
| `outcome-affirm` | I.053 | Decision stands | The Tribunal can affirm the refusal — it agrees with the original decision, so the refusal stands. | ART possible-outcomes |
| `outcome-set-aside` | I.054 | New decision | It can set the refusal aside and make a new decision in its place. | ART possible-outcomes |
| `outcome-remit` | I.055 | Sent back | It can remit the case — that means sending it back to the Department for a new decision. | ART possible-outcomes |

### Inserted into "If you're refused" (`kind: "recovery-path"`)

| id | finding | label | summary | array position | source |
|---|---|---|---|---|---|
| `recovery-can-apply` | I.056 | Can you apply? | Your refusal letter from the Department says whether the decision can be reviewed and whether you can apply. | before `recovery-review` (top) | ART immigration-and-citizenship |
| `recovery-hearing-transitional` | I.052 | Hearings already set | If you got a hearing notice before 1 June 2026, that hearing still goes ahead. | after `recovery-review` | ART change notice |
| `recovery-timeline-longtail` | I.049 | Longer cases | The long tail is real: 95% of these reviews finish within 2 years of applying. | after `recovery-timeline` | ART processing-times |
| `recovery-ministerial-referral` | I.062 | Ministerial referrals | In some cases, the Tribunal can refer a matter for ministerial intervention — this is separate from a normal appeal. | after `recovery-ministerial` | DHA ministerial-intervention |

## Sources (verified against the ledger 2026-06-15)

- `ART_OUTCOMES` (new const) = `https://www.art.gov.au/after-applying/possible-outcomes` — I.053/054/055.
- `ART_PROCESSING` (existing) = `…/processing-times` — I.049 (same page as I.048).
- `ART_IMMIGRATION` (existing) = `…/applying-review/immigration-and-citizenship` — I.056.
- `ART_CHANGES` (existing) = `…/changes-conduct-student-visa-reviews` — I.052.
- `IMMI_MINISTERIAL` (existing, display-representative) — I.062. The finding's own source is the DHA FOI PDF (`…/foi/files/2025/fa-250500998-document-released.PDF`); per the module's source-display pattern (cf. `ground-genuine-student` displaying `IMMI_GS` while `I.008` legislation rides in `findingRefs`), the row displays the student-facing ministerial page and carries `I.062` in `findingRefs`. All rows are prose-only, so reconcile's value-fidelity pass does not apply.

## Data model

Extend the `NepalRefusalRecovery["kind"]` union in `lib/data/types.ts`:
```
kind: "refusal-ground" | "grant-rate" | "recovery-path" | "review-outcome" | "scam-warning";
```
The `review-outcome` rows are prose-only (no `value`/`unit`/`sector`). All 7 new rows set `lastVerified: "2026-06-05"` (the category-I module date) and `provenance.findingRefs` to their single backing finding (I.062 carries only `I.062`).

## Build mechanics (established lane pattern)

1. **Triage promotion:** `I.052/053/054/055/062` are `use-later` → promote to `ready` via `node docs/research-briefs/_tools/apply-triage.js <report.json>` (assignments JSON in temp). `I.049/056` are already `ready`.
2. **value_status before flip:** set `value_status:"prose-only"` on all 7 findings **while still pending** (no `USED_UNSET` window — the engineered-out GS gap).
3. **Flip:** `FLIP_STATUS=1 npx vitest run tests/data/flip-status.run.test.ts` promotes the 7 pending→used; the flip clears `triage`. Verify by reading the JSONL, not the runner output. Expected ledger move: used +7, pending −7.
4. **build-ledger:** rerun `node docs/research-briefs/_tools/build-ledger.js` (derived markdown has no sync guard).
5. **reconcile + findings-integrity:** green — every new `findingRef` exists, is `used`, prose-only. Adversarial findingRef-drop should trip the coverage guard (`ORPHAN_USED`).
6. **Goldens:** byte-identical (no scorer reads category I) — confirm, no regeneration.
7. **Analytics:** reuse the existing `"refusal-recovery"` surface — no events.ts change.

## Test plan

- **Component (`tests/components/refusal-recovery.test.tsx`):**
  - The new section heading "What a review can result in" renders.
  - The three outcome rows render with their summaries; **copy-lock the plain remit line** ("send it back to the Department for a new decision") per the user directive.
  - The four inserted recovery rows render (assert "95%", "within 2 years"; "hearing notice before 1 June 2026"; "whether you can apply"; the I.062 ministerial-referral line).
  - Each new row exposes a `refusal-recovery` SourceAnchor to the mapped gov host.
- **Data/ledger:** reconcile + findings-integrity suites green; a focused test (or the existing module/coverage test) confirms the 5 kinds and that every `review-outcome` row is prose-only.
- **Full gate:** `npx vitest run` (suite grows by the new component assertions), `npm run typecheck`, `npm run lint`, `npm run build`. Goldens unchanged.

## Acceptance criteria

1. Panel shows five sections; "What a review can result in" lists affirm / new decision / sent-back in plain language; "remit" is explained as "sending it back to the Department for a new decision".
2. "If you're refused" gains the four inserted rows in the specified positions; the six existing rows are unchanged.
3. Every new row links to its gov source; gov-only posture preserved (no consultancy rows).
4. Ledger: 7 findings used (was pending), triage cleared, no `USED_UNSET`/`ORPHAN_USED`.
5. Goldens byte-identical; typecheck/lint/build green; copy-locks pin the new heading + the remit line.

## Out of scope / follow-ups

- Consultancy refusal-reason breakdowns (`I.063–070`) remain editorial (`needs-human-call`).
- `lib/matches/compute.ts:105` "6 months bank seasoning expected (Nepal AL3)" phrasing (flagged in the provenance round-2 reconciliation) is unrelated to this slice.
