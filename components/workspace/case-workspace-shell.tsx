import type { ReactNode } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { CaseScopeProvider } from "@/components/cases/case-scope";
import { caseRouteBase } from "@/lib/cases/case-route";
import { operationalStatusLabel } from "@/lib/cases/operational-status";
import type { OrgCaseDetail } from "@/lib/cases/write-repo";

/**
 * The chrome every page of the case route shares — cell 13's frame.
 *
 * Two jobs, and the second is the one that matters:
 *
 * 1. Say whose case this is, and navigate between its surfaces **within the
 *    case**. A link to `/profile` from here would open the COUNSELLOR's own
 *    profile — the navigation half of the wrong-case defect spec F-8 describes on
 *    the write side.
 * 2. Wrap the whole subtree in `CaseScopeProvider`, so the five client controls
 *    buried inside the panels name this case when they write.
 *
 * **This is not MV-173's case-context indicator.** That card owns "whose case am
 * I in, and is it mine" as a persistent, unmissable thing done once, everywhere.
 * What is here is this page's own heading — the same information the student list
 * and the manage page already show, in the same words.
 */

const SURFACES = [
  { segment: "profile", label: "Profile" },
  { segment: "matches", label: "Matches" },
  { segment: "plan", label: "Plan" },
  { segment: "checklist", label: "Checklist" },
] as const;

export type CaseSurface = (typeof SURFACES)[number]["segment"];

export function CaseWorkspaceShell({
  organizationId,
  caseId,
  caseRow,
  active,
  children,
}: {
  organizationId: string;
  caseId: string;
  caseRow: OrgCaseDetail;
  active: CaseSurface | null;
  children: ReactNode;
}) {
  const base = caseRouteBase(organizationId, caseId);
  return (
    <div className="flex w-full flex-col">
      <header className="mx-auto flex w-full max-w-[1120px] flex-col gap-3 px-5 pt-10">
        <Link
          href={`/workspace/${organizationId}/students`}
          className="text-meta text-primary underline underline-offset-4"
        >
          ← Students
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[clamp(28px,3.4vw,40px)]">{caseRow.displayName}</h1>
          {caseRow.archivedAt !== null ? (
            <span className="inline-flex items-center rounded-pill border border-line bg-bg-tint px-2 py-0.5 text-caption text-ink-soft">
              Archived
            </span>
          ) : null}
        </div>
        <p className="text-meta text-ink-soft">
          {caseRow.email ?? "No email address on file"} ·{" "}
          {operationalStatusLabel(caseRow.operationalStatus)}
          {/* The same sentence the manage page uses. A consultancy case with no
              student is the normal Stage 3 shape, not a defect, and the surface
              that shows their data is the one that most owes them the fact. */}
          {caseRow.hasLinkedStudent ? " · Self-reported" : " · No student account"}
        </p>
        <nav aria-label="This student's record" className="flex flex-wrap gap-2 pt-1">
          {SURFACES.map((surface) => (
            <Link
              key={surface.segment}
              href={`${base}/${surface.segment}`}
              aria-current={active === surface.segment ? "page" : undefined}
              className={
                active === surface.segment
                  ? "rounded-pill border border-primary bg-primary-tint px-3 py-1 text-meta text-primary"
                  : "rounded-pill border border-line px-3 py-1 text-meta text-ink-soft hover:border-ink-faint"
              }
            >
              {surface.label}
            </Link>
          ))}
        </nav>
      </header>
      {/* Everything below writes to THIS case. */}
      <CaseScopeProvider caseId={caseId}>{children}</CaseScopeProvider>
    </div>
  );
}

/**
 * The outage state, deliberately not `notFound()`: there is something to retry,
 * and telling a counsellor their student does not exist because a read blipped is
 * the quiet dishonesty this product exists to avoid.
 */
export function CaseRouteOutage({
  organizationId,
  outage,
}: {
  organizationId: string;
  outage: "access" | "case";
}) {
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-8 px-5 py-10">
      <Link
        href={`/workspace/${organizationId}/students`}
        className="text-meta text-primary underline underline-offset-4"
      >
        ← Students
      </Link>
      <Card as="section" padding="lg" className="flex flex-col gap-2">
        <h1 className="text-title font-medium">
          {outage === "access"
            ? "We couldn't check your access"
            : "We couldn't load this student"}
        </h1>
        <p className="max-w-[64ch] text-body text-ink-soft">
          Something went wrong on our side. This is not a statement about this student or your
          access — please try again in a moment.
        </p>
      </Card>
    </div>
  );
}
