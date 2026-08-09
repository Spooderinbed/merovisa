import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkOrgPermission } from "@/lib/cases/require-org-permission";
import { listOrgCases, type OrgCaseSummary } from "@/lib/cases/list-repo";
import {
  OPERATIONAL_STATUSES,
  OPERATIONAL_STATUS_LABELS,
  isOperationalStatus,
  operationalStatusLabel,
} from "@/lib/cases/operational-status";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";

/**
 * Access-matrix cell 7 — the org-scoped student list, with search and a status
 * filter. Read-only: nothing on this page writes, and case creation and
 * assignment are MV-171's.
 *
 * THE SCOPE IS LOAD-BEARING, not a formality. `case.list` allows an owner or
 * admin with scope `all-org` and a counsellor with scope `assigned`
 * (`lib/cases/permissions.ts`), and `requireOrgPermission`'s own doc-comment says
 * a caller that ignores the returned scope has not finished authorizing. So the
 * scope is narrowed here and passed down; a scope this page has no query for
 * denies rather than falling through to the widest branch.
 *
 * A denial renders `notFound()` rather than a "forbidden" page, for the reason
 * the team page states: confirming an organization exists but is not yours is an
 * enumeration oracle, and `getOrgContext` already refuses to distinguish "unknown
 * organization" from "not a member".
 *
 * NO CLIENT JAVASCRIPT DRIVES THE FILTERS. Search and status are a plain GET
 * form, so the current view is a URL — shareable, back-button-correct, and
 * readable by the server component that renders it.
 */

/**
 * A repeated search parameter (`?q=a&q=b`) reaches a page as `string[]`. Taking
 * the first value keeps a hand-crafted URL a list rather than a server error.
 */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function StudentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<{ q?: string | string[]; status?: string | string[] }>;
}) {
  const { organizationId } = await params;
  const sp = await searchParams;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect(`/auth?next=/workspace/${organizationId}/students`);

  const list = await checkOrgPermission(data.user.id, organizationId, "case.list", supabase);
  if (!list.decision.allowed) notFound();
  const scope = list.decision.requiredScope;
  if (scope !== "all-org" && scope !== "assigned") notFound();

  const query = (first(sp.q) ?? "").trim();
  // An unknown status can only come from a hand-edited query string. It is
  // dropped rather than queried, and the form below then shows "Any status" —
  // which is what the page is actually showing.
  const rawStatus = first(sp.status);
  const status = isOperationalStatus(rawStatus) ? rawStatus : undefined;
  const isFiltered = query !== "" || status !== undefined;

  const cases = await listOrgCases(
    data.user.id,
    organizationId,
    scope,
    { query, status },
    supabase,
  );
  // Unreachable while the narrowing above holds, and handled anyway: a refusal is
  // an authorization outcome and must not render as an outage.
  if (!cases.ok && cases.reason === "denied") notFound();

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-8 px-5 py-10">
      <header className="flex flex-col gap-2">
        <Link href="/workspace" className="text-meta text-primary underline underline-offset-4">
          ← All organizations
        </Link>
        <h1 className="text-[clamp(28px,3.4vw,40px)]">Students</h1>
        <p className="max-w-[64ch] text-control text-ink-soft">
          {scope === "assigned"
            ? "The students assigned to you. Others in this organization are not shown."
            : "Every student this organization is working with."}
        </p>
      </header>

      <Card as="section" padding="lg" className="flex flex-col gap-2">
        <h2 className="text-title font-medium">Adding a student comes later</h2>
        <p className="max-w-[64ch] text-body text-ink-soft">
          Creating a case and assigning a counsellor are not built yet. This page finds the students
          who are already here.
        </p>
      </Card>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-[220px] flex-1 flex-col gap-1">
          <label htmlFor="q" className="text-meta text-ink-soft">
            Search
          </label>
          <Input id="q" name="q" defaultValue={query} placeholder="Name or email address" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="status" className="text-meta text-ink-soft">
            Status
          </label>
          <Select id="status" name="status" defaultValue={status ?? ""}>
            <option value="">Any status</option>
            {OPERATIONAL_STATUSES.map((value) => (
              <option key={value} value={value}>
                {OPERATIONAL_STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" size="sm">
          Apply
        </Button>
        {isFiltered ? (
          <Link
            href={`/workspace/${organizationId}/students`}
            className="text-meta text-primary underline underline-offset-4"
          >
            Clear
          </Link>
        ) : null}
      </form>

      {!cases.ok ? (
        // "The lookup failed" and "there are no students" must never render the
        // same: the second is a claim about the organization.
        <Card as="section" padding="lg" className="flex flex-col gap-2">
          <h2 className="text-title font-medium">We couldn&apos;t load your students</h2>
          <p className="max-w-[64ch] text-body text-ink-soft">
            Something went wrong on our side. This is not a statement about this organization or
            your access — please try again in a moment.
          </p>
        </Card>
      ) : cases.data.length === 0 ? (
        <Card as="section" padding="lg" className="flex flex-col gap-2">
          <h2 className="text-title font-medium">
            {isFiltered ? "No students match those filters" : "No students yet"}
          </h2>
          <p className="max-w-[64ch] text-body text-ink-soft">
            {isFiltered
              ? "Nothing here matches what you searched for. Clear the filters to see the full list."
              : scope === "assigned"
                ? "You are not assigned to any students in this organization yet."
                : "This organization has no student records yet."}
          </p>
        </Card>
      ) : (
        <section className="flex flex-col gap-3">
          <p className="max-w-[72ch] text-meta text-ink-soft">
            <span className="font-medium text-ink">Self-reported</span> means the student has an
            account and can edit their own name and email address. Read those as the student&apos;s
            words, not as a verified identity.
          </p>
          <ul className="flex flex-col gap-3">
            {cases.data.map((row) => (
              <li key={row.id}>
                <StudentRow row={row} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * One case. Not a link: the case route is MV-172, and a link to a 404 would be a
 * worse lie than no link.
 */
function StudentRow({ row }: { row: OrgCaseSummary }) {
  return (
    <Card as="article" padding="lg" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-title font-medium">{row.displayName}</h3>
        <Marker>{row.hasLinkedStudent ? "Self-reported" : "No student account"}</Marker>
        {row.archivedAt !== null ? <Marker>Archived</Marker> : null}
      </div>
      <p className="text-meta text-ink-soft">
        {row.email ?? "No email address on file"} · {operationalStatusLabel(row.operationalStatus)}
      </p>
    </Card>
  );
}

function Marker({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-pill border border-line bg-bg-tint px-2 py-0.5 text-caption text-ink-soft">
      {children}
    </span>
  );
}
