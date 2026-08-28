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
 * AUDIT WIRING, LIVE SINCE MV-189 FOR THE FIVE DOCUMENT-ACCESS PATHS. `auditEvent`
 * names the `audit_events.action` a path emits when it touches case-scoped data.
 *
 * This header used to read "AUDIT WIRING IS NOT YET POSSIBLE … there is no callable
 * write path until MV-152's grant review", and both halves were wrong by the time
 * MV-189 measured them. MV-152 shipped and granted no EXECUTE, so waiting on it was
 * waiting on something that had already happened and declined. And the premise
 * underneath — that a grant was the blocker — is false: `private` is not an exposed
 * PostgREST schema, so with EXECUTE granted to BOTH `service_role` and
 * `authenticated`, `/rest/v1/rpc/write_audit_event` still answers `404 PGRST202`
 * (it searches `public`), and forcing `Content-Profile: private` answers `406
 * PGRST106` — "Only the following schemas are exposed: public, graphql_public".
 *
 * So the write is a direct INSERT on the service-role client, which already holds
 * INSERT on `public.audit_events` — the mechanism MV-152 itself wrote down
 * (`20260730180000_case_aware_rls_policies.sql:750-753`, "Audit rows are written by
 * server paths running as service_role"). It flows through one choke point,
 * `lib/audit/write-audit-event.ts`, and it is FAIL-CLOSED: no route returns a 2xx
 * without its audit row committed (plan line 504 — an authorized sensitive read and
 * its audit row "cannot be separated"). Spec §8, decisions D11-D15:
 * `docs/superpowers/specs/2026-08-20-case-document-collaboration.md`.
 *
 * A `null` below still means "this path touches no case-scoped data", and still
 * never means "auditing was skipped". THIRTEEN entries remain `null`: they are not
 * document access, and wiring them is Stage 6's "finish append-only security audit
 * coverage" (plan line 668).
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
 * AUDIT WIRING, RE-CHECKED AT MV-189 rather than left stale — and this time the
 * re-check changed the answer. Five entries below now carry an `auditEvent`: the two
 * signed-URL mints and the three paths that upload or delete document bytes. MV-193
 * added two more (the invitation mint and revoke) and MV-194 an eighth (acceptance),
 * so it is EIGHT wired now. The remaining thirteen stay `null` and still mean "no
 * case-scoped access happens here", never "auditing was skipped".
 *
 * The two account-linking entries are still the ones that will want
 * `case.student_linked` — MV-187, Stage 5. MV-194 does NOT pay that: those two bind an
 * anonymous assessment to the account that created it and create that account's own
 * personal case, which is a different event from a consultancy's case acquiring a
 * student. The acceptance route emits `invitation.accepted` instead, which is the noun
 * `SANCTIONED_SERVICE_ROLE_CATEGORIES` reserved for it.
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
      "n/a — no CALLER-supplied case: it mints its own Auth user and seeds that user's own fixtures, so there is no id to authorize. It does touch case data, and MV-171's review corrected this entry to say so: ensurePersonalCase creates the personal case, caseBindColumns(admin, caseId) (route.ts:176) reads `cases.select(\"id, student_user_id\")` — a TENANT table — through the service-role client to derive the ownership columns, and the assessment/profile/plan fixtures are written case-keyed. It goes through the SAME choke points production does, deliberately: a harness writing `owner` by hand could produce a shape production cannot. NOT a third gate: ensureDevAllowed also tests NEXT_PUBLIC_SUPABASE_URL, but its second alternative matches any *.supabase.co host, which is EVERY hosted project including production. Treat that check as decorative; only NODE_ENV and ENABLE_DEV_SIGNIN keep this route dead, so ENABLE_DEV_SIGNIN must never be set in a deployed environment.",
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
      "FOUR distinct uses — it said three until MV-171's review added the mechanical guard in tests/supabase/service-role-exceptions.test.ts that counts them: reading the non-tenant programs/universities catalogue; inserting the caller's own assessment plus bootstrapped profile; creating their personal case; and DERIVING the ownership columns via caseBindColumns(adminDb, caseId) (route.ts:119), which reads `cases.select(\"id, student_user_id\")` — a TENANT table — through the service-role client. The fourth is not exploitable (the case was resolved for the SESSION actor and authorized immediately before) but it is an RLS-bypassing read of tenant data and belongs in the inventory. Deferred flip: `assessments` is SELECT-only and `profiles` has no INSERT grant (spec §6). The case creation is structurally service-role — cases_insert_admin refuses a personal case from the authenticated client.",
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
      "MV-190 (spec F-8): resolveTargetCase(actor, ?caseId=, 'case.update', authenticatedClient) THEN a `.eq(\"case_id\", caseId)` re-read that 404s, before Storage is touched. The case is the one the caller NAMES when it names one and the actor's own otherwise — MV-157 case-scoped this route, but resolvePersonalCaseId could only ever answer with the ACTOR's case, so a counsellor could not delete on a student's. A DELETE carries no body, so the id rides the query string; a present-but-malformed value is 400 and NEVER a fallback to the actor's own case, which is how a mishandled id would delete the counsellor's own document. Deferred flip: removing the Storage object needs service-role under the current bucket policy; the row delete alone could move (documents grants authenticated DELETE), but splitting the two across clients buys nothing.",
    auditEvent: "document.deleted",
  },
  {
    path: "app/api/documents/[id]/view/route.ts",
    status: "legacy-owner-scoped",
    justification:
      "Storage administration (plan line 342): mints a short-lived signed URL for a private object.",
    requiredCaseCheck:
      "MV-190 (spec F-8, §6): resolveTargetCase(actor, ?caseId=, 'case.read', authenticatedClient) BEFORE the `.eq(\"case_id\", caseId)` read, and then mintCaseScopedDownloadUrl — which performs checkCasePermission ITSELF before it reaches Storage. That second check is the design, not a duplicate: a signed URL bypasses Storage RLS by design and is an unauthenticated bearer of the bytes the instant it exists, so 'the caller authorized first' has to hold by CONSTRUCTION. The helper takes no already-authorized flag and no pre-made URL, so there is no ordering for a later edit to get wrong; tests assert the refusal ON THE MINT CALL (createSignedUrl never reached) rather than on a fetch 404. It also bounds the PATH to this case, which the permission check cannot do — that check is about the case and the signature is about the key. TTL is SIGNED_DOWNLOAD_TTL_SECONDS = 60, asserted as a number. MV-189 PAID THE AT-MINT AUDIT EVENT THIS ENTRY USED TO OWE (plan §\"Storage authorization\"): `document.viewed` is written BEFORE mintCaseScopedDownloadUrl is called, not after, because a signed URL is an unauthenticated bearer of the bytes the instant it exists — auditing after the mint would mean an audit failure had already handed them over (spec §8.2, D12). Object paths stay owner-keyed for the actor's own personal case; a NAMED case writes under `case/<case_id>/…` (spec §6.1).",
    auditEvent: "document.viewed",
  },
  {
    path: "app/api/documents/upload/route.ts",
    status: "legacy-owner-scoped",
    justification:
      "Storage administration (plan line 342): uploads to the private bucket and cleans up the replaced object on the unique (case_id, kind) index. Deferred flip: `documents` grants `authenticated` no INSERT and its only INSERT policy is service_role-scoped (spec §4.5), so the row write cannot move either.",
    requiredCaseCheck:
      "MV-190 (spec F-8, §6): resolveTargetCase(actor, form field `caseId`, 'case.update', authenticatedClient) before any Storage call. Multipart, so the id is read off the raw form rather than through requestedCaseId; a present-but-malformed value is 400 and never a fallback to the actor's own case. THE OBJECT PATH NOW FORKS, and the fork turns on whether a case was NAMED and nothing else: no case named means resolveTargetCase resolved the ACTOR's personal case, so an owner-keyed `<uid>/<kind>/<uuid>.<ext>` object is by construction always in the actor's own folder on the actor's own case (Stage 2's invariant, preserved exactly). A NAMED case writes `case/<case_id>/<uuid>.<ext>` instead — otherwise a counsellor uploading to a student's case would write into the COUNSELLOR's uid folder, where the live `(storage.foldername(name))[1] = auth.uid()::text` policy lets them read it directly and forever, outliving the assignment. A `case/` object matches that policy for nobody (spec §6.1); both parties reach it through mintCaseScopedDownloadUrl.",
    auditEvent: "document.uploaded",
  },
  {
    path: "app/api/cases/[caseId]/document-requests/[requestId]/versions/route.ts",
    status: "sanctioned",
    justification:
      "Storage administration (plan line 342): uploads a case-collaboration object to the private bucket, and removes it again if the row write fails. The bucket's only INSERT policy is service_role-scoped, so the BYTES cannot move to the authenticated client. THE ROW DOES NOT USE THIS CLIENT AT ALL — createCaseDocumentVersion writes case_document_versions on the AUTHENTICATED client, through case_document_versions_insert_staff and its five conjuncts, which is the whole reason MV-185 exists. Service-role touches Storage here and no table.",
    requiredCaseCheck:
      "MV-186 (spec §7.6): checkCasePermission(actor, caseId-from-the-PATH, 'case.documents.request', authenticatedClient) BEFORE any repository or Storage call, then getCaseDocumentRequest(requestId, caseId) so a request belonging to another case is a 404 rather than a 42501 read as a denial. The claim is the WRITE half deliberately — the linked student holds case.read at 'linked' and this claim not at all, which is exactly private.can_staff_case. THE ORDER IS LOAD-BEARING (spec §6.2 D5): the bytes are uploaded BEFORE the row is inserted, under a CLIENT-GENERATED version id that names both, because the reverse order strands a version row pointing at an object that does not exist — and there is no DELETE grant on case_document_versions to retract it, so the request would sit outstanding behind a file nobody can open. A failed insert removes the object it just wrote. The object key is caseVersionObjectPath(caseId, versionId), which canonicalises the case id to lowercase, and case_document_versions_storage_path_case_prefix is the database floor under it.",
    auditEvent: "document.version_uploaded",
  },
  {
    path: "app/api/cases/[caseId]/document-versions/[versionId]/download/route.ts",
    status: "sanctioned",
    justification:
      "Storage administration (plan line 342): mints a short-lived signed URL for a private case-collaboration object. A case/<case_id>/… key matches the bucket's two (storage.foldername(name))[1] = auth.uid()::text policies for NOBODY (spec §6.1), so an authenticated client cannot see the object it would be signing. Service-role touches Storage here and no table — the version row is read on the authenticated client.",
    requiredCaseCheck:
      "MV-186 (spec §7.4 D9): checkCasePermission(actor, caseId-from-the-PATH, 'case.read', authenticatedClient), then getCaseDocumentVersion(versionId, caseId) — both filters, so a version id from another case the actor happens to staff cannot be resolved under this case's authorization. THEN mintCaseScopedDownloadUrl, which performs checkCasePermission ITSELF before it reaches Storage. That second check is the design, not a duplicate: a signed URL bypasses Storage RLS by design and is an unauthenticated bearer of the bytes the instant it exists, so 'the caller authorized first' has to hold by CONSTRUCTION. The helper also bounds the PATH to this case, which no permission check can do — that check is about the case, the signature is about the key. TTL is SIGNED_DOWNLOAD_TTL_SECONDS = 60. The gate is case.read and not the write claim ON PURPOSE: it is what lets the LINKED STUDENT open the file uploaded on their own case and read the rejection note on it (spec §7.2 D7). MV-189 paid the at-mint AUDIT EVENT this entry used to owe, as it did for the two MV-190 entries above: `document.downloaded` is written BEFORE the mint (spec §8.2, D12), and its metadata deliberately omits `original_name` — a version's filename is user-supplied and routinely carries the student's own name (spec §8.3, D13).",
    auditEvent: "document.downloaded",
  },
  /**
   * MV-193 — the two invitation routes (Stage 5 slice 1).
   *
   * THESE TWO ARE A DIFFERENT SHAPE FROM THE FIVE ABOVE, and the difference is worth
   * stating because it is the shape every future audited route should copy. The five
   * document entries reach for service-role to touch STORAGE. These two touch no
   * Storage, no `invitations` row and no `cases` row with the admin client — every one
   * of those is written and read on the AUTHENTICATED client, through
   * `invitations_insert_staff` / `_update_staff`. Service-role here has exactly one
   * job: `INSERT` into `public.audit_events`.
   *
   * It is unavoidable and it is not a widening. `authenticated` holds SELECT on
   * `audit_events` and no INSERT, there is no INSERT policy for it, and MV-152 wrote
   * the mechanism down itself (`20260730180000_case_aware_rls_policies.sql:750-753`):
   * "Audit rows are written by server paths running as service_role." Granting
   * `authenticated` INSERT instead would be exactly the grant widening MV-193's
   * criterion 8 forbids — and would let any client forge an evidence row.
   */
  {
    path: "app/api/cases/[caseId]/invitations/route.ts",
    status: "sanctioned",
    justification:
      "Audit only. The invitation row is inserted on the AUTHENTICATED client through invitations_insert_staff; service-role touches public.audit_events and nothing else, because `authenticated` holds SELECT on that table and no INSERT and there is no INSERT policy for it (MV-152 §9). MV-193 ships no migration and widens no grant, so this is the only client that can write the evidence row.",
    requiredCaseCheck:
      "MV-193: checkCasePermission(actor, caseId-from-the-PATH, 'case.invite_student', authenticatedClient) BEFORE the repository is touched. The claim is the INVITE claim and NOT case.read — they answer differently for the same person, and the linked student holds case.read at 'linked' and this one not at all, so gating on the read claim would let a student mint invitations to their own case. The case comes from the PATH (spec F-8): a route resolving the ACTOR's own case would write to the counsellor's file rather than the student's, and RLS cannot catch it because a counsellor may legitimately reach both. THE AUDIT IS WRITTEN AFTER THE ROW COMMITS, unlike the two signed-URL mints above: recording `invitation.minted` for a mint that then failed would be a lie in an evidence log. D12 still holds — a failed audit is a 500 and the token is never returned, leaving the invitation visible as outstanding for the counsellor to revoke and re-mint. THE TOKEN LEAVES IN THE RESPONSE BODY AND NOWHERE ELSE: not in the row (only its SHA-256 digest is stored), not in any read path, not in this audit event, not in a URL and not in a log.",
    auditEvent: "invitation.minted",
  },
  {
    path: "app/api/cases/[caseId]/invitations/[invitationId]/route.ts",
    status: "sanctioned",
    justification:
      "Audit only, exactly as the mint above. The `revoked_at` stamp is written on the AUTHENTICATED client through invitations_update_staff and the client's one-column UPDATE grant; service-role touches public.audit_events and nothing else.",
    requiredCaseCheck:
      "MV-193: checkCasePermission(actor, caseId-from-the-PATH, 'case.invite_student', authenticatedClient) — the SAME claim as the mint, so the two verbs appear and disappear together, which is also how the database already answers (both policies end in private.can_staff_case for the student branch). BOTH ids are filters on the UPDATE: without the case_id predicate the invitation id alone would decide which row moves, so an id from another case the actor happens to staff would be revoked under this case's authorization (spec F-8). PATCH and never DELETE — MV-152 shipped no DELETE policy on invitations and said why: revocation is the audited path, and a deleted invitation is a deleted record of who was invited.",
    auditEvent: "invitation.revoked",
  },
  /**
   * MV-194 — the acceptance route (Stage 5 slice 2), and a THIRD shape again.
   *
   * The five document entries reach for service-role to touch STORAGE. MV-193's two touch
   * only `audit_events` and write their `invitations` row on the authenticated client. This
   * one is the first entry where service-role does the ACTUAL WORK on tenant tables, and it
   * is the category Stage 1 sanctioned by name before any of it existed:
   * `SANCTIONED_SERVICE_ROLE_CATEGORIES` → "invitation acceptance" and "account linking".
   *
   * It is structural, not a deferred grant. Two columns are outside every `authenticated`
   * grant BY DESIGN, and MV-150 says why in the migration itself: linking a case to somebody
   * else's Auth account "is invitation acceptance (an atomic compare-and-swap, Stage 5),
   * never a field a consultancy can point at a stranger."
   *
   *   * `invitations.accepted_at` — `authenticated` holds `select, insert` and
   *     `update (revoked_at)`. `accepted_at` is in no grant, which is what keeps acceptance
   *     server-side rather than something a client can claim. MV-193 verified this against
   *     the live database and refused to widen it; MV-193's `accepted_at_grant` mutant is
   *     the measurement.
   *   * `cases.student_user_id` — the column grant is
   *     `update (display_name, email, operational_status, archived_at)`. `student_user_id`
   *     is not in it, and `cases_update_accessor` answers "may this actor update this ROW"
   *     rather than "which COLUMNS", so the grant is the only layer that could refuse it.
   *
   * And RLS could not help even if the grants allowed it: the invitee is not a member, not
   * an assigned counsellor and not yet the linked student, so `cases_select_accessor` and
   * `invitations_select_staff` hide from them both rows this route must read and write.
   */
  {
    path: "app/api/invitations/accept/route.ts",
    status: "sanctioned",
    justification:
      "Invitation acceptance and account linking (plan line 342), and the first entry where service-role performs the tenant-table WRITES rather than only the audit row. THREE statements, all RLS-bypassing and all structurally required: (1) the compare-and-swap UPDATE on public.invitations setting accepted_at — a column in NO `authenticated` grant, deliberately, because that absence is what keeps acceptance server-side; (2) a diagnostic SELECT on public.invitations and, in the already-accepted branch, on public.cases, to name which of the four refusals applies — both tables are invisible to the invitee under RLS, since they are not yet a member, an assigned counsellor or the linked student; (3) the UPDATE on public.cases setting student_user_id, which is excluded BY NAME from the column grant `update (display_name, email, operational_status, archived_at)`. It also passes the cases_write_surface_guard BEFORE UPDATE trigger, whose rolbypassrls exemption names this flow: \"Stage 2's anonymous-claim path and Stage 5's invitation acceptance run as service_role.\" Widening any of those grants instead would let a client accept an invitation it merely knows the id of, or point a case at a stranger.",
    requiredCaseCheck:
      "THE COMPARE-AND-SWAP IS THE AUTHORIZATION, exactly as SANCTIONED_SERVICE_ROLE_CATEGORIES specified in Stage 1: one UPDATE whose affected row count decides the winner, gated on token_hash AND role = 'student' AND email = the SESSION account's address AND accepted_at is null AND revoked_at is null AND expires_at > now(). There is no checkCasePermission call and that is the design, not an omission: the invitee holds no relationship to the case yet, so there is no case to authorize against until this route creates one. THE CASE ID IS NEVER CALLER-SUPPLIED — it comes out of the row the swap won, and the body is `.strict()` so sending one is a 422; a route that accepted a case id would let any token holder point a token at any case (spec F-8's defect class). The link write carries `student_user_id is null` as a PREDICATE rather than checking it first, so decision D — refuse, never overwrite — cannot be lost to a race; a stale token evicting a linked student is unrecoverable because nothing records what the previous value was. ORDER: swap, then audit, then link. Auditing between the two writes is what makes a spent-token-without-a-link state evidence rather than a gap nobody can see, and D12 still holds in both directions — a failed audit is a 500 with the link never attempted, and no 2xx is returned without the audit row committed. Rate-limited per ACCOUNT (invitation-accept, 10/min) after the 401.",
    auditEvent: "invitation.accepted",
  },
  /**
   * `app/api/plan/action/route.ts` USED TO BE HERE and RETIRED in MV-172 — Stage 3
   * spec §6.2 entry 8, the one path the stage retires outright. It called three
   * helpers and every write was inside the grant `authenticated` already held
   * (`UPDATE (status, completed_at, started_at)`); the entry's stated blocker was
   * `plan_items` INSERT, which MV-168 granted and which is live in production, and
   * the `invalidatePlan` call it was credited with was only ever a comment. The
   * route now constructs no admin client, so `tests/supabase/service-role-exceptions.test.ts`
   * ("no registry entry is stale") would go RED if this entry were left behind.
   *
   * Its sibling below looks identical and is not. See §6.2's "two rows that look
   * alike", and this file's `app/api/profile/section/route.ts` entry.
   */
  {
    path: "app/api/profile/section/route.ts",
    status: "legacy-owner-scoped",
    justification:
      "MV-172 SPLIT this route; it did NOT flip, and this entry is narrowed rather than retired (Stage 3 spec §6.2 entry 9). The profile write itself has MOVED to the authenticated client — `profiles` UPDATE (sections, completeness) was already granted and MV-168's grant 1 plus its `.upsert()` → INSERT-with-resolve conversion made the first-ever row reachable. THREE legs remain on service-role and spec §6.1 refuses all three: (1) `invalidatePlan`'s COPY REFRESH updates `impact, title, body, lift_estimate, time_estimate` — generator-owned columns, refused by the §6.1 row-6 correction because a client that can rewrite its plan copy can rewrite the advice; (2) `adoptOwnerKeyedResidue` updates `case_id`, which is omitted from every UPDATE grant BY DESIGN (`…20260802120000….sql:602-604` — a client that can update `case_id` re-points a row into another case); (3) `reScoreAssessment` updates `assessments.result`, refused PERMANENTLY by §6.1 row 3 because a client that can write `result` mints its own verdict. THE FAILURE WOULD HAVE BEEN SILENT: `lib/assessments/re-score.ts` never destructures `error`, a PostgREST 42501 RESOLVES rather than rejects, and `throwOnError` appears nowhere in lib/ or app/ — so a wholesale flip would have stopped every profile edit from updating the student's verdict while returning 200 with a green suite. `legacy-owner-scoped` rather than `sanctioned` because leg 1 is a grant question a later stage could revisit; legs 2 and 3 are permanent.",
    requiredCaseCheck:
      "MV-172: resolveTargetCase(actor, body.caseId, 'case.update', authenticatedClient) BEFORE either client writes — it authorizes a caller-supplied case id and NEVER falls back to the actor's own when one is supplied, which is spec F-8's failure mode 1 (as amended by MV-172 from five routes to seven). createSupabaseAdminClient is constructed only AFTER that decision and after the granted write, so a denial costs no service-role client at all. NOTE requireCasePermission is not a field allowlist (MV-153 Finding 1): the Zod payload validation is what bounds WHICH fields move, and the TypeScript allowlist `lib/cases/README.md:152-157` calls for is MV-173's.",
    auditEvent: null,
  },
  {
    path: "app/api/cases/[caseId]/assess/route.ts",
    status: "sanctioned",
    justification:
      "MV-171, and the one entry Stage 3 ADDS rather than retires — admitted, not hidden. A consultancy creates a case for a student who has no account, and that case needs an assessment; Stage 3 spec §6.1 REFUSES `assessments` INSERT to `authenticated` PERMANENTLY, because `result` and `rule_version` are scoring outputs and a client that can write them mints its own verdict against the server-side rule — the trust property this product sells. A column-scoped grant excluding those two does not rescue the verb either: both are NOT NULL, so it would be ungrantable in a useful form. `20260808120000_stage3_consultancy_write_grants.sql:18-22` records the same refusal in SQL and asserts it at apply time. This is therefore `sanctioned` rather than `legacy-owner-scoped`: it is not waiting on a grant that a later stage will deliver, it is the shape the refusal requires, and MV-154's framing of this list as monotonically shrinking does not survive Stage 3.",
    requiredCaseCheck:
      "checkCasePermission(actor, caseId, 'case.update') on the AUTHENTICATED client, and it runs BEFORE createSupabaseAdminClient is ever called — a route that builds the service-role client first has already bypassed RLS by the time it asks whether it was allowed to, and no assertion on its response body would notice. `tests/api/case-routes.test.ts` pins the ordering by asserting createSupabaseAdminClient was never called on a denial. The case id comes from the path segment, is validated as a uuid, and is authorized against, never trusted. Service-role is used for THREE things, and this entry said 'exactly two' until MV-171's review corrected it — an audit artefact that understates its own surface is the specific failure this list exists to prevent. (1) The catalogue read: non-tenant `programs`/`universities`. (2) The OWNERSHIP DERIVATION: caseWriteColumns(adminDb, caseId) goes through readCaseOwnership (lib/cases/dual-write.ts) and reads `cases.select(\"id, student_user_id\")` — a TENANT table — on the service-role client. Not exploitable, because the caseId was authorized above and the helper returns two columns rather than the row, but it IS an RLS-bypassing read of tenant data and is named as one; it is on the admin client so that a Stage 5 case whose linked student the actor cannot see still resolves its own `owner`. (3) The `assessments` INSERT itself. The primary-assessment lookup — and its re-read after a 23505 collision on assessments_case_primary_idx — deliberately stay on the AUTHENTICATED client, because staff reach the case through actor_case_ids() and nothing about those reads needs RLS bypassed. Ownership columns are DERIVED from the case, never from the session, so a counsellor's own id cannot become the `owner` of a student's assessment; for a consultancy case it correctly yields `owner: null` (spec §6.3). Rate-limited per user (case-assess, 10/min) immediately after the 401, matching /api/guide/chat and /api/documents/upload.",
    auditEvent: null,
  },
  {
    path: "scripts/stage2/capture-read-path-snapshot.mjs",
    status: "sanctioned",
    justification:
      "MV-160 §A2's rehearsal-only equivalence replay. NOT AN APPLICATION PATH: it is invoked by hand by the integrator via `npm run stage2:equivalence` against a restored, offline copy of production, and is deliberately absent from the app, from CI and from `npm run test:integration`. Service-role is used for exactly two things, both of which are unreachable as any authenticated user by design: enumerating the Auth users to replay as, and capturing anonymous assessments (`owner IS NULL`), which every authenticated client is correctly unable to see. THE REPLAY ITSELF IS NOT SERVICE-ROLE and must never become so — each user's nine read paths go through an anon-key client carrying that user's own JWT, because proving the rows survived is not the same as proving the student can still read them, and only the second one is the Stage 2 exit gate (card §A, Risk notes: 'replaying as service-role would produce a green proof of the wrong statement').",
    requiredCaseCheck:
      "n/a — there is no caller and no case. The script reads only; it writes nothing to the database, and the one file it writes is the gitignored snapshot payload it then instructs the operator to destroy. MV-164 ADDED THE ONE CHECK THIS ENTRY CAN CARRY, because 'rehearsal-only' was until then asserted solely by prose in this file, in the script's header and in the runbook — and prose does not refuse. `scripts/stage2/capture-host-guard.mjs` runs `assertCaptureHostAllowed` BEFORE any client is constructed and before `admin.auth.admin.listUsers` enumerates anybody: the production project ref `obfvrxixtautamflzxzq` is refused outright WITH NO OVERRIDE (the `--rehearsal-host` flag is not one), `localhost`/`127.0.0.1` run freely, and any other remote host — a restored copy may legitimately sit on its own hosted project — is refused unless `--rehearsal-host` is passed. The ref is matched as a whole DNS label of the parsed host, never as a substring of the URL, so neither a path/query mention nor a longer look-alike ref is misread.",
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
