# Phase 5 — Documents, OCR Extraction & Profile Integration

**Date:** 2026-06-04
**Status:** **PARTIALLY SUPERSEDED 2026-06-05.** Phase 5A shipped as a documents vault — no OCR pipeline. Phase 5B remains unbuilt.
**Scope:** Upload infrastructure, Tesseract.js OCR, profile auto-population, re-scoring cascade, schema extensions
**Split:** 5A (upload infra + OCR + existing fields) ships first; 5B (schema extensions + scoring updates) ships second. One spec covers both so the architecture has no loose ends.

> **⚠️ SUPERSEDED SECTIONS (post-OCR rip-out, 2026-06-05).** During Phase 5A
> implementation, the OCR pipeline (Tesseract.js + regex parsers) was tested
> against real IELTS scorecards and proved unreliable on tabular layouts.
> The user opted to ship a documents vault instead — users upload manually
> for personal organization, no auto-extraction. The cascade work
> (`sectionsToMatchInputs`, `sectionsToStudentProfile`, `reScoreAssessment`)
> shipped and is now driven by manual edits and document-upload boolean flags
> instead of OCR extraction.
>
> **The following sections are HISTORICAL ONLY — they describe the original
> design, not what shipped:**
> - §4.1 "extracted fields" columns (vault stores files only)
> - §5.1 `extracted_data`, `profile_section`, `status` columns (dropped in migration `20260605000000_simplify_documents.sql`)
> - §6 entire pipeline + §6.3 parser registry + §6.4 profile mapping + §6.5 sharp preprocessing + §6.6 Tesseract config + §6.7 Vision upgrade path
> - §7.4 "Document wins" conflict resolution (no extraction → no conflict)
> - §8.3 "Extracted" card state (only Empty + Uploaded states exist)
> - §9 OCR-specific error categories
> - §10 entire Phase 5B section (unbuilt — academic.slcGrade, finance.loanAmount, sponsor income, new visa section, 7 new plan rules all deferred)
> - §12 testing layers 1–3 (Tesseract not installed)
> - §13 Phase 5A deliverable list (parser files removed)
> - §14 Tesseract.js + sharp dependencies (uninstalled)
>
> **What actually shipped (Phase 5A):**
> - `documents` table with minimal columns: `id, owner, kind, file_path, file_size, original_name, created_at` + UNIQUE(owner, kind)
> - Supabase Storage `documents` bucket, private, organized by `{userId}/{kind}/{uuid}.{ext}`
> - `POST /api/documents/upload` (multipart, validates auth + size + MIME magic bytes + sanitized filename) and `DELETE /api/documents/[id]` (RLS + boolean flag reversal only when no other doc in group remains)
> - `GET /api/documents/[id]/view` (60-second signed URL on demand, not server-rendered)
> - Auto-flip of profile booleans (`english.reportUploaded`, `finance.proofUploaded`, `work.docs`) on upload, reverse on delete
> - Cascade still runs: `patchProfileSection` → `computeCompleteness` → `reScoreAssessment` → `invalidatePlan`
> - English section per-band scores (listening/reading/writing/speaking) — added but populated manually, not via OCR
> - `/documents` page with 20 kinds in 7 groups, fullscreen viewer modal
>
> Phase 5B (schema extensions + new scoring rules) was never implemented. If
> brought back, see audit findings in `docs/superpowers/plans/2026-06-05-pre-mvp-review-fixes.md` §P3.24.

---

## 1. Problem

Users complete the assessment wizard and get a verdict, but improving that verdict requires manually editing profile fields one by one. Students already have documents (IELTS scorecards, transcripts, bank statements, passports) that contain the exact data the profile needs. There is no way to upload these documents, extract data from them, or have that data flow through to match scoring, plan generation, and the headline assessment verdict.

Additionally, the Nepal-to-Australia corridor requires 19 distinct document types across identity, academic, English proficiency, financial, employment, and visa stages. The current profile schema lacks fields for several of these (SLC/+2 grades, loan amounts, sponsor income, visa-stage documents).

## 2. Goals

1. Users upload document images on a dedicated `/documents` page
2. OCR extracts structured data and auto-populates the relevant profile section
3. Profile changes cascade to re-score the assessment verdict, regenerate plan items, recompute completeness, and update match verdicts on next page load
4. The full Nepal-to-Australia document set is supported (19 kinds)
5. Architecture supports upgrading from Tesseract.js to Claude Vision API later without pipeline changes

## 3. Non-goals

- PDF support (v1 is images only; PDF requires pdf-to-image conversion)
- Client-side OCR (runs server-side to keep extraction logic private)
- Per-program checklists (future feature; this is a general-purpose upload hub)
- Passport number extraction (privacy risk; extract name + DOB only)

---

## 4. Document Types

### 4.1 Complete inventory (19 kinds)

#### Identity
| Kind | Label | Profile Section | OCR Parser | Fields Extracted |
|---|---|---|---|---|
| `passport` | Passport bio page | `personal` | Yes | name, DOB |
| `birth-certificate` | Birth Certificate | `personal` | No | Store only |
| `national-id` | Citizenship/National ID | — | No | Store only |

#### Academic
| Kind | Label | Profile Section | OCR Parser | Fields Extracted |
|---|---|---|---|---|
| `slc-see` | SLC/SEE Certificate (10th) | `academic` | 5B | slcGrade |
| `plus-two` | +2/Higher Secondary | `academic` | 5B | plusTwoGrade |
| `bachelors-transcript` | Bachelor's Transcript | `academic` | Yes | institution, degree, gradePercent |
| `masters-transcript` | Master's Transcript | `academic` | 5B | mastersInstitution, mastersGrade |

#### English Proficiency
| Kind | Label | Profile Section | OCR Parser | Fields Extracted |
|---|---|---|---|---|
| `ielts` | IELTS Scorecard | `english` | Yes | overall, listening, reading, writing, speaking |
| `pte` | PTE Academic Scorecard | `english` | Yes | overall, listening, reading, writing, speaking |
| `toefl` | TOEFL iBT Score Report | `english` | Yes | overall, listening, reading, writing, speaking |

#### Financial
| Kind | Label | Profile Section | OCR Parser | Fields Extracted |
|---|---|---|---|---|
| `bank-statement` | Bank Statement | `finance` | Yes | balance, currency |
| `loan-sanction` | Education Loan Sanction Letter | `finance` | 5B | loanAmount, loanCurrency |
| `sponsor-income` | Sponsor Income Tax Return | `finance` | 5B | sponsorIncome, sponsorIncomeCurrency |

#### Employment
| Kind | Label | Profile Section | OCR Parser | Fields Extracted |
|---|---|---|---|---|
| `employment-letter` | Employment Letter | `work` | Yes | title, employer, years |
| `salary-slip` | Salary Slip | `work` | Yes | amount, employer |

#### Visa
| Kind | Label | Profile Section | OCR Parser | Fields Extracted |
|---|---|---|---|---|
| `offer-letter` | University Offer Letter | `intended-study` | Yes | university, program, intake |
| `coe` | Confirmation of Enrolment | `visa` (5B) | 5B | coeProvider, coeCricosCode, coeStartDate |
| `oshc` | Health Cover (OSHC) Policy | `visa` (5B) | No | Store only |
| `medical` | Medical Exam Results | `visa` (5B) | No | Store only |
| `other` | Other Document | — | No | Store only |

**Summary:** 9 parsers in 5A, 5 parsers added in 5B, 5 kinds are always store-only.

### 4.2 Valid kind values (for CHECK constraint)

```
passport, birth-certificate, national-id,
slc-see, plus-two, bachelors-transcript, masters-transcript,
ielts, pte, toefl,
bank-statement, loan-sanction, sponsor-income,
employment-letter, salary-slip,
offer-letter, coe, oshc, medical, other
```

---

## 5. Data Model

### 5.1 `documents` table

```sql
create table public.documents (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in (
    'passport','birth-certificate','national-id',
    'slc-see','plus-two','bachelors-transcript','masters-transcript',
    'ielts','pte','toefl',
    'bank-statement','loan-sanction','sponsor-income',
    'employment-letter','salary-slip',
    'offer-letter','coe','oshc','medical','other'
  )),
  file_path      text not null,
  file_size      integer not null,
  original_name  text not null,
  extracted_data jsonb,
  profile_section text,
  status         text not null default 'processing' check (status in ('processing','extracted','failed','stored')),
  created_at     timestamptz not null default now(),
  unique (owner, kind)
);

-- RLS
alter table public.documents enable row level security;
create policy "Users read own documents" on public.documents for select using (auth.uid() = owner);
create policy "Users delete own documents" on public.documents for delete using (auth.uid() = owner);
create policy "Service inserts documents" on public.documents for insert with check (true);

-- Index
create index documents_owner_idx on public.documents (owner);
```

### 5.2 Supabase Storage

- **Bucket:** `documents` (private, not public)
- **Path convention:** `{userId}/{kind}/{timestamp}-{originalFilename}`
- **Storage RLS:** Users can read/delete objects under their own `{userId}/` prefix only
- **Max file size:** 5MB (enforced at API level)

### 5.3 Profile schema extensions

#### Phase 5A — English per-band scores

Extend `ProfileSections.english`:
```typescript
english?: {
  test?: "ielts" | "pte" | "toefl";
  overall?: number;
  listening?: number;    // NEW
  reading?: number;      // NEW
  writing?: number;      // NEW
  speaking?: number;     // NEW
  reportUploaded?: boolean;
};
```

Update Zod schema in `lib/validation/profile-section.ts` to accept the new fields. Update `EnglishEditor` to display per-band scores (read-only when populated from OCR, editable otherwise).

#### Phase 5B — New and extended sections

**`academic` gains:**
```typescript
slcGrade?: number;        // 0-100, SLC/SEE percentage
plusTwoGrade?: number;     // 0-100, +2/Higher Secondary percentage
mastersInstitution?: string;
mastersGrade?: number;     // 0-100
```

**`finance` gains:**
```typescript
loanAmount?: number;
loanCurrency?: string;     // reuse Currency enum
loanSource?: string;       // lending institution name
sponsorIncome?: number;
sponsorIncomeCurrency?: string;
```

**`work` gains:**
```typescript
monthlySalary?: number;
salaryCurrency?: string;
```

**New `visa` section:**
```typescript
visa?: {
  coeProvider?: string;
  coeCricosCode?: string;
  coeStartDate?: string;   // ISO date
  oshcProvider?: string;
  oshcExpiry?: string;      // ISO date
  medicalDate?: string;     // ISO date
  medicalStatus?: "passed" | "pending";
};
```

Add `"visa"` to `SECTION_KEYS`. Update `REQUIRED_FIELDS` — visa section has no required fields (it's optional/progressive).

**Completeness update:** Change denominator from `SECTION_KEYS.length` to exclude sections with no required fields AND no data. The `visa` section only counts toward completeness if the user has started filling it in. This prevents adding a section from silently dropping everyone's percentage. Alternatively: make the denominator `SECTION_KEYS.filter(k => REQUIRED_FIELDS[k].length > 0).length` — currently `scholarships` and `deal-breakers` already have empty required arrays, so this is already the correct behavior to formalize.

**Conditional required fields (5B):** `loanAmount` is required only when `finance.source === 'education-loan'` or `'mixed'`. `sponsorIncome` is required only when `finance.source === 'parents-family'` or `'mixed'`. Implement as a `CONDITIONAL_REQUIRED` map checked during completeness computation.

---

## 6. Upload & Extraction Pipeline

### 6.1 Flow

```
User picks kind on /documents → selects image file
  → POST /api/documents/upload (multipart: file + kind)
  → Validate: auth, file size ≤ 5MB, content-type is image/*, kind is valid
  → Upload image buffer to Supabase Storage
  → If kind has a parser:
      → sharp: convert to grayscale, normalize contrast, resize to ~300 DPI
      → Tesseract.js: OCR the preprocessed buffer (CDN-loaded WASM, English lang)
      → Parser registry: run kind-specific regex parser on raw text
      → If parser returns structured data:
          → Insert documents row (status: 'extracted', extracted_data: {...})
          → Patch profile section with extracted fields (document wins on conflict)
          → Run unified cascade (completeness + re-score assessment + invalidate plan)
          → Return { status: 'extracted', extracted_data, profile_changes }
      → If parser returns null:
          → Insert documents row (status: 'failed')
          → Return { status: 'failed', message: 'Could not read document' }
  → If kind is store-only:
      → Insert documents row (status: 'stored')
      → Return { status: 'stored' }
```

### 6.2 API routes

**`POST /api/documents/upload`** — multipart form data
- Fields: `file` (image), `kind` (string)
- Auth: required (signed-in users only)
- On re-upload (same owner + kind): delete old Storage file + old DB row first, then proceed with new upload
- Response: `{ id, status, extracted_data?, profile_changes?, message? }`

**`DELETE /api/documents/[id]`** — delete a document
- Auth: required, owner must match
- Deletes Storage file + DB row
- Sets corresponding boolean flag to false (`reportUploaded`, `proofUploaded`, `docs`) but does NOT clear extracted profile data
- Response: `{ ok: true }`

### 6.3 Parser registry

```typescript
// lib/documents/parsers/registry.ts
type ParseResult = Record<string, unknown> | null;
type Parser = (rawText: string) => ParseResult;

const PARSERS: Partial<Record<DocumentKind, Parser>> = {
  passport: parsePassport,
  ielts: parseIelts,
  pte: parsePte,
  toefl: parseToefl,
  "bachelors-transcript": parseTranscript,
  "bank-statement": parseBankStatement,
  "employment-letter": parseEmploymentLetter,
  "salary-slip": parseSalarySlip,
  "offer-letter": parseOfferLetter,
  // 5B additions:
  // "slc-see": parseSlcSee,
  // "plus-two": parsePlusTwo,
  // "masters-transcript": parseMastersTranscript,
  // "loan-sanction": parseLoanSanction,
  // "sponsor-income": parseSponsorIncome,
};
```

Each parser is a pure function: `(rawText: string) => ParseResult | null`. Returns null if the text doesn't match expected patterns.

### 6.4 Profile mapping

```typescript
// lib/documents/profile-mapping.ts
// Maps document kind → { section, fields } for patching
const PROFILE_MAPPING: Partial<Record<DocumentKind, {
  section: SectionKey;
  map: (extracted: Record<string, unknown>) => Record<string, unknown>;
}>> = {
  passport: {
    section: "personal",
    map: (d) => ({ name: d.name }),  // DOB → derive age
  },
  ielts: {
    section: "english",
    map: (d) => ({
      test: "ielts",
      overall: d.overall,
      listening: d.listening,
      reading: d.reading,
      writing: d.writing,
      speaking: d.speaking,
      reportUploaded: true,
    }),
  },
  // ... etc for each kind with a parser
};
```

### 6.5 Image preprocessing

Using `sharp` (already available in Node.js on Vercel):
1. Convert to grayscale
2. Normalize contrast (linear stretch)
3. Resize so the shorter dimension is ≥ 2000px (improves Tesseract accuracy at ~300 DPI)
4. Output as PNG buffer for Tesseract

### 6.6 Tesseract.js configuration

- Load WASM + language data from CDN (cdn.jsdelivr.net) at runtime
- Language: `eng` (English — all target documents are in English or have English text)
- Single worker per invocation (Vercel serverless = one request at a time)
- Timeout: rely on Vercel function timeout (10s default, 60s on Pro)

### 6.7 Vision API upgrade path

The parser registry pattern makes upgrading straightforward:
1. Add a `VisionParser` that sends the image to Claude Vision API with a structured prompt
2. Register it for specific kinds (or as a fallback when regex parsing fails)
3. No changes to the upload route, profile mapping, or cascade — only the parser layer changes

---

## 7. The Unified Cascade

### 7.1 The problem today

Two parallel scoring systems exist:
- **Assessment scoring** (`lib/scoring/engine.ts`): reads `StudentProfile` (flat), computed ONCE at wizard completion, frozen in `assessments.result`
- **Match scoring** (`lib/matches/compute.ts`): reads `MatchInputs` (built from `ProfileSections`), computed live on each `/matches` page load

When a user edits their profile or uploads a document, matches update but the dashboard assessment verdict stays frozen. This creates a confusing dead end for a feature sold as "upload documents to improve your chances."

Additionally, `MatchInputs` is constructed in 3 places with duplicated proxy logic (matches/page.tsx:25-32, invalidate.ts:29-37, and potentially the new upload route).

### 7.2 Solution: two new shared functions

**`sectionsToMatchInputs(sections, policy)`** — extracted from the 3 duplicated copies. Single source of truth for building `MatchInputs` from `ProfileSections`.

```typescript
// lib/matches/from-sections.ts
export function sectionsToMatchInputs(
  sections: ProfileSections,
  policy: { nepalAssessmentLevel: "L2" | "L3" },
): MatchInputs {
  return {
    userGradePercent: sections.academic?.gradePercent ?? null,
    userEnglishOverall: sections.english?.overall ?? null,
    userEnglishBand: Math.min(
      sections.english?.listening ?? sections.english?.overall ?? 0,
      sections.english?.reading ?? sections.english?.overall ?? 0,
      sections.english?.writing ?? sections.english?.overall ?? 0,
      sections.english?.speaking ?? sections.english?.overall ?? 0,
    ) || null,
    userBudgetAud: budgetToAud(sections.finance?.total ?? null, sections.finance?.currency ?? null),
    userField: sections["intended-study"]?.field ?? null,
    policy,
  };
}
```

Note: with per-band scores from OCR, `userEnglishBand` becomes the actual minimum band instead of a proxy. This immediately improves match accuracy for programs with per-band requirements.

**`sectionsToStudentProfile(sections)`** — the missing reverse mapper, so the scoring engine can re-score from profile data.

```typescript
// lib/scoring/from-sections.ts
export function sectionsToStudentProfile(sections: ProfileSections): StudentProfile {
  // Map nested ProfileSections back to flat StudentProfile
  // for the scoring engine
}
```

### 7.3 The cascade

Every profile mutation (editor save, document upload, assessment claim) triggers:

```
patchProfileSection(adminDb, userId, section, patch)
  → computeCompleteness(updatedSections)     // update profile.completeness
  → reScoreAssessment(adminDb, userId)        // NEW: sectionsToStudentProfile → scoring engine → update assessments.result
  → invalidatePlan(adminDb, userId)           // regenerate plan items (already uses computeMatches internally)
```

`reScoreAssessment` updates the primary assessment's `result` column with fresh scoring output. The dashboard reads this on next load and shows the updated verdict.

**`/matches` page and `invalidatePlan`** both switch to `sectionsToMatchInputs()` instead of inline construction.

### 7.4 Conflict resolution

- **Document wins:** extracted data overwrites existing profile values
- **User notification:** API response includes `profile_changes: { field: { old, new } }` for the client to display
- **Delete does not revert:** deleting a document removes the file and DB row, resets boolean flags (`reportUploaded`, `proofUploaded`, `docs`), but does NOT clear the extracted data from the profile (user may have manually entered it before uploading)

---

## 8. `/documents` Page UX

### 8.1 Route and navigation

- Route: `app/(app)/documents/page.tsx`
- Added to AppBar as a main nav item alongside Dashboard, Profile, Matches, Plan
- Server component reads all documents for the user; client components handle upload interactions per card

### 8.2 Section grouping

The page displays 7 groups matching the document categories from Section 4:

1. **Identity** — Passport, Birth Certificate, National ID
2. **Academic** — SLC/SEE, +2/Higher Secondary, Bachelor's Transcript, Master's Transcript
3. **English Proficiency** — IELTS, PTE, TOEFL
4. **Financial** — Bank Statement, Loan Sanction Letter, Sponsor Income Tax Return
5. **Employment** — Employment Letter, Salary Slip
6. **Visa** — Offer Letter, CoE, OSHC, Medical Exam Results
7. **Other** — Other Document

### 8.3 Document card states

Each kind gets a card with 3 possible states:

**Empty:**
- Kind label + descriptive subtitle
- Upload button (accepts image/*)
- Muted appearance (border-line, text-ink-faint)

**Uploaded + extracted:**
- Kind label + original filename + file size
- Extracted data summary (e.g. "IELTS Overall: 7.0 | L: 7.5 | R: 6.5 | W: 6.5 | S: 7.0")
- "Updated your English profile" confirmation
- Re-upload button + delete button
- Active appearance (border-primary, text-ink)

**Uploaded, store-only or failed:**
- Kind label + original filename + file size
- Status badge: "Stored" or "Could not read — try a clearer photo"
- Re-upload button + delete button

### 8.4 Upload interaction

1. User clicks upload on a specific card
2. File picker opens (accept: `image/jpeg,image/png,image/webp`)
3. File selected → card shows loading spinner
4. API call completes → card transitions to uploaded state
5. If extraction succeeded: toast notification with change summary and link to profile section

### 8.5 Dashboard widget

Add a documents stat to the dashboard:
- Shows "X/19 documents uploaded" (or "X documents uploaded")
- Links to `/documents`
- Wire into the existing `StatsRow` component (replace the `checklistDone: null` dead slot)

---

## 9. Error Handling

| Scenario | Behavior |
|---|---|
| File > 5MB | Rejected at API level, 422 response, client shows size error |
| Wrong file type | API validates content-type, 422 response |
| OCR returns unreadable text | Parser returns null, document saved with status `failed`, profile untouched |
| Re-upload same kind | Old file + row deleted first, new file + row created |
| Supabase Storage down | API returns 500, client shows retry message |
| Vercel function timeout | File may or may not be uploaded; client shows retry message |
| Missing SUPABASE_SERVICE_ROLE_KEY | Upload fails gracefully (service role needed for insert), 500 with message |
| User not authenticated | 401 response |

---

## 10. Phase 5B — Scoring & Matching Updates

### 10.1 Scoring engine changes

**Academic dimension** (`lib/scoring/academic.ts`):
- Currently normalizes only `percentage-nepal` grade system
- Add: SLC grade as a secondary academic signal (if available, use it to validate the primary grade)
- Add: masters GPA as an alternative academic indicator for postgrad programs

**Financial dimension** (`lib/scoring/financial.ts`):
- Currently reads only `budget` + `fundingSource`
- Add: `loanAmount` contributes to financial capacity when source is `education-loan` or `mixed`
- Add: `sponsorIncome` contributes when source is `parents-family` or `mixed`
- Total financial capacity = `budget + loanAmount + (sponsorIncome * years)`

### 10.2 Match algorithm changes

**`MatchInputs` gains:**
- `userLoanAmountAud: number | null`
- `userSponsorIncomeAud: number | null`
- `userTotalFinancialCapacityAud: number | null` (computed: budget + loan + sponsor)

**`computeMatches` gains:**
- Financial documentation check: if source is loan but no `loanAmount`, add a "missing loan documentation" reason
- Total capacity check: compare `userTotalFinancialCapacityAud` against `tuitionMin + livingCost` instead of just `budget`

### 10.3 Plan generator — 7 new rules

| Kind | Trigger | Impact | Title |
|---|---|---|---|
| `upload-loan-sanction` | `finance.source in [loan, mixed] && !loanAmount` | high | Upload your loan sanction letter |
| `verify-sponsor-income` | `finance.source in [parents-family, mixed] && !sponsorIncome` | high | Add proof of sponsor income |
| `upload-coe` | `visa section exists but no coeProvider` | high | Upload your Confirmation of Enrolment |
| `add-slc-grades` | `!academic.slcGrade && educationLevel !== 'higher-secondary'` | medium | Add your SLC/SEE grades |
| `add-plus-two-grades` | `!academic.plusTwoGrade` | medium | Add your +2/Higher Secondary grades |
| `add-masters-gpa` | `academic.degree === 'masters' && !mastersGrade` | high | Add your master's GPA |
| `verify-salary` | `work.title && !work.monthlySalary` | low | Add your salary details |

### 10.4 Completeness changes

- Add `"visa"` to `SECTION_KEYS`
- Denominator becomes: count of sections that have either (a) non-empty required fields or (b) any user data. Sections with no required fields AND no data don't count. This matches the existing behavior for `scholarships` and `deal-breakers`.
- Add `CONDITIONAL_REQUIRED`: `loanAmount` required when source includes loan; `sponsorIncome` required when source includes sponsor.

### 10.5 Dashboard updates

- `PromptCard` logic expanded: detect missing loan sanction, sponsor income, CoE alongside existing profile-incomplete and ielts-missing checks
- Wire `scholarships: null` stat slot to actual scholarship count (if data available) or remove it

---

## 11. Privacy & Security

- Passport extraction: name + DOB only. No passport number, no MRZ data stored.
- All document files in a private Supabase Storage bucket. No public URLs.
- Signed URLs generated server-side for client-side display (read) or upload.
- RLS on `documents` table: users can only SELECT/DELETE their own rows. INSERT is service-role only.
- Storage RLS: users can only access objects under `{their-userId}/` prefix.
- No document data in URL parameters or query strings.
- Existing `SUPABASE_SERVICE_ROLE_KEY` never exposed to client.

---

## 12. Testing Strategy

### Layer 1: Parser unit tests (no Tesseract, no images)
Each parser is a pure function `(rawText: string) => ParseResult | null`. Test with hardcoded OCR output strings:
- Each parser: given sample OCR text matching real document layouts, returns correct structured data
- Each parser: given garbage/unrelated text, returns null
- Each parser: edge cases — partial data, different formatting, extra whitespace, mixed case
- Profile mapping: given extracted data, produces correct section patch
- `sectionsToMatchInputs`: given profile sections, produces correct MatchInputs
- `sectionsToStudentProfile`: given profile sections, produces correct StudentProfile
- Completeness with new sections: adding visa section doesn't drop existing percentages
- Conditional required fields: loanAmount required only when source = loan

### Layer 2: Pipeline integration tests (mock Tesseract)
Mock `tesseract.js` to return known text strings, test the full pipeline wiring:
- Upload route: multipart upload → Storage file created → documents row inserted → profile patched → plan regenerated
- Delete route: file removed from Storage, row deleted, boolean flag reset
- Re-upload: old file + row replaced, new extraction runs
- Re-score cascade: upload IELTS → assessment verdict updates
- Sharp preprocessing: verify grayscale + contrast + resize runs without error on a test buffer

### Layer 3: OCR accuracy tests (real images, CI-safe)
Generate synthetic document images programmatically with known values (e.g., render an IELTS scorecard template with scores 7.0/7.5/6.5/6.5/7.0 using sharp/canvas). These:
- Run Tesseract on the synthetic image
- Assert the parser extracts the expected values
- Are deterministic and contain no real PII
- Validate that Tesseract + sharp preprocessing + parser work end-to-end

Additionally, source real template/sample document images from the web (blank IELTS scorecards, sample transcripts) for a `tests/documents/fixtures/` directory. These serve as smoke tests for real-world OCR accuracy.

### Layer 4: Manual smoke testing
During development, test with real documents (user's own IELTS scorecard, passport, etc.) to validate extraction accuracy on real-world images with varied lighting, angles, and quality.

### Edge case tests
- Upload with missing auth → 401
- Upload > 5MB → 422
- Upload wrong content-type → 422
- OCR failure → status 'failed', profile untouched
- Upload when SUPABASE_SERVICE_ROLE_KEY missing → graceful failure

---

## 13. Implementation Phasing

### Phase 5A — Upload Infrastructure + OCR (builds first)

**Database:**
- Migration: create `documents` table with RLS
- Migration: create Supabase Storage bucket `documents` with policies
- Extend English section Zod schema with per-band scores

**Shared functions:**
- `sectionsToMatchInputs()` — extracted from 3 inline copies
- `sectionsToStudentProfile()` — new reverse mapper
- `reScoreAssessment()` — re-runs scoring engine, updates assessment row
- Unified cascade wired into existing `patchProfileSection` flow

**OCR pipeline:**
- `lib/documents/ocr.ts` — sharp preprocessing + Tesseract.js wrapper
- `lib/documents/parsers/` — 9 parser files (passport, ielts, pte, toefl, transcript, bank-statement, employment-letter, salary-slip, offer-letter)
- `lib/documents/parsers/registry.ts` — parser lookup by kind
- `lib/documents/profile-mapping.ts` — kind → section + field mapping

**API routes:**
- `POST /api/documents/upload` — multipart upload + extraction + cascade
- `DELETE /api/documents/[id]` — delete file + row + reset flags

**UI:**
- `/documents` page with 19 kind cards in 7 groups
- Document card component (3 states: empty, extracted, stored)
- Upload interaction with loading state + success notification
- AppBar nav item for Documents
- Dashboard stat widget (documents uploaded count)

**Refactors:**
- `matches/page.tsx` → use `sectionsToMatchInputs()`
- `plan/invalidate.ts` → use `sectionsToMatchInputs()`
- `api/profile/section/route.ts` → add `reScoreAssessment()` to cascade
- `api/assess/route.ts` → add `reScoreAssessment()` to signed-in path

### Phase 5B — Schema Extensions + Full Integration (builds second)

**Database:**
- Migration: no schema change (profile sections are JSONB; new fields are additive)

**Profile schema:**
- Extend `academic`, `finance`, `work` section types + Zod schemas
- Add `visa` section type + Zod schema
- Add `"visa"` to `SECTION_KEYS`
- Update `REQUIRED_FIELDS` + add `CONDITIONAL_REQUIRED`
- Update completeness denominator logic

**Parsers:**
- 5 new parsers: slc-see, plus-two, masters-transcript, loan-sanction, sponsor-income
- Register in parser registry + profile mapping

**Editors:**
- Update `AcademicEditor` with SLC, +2, masters fields
- Update `FinanceEditor` with loan, sponsor fields
- Update `WorkEditor` with salary fields
- New `VisaEditor` for CoE, OSHC, medical fields
- Add `VisaEditor` to editor registry on profile page

**Scoring:**
- Academic dimension: handle SLC/+2/masters grades
- Financial dimension: read loan + sponsor amounts
- `MatchInputs` extended with financial capacity fields
- `computeMatches` gains financial documentation checks

**Plan generator:**
- 7 new rules (upload-loan-sanction, verify-sponsor-income, upload-coe, add-slc-grades, add-plus-two-grades, add-masters-gpa, verify-salary)

**Dashboard:**
- PromptCard detects missing loan/sponsor/CoE documents
- Wire dead stat slots

---

## 14. Dependencies

- `tesseract.js` — OCR engine (WASM loaded from CDN at runtime)
- `sharp` — image preprocessing (already available in Vercel's Node.js runtime)
- No new Supabase extensions required
- `SUPABASE_SERVICE_ROLE_KEY` must be set in Vercel for uploads to work

---

## 15. Open Questions (resolved)

| Question | Decision |
|---|---|
| Where do users upload? | Dedicated `/documents` page |
| Auto-populate or confirm? | Auto-populate + notify |
| File formats? | Images only (JPG, PNG, WebP) |
| File size limit? | 5MB |
| One or many per kind? | One per kind, replace on re-upload |
| Conflict resolution? | Document wins |
| Passport number? | Do not extract or store |
| Storage location? | Supabase Storage, private bucket |
| Storage organization? | `{userId}/{kind}/{filename}` |
| Tesseract WASM loading? | CDN at runtime |
| Image preprocessing? | Basic with sharp (grayscale, contrast, DPI) |
| Re-score assessment? | Yes, on every profile change |
| Phase split? | 5A (infra + OCR) then 5B (schema + scoring) |
