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
 * `merovisa/service-role-exception-list`, which errors on any first-party module
 * absent from `SERVICE_ROLE_EXCEPTION_PATHS` below that either
 *
 *   (a) imports, re-exports, requires, or dynamically imports `lib/supabase/admin`
 *       — including through a template-literal specifier; or
 *   (b) names the SUPABASE_SERVICE_ROLE_KEY env var at all.
 *
 * (b) is the load-bearing half. Fencing only the import path fenced the HELPER,
 * not the capability: an inline
 * `createClient(url, process.env.<the service-role key>)` holds exactly the same
 * RLS-bypassing client while importing nothing this list has ever heard of — and
 * that is precisely what an author who does not know this helper exists reaches
 * for. `tests/supabase/service-role-exceptions.test.ts` independently sweeps the
 * working tree for both shapes. Adding a call site means adding an entry here —
 * in the same commit, in front of a reviewer.
 *
 * READ `lib/cases/README.md` before adding one. The correct default for anything
 * touching case-scoped data is the AUTHENTICATED client plus
 * `requireCasePermission`, not an entry in this file.
 *
 * STAGE 2 STATUS (MV-157). The Stage 1 note that every path here "filters by
 * `.eq("owner", userId)` against the service-role client" is no longer true and
 * has been replaced entry by entry. Each remaining `legacy-owner-scoped` path now
 * resolves the actor's personal case and calls `requireCasePermission` /
 * `checkCasePermission` through the AUTHENTICATED client BEFORE it reaches for
 * service-role, and every query it then issues is keyed on `case_id`.
 *
 * WHAT STILL KEEPS THEM HERE is the GRANT, not the check. `authenticated` holds
 * SELECT-only on `assessments`, and no INSERT on `profiles`, `plan_items` or
 * `documents` (2026-08-02-stage2-migration-and-access-matrix.md §4). Flipping one
 * without its grant is a silent empty result or a 42501 in production, and grants
 * are reviewed exactly once — with the policies, in MV-159 (§7.3). Each entry
 * below names the grant it is waiting on.
 *
 * The list SHRANK by one in MV-157: `app/api/shortlist/route.ts` left, because
 * `user_program_state` already grants `authenticated` full CRUD, so its admin
 * client was never load-bearing. It is the only flip Stage 2 makes.
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
 * AUDIT WIRING, RE-CHECKED AT MV-157/MV-158 rather than left stale: every
 * `auditEvent` below is still `null`, and it still means "no audit event is
 * emissible", not "auditing was skipped". `private.write_audit_event` has EXECUTE
 * revoked from PUBLIC (MV-150) and Stage 2 adds NO grant — grants are reviewed
 * once, with the policies, in MV-159 (spec §7.3). The two account-linking entries
 * are the ones that will want `case.student_linked` the moment that grant lands.
 *
 * The allow-list. Every entry was read and classified against the file's actual
 * behaviour on 2026-07-30 (MV-151) and re-read at MV-157/MV-158; none is
 * speculative.
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
      "Account linking (plan line 342). Claims an anonymous assessment into a freshly created account, creates or resolves the claimer's personal case, and bootstraps the profile. The row has no owner until this runs, so an authenticated client under RLS could not see the row it is about to claim.",
    requiredCaseCheck:
      "TWO branches, both service-role, both deriving the actor from the VERIFIED session object rather than a parameter. CLAIM branch: verifyClaim(params.claim) gates entry, then claimAndBootstrapProfile create-or-resolves the personal case (ensurePersonalCase) BEFORE the bind, and the conditional-update predicate inside claimAssessment — id + owner IS NULL + expires_at > now — is what decides which row may be bound. NO-CLAIM branch (MV-157): ensurePersonalCase alone, so a go-forward signup gets the case MV-155 only backfilled for owners that existed at migration time. Service-role is structurally required on both: the row has no owner until the claim runs, so an authenticated client under RLS cannot see the row it is about to claim; and cases_insert_admin's WITH CHECK requires organization_id IS NOT NULL, so the authenticated client cannot create a personal case at all. NO requireCasePermission call, and that is a decision, not an omission (MV-158): the claimer IS the data subject and there is no case to authorize against until this path creates one.",
    auditEvent: null,
  },
  {
    path: "app/api/assess/claim/route.ts",
    status: "sanctioned",
    justification:
      "Account linking (plan line 342): binds an ownerless anonymous assessment, named by a caller-supplied id, to the signed-in caller. Unlike finish-sign-in.ts this route verifies NO claim token.",
    requiredCaseCheck:
      "Authenticates via supabase.auth.getUser(); the only authorization is the conditional-update predicate inside claimAssessment (binds an UNCLAIMED, UNEXPIRED row only). That predicate is therefore load-bearing and must not be relaxed — a caller-supplied id alone decides which row is targeted. MV-158 kept it at exactly its old strength while adding case_id to the SAME single UPDATE, and added no second claim mechanism: this route calls the same claimAndBootstrapProfile the sign-in seam does, so the personal-case resolution, the atomic bind and the F1-F5 recovery legs cannot drift between the two entry points.",
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
      "Development-only sign-in harness that mints an Auth user with admin.createUser and seeds fixtures. TWO gates, both in ensureDevAllowed (route.ts:133): NODE_ENV must not be 'production', and ENABLE_DEV_SIGNIN must equal the string '1'. There is no dev secret and no caller-supplied credential of any kind — the opt-in env var IS the whole authorization.",
    requiredCaseCheck:
      "n/a — no case data. NOT a third gate: ensureDevAllowed also tests NEXT_PUBLIC_SUPABASE_URL, but its second alternative matches any *.supabase.co host, which is EVERY hosted project including production. Treat that check as decorative; only NODE_ENV and ENABLE_DEV_SIGNIN keep this route dead, so ENABLE_DEV_SIGNIN must never be set in a deployed environment.",
    auditEvent: null,
  },
  {
    path: "app/(focused)/assessment/[id]/page.tsx",
    status: "legacy-owner-scoped",
    justification:
      "Renders an UNCLAIMED, case-less anonymous assessment by id for a visitor who is not signed in; anon holds no grant on `assessments`, so service-role is the only possible reader. A signed-in visitor is served by the authenticated client instead.",
    requiredCaseCheck:
      "MV-157 re-scoped this. A CLAIMED row (case_id set) is now gated by checkCasePermission(actor, row.case_id, 'case.read') and 404s for anyone else. An UNCLAIMED, case-less row deliberately keeps id-as-credential: plan line 354 ('knowing a case ID grants no access') governs CASES, and a pre-claim anonymous row has none, is unguessable, and is purged in 3 days by MV-135. The service-role read is bounded by getRecoverableAssessment's own predicate (owner IS NULL AND expires_at > now), re-verified after the fetch.",
    auditEvent: null,
  },
  {
    path: "app/api/account/delete/route.ts",
    status: "legacy-owner-scoped",
    justification:
      "Account self-deletion: removes Storage objects and every owned row, then the Auth user. Authenticates first, then deletes scoped by `owner`.",
    requiredCaseCheck:
      "Authenticates via supabase.auth.getUser() and scopes every delete to that user's `owner` column — DELIBERATELY still owner-keyed, and one of only three sanctioned `.eq(\"owner\")` sites left after MV-157 (with the claim path and MV-135's purge). This is Auth-account teardown, not case-scoped access: it must remove everything belonging to the departing AUTH USER and must NOT touch a consultancy case that also holds their data (plan line 514). It additionally deletes their personal `cases` row, ordered between the owned-row deletes (ON DELETE RESTRICT) and the Auth-user delete (student_user_id ON DELETE SET NULL).",
    auditEvent: null,
  },
  {
    path: "app/api/assess/refresh/route.ts",
    status: "legacy-owner-scoped",
    justification:
      "Re-scores the case's own primary assessment in place. Deferred flip: `assessments` grants `authenticated` SELECT only — no UPDATE — so the write cannot move to the authenticated client until MV-159's grant review (spec §6).",
    requiredCaseCheck:
      "MV-157: resolvePersonalCaseId + checkCasePermission(actor, caseId, 'case.update') on the AUTHENTICATED client before the service-role re-score; the read and the write are both keyed on case_id.",
    auditEvent: null,
  },
  {
    path: "app/api/assess/route.ts",
    status: "legacy-owner-scoped",
    justification:
      "Three distinct uses: reading the non-tenant programs/universities catalogue; inserting the caller's own assessment plus bootstrapped profile; and creating their personal case. Deferred flip: `assessments` is SELECT-only and `profiles` has no INSERT grant (spec §6). The case creation is structurally service-role — cases_insert_admin refuses a personal case from the authenticated client.",
    requiredCaseCheck:
      "MV-157: ensurePersonalCase(user, admin) then checkCasePermission(actor, caseId, 'case.update') on the AUTHENTICATED client before the insert. ensurePersonalCase (not the read-only resolver) is deliberate — this is the first student-owned row a converting account writes, and an assessment persisted with a null case_id is invisible to the case-scoped dashboard the student lands on.",
    auditEvent: null,
  },
  {
    path: "app/api/documents/[id]/route.ts",
    status: "legacy-owner-scoped",
    justification:
      "Storage administration (plan line 342): deletes a private Storage object and its row. The authenticated client cannot remove Storage objects under the current bucket policy.",
    requiredCaseCheck:
      "MV-157: resolvePersonalCaseId + checkCasePermission(actor, caseId, 'case.update') on the AUTHENTICATED client, THEN a `.eq(\"case_id\", caseId)` re-read that 404s, before Storage is touched. Deferred flip: removing the Storage object needs service-role under the current bucket policy; the row delete alone could move (documents grants authenticated DELETE), but splitting the two across clients buys nothing.",
    auditEvent: null,
  },
  {
    path: "app/api/documents/[id]/view/route.ts",
    status: "legacy-owner-scoped",
    justification:
      "Storage administration (plan line 342): mints a short-lived signed URL for a private object.",
    requiredCaseCheck:
      "MV-157: checkCasePermission(actor, caseId, 'case.read') BEFORE the signed URL is minted, then a `.eq(\"case_id\", caseId)` read of the path. Stage 4 owns the remaining half — per-document metadata authorization and the at-mint audit event (plan §\"Storage authorization\"). Object paths stay owner-keyed through Stages 2-3 by decision (spec §8).",
    auditEvent: null,
  },
  {
    path: "app/api/documents/upload/route.ts",
    status: "legacy-owner-scoped",
    justification:
      "Storage administration (plan line 342): uploads to the private bucket and cleans up the replaced object on the unique (case_id, kind) index. Deferred flip: `documents` grants `authenticated` no INSERT and its only INSERT policy is service_role-scoped (spec §4.5), so the row write cannot move either.",
    requiredCaseCheck:
      "MV-157: resolvePersonalCaseId + checkCasePermission(actor, caseId, 'case.update') on the AUTHENTICATED client before any Storage call. The document ROW is case-keyed; the Storage OBJECT PATH stays owner-keyed until Stage 4 (spec §8) — a `<case_id>/…` object matches the live storage policy for nobody.",
    auditEvent: null,
  },
  {
    path: "app/api/plan/action/route.ts",
    status: "legacy-owner-scoped",
    justification:
      "Mutates the case's own plan items. Deferred flip: `plan_items` grants `authenticated` UPDATE (status, completed_at, started_at) but NO INSERT, and plan generation through invalidatePlan inserts rows on the same client (spec §4.3, §6).",
    requiredCaseCheck:
      "MV-157: resolvePersonalCaseId + checkCasePermission(actor, caseId, 'case.update') on the AUTHENTICATED client before the service-role read/write; every plan query is keyed on case_id.",
    auditEvent: null,
  },
  {
    path: "app/api/profile/section/route.ts",
    status: "legacy-owner-scoped",
    justification:
      "Writes one section of the case's profile. Deferred flip: `profiles` grants `authenticated` UPDATE (sections, completeness) but NO INSERT (spec §4.1), and this path must be able to create a first-ever profile row.",
    requiredCaseCheck:
      "MV-157: resolvePersonalCaseId + checkCasePermission(actor, caseId, 'case.update') on the AUTHENTICATED client before the service-role write. NOTE requireCasePermission is not a field allowlist (MV-153 Finding 1): the Zod payload validation is what bounds WHICH fields move, and Stage 3's consultancy mutations inherit that question unsolved.",
    auditEvent: null,
  },
  {
    path: "scripts/stage2/capture-read-path-snapshot.mjs",
    status: "sanctioned",
    justification:
      "MV-160 §A2's rehearsal-only equivalence replay. NOT AN APPLICATION PATH: it is invoked by hand by the integrator via `npm run stage2:equivalence` against a restored, offline copy of production, and is deliberately absent from the app, from CI and from `npm run test:integration`. Service-role is used for exactly two things, both of which are unreachable as any authenticated user by design: enumerating the Auth users to replay as, and capturing anonymous assessments (`owner IS NULL`), which every authenticated client is correctly unable to see. THE REPLAY ITSELF IS NOT SERVICE-ROLE and must never become so — each user's nine read paths go through an anon-key client carrying that user's own JWT, because proving the rows survived is not the same as proving the student can still read them, and only the second one is the Stage 2 exit gate (card §A, Risk notes: 'replaying as service-role would produce a green proof of the wrong statement').",
    requiredCaseCheck:
      "n/a — there is no caller and no case. The script reads only; it writes nothing to the database, and the one file it writes is the gitignored snapshot payload it then instructs the operator to destroy.",
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
