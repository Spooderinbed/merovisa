import { NextResponse } from "next/server";
import type { CaseDenyReason } from "./permissions";

/**
 * One mapping from a case-authorization denial to an HTTP status, shared by every
 * case-scoped write route.
 *
 * It is shared **because the three outcomes must not collapse**, and three copies
 * of the same `if` are how one of them quietly starts returning 403 for an outage.
 * The rule, which the read side already states
 * (`lib/cases/require-org-permission.ts`, `app/(app)/workspace/page.tsx`):
 *
 * - **`lookup-failed` → 500.** We could not tell. Telling the caller they lack
 *   permission would be a claim about them we have not established, and it sends
 *   them to ask a colleague instead of retrying.
 * - **`unknown-case` → 404.** There is nothing here. `getCaseContext` already
 *   refuses to distinguish "no such case" from "not yours", so this leaks nothing
 *   a 403 would not.
 * - **everything else → 403.** This role may not do this.
 *
 * `invalid-input` lands in the 403 branch deliberately: a blank case id reaching
 * a route whose path segment is the case id means the request was malformed in a
 * way the caller cannot fix by retrying, and it is not this helper's job to
 * invent a fourth story for it.
 *
 * No `server-only`: this is a pure status mapping with no secrets and no rule
 * that must be hidden from client JS — the same reasoning
 * `lib/cases/operational-status.ts` gives for staying unmarked.
 */
export function caseDenialResponse(reason: CaseDenyReason | null): Response {
  if (reason === "lookup-failed") {
    return NextResponse.json({ error: "Could not check your access" }, { status: 500 });
  }
  if (reason === "unknown-case") {
    return NextResponse.json({ error: "No such case" }, { status: 404 });
  }
  return NextResponse.json({ error: "Forbidden", reason }, { status: 403 });
}
