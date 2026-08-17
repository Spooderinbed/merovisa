import { openCaseRoute } from "@/lib/cases/case-route";
import { CaseRouteOutage } from "@/components/workspace/case-route-outage";
import { ProfilePanel } from "@/components/case-experience/profile-panel";

/**
 * The student's profile, edited by their counsellor — access-matrix cell 14.
 *
 * Reads and writes both go out as the **authenticated** user:
 * `profiles_select_case` decides the read, `profiles_update_case` plus the column
 * grant `(sections, completeness)` decide the write, and MV-168's
 * `profiles_insert_case` is what lets the first-ever row exist on a case whose
 * student has no account.
 *
 * The field allowlist is enforced by Postgres — the column grant — not by
 * TypeScript. That TS gap is real and is **MV-173's**, not this page's
 * (`lib/cases/README.md:152-157`).
 */
export default async function CaseProfilePage({
  params,
}: {
  params: Promise<{ organizationId: string; caseId: string }>;
}) {
  const { organizationId, caseId } = await params;
  const gate = await openCaseRoute(organizationId, caseId, "/profile");
  if (!gate.ok) return <CaseRouteOutage organizationId={organizationId} outage={gate.outage} />;

  // No `subtitle`: the persistent frame (`../layout.tsx`) already names the case,
  // and repeating the profile's self-reported name underneath it invites a reader
  // to treat a disagreement between the two as an error.
  return ProfilePanel({ db: gate.supabase, caseId });
}
