import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkOrgPermission } from "@/lib/cases/require-org-permission";
import { LIST_ROW_CAP } from "@/lib/cases/list-repo";
import { listCaseQueue } from "@/lib/cases/queue-repo";
import { applyQueueFacets, sortQueue } from "@/lib/cases/queue";
import {
  OPERATIONAL_STATUSES,
  OPERATIONAL_STATUS_LABELS,
  isOperationalStatus,
} from "@/lib/cases/operational-status";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { CaseQueueTable } from "@/components/workspace/case-queue-table";

/**
 * Access-matrix cell 7 — the org-scoped case directory, since MV-179 titled
 * "All cases": the Day view (`/workspace/[organizationId]`) is the daily landing
 * and this page is the searchable directory behind it (spec §6). The large
 * `StudentRow` cards are retired for the same dense queue table; the name-sorted
 * order, the search and status filters, the honest empty states and the cap
 * warning all survive.
 *
 * THE SCOPE IS LOAD-BEARING, not a formality. `case.list` allows an owner or
 * admin with scope `all-org` and a counsellor with scope `assigned`
 * (`lib/cases/permissions.ts`), and `requireOrgPermission`'s own doc-comment says
 * a caller that ignores the returned scope has not finished authorizing. So the
 * scope is narrowed here and passed down; a scope this page has no query for
 * denies rather than falling through to the widest branch.
 *
 * A DENIAL renders `notFound()` rather than a "forbidden" page (the enumeration
 * rule), and A FAILED PERMISSION LOOKUP IS NOT A DENIAL: `lookup-failed` renders
 * the outage card, never "this organization does not exist".
 *
 * NO CLIENT JAVASCRIPT DRIVES THE FILTERS — a plain GET form, so the current
 * view is a URL. The privacy cost (a searched name reaches the URL) is recorded
 * on MV-170's card, and `lib/analytics/redact-url.ts` keeps it out of PostHog.
 * Since MV-179 the search and status predicates run in memory over the queue
 * read (`applyQueueFacets`), so the words the page renders and the rows the Day
 * view counts come from one data set.
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
  if (!list.decision.allowed) {
    if (list.decision.reason === "lookup-failed") {
      return (
        <StudentsShell>
          <LookupFailedCard />
        </StudentsShell>
      );
    }
    notFound();
  }
  const scope = list.decision.requiredScope;
  if (scope !== "all-org" && scope !== "assigned") notFound();

  // MV-171, cell 8. Asked separately because it answers differently for the same
  // person: every staff role gets SOME list, and only an owner or admin may
  // create (F-1, decided 2026-08-10). Hiding the control is presentation — the
  // route re-decides, and `cases_insert_admin` decides again.
  const create = await checkOrgPermission(data.user.id, organizationId, "case.create", supabase);
  const canCreate = create.decision.allowed;
  /**
   * "You may not create" and "we could not check" rendered identically — the control
   * simply vanished — so an owner whose permission lookup blipped concluded their
   * role had changed. Same rule as the manage page and as the failed list below: a
   * failed check is an outage, not an absence.
   */
  const createCheckFailed = !canCreate && create.decision.reason === "lookup-failed";

  const query = (first(sp.q) ?? "").trim();
  // An unknown status can only come from a hand-edited query string. It is
  // dropped rather than applied, and the form below then shows "Any status" —
  // which is what the page is actually showing.
  const rawStatus = first(sp.status);
  const status = isOperationalStatus(rawStatus) ? rawStatus : undefined;
  const isFiltered = query !== "" || status !== undefined;

  const queue = await listCaseQueue(data.user.id, organizationId, scope, supabase);
  // Unreachable while the narrowing above holds, and handled anyway: a refusal is
  // an authorization outcome and must not render as an outage.
  if (!queue.ok && queue.reason === "denied") notFound();

  const rows = queue.ok
    ? sortQueue(applyQueueFacets(queue.rows, { query, status }), "name")
    : [];

  return (
    <StudentsShell
      lede={
        scope === "assigned"
          ? "The students assigned to you. Others in this organization are not shown."
          : "Every student this organization is working with."
      }
    >
      {canCreate ? (
        <div>
          <Link
            href={`/workspace/${organizationId}/students/new`}
            className="inline-flex items-center rounded-pill border border-line px-4 py-2 text-control text-ink hover:border-primary"
          >
            Add a student
          </Link>
        </div>
      ) : createCheckFailed ? (
        <p className="max-w-[64ch] text-meta text-ink-soft">
          We couldn&apos;t check whether you can add a student, so that option is missing from this
          page. Something went wrong on our side — this is not a statement about your permissions.
        </p>
      ) : null}

      {/*
        The `key` is what makes "Clear" clear the CONTROLS as well as the URL.
        Apply is a native submit, so it reloads the document and the controls come
        back correct; Clear is a soft navigation, where React reconciles the
        existing <select>/<input> nodes and writing `defaultValue` to a mounted
        element changes nothing it displays.
      */}
      <form key={`${query}|${status ?? ""}`} method="get" className="flex flex-wrap items-end gap-3">
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

      {queue.ok && queue.truncated ? (
        // A capped list that says nothing is a list that lies by omission: the
        // search runs over what was loaded, so a student past the cap is missing
        // AND unfindable, and "no students match" would be a false claim about
        // the organization. Paging is Stage 7's; saying so is this slice's.
        <Card as="section" padding="lg" className="flex flex-col gap-2">
          <h2 className="text-title font-medium">Showing the first {LIST_ROW_CAP} students</h2>
          <p className="max-w-[64ch] text-body text-ink-soft">
            There are more students here than one page can load. These are the first {LIST_ROW_CAP}{" "}
            by name, and the search box only looks through them — someone further down the list will
            not be found from here. Paging through the whole list comes later.
          </p>
        </Card>
      ) : null}

      {!queue.ok ? (
        // "The lookup failed" and "there are no students" must never render the
        // same: the second is a claim about the organization.
        <LookupFailedCard />
      ) : rows.length === 0 ? (
        // Branching on `scopeIsEmpty`, NOT on the query string. Whether a filter
        // is set says nothing about whether there was a list to filter, and
        // telling an unassigned counsellor to "clear the filters to see the full
        // list" points them at a list that does not exist.
        <Card as="section" padding="lg" className="flex flex-col gap-2">
          <h2 className="text-title font-medium">
            {queue.scopeIsEmpty ? "No students yet" : "No students match those filters"}
          </h2>
          <p className="max-w-[64ch] text-body text-ink-soft">
            {!queue.scopeIsEmpty
              ? "Nothing here matches what you searched for. Clear the filters to see the full list."
              : scope === "assigned"
                ? "You are not assigned to any students in this organization yet."
                : "This organization has no student records yet."}
          </p>
        </Card>
      ) : (
        <section className="flex flex-col gap-3">
          <p className="max-w-[72ch] text-meta text-ink-soft">
            <span className="font-medium text-ink">Student linked</span> means the student has an
            account and can edit their own name and email address. Read those as the student&apos;s
            words, not as a verified identity.
          </p>
          <CaseQueueTable
            rows={rows}
            organizationId={organizationId}
            canAssign={scope === "all-org"}
            showAssignee={scope === "all-org"}
          />
        </section>
      )}
    </StudentsShell>
  );
}

/** The page's frame, so an outage renders as this page rather than as a bare card. */
function StudentsShell({ lede, children }: { lede?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-8 px-5 py-10">
      {/* The back-link to the Day view is the rail's now (MV-180). */}
      <header className="flex flex-col gap-2">
        <h1 className="text-[clamp(28px,3.4vw,40px)]">All cases</h1>
        {lede ? <p className="max-w-[64ch] text-control text-ink-soft">{lede}</p> : null}
      </header>
      {children}
    </div>
  );
}

/**
 * One wording for "a read did not complete", used by both the failed permission
 * lookup and the failed list. Two wordings would let one of them drift into
 * sounding like a statement about the actor's access, which is what it is not.
 */
function LookupFailedCard() {
  return (
    <Card as="section" padding="lg" className="flex flex-col gap-2">
      <h2 className="text-title font-medium">We couldn&apos;t load your students</h2>
      <p className="max-w-[64ch] text-body text-ink-soft">
        Something went wrong on our side. This is not a statement about this organization or your
        access — please try again in a moment.
      </p>
    </Card>
  );
}
