import "server-only";
import { getCaseContext, type CaseAuthorizationClient, type CaseContext } from "./context";
import {
  decideCasePermission,
  type CaseDenyReason,
  type CasePermission,
  type CasePermissionDecision,
} from "./permissions";

/**
 * `requireCasePermission` — the single call every server path that touches
 * case-scoped data makes before it reads or writes anything.
 *
 * See `./README.md` for the doctrine and the Stage 3 review-gate checklist. The
 * contract in one line: it resolves the actor's context from the database
 * (`getCaseContext`), decides the claim against the pure grid
 * (`decideCasePermission`), and throws on anything short of an explicit allow.
 *
 * There is no `role` parameter, by design — a caller cannot assert who it is
 * (plan line 101). The only inputs are two identifiers, a claim, and optionally
 * the request-scoped authenticated client.
 */

/**
 * Thrown on every denial. Carries the decision detail as typed fields for server
 * logs and for MV-153's assertions; the `message` deliberately contains no actor
 * or case identifier so a caller that bubbles it cannot leak one to a client
 * (CLAUDE.md §Architecture Rules).
 */
export class CaseAuthorizationError extends Error {
  readonly permission: CasePermission;
  readonly caseId: string;
  readonly actorUserId: string;
  readonly reason: CaseDenyReason;

  constructor(args: {
    permission: CasePermission;
    caseId: string;
    actorUserId: string;
    reason: CaseDenyReason;
  }) {
    super(`Case authorization denied for ${args.permission} (${args.reason})`);
    this.name = "CaseAuthorizationError";
    this.permission = args.permission;
    this.caseId = args.caseId;
    this.actorUserId = args.actorUserId;
    this.reason = args.reason;
  }
}

/**
 * The non-throwing form: resolve the context and decide, returning both. Use it
 * where a denial is an expected branch rather than an error — deciding whether to
 * render an action, or logging a decision. Callers MUST branch on
 * `decision.allowed`; a falsy check on the returned object always passes.
 */
export async function checkCasePermission(
  actorUserId: string,
  caseId: string,
  permission: CasePermission,
  db?: CaseAuthorizationClient,
): Promise<{ decision: CasePermissionDecision; context: CaseContext }> {
  const context = await getCaseContext(actorUserId, caseId, db);

  // A context that established no relationship carries the reason why; reuse it
  // rather than re-deriving, so "unknown case" and "lookup failed" stay
  // distinguishable from "this role may not do this".
  if (context.denyReason !== null && !context.hasAccess) {
    return { decision: { allowed: false, requiredScope: null, reason: context.denyReason }, context };
  }

  return { decision: decideCasePermission(permission, context), context };
}

/**
 * Authorize one claim or throw. Returns the resolved context on success so the
 * caller does not need a second round trip for the organization id or the role.
 */
export async function requireCasePermission(
  actorUserId: string,
  caseId: string,
  permission: CasePermission,
  db?: CaseAuthorizationClient,
): Promise<CaseContext> {
  const { decision, context } = await checkCasePermission(actorUserId, caseId, permission, db);

  if (!decision.allowed) {
    throw new CaseAuthorizationError({
      permission,
      caseId,
      actorUserId,
      // `decision.allowed === false` always carries a reason; the fallback exists
      // so a future refactor cannot turn a missing reason into a silent allow.
      reason: decision.reason ?? "scope-mismatch",
    });
  }

  return context;
}
