# Refusal/recovery ART truth-fix — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct already-shipped refusal/recovery copy so it tells the post-1-June-2026 ART truth — the paper-only review change (I.051), the non-extendable deadline (I.050), and the realistic ~19-month timing (I.048) — by extending one existing data module and integrating three `ready` findings.

**Architecture:** Data-only change to `lib/data/source/nepal-refusal-recovery.ts`. The panel (`components/results/refusal-recovery.tsx`) already maps recovery-path rows generically by `kind`, so the reworded row and two new rows render with **no component edit**. Three findings flip `pending → used` via the registry-driven flip-status harness; `value_status:"prose-only"` is set **before** the flip so no `used`+`unset` window exists. No scoring, golden, analytics, schema, or registry change — category I and this module are already registered.

**Tech Stack:** TypeScript (strict, `noUnusedLocals`/`noUncheckedIndexedAccess`), vitest + @testing-library/react, the slice-kit findings harness (`tests/data/`), PowerShell on win32.

---

## How this plan handles the five named risks

| Risk (user's words) | Where it's handled | Machine proof |
|---|---|---|
| `value_status:"prose-only"` **before** the flip | Task 3 steps 1–3 (set value_status) run **before** Task 3 step 4 (flip). At the flip moment the findings are already `prose-only`, so they never exist `used`+`unset`. | `tests/data/` (findings-integrity) green — no `USED_UNSET` (Task 3 step 6) |
| Clearing triage | The flip itself removes `triage`/`triage_reason` on promotion (confirmed against `I.044`'s post-flip shape). No manual triage edit. | git diff shows `triage*` keys gone on the 3 lines (Task 3 step 5) |
| Preserving `I.044` provenance | `recovery-review.provenance.findingRefs` keeps `"I.044"`; the row `note` cites I.044 + its immi review-of-decisions URL; the flip leaves `I.044.used_by = [...recovery-review]` untouched (it stays `used`). | `flip` reports `rewired=0`, `I.044` line unchanged in diff (Task 3 steps 4–5) |
| Removing `IMMI_REVIEW` cleanly | Task 2 step 1 deletes the declaration; after the reword nothing references it. | `npm run typecheck` (`noUnusedLocals`) + `npm run lint` fail on any leftover/stray ref (Task 4) |
| Pinning the three copy lines | Task 1 adds a copy-lock test (3 verbatim fragments + the source-link switch), RED before Task 2, GREEN after. | `tests/components/refusal-recovery.test.tsx` (Task 1 → Task 2 step 3) |

## Commit boundary (read before starting)

This slice produces **two commits**:
1. **`fix(refusal-recovery)`** — the data module + the 3 flipped findings + the copy-lock test + the regenerated ledger docs. Created in **Task 4** (the first all-green point).
2. **`docs(status)`** — `PROJECT_STATUS.md` + the spec + this plan. Created in **Task 6**.

**Do NOT commit between Tasks 1–3.** The suite is intentionally RED mid-change: once Task 2 adds code refs to the still-`pending` I.048/I.050/I.051, the flip-status CHECK guard and coverage/validity guards go red until the flip lands in Task 3. That is expected — the first green state is the end of Task 3, and the commit is in Task 4.

Ledger movement for the whole slice: **used 482 → 485, pending 632 → 629.**

---

### Task 1: Lock the corrected copy with a failing test

**Files:**
- Test: `tests/components/refusal-recovery.test.tsx` (add one `it` block after the existing source-link test)

- [ ] **Step 1: Add the copy-lock test**

Insert this block immediately before the final `it("shows the not-legal-advice disclaimer", ...)` block (after line 54, the close of the source-link test):

```tsx
  it("tells the post-1-June-2026 ART truth: paper-only review, strict deadline, realistic timing", () => {
    render(<RefusalRecovery />);
    // Paper-only change (I.051) folded into the Tribunal-review row.
    expect(
      screen.getByText(
        /since 1 June 2026 it decides most student-visa refusal reviews on the papers, without holding an oral hearing/i,
      ),
    ).toBeInTheDocument();
    // Non-extendable deadline (I.050).
    expect(screen.getByText(/the Tribunal has no power to extend it/i)).toBeInTheDocument();
    // Realistic ~19-month timing (I.048) — "about half" / "19 months" are the user-approved words.
    expect(
      screen.getByText(/about half of student refusal reviews finish within 19 months of applying/i),
    ).toBeInTheDocument();
    // The reworded row now links to the ART change notice, not the generic immi review page.
    expect(screen.getByRole("link", { name: "Tribunal review" })).toHaveAttribute(
      "href",
      expect.stringContaining("changes-conduct-student-visa-reviews"),
    );
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/components/refusal-recovery.test.tsx`
Expected: FAIL — the three `getByText` queries throw "Unable to find an element" (copy not yet present) and the link still points to `review-of-decisions`.

---

### Task 2: Reword the recovery data and add the deadline/timing rows

**Files:**
- Modify: `lib/data/source/nepal-refusal-recovery.ts` (URL consts block + the "If you're refused" rows)

- [ ] **Step 1: Swap the URL constants (remove `IMMI_REVIEW`, add `ART_CHANGES` + `ART_PROCESSING`)**

Replace this (lines 26–29):

```ts
const IMMI_REVIEW =
  "https://immi.homeaffairs.gov.au/visas/getting-a-visa/fees-and-charges/fees-and-charges-for-other-services/review-of-decisions";
const ART_IMMIGRATION = "https://www.art.gov.au/applying-review/immigration-and-citizenship";
const ART_FEES = "https://www.art.gov.au/help-and-resources/fees";
```

with:

```ts
const ART_CHANGES =
  "https://www.art.gov.au/about/news-and-updates/changes-conduct-student-visa-reviews";
const ART_IMMIGRATION = "https://www.art.gov.au/applying-review/immigration-and-citizenship";
const ART_PROCESSING =
  "https://www.art.gov.au/about-us/accountability-and-reporting/processing-times";
const ART_FEES = "https://www.art.gov.au/help-and-resources/fees";
```

(`ART_IMMIGRATION` is kept — `recovery-cost` still uses it, and `recovery-deadline` will reuse it.)

- [ ] **Step 2: Reword `recovery-review` and insert `recovery-deadline` + `recovery-timeline`**

Replace this block (lines 113–127 — the section comment through the close of the `recovery-review` object):

```ts
  // ── If you're refused ───────────────────────────────────────────────────────
  {
    id: "recovery-review",
    kind: "recovery-path",
    label: "Tribunal review",
    summary:
      "If you're refused, you can ask the Administrative Review Tribunal to review the decision.",
    source: IMMI_REVIEW,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["I.044"],
      source: IMMI_REVIEW,
      note: "The Administrative Review Tribunal has jurisdiction to review certain visa decisions made under the Migration Act 1958 (I.044).",
    },
  },
```

with (note the section order becomes review → deadline → timeline, with `recovery-cost` continuing immediately after):

```ts
  // ── If you're refused ───────────────────────────────────────────────────────
  {
    id: "recovery-review",
    kind: "recovery-path",
    label: "Tribunal review",
    summary:
      "If you're refused, you can ask the Administrative Review Tribunal to review the decision — but since 1 June 2026 it decides most student-visa refusal reviews on the papers, without holding an oral hearing.",
    source: ART_CHANGES,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["I.044", "I.051"],
      source: ART_CHANGES,
      note: "ART has jurisdiction to review certain visa decisions under the Migration Act 1958 (I.044, immi.homeaffairs.gov.au review-of-decisions); from 1 June 2026 it must decide most student-visa refusal reviews without an oral hearing (I.051).",
    },
  },
  {
    id: "recovery-deadline",
    kind: "recovery-path",
    label: "Review deadline",
    summary:
      "The deadline to apply for review is strict — the Tribunal has no power to extend it.",
    source: ART_IMMIGRATION,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["I.050"],
      source: ART_IMMIGRATION,
      note: "ART says it has no power to extend the time limit to apply for a review (I.050).",
    },
  },
  {
    id: "recovery-timeline",
    kind: "recovery-path",
    label: "Review timing",
    summary:
      "Be ready to wait — about half of student refusal reviews finish within 19 months of applying.",
    source: ART_PROCESSING,
    lastVerified: VERIFIED,
    provenance: {
      findingRefs: ["I.048"],
      source: ART_PROCESSING,
      note: "ART processing-times: 50% of student refusal reviews finalised 1 Nov 2025–30 Apr 2026 were finalised within 1 year and 7 months (about 19 months) from lodgement (I.048).",
    },
  },
```

- [ ] **Step 3: Run the component test to verify it passes**

Run: `npx vitest run tests/components/refusal-recovery.test.tsx`
Expected: PASS (all blocks, including the new copy-lock — the three lines render and the "Tribunal review" link now points to the ART change notice).

**Do not commit yet** and **do not run `tests/data/` yet** — the data guards are now red (code references `pending` I.051/I.050/I.048). The flip in Task 3 fixes that.

---

### Task 3: Integrate the three findings (value_status before flip, then flip)

**Files:**
- Modify: `docs/research-briefs/findings/I.jsonl` (set `value_status` on I.048/I.050/I.051; the flip then promotes them)

- [ ] **Step 1: Set `value_status:"prose-only"` on I.048 (while still `pending`)**

In `docs/research-briefs/findings/I.jsonl`, replace:

```
"value_status":"unset","triage":"ready","triage_reason":"fresh window to 2026-04; 19-month median sets honest ART expectations in shipped block"
```

with:

```
"value_status":"prose-only","triage":"ready","triage_reason":"fresh window to 2026-04; 19-month median sets honest ART expectations in shipped block"
```

(Only `value_status` changes; `triage`/`triage_reason` are left for the flip to clear. The unique `triage_reason` makes the match unambiguous and preserves the line's EOL and key order.)

- [ ] **Step 2: Set `value_status:"prose-only"` on I.050**

Replace:

```
"value_status":"unset","triage":"ready","triage_reason":"no-extension rule is decision-critical; fits shipped ART review block"
```

with:

```
"value_status":"prose-only","triage":"ready","triage_reason":"no-extension rule is decision-critical; fits shipped ART review block"
```

- [ ] **Step 3: Set `value_status:"prose-only"` on I.051**

Replace:

```
"value_status":"unset","triage":"ready","triage_reason":"in force 2026-06-01: paper-only reviews reshape recovery advice in shipped block"
```

with:

```
"value_status":"prose-only","triage":"ready","triage_reason":"in force 2026-06-01: paper-only reviews reshape recovery advice in shipped block"
```

- [ ] **Step 4: Run the flip to derive `used` from code**

Run (PowerShell):

```powershell
$env:FLIP_STATUS="1"; npx vitest run tests/data/flip-status.run.test.ts; Remove-Item Env:FLIP_STATUS
```

Expected: the run rewrites `I.jsonl` and prints `promoted=3 demoted=0 rewired=0 refused=0 refToRejected=0`.
- `promoted=3` → I.048, I.050, I.051 went `pending → used`.
- `rewired=0` → I.044 is undisturbed (it was already `used` by `recovery-review`).

- [ ] **Step 5: Verify the flip's diff is exactly the three findings**

Run: `git diff --stat docs/research-briefs/findings/I.jsonl` (expect 1 file changed), then `git diff docs/research-briefs/findings/I.jsonl`.
Expected on each of the three lines: `"status":"pending"`→`"used"`, `"value_status"` already `"prose-only"`, `triage`/`triage_reason` keys **removed**, and `"used_by":["nepal-refusal-recovery[recovery-review|recovery-deadline|recovery-timeline]"]` appended — matching the shape of the already-`used` `I.044`/`I.045`. **The `I.044` line must be unchanged.**

- [ ] **Step 6: Run the data guards to confirm green**

Run: `npx vitest run tests/data/`
Expected: PASS — `reconcile OK · 0 orphans · 0 drift · 0 open-conflict-uses`, schema parses, flip-status normal-mode clean, **no `USED_UNSET`** (value_status was set before the flip).

---

### Task 4: Full gate, adversarial guard check, refresh ledger, commit

**Files:**
- Modify (regenerated): `docs/research-briefs/findings-ledger.md`, `docs/research-briefs/findings-clusters.md`

- [ ] **Step 1: Typecheck**

Run: `npm run typecheck`
Expected: clean. (This is the proof that `IMMI_REVIEW` is gone with no leftover declaration or stray reference — `noUnusedLocals`.)

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 3: Full suite**

Run: `npm test`
Expected: green, ≈931 tests (930 + the one new copy-lock test).

- [ ] **Step 4: Adversarially confirm a guard bites**

Temporarily remove `"I.051"` from `recovery-review`'s `findingRefs` (leave just `["I.044"]`) in `lib/data/source/nepal-refusal-recovery.ts`, then run `npx vitest run tests/data/`.
Expected: FAIL — I.051 is now `used` but unreferenced by code → coverage invariant (a) reports an orphan.
Then **restore** `"I.051"` and re-run `npx vitest run tests/data/` → PASS. (Do not flip; I.051 stays `used`.)

- [ ] **Step 5: Refresh the derived ledger**

Run: `node docs/research-briefs/_tools/build-ledger.js`
Then `git status` — expect `docs/research-briefs/findings-ledger.md` and `docs/research-briefs/findings-clusters.md` regenerated. The ledger totals must show **used 485 / pending 629** (moved by exactly this slice).

- [ ] **Step 6: Commit the fix**

```bash
git add lib/data/source/nepal-refusal-recovery.ts docs/research-briefs/findings/I.jsonl tests/components/refusal-recovery.test.tsx docs/research-briefs/findings-ledger.md docs/research-briefs/findings-clusters.md
git commit -m "fix(refusal-recovery): tell the post-1-June-2026 ART truth (paper-only review, strict deadline, ~19-month timing)

Reword recovery-review to fold in the in-force paper-only change (I.051),
add recovery-deadline (I.050) and recovery-timeline (I.048). Switch the row
source to the ART change notice; I.044 jurisdiction rides in findingRefs+note.
Flip I.048/I.050/I.051 pending->used (value_status prose-only set before flip,
triage cleared by flip). Data-only: no component/scoring/golden/analytics change.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Browser-verify the panel on the results page

**Files:** none (verification only)

- [ ] **Step 1: Ensure a dev server is running**

Use `preview_start` if no server is up (config `dev`, port 3000).

- [ ] **Step 2: Reach the anonymous results page**

Drive the wizard to results as in prior slices (the wizard uses `[role="radio"]` ARIA buttons + a `setTimeout`-delayed Continue click), or load the anonymous results route directly if available.

- [ ] **Step 3: Confirm the three corrected lines render in the recovery panel**

`preview_eval`:

```js
const t = document.body.innerText;
JSON.stringify([
  /without holding an oral hearing/.test(t),
  /the Tribunal has no power to extend it/.test(t),
  /about half of student refusal reviews finish within 19 months/.test(t),
])
```

Expected: `[true,true,true]`.

- [ ] **Step 4: Confirm the source switch**

`preview_eval`:

```js
[...document.querySelectorAll('a')].find(a => a.textContent.trim() === 'Tribunal review')?.href
```

Expected: a URL containing `changes-conduct-student-visa-reviews`.

- [ ] **Step 5: Confirm a clean console and capture proof**

`preview_console_logs` → expect no errors. Attempt `preview_screenshot`; if it times out on the tall results page (a known flake), the `preview_snapshot` + the evals above are the structural proof — note that in the report rather than retrying past ~3 attempts.

---

### Task 6: Record status, update memory, push, report

**Files:**
- Modify: `docs/PROJECT_STATUS.md`
- (local, not committed) `C:\Users\thapa\.claude\projects\C--Users-thapa-OneDrive-Desktop-work-merovisa\memory\value-triage-lane.md` + `MEMORY.md`

- [ ] **Step 1: Update `PROJECT_STATUS.md`**

Add a slice ④·1 bullet under the trust-defense lane log (mirroring the slice ③ entry's voice): the ART truth-fix shipped — recovery-review reworded for the paper-only change, recovery-deadline + recovery-timeline added, I.048/I.050/I.051 flipped (used 482→485, pending 632→629), data-only, goldens byte-identical. Advance the backlog line from "④ … refusal/recovery extension" to **"④·2 Phase 3 freshness/stale refresh (volatility/reverifyBy backfill; recheck I.045 AUD 3,580 July indexation) → ④·3 human read-through packet; verify-MARN checklist step is the agents fast-follow."**

- [ ] **Step 2: Commit the docs**

```bash
git add docs/PROJECT_STATUS.md docs/superpowers/specs/2026-06-12-refusal-recovery-art-truthfix-design.md docs/superpowers/plans/2026-06-12-refusal-recovery-art-truthfix.md
git commit -m "docs(status): record refusal/recovery ART truth-fix (slice ④·1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 3: Push**

```bash
git push origin master
```

- [ ] **Step 4: Update memory (local)**

In `value-triage-lane.md`: add a slice ④·1 SHIPPED paragraph (truth-fix done; ledger 485/629; the in-force paper-only change now reflected in shipped copy) and update the `description`/sequence line so NEXT = ④·2 Phase 3 freshness + ④·3 read-through packet. Refresh the `MEMORY.md` one-liner.

- [ ] **Step 5: Report after merge and await steer**

Per the lane's autonomous agreement: report the merge (commits, suite delta, ledger movement, browser-verify result) and await the user's next steer — do not auto-start slice ④·2.

---

## Self-review

**Spec coverage** — every spec section maps to a task: reword recovery-review + source switch (Task 2 step 2), recovery-deadline (Task 2 step 2 / I.050), recovery-timeline (Task 2 step 2 / I.048), remove `IMMI_REVIEW` (Task 2 step 1), section order review→deadline→timeline (Task 2 step 2), value_status-before-flip + triage clear + ledger 482→485/632→629 (Task 3), copy-locks (Task 1), no component/scoring/golden/analytics churn (no such task exists — none touched), browser-verify (Task 5), the five acceptance criteria (Tasks 3 step 6, 4, 5). Out-of-scope findings (I.049/052/053/054/055/056/062) are never referenced — they stay `pending`.

**Placeholder scan** — no TBDs; every code/JSONL step shows exact bytes; every command shows expected output.

**Type/name consistency** — new rows use only `id/kind/label/summary/source/lastVerified/provenance` (no `value`), matching `recovery-hardship`/`recovery-ministerial`, valid under the `NepalRefusalRecovery` interface (`value?`/`unit?`/`period?` optional). Record ids (`recovery-deadline`, `recovery-timeline`) match the `used_by` strings asserted in Task 3 step 5 and the link labels (`Review deadline`, `Review timing`) match the rendered anchors. URL consts (`ART_CHANGES`, `ART_PROCESSING`, `ART_IMMIGRATION`) are each declared in Task 2 step 1 before use in Task 2 step 2.
