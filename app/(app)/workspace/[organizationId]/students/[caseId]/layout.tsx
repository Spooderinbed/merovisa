import type { ReactNode } from "react";
import { CaseScopeProvider } from "@/components/cases/case-scope";
import { CaseContextHeader } from "@/components/workspace/case-context-header";
import { CaseRouteOutage } from "@/components/workspace/case-route-outage";
import { CaseSectionNav, type CaseSection } from "@/components/workspace/case-section-nav";
import { isStaffOnCase, readCaseAssignee } from "@/lib/cases/case-frame";
import { caseRouteBase, openCaseRoute } from "@/lib/cases/case-route";

/**
 * The persistent case frame — spec §1, "Persistent case context".
 *
 * ## Why this is a layout and not a wrapper component
 *
 * MV-172 gave each of the seven case pages a `CaseWorkspaceShell` to render, so
 * the header was rebuilt on every navigation and the section nav could not know
 * where it was. A layout is the thing that actually persists: moving profile →
 * matches → plan re-renders only the page segment, and the case's identity stays
 * mounted and unflickering. That persistence IS the product point — a counsellor
 * working a case should never lose sight of whose case it is.
 *
 * ## This layout does not spare any page its own decision
 *
 * Every nested page still calls `openCaseRoute` for itself, and that is load
 * bearing rather than redundant: **Next.js does not re-render a layout when you
 * navigate between its children.** A counsellor reassigned away mid-session keeps
 * this frame mounted, so if the frame's gate were the only one, their next click
 * would be served from a decision made before the reassignment. The page's gate is
 * what bites at the next boundary (spec §5, last bullet).
 *
 * The cost is one extra `case.read` check and one extra case read per case page
 * load. React's `cache()` would dedupe them within a request; nothing in this repo
 * uses it yet, and buying two round trips to keep each segment's gate legible as
 * its own decision is the right side of that trade at this stage.
 *
 * ## What is deliberately NOT here
 *
 * Documents, Visa read, Activity. Their routes do not exist, and spec §1 is
 * explicit: never publish a dead "Coming soon" link. The nav grows when they ship.
 */
export default async function CaseFrameLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ organizationId: string; caseId: string }>;
}) {
  const { organizationId, caseId } = await params;

  const gate = await openCaseRoute(organizationId, caseId);
  // The children are NOT rendered beside this. Every case page states facts about
  // one student; rendering them inside a frame that could not establish WHICH
  // student would strip the context that makes those facts safe to read.
  if (!gate.ok) return <CaseRouteOutage organizationId={organizationId} outage={gate.outage} />;

  const assignee = await readCaseAssignee(
    caseId,
    organizationId,
    { isStaffOnCase: isStaffOnCase(gate.grantedRoles) },
    gate.supabase,
  );

  const base = caseRouteBase(organizationId, caseId);
  const sections: readonly CaseSection[] = [
    { segment: null, label: "Overview", href: base },
    { segment: "profile", label: "Profile", href: `${base}/profile` },
    { segment: "matches", label: "Matches", href: `${base}/matches` },
    { segment: "plan", label: "Plan", href: `${base}/plan` },
    { segment: "checklist", label: "Checklist", href: `${base}/checklist` },
    // Spec §6: `/manage` keeps its URL — and its APIs — and becomes the frame's
    // Case details section rather than a surface reached from outside the case.
    { segment: "manage", label: "Case details", href: `${base}/manage` },
  ];

  return (
    <div className="flex w-full flex-col">
      <CaseContextHeader
        organizationId={organizationId}
        caseRow={gate.caseRow}
        assignee={assignee}
      />
      {/* The frame owns the content column here so the section nav can sit BESIDE
          the content on desktop. The children keep their own `px-5` gutter, which
          is what lets the shared `case-experience` panels — rendered by the
          student shell too — stay untouched by this slice. */}
      <div className="mx-auto flex w-full max-w-[1120px] flex-col md:grid md:grid-cols-[184px_minmax(0,1fr)] md:items-start">
        <CaseSectionNav sections={sections} />
        <div className="min-w-0">
          {/* Everything below writes to THIS case (F-8). */}
          <CaseScopeProvider caseId={caseId}>{children}</CaseScopeProvider>
        </div>
      </div>
    </div>
  );
}
