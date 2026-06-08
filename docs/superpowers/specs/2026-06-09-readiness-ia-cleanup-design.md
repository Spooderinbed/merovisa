# Readiness IA cleanup — checklist + plan information architecture

**Status:** Design approved 2026-06-09. A **pure product / IA slice** — clarity only. **No data modules, no findings, no ledger movement, no scoring change.** Follows the audit of checklist/plan density (this session).
**Lane:** Adjacent to "ledger by slice" but explicitly *not* a ledger slice — it touches no `lib/data/source/*`, no `findings/*.jsonl`, no `findings-ledger.md`, no scorer. It cleans up the surfaces the ledger slices have been filling.
**Builds on:** Slices A–H. After eight slices poured visa-readiness content into the checklist + plan, the after-offer checklist and the AU-gated plan block had drifted into dense, look-alike lists. This slice re-establishes a clear product model: **checklist = what to gather / know; plan = what to do next; visa preparation = sequential Australia-specific work.**

---

## 1. Context & goal

The audit found three concrete density problems in the generated surfaces:

1. **Checklist "After your offer" mixes documents with process steps** — one "Visa" group of 7 items, 3 of them `kind:null` process steps (NOC, biometrics, police) interleaved with 4 real documents (offer, CoE, OSHC, medical).
2. **"Bring this" is the chip for every `kind:null` item** — but all 5 such items are guidance/process, not documents you bring. The label misleads, and on `recommended` info items it stacks with a "Recommended" pill (e.g. police-certificate shows both).
3. **The plan's "Medium impact" group is a junk drawer** — 6 mediums, 5 of them AU visa-prep actions that mirror the checklist's lodgement steps; impact stops discriminating.

**Goal:** three surgical clarity fixes, approved with these choices:

- **A — Split documents from steps in the after-offer checklist.** Two labeled blocks: **Documents** and **Visa lodgement steps**. The "now" stage stays topical (unchanged structure).
- **B — Rename the info chip.** Replace "Bring this" with two chips — **Step** (process action) and **Note** (reference / how-to) — driven by an explicit `infoKind` field; and **suppress the required/recommended pill for `kind:null` info items** (the chip + note text carry the meaning).
- **C — Sub-group the plan by phase.** Two top-level sections: **Your next steps** (impact-grouped, destination-agnostic) and **Visa preparation** (the AU-gated process actions as a sequence, **Genuine Student as the lead item**, impact pills kept per card).

**Non-goal / guarantee:** no scoring code is touched (`golden-assessments.json` byte-identical, `lib/scoring/*` + `lib/data/policy/funding-reliability.ts` untouched); no sourced data, no findings, no ledger regen. De-dupe of overlapping checklist/plan content is **explicitly deferred** to a later product decision (the two surfaces are allowed to overlap while they play distinct roles).

---

## 2. Scope — what changes, what doesn't

### Changes (product code only)

| File | Change | Part |
|---|---|---|
| `lib/checklist/types.ts` | add `infoKind?: "step" \| "note"` to `ChecklistItem` (meaningful only when `kind === null`) | B |
| `lib/checklist/generator.ts` | set `infoKind` on every `kind:null` item (no other logic change) | B |
| `components/checklist/checklist-view.tsx` | compute labeled **blocks** per stage (topical for "now"; Documents + Visa lodgement steps for "after-offer") | A |
| `components/checklist/checklist-stage-section.tsx` | render from a `blocks` prop instead of grouping internally by `GROUPS` | A |
| `components/checklist/checklist-item.tsx` | info chip from `infoKind` ("Step"/"Note"); suppress requirement pill when `kind === null` | B |
| `lib/plan/phases.ts` *(new)* | `VISA_PREP_KINDS` — the ordered list of AU visa-prep plan kinds + membership/order helpers | C |
| `components/plan/plan-list.tsx` | two sections — "Your next steps" (impact-grouped rest) + "Visa preparation" (visa-prep, ordered, GS lead) | C |
| `docs/PROJECT_STATUS.md` | actual test count + a product-cleanup bullet (no ledger counts) | — |
| tests (4 files) | RED→GREEN per part (see §8) | A/B/C |

### Explicitly NOT changed

- **No scorer / goldens** — this slice imports no `lib/scoring/*`; `financial.ts`, `funding-reliability.ts`, `golden-assessments.json` stay byte-identical.
- **No data / findings / ledger** — no `lib/data/source/*`, no `findings/*.jsonl`, no `build-ledger.js`, no slice-kit flip/reconcile/adversarial.
- **No DB / migration** — the plan grouping is derived at render time from `kind` (every `PlanItemRow` already carries `kind`); no new column, no migration.
- **No generator gating change** — the AU-gating of plan items is unchanged; "Visa preparation" simply re-groups the items the generator already emits. The checklist generator's only change is the additive `infoKind` field.
- **No copy change to notes/bodies** — the wording the eight slices landed stays as-is. This slice changes *structure and chips*, not the sourced sentences.

---

## 3. Part A — Split the after-offer checklist into Documents + Visa lodgement steps

The dividing line already exists in the data model: `kind === null` *is* "informational, no vault binding." So the split is mechanical — no per-item tagging needed beyond what Part B adds.

### Rendering model — labeled blocks

`ChecklistStageSection` becomes a dumb renderer of pre-computed blocks. `ChecklistView` decides the grouping axis per stage:

```ts
// ChecklistView
const now = items.filter((i) => i.stage === "now");
const later = items.filter((i) => i.stage === "after-offer");

const nowBlocks = GROUPS
  .filter((g) => now.some((i) => i.group === g))
  .map((g) => ({ label: GROUP_LABELS[g], items: now.filter((i) => i.group === g) }));

const laterBlocks = [
  { label: "Documents", items: later.filter((i) => i.kind !== null) },
  { label: "Visa lodgement steps", items: later.filter((i) => i.kind === null) },
].filter((b) => b.items.length > 0);
```

```tsx
<ChecklistStageSection title="What you need now" subtitle="Gather these to apply and to build your visa case." blocks={nowBlocks} />
<ChecklistStageSection title="After your offer" subtitle="You'll add these once a university offers you a place." blocks={laterBlocks} />
```

`ChecklistStageSection({ title, subtitle, blocks })` renders the title/subtitle, then for each non-empty block a mono label + its `<ul>` of `<ChecklistItem>` (same markup it uses today for a group). It returns `null` when `blocks` is empty. The `GROUPS`/`GROUP_LABELS` import moves from the section up into the view.

### Result

**After your offer** (AU masters):
- **Documents** — University offer letter, Confirmation of Enrolment (CoE), Overseas Student Health Cover (OSHC), Panel medical exam
- **Visa lodgement steps** — No Objection Certificate (NOC), Biometrics letter, Police certificate

The **"now"** stage is unchanged structurally — still topical (Identity / Academic / English Proficiency / Financial / Employment), with its `kind:null` items (doc-preparation, fin-nrb-remittance, fin-scholarship, AHPRA) staying in their topical groups and simply gaining the new chip from Part B.

New assertion target: `ChecklistView` renders "Documents" and "Visa lodgement steps" under "After your offer" (replacing the single "Visa" label). The existing `checklist-view.test.tsx` "Visa" assertion is updated to these two labels.

---

## 4. Part B — Rename the info chip + suppress the requirement pill

### `infoKind` field (explicit, not stage-inferred)

`ChecklistItem` gains `infoKind?: "step" | "note"`. It is set only on `kind:null` items. Explicit (per the approved choice) so the chip is precise per item and future items can deviate from any stage pattern.

```ts
// lib/checklist/types.ts
export type ChecklistInfoKind = "step" | "note";
export interface ChecklistItem {
  // ...existing fields...
  infoKind?: ChecklistInfoKind; // set when kind === null; drives the Step/Note chip
}
```

### Chip vocabulary

- **Step** — a discrete action in the application/visa process.
- **Note** — reference or how-to guidance attached to documents.

### Mapping (every `kind:null` item)

| key | stage / group | `infoKind` | rationale |
|---|---|---|---|
| doc-preparation | now / identity | **note** | how-to: translations + certified copies |
| fin-nrb-remittance | now / financial | **note** | reference: what the bank needs to release funds |
| fin-scholarship | now / financial | **note** | reference: the award letter to provide (scholarship funding) |
| ahpra | now / academic | **note** | informs of the AHPRA registration requirement *(judgment call — see below)* |
| noc-application | after-offer / visa | **step** | apply for the NOC |
| biometrics | after-offer / visa | **step** | give biometrics after lodging |
| police-certificate | after-offer / visa | **step** | obtain the police certificate |

The current values happen to align with stage (now → note, after-offer → step), but the field is explicit so this is not load-bearing. **AHPRA is the one judgment call:** it states a requirement (note) yet implies an action (register → step). Defaulted to **note**; trivially flippable to **step** in review.

### Chip + pill rendering (`checklist-item.tsx`)

```tsx
const DOC_STATUS_LABEL = { have: "Have", missing: "Needed" } as const;
const INFO_CHIP = { step: "Step", note: "Note" } as const;
// ...
{/* requirement pill: only for real documents, never for kind:null info items */}
{item.kind !== null && item.requirement === "recommended" && (
  <span className="…">Recommended</span>
)}
{/* status / info chip */}
<span className="font-mono text-[11px] uppercase tracking-wide …">
  {item.status === "info" ? INFO_CHIP[item.infoKind ?? "note"] : DOC_STATUS_LABEL[item.status]}
</span>
```

- Info items render exactly one chip — "Step" or "Note" — and **no requirement pill**. (Today police-certificate shows "Recommended" + "Bring this"; after this, just "Step". Its "may ask" conditionality already lives in the note copy, so nothing is lost — this is the slice-H interaction we accepted.)
- Document items are unchanged: "Have" (with the ✓) / "Needed", plus the "Recommended" pill when applicable.
- Chip styling unchanged (mono, uppercase, `text-ink-faint`; `text-strong` for "Have").

New assertion targets: a `note`-kind info item renders "Note" and no "Recommended"/"Needed"/"Bring this"; a `step`-kind info item renders "Step"; police-certificate (recommended + info) renders "Step" with **no** "Recommended" pill; "Bring this" appears nowhere.

---

## 5. Part C — Sub-group the plan by phase

### `lib/plan/phases.ts` (new)

The canonical, ordered list of AU visa-prep plan kinds. Render-time only (no persistence). A code comment notes that a future slice adding an AU visa-prep action must add its kind here.

```ts
import type { PlanItemRow } from "./types";

/**
 * AU visa-preparation plan kinds, in the order to tackle them (Genuine Student leads).
 * Rendered as the "Visa preparation" section, separate from the impact-grouped
 * "Your next steps". A future slice that adds an AU visa-prep action MUST add its kind
 * here so it lands in this section. Render-time grouping — no DB column, no migration.
 */
export const VISA_PREP_KINDS = [
  "prepare-gs-answers",
  "apply-for-noc",
  "translate-certify-documents",
  "prepare-health-exam",
  "prepare-biometrics",
  "prepare-police-certificate",
] as const;

const ORDER = new Map(VISA_PREP_KINDS.map((k, i) => [k, i] as const));
export const isVisaPrep = (kind: string): boolean => ORDER.has(kind);
export const visaPrepOrder = (kind: string): number => ORDER.get(kind) ?? Number.MAX_SAFE_INTEGER;
```

### `plan-list.tsx` — two sections

```ts
const open = items.filter((i) => i.status === "todo");
const closed = items.filter((i) => i.status !== "todo");

const visaPrep = open.filter((i) => isVisaPrep(i.kind))
  .sort((a, b) => visaPrepOrder(a.kind) - visaPrepOrder(b.kind)); // GS first
const rest = open.filter((i) => !isVisaPrep(i.kind));
const high = rest.filter((i) => i.impact === "high");
const medium = rest.filter((i) => i.impact === "medium");
const low = rest.filter((i) => i.impact === "low");
```

Render order:

1. **Your next steps** — section title + the existing High / Medium / Low impact sub-groups (with their `(N)` counts), built from `rest`. Skipped entirely if `rest` is empty.
2. **Visa preparation** — section title + subtitle, then `visaPrep` as a flat list of `PlanItemCard`s in `VISA_PREP_KINDS` order. Each card keeps its impact pill (so GS still reads "high"). Skipped entirely if `visaPrep` is empty (e.g. the student hasn't set Australia as primary).
3. **Closed (N)** — unchanged collapsible `<details>`.

The empty state (`items.length === 0` → "All caught up") is unchanged.

**Section titles** match the checklist's stage-section style (`text-[20px] font-medium`), giving the plan the same two-section rhythm as the checklist:

- **Your next steps** — subtitle: "Profile and case work, ranked by impact."
- **Visa preparation** — subtitle: "Australia-specific visa steps, in the order to tackle them."

The impact sub-labels inside "Your next steps" keep their current mono style and `(N)` counts.

New assertion targets: a visa-prep kind (e.g. `prepare-gs-answers`) renders under "Visa preparation", not under an impact group; `prepare-gs-answers` is first among visa-prep; a non-visa-prep kind renders under "Your next steps" with its impact label; "Visa preparation" is absent when no visa-prep items are present. Existing `plan-list.test.tsx` cases (kinds `k1`–`k3`, all non-visa-prep) stay green — they land in "Your next steps" and the impact-label assertions are unaffected.

---

## 6. The product model after the slice

| Surface | Question it answers | Structure |
|---|---|---|
| **Checklist** | what to gather / know | "What you need now" (topical) + "After your offer" → **Documents** + **Visa lodgement steps** |
| **Plan** | what to do next | **Your next steps** (impact-grouped) + **Visa preparation** (AU sequence, GS lead) |

Chips: documents → **Have / Needed**; process actions → **Step**; reference/how-to → **Note**. "Bring this" is retired. Overlap between the checklist's "Visa lodgement steps" and the plan's "Visa preparation" is intentional and tolerated for now (de-dupe deferred).

---

## 7. Architecture notes

- **Checklist is request-time, not persisted:** `generateChecklist` runs server-side and `ChecklistView` renders `ChecklistItem[]` directly, so Parts A + B are pure generator/component/type changes with no storage surface.
- **Plan is persisted, but grouping is render-time:** `PlanPage` reads `PlanItemRow[]` via `listAllPlanForUser` (`lib/plan/repo.ts`); each row carries `kind`. `PlanList` partitions/orders by `kind` using `VISA_PREP_KINDS`. No `PlanItem`/DB change, so persistence, sync ("auto-close satisfied todos"), and the generator are all untouched.
- **Component boundary improves:** `ChecklistStageSection` loses its `GROUPS` coupling and becomes a generic labeled-blocks renderer; the grouping decision lives in `ChecklistView` (one place, two clearly-named axes).

---

## 8. Testing — TDD RED → GREEN (no adversarial/reconcile — no findings)

Per part, write/adjust the test first (RED), then implement (GREEN):

- **`tests/checklist/generator.test.ts`** (Part B): each `kind:null` item carries the expected `infoKind` (table in §4); document items have no `infoKind`. RED first.
- **`tests/checklist/checklist-view.test.tsx`** (Part A): after-offer renders "Documents" + "Visa lodgement steps" (replacing the "Visa" assertion); "now" still renders topical labels ("Identity", "Financial"). RED first (the "Visa" assertion fails after the view change → update it).
- **`tests/checklist/checklist-item.test.tsx`** *(new file — unit-tests the chip logic by rendering `<ChecklistItem>` with crafted items)* (Part B): a `note` item renders "Note" + no requirement pill; a `step` item renders "Step"; a recommended+info item (police-certificate shape) renders "Step" with no "Recommended" pill; "Bring this" is absent; a document item still renders "Needed"/"Have" (+ "Recommended" pill when applicable).
- **`tests/components/plan/plan-list.test.tsx`** (Part C): a visa-prep item renders under "Visa preparation"; `prepare-gs-answers` leads; a non-visa-prep item renders under "Your next steps" with its impact label; "Visa preparation" absent when no visa-prep items. Existing two cases stay green.

Full suite must stay green; the count rises by the net new cases (≈ +6 to +9; use the actual figure in PROJECT_STATUS).

---

## 9. Verification gate

**Hard gate — not "done" until all pass:**

- `npm run typecheck` clean.
- `npm test` full suite green (record the actual count).
- **`git diff master...HEAD -- tests/scoring/__fixtures__/golden-assessments.json` empty** (byte-identical).
- **`git diff master...HEAD -- lib/scoring/financial.ts lib/data/policy/funding-reliability.ts` empty** (scorer untouched).
- **`git diff master...HEAD -- "docs/research-briefs/**" "lib/data/source/**"` empty** (no data/findings/ledger movement — the defining guarantee of this slice).
- No new DB migration (`git status` shows no `supabase/migrations/*` additions).

**Best-effort (non-gating):** browser smoke via the preview tools — `/plan` shows the two sections with GS leading "Visa preparation"; `/checklist/[programId]` shows "Documents" + "Visa lodgement steps". Both routes are OAuth-gated, so this typically falls back to the component tests (`checklist-view`, `checklist-item`, `plan-list`) — note which was used.

---

## 10. Commit plan (granular; git ritual)

One branch (`readiness-ia-cleanup`); granular commits, each typecheck- + test-green, each ending with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer. **Never stage the WIP trio** (`CLAUDE.md`, `tests/integration/wizard-to-results.test.tsx`, `docs/debugging/`); explicit `git add <paths>`, never `git add -A`.

1. **Part B — chip + pill** — `lib/checklist/types.ts` (`infoKind`) + `lib/checklist/generator.ts` (set `infoKind`) + `components/checklist/checklist-item.tsx` + checklist generator/item tests.
2. **Part A — after-offer split** — `components/checklist/checklist-view.tsx` + `checklist-stage-section.tsx` + `checklist-view.test.tsx`.
3. **Part C — plan phase grouping** — `lib/plan/phases.ts` (new) + `components/plan/plan-list.tsx` + `plan-list.test.tsx`.
4. **Status** — `docs/PROJECT_STATUS.md` (actual test count + product-cleanup bullet; no ledger counts).

Then `git merge --ff-only` master → push → delete branch → report. (The spec + plan docs are committed on the branch ahead of the code commits.)

---

## 11. Explicitly NOT in this slice

- No scoring change, no `RULE_VERSION`/`CONFIG_VERSION` bump, no golden regeneration.
- No sourced data, no findings edits, no `build-ledger`, no ledger movement — and therefore no slice-kit flip/reconcile/adversarial step.
- No DB migration, no `PlanItem`/`PlanItemRow` storage change, no generator gating change, no profile-editor change.
- No checklist/plan **content** rewrite — notes and bodies are unchanged; only structure + chips move.
- **No checklist↔plan de-dupe** — deferred to a later product decision. The two surfaces may overlap while they play distinct roles.

---

## 12. Success criteria

1. The after-offer checklist shows **Documents** and **Visa lodgement steps** as separate labeled blocks; "now" stays topical.
2. Every `kind:null` item shows a **Step** or **Note** chip (per §4) and **no** requirement pill; "Bring this" is gone; document items keep Have/Needed (+ Recommended pill).
3. The plan shows **Your next steps** (impact-grouped) and **Visa preparation** (AU sequence with **Genuine Student first**), each card keeping its impact pill; "Visa preparation" is absent for non-AU/unset students.
4. `typecheck` + full suite green; `golden-assessments.json` byte-identical; `lib/scoring/*` + `funding-reliability.ts` untouched; **zero diff under `docs/research-briefs/**` and `lib/data/source/**`**; no new migration.
5. The product model reads cleanly: checklist = gather/know, plan = do next, visa preparation = sequential Australia-specific work — with de-dupe consciously deferred.
