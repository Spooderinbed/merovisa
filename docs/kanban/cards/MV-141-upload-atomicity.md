# MV-141 — Never destroy a document before validating its replacement (C-8)

**Priority:** P1 · **Owner:** agent
**Merge:** _founder-gated_
**Split from:** [MV-124](MV-124-audit-remainder-slices-2-9.md) **Slice 3** (audit C-8).

## The bug (verified live 2026-07-18)

`POST /api/documents/upload` replaced an existing document with a **delete-then-insert**
where the delete ran *first* and unconditionally
([route.ts:65-69](../../../app/api/documents/upload/route.ts)):

```
existing = getDocumentByKind(...)
if (existing) { storage.remove([existing.file_path]); deleteDocument(...) }  // ← original gone
buffer = ...
if (!verifyFileMagic(...)) return 422   // ← too late; original already destroyed
upload(newPath) ...                     // ← can fail; original already destroyed
insertDocument(...) ...                 // ← can fail; original already destroyed
```

So a student who re-uploaded over a stored passport scan and hit **any** failure — a
renamed HEIC that fails the magic-byte check (422), a failed Storage upload (500), or a
failed row insert (500) — was left with **no document at all**, permanently, while the
vault card still read "Uploaded" until the next page load. For a trust-first product that
tells students to store their real passport/bank/transcript scans, silent destruction of a
stored document is among the worst possible outcomes.

(Per the MV-124 correction block: the **delete-ordering itself is not the bug** — C-1/C-2's
claim that the delete order is wrong was refuted. The bug is that the destroy runs *before*
the replacement is validated and safely stored. The `failedSteps` rollback path is correct
and untouched.)

## Fix (shipped)

Reorder so the original is removed **only after** the replacement is validated, uploaded,
and committed — and replace the DB delete+insert with an atomic upsert so there is no
window where the row is missing:

1. `getDocumentByKind` — look up what we'd replace, but **do not delete it**.
2. Magic-byte check → 422 on failure (original untouched).
3. Upload the replacement to a **fresh UUID path** (never collides with the original).
4. [`upsertDocument`](../../../lib/documents/repo.ts) — atomic replace on the unique
   `(owner, kind)` index (`onConflict: "owner,kind"`); the index already exists
   ([migration 20260604060000](../../../supabase/migrations/20260604060000_add_documents.sql):21).
   On failure, roll back the just-uploaded object and 500 (original row + object intact).
5. **Only now** remove the superseded Storage object (its row was overwritten by the upsert).
   A failure here merely leaks an orphan; the student's current document stays correct.

The route uses the admin (service-role) client for all document ops, so the upsert's
`DO UPDATE` path is not blocked by the table's RLS (which has no UPDATE policy).
`created_at` is refreshed in the upsert so a re-uploaded document reads as freshly stored,
matching the vault ordering the old delete+insert produced.

## Acceptance criteria

- [x] A replacement that fails the magic-byte check returns 422 and leaves the original row + object intact.
- [x] A replacement whose Storage upload fails returns 500 and leaves the original intact.
- [x] A replacement whose row upsert fails returns 500, rolls back **only** the new object, and leaves the original intact.
- [x] On success the superseded object is removed **only after** the replacement is uploaded and the row committed.
- [x] `upsertDocument` replaces on `(owner, kind)` with `onConflict: "owner,kind"` (no delete-then-insert window).
- [x] Gate: typecheck 0 · lint 0 · **2000 tests / 304 files**.

## Evidence (2026-07-18)

- **TDD:** 10 behaviours red-first for the right reason (route destroyed the original before
  validating → `storageRemove`/`deleteDocument` called on the reject/fail paths; happy paths
  500 because the route still called the now-unmocked `insertDocument`; `upsertDocument` not
  exported). Then green. New tests: 2 in
  [`tests/documents/repo.test.ts`](../../../tests/documents/repo.test.ts) (asserts the
  `onConflict: "owner,kind"` argument — the load-bearing detail) + 4 C-8 behaviour tests in
  [`tests/api/documents/upload.test.ts`](../../../tests/api/documents/upload.test.ts)
  (magic-fail keeps original, upload-fail keeps original, upsert-fail rolls back only the new
  object, upload-before-remove ordering via `invocationCallOrder`).
- **No regressions:** full suite 2000/304 green (was 1994; +6 new tests).
- **No live pixel pass:** backend upload endpoint, not observable in the browser preview;
  fully covered by the reordered unit tests.

## Resume notes

- The original is destroyed **only** after the replacement is committed — never reintroduce
  an up-front delete. The upsert (not delete+insert) is what removes the missing-row window.
- Coverage of the `(owner, kind)` unique index is load-bearing for `onConflict`; it's created
  in `20260604060000_add_documents.sql:21` and survives `20260605000000_simplify_documents.sql`
  (which only drops three columns).
- `insertDocument` and `deleteDocument` are no longer called by the upload route (upsert
  supersedes them). They remain exported + unit-tested repo primitives; left in place rather
  than removed (deleteDocument is a plausible vault-delete primitive). Flagged for the founder.
- MV-124 Slice 3 is DONE via this card. Remaining open MV-124 slices: 2, 5, 6; 7/8 founder-gated.
