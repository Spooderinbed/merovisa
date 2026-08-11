import { NextResponse } from "next/server";
import type { CaseDenyReason } from "@/lib/cases/permissions";

/**
 * Turning an organization-permission denial into a status code, in one place.
 *
 * ## Why this is not just `403`
 *
 * `checkOrgPermission` is careful to keep "this role may not do this" apart from
 * "the membership read did not complete" — `getOrgContext` answers `lookup-failed`
 * for a statement timeout, a dropped connection or a thrown client, and
 * `require-org-permission.ts` passes that reason through deliberately rather than
 * re-deriving it. Both write routes then collapsed every reason into 403, and the
 * client renders a 403 as "That change was not allowed."
 *
 * So an owner who clicked Deactivate while Supabase blipped was told they lacked
 * permission for a change they are entitled to make, with nothing to indicate an
 * outage and nothing to retry. `lookup-failed` is not an answer about the actor;
 * no claim about their standing was ever established. It gets 503, which
 * `components/workspace/save-error.ts` renders as a transient failure.
 *
 * This is the write-route spelling of the distinction the three workspace PAGES
 * already make (`.../team/page.tsx`, `.../students/page.tsx`,
 * `.../settings/page.tsx` each render an outage card for `lookup-failed` instead
 * of `notFound()`). That sweep stopped at the pages; the routes those pages POST
 * to still answered 403 (MV-170 adversarial review, 2026-08-10).
 */

/**
 * True when a decision carries no verdict about the actor because the lookup
 * behind it failed.
 *
 * Exported for the call sites that must not merely re-status a denial but STOP:
 * a failed `org.settings` check is read as `actorIsOwner: false`, which is a
 * factual claim about the actor that nothing supports.
 */
export function isPermissionOutage(reason: CaseDenyReason | null | undefined): boolean {
  return reason === "lookup-failed";
}

/** The response for a denied organization-permission check. */
export function permissionDenialResponse(reason: CaseDenyReason | null | undefined): NextResponse {
  if (isPermissionOutage(reason)) {
    return NextResponse.json(
      { error: "Could not check your access", reason: "lookup-failed" },
      { status: 503 },
    );
  }
  return NextResponse.json({ error: "Forbidden", reason: reason ?? null }, { status: 403 });
}
