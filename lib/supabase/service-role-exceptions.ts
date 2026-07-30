/**
 * The service-role exception list — the enumerated, reviewed inventory of every
 * module allowed to construct the Supabase service-role client.
 *
 * WHY THIS FILE EXISTS. The service-role key bypasses Row Level Security
 * entirely, and RLS evaluated as the authenticated user is the tenant-isolation
 * boundary for the consultancy workspace (plan §"Enforcement boundary"). So every
 * service-role call site is a hole cut through the boundary on purpose. The plan
 * therefore reduces service-role to "a short, enumerated exception list — for
 * example invitation acceptance, account linking, storage administration, and
 * deletion jobs — where every entry is named, justified, preceded by an explicit
 * case authorization check, and audited", and adds: "new consultancy features
 * must not add service-role paths outside that list" (plan lines 340-344).
 *
 * THIS LIST IS MACHINE-ENFORCED, not a convention. `eslint.config.mjs` defines
 * `merovisa/service-role-exception-list`, which errors on any module under
 * `lib/` or `app/` that imports, re-exports, requires, or dynamically imports
 * `lib/supabase/admin` while absent from `SERVICE_ROLE_EXCEPTION_PATHS` below.
 * `tests/supabase/service-role-exceptions.test.ts` independently sweeps the
 * working tree for drift and proves the rule survives aliasing and re-export.
 * Adding a call site means adding an entry here — in the same commit, in front of
 * a reviewer.
 *
 * READ `lib/cases/README.md` before adding one. The correct default for anything
 * touching case-scoped data is the AUTHENTICATED client plus
 * `requireCasePermission`, not an entry in this file.
 *
 * STAGE 1 STATUS. Every path below predates the tenancy work. They are
 * owner-column-scoped paths from the pre-tenancy model: each authenticates with
 * `supabase.auth.getUser()` and then filters by `.eq("owner", userId)` against
 * the service-role client. That is precisely the default the plan inverts, and
 * migrating them onto the authenticated client is Stage 2 work — explicitly out
 * of MV-151's scope. None of them touches `cases`, `organizations`,
 * `organization_memberships`, `case_assignments`, `invitations`, or
 * `audit_events`; those six tables are RLS-forced deny-all until MV-152.
 *
 * AUDIT WIRING IS NOT YET POSSIBLE. `auditEvent` names the `audit_events.action`
 * a path must emit once it touches case-scoped data. Nothing emits one today:
 * MV-150 shipped `private.write_audit_event` with EXECUTE revoked from public, so
 * there is no callable write path until MV-152's grant review. A `null` here
 * means "this path touches no case-scoped data", never "auditing was skipped".
 *
 * No `server-only` import: this module is inert metadata with no secrets, and it
 * is deliberately readable by tooling and tests (the ESLint rule parses this very
 * file for its allow-list, which is what keeps one source of truth).
 */

export type ServiceRoleExceptionStatus =
  /** `lib/supabase/admin.ts` itself — the factory the rule fences. */
  | "client-definition"
  /**
   * Pre-tenancy owner-scoped path. Authenticates the user, then reaches for
   * service-role and hand-checks the `owner` column. Stage 2 migrates these onto
   * the authenticated client; until then they are grandfathered, not endorsed.
   */
  | "legacy-owner-scoped"
  /**
   * There is genuinely no authenticated session (or no owner yet) to act as, so
   * service-role is the only possible actor. Matches a plan-named category.
   */
  | "sanctioned";

export interface ServiceRoleException {
  /** Repo-relative path, forward slashes. Must match the file exactly. */
  path: string;
  status: ServiceRoleExceptionStatus;
  /** Why this path cannot simply use the authenticated client. */
  justification: string;
  /** The authorization that must already have happened before service-role is used. */
  requiredCaseCheck: string;
  /** The `audit_events.action` this path must emit; null = touches no case data. */
  auditEvent: string | null;
}

/**
 * The allow-list. Every entry was read and classified against the file's actual
 * behaviour on 2026-07-30 (MV-151); none is speculative.
 *
 * The ESLint rule extracts the `path:` literals from this array, so keep them as
 * plain double-quoted string literals on their own line.
 */
export const SERVICE_ROLE_EXCEPTIONS: readonly ServiceRoleException[] = [
  {
    path: "lib/supabase/admin.ts",
    status: "client-definition",
    justification:
      "Defines createSupabaseAdminClient. Fencing the factory's own module would be circular; the rule fences its importers instead.",
    requiredCaseCheck: "n/a — constructs a client, performs no query.",
    auditEvent: null,
  },
  {
    path: "lib/auth/finish-sign-in.ts",
    status: "sanctioned",
    justification:
      "Account linking (plan line 342). Claims an anonymous assessment into a freshly created account and bootstraps the profile. The row has no owner until this runs, so an authenticated client under RLS could not see the row it is about to claim.",
    requiredCaseCheck:
      "None today — pre-tenancy, no case exists. Once cases are claimable this path must verify the claim token binds this Auth user to this case before writing.",
    auditEvent: null,
  },
  {
    path: "app/api/assess/claim/route.ts",
    status: "sanctioned",
    justification:
      "Account linking (plan line 342), the API-route twin of finish-sign-in.ts: binds an ownerless anonymous assessment to the signed-in user via an HMAC claim token.",
    requiredCaseCheck:
      "Verifies the HMAC claim token before writing. Once cases are claimable the same path must additionally bind case → Auth user.",
    auditEvent: null,
  },
  {
    path: "app/api/cron/purge-anonymous/route.ts",
    status: "sanctioned",
    justification:
      "Deletion job (plan line 342). A scheduled retention purge runs with no user session at all, so there is no authenticated identity to act as.",
    requiredCaseCheck:
      "n/a — acts on unclaimed anonymous rows by retention predicate, never on a caller-supplied id. The purge predicate is the guard (docs/data-retention-policy.md).",
    auditEvent: null,
  },
  {
    path: "app/api/leads/route.ts",
    status: "sanctioned",
    justification:
      "Public marketing lead capture from an anonymous visitor. There is no session to authenticate, and `public.leads` is RLS-locked against anon by design.",
    requiredCaseCheck: "n/a — writes only the posted lead, reads nothing back.",
    auditEvent: null,
  },
  {
    path: "app/api/dev/sign-in/route.ts",
    status: "sanctioned",
    justification:
      "Development-only sign-in harness that mints a user and seeds fixtures. Functionally dead outside development: the route 404s unless NODE_ENV is not production, its dev secret matches, and the Supabase URL looks local.",
    requiredCaseCheck: "n/a — must never be reachable in production; the route's own three gates are the guard.",
    auditEvent: null,
  },
  {
    path: "app/(focused)/assessment/[id]/page.tsx",
    status: "legacy-owner-scoped",
    justification:
      "Renders an anonymous assessment by id for a visitor who is not signed in; falls back to the authenticated client as soon as there is a session. Pre-tenancy 'knowing the id is the credential' model.",
    requiredCaseCheck:
      "None — this is exactly the shape the tenancy work removes ('knowing a case ID grants no access', plan line 354). Stage 2 must re-scope it.",
    auditEvent: null,
  },
  {
    path: "app/api/account/delete/route.ts",
    status: "legacy-owner-scoped",
    justification:
      "Account self-deletion: removes Storage objects and every owned row, then the Auth user. Authenticates first, then deletes scoped by `owner`.",
    requiredCaseCheck: "Authenticates via supabase.auth.getUser() and scopes every delete to that user's `owner` column.",
    auditEvent: null,
  },
  {
    path: "app/api/assess/refresh/route.ts",
    status: "legacy-owner-scoped",
    justification: "Re-scores the signed-in user's own primary assessment in place.",
    requiredCaseCheck: "Authenticates via supabase.auth.getUser(); the repo lookup is scoped to that user.",
    auditEvent: null,
  },
  {
    path: "app/api/assess/route.ts",
    status: "legacy-owner-scoped",
    justification:
      "Two distinct uses: reading the non-tenant programs/universities catalogue, and inserting the caller's own assessment plus bootstrapped profile.",
    requiredCaseCheck: "Authenticates via supabase.auth.getUser() before any owner-scoped write; the catalogue read is not tenant data.",
    auditEvent: null,
  },
  {
    path: "app/api/documents/[id]/route.ts",
    status: "legacy-owner-scoped",
    justification:
      "Storage administration (plan line 342): deletes a private Storage object and its row. The authenticated client cannot remove Storage objects under the current bucket policy.",
    requiredCaseCheck:
      "Re-reads the document with `.eq(\"owner\", userId)` and 404s before touching Storage. Stage 2 must replace the owner check with requireCasePermission.",
    auditEvent: null,
  },
  {
    path: "app/api/documents/[id]/view/route.ts",
    status: "legacy-owner-scoped",
    justification:
      "Storage administration (plan line 342): mints a short-lived signed URL for a private object.",
    requiredCaseCheck:
      "Re-reads the document with `.eq(\"owner\", userId)` before minting. Stage 3 must additionally authorize case + document metadata and record the view at mint time (plan §\"Storage authorization\").",
    auditEvent: null,
  },
  {
    path: "app/api/documents/upload/route.ts",
    status: "legacy-owner-scoped",
    justification:
      "Storage administration (plan line 342): uploads to the private bucket and cleans up the replaced object on the unique (owner, kind) index.",
    requiredCaseCheck: "Authenticates via supabase.auth.getUser(); the row and the object path are scoped to that user.",
    auditEvent: null,
  },
  {
    path: "app/api/plan/action/route.ts",
    status: "legacy-owner-scoped",
    justification: "Mutates the signed-in user's own plan items.",
    requiredCaseCheck: "Authenticates via supabase.auth.getUser(); writes are scoped to that user's `owner` column.",
    auditEvent: null,
  },
  {
    path: "app/api/profile/section/route.ts",
    status: "legacy-owner-scoped",
    justification: "Writes one section of the signed-in user's own profile.",
    requiredCaseCheck: "Authenticates via supabase.auth.getUser(); the upsert is scoped to that user's `owner` column.",
    auditEvent: null,
  },
  {
    path: "app/api/shortlist/route.ts",
    status: "legacy-owner-scoped",
    justification: "Writes the signed-in user's own program shortlist state.",
    requiredCaseCheck: "Authenticates via supabase.auth.getUser(); the upsert is scoped to that user's `owner` column.",
    auditEvent: null,
  },
];

/** The bare allow-list the ESLint rule and the drift sweep compare against. */
export const SERVICE_ROLE_EXCEPTION_PATHS: readonly string[] = SERVICE_ROLE_EXCEPTIONS.map(
  (exception) => exception.path,
);

/**
 * The categories the plan sanctions for the consultancy workspace (line 342).
 * NONE of these has a call site yet — invitations and the audit write path are
 * inert in Stage 1. They are recorded so the eventual implementation inherits its
 * required check and audit event from a reviewed decision rather than inventing
 * one, and so a reviewer can tell "sanctioned category" apart from "someone
 * reached for the admin client".
 *
 * A new call site still has to be added to SERVICE_ROLE_EXCEPTIONS above; being
 * an instance of a sanctioned category is a justification, not an exemption.
 */
export interface SanctionedServiceRoleCategory {
  category: string;
  justification: string;
  requiredCaseCheck: string;
  auditEvent: string;
}

export const SANCTIONED_SERVICE_ROLE_CATEGORIES: readonly SanctionedServiceRoleCategory[] = [
  {
    category: "invitation acceptance",
    justification:
      "The invitee is not yet a member or a linked student, so under RLS they can see neither the invitation nor the case they are accepting into.",
    requiredCaseCheck:
      "Atomic compare-and-swap on invitations.token_hash (unaccepted, unrevoked, unexpired, email matches) — the affected row count is the authorization.",
    auditEvent: "invitation.accepted",
  },
  {
    category: "account linking",
    justification:
      "Binding an Auth user to a case that has no student_user_id yet: the row is invisible to the very user about to be linked to it.",
    requiredCaseCheck: "A verified single-use token that names the case; never a caller-supplied case id.",
    auditEvent: "case.student_linked",
  },
  {
    category: "storage administration",
    justification:
      "Removing objects and minting signed URLs against the private bucket, which the authenticated client cannot do under the bucket policy.",
    requiredCaseCheck:
      "requireCasePermission for the document's case must have passed first; a Storage path prefix is never sufficient (plan line 381).",
    auditEvent: "document.viewed",
  },
  {
    category: "deletion jobs",
    justification: "Scheduled retention and purge work runs with no user session to act as.",
    requiredCaseCheck: "Acts on a retention predicate, never on a caller-supplied id.",
    auditEvent: "retention.purged",
  },
];
