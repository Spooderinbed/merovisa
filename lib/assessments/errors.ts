/**
 * The claim WRITE against `assessments` failed — the query never answered (a
 * transient Supabase/network outage), as opposed to answering "no row matched".
 *
 * Same honesty idiom as MV-133's `CatalogReadError`: a swallowed write error used
 * to collapse into "0 rows updated", which `claimAssessment` reported as a plain
 * `false` — indistinguishable from an assessment that was legitimately already
 * claimed or expired. The sign-in seam then told the student their work was gone
 * (`/assess?error=expired`) when the truth was "try again in a moment". Callers
 * catch this to route the retryable case to an honest, retry-able state (MV-130).
 *
 * Lives outside `repo.ts` so surfaces and tests can identify it without importing
 * the `server-only` read/write layer.
 */
export class AssessmentClaimError extends Error {
  constructor(cause?: unknown) {
    super("Assessment claim write failed", { cause });
    this.name = "AssessmentClaimError";
  }
}

export function isAssessmentClaimError(err: unknown): err is AssessmentClaimError {
  return err instanceof AssessmentClaimError;
}
