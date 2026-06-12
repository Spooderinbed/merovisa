# Verify-MARN step — checklist row + plan action (slice ⑤)

**Date:** 2026-06-13 · **Status:** user-approved (shape + copy package A + placement) · **Lane:** value-triage / trust-maintenance
**Origin:** the slice-③ working-with-agents fast-follow (spec `2026-06-12-working-with-agents-gov-core-design.md`:
"the actionable 'verify your agent's MARN before paying' step"). User's design call (2026-06-13): conditional-framed
but always available; **no new profile field** (extra UI/state for a question most users may skip); the step exists
as trust guidance and non-agent users dismiss it; plan remains completion authority; source G.077 / OMARA register;
no scoring/golden changes.

## Shape

- **Checklist row** (`lib/checklist/generator.ts`): key `agent-marn`, `kind: null` + `infoKind: "step"`
  (info row — the mapped-keys-are-kind-null rule), label **"Agent registration check"**, `group: "visa"`,
  **`stage: "now"`** (you verify before paying anyone — not after an offer), **`requirement: "recommended"`**
  (conditional guidance, not a visa requirement). Source = the module's `verify-marn` row
  (`AU_WORKING_WITH_AGENTS`, G.077 → the OMARA portal search URL).
- **Plan item** (`lib/plan/generator.ts`): new kind `verify-agent-marn` in a
  `primaryDestinationId === "australia"` block; `impact: "medium"`; no `liftEstimate` (no honest lift claim;
  GS/NOC precedent); `timeEstimate: "10 minutes"`. Appended **last** in `VISA_PREP_KINDS`
  (GS-leads stays the section's deliberate order; conditional guidance doesn't displace universal requirements).
- **Mirror**: `CHECKLIST_PLAN_LINKS` gains `"agent-marn": "verify-agent-marn"` — the plan is the single
  completion authority; a dismissed plan row unlinks the checklist row, whose conditional framing still reads
  correctly (this is the user's "non-agent users can dismiss it").

## Copy (user-locked, package A — composed from G.084 + G.077 + G.075, all already `used`)

- Plan title: **"If you're using an agent, verify their MARN"**
- Plan body: **"If you pay for immigration help, DHA's own guidance is to use a registered migration agent
  listed with OMARA. Confirm your agent on the OMARA public register — search it by their MARN (Migration
  Agent Registration Number) — before you pay or sign anything. Not using an agent? Dismiss this step — you
  can apply for the visa yourself."**
- Checklist note: **"If you're using an agent, confirm them on the OMARA public register (search by MARN)
  before paying — DHA's guidance for anyone charging for immigration help."**

## Guardrails

- **Zero ledger movement**: G.075/G.077/G.084 are already `used` via `au-working-with-agents`; no findingRefs
  change anywhere → no FLIP_STATUS run. No scoring change, no version bumps, goldens byte-identical.
- Locks-first: the `CHECKLIST_PLAN_LINKS` exact-map pin extended RED → implement GREEN; copy-locks pin the
  three strings; plan-links invariants (emitted key / kind-null / real visa-prep kind) cover the new entry
  automatically. Plan/checklist are auth-gated surfaces — copy-locks are the proof (④·3b/③c precedent).
- WIP trio untouched; explicit `git add` paths; normal gates.
