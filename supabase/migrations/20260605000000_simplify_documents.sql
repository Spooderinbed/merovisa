-- Simplify documents table: OCR fields removed (phase 5a rip-out).
-- Users upload documents manually for organization; no auto-extraction.

alter table public.documents
  drop column if exists extracted_data,
  drop column if exists profile_section,
  drop column if exists status;
