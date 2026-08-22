import "server-only";
import { NextResponse } from "next/server";
import type { CaseAuthorizationClient } from "./context";
import { resolvePersonalCaseId } from "./personal-case";
import { checkCasePermission } from "./require-permission";
import { isWellFormedId, malformedIdResponse } from "./path-ids";
import { caseDenialResponse } from "./route-denial";
import type { CaseDenyReason, CaseScopedPermission } from "./permissions";

/**
 * `resolveTargetCase` — the one place a case-scoped WRITE route decides which
 * case it is writing to, and the closure of spec **F-8**.
 *
 * ## What was wrong, and why nothing went red
 *
 * Seven routes resolved `resolvePersonalCaseId(<actor>.id, …)` and accepted no
 * case id at all — F-8 names five, and MV-172 found two more that its lens could
 * not see (`plan/action`, `profile/section` were measured through the
 * service-role registry, which gave them a client disposition and said nothing
 * about their case id). Render those same controls inside a counsellor's case
 * route and every one of them writes the STUDENT's shortlist, checklist tick,
 * plan action and profile edit onto **the counsellor's own case**.
 *
 * **RLS cannot catch it.** The counsellor legitimately may reach their own case,
 * so `ups_insert_case` and friends admit the row and the write succeeds — against
 * the wrong student. There is no error to log and no status to assert on.
 *
 * ## The two properties this module holds
 *
 * 1. **A requested case id is AUTHORIZED, never trusted.** It goes through
 *    `checkCasePermission` exactly as a resolved one does — plan line 354,
 *    "knowing a case ID grants no access". A counsellor assigned to case A who
 *    asks for case B is denied here, before the route reads or writes anything.
 * 2. **When a case id is requested, the actor's personal case is never
 *    consulted.** That is deliberate and load-bearing: a fallback is precisely
 *    what would let a mishandled id land on the counsellor's own case quietly.
 *    `tests/cases/target-case.test.ts` asserts `resolvePersonalCaseId` was not
 *    called, and `tests/api/case-denial.test.ts` asserts the permission layer was
 *    asked about the requested id rather than a session-resolved one.
 *
 * A `caseId` that is present but not a uuid is **malformed**, not absent. Falling
 * back to the personal case for a badly-named one is the same silent wrong-case
 * write by another route.
 */

/**
 * MV-189 (spec §8.5, D15): the success variant carries `organizationId` — the case's own
 * organization, or `null` for a personal case.
 *
 * It is ADDITIVE and costs no round trip. `checkCasePermission` below already returns
 * `{ decision, context }`, and `CaseContext.organizationId` is resolved inside
 * `getCaseContext` from `cases.select("id, organization_id, student_user_id")`. This
 * function was computing the value and then throwing it away.
 *
 * Why an audit row needs it: `audit_events_select_admin` reads
 * `USING (organization_id = ANY (private.actor_admin_org_ids()))`, and `NULL = ANY(…)`
 * is `NULL` in SQL, not `true` — so a row written with a null organization is readable by
 * nobody, ever. Every callable must therefore pass through the case's REAL organization,
 * even while every case is personal and that value is legitimately null.
 */
export type TargetCase =
  | { ok: true; caseId: string; organizationId: string | null }
  | { ok: false; kind: "malformed" }
  | { ok: false; kind: "no-personal-case" }
  | { ok: false; kind: "denied"; reason: CaseDenyReason | null };

/**
 * The optional `caseId` a case-scoped write route accepts, read off the RAW body
 * rather than through each route's own Zod schema.
 *
 * Deliberately orthogonal to the domain payload: the five validation schemas stay
 * about what the request MEANS, and none of them is `.strict()`, so the extra key
 * passes them untouched. The value is returned exactly as it arrived — coercing
 * here would turn a malformed request into a well-formed one before the single
 * format gate below ever sees it.
 */
export function requestedCaseId(body: unknown): unknown {
  if (typeof body !== "object" || body === null) return undefined;
  return (body as { caseId?: unknown }).caseId;
}

export async function resolveTargetCase(
  actorUserId: string,
  requested: unknown,
  permission: CaseScopedPermission,
  db: CaseAuthorizationClient,
): Promise<TargetCase> {
  let caseId: string;

  if (requested === undefined) {
    // The personal surfaces, unchanged: the actor's own case, resolved for the
    // SESSION actor and never taken from the request.
    const personal = await resolvePersonalCaseId(actorUserId, db);
    // Not a permission question. `checkCasePermission(actor, null, …)` would turn
    // "this account has no workspace" into an authorization answer about a case
    // that does not exist.
    if (personal === null) return { ok: false, kind: "no-personal-case" };
    caseId = personal;
  } else {
    if (!isWellFormedId(requested)) return { ok: false, kind: "malformed" };
    caseId = requested as string;
  }

  const { decision, context } = await checkCasePermission(actorUserId, caseId, permission, db);
  if (!decision.allowed) return { ok: false, kind: "denied", reason: decision.reason };

  // `context.organizationId` comes from the same lookup that just authorized the case
  // (D15). Reading it here rather than re-querying is what keeps the audit wiring free of
  // a second round trip on every document access.
  // `?? null` normalizes rather than defends: `CaseContext.organizationId` is typed
  // `string | null` and `getCaseContext` always sets it, but the declared shape of
  // `TargetCase` is `string | null` and an `undefined` leaking through would be an
  // omitted column on an audit insert rather than an explicit null — a silent difference
  // in the one field D15 is about.
  return { ok: true, caseId, organizationId: context.organizationId ?? null };
}

/**
 * The refusal, turned into a status. `noCaseMessage` is a parameter because the
 * seven routes genuinely disagree on it — `profile/section` tells the student
 * "Couldn't save your profile" while the rest say "no workspace for this
 * account", and `tests/api/case-denial.test.ts` pins each one. Inventing a
 * uniform message here would change four responses for no reason.
 *
 * The denial half delegates to `caseDenialResponse` so the three outcomes it
 * keeps apart — could not tell (500), nothing here (404), not yours (403) — stay
 * apart on these routes too.
 */
export function targetCaseResponse(
  result: Exclude<TargetCase, { ok: true }>,
  noCaseMessage: string,
): Response {
  if (result.kind === "malformed") return malformedIdResponse();
  if (result.kind === "no-personal-case") {
    return NextResponse.json({ error: noCaseMessage }, { status: 500 });
  }
  return caseDenialResponse(result.reason);
}
