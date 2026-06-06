# Nepal Education-Loan Bank Directory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the 69 category-B bank findings into a typed, sourced Nepal Class-A bank directory that surfaces education-loan options in the finance editor — closing the "Class-A bank list referenced in copy but never shown" gap.

**Architecture:** A pure data module (`nepal-banks.ts`) typed by new interfaces in `lib/data/types.ts`, read through a small accessor, and rendered by a reference panel in the existing finance editor when the user selects "education-loan" as their funding source. Integration state is tracked by flipping each consumed finding's `status` to `used` in the committed JSONL; a new `build-ledger.js` regenerates the ledger from the JSONL (extraction stays frozen) so that state survives.

**Tech Stack:** TypeScript (strict), Next.js App Router, Tailwind (project design tokens), Vitest + jsdom + @testing-library/react, Node (pipeline scripts).

**Scope boundary:** This plan integrates only the **bank-loan subset** of category B (the 69 findings whose entity is an NRB Class-A bank). The other ~66 B findings (proof-of-funds paths, tuition-payment mechanics, NRB remittance rules) stay `pending` for later B slices. The data source of truth for the directory is the in-repo `docs/research-briefs/findings/B.jsonl`.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `lib/data/types.ts` | Add `NepalBank`, `NepalBankLoan`, `LoanPricing` interfaces | Modify |
| `lib/data/source/nepal-banks.ts` | The 20 Class-A bank records (data) | Create |
| `lib/data/source/banks.ts` | Accessors: `getNepalBanks`, `getEducationLoanBanks` | Create |
| `components/profile/editors/bank-loan-panel.tsx` | Reference panel rendering education-loan banks | Create |
| `components/profile/editors/finance-editor.tsx` | Render the panel when source = education-loan | Modify |
| `tests/data/nepal-banks.test.ts` | Data-integrity tests for the directory | Create |
| `tests/data/banks-accessor.test.ts` | Accessor behaviour | Create |
| `tests/components/bank-loan-panel.test.tsx` | Panel renders bank data | Create |
| `docs/research-briefs/_tools/build-ledger.js` | Regenerate ledger+clusters from JSONL (status-preserving) | Create |
| `docs/research-briefs/_tools/extract-findings.js` | Guard re-runs to preserve `status`/`used_by` | Modify |
| `docs/research-briefs/findings/B.jsonl` | Flip 69 bank findings to `status:"used"` | Modify (scripted) |

---

## Task 1: Split ledger generation so integration state survives

Extraction (`source → JSONL`) must stay frozen now that findings are committed; the ledger must be rebuildable from the JSONL **without** resetting status. We add a status-preserving `build-ledger.js` and guard `extract-findings.js`.

**Files:**
- Create: `docs/research-briefs/_tools/build-ledger.js`
- Modify: `docs/research-briefs/_tools/extract-findings.js`

- [ ] **Step 1: Create `build-ledger.js` that reads the JSONL and regenerates the ledger + clusters**

```js
#!/usr/bin/env node
/**
 * Regenerate findings-ledger.md + findings-clusters.md FROM the committed
 * findings/*.jsonl (the source of truth post-extraction). Reads whatever
 * `status` each finding currently has — does NOT touch Research Documents/.
 * Run: node docs/research-briefs/_tools/build-ledger.js
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..", "..");
const OUT = path.join(ROOT, "docs", "research-briefs", "findings");
const LEDGER = path.join(ROOT, "docs", "research-briefs", "findings-ledger.md");
const CONFLICTS = path.join(ROOT, "docs", "research-briefs", "findings-clusters.md");

const all = [];
for (const f of fs.readdirSync(OUT).filter((f) => f.endsWith(".jsonl")).sort()) {
  for (const line of fs.readFileSync(path.join(OUT, f), "utf8").split(/\r?\n/)) {
    if (line.trim()) all.push(JSON.parse(line));
  }
}

// entity+attribute clusters (review aid; see findings-clusters header)
const groups = {};
for (const r of all) {
  const key = r.category + "|" + (r.entity || "").toLowerCase().trim() + "|" + (r.attribute || "").toLowerCase().trim();
  (groups[key] = groups[key] || []).push(r);
}
let gid = 0;
const collisions = [];
for (const [key, rs] of Object.entries(groups)) {
  const parts = key.split("|");
  if (rs.length < 2 || (!parts[1] && !parts[2])) continue;
  gid++;
  const differ = new Set(rs.map((r) => (r.claim || "").trim())).size > 1;
  rs.forEach((r) => (r.dup_group = "G" + gid));
  collisions.push({ gid: "G" + gid, key, rows: rs, differ });
}

const esc = (s) => (s || "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const byStatus = {};
all.forEach((r) => (byStatus[r.status] = (byStatus[r.status] || 0) + 1));

let led = "# Findings ledger (generated)\n\n";
led += "> Generated by `_tools/build-ledger.js` from findings/*.jsonl. Edit `status` in the JSONL, then regenerate.\n\n";
led += `**Total findings:** ${all.length}  ·  **entity+attr clusters:** ${collisions.length}\n\n`;
led += "**Status:** " + Object.entries(byStatus).map(([k, v]) => `${k}=${v}`).join(" · ") + "\n\n";
led += "| ID | topic | conf | type | cluster | status | target | claim |\n";
led += "|----|-------|------|------|---------|--------|--------|-------|\n";
for (const r of all) {
  led += `| ${r.id} | ${r.topic} | ${r.confidence} | ${r.claim_type} | ${r.dup_group || ""} | ${r.status} | ${esc(r.target)} | ${esc(clip(r.claim || "", 110))} |\n`;
}
fs.writeFileSync(LEDGER, led);

let cf = "# Entity+attribute clusters (generated, for review)\n\n";
cf += "Rows sharing `category + entity + attribute`. Most are atomic enumerations, NOT contradictions. Real contradictions are resolved at integration time, per target.\n\n";
const needReview = collisions.filter((c) => c.differ);
cf += `**${collisions.length}** clusters · **${needReview.length}** multi-valued · **${collisions.length - needReview.length}** byte-identical duplicates.\n\n`;
for (const c of collisions.sort((a, b) => Number(b.differ) - Number(a.differ))) {
  const p = c.key.split("|");
  cf += `### ${c.gid} ${c.differ ? "multi-valued" : "identical-dup"} — [${p[0]}] ${p[1]} / ${p[2]}\n\n`;
  for (const r of c.rows) cf += `- \`${r.id}\` (${r.confidence}/${r.publisher}, ${r.source_date}) ${esc(clip(r.claim || "", 160))}\n`;
  cf += "\n";
}
fs.writeFileSync(CONFLICTS, cf);

const used = byStatus.used || 0;
console.log(`ledger rebuilt: ${all.length} findings · used=${used} · pending=${byStatus.pending || 0} · clusters=${collisions.length}`);
```

- [ ] **Step 2: Run it and confirm it reproduces the current ledger state**

Run: `node docs/research-briefs/_tools/build-ledger.js`
Expected: `ledger rebuilt: 1114 findings · used=0 · pending=1114 · clusters=41`

- [ ] **Step 3: Confirm the rebuilt ledger is unchanged vs the committed one**

Run: `git diff --stat docs/research-briefs/findings-ledger.md docs/research-briefs/findings-clusters.md`
Expected: no output (byte-identical to the committed version — the new builder matches the old generator).

- [ ] **Step 4: Guard `extract-findings.js` against clobbering integration state**

In `extract-findings.js`, find the JSONL-writing loop:

```js
// write JSONL (with dup_group populated)
for (const cat of Object.keys(perCat)) {
  const jsonl = perCat[cat].rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
  fs.writeFileSync(path.join(OUT, cat + ".jsonl"), jsonl);
}
```

Replace it with a version that preserves `status`/`used_by` from any existing JSONL, keyed by `id`:

```js
// write JSONL — preserve integration state (status/used_by) from any existing file
for (const cat of Object.keys(perCat)) {
  const prevPath = path.join(OUT, cat + ".jsonl");
  const prev = {};
  if (fs.existsSync(prevPath)) {
    for (const line of fs.readFileSync(prevPath, "utf8").split(/\r?\n/)) {
      if (!line.trim()) continue;
      const p = JSON.parse(line);
      prev[p.id] = p;
    }
  }
  for (const r of perCat[cat].rows) {
    const p = prev[r.id];
    if (p) {
      r.status = p.status || r.status;
      if (p.used_by) r.used_by = p.used_by;
    }
  }
  const jsonl = perCat[cat].rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
  fs.writeFileSync(prevPath, jsonl);
}
```

- [ ] **Step 5: Verify the guard preserves status across a re-extract**

Run (PowerShell):
```
node -e "const fs=require('fs');const p='docs/research-briefs/findings/J.jsonl';const a=fs.readFileSync(p,'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);a[0].status='used';a[0].used_by='test';fs.writeFileSync(p,a.map(o=>JSON.stringify(o)).join('\n')+'\n')"
node docs/research-briefs/_tools/extract-findings.js
node -e "const fs=require('fs');const a=fs.readFileSync('docs/research-briefs/findings/J.jsonl','utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);console.log(a[0].status, a[0].used_by)"
```
Expected final line: `used test` (status survived the re-extract). Then restore: `git checkout docs/research-briefs/findings/J.jsonl` and rebuild: `node docs/research-briefs/_tools/build-ledger.js`.

- [ ] **Step 6: Commit**

```
git add docs/research-briefs/_tools/build-ledger.js docs/research-briefs/_tools/extract-findings.js
git commit -m "Split ledger build from extraction; preserve integration status on re-run"
```

---

## Task 2: Add bank directory types

**Files:**
- Modify: `lib/data/types.ts`
- Test: `tests/data/nepal-banks.test.ts` (created here, fleshed out in Task 3)

- [ ] **Step 1: Add the interfaces to `lib/data/types.ts`** (append after `FieldOfStudyData`)

```ts
export type LoanPricing =
  | { kind: "base-spread"; minSpreadPct: number; maxSpreadPct: number }
  | { kind: "fixed"; minRatePct?: number; maxRatePct?: number; effectiveRatePct?: number; effectiveDate?: string };

export interface NepalBankLoan {
  productName?: string;
  minAmountNpr?: number;
  maxAmountNpr?: number;
  maxTenureYears?: number;
  financingRatioPct?: number; // e.g. 100 = up to 100% of study cost
  pricing?: LoanPricing;
  collateralRequired?: boolean;
  notes?: string;
  source: string;
  lastVerified?: string; // ISO date; omitted when the source page is undated
}

export interface NepalBank {
  id: string; // slug, e.g. "himalayan"
  name: string; // official name, e.g. "Himalayan Bank Ltd."
  nrbClass: "A";
  headOffice: string; // e.g. "Kamaladi, Kathmandu"
  branchCount?: number;
  educationLoan?: NepalBankLoan; // present when the bank offers a study-abroad/education loan
  source: string; // NRB Class-A listing URL
  lastVerified?: string;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors — interfaces are additive).

- [ ] **Step 3: Commit**

```
git add lib/data/types.ts
git commit -m "Add NepalBank/NepalBankLoan/LoanPricing types"
```

---

## Task 3: Create the bank directory data module

Transcribe the 20 NRB Class-A banks from `docs/research-briefs/findings/B.jsonl`. **Rule:** every bank entity in B.jsonl that NRB lists as Class-A gets a record. Populate education-loan fields ONLY where a finding states them — never invent a value; omit unknown fields. Cite the bank's loan/rates page in `educationLoan.source` and the NRB listing in the top-level `source`.

**Files:**
- Create: `lib/data/source/nepal-banks.ts`
- Test: `tests/data/nepal-banks.test.ts`

- [ ] **Step 1: Write the failing data-integrity test**

```ts
import { describe, it, expect } from "vitest";
import { NEPAL_BANKS } from "@/lib/data/source/nepal-banks";

describe("NEPAL_BANKS directory", () => {
  it("lists at least 20 NRB Class-A banks with unique ids", () => {
    expect(NEPAL_BANKS.length).toBeGreaterThanOrEqual(20);
    const ids = NEPAL_BANKS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every bank is Class A, named, sited, and NRB-sourced", () => {
    for (const b of NEPAL_BANKS) {
      expect(b.nrbClass).toBe("A");
      expect(b.name.trim().length).toBeGreaterThan(0);
      expect(b.headOffice.trim().length).toBeGreaterThan(0);
      expect(b.source).toMatch(/^https?:\/\//);
    }
  });

  it("education-loan records carry a source and sane finite numbers", () => {
    const lenders = NEPAL_BANKS.filter((b) => b.educationLoan);
    expect(lenders.length).toBeGreaterThanOrEqual(3);
    for (const b of lenders) {
      const l = b.educationLoan!;
      expect(l.source).toMatch(/^https?:\/\//);
      for (const v of [l.minAmountNpr, l.maxAmountNpr, l.maxTenureYears, l.financingRatioPct]) {
        if (v !== undefined) expect(Number.isFinite(v)).toBe(true);
      }
      if (l.minAmountNpr !== undefined && l.maxAmountNpr !== undefined) {
        expect(l.maxAmountNpr).toBeGreaterThanOrEqual(l.minAmountNpr);
      }
      if (l.pricing?.kind === "base-spread") {
        expect(l.pricing.maxSpreadPct).toBeGreaterThanOrEqual(l.pricing.minSpreadPct);
      }
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/data/nepal-banks.test.ts`
Expected: FAIL — `Cannot find module '@/lib/data/source/nepal-banks'`.

- [ ] **Step 3: Create `lib/data/source/nepal-banks.ts` with the three fully-sourced anchor records, then transcribe the rest from B.jsonl**

```ts
import type { NepalBank } from "../types";

const NRB_LIST = "https://www.nrb.org.np/bfr/bfis-list-in-english-mid-jan-2025/";

export const NEPAL_BANKS: NepalBank[] = [
  {
    id: "himalayan",
    name: "Himalayan Bank Ltd.",
    nrbClass: "A",
    headOffice: "Kamaladi, Kathmandu",
    educationLoan: {
      productName: "Premier Education Loan",
      minAmountNpr: 500_000,
      maxAmountNpr: 10_000_000,
      maxTenureYears: 15,
      pricing: { kind: "base-spread", minSpreadPct: 0.5, maxSpreadPct: 2.5 },
      source: "https://himalayanbank.com/en/loan-products/education-loan",
    },
    source: NRB_LIST,
    lastVerified: "2025-01-15",
  },
  {
    id: "laxmi-sunrise",
    name: "Laxmi Sunrise Bank Ltd.",
    nrbClass: "A",
    headOffice: "Hattisar, Kathmandu",
    educationLoan: {
      maxAmountNpr: 10_000_000,
      maxTenureYears: 20,
      financingRatioPct: 100,
      pricing: { kind: "fixed", minRatePct: 7.99, maxRatePct: 11.99 },
      source: "https://www.laxmisunrise.com/loan/education-loan/",
    },
    source: NRB_LIST,
    lastVerified: "2025-01-15",
  },
  {
    id: "nic-asia",
    name: "NIC Asia Bank Ltd.",
    nrbClass: "A",
    headOffice: "Thapathali, Kathmandu",
    branchCount: 316,
    educationLoan: {
      minAmountNpr: 300_000,
      maxAmountNpr: 10_000_000,
      maxTenureYears: 20,
      pricing: { kind: "fixed", effectiveRatePct: 8.99, effectiveDate: "2026-02-13" },
      source: "https://www.nicasiabank.com/loans/education-loan/",
    },
    source: NRB_LIST,
    lastVerified: "2025-01-15",
  },
  // TRANSCRIBE the remaining NRB Class-A banks from docs/research-briefs/findings/B.jsonl
  // (entities with attribute "head office"): Global IME, Nepal Investment Mega, Nabil,
  // Standard Chartered, Everest, Kumari, Citizens, Machhapuchchhre, NMB, Prabhu, Sanima,
  // Prime, Siddhartha, ADBL, Nepal Bank, Nepal SBI, and any others present.
  // For each: id (slug), name, headOffice (from the "head office" finding), source: NRB_LIST.
  // Add `educationLoan` ONLY where B.jsonl has loan findings for that bank; cite that bank's
  // loan/rates URL from the finding's `source`. Omit fields with no finding. Never invent values.
];
```

- [ ] **Step 4: Read the remaining bank findings and complete the array**

Run (lists every bank record you must add, with its findings):
```
node -e "const fs=require('fs');const r=fs.readFileSync('docs/research-briefs/findings/B.jsonl','utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);const b={};r.filter(x=>/bank ltd|ADBL|Nepal Bank/i.test(x.entity)).forEach(x=>(b[x.entity]=b[x.entity]||[]).push(x));for(const[k,v]of Object.entries(b)){console.log('\n'+k);v.forEach(f=>console.log('  '+f.attribute+' :: '+f.claim+'  ['+f.source+']'))}"
```
Add a record for each bank shown. Re-run the test after each few additions.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/data/nepal-banks.test.ts`
Expected: PASS (≥20 banks, ≥3 lenders).

- [ ] **Step 6: Typecheck and commit**

```
npx tsc --noEmit
git add lib/data/source/nepal-banks.ts tests/data/nepal-banks.test.ts
git commit -m "Add Nepal Class-A bank directory with education-loan data"
```

---

## Task 4: Accessors

**Files:**
- Create: `lib/data/source/banks.ts`
- Test: `tests/data/banks-accessor.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { getNepalBanks, getEducationLoanBanks } from "@/lib/data/source/banks";

describe("bank accessors", () => {
  it("getNepalBanks returns the full directory", () => {
    expect(getNepalBanks().length).toBeGreaterThanOrEqual(20);
  });
  it("getEducationLoanBanks returns only banks with an educationLoan", () => {
    const lenders = getEducationLoanBanks();
    expect(lenders.length).toBeGreaterThanOrEqual(3);
    expect(lenders.every((b) => b.educationLoan)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/data/banks-accessor.test.ts`
Expected: FAIL — `Cannot find module '@/lib/data/source/banks'`.

- [ ] **Step 3: Implement `lib/data/source/banks.ts`**

```ts
import type { NepalBank } from "../types";
import { NEPAL_BANKS } from "./nepal-banks";

export function getNepalBanks(): NepalBank[] {
  return NEPAL_BANKS;
}

export function getEducationLoanBanks(): NepalBank[] {
  return NEPAL_BANKS.filter((b) => b.educationLoan);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/data/banks-accessor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```
git add lib/data/source/banks.ts tests/data/banks-accessor.test.ts
git commit -m "Add Nepal bank accessors"
```

---

## Task 5: Build the education-loan reference panel

A presentational client component listing education-loan banks (name, amount range, tenure, rate). Calm-authority styling mirroring finance-editor's existing classes — no shadows/gradients, mono labels, thin borders.

**Files:**
- Create: `components/profile/editors/bank-loan-panel.tsx`
- Test: `tests/components/bank-loan-panel.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BankLoanPanel } from "@/components/profile/editors/bank-loan-panel";

describe("BankLoanPanel", () => {
  it("lists education-loan banks with their amount ceiling", () => {
    render(<BankLoanPanel />);
    expect(screen.getByText(/Himalayan Bank/i)).toBeInTheDocument();
    // NPR 10,000,000 ceiling formatted with separators
    expect(screen.getAllByText(/10,000,000/).length).toBeGreaterThan(0);
  });

  it("renders a sourced footnote, not an unsourced claim", () => {
    render(<BankLoanPanel />);
    expect(screen.getByText(/Nepal Rastra Bank/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/components/bank-loan-panel.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `components/profile/editors/bank-loan-panel.tsx`**

```tsx
import { getEducationLoanBanks } from "@/lib/data/source/banks";

function npr(n?: number): string | null {
  return n === undefined ? null : "NPR " + n.toLocaleString("en-US");
}

function rate(b: ReturnType<typeof getEducationLoanBanks>[number]): string | null {
  const p = b.educationLoan?.pricing;
  if (!p) return null;
  if (p.kind === "base-spread") return `Base + ${p.minSpreadPct}–${p.maxSpreadPct}%`;
  if (p.effectiveRatePct !== undefined) return `${p.effectiveRatePct}% fixed`;
  if (p.minRatePct !== undefined && p.maxRatePct !== undefined) return `${p.minRatePct}–${p.maxRatePct}% fixed`;
  return null;
}

export function BankLoanPanel() {
  const banks = getEducationLoanBanks();
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line-2 bg-surface p-4">
      <h3 className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">
        Class-A banks with education loans
      </h3>
      <ul className="flex flex-col divide-y divide-line-2">
        {banks.map((b) => {
          const ceiling = npr(b.educationLoan?.maxAmountNpr);
          const r = rate(b);
          const tenure = b.educationLoan?.maxTenureYears;
          return (
            <li key={b.id} className="flex flex-col gap-1 py-2">
              <a
                href={b.educationLoan!.source}
                target="_blank"
                rel="noreferrer"
                className="text-[15px] text-ink hover:text-primary"
              >
                {b.name}
              </a>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-soft">
                {ceiling ? <span>Up to {ceiling}</span> : null}
                {tenure ? <span>{tenure}-yr term</span> : null}
                {r ? <span>{r}</span> : null}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-[12px] text-ink-faint">
        Class-A list per Nepal Rastra Bank. Verify current rates with the bank before applying.
      </p>
    </section>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/components/bank-loan-panel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```
git add components/profile/editors/bank-loan-panel.tsx tests/components/bank-loan-panel.test.tsx
git commit -m "Add education-loan bank reference panel"
```

---

## Task 6: Surface the panel in the finance editor

Show the panel when the user selects "education-loan" as their source of funds — the moment the bank list is relevant.

**Files:**
- Modify: `components/profile/editors/finance-editor.tsx`
- Test: extend `tests/components/bank-loan-panel.test.tsx` with a finance-editor integration test (new `describe` block).

- [ ] **Step 1: Write the failing integration test** (append to `tests/components/bank-loan-panel.test.tsx`)

```tsx
import { fireEvent } from "@testing-library/react";
import { FinanceEditor } from "@/components/profile/editors/finance-editor";

describe("FinanceEditor education-loan surface", () => {
  it("hides the bank panel until education-loan is selected", () => {
    render(<FinanceEditor initial={{}} />);
    expect(screen.queryByText(/Class-A banks with education loans/i)).toBeNull();
    fireEvent.change(screen.getByLabelText(/Source of funds/i), { target: { value: "education-loan" } });
    expect(screen.getByText(/Class-A banks with education loans/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/components/bank-loan-panel.test.tsx`
Expected: FAIL — panel never renders inside FinanceEditor.

- [ ] **Step 3: Wire the panel into `finance-editor.tsx`**

Add the import near the top (after the `Button` import):

```tsx
import { BankLoanPanel } from "./bank-loan-panel";
```

Then, immediately after the source `<select>`'s closing `</div>` (the block ending line 78), insert:

```tsx
{source === "education-loan" ? <BankLoanPanel /> : null}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/components/bank-loan-panel.test.tsx`
Expected: PASS (both describe blocks).

- [ ] **Step 5: Full test + typecheck**

Run: `npx vitest run` then `npx tsc --noEmit`
Expected: all tests PASS, no type errors.

- [ ] **Step 6: Commit**

```
git add components/profile/editors/finance-editor.tsx tests/components/bank-loan-panel.test.tsx
git commit -m "Surface bank-loan panel when education-loan source selected"
```

---

## Task 7: Flip the consumed findings to `used` and rebuild the ledger

The 69 bank findings are now integrated. Mark them `used` (with this work's marker) so the ledger's "every data comes to use" accounting reflects reality. Non-bank B findings stay `pending`.

**Files:**
- Modify (scripted): `docs/research-briefs/findings/B.jsonl`
- Regenerate: `findings-ledger.md`, `findings-clusters.md`

- [ ] **Step 1: Flip status for bank-entity findings**

Run (PowerShell):
```
node -e "const fs=require('fs');const p='docs/research-briefs/findings/B.jsonl';const re=/bank ltd|ADBL|Nepal Bank|NIC Asia|Global IME|Standard Chartered|Nabil|SBI/i;const a=fs.readFileSync(p,'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);let n=0;for(const r of a){if(re.test(r.entity)){r.status='used';r.used_by='nepal-banks.ts';n++}}fs.writeFileSync(p,a.map(o=>JSON.stringify(o)).join('\n')+'\n');console.log('flipped',n)"
```
Expected: `flipped 69` (verify the count matches the bank-findings total; adjust the regex if a bank entity is missed).

- [ ] **Step 2: Rebuild the ledger**

Run: `node docs/research-briefs/_tools/build-ledger.js`
Expected: `ledger rebuilt: 1114 findings · used=69 · pending=1045 · clusters=41`

- [ ] **Step 3: Confirm zero bank findings remain pending**

Run:
```
node -e "const fs=require('fs');const re=/bank ltd|ADBL|Nepal Bank|NIC Asia|Global IME|Standard Chartered|Nabil|SBI/i;const a=fs.readFileSync('docs/research-briefs/findings/B.jsonl','utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);console.log('bank pending:',a.filter(r=>re.test(r.entity)&&r.status!=='used').length)"
```
Expected: `bank pending: 0`

- [ ] **Step 4: Commit**

```
git add docs/research-briefs/findings/B.jsonl docs/research-briefs/findings-ledger.md docs/research-briefs/findings-clusters.md
git commit -m "Mark category-B bank findings as used (nepal-banks.ts)"
```

---

## Self-Review

**Spec coverage** (against the bank-loan slice of category B and the pipeline's verification gate):
- Typed directory of NRB Class-A banks → Tasks 2–3.
- Education-loan product data (amount/tenure/pricing) sourced, never invented → Task 3 rule + integrity test.
- Data actually surfaced to users (closes "referenced but never shown") → Tasks 5–6.
- Ledger accounting: consumed findings flipped to `used`, survives regeneration → Tasks 1, 7.
- Non-bank B findings explicitly left `pending` → Scope boundary + Task 7 regex.

**Verification gate for this slice:** after Task 7, `bank pending: 0` and `used=69` in the ledger; remaining B findings stay pending for later slices. Count parity holds (still 1,114 total).

**Deferred (logged, not dropped):** proof-of-funds paths, tuition-payment mechanics, NRB remittance rules (rest of B) — future slices. The universities (D) gap — missing admissions/fee data — remains a separate `NEEDS-RESEARCH` item.

---

## Execution Handoff

After saving, choose execution mode (subagent-driven recommended for fresh-context per task; inline for batch-with-checkpoints).
