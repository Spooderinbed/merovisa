"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  REQUEST_PROGRESS_SENTENCE,
  REQUEST_PROGRESS_TONE,
  REQUEST_PROGRESS_WORD,
  reviewsForVersion,
  versionsForRequest,
  type CaseDocumentReviewRow,
  type CaseDocumentVersionRow,
  type RequestProgress,
} from "@/lib/cases/document-collaboration";
import { saveErrorMessage } from "./save-error";

/**
 * MV-186 — one request's collaboration block: what arrived, what was decided, and the two verbs
 * that move it. Rendered inside each row of `./case-document-requests.tsx`.
 *
 * ## What is NOT here, and why its absence is the design
 *
 * **No "delete this version". No "edit this review".** MV-185 grants `authenticated` no UPDATE
 * and no DELETE on either table and asserts both absences at apply time, so both controls could
 * only ever produce a `42501`. They are absent because the MODEL says so, not because they were
 * forgotten: a rejected file is superseded by a NEW upload, and a mistaken review is corrected by
 * writing ANOTHER review — the newest one is the judgement, which is exactly what
 * `private.document_request_derived_status` reads.
 *
 * A control that appears and then fails is worse than an absent one; it tells the person they
 * were allowed.
 *
 * ## Why the review verbs sit on the NEWEST version only
 *
 * The derivation judges the newest version and nothing else. Offering accept/reject on an older
 * one would let a counsellor write a review the request's state then ignores — a control whose
 * effect is invisible, which is the same defect as one that fails.
 *
 * ## The permission props are PRESENTATION, and both halves are real
 *
 * `canUpload` / `canReview` come from the server as `isStaffOnCase(grantedRoles)`. They are not a
 * lock: `case_document_versions_insert_staff` and `case_document_reviews_insert_staff` both open
 * on `private.can_staff_case`, and the two routes re-decide `case.documents.request` on every
 * request. But the LINKED STUDENT genuinely reaches this surface — they hold `case.read` at
 * `linked`, so `openCaseRoute` admits them — and rendering them a review verb for their own
 * passport would be an invitation to a 403. Spec §7.2 (D7).
 *
 * They still see the history and, above all, the REJECTION NOTE. MV-185's policy comment calls
 * that "the half of this model that is any use to them", and it is why `_select_actor` rides the
 * case axis rather than the staff axis.
 *
 * ## `lib/cases/document-collaboration` is safe to import here
 *
 * It carries no `server-only`: it is a pure derivation and a copy table — what the surface says
 * out loud — not a scoring rule or a permission. `./case-document-requests.tsx` states the same
 * boundary, and MV-169 is the incident that made it a rule.
 */

export interface CaseDocumentVersionsProps {
  caseId: string;
  requestId: string;
  progress: RequestProgress;
  versions: readonly CaseDocumentVersionRow[];
  reviews: readonly CaseDocumentReviewRow[];
  canUpload: boolean;
  canReview: boolean;
}

/** "20 Aug 2026" — hand-rolled in UTC so every environment renders one string. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** `1.4 MB` / `812 KB`. Never bytes — a file size is a rough sense of scale, not a measurement. */
function fileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function CaseDocumentVersions({
  caseId,
  requestId,
  progress,
  versions,
  reviews,
  canUpload,
  canReview,
}: CaseDocumentVersionsProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  const history = versionsForRequest(requestId, versions);
  const newestId = progress.newestVersion?.id ?? null;

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (uploading || !file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch(
        `/api/cases/${caseId}/document-requests/${requestId}/versions`,
        { method: "POST", body },
      );
      if (!response.ok) {
        // 429 is this surface's own answer and never reaches `saveErrorMessage`, which has no
        // sentence for it and would report a rate limit as a generic failure.
        setUploadError(
          response.status === 429
            ? "Too many uploads just now — wait a moment and try again."
            : saveErrorMessage(response.status),
        );
        return;
      }
      if (fileRef.current) fileRef.current.value = "";
      // `router.refresh()` re-renders the server component in place, so the new version and the
      // status the TRIGGER derived both arrive from the database rather than being guessed here.
      router.refresh();
    } catch {
      setUploadError(saveErrorMessage(500));
    } finally {
      setUploading(false);
    }
  }

  async function decide(versionId: string, decision: "accepted" | "rejected") {
    if (decidingId !== null) return;
    setDecidingId(versionId);
    setReviewError(null);
    try {
      const response = await fetch(`/api/cases/${caseId}/document-versions/${versionId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // NULL, never "": an empty string would be a third value that renders as a reason the
        // reviewer did not write.
        body: JSON.stringify({ decision, note: note.trim() === "" ? null : note.trim() }),
      });
      if (!response.ok) {
        setReviewError(saveErrorMessage(response.status));
        return;
      }
      setNote("");
      router.refresh();
    } catch {
      setReviewError(saveErrorMessage(500));
    } finally {
      setDecidingId(null);
    }
  }

  async function open(versionId: string) {
    if (openingId !== null) return;
    setOpeningId(versionId);
    setOpenError(null);
    try {
      const response = await fetch(`/api/cases/${caseId}/document-versions/${versionId}/download`);
      if (!response.ok) {
        setOpenError("We couldn't open that file. Please try again.");
        return;
      }
      const data = (await response.json()) as { url?: string };
      if (!data.url) {
        setOpenError("We couldn't open that file. Please try again.");
        return;
      }
      // A new tab, and `noopener` so the signed URL never reaches `window.opener`. The URL is a
      // short-lived unauthenticated bearer of the bytes (60s), which is precisely why it is
      // handed to the browser and never stored.
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch {
      setOpenError("We couldn't open that file. Please try again.");
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <div data-collaboration className="flex flex-col gap-3 border-t border-line pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          data-progress-word
          className={`inline-flex items-center whitespace-nowrap rounded-pill px-2.5 py-0.5 text-caption ${REQUEST_PROGRESS_TONE[progress.state]}`}
        >
          {REQUEST_PROGRESS_WORD[progress.state]}
        </span>
        <p className="text-caption text-ink-soft">{REQUEST_PROGRESS_SENTENCE[progress.state]}</p>
      </div>

      {history.length > 0 ? (
        <ul aria-label="File history" className="flex flex-col gap-2">
          {history.map((version) => {
            const judgements = reviewsForVersion(version.id, reviews);
            const judgement = judgements[0] ?? null;
            const isNewest = version.id === newestId;
            return (
              <li
                key={version.id}
                data-version
                className="flex flex-col gap-1.5 rounded-md border border-line p-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="min-w-0 break-words text-meta font-medium">{version.originalName}</p>
                  <p className="text-caption text-ink-soft">
                    <time dateTime={version.createdAt}>{shortDate(version.createdAt)}</time>
                    {` · ${fileSize(version.fileSize)}`}
                    {/* Named, because a history where every row looks alike gives a reader no
                        way to tell which file the state above is about. */}
                    {isNewest ? " · newest" : null}
                  </p>
                </div>

                {judgement !== null ? (
                  <p data-judgement className="text-caption text-ink-soft">
                    <span
                      className={
                        judgement.decision === "accepted" ? "text-strong" : "text-reach"
                      }
                    >
                      {judgement.decision === "accepted" ? "Accepted" : "Rejected"}
                    </span>
                    {judgement.note === null ? null : ` — ${judgement.note}`}
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={openingId !== null}
                    onClick={() => open(version.id)}
                  >
                    {openingId === version.id ? "Opening…" : "Open"}
                  </Button>

                  {/* The verbs, on the NEWEST version only and for staff only. An older version
                      is history: a review written on it would be one the derivation ignores. */}
                  {canReview && isNewest ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={decidingId !== null}
                        onClick={() => decide(version.id, "accepted")}
                      >
                        {decidingId === version.id ? "Saving…" : "Accept"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={decidingId !== null}
                        onClick={() => decide(version.id, "rejected")}
                      >
                        Reject
                      </Button>
                    </>
                  ) : null}
                </div>

                {canReview && isNewest ? (
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor={`review-note-${version.id}`}
                      className="text-caption text-ink-soft"
                    >
                      Reason (optional, and the student can read it)
                    </label>
                    {/* The <Input> primitive, not a hand-rolled shell: MV-90's ratchet
                        (`tests/styles/card-shell-ratchet.test.ts`) exists because this exact
                        class string was copy-pasted 55+ times, and the sibling form in
                        `./case-document-requests.tsx` already renders through it. */}
                    <Input
                      id={`review-note-${version.id}`}
                      name="reviewNote"
                      value={note}
                      maxLength={2000}
                      onChange={(event) => setNote(event.target.value)}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {reviewError !== null ? (
        <p role="alert" className="text-meta text-reach">
          {reviewError}
        </p>
      ) : null}
      {openError !== null ? (
        <p role="alert" className="text-meta text-reach">
          {openError}
        </p>
      ) : null}

      {canUpload ? (
        <form onSubmit={upload} className="flex flex-wrap items-center gap-2">
          <label htmlFor={`upload-${requestId}`} className="sr-only">
            {/* The label names the REQUEST, because a page of these otherwise offers a screen
                reader a dozen controls all called "Choose file". */}
            Upload a file for this request
          </label>
          <input
            id={`upload-${requestId}`}
            ref={fileRef}
            type="file"
            name="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="max-w-full text-caption text-ink-soft file:mr-3 file:rounded-pill file:border file:border-line-2 file:bg-surface file:px-3 file:py-1.5 file:text-meta file:text-ink"
          />
          <Button type="submit" size="sm" variant="ghost" disabled={uploading}>
            {uploading ? "Uploading…" : history.length === 0 ? "Upload" : "Upload a new version"}
          </Button>
        </form>
      ) : null}

      {uploadError !== null ? (
        <p role="alert" className="text-meta text-reach">
          {uploadError}
        </p>
      ) : null}
    </div>
  );
}
