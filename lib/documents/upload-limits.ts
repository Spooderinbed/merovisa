/**
 * The two hard limits every document upload obeys, in one place.
 *
 * MV-186 added a SECOND uploader — `app/api/cases/[caseId]/document-requests/[requestId]/versions`
 * beside the vault's `app/api/documents/upload` — and two endpoints disagreeing about what
 * counts as a valid file is a difference nobody can see from either one. A 6MB PDF accepted by
 * the counsellor's uploader and refused by the student's is not a bug either file contains.
 *
 * THE BUCKET ITSELF BOUNDS NOTHING. Spec §6.1 measured `documents` on both the production and
 * the local catalogue: private, **no size limit and no mime allow-list**. So these two constants
 * are the only limit that exists, which is why they are worth a module of their own rather than
 * a const at the top of whichever route was written first.
 *
 * ## Why this is not in `./upload-validation.ts`, which is where it looks like it belongs
 *
 * `tests/api/documents/upload.test.ts` mocks that module WHOLESALE (`vi.mock` with an explicit
 * factory), so any new export the vault route imports from it fails to resolve at import time —
 * measured, not guessed. Sharing through that module would therefore have required editing a
 * pinned suite belonging to another slice, which MV-190's acceptance criterion 6 exists to
 * prevent. A separate module is unmocked, so both routes read the real values and no existing
 * assertion moves.
 *
 * No `server-only`: two literals with no secret and no rule that must be hidden from client JS.
 */

/** 5MB. The vault has enforced this since Stage 2; the collaboration uploader inherits it. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * The four types `verifyFileMagic` can actually check the bytes of. A type admitted here but
 * unknown to that function would be a declared-type check with no magic-byte check behind it,
 * which is the MIME-spoofing hole the magic check exists to close.
 */
export const ALLOWED_UPLOAD_TYPES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];
