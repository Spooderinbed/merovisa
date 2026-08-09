/**
 * What a failed workspace write means, in words the person can act on.
 *
 * Both MV-169 forms used to end in a catch-all that reported every non-2xx as
 * "That change was not allowed." The routes do not return only 403s: they return
 * **401** when the session has expired (`app/api/org/[organizationId]/route.ts`,
 * and the members route), and **500** for a genuine write failure — `lib/org/repo.ts`
 * maps every PostgREST code other than 42501 and 23505 to `write-failed`, which
 * covers check-constraint violations, timeouts and connection failures, and its
 * two thrown-client catches land there too. So an owner whose session had simply
 * lapsed was told they lacked permission, and a transient outage was
 * indistinguishable from a real refusal. Neither reader could tell whether to
 * retry or to go and ask someone.
 *
 * This is the write-side spelling of a rule the read side already states:
 * `app/(app)/workspace/page.tsx` keeps "the lookup failed" and "you belong to
 * nothing" from rendering the same, and `checkOrgPermission` deliberately keeps
 * "lookup failed" distinct from "this role may not do this"
 * (`lib/cases/require-org-permission.ts`).
 *
 * 403 keeps the original sentence, because for a 403 it was always true. The
 * defect was applying it to everything else.
 *
 * Statuses a surface can answer more specifically — 404 on the members route,
 * 409 and 422 on the settings route — are handled at the call site and never
 * reach here.
 */
export function saveErrorMessage(status: number): string {
  if (status === 401) return "Your session has ended. Sign in again to make this change.";
  if (status === 403) return "That change was not allowed.";
  if (status === 404) return "We couldn't find that any more. Refresh the page and try again.";
  if (status === 422) return "That value isn't one we can save. Refresh the page and try again.";
  if (status >= 500) {
    return "We couldn't save that change. Something went wrong on our side — please try again in a moment.";
  }
  return "We couldn't save that change. Please try again.";
}
