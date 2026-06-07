# Per-program document checklist — design

**Date:** 2026-06-08
**Status:** Approved in brainstorming (scope + 3 adjustments locked); pending spec review before plan.
**Slice of:** Phase 5 documents/checklist. The documents *vault* (`/documents`) shipped & is live; this is the remaining piece — the per-program checklist that maps a program's requirements → the documents you need.

---

## 1. Purpose

For one program, answer the two student questions the vault can't:

- **"What documents do I need now?"**
- **"What comes after I'm offered a place?"**

The generic vault lists every possible document kind. The checklist makes it *program-specific* and *stage-aware*, marking what you already have vs. what's still missing.

## 2. Core shape — a pure view, no migration

The checklist is a **join of three things that already exist**: a program's attributes × the document taxonomy (`DOCUMENT_META`) × the user's vault uploads (`documents` table). Nothing new is persisted — "have" is derived live from the user's uploaded document kinds.

Rejected alternative: a `checklist_items` table. It would be state to keep in sync for zero benefit; the vault already is the source of truth for "do you have document X?".

`documents.kind` is a `text` column with a fixed 20-value CHECK constraint (no Postgres enum). **v1 adds no new kind** — anything without a home kind (scholarship award letter, AHPRA registration) is surfaced as an *informational* item (`kind: null`, no upload binding), keeping the slice migration-free.

## 3. The generator

`lib/checklist/generator.ts` — pure, deterministic, TDD'd like `lib/plan/generator.ts`.

```ts
generateChecklist(inputs: {
  program: Program;
  sections: ProfileSections;
  uploadedKinds: Set<DocumentKind>;
}): ChecklistItem[]
```

```ts
// lib/checklist/types.ts
export interface ChecklistItem {
  key: string;                          // stable id (tests + React keys), e.g. "passport", "fin-loan-sanction"
  kind: DocumentKind | null;            // null = informational, no vault binding
  label: string;
  group: DocumentKindMeta["group"];     // identity | academic | english | financial | employment | visa | other
  stage: "now" | "after-offer";
  requirement: "required" | "recommended";
  status: "have" | "missing" | "info";  // have/missing when kind != null (from uploadedKinds); "info" when kind == null
  note?: string;
  source?: ChecklistSource;             // attached ONLY where a real sourced constant/module exists
}

export interface ChecklistSource {      // adapts to the existing SourceLine props at implementation
  label: string;
  url: string;
  lastVerified?: string;
}
```

Status derivation: `kind != null` → `uploadedKinds.has(kind) ? "have" : "missing"`; `kind == null` → `"info"`.

### 3.1 Rule set

**Stage `now`:**

*Identity*
- `passport` — required, always.
- `national-id` (Citizenship / National ID) — required, always.
- `birth-certificate` — recommended, always.

*Academic (by `program.level`)*
- `masters` → `bachelors-transcript` required; `plus-two` + `slc-see` recommended (supporting).
- `doctorate` → `masters-transcript` + `bachelors-transcript` required; `plus-two` recommended.
- `bachelors` → `plus-two` + `slc-see` required.

*English*
- One test report required. Kind = `sections.english.test` if set, else default `ielts` with a note "(or PTE / TOEFL)".
- Note states the program's own requirement: "This program lists IELTS {minEnglish}{, each band ≥ minEnglishBand}". Source = `program.source` (the program's listing).
- **Nursing delta** (`program.field === "nursing"`, or `program.notes` mentions AHPRA): append "Nursing programs typically require each band ≥ 7" and add an informational AHPRA item (see deltas).

*Financial (by `sections.finance.source: FundingSource`)* — every branch's **first required item** carries the DHA capacity note + `SourceLine` (from `AU_DHA_LIVING_CAPACITY_AUD`, the same sourced constant the plan engine uses), plus the Nepal-AL3 seasoning note when policy is L3.

| funding source | items |
|---|---|
| `self-funded` | `bank-statement` required |
| `parents-family` | `bank-statement` required + `sponsor-income` required |
| `education-loan` | `loan-sanction` required + `bank-statement` recommended |
| `mixed` | `bank-statement` required + `loan-sanction` required + `sponsor-income` recommended |
| `scholarship-dependent` | **info** "Scholarship / sponsorship award letter" (`kind: null`, required) + `bank-statement` recommended |
| unset / unknown | `bank-statement` required, note "bank statement, loan sanction, or sponsor income — depending on how you'll fund your study" |

> **One refinement to flag for review:** `self-funded` intentionally omits `sponsor-income` — a student funding themselves has no third-party sponsor. The brainstorm grouping listed bank-statement / sponsor-income together for {self-funded, parents-family, mixed}; I split sponsor-income out to where a sponsor actually exists (parents-family required, mixed recommended). Say the word if you'd rather self-funded also surface sponsor-income.

*Employment (conditional)*
- `sections.work?.title` set → `employment-letter` + `salary-slip` recommended ("strengthens admissions + Genuine Student narrative").
- `sections.gap?.years >= 1` → ensure an `employment-letter` item exists (deduped with the above), note "Evidence for your study gap."

**Stage `after-offer` (visa group, all required):**
- `offer-letter` — "Issued when a university accepts you."
- `coe` — "Confirmation of Enrolment — after you accept and pay your deposit."
- `oshc` — "Overseas Student Health Cover — before you lodge the visa."
- `medical` — "Panel medical exam — when DHA requests it."

These render under "After your offer" so a missing status reads as *not yet*, never *behind*.

### 3.2 Program-specific deltas
- **Nursing** → English band-7 note (above) + informational item `{ kind: null, label: "AHPRA registration", group: "academic", stage: "now", requirement: "required", status: "info" }` with a source line **only if** a sourced AHPRA fact exists in `lib/data/source/*`; otherwise stated without a fabricated citation.

### 3.3 Sourcing honesty
Attach `source` **only** where a real sourced constant/module backs the claim — DHA capacity (`AU_DHA_LIVING_CAPACITY_AUD`), the program's English requirement (`program.source`), AL3 seasoning (existing policy constant), AHPRA (only if a sourced fact exists). Never fabricate a citation. This mirrors the plan generator and the `/matches` provenance work.

## 4. Stage-driven layout (adjustment 1)

The page's top-level hierarchy is **stage**, not requirement level:

- **"What you need now"** — identity / academic / english / financial / employment, sub-grouped by `GROUP_LABELS` for scannability.
- **"After your offer"** — the visa group.

Within a stage, `requirement` is a quiet per-item tag (a subtle "Recommended" pill on recommended items; required items unadorned). `status` drives the visual state (have = primary-border/✓, missing = neutral, info = neutral with an info affordance). This matches the student's actual mental model ("now vs later"), not a bureaucratic required/optional split.

## 5. Route & navigation

- **`app/(app)/checklist/[programId]/page.tsx`** — auth-gated (mirrors `/documents`: redirect to `/auth?next=…` when no session). Reads program + university (`lib/programs/repo`), profile sections, and the user's uploaded kinds (`listDocumentsForUser` → `Set<DocumentKind>`); calls `generateChecklist`; renders the two stage sections.
- **`app/(app)/checklist/page.tsx`** (bare) — replace the redirect-to-vault stub with a **landing** (adjustment 4):
  - shortlisted programs (`listShortlistForUser`) → each links to `/checklist/{programId}`;
  - if no shortlist: top suggestions from the latest assessment **only if it reuses an existing match computation with no new plumbing**; otherwise skip straight to the CTA;
  - always: a CTA to `/matches` and a link to the `/documents` vault.
- **ProgramCard** gains a "Document checklist →" link to `/checklist/{programId}`.
- The dashboard "Documents" stat already points at `/checklist` ([stats-row.tsx:28](../../components/dashboard/stats-row.tsx)) — now lands on the new landing; verify label reads sensibly, no other change.

## 6. Upload affordance (adjustment 2 — contingent, never a refactor)

A missing item needs a way to act. The vault's [`DocumentCard`](../../components/documents/document-card.tsx) is already self-contained — it owns the exact `POST /api/documents/upload` path internally and takes only `meta` + `initial`.

- **Default:** embed `DocumentCard` as-is for a missing item's kind — exact reuse, **zero extraction, zero new upload code**. Uploading from the checklist then flips have/missing *and* fires the existing auto re-score + plan-invalidate side-effects ([upload/route.ts:104-127](../../app/api/documents/upload/route.ts)).
- **Fallback:** if `DocumentCard` doesn't compose cleanly in a checklist row (visually heavy / wrong affordances in context), ship a plain **"Upload in documents →"** deep-link to `/documents` instead.

Hard guard: **no extraction, no new upload path, no `DocumentCard` refactor**. If reuse isn't trivial, it's the link. This slice must not become an upload refactor. Info items (`kind: null`) always render as the link (or plain text) — there's nothing to upload.

## 7. Components (reuse-first, "calm authority")

- `components/checklist/checklist-stage-section.tsx` — a stage heading + its items, sub-grouped by `GROUP_LABELS`.
- `components/checklist/checklist-item.tsx` — label, requirement pill, status, note, optional `SourceLine`, upload affordance (embed or link per §6).
- Landing: `components/checklist/checklist-landing.tsx` (or inline in the bare page).
- Reuse: `SourceLine` (results), `Button` (ui), `DocumentCard` (documents, §6).

## 8. TDD plan

1. **`tests/checklist/generator.test.ts` (RED first)** — the heart:
   - masters → requires `bachelors-transcript`; bachelors → requires `plus-two` + `slc-see`.
   - English item required; note reflects `program.minEnglish`; nursing → band-7 note + AHPRA info item.
   - financial by funding source: each of the 6 branches yields the table in §3.1; `scholarship-dependent` yields a `kind: null` info item; unknown yields the general bank-statement.
   - have/missing derived from `uploadedKinds`; info items always `status: "info"`.
   - visa items are `stage: "after-offer"`.
   - employment items appear only with `work.title` or `gap.years >= 1` (and dedupe).
   - financial lead item carries the DHA sourced note.
   - **adversarial:** mutate one rule (e.g. drop the nursing delta) → a test bites.
2. **Component render tests** — `checklist-item` (have / missing / info; required vs recommended tag; `SourceLine` present iff `source` set); `checklist-stage-section` (Now vs After-offer headings).
3. **Page composition test** — `/checklist/[programId]` renders both stages for a fixture program + profile + uploads, following the existing `Results` / `MatchesPage` page-test pattern (mocked supabase/repo).
4. **Landing test** — shortlist present → lists programs; absent → CTA to `/matches`.

## 9. Verification

- `npm run typecheck` clean; `npm run lint` clean (gate restored); full `npm test` green.
- **`golden-assessments.json` byte-identical** — the checklist touches no scoring path (`compute.ts` / the engine read none of this). Confirm an empty diff.
- No migration; confirm no schema change.
- **Signed-in page is OAuth-gated → not headlessly smokable.** The generator + component + page-composition tests are the functional proof; the live page stays in the deferred-smoke bucket (user's choice, 2026-06-08).
- Never stage the WIP trio (`CLAUDE.md`, `tests/integration/wizard-to-results.test.tsx`, `docs/debugging/`). Each commit ends with the `Co-Authored-By: Claude Opus 4.8 (1M context)` trailer.

## 10. Scope boundaries (YAGNI)

**In v1:** signed-in, document-centric, rule-derived, no migration, no persisted checklist state.

**Deferred:**
- Dedicated `scholarship-letter` / AHPRA document kinds (would need a CHECK-constraint migration) — informational items for now.
- Anonymous "what you'll need" preview.
- Consolidated multi-program checklist.
- Non-document items beyond the few info ones — that's the plan generator's job; the two surfaces stay complementary, intentionally not merged.
- Deep-link to a specific kind anchor inside `/documents` (v1 links to the vault; group hash best-effort).

## 11. File manifest

**New:**
- `lib/checklist/types.ts`
- `lib/checklist/generator.ts`
- `app/(app)/checklist/[programId]/page.tsx`
- `components/checklist/checklist-stage-section.tsx`
- `components/checklist/checklist-item.tsx`
- `components/checklist/checklist-landing.tsx` (or inline in the bare page)
- `tests/checklist/generator.test.ts`
- `tests/checklist/checklist-item.test.tsx` (+ stage-section / page / landing as the pattern fits)

**Modified:**
- `app/(app)/checklist/page.tsx` — stub redirect → landing.
- `components/matches/program-card.tsx` — add "Document checklist →" link.
- `components/dashboard/stats-row.tsx` — verify the "Documents" stat label/target (likely no change).
