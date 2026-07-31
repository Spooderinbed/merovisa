import "server-only";
import type { CaseAuthorizationClient } from "./context";
import { getOrgContext, type OrgContext } from "./org-context";
import { AuthorizationError } from "./require-permission";
import {
  decideOrgPermission,
  type CasePermissionDecision,
  type OrgScopedPermission,
} from "./permissions";

/**
 * `requireOrgPermission` — the organization-level sibling of
 * `requireCasePermission`, for the five claims that are questions about an
 * ORGANIZATION rather than about one case: `case.list`, `case.create`,
 * `org.audit.read`, `org.manage`, `org.settings`.
 *
 * Those claims shipped in the matrix with no way to check them: the only entry
 * point took a `caseId` and denied with "unknown-case" when no row matched, so
 * "may this actor create a case?" had no answerable form. This is that form.
 *
 * Same contract as the case entry point: the context is resolved from the
 * database (`getOrgContext`), the claim is decided against the pure grid
 * (`decideOrgPermission`), and anything short of an explicit allow throws. There
 * is no `role` parameter — a caller cannot assert who it is (plan line 101).
 *
 * READ THE RETURNED SCOPE on an allow. `case.list` allows a counsellor with scope
 * `assigned`, which means "may list, filtered to their own `case_assignments`" —
 * not "may see every case in the organization". Use `checkOrgPermission` when you
 * need that scope; `requireOrgPermission` is for the yes/no gate.
 */

/** Thrown by `requireOrgPermission` on every denial. */
export class OrgAuthorizationError extends AuthorizationError {
  readonly organizationId: string;

  constructor(args: {
    permission: OrgScopedPermission;
    organizationId: string;
    actorUserId: string;
    reason: AuthorizationError["reason"];
  }) {
    super(
      "OrgAuthorizationError",
      `Organization authorization denied for ${args.permission} (${args.reason})`,
      args,
    );
    this.organizationId = args.organizationId;
  }
}

/**
 * The non-throwing form: resolve the org context and decide, returning both.
 * Callers MUST branch on `decision.allowed`; a falsy check on the returned object
 * always passes. On an allow, `decision.requiredScope` is the filter the caller
 * still has to apply.
 */
export async function checkOrgPermission(
  actorUserId: string,
  organizationId: string,
  permission: OrgScopedPermission,
  db?: CaseAuthorizationClient,
): Promise<{ decision: CasePermissionDecision; context: OrgContext }> {
  const context = await getOrgContext(actorUserId, organizationId, db);

  // A context that established no standing carries the reason why; reuse it
  // rather than re-deriving, so "not a member" and "lookup failed" stay
  // distinguishable from "this role may not do this".
  if (context.denyReason !== null && !context.hasAccess) {
    return { decision: { allowed: false, requiredScope: null, reason: context.denyReason }, context };
  }

  return { decision: decideOrgPermission(permission, context), context };
}

/**
 * Authorize one organization-level claim or throw. Returns the resolved context
 * on success so the caller does not need a second round trip for the role.
 */
export async function requireOrgPermission(
  actorUserId: string,
  organizationId: string,
  permission: OrgScopedPermission,
  db?: CaseAuthorizationClient,
): Promise<OrgContext> {
  const { decision, context } = await checkOrgPermission(actorUserId, organizationId, permission, db);

  if (!decision.allowed) {
    throw new OrgAuthorizationError({
      permission,
      organizationId,
      actorUserId,
      // `decision.allowed === false` always carries a reason; the fallback exists
      // so a future refactor cannot turn a missing reason into a silent allow.
      reason: decision.reason ?? "no-relationship",
    });
  }

  return context;
}
