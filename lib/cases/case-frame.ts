import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { planStatesForChecklist } from "@/lib/checklist/plan-links";
import { listDocumentsForCase } from "@/lib/documents/repo";
import { listObtainedKinds } from "@/lib/documents/status-repo";
import { listShortlistForCase } from "@/lib/matches/repo";
import { listAllPlanForCase } from "@/lib/plan/repo";
import { selectNextStep, type NextStepSelection } from "@/lib/plan/select";
import type { PlanItemRow } from "@/lib/plan/types";
import { getProfileForCase } from "@/lib/profiles/repo";
import type { ProfileSections } from "@/lib/profiles/sections";
import { getProgram } from "@/lib/programs/repo";
import type { Program } from "@/lib/programs/types";
import { sectionsToStudentProfile } from "@/lib/scoring/from-sections";
import type { Database } from "@/lib/supabase/types";
import { deriveVisaRisk, type VisaRiskRead } from "@/lib/judgement/visa-risk";
import {
  deriveSubmittability,
  preferredShortlistTier,
  type SubmittabilityRead,
} from "@/lib/judgement/submittability";
import { listCaseDocumentRequests } from "./document-requests-repo";
import { deriveLodgement, type LodgementRead } from "./lodgement";
import { MEMBERSHIP_ROLES, ACTIVE_MEMBERSHIP_STATUS } from "./permissions";
import { readPrimaryCounsellor } from "./write-repo";
import type { CaseAuthorizationClient } from "./context";

/**
 * The persistent case frame's own read (MV-181, spec §1 "Persistent case
 * context", item 6).
 *
 * The gate (`./case-route.ts`) answers "may this actor be here, and whose case is
 * it". The frame's header needs one thing more: **who is on the case**, in the
 * `Role · 8-character id` shape `StaffReference` renders. That is a different
 * question with a different audience, so it lives here rather than widening the
 * gate for every page that does not need it.
 *
 * ## Four answers, and none of them may wear another's clothes
 *
 * MV-171's manage page established three of these and the reasoning carries
 * verbatim:
 *
 * - **withheld** — the viewer is not staff on this case, so THE READ IS NOT MADE.
 *   `case_assignments_select_accessor` admits `actor_assigned_case_ids() or
 *   can_staff_case(case_id)`, and an RLS refusal is ZERO ROWS AND NO ERROR — so a
 *   read issued on behalf of the linked student comes back exactly like an
 *   unassigned case. The two are indistinguishable afterwards, so the answer is
 *   not to ask. (The migration says the same rule out loud: who staffs a case is
 *   "consultancy-internal operating data".)
 * - **unknown** — a read that FAILED. Never "unassigned": that sentence would
 *   tell an admin to assign somebody who already holds the slot.
 * - **unassigned** — the slot is genuinely empty.
 * - **assigned** — with `role` and `active`, because "Access switched off ·
 *   Counsellor · 7f3c9a1e" is a different fact from "Counsellor · 7f3c9a1e" and
 *   the reader acts differently on each.
 *
 * ## Why the membership read is its own failure
 *
 * The assignment row alone would render a confident, active-looking reference for
 * a member who may have been switched off. A half-answer here is worse than no
 * answer, so a failed membership read collapses the whole thing to `unknown`
 * rather than to a partially-true reference.
 */

export type CaseAssignee =
  | { state: "withheld" }
  | { state: "unknown" }
  | { state: "unassigned" }
  | { state: "assigned"; userId: string; role: string; active: boolean };

/**
 * Is this viewer STAFF on the case, or the student it belongs to?
 *
 * `grantedRoles` is the authorization fact `getCaseContext` publishes, and it
 * mirrors `can_staff_case`. The manage page asks the same question the same way.
 */
export function isStaffOnCase(grantedRoles: readonly string[] | undefined): boolean {
  return (grantedRoles ?? []).some((role) =>
    (MEMBERSHIP_ROLES as readonly string[]).includes(role),
  );
}

export async function readCaseAssignee(
  caseId: string,
  organizationId: string,
  viewer: { isStaffOnCase: boolean },
  db: CaseAuthorizationClient,
): Promise<CaseAssignee> {
  if (!viewer.isStaffOnCase) return { state: "withheld" };

  const primary = await readPrimaryCounsellor(caseId, db);
  if (!primary.ok) return { state: "unknown" };
  if (primary.data === null) return { state: "unassigned" };

  const userId = primary.data.userId;
  try {
    const { data, error } = await db
      .from("organization_memberships")
      .select("role, status")
      // Scoped to the organization as well as the user: a membership from another
      // tenant is not this case's staff, and matching on the user alone would
      // report one.
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) return { state: "unknown" };

    // No membership row at all is an unknown, switched-off reference — never
    // dropped, because the case still needs assigning. `queue-repo.ts` reads the
    // same shape the same way, so the queue and the frame agree about one person.
    return {
      state: "assigned",
      userId,
      role: data?.role ?? "unknown",
      active: data?.status === ACTIVE_MEMBERSHIP_STATUS,
    };
  } catch {
    return { state: "unknown" };
  }
}

/**
 * PostgREST's `max_rows` (supabase/config.toml). A plan read this long may be a
 * SILENT prefix — `queue-repo.ts` states the whole reasoning: `plan_items.kind`
 * is unconstrained text and staff hold a case-scoped INSERT policy, so open items
 * per case are bounded by app convention, never by the database.
 */
export const CASE_PLAN_ROW_CEILING = 1000;

/**
 * One case's open plan items, reduced to the selection the next action reads.
 *
 * `null` means the read did not complete, and the caller must not spend it as
 * "this case has no plan": the two produce different next actions and only one of
 * them is true (`dependsOnPlan` in `./queue.ts` decides which actions care).
 */
export async function readCaseNextStep(
  caseId: string,
  db: CaseAuthorizationClient,
): Promise<NextStepSelection | null> {
  try {
    const { data, error } = await db
      .from("plan_items")
      .select("id, kind, impact, title, status, started_at")
      .eq("case_id", caseId)
      .eq("status", "todo");

    if (error) return null;
    const rows = data ?? [];
    // At the ceiling the answer MAY be a prefix, and PostgREST does not say so.
    if (rows.length >= CASE_PLAN_ROW_CEILING) return null;

    // Only the columns `selectNextStep`'s ordering reads travel; the overview
    // shows one title, not a plan.
    return selectNextStep(
      rows.map(
        (row): PlanItemRow => ({
          id: row.id,
          owner: null,
          kind: row.kind,
          impact: row.impact as PlanItemRow["impact"],
          title: row.title,
          body: null,
          liftEstimate: null,
          timeEstimate: null,
          status: row.status as PlanItemRow["status"],
          createdAt: "",
          completedAt: null,
          startedAt: row.started_at,
        }),
      ),
    );
  } catch {
    return null;
  }
}

/**
 * One case's lodgement read (MV-183, spec §3 "Submittability read").
 *
 * Reuses `listCaseDocumentRequests` — the single access path to
 * `case_document_requests` — rather than issuing its own query, so the panel and
 * the Documents chase list can never disagree about one case's requests. The WHOLE
 * list travels, which is what lets `deriveLodgement` tell a fully-chased case
 * (`clear`) from one nothing has been asked of (`nothing-requested`); the queue's
 * batched read cannot, and says the weaker thing instead.
 *
 * A failed read returns `unavailable` rather than `null`: the panel must SAY it
 * could not check. Nothing here may resolve to an empty list, because "nothing is
 * outstanding" and "we could not find out" render as different sentences and only
 * one of them is true (spec §5).
 */
export async function readCaseLodgement(
  caseId: string,
  db: CaseAuthorizationClient,
): Promise<LodgementRead> {
  const requests = await listCaseDocumentRequests(caseId, db);
  if (!requests.ok) return { state: "unavailable" };
  return deriveLodgement(requests.data);
}

/**
 * One case's visa-risk read (MV-198, spec §3 "Visa-risk read").
 *
 * The judgement itself is pure and lives in `lib/judgement/visa-risk.ts`. This
 * function owns the three things that judgement cannot see: who may ask, what a
 * failed query means, and the difference between a case with nothing recorded and a
 * case that scores badly.
 *
 * ## Staff-only, enforced here rather than at the route
 *
 * `null` — render no region at all — for a viewer who is not staff on the case. Not
 * a `withheld` state like `readCaseAssignee`'s: a withheld ASSIGNEE tells the student
 * only that staffing is internal, while a withheld VISA READ would tell them a
 * judgement about their own chances exists and is being kept from them. That is a
 * worse sentence than silence, so the region simply does not appear.
 *
 * The gate lives at the read, not on the workspace route, because the route is
 * staff-only only by accident of URL. Spec §3's decision to keep this staff-facing
 * is a product call (the judgement spec's open decision 3), and putting it here means
 * a later student-facing caller has to overturn it deliberately rather than inherit
 * it by forgetting.
 *
 * ## Three absences that must not collapse into one
 *
 * - **`no-linked-student`** — spec §3's unlinked rule. Taken BEFORE the query,
 *   because there is nothing worth reading: a consultancy-entered profile with no
 *   student behind it is exactly the data the spec says not to judge.
 * - **`unavailable`** — the read FAILED. `getProfileForCase` throws rather than
 *   returning empty precisely so this stays distinguishable (MV-133 on the case
 *   axis), and both the PostgREST-error and the thrown-connection paths land here.
 * - **`insufficient-data`** — the read succeeded and found nothing recorded.
 *
 * That last one is the trap. `sectionsToStudentProfile({})` does not fail; it returns
 * a fully-shaped profile of DEFAULTS — grade 0, budget 0, no English test — which the
 * engine scores as a poor case. Passing it through would tell a counsellor that a
 * case nobody has filled in yet is a refusal risk. The emptiness is caught here,
 * before the engine ever sees it.
 */
export async function readCaseVisaRisk(
  caseId: string,
  viewer: { isStaffOnCase: boolean; hasLinkedStudent: boolean },
  db: CaseAuthorizationClient,
): Promise<VisaRiskRead | null> {
  if (!viewer.isStaffOnCase) return null;
  if (!viewer.hasLinkedStudent) return { state: "no-linked-student" };

  let sections: ProfileSections | null;
  try {
    const profileRow = await getProfileForCase(db, caseId);
    sections = (profileRow?.sections as ProfileSections | null | undefined) ?? null;
  } catch {
    return { state: "unavailable" };
  }

  if (sections === null || Object.keys(sections).length === 0) {
    return { state: "insufficient-data" };
  }

  return deriveVisaRisk({
    hasLinkedStudent: true,
    profile: sectionsToStudentProfile(sections),
  });
}

/**
 * One case's submittability read (MV-199, spec §3's second answer).
 *
 * The judgement is pure and lives in `lib/judgement/submittability.ts`. This function
 * owns the four things it cannot see: who may ask, which program the case is pursuing,
 * what a failed query means, and the fact that the answer depends on `plan_items` as
 * well as on documents.
 *
 * ## Staff-only, and — unlike the visa read — LINK-INDEPENDENT
 *
 * `null` for a non-staff viewer, for `readCaseVisaRisk`'s reason: a withheld judgement
 * panel tells a student that a verdict about them exists and is being kept from them.
 *
 * But this read does **not** abstain on an unlinked case. MV-198 does, because it scores
 * a STUDENT's profile and a consultancy-entered profile with nobody behind it is exactly
 * the data the spec says not to judge. Submittability judges DOCUMENTS, which a
 * consultancy-entered case has from the moment a counsellor uploads one — withholding it
 * would blank the answer for every case in a consultancy that has not started inviting
 * students yet, which is all of them on day one.
 *
 * ## Six sources, one failure
 *
 * Every repository below throws on a PostgREST error rather than returning empty (MV-133,
 * on the case axis), which is what makes one `catch` correct here instead of lossy. An
 * empty `documents` list wearing a failed read would report a fully-evidenced case as
 * having uploaded nothing, and a counsellor would chase what the student already sent.
 *
 * The shortlist is read FIRST and alone: a case with nothing shortlisted has no program,
 * and therefore no required set, so the other five round trips would buy nothing.
 *
 * ## Why this one takes the whole client
 *
 * `CaseAuthorizationClient` is `Pick<…, "from">`, and the sibling reads above satisfy it.
 * This one calls five repositories that each take the full client; narrowing all five to
 * gain a `Pick` here would touch five modules to buy nothing, so it asks for what it
 * needs. The route hands it `gate.supabase`, which is the full client either way.
 */
export async function readCaseSubmittability(
  caseId: string,
  viewer: { isStaffOnCase: boolean },
  db: SupabaseClient<Database>,
): Promise<SubmittabilityRead | null> {
  if (!viewer.isStaffOnCase) return null;

  try {
    const candidateIds = preferredShortlistTier(await listShortlistForCase(db, caseId));
    if (candidateIds.length === 0) return { state: "no-program" };

    const [programs, profileRow, documents, obtainedKinds, planRows] = await Promise.all([
      Promise.all(candidateIds.map((id) => getProgram(db, id))),
      getProfileForCase(db, caseId),
      listDocumentsForCase(db, caseId),
      listObtainedKinds(db, caseId),
      listAllPlanForCase(db, caseId),
    ]);

    return deriveSubmittability({
      // A shortlisted program that has left the catalogue is not a program this read can
      // state anything about; if that empties the list, `deriveSubmittability` says so.
      programs: programs.filter((p): p is Program => p !== null),
      // `{}` rather than a refusal: an unfilled profile yields the generic financial
      // branch, which is a thinner answer but a true one.
      sections: (profileRow?.sections as ProfileSections | null | undefined) ?? {},
      uploadedKinds: new Set(documents.map((d) => d.kind)),
      obtainedKinds,
      // The plan is the completion authority for `CHECKLIST_PLAN_LINKS` rows — the same
      // mapping the student's checklist uses, so the two surfaces cannot disagree about
      // whether one of those steps is done.
      planStates: planStatesForChecklist(planRows),
    });
  } catch {
    return { state: "unavailable" };
  }
}
