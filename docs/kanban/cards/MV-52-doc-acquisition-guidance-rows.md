# MV-52 — Surface doc-acquisition guidance on academic + English-test rows

**Status:** IN REVIEW — SHIPPED 2026-06-26 on branch `mv-51` (branch+PR flow). Founder closes to Done after merge.

Relates to: the existing doc-acquisition guidance pattern already live on passport (A.043/A.044), NOC (B.017–B.024), police-certificate (A.039/A.100), biometrics (C.127), and doc-preparation rows. Source: 2026-06-26 founder-gap triage (gap #2 — "where/how to obtain guidance renders for some documents but is MISSING on transcripts + IELTS/PTE, even though the datasets are already ledgered").

## Problem

Two Nepal-side document datasets were already ledgered and machine-checked but **unwired** — the checklist rendered the rows without their acquisition guidance:

- `lib/data/source/nepal-document-processing-times.ts` — `tu-equivalence-regular` (A.087): TU academic equivalence, 3 working days regular service. The **transcript rows** (`bachelors-transcript`, `masters-transcript`) carried no `note`/`source`.
- `lib/data/source/nepal-english-test-centres.ts` — IELTS operators/locations/fee (J1.011, J1.012, J1.018). The **English row** stated only admission + visa thresholds; it never said *where to sit the test*.

Pure-wiring gap: the capability and the data both existed; the rows just weren't fed.

## What shipped

`lib/checklist/generator.ts` (wiring only — no new data, no new dataset):

1. **Transcript turnaround** — both transcript rows now carry `TRANSCRIPT_NOTE` + `TRANSCRIPT_SOURCE` (TU CDC, `tucdc.edu.np/faq`, `2026-06-05`). The day count interpolates from `TU_EQUIVALENCE.typicalBusinessDays`. Framed conditionally in copy ("If your degree is from Tribhuvan University …") because there's no profile field for issuing university — TU is by far the most common, and the line reads as a no-op for graduates of other universities. The rows stay **document rows** (`kind: "bachelors-transcript"` / `"masters-transcript"`), like the passport row — note + source, no `infoKind`.
2. **Where to sit IELTS** — a new now-stage info step `ielts-centres` (`kind: null`, `infoKind: "step"`, `group: "english"`, `requirement: "recommended"`) interpolates both operators, location counts, and the IDP computer-delivered fee from `NEPAL_ENGLISH_TEST_CENTRES`.
3. **Trust-first gate** — the IELTS row is emitted **only when `testKind === "ielts"`** (the default when no test is chosen). PTE/TOEFL centre logistics are deferred in the dataset, so they are **never fabricated**: choosing PTE or TOEFL emits no centre row.

**Source-display guard** (mirrors the biometrics guard): the IELTS note carries claims from both centre records but shows one SourceLine — the British Council dates/fees/locations page (the dominant nine-location operator, the natural primary for "where can I sit IELTS"). The IDP count + fee stay reconcile-backed via J1.012/J1.018 in the dataset, independent of the rendered URL.

No component change needed — `components/checklist/checklist-item.tsx` already renders any `note` + `source`. No scorer path touched; verdicts stay banded, no raw %.

## Test plan / evidence (TDD RED→GREEN, +4)

`tests/checklist/generator.test.ts` (+4):

- **transcript guidance on bachelor's** — `bachelors-transcript` keeps `kind: "bachelors-transcript"`, note contains "Tribhuvan University" / "equivalence" / "3 working days", source is `tucdc.edu.np/faq` + `2026-06-05`. *(RED: note was undefined.)*
- **transcript guidance on master's** — for a doctorate program, `masters-transcript` carries the same equivalence note + source. *(RED: undefined.)*
- **IELTS centre info step** — with test ielts (and by default), `ielts-centres` is `{kind:null, status:info, group:english, stage:now, requirement:recommended, infoKind:step}`; note contains "British Council", "IDP", "Kathmandu", "9 locations", "36,000"; source contains `britishcouncil.org.np`. *(RED: row absent.)*
- **no fabrication for PTE/TOEFL** — neither test emits `ielts-centres`. *(GREEN from the start — the absence guard; locks the trust-first contract.)*

**Gate green:** `npm run typecheck` clean · `npm run lint` 0 errors (1 pre-existing `docs/kanban/build.mjs` warning, unrelated) · full suite **1368 passed** (231 files, was 1364 — +4) · the existing `ChecklistView` render test still passes with the extra row.

## Out of scope (do NOT add here)

- **PTE/TOEFL centre logistics** — deferred in the dataset until sourced from the test owners (not a single centre's self-description). Wiring them would mean fabricating; left out by design.
- **TU equivalence urgent service / non-TU universities / district-office passport ranges** — the dataset scopes to fixed working-day turnarounds only; range/same-day modelling is a separate slice (noted in the dataset header).
- A **per-university transcript branch** (showing the note only for TU graduates) — needs a profile field that doesn't exist; the conditional copy covers it honestly.

## Founder-owned residuals (not blockers)

- **Merge the PR to master** (the single founder-gated step) → then close this card to **Done**.

## How a cold agent resumes

Done. Pure wiring in `lib/checklist/generator.ts` (two note constants + source consts near the other guidance constants; note/source added to both transcript `add(...)` calls; one new gated `ielts-centres` info row after the english row) + 4 tests. If PTE/TOEFL centre data ever lands in `nepal-english-test-centres.ts`, generalise the `ielts-centres` row to key off the chosen test instead of hard-gating on `"ielts"` — do **not** show IELTS centres for a PTE/TOEFL taker.
