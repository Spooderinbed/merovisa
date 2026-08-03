/**
 * A CASE-SCOPED read failed — the query never answered.
 *
 * ## Why this exists, and why it is a recurrence rather than a new idea
 *
 * MV-133 shipped `CatalogReadError` for exactly one lie: a repository that
 * collapses `{ error }` into `[]` / `null` makes an outage indistinguishable from
 * an empty answer, and every surface renders the empty one. A student whose
 * database read failed is told, confidently, that they have no programs.
 *
 * MV-157 re-introduced the same shape on a new axis. Every migrated read is now
 * keyed on `case_id`; several of them ended `if (error || !data) return null` (or
 * did not destructure `error` at all), so a missing MV-155 migration — the exact
 * failure the cards gate the merge on, which raises `42703 undefined column` on
 * *every* migrated read — renders as an empty dashboard rather than an outage.
 * The student is shown a product with nothing in it and no reason to retry.
 *
 * So the rule is MV-133's, restated for the case axis: **a real PostgREST error
 * throws; `null` / `[]` is reserved for the query that answered with nothing.**
 * `case_id`-keyed reads legitimately answer with nothing all the time (a brand-new
 * account, a case with no documents), which is precisely why the two must not
 * share a return value.
 *
 * Lives outside the repositories so surfaces — and tests that mock a repo — can
 * identify it without importing the `server-only` read layer.
 */
export class CaseReadError extends Error {
  readonly table: string;

  constructor(table: string, cause?: unknown) {
    super(`Case-scoped read failed: ${table}`, { cause });
    this.name = "CaseReadError";
    this.table = table;
  }
}

export function isCaseReadError(err: unknown): err is CaseReadError {
  return err instanceof CaseReadError;
}

/**
 * The shape PostgREST hands back on `{ error }`. Narrow rather than `any` so a
 * `code` check at a call site is type-checked.
 */
export interface PostgrestErrorLike {
  code?: string;
  message?: string;
}

/**
 * `23505 unique_violation`. Named because Stage 2 has a *predictable* one: the
 * legacy owner-keyed uniques are still live while every new upsert conflict-
 * targets `case_id`, so an owner-keyed row that never received a `case_id`
 * (MV-155 residue) collides instead of conflicting. See
 * `lib/cases/residue.ts`.
 */
export function isUniqueViolation(error: unknown): boolean {
  return (error as PostgrestErrorLike | null)?.code === "23505";
}
