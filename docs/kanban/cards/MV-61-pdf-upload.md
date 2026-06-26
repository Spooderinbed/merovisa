# MV-61 — Accept PDF document uploads (transcripts, offers, loan letters, CoEs)

**Priority:** P1   **Owner:** agent
**Goal:** Let a student file the documents the checklist actually asks for. Transcripts, university offer letters, education-loan sanction letters, and Confirmation-of-Enrolment letters are PDFs, but the document-upload feature accepted images only — every real document hit a 422 rejection. Under the north star (the app must be complete enough that a student never needs a consultancy), an un-fileable document store is a bounce point. Add PDF as a first-class upload type end-to-end: server allowlist + magic-byte check, file-picker `accept`, and a viewer that renders the PDF instead of a broken image.

## Context links
- Server: `app/api/documents/upload/route.ts` (`ALLOWED_TYPES`, magic-byte gate), `lib/documents/upload-validation.ts` (`verifyFileMagic`, `extensionFor`).
- Client: `components/documents/document-card.tsx` (file input `accept`, view flow), `components/documents/document-viewer-modal.tsx` (preview).
- Kinds: `lib/documents/types.ts` — `offer-letter`, `bachelors-transcript`, `loan-sanction`, `coe` etc. are all real-world PDFs.
- Reassessment: `~/.claude/.../memory/2026-06-26-strategic-reassessment.md` (PDF upload = top journey-completeness fix).

## What changed
- **Allowlist:** `ALLOWED_TYPES` adds `application/pdf`; rejection copy → "File must be JPG, PNG, WebP, or PDF".
- **Magic-byte:** `verifyImageMagic` renamed → `verifyFileMagic` (it now validates PDFs too — keeping "Image" in the name would be a quiet lie). Added a `%PDF` (25 50 44 46) branch that only passes when the declared type is `application/pdf`; image-as-pdf and pdf-as-image spoofs are still rejected.
- **Extension:** `extensionFor("application/pdf")` → `"pdf"` (was `"bin"`).
- **Picker:** `<input accept>` adds `application/pdf` so the OS file dialog offers PDFs.
- **Viewer:** `DocumentViewerModal` takes `isPdf` and renders an `<iframe>` (browser PDF viewer) instead of `<img>`; the card derives `isPdf` from `doc.originalName`. View-error copy generalised "image" → "document".

## Acceptance criteria
- [x] `application/pdf` is accepted by the upload API (200), and a genuinely disallowed type (e.g. `application/zip`) still returns 422 with PDF-inclusive copy.
- [x] `verifyFileMagic` accepts real `%PDF` bytes as `application/pdf` and rejects MIME spoofs in both directions.
- [x] The file picker offers PDFs; a stored PDF previews in an iframe, images still preview as `<img>`.
- [x] No scoring touched (document flags don't feed the engine); goldens N/A.

## Test plan / evidence
- `tests/documents/upload-hardening.test.ts` — PDF magic accept + bidirectional spoof reject; `extensionFor` pdf→"pdf", unknown→"bin".
- `tests/api/documents/upload.test.ts` — PDF (offer-letter) → 200; zip → 422 matching `/PDF/`.
- `tests/components/documents/document-card.test.tsx` — picker `accept` contains `application/pdf`; viewer renders iframe for PDF, img for image.
- Gate (all green): `npm run typecheck` clean; `npm run lint` 0 errors (1 pre-existing `build.mjs` warning, untouched); `npx vitest run` → **235 files / 1402 tests passed, 0 failed** (was 1396).

## Integration gate
- `npm run typecheck` · `npm run lint` · `npm test`

## Dependencies / blocked-by
- None. Pure documents-feature slice; no scorer, no migration, no ledger.

## Risk notes
- Storage holds PDFs now; the existing per-user RLS + admin-client upload path is unchanged. 5 MB cap unchanged. Magic-byte gate prevents a renamed-executable bypass.
- Founder copy-reviews closely: the only new user-facing string is the rejection copy "File must be JPG, PNG, WebP, or PDF".

## Agent resume notes (cold start)
Built TDD on branch `mv-61-pdf-upload` off master (32bd209). RED → implemented → GREEN → full gate. Branch carries only this slice's 6 files + this card + board.

## Decision log
- 2026-06-26 — Opened as the first Tier-1 journey-completeness slice from the 2026-06-26 strategic reassessment (PDF upload ranked first: smallest, no product-copy decision, unblocks the whole Documents feature). Renamed the magic helper rather than overloading a misnamed one.
