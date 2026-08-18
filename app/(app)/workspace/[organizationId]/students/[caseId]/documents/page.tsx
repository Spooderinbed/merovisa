import { Card } from "@/components/ui/card";
import {
  CaseDocumentRequests,
  type DocumentKindOption,
  type DocumentRequestView,
} from "@/components/workspace/case-document-requests";
import { isStaffOnCase } from "@/lib/cases/case-frame";
import { openCaseRoute } from "@/lib/cases/case-route";
import { listCaseDocumentRequests } from "@/lib/cases/document-requests-repo";
import { DOCUMENT_META, GROUP_LABELS } from "@/lib/documents/types";

/**
 * MV-182 — the case's documents section: what has been asked for, and what is still
 * outstanding.
 *
 * ## What this section is, and what it is not
 *
 * It is the CHASE LIST. It is not the vault: no file is uploaded, downloaded or
 * previewed here, and neither `documents` nor `document_status` is read or written.
 * Those tables hold one row per kind per case and the request/version/review model
 * that replaces them is the rest of Stage 4 — so a request lives beside a document,
 * never on it.
 *
 * ## This page re-authorizes for itself
 *
 * `openCaseRoute` runs here as well as in `../layout.tsx`, and that is load bearing
 * rather than redundant: **Next.js does not re-render a layout when you navigate
 * between its children**, so a counsellor reassigned mid-session keeps the frame
 * mounted and the frame's gate would go on answering from a decision made before the
 * reassignment. The page's gate is what bites at the next boundary (spec §5).
 *
 * ## Why the write controls are gated on `isStaffOnCase` and not on a second check
 *
 * `case.documents.request` is `all-org` for owner/admin, `assigned` for a counsellor
 * and `deny` for the student — which is exactly `private.can_staff_case`, the
 * predicate `case_document_requests_insert_staff` uses at the database, and exactly
 * what `grantedRoles` reports. So the answer is already in hand; a second round trip
 * would buy a second failure mode rather than a second lock — the same reading
 * `lib/cases/case-route.ts` states for `case.assign` on the overview.
 *
 * Everything it gates is PRESENTATION. `POST`/`PATCH
 * /api/cases/[caseId]/document-requests` re-decide the real claim on every request,
 * and the two policies decide again after that.
 */
export default async function CaseDocumentsPage({
  params,
}: {
  params: Promise<{ organizationId: string; caseId: string }>;
}) {
  const { organizationId, caseId } = await params;

  const gate = await openCaseRoute(organizationId, caseId, "/documents");
  if (!gate.ok) {
    return (
      <Outage
        heading={
          gate.outage === "access" ? "We couldn't check your access" : "We couldn't load this student"
        }
      />
    );
  }

  const canRequest = isStaffOnCase(gate.grantedRoles);

  const requests = await listCaseDocumentRequests(caseId, gate.supabase);
  if (!requests.ok) {
    // A read that FAILED is not an empty chase list. "Nothing is outstanding" would
    // tell a counsellor this case is clear when we could not find out — and there is
    // nothing on a reassuring page to make them try again.
    return <Outage heading="We couldn't load this student's document requests" />;
  }

  const view: DocumentRequestView[] = requests.data.map((request) => ({
    ...request,
    // A kind with no entry renders as ITSELF. The check constraint bounds the column
    // today, but a widened vocabulary would ship rows this build has no label for,
    // and a silently blank line reads as a request for nothing.
    kindLabel: DOCUMENT_META.find((meta) => meta.kind === request.kind)?.label ?? request.kind,
  }));

  return (
    <div className="flex w-full max-w-[720px] flex-col gap-8 px-5 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-headline font-medium">Documents</h1>
        <p className="max-w-[64ch] text-body text-ink-soft">
          What this student has been asked for, and what is still outstanding. Files themselves are
          not held here yet.
        </p>
      </header>

      <CaseDocumentRequests
        caseId={caseId}
        requests={view}
        // Computed on the server: the picker's options are a vocabulary, and building
        // them here keeps the client component free of any `lib/` import that might
        // one day become `server-only`.
        kinds={KIND_OPTIONS}
        canRequest={canRequest}
      />

      <p className="max-w-[64ch] text-caption text-ink-soft">
        Uploading and reviewing the documents themselves is not built yet. A request records what
        was asked for and when it arrived.
      </p>
    </div>
  );
}

/**
 * The picker's options, in the vault's own order — the same grouping the student's
 * checklist uses, so a counsellor asking for "SLC/SEE Certificate (10th)" and a
 * student looking at their checklist are reading the same words.
 */
const KIND_OPTIONS: DocumentKindOption[] = DOCUMENT_META.map((meta) => ({
  kind: meta.kind,
  label: meta.label,
  group: GROUP_LABELS[meta.group],
}));

/**
 * The outage state. A CARD, not a page: this renders inside the persistent case
 * frame, which passed its own gate and is already naming the student and carrying
 * the way back. The same shape `../manage/page.tsx` uses, and for the same reason.
 */
function Outage({ heading }: { heading: string }) {
  return (
    <div className="flex w-full max-w-[720px] flex-col gap-8 px-5 py-10">
      <Card as="section" padding="lg" className="flex flex-col gap-2">
        <h1 className="text-title font-medium">{heading}</h1>
        <p className="max-w-[64ch] text-body text-ink-soft">
          Something went wrong on our side. This is not a statement about this student or your
          access — please try again in a moment.
        </p>
      </Card>
    </div>
  );
}
