import { isWellFormedId } from "@/lib/cases/path-ids";

/**
 * The case-keyed Storage prefix — spec §4 (1) and §6.2.
 *
 * A collaboration object lives at `case/<case_id>/<version_id>`. That is a NEW prefix: nothing
 * existing moves, and the vault's owner-keyed objects (`<owner_uid>/<kind>/<uuid>.<ext>`) stay
 * exactly where they are. They are live student PII in production, and a copy-and-rewrite of
 * `documents.file_path` is a data-loss-shaped operation with nothing to gain.
 *
 * ## Why a `case/` folder is SAFE by default, and why that is the whole design
 *
 * The `documents` bucket carries three policies and no more. Both client-facing ones read
 *
 *     bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text
 *
 * so a key whose first segment is the literal `case` matches for NOBODY: `case` is not a uuid, and
 * `auth.uid()` always is. The prefix is therefore unreachable by any direct client call, which is
 * why spec §6.1 declined to add a policy for it — a `authenticated` SELECT policy would be a
 * SECOND path to the same bytes and the weaker one, since it would have to restate "may this actor
 * staff this case" in SQL and drift from `checkCasePermission` unobserved.
 *
 * The one way in is `mintCaseScopedDownloadUrl` (`./signed-download.ts`), which authorizes the case
 * first and then signs.
 *
 * ## Two instruments, deliberately not the same one
 *
 * - **The floor** is a database CHECK, `case_document_versions_storage_path_case_prefix`: a version
 *   row may only ever name an object under its own case's prefix. It binds every role including
 *   `service_role`, and it is a `like` bound rather than an equality so a file extension stays
 *   possible later.
 * - **The ceiling** is `caseVersionObjectPath` below: one exact key per version, so no call site
 *   has to decide the shape for itself.
 *
 * No `server-only`: this is pure string work with no secrets and no rule that must be hidden from
 * client JS — the same reasoning `lib/cases/path-ids.ts` and `lib/cases/route-denial.ts` give.
 */

/** The first path segment of every collaboration object. Shared so the builder and the predicates cannot drift. */
export const CASE_OBJECT_PREFIX = "case";

/**
 * `case/<case_id>/<object_name>` — any object belonging to a case rather than to a person.
 *
 * The case id is format-checked and this THROWS on a bad one. A silent `case/undefined/…` would
 * satisfy neither the constraint nor any reader, and would surface as a `23514` raised from inside
 * a repository rather than as the bad argument it is. The object name is checked only for being
 * non-empty and separator-free: callers supply either a version id or a `<uuid>.<ext>`, and a name
 * carrying its own `/` would silently create a folder the case bound was not written for.
 */
export function caseObjectPath(caseId: string, objectName: string): string {
  if (!isWellFormedId(caseId)) {
    throw new Error(`caseObjectPath: malformed case id ${JSON.stringify(caseId)}`);
  }
  if (objectName.length === 0 || objectName.includes("/")) {
    throw new Error(`caseObjectPath: malformed object name ${JSON.stringify(objectName)}`);
  }
  // CANONICAL, because this string is PERSISTED and a Storage key is compared as bytes.
  // `isWellFormedId` is `z.uuid()`, which accepts `A1B2…` as readily as `a1b2…`, and nothing
  // upstream normalises: `resolveTargetCase` returns the caller's string verbatim. Postgres, by
  // contrast, stores `uuid` lowercase — so an uppercase `?caseId=` would write the bytes under
  // `case/<UPPER>/…` while the row beside them said `<lower>`, and the two would never meet again.
  // Lowercasing here is also what the DB floor already expects: the
  // `case_document_versions_storage_path_case_prefix` CHECK renders `case_id::text` lowercase.
  return `${CASE_OBJECT_PREFIX}/${caseId.toLowerCase()}/${objectName}`;
}

/**
 * `case/<case_id>/<version_id>` — the key a COLLABORATION object is uploaded to, and the exact
 * string `case_document_versions_storage_path_case_prefix` is the floor under.
 *
 * No file extension. `case_document_versions.content_type` exists exactly so the key does not have
 * to carry one; the vault's paths carry an extension only because `documents` has no such column.
 */
export function caseVersionObjectPath(caseId: string, versionId: string): string {
  if (!isWellFormedId(versionId)) {
    throw new Error(`caseVersionObjectPath: malformed version id ${JSON.stringify(versionId)}`);
  }
  try {
    return caseObjectPath(caseId, versionId);
  } catch {
    // Re-thrown in this function's own name so the message names the argument the CALLER passed.
    throw new Error(`caseVersionObjectPath: malformed case id ${JSON.stringify(caseId)}`);
  }
}

/**
 * Is this key in the collaboration prefix at all?
 *
 * The separator is part of the test on purpose: a bare `startsWith("case")` is a substring test,
 * and it would quietly adopt every sibling folder (`casefiles/…`) into a rule written for one.
 */
export function isCaseScopedObjectPath(storagePath: string): boolean {
  return storagePath.startsWith(`${CASE_OBJECT_PREFIX}/`);
}

/**
 * May a caller who has just authorized `caseId` be handed `storagePath`?
 *
 * - A **case-keyed** key must be this case's, with something after the case segment.
 * - An **owner-keyed vault** key is admitted, because it cannot carry a case in its name at all.
 *   Its authorization is the case-filtered row read that produced it — `app/api/documents/[id]/view`
 *   reads `documents` with `.eq("case_id", caseId)` — and this predicate must not pretend to
 *   re-check something it cannot see.
 *
 * A `..` segment is refused outright. Storage keys are literal strings rather than filesystem
 * paths, so `..` resolves to nothing and is not a traversal — but no legitimate producer emits one,
 * and refusing costs a single comparison.
 */
export function isOwnCaseObjectPath(caseId: string, storagePath: string): boolean {
  if (storagePath.split("/").includes("..")) return false;
  if (!isCaseScopedObjectPath(storagePath)) return true;
  // The trailing separator is the boundary: without it `case/<id>` also matches `case/<id>extra/…`.
  // Compared case-INSENSITIVELY on the same reasoning as `caseObjectPath`: a uuid's hex is the same
  // id in either casing, so a key written before that normalisation existed is still THIS case's
  // key, and refusing it would lock a file away rather than protect anything. The comparison is a
  // prefix test only, so folding the whole probe cannot widen what counts as "inside the case".
  const own = `${CASE_OBJECT_PREFIX}/${caseId.toLowerCase()}/`;
  return storagePath.toLowerCase().startsWith(own) && storagePath.length > own.length;
}
