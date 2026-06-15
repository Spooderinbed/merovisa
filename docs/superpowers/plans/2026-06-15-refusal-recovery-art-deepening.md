# Refusal / recovery extension — ART deepening (gov) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deepen the gov-sourced `RefusalRecovery` panel with seven ART/gov rows — a new "What a review can result in" section (affirm / new decision / sent-back) plus four rows inserted into "If you're refused".

**Architecture:** Add a `review-outcome` kind to the `NepalRefusalRecovery` discriminated union, append seven prose-only rows to the data module, and add one `SECTIONS` entry to the presentational panel. Then promote the backing findings in the research ledger (value_status → triage → flip) so the code-ref/used-set guard stays green. No scoring; goldens byte-identical.

**Tech Stack:** TypeScript, React (server component), Vitest + Testing Library; the research-ledger CJS tools (`apply-triage.js`, `flip-status.run.test.ts`, `build-ledger.js`).

**Spec:** `docs/superpowers/specs/2026-06-15-refusal-recovery-art-deepening-design.md`

**Lane rituals (apply throughout):** stage ONLY the exact files listed (never `git add -A/./-u`); preserve the WIP trio (`CLAUDE.md`, `tests/integration/wizard-to-results.test.tsx`, `docs/debugging/`) and the untracked audit `docs/audits/2026-06-14-mvp-promise-behavior-audit.md`; multi-line commit messages via `git commit -F - <<'EOF'`; commit directly to master with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.

**Ordering note:** The full suite goes green only after BOTH the code rows (Task 1–3) AND the ledger prep (Task 4) are done — the `flip-status` guard fails while code references not-yet-`used` findings. So there is ONE commit, after Task 5 verification. Tasks 1–3 verify at the component-test + typecheck level; Task 4 makes the whole suite green.

---

## File structure

- `lib/data/types.ts` — MODIFY: add `"review-outcome"` to the `NepalRefusalRecovery["kind"]` union (one line).
- `lib/data/source/nepal-refusal-recovery.ts` — MODIFY: add `ART_OUTCOMES` const + 7 rows (4 `recovery-path` inserted in position, 3 `review-outcome` appended before the scam-warning block).
- `components/results/refusal-recovery.tsx` — MODIFY: add the `review-outcome` entry to `SECTIONS` (between `recovery-path` and `scam-warning`).
- `tests/components/refusal-recovery.test.tsx` — MODIFY: update the section-count test to five; add copy-locks for the new rows (incl. the plain remit line) and source links.
- `docs/research-briefs/findings/I.jsonl` — MODIFY (via tools/temp script): set `value_status:"prose-only"` on the 7 findings; promote `I.052/053/054/055/062` triage→`ready`; flip the 7 pending→used.
- `docs/research-briefs/findings-ledger.md` — REGENERATE via `build-ledger.js` (derived).

---

## Task 1: Add the `review-outcome` kind to the type union

**Files:**
- Modify: `lib/data/types.ts` (the `NepalRefusalRecovery` interface `kind` field)

- [ ] **Step 1: Make the edit**

Find the `NepalRefusalRecovery` interface and change its `kind` line from:

```ts
  kind: "refusal-ground" | "grant-rate" | "recovery-path" | "scam-warning";
```

to:

```ts
  kind: "refusal-ground" | "grant-rate" | "recovery-path" | "review-outcome" | "scam-warning";
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no consumer breaks — the component's `SECTIONS`/`rowClass` accept the wider union; new rows added in Task 2).

---

## Task 2: Add the seven rows + `ART_OUTCOMES` const to the data module

**Files:**
- Modify: `lib/data/source/nepal-refusal-recovery.ts`

- [ ] **Step 1: Add the `ART_OUTCOMES` const**

After the existing `ART_PROCESSING` const declaration, add:

```ts
const ART_OUTCOMES = "https://www.art.gov.au/after-applying/possible-outcomes";
```

- [ ] **Step 2: Insert the four `recovery-path` rows in position**

In the "If you're refused" block, place `recovery-can-apply` **immediately before** the existing `recovery-review` row:

```ts
  {
    id: "recovery-can-apply",
    kind: "recovery-path",
    label: "Can you apply?",
    summary:
      "Your refusal letter from the Department says whether the decision can be reviewed and whether you can apply.",
    source: ART_IMMIGRATION,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["I.056"],
      source: ART_IMMIGRATION,
      note: "ART: the Department's decision letter states whether the Tribunal can review the decision and whether the applicant may apply (I.056).",
    },
  },
```

Place `recovery-hearing-transitional` **immediately after** the existing `recovery-review` row:

```ts
  {
    id: "recovery-hearing-transitional",
    kind: "recovery-path",
    label: "Hearings already set",
    summary: "If you got a hearing notice before 1 June 2026, that hearing still goes ahead.",
    source: ART_CHANGES,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["I.052"],
      source: ART_CHANGES,
      note: "ART: a student refusal review that received a hearing listing notice before the 1 June 2026 change keeps its hearing (I.052).",
    },
  },
```

Place `recovery-timeline-longtail` **immediately after** the existing `recovery-timeline` row:

```ts
  {
    id: "recovery-timeline-longtail",
    kind: "recovery-path",
    label: "Longer cases",
    summary: "The long tail is real: 95% of these reviews finish within 2 years of applying.",
    source: ART_PROCESSING,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["I.049"],
      source: ART_PROCESSING,
      note: "ART processing-times: 95% of student refusal reviews finalised 1 Nov 2025–30 Apr 2026 were finalised within 2 years of lodgement (I.049).",
    },
  },
```

Place `recovery-ministerial-referral` **immediately after** the existing `recovery-ministerial` row:

```ts
  {
    id: "recovery-ministerial-referral",
    kind: "recovery-path",
    label: "Ministerial referrals",
    summary:
      "In some cases, the Tribunal can refer a matter for ministerial intervention — this is separate from a normal appeal.",
    source: IMMI_MINISTERIAL,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["I.062"],
      source: IMMI_MINISTERIAL,
      note: "DHA FOI file fa-250500998: tribunal-initiated ministerial-intervention requests include those referred by the ART and former AAT (I.062). Displayed source is the student-facing ministerial-intervention page; the FOI finding rides in findingRefs (the slice G/I source-display pattern).",
    },
  },
```

- [ ] **Step 3: Append the three `review-outcome` rows**

Add these three rows **after** the last `recovery-path` row (`recovery-ministerial-referral`) and **before** the `scam-warning` block, so the array order matches the new section's position:

```ts
  // ── What a review can result in (ART possible outcomes) ──────────────────────
  {
    id: "outcome-affirm",
    kind: "review-outcome",
    label: "Decision stands",
    summary:
      "The Tribunal can affirm the refusal — it agrees with the original decision, so the refusal stands.",
    source: ART_OUTCOMES,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["I.053"],
      source: ART_OUTCOMES,
      note: "ART possible-outcomes: one outcome is to affirm the original decision (I.053).",
    },
  },
  {
    id: "outcome-set-aside",
    kind: "review-outcome",
    label: "New decision",
    summary: "It can set the refusal aside and make a new decision in its place.",
    source: ART_OUTCOMES,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["I.054"],
      source: ART_OUTCOMES,
      note: "ART possible-outcomes: one outcome is to set aside the original decision and substitute a new decision (I.054).",
    },
  },
  {
    id: "outcome-remit",
    kind: "review-outcome",
    label: "Sent back",
    summary: "It can remit the case — that means sending it back to the Department for a new decision.",
    source: ART_OUTCOMES,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["I.055"],
      source: ART_OUTCOMES,
      note: "ART possible-outcomes: one outcome is to remit the decision to the original decision-maker for reconsideration (I.055).",
    },
  },
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

---

## Task 3: Wire the new section into the panel + lock the copy (TDD)

**Files:**
- Modify: `components/results/refusal-recovery.tsx`
- Test: `tests/components/refusal-recovery.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `tests/components/refusal-recovery.test.tsx`, update the first test to assert five sections — rename it and add the new heading:

```ts
  it("renders the five gov-sourced sections", () => {
    render(<RefusalRecovery />);
    expect(screen.getByText(/Refusal risk & recovery/i)).toBeInTheDocument();
    expect(screen.getByText("Why applications are refused")).toBeInTheDocument();
    expect(screen.getByText(/^Honest odds/)).toBeInTheDocument();
    expect(screen.getByText("If you're refused")).toBeInTheDocument();
    expect(screen.getByText("What a review can result in")).toBeInTheDocument();
    expect(screen.getByText("What not to trust")).toBeInTheDocument();
  });
```

Then add three new tests at the end of the `describe` block:

```ts
  it("adds the 'What a review can result in' section with the three ART outcomes (remit in plain language)", () => {
    render(<RefusalRecovery />);
    expect(screen.getByText("What a review can result in")).toBeInTheDocument();
    expect(
      screen.getByText(/it agrees with the original decision, so the refusal stands/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/set the refusal aside and make a new decision in its place/i),
    ).toBeInTheDocument();
    // Plain-language remit, per the owner directive — exact copy-lock.
    expect(
      screen.getByText(
        "It can remit the case — that means sending it back to the Department for a new decision.",
      ),
    ).toBeInTheDocument();
  });

  it("adds the inserted ART recovery rows (eligibility, 2-year tail, transitional hearings, ministerial referral)", () => {
    render(<RefusalRecovery />);
    expect(
      screen.getByText(/whether the decision can be reviewed and whether you can apply/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/95% of these reviews finish within 2 years of applying/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/hearing notice before 1 June 2026, that hearing still goes ahead/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /the Tribunal can refer a matter for ministerial intervention — this is separate from a normal appeal/i,
      ),
    ).toBeInTheDocument();
  });

  it("links the new ART rows to their government sources", () => {
    render(<RefusalRecovery />);
    expect(screen.getByRole("link", { name: "Sent back" })).toHaveAttribute(
      "href",
      expect.stringContaining("art.gov.au/after-applying/possible-outcomes"),
    );
    expect(screen.getByRole("link", { name: "Longer cases" })).toHaveAttribute(
      "href",
      expect.stringContaining("art.gov.au"),
    );
    expect(screen.getByRole("link", { name: "Ministerial referrals" })).toHaveAttribute(
      "href",
      expect.stringContaining("immi.homeaffairs.gov.au"),
    );
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/components/refusal-recovery.test.tsx`
Expected: FAIL — the new section heading and rows are not rendered yet (the `SECTIONS` array has no `review-outcome` entry).

- [ ] **Step 3: Add the `SECTIONS` entry**

In `components/results/refusal-recovery.tsx`, change `SECTIONS` to:

```ts
const SECTIONS: { kind: NepalRefusalRecovery["kind"]; heading: string }[] = [
  { kind: "refusal-ground", heading: "Why applications are refused" },
  { kind: "grant-rate", heading: "Honest odds — by sector" },
  { kind: "recovery-path", heading: "If you're refused" },
  { kind: "review-outcome", heading: "What a review can result in" },
  { kind: "scam-warning", heading: "What not to trust" },
];
```

(No `rowClass` change — `review-outcome` falls through to the default `text-ink-soft`, which is correct.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/components/refusal-recovery.test.tsx`
Expected: PASS (all tests, old and new).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

*(Do NOT commit yet — the full suite is still red until Task 4 promotes the findings.)*

---

## Task 4: Promote the backing findings in the research ledger

The code now references `I.049/052/053/055/054/056/062`. They must become `used` with `value_status` set, or `findings-integrity` (`no used finding value-unset`) and `flip-status` (committed used set matches code) fail.

**Files:**
- Modify (via tools/temp scripts): `docs/research-briefs/findings/I.jsonl`
- Regenerate: `docs/research-briefs/findings-ledger.md`

- [ ] **Step 1: Set `value_status:"prose-only"` on the 7 findings (while still pending)**

Create a temp script `tmp-set-value-status.js` at the repo root (mirrors the tools' line-preserving rewrite):

```js
const fs = require("fs");
const path = "docs/research-briefs/findings/I.jsonl";
const ids = new Set(["I.049", "I.052", "I.053", "I.054", "I.055", "I.056", "I.062"]);
const raw = fs.readFileSync(path, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
const lines = raw.split(/\r?\n/);
const trailingBlank = lines.length > 0 && lines[lines.length - 1] === "";
const body = trailingBlank ? lines.slice(0, -1) : lines;
const out = body.map((line) => {
  if (!line.trim()) return line;
  const f = JSON.parse(line);
  if (!ids.has(f.id)) return line; // verbatim
  f.value_status = "prose-only";
  return JSON.stringify(f);
});
fs.writeFileSync(path, out.join(eol) + (trailingBlank ? eol : ""), "utf8");
console.log("set value_status=prose-only on:", [...ids].join(", "));
```

Run: `node tmp-set-value-status.js`
Expected: `set value_status=prose-only on: I.049, I.052, I.053, I.054, I.055, I.056, I.062`

- [ ] **Step 2: Promote the five `use-later` findings to `ready`**

Create `tmp-triage.json` at the repo root:

```json
{"assignments":[
  {"id":"I.052","triage":"ready","reason":"ART transitional-hearing rule wired into the refusal-recovery panel (ART-deepening slice 2026-06-15)"},
  {"id":"I.053","triage":"ready","reason":"ART review outcome (affirm) wired into the refusal-recovery panel"},
  {"id":"I.054","triage":"ready","reason":"ART review outcome (set aside) wired into the refusal-recovery panel"},
  {"id":"I.055","triage":"ready","reason":"ART review outcome (remit) wired into the refusal-recovery panel"},
  {"id":"I.062","triage":"ready","reason":"ART tribunal-initiated ministerial referral wired into the refusal-recovery panel"}
]}
```

Run: `node docs/research-briefs/_tools/apply-triage.js tmp-triage.json`
Expected: `applied 5 triage assignment(s) (ready=5); unchanged=0; files=1`
(`I.049`/`I.056` are already `ready` — not included, so no "unchanged" noise.)

- [ ] **Step 3: Flip the 7 findings pending→used (derive from code)**

Run: `$env:FLIP_STATUS=1; npx vitest run tests/data/flip-status.run.test.ts; $env:FLIP_STATUS=$null`
Expected: the write-mode test passes; the logged line reports `promoted=7` (demoted/refused/refToRejected/rewired = 0).

Verify the flip by reading the JSONL (not the runner output — its console.log can hide behind vitest):

Run: `node -e "const fs=require('fs');const ids=new Set(['I.049','I.052','I.053','I.054','I.055','I.056','I.062']);for(const l of fs.readFileSync('docs/research-briefs/findings/I.jsonl','utf8').split(/\r?\n/)){if(!l.trim())continue;const f=JSON.parse(l);if(ids.has(f.id))console.log(f.id,f.status,f.value_status,f.triage??'(cleared)')}"`
Expected: each line shows `used prose-only (cleared)` (status `used`, value_status `prose-only`, `triage` cleared by the flip).

- [ ] **Step 4: Regenerate the derived ledger markdown**

Run: `node docs/research-briefs/_tools/build-ledger.js`
Expected: completes; `git status` shows `docs/research-briefs/findings-ledger.md` modified (used count +7, pending −7).

- [ ] **Step 5: Remove the temp scripts**

Run: `Remove-Item tmp-set-value-status.js, tmp-triage.json`
(They must NOT be staged or committed.)

---

## Task 5: Full verification + single commit

**Files (exact staging list):**
- `lib/data/types.ts`
- `lib/data/source/nepal-refusal-recovery.ts`
- `components/results/refusal-recovery.tsx`
- `tests/components/refusal-recovery.test.tsx`
- `docs/research-briefs/findings/I.jsonl`
- `docs/research-briefs/findings-ledger.md`

- [ ] **Step 1: Run the ledger guards**

Run: `npx vitest run tests/data/flip-status.run.test.ts tests/data/findings-integrity.test.ts tests/data/reconcile.test.ts`
Expected: PASS — committed used set matches code (no promote/demote/refuse/rewire), no `used` finding value-unset, every `findingRef` exists + used + (prose-only) matches.

- [ ] **Step 2: Confirm goldens are byte-identical**

Run: `npx vitest run tests/scoring/characterization.test.ts`
Expected: PASS with NO regeneration (no scorer reads category I).

- [ ] **Step 3: Full gate**

Run: `npx vitest run`
Expected: PASS (suite grows by the 3 new component tests; the updated section-count test still passes).

Run: `npm run typecheck` → PASS
Run: `npm run lint` → PASS
Run: `npm run build` → PASS

- [ ] **Step 4: Confirm the WIP trio + untracked audit are untouched**

Run: `git status --short`
Expected: the six staging-list files modified; `CLAUDE.md`, `tests/integration/wizard-to-results.test.tsx`, `docs/debugging/`, and `docs/audits/2026-06-14-mvp-promise-behavior-audit.md` still present and NOT staged; no `tmp-*` files.

- [ ] **Step 5: Commit (exact files only)**

```bash
git add lib/data/types.ts lib/data/source/nepal-refusal-recovery.ts components/results/refusal-recovery.tsx tests/components/refusal-recovery.test.tsx docs/research-briefs/findings/I.jsonl docs/research-briefs/findings-ledger.md
git commit -F - <<'EOF'
feat(results): deepen refusal/recovery panel with ART review outcomes

Add a "What a review can result in" section (affirm / new decision / sent-back,
remit explained in plain language) and four ART rows in "If you're refused":
whether your decision letter says you can apply (I.056), the 2-year long-tail
companion to the 19-month median (I.049), the pre-1-June-2026 transitional
hearings (I.052), and tribunal-initiated ministerial referrals (I.062).

New "review-outcome" kind on NepalRefusalRecovery + one SECTIONS entry; seven
prose-only rows; gov-only sourcing preserved (consultancy refusal-reason rows
I.063–070 stay editorial). Ledger: value_status set prose-only before the flip,
I.052/053/054/055/062 triaged ready, all seven flipped pending→used (used +7).
No scorer reads category I, so goldens are byte-identical.

Spec: docs/superpowers/specs/2026-06-15-refusal-recovery-art-deepening-design.md

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

- [ ] **Step 6: Push**

Run: `git push origin master`
Expected: ref-update line `…->master` (verify by the printed ref line, not exit code).

---

## Self-review (completed during planning)

- **Spec coverage:** all 7 rows (Task 2), new kind (Task 1), new section (Task 3), gov-only scope (no I.063–070), triage/value_status/flip/build-ledger (Task 4), goldens byte-identical + copy-locks (Tasks 3, 5) — all mapped.
- **Placeholder scan:** none — every row, test, script, and command is concrete.
- **Type/name consistency:** `review-outcome` kind, row ids (`recovery-can-apply`, `recovery-hearing-transitional`, `recovery-timeline-longtail`, `recovery-ministerial-referral`, `outcome-affirm`, `outcome-set-aside`, `outcome-remit`), and consts (`ART_OUTCOMES`, reused `ART_IMMIGRATION`/`ART_CHANGES`/`ART_PROCESSING`/`IMMI_MINISTERIAL`) are consistent across tasks and match the spec's source map.
- **Order hazard called out:** suite is green only after Task 4; single commit in Task 5.
