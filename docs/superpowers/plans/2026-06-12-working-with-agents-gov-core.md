# Working with an agent — gov-core module — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a gov-sourced "Working with an agent" trust panel on the results page, built from 16 OMARA/DHA + 2026-commission-reform findings, mirroring the Genuine Student slice.

**Architecture:** A new typed, prose-only data module (`lib/data/source/au-working-with-agents.ts`, category `G`) + Zod schema + one registry line drives a collapsible `<details>` server component rendered after `GenuineStudent`. The 16 backing findings flip `pending → used` (triage cleared, `value_status → prose-only`) via the registry-driven slice-kit harness. Surface-only: no scoring, no goldens, no generator changes.

**Tech Stack:** Next.js 16 App Router, TypeScript (strict, `noUncheckedIndexedAccess`), Tailwind v4, vitest + Testing Library, the slice-kit flip-status/reconcile harness (`docs/research-briefs/_tools`).

**Spec:** `docs/superpowers/specs/2026-06-12-working-with-agents-gov-core-design.md` (APPROVED 2026-06-12 with four copy tweaks).

**Shell:** Windows PowerShell. Env-var-prefixed commands use `$env:NAME="1"; cmd` form, not `NAME=1 cmd`.

---

## File Structure

**Create:**
- `lib/data/source/au-working-with-agents.ts` — the 16-row sourced module (5 sections, prose-only).
- `lib/data/schema/au-working-with-agents.schema.ts` — Zod guard (mirrors the GS schema).
- `components/results/working-with-agents.tsx` — the collapsible server panel.
- `tests/components/working-with-agents.test.tsx` — headings, copy-lock, links, `<details>` state.

**Modify:**
- `lib/data/types.ts` — add `WorkingWithAgentsFact` interface (after `GenuineStudentFact`, ~line 884).
- `lib/data/schema/registry.ts` — import the module + schema (after the GS imports, ~line 90) and append one `DATA_MODULES` entry (after the GS entry, ~line 727).
- `lib/analytics/events.ts` — add `"working-with-agents"` to the `SourceSurface` union (line 19).
- `tests/analytics/events.test.ts` — extend the `source_link_clicked.surface` `expectTypeOf` pin (lines 65–67).
- `components/results/results.tsx` — import + render `<WorkingWithAgents />` after `<GenuineStudent />` (line 69).
- `docs/research-briefs/findings/G.jsonl` — 16 findings flipped (status/used_by/triage by the runner; `value_status` by the prep script).
- `docs/PROJECT_STATUS.md` — slice bullet + backlog advance.
- `~/.claude/.../memory/value-triage-lane.md` + `MEMORY.md` — lane state.

**Do NOT touch:** `lib/scoring/**`, `tests/**/golden*`, `lib/plan/generator.ts`, `lib/checklist/generator.ts`, `lib/checklist/plan-links.ts`, `docs/research-briefs/_tools/flip-status.js` (its `applyChange` triage-clear already exists from the GS slice).

**The 16 findings (all currently `pending` / `ready` / `value_status:"unset"`):**
`G.074, G.075, G.076, G.077, G.079, G.080, G.081, G.084, G.085, G.087, G.088, G.089` (OMARA/DHA, 12) + `G.090, G.092, G.094, G.096` (2026 commission, 4). The 7 `use-later` rows (`G.078, G.082, G.083, G.086, G.091, G.093, G.095`) stay pending.

---

## Task 1: Sourced data layer + findings integration

**Files:**
- Modify: `lib/data/types.ts`
- Create: `lib/data/source/au-working-with-agents.ts`, `lib/data/schema/au-working-with-agents.schema.ts`
- Modify: `lib/data/schema/registry.ts`, `docs/research-briefs/findings/G.jsonl`

- [ ] **Step 1: Add the `WorkingWithAgentsFact` interface**

In `lib/data/types.ts`, immediately after the `GenuineStudentFact` interface (ends ~line 884), add:

```ts
/**
 * Working-with-agents gov-core module (slice ③, category G). Prose-only rows explaining
 * how to work safely with an agent in Australia: whether you need one, who can lawfully
 * give immigration assistance, verifying the OMARA register, what an agent owes you, formal
 * representation (Form 956), and the 2026 onshore-transfer commission ban. `section` groups
 * rows into the panel's five `<details>` blocks. Fact-only — no scorer reads it; machine-checked
 * against findings (provenance.findingRefs). Rendered by components/results/working-with-agents.tsx
 * after GenuineStudent.
 */
export interface WorkingWithAgentsFact extends Provenanced {
  id: string; // slug, e.g. "verify-marn"
  section: "do-you-need-one" | "verify-register" | "what-they-owe" | "formal-representation" | "commission-ban";
  label: string;   // short source label — rendered as the row's link text
  summary: string; // the rendered sentence
  source: string;  // canonical gov URL shown as the row's link
  lastVerified?: string; // ISO date
}
```

- [ ] **Step 2: Create the sourced module**

Create `lib/data/source/au-working-with-agents.ts`:

```ts
import type { WorkingWithAgentsFact } from "@/lib/data/types";

/**
 * Working-with-agents gov-core module (slice ③). Government-sourced facts on using an
 * education/migration agent for an Australian student visa, in five sections. Every row links
 * to its primary gov page; provenance.findingRefs lists the backing finding (1:1 — these gov
 * facts are atomic). Prose-only: nothing here is a number the reconciler must match (the AUD 510
 * in `avg-commission` renders as narrative, not a typed config). Fact-only: no scorer reads it.
 */
const MARA_REGISTER = "https://www.mara.gov.au/steps-to-register/overview";
const MARA_HOW_HELP =
  "https://www.mara.gov.au/get-help-with-a-visa/help-from-registered-agents/how-registered-agents-can-help";
const MARA_PORTAL_SEARCH = "https://portal.mara.gov.au/search-the-register-of-migration-agents/";
const MARA_NOT_REGISTERED = "https://www.mara.gov.au/get-help-with-a-visa/helpers-not-registered";
const MARA_CHOOSE_OVERVIEW =
  "https://www.mara.gov.au/get-help-with-a-visa/help-from-registered-agents/steps-to-choose/overview";
const MARA_CHOOSE_STEPS =
  "https://www.mara.gov.au/get-help-with-a-visa/help-from-registered-agents/steps-to-choose/step-by-step";
const MARA_AGENT_MUST_DO =
  "https://www.mara.gov.au/get-help-with-a-visa/help-from-registered-agents/steps-to-choose/after-you-choose-a-registered-agent/what-your-agent-must-do";
const FORM_956 = "https://immi.homeaffairs.gov.au/form-listing/forms/956.pdf";
const DHA_VISA_SCAMS = "https://immi.homeaffairs.gov.au/help-support/visa-scams/what-you-need-to-know";
const STUDY_AU_COMMISSIONS =
  "https://www.studyaustralia.gov.au/en/Agent-Hub/agent-news-index/new-rules-on-agent-commissions-for-onshore-student-transfers";
const OIA_IMPACT =
  "https://oia.pmc.gov.au/sites/default/files/posts/2026/01/Onshore%20transfer%20commission%20ban%20-%20Impact%20Analysis%20Addendum%202026%20-%20CLEAN_0.pdf";
const VERIFIED = "2026-06-05";

export const AU_WORKING_WITH_AGENTS: WorkingWithAgentsFact[] = [
  // ── Do you need an agent? ─────────────────────────────────────────────────────
  {
    id: "agent-optional",
    section: "do-you-need-one",
    label: "OMARA",
    summary: "You don't have to use a registered migration agent — you can apply for the visa yourself.",
    source: MARA_HOW_HELP,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["G.075"], source: MARA_HOW_HELP },
  },
  {
    id: "who-can-assist",
    section: "do-you-need-one",
    label: "OMARA",
    summary:
      'Immigration assistance can only be given by registered migration agents, Australian legal practitioners, or limited "exempt persons".',
    source: MARA_REGISTER,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["G.074"], source: MARA_REGISTER },
  },
  {
    id: "agent-complex-cases",
    section: "do-you-need-one",
    label: "OMARA",
    summary: "OMARA says a registered agent may be especially helpful if your case is complex.",
    source: MARA_HOW_HELP,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["G.076"], source: MARA_HOW_HELP },
  },
  {
    id: "pay-use-registered",
    section: "do-you-need-one",
    label: "DHA scams",
    summary:
      "If you pay for immigration help, the Department says use a registered migration agent listed with OMARA.",
    source: DHA_VISA_SCAMS,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["G.084"], source: DHA_VISA_SCAMS },
  },
  // ── Check the register first ──────────────────────────────────────────────────
  {
    id: "verify-marn",
    section: "verify-register",
    label: "OMARA register",
    summary: "Confirm your agent on the OMARA public register — you can search it by their MARN.",
    source: MARA_PORTAL_SEARCH,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["G.077"], source: MARA_PORTAL_SEARCH },
  },
  {
    id: "agent-standards",
    section: "verify-register",
    label: "OMARA",
    summary: "Registered agents must keep meeting OMARA's professional standards to stay on the register.",
    source: MARA_CHOOSE_OVERVIEW,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["G.085"], source: MARA_CHOOSE_OVERVIEW },
  },
  // ── What your agent owes you ──────────────────────────────────────────────────
  {
    id: "owes-documents",
    section: "what-they-owe",
    label: "OMARA",
    summary: "Your agent must give you the documents the Department sends about your case.",
    source: MARA_AGENT_MUST_DO,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["G.088"], source: MARA_AGENT_MUST_DO },
  },
  {
    id: "owes-updates",
    section: "what-they-owe",
    label: "OMARA",
    summary: "Your agent must keep you updated on your visa application's progress.",
    source: MARA_AGENT_MUST_DO,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["G.089"], source: MARA_AGENT_MUST_DO },
  },
  {
    id: "owes-fee-agreement",
    section: "what-they-owe",
    label: "Choosing an agent",
    summary:
      "OMARA lists agreeing the written service agreement and fees as a step in choosing an agent — settle it upfront.",
    source: MARA_CHOOSE_STEPS,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["G.087"], source: MARA_CHOOSE_STEPS },
  },
  {
    id: "exempt-no-charge",
    section: "what-they-owe",
    label: "OMARA",
    summary: '"Exempt persons" must not charge a fee for immigration assistance.',
    source: MARA_NOT_REGISTERED,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["G.079"], source: MARA_NOT_REGISTERED },
  },
  // ── Formal representation ─────────────────────────────────────────────────────
  {
    id: "form-956",
    section: "formal-representation",
    label: "Form 956",
    summary: "Form 956 is what formally appoints a registered agent, legal practitioner, or exempt person to act for you.",
    source: FORM_956,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["G.080"], source: FORM_956 },
  },
  {
    id: "authorised-recipient",
    section: "formal-representation",
    label: "Form 956",
    summary:
      "Once you appoint an authorised recipient, the Department sends all written communication about your visa to them.",
    source: FORM_956,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["G.081"], source: FORM_956 },
  },
  // ── The 2026 commission ban ───────────────────────────────────────────────────
  {
    id: "commission-ban",
    section: "commission-ban",
    label: "Study Australia",
    summary:
      "Education providers cannot pay agent commissions for student transfers between onshore providers after 31 March 2026.",
    source: STUDY_AU_COMMISSIONS,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["G.090"], source: STUDY_AU_COMMISSIONS },
  },
  {
    id: "hidden-commissions",
    section: "commission-ban",
    label: "Impact analysis",
    summary: "The ban's definition is written to catch hidden commissions too — including bonuses.",
    source: OIA_IMPACT,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["G.092"], source: OIA_IMPACT },
  },
  {
    id: "avg-commission",
    section: "commission-ban",
    label: "Impact analysis",
    summary: "The government's analysis put the 2025 average onshore-transfer commission at about AUD 510.",
    source: OIA_IMPACT,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["G.094"], source: OIA_IMPACT },
  },
  {
    id: "direct-pay-risk",
    section: "commission-ban",
    label: "Impact analysis",
    summary: "The government warned that direct payments to agents for transfers could expose students to exploitation.",
    source: OIA_IMPACT,
    lastVerified: VERIFIED,
    provenance: { findingRefs: ["G.096"], source: OIA_IMPACT },
  },
];
```

- [ ] **Step 3: Create the Zod schema**

Create `lib/data/schema/au-working-with-agents.schema.ts`:

```ts
import { z } from "zod";
import { ProvenanceSchema, HttpUrl, IsoDate } from "./common";

/**
 * Runtime schema for lib/data/source/au-working-with-agents.ts. Guards a free-slug id, the
 * section enum, non-empty label/summary, an http(s) source, optional ISO lastVerified,
 * unique ids, and provenance (>=1 findingRef).
 */
const WorkingWithAgentsRecordSchema = z.object({
  id: z.string().min(1),
  section: z.enum(["do-you-need-one", "verify-register", "what-they-owe", "formal-representation", "commission-ban"]),
  label: z.string().min(1),
  summary: z.string().min(1),
  source: HttpUrl,
  lastVerified: IsoDate.optional(),
  provenance: ProvenanceSchema,
});

export const WorkingWithAgentsSchema = z
  .array(WorkingWithAgentsRecordSchema)
  .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, {
    message: "Working-with-agents ids must be unique",
  });
```

- [ ] **Step 4: Register the module**

In `lib/data/schema/registry.ts`, after the GS import pair (lines 89–90):

```ts
import { AU_WORKING_WITH_AGENTS } from "@/lib/data/source/au-working-with-agents";
import { WorkingWithAgentsSchema } from "@/lib/data/schema/au-working-with-agents.schema";
```

Then append a `DATA_MODULES` entry after the GS entry (the object ending ~line 727, before the closing `];`):

```ts
  {
    // Slice ③ — working-with-agents gov core (category G). 16 prose rows / 16 findings:
    // whether you need an agent, who may lawfully assist, verifying the OMARA register, what
    // an agent owes you, Form 956 representation, and the 2026 onshore commission ban. All
    // findingRefs are fresh category-G rows (no cross-category reuse). Rendered after
    // GenuineStudent on the results page. Fact-only: no scorer reads it.
    category: "G",
    exportName: "AU_WORKING_WITH_AGENTS",
    data: AU_WORKING_WITH_AGENTS,
    schema: WorkingWithAgentsSchema,
    recordLabel: "au-working-with-agents",
    subRecordKeys: [],
    recordInterface: "WorkingWithAgentsFact",
  },
```

- [ ] **Step 5: Typecheck the data layer compiles**

Run: `npm run typecheck`
Expected: clean (0 errors). The module, schema, and registry entry resolve.

- [ ] **Step 6: Mark the 16 findings `value_status:"prose-only"` (BEFORE the flip)**

This is the SLICE-TEMPLATE step-3 move the GS plan omitted (causing `USED_UNSET`). Set it while the findings are still `pending` so no `used`+`unset` state ever exists. Write this prep script to a temp path (not committed) and run it from the repo root:

`C:\Users\thapa\AppData\Local\Temp\merovisa-triage\set-wwa-prose.cjs`:

```js
// Mark the 16 working-with-agents findings prose-only. Mirrors the flip runner's byte
// discipline: detect EOL, preserve the trailing newline, rewrite only matching lines,
// and leave every other line verbatim. Changing an existing key's value preserves key order.
const { readFileSync, writeFileSync } = require("node:fs");
const path = "docs/research-briefs/findings/G.jsonl";
const IDS = new Set([
  "G.074", "G.075", "G.076", "G.077", "G.079", "G.080", "G.081", "G.084",
  "G.085", "G.087", "G.088", "G.089", "G.090", "G.092", "G.094", "G.096",
]);
const raw = readFileSync(path, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
const lines = raw.split(/\r?\n/);
const trailingBlank = lines.length > 0 && lines[lines.length - 1] === "";
const body = trailingBlank ? lines.slice(0, -1) : lines;
let changed = 0;
const out = body.map((line) => {
  if (!line.trim()) return line;
  const f = JSON.parse(line);
  if (IDS.has(f.id) && f.value_status !== "prose-only") {
    f.value_status = "prose-only";
    changed++;
    return JSON.stringify(f);
  }
  return line; // verbatim
});
writeFileSync(path, out.join(eol) + (trailingBlank ? eol : ""), "utf8");
console.log(`prose-only set on ${changed} findings`);
```

Run: `node C:\Users\thapa\AppData\Local\Temp\merovisa-triage\set-wwa-prose.cjs`
Expected: `prose-only set on 16 findings`

- [ ] **Step 7: Flip the 16 findings `pending → used` from code**

Run (PowerShell): `$env:FLIP_STATUS="1"; npx vitest run tests/data/flip-status.run.test.ts; Remove-Item Env:FLIP_STATUS`
Expected console line: `flip-status: files=1 promoted=16 demoted=0 rewired=0 refused=0 refToRejected=0`

The runner's `applyChange` sets `status:"used"`, adds `used_by`, and **clears `triage`/`triage_reason`** on each (the GS-slice triage-clear). It preserves the `value_status:"prose-only"` set in Step 6.

- [ ] **Step 8: Inspect the findings diff — only the 16 changed, as expected**

Run: `git diff --stat docs/research-briefs/findings/`
Expected: only `G.jsonl` changed. Then `git diff docs/research-briefs/findings/G.jsonl` and confirm each of the 16 lines shows exactly: `status` `pending → used`, `value_status` `unset → prose-only`, `used_by` added (the `au-working-with-agents[...]` recordPath), and `triage`/`triage_reason` removed. No other finding touched.

- [ ] **Step 9: Run the data gate**

Run: `npx vitest run tests/data/`
Expected: all green — reconcile (`used=482 · 0 orphans · 0 drift · 0 open-conflict-uses`), schema parses, flip-status normal-mode clean (no promote/demote/refuse/rewire), findings-integrity green (no `USED_UNSET`).

- [ ] **Step 10: Confirm the ledger moved by exactly 16**

Run: `node docs/research-briefs/_tools/build-ledger.js`
Expected: `used` 466 → 482, `pending` 648 → 632. Inspect `git diff` of the regenerated ledger markdown — only counts and the 16 rows move.

- [ ] **Step 11: Commit**

```bash
git add lib/data/types.ts lib/data/source/au-working-with-agents.ts lib/data/schema/au-working-with-agents.schema.ts lib/data/schema/registry.ts docs/research-briefs/findings/G.jsonl docs/research-briefs/findings-clusters.md
git commit -m "feat(agents-slice): sourced working-with-agents module + 16 gov findings used"
```
(Adjust the ledger path if `build-ledger.js` writes a different filename; include whatever it regenerated.)

---

## Task 2: Results panel + analytics surface + wiring

**Files:**
- Create: `components/results/working-with-agents.tsx`, `tests/components/working-with-agents.test.tsx`
- Modify: `lib/analytics/events.ts`, `tests/analytics/events.test.ts`, `components/results/results.tsx`

- [ ] **Step 1: Write the failing component test**

Create `tests/components/working-with-agents.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorkingWithAgents } from "@/components/results/working-with-agents";

describe("WorkingWithAgents", () => {
  it("renders the eyebrow and five section headings", () => {
    render(<WorkingWithAgents />);
    expect(screen.getByText("Working with an agent (Australia)")).toBeInTheDocument();
    expect(screen.getByText("Do you need an agent?")).toBeInTheDocument();
    expect(screen.getByText("Check the register first")).toBeInTheDocument();
    expect(screen.getByText("What your agent owes you")).toBeInTheDocument();
    expect(screen.getByText("Formal representation")).toBeInTheDocument();
    expect(screen.getByText("The 2026 commission ban")).toBeInTheDocument();
  });

  it("copy-locks the four trust-sensitive lines verbatim", () => {
    render(<WorkingWithAgents />);
    expect(
      screen.getByText(
        'Immigration assistance can only be given by registered migration agents, Australian legal practitioners, or limited "exempt persons".',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Education providers cannot pay agent commissions for student transfers between onshore providers after 31 March 2026.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The government warned that direct payments to agents for transfers could expose students to exploitation.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "General context on migration assistance and education-agent commissions for Australia, not legal advice.",
      ),
    ).toBeInTheDocument();
  });

  it("links rows to their government sources", () => {
    render(<WorkingWithAgents />);
    expect(screen.getByRole("link", { name: "OMARA register" })).toHaveAttribute(
      "href",
      expect.stringContaining("portal.mara.gov.au"),
    );
    expect(screen.getByRole("link", { name: "Study Australia" })).toHaveAttribute(
      "href",
      expect.stringContaining("studyaustralia.gov.au"),
    );
    expect(screen.getAllByRole("link", { name: "Form 956" })[0]).toHaveAttribute(
      "href",
      expect.stringContaining("956.pdf"),
    );
    expect(screen.getAllByRole("link", { name: "Impact analysis" })[0]).toHaveAttribute(
      "href",
      expect.stringContaining("oia.pmc.gov.au"),
    );
  });

  it("renders the first section open and the rest collapsed", () => {
    const { container } = render(<WorkingWithAgents />);
    const details = container.querySelectorAll("details");
    expect(details).toHaveLength(5);
    expect(details[0]?.hasAttribute("open")).toBe(true);
    expect(details[1]?.hasAttribute("open")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/components/working-with-agents.test.tsx`
Expected: FAIL — cannot resolve `@/components/results/working-with-agents` (module not created yet).

- [ ] **Step 3: Create the panel component**

Create `components/results/working-with-agents.tsx` (exact structural mirror of `genuine-student.tsx`):

```tsx
import { AU_WORKING_WITH_AGENTS } from "@/lib/data/source/au-working-with-agents";
import type { WorkingWithAgentsFact } from "@/lib/data/types";
import { SourceAnchor } from "@/components/analytics/source-anchor";

const SECTIONS: { id: WorkingWithAgentsFact["section"]; heading: string }[] = [
  { id: "do-you-need-one", heading: "Do you need an agent?" },
  { id: "verify-register", heading: "Check the register first" },
  { id: "what-they-owe", heading: "What your agent owes you" },
  { id: "formal-representation", heading: "Formal representation" },
  { id: "commission-ban", heading: "The 2026 commission ban" },
];

const DISCLAIMER =
  "General context on migration assistance and education-agent commissions for Australia, not legal advice.";

/**
 * Working-with-agents trust panel — gov-sourced guidance on using an agent for an Australian
 * student visa, in five collapsible sections (native <details>, first open). Mirrors
 * GenuineStudent's calm-authority shell. Purely presentational; every row links to its gov
 * source through SourceAnchor (surface "working-with-agents"). No personal odds, no scoring.
 */
export function WorkingWithAgents() {
  return (
    <aside className="flex flex-col gap-3 rounded-md border border-line bg-bg-tint p-4 text-[14px] text-ink-soft">
      <span className="font-mono text-[11.5px] uppercase tracking-wide text-ink-faint">
        Working with an agent (Australia)
      </span>

      <div className="flex flex-col gap-2">
        {SECTIONS.map((section, i) => (
          <details
            key={section.id}
            open={i === 0}
            className="group border-t border-line pt-2 first:border-t-0 first:pt-0"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between font-mono text-[11px] uppercase tracking-wide text-ink-faint marker:content-['']">
              {section.heading}
              <span className="transition-transform duration-200 ease-calm group-open:rotate-90" aria-hidden>
                &rsaquo;
              </span>
            </summary>
            <ul className="mt-2 flex flex-col gap-1.5">
              {AU_WORKING_WITH_AGENTS.filter((r) => r.section === section.id).map((r) => (
                <li key={r.id} className="flex items-baseline justify-between gap-3">
                  <span>{r.summary}</span>
                  <SourceAnchor
                    surface="working-with-agents"
                    href={r.source}
                    title={r.lastVerified ? `verified ${r.lastVerified}` : undefined}
                    className="shrink-0 font-mono text-ink hover:text-primary hover:underline"
                  >
                    {r.label}
                  </SourceAnchor>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>

      <p className="text-[12.5px] text-ink-faint">{DISCLAIMER}</p>
    </aside>
  );
}
```

- [ ] **Step 4: Add the analytics surface**

In `lib/analytics/events.ts`, extend the `SourceSurface` union (line 19) so it ends:

```ts
  | "matches"
  | "genuine-student"
  | "working-with-agents";
```

- [ ] **Step 5: Update the analytics type pin**

In `tests/analytics/events.test.ts`, extend the `source_link_clicked.surface` assertion (lines 65–67):

```ts
    expectTypeOf<AnalyticsEvents["source_link_clicked"]["surface"]>().toEqualTypeOf<
      "factor-bars" | "refusal-recovery" | "cost-to-apply" | "checklist" | "matches" | "genuine-student" | "working-with-agents"
    >();
```

- [ ] **Step 6: Run the component test to verify it passes**

Run: `npx vitest run tests/components/working-with-agents.test.tsx`
Expected: PASS (4/4).

- [ ] **Step 7: Wire the panel into the results page**

In `components/results/results.tsx`: add the import after the `GenuineStudent` import (line 14):

```tsx
import { WorkingWithAgents } from "./working-with-agents";
```

Then render it immediately after `<GenuineStudent />` (line 69), with a comment:

```tsx
      <GenuineStudent />
      {/* Trust-defense triptych closes here: who to trust for help. Gov-sourced (OMARA/DHA +
          the 2026 commission ban), collapsible, not gated. */}
      <WorkingWithAgents />
```

- [ ] **Step 8: Typecheck + run the touched tests**

Run: `npm run typecheck`
Expected: clean (the `expectTypeOf` pin in Step 5 is verified here).
Run: `npx vitest run tests/components/working-with-agents.test.tsx tests/analytics/events.test.ts`
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add components/results/working-with-agents.tsx tests/components/working-with-agents.test.tsx lib/analytics/events.ts tests/analytics/events.test.ts components/results/results.tsx
git commit -m "feat(agents-slice): collapsible working-with-agents panel after GenuineStudent"
```

---

## Task 3: Full gate, browser-verify, status, push

**Files:**
- Modify: `docs/PROJECT_STATUS.md`, `~/.claude/.../memory/value-triage-lane.md`, `MEMORY.md`

- [ ] **Step 1: Full gate**

Run: `npm run typecheck` → clean.
Run: `npm run lint` → clean.
Run: `npm test` → all green (the 4 new component tests added; data suite `used=482`).
Confirm goldens byte-identical: `git status` shows no change under any `golden*` file (no scorer reads this module).

- [ ] **Step 2: Adversarially confirm a coverage guard bites**

(No structured values → no `VALUE_DRIFT` to trip; confirm the coverage invariant instead.) Temporarily delete the `provenance` line `findingRefs: ["G.096"]` → change to `findingRefs: []` in `au-working-with-agents.ts`, then run `npx vitest run tests/data/`. Expected: schema fails (provenance requires ≥1 findingRef) **or** reconcile fails coverage (`used` G.096 orphaned). Then revert the edit and re-run `npx vitest run tests/data/` → green. This proves the harness catches a dropped source.

- [ ] **Step 3: Browser-verify on anonymous results**

Start the dev server (`preview_start`). Drive the 9-step wizard to an Australia result (any band). Confirm:
- the **Working with an agent** panel renders directly **after** the Genuine Student panel;
- 5 `<details>`, the first ("Do you need an agent?") open, the rest collapsed;
- 16 source links present; expanding "The 2026 commission ban" shows the 4 commission rows;
- the disclaimer and the three copy-locked lines render verbatim;
- console clean (no errors/warnings).
Capture a screenshot for the report. Stop the dev server.

- [ ] **Step 4: Update PROJECT_STATUS.md**

Add a slice bullet (working-with-agents shipped: 16 gov findings used, panel after GS, new analytics surface; used 466→482, pending 648→632) and advance the backlog (slice ③ done; next = ④ volatile/stale refresh + refusal/recovery extension — ART paper-only change time-sensitive).

- [ ] **Step 5: Update lane memory**

Update `value-triage-lane.md` (mark slice ③ shipped with the commit range; advance the ratified sequence to ④) and the `MEMORY.md` pointer line.

- [ ] **Step 6: Commit + push**

```bash
git add docs/PROJECT_STATUS.md
git commit -m "docs(status): record working-with-agents gov-core slice (slice ③)"
git push origin master
```
Verify the push range, then report.

---

## Self-Review

**Spec coverage:** Every spec decision maps to a task — module/schema/registry/types (T1 Steps 1–4), prose-only + flip (T1 Steps 6–7, the GS-gap fix), panel after GS (T2 Steps 3,7), `"working-with-agents"` surface + pin (T2 Steps 4–5), copy-lock of the 4 trust lines (T2 Step 1), 7 use-later stay pending (T1 only touches the 16 IDs), no generator/golden churn (File Structure "Do NOT touch" + T3 Step 1 goldens check), ledger 466→482 (T1 Step 10). ✓

**Placeholder scan:** none — every code step shows complete content; every command has expected output. ✓

**Type/name consistency:** `WorkingWithAgentsFact` (types) ↔ `AU_WORKING_WITH_AGENTS` (module) ↔ `WorkingWithAgentsSchema` (schema) ↔ registry `recordInterface:"WorkingWithAgentsFact"` / `recordLabel:"au-working-with-agents"`; the 5 section ids match across the interface, schema enum, module rows, and the component `SECTIONS`; surface string `"working-with-agents"` matches across `events.ts`, the test pin, and the component `SourceAnchor`. The 16 finding IDs are identical in the prep script (T1 Step 6) and the module `findingRefs`. ✓
