"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { saveErrorMessage } from "./save-error";

/**
 * MV-182 — the document chase list.
 *
 * ## Why this is a client boundary at all
 *
 * Two mutations that must not navigate away: a counsellor working a case ticks off
 * what has arrived and asks for the next thing, and being bounced to a fresh page
 * between each one is the friction the case frame exists to remove. `router.refresh()`
 * re-renders the server component in place, so the row moves groups and the frame
 * stays mounted.
 *
 * ## What is NOT imported here, and why it matters
 *
 * `lib/cases/permissions` and `lib/cases/document-requests-repo` are `server-only`.
 * `canRequest` and the kind options arrive as PROPS, computed on the server — MV-169
 * leaked the permission matrix into the browser bundle through a component like this
 * one, and only `next build` failed.
 *
 * Which controls exist is decided on the server, and that is PRESENTATION. The route
 * re-decides `case.documents.request` on every request, and
 * `case_document_requests_insert_staff` / `_update_staff` decide again at the
 * database. Nothing here is a lock.
 *
 * ## One claim, both verbs
 *
 * Asking and resolving are the SAME permission, so they appear and disappear
 * together. A surface that offered "mark received" to a viewer who could not ask
 * would be offering half a workflow, and the 403 would arrive after the click.
 */

export interface DocumentKindOption {
  kind: string;
  label: string;
  /** The vault's own grouping, so the picker reads in the order the checklist does. */
  group: string;
}

export interface DocumentRequestView {
  id: string;
  kind: string;
  /** Resolved on the server from the document vocabulary; a kind with no label falls back to the raw value. */
  kindLabel: string;
  title: string;
  note: string | null;
  status: string;
  dueAt: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface CaseDocumentRequestsProps {
  caseId: string;
  requests: readonly DocumentRequestView[];
  kinds: readonly DocumentKindOption[];
  canRequest: boolean;
}

/** "1 September 2026" — the same plain long form the rest of the workspace uses. */
function formatDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * The caption under a request's title: its document kind, and the one date that
 * matters for its state.
 *
 * The kind is DROPPED when it is already the title, which is the common case — the
 * form pre-fills the title from the chosen document, so most requests are called
 * exactly what they are. "Passport bio page / Passport bio page" is two lines
 * saying one thing, and a reader scanning a list of them has to check every pair to
 * find the one where they differ.
 */
function caption(request: DocumentRequestView, date: { label: string; iso: string | null }): string {
  const parts: string[] = [];
  if (request.kindLabel !== request.title) parts.push(request.kindLabel);
  if (date.iso !== null) parts.push(`${date.label} ${formatDay(date.iso)}`);
  return parts.join(" · ");
}

export function CaseDocumentRequests({
  caseId,
  requests,
  kinds,
  canRequest,
}: CaseDocumentRequestsProps) {
  const router = useRouter();

  const firstKind = kinds[0];
  const [kind, setKind] = useState(firstKind?.kind ?? "");
  const [title, setTitle] = useState(firstKind?.label ?? "");
  const [note, setNote] = useState("");
  const [dueDay, setDueDay] = useState("");
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const outstanding = requests.filter((request) => request.status !== "resolved");
  const resolved = requests.filter((request) => request.status === "resolved");

  /**
   * Changing the document re-fills the title, unless the person has written their
   * own. Comparing against the KIND LABELS rather than tracking a "dirty" flag is
   * what makes "Bank Statement" → pick another → "Passport bio page" work while
   * "Father's bank statement" survives the same move.
   */
  function chooseKind(next: string) {
    setKind(next);
    const nextLabel = kinds.find((option) => option.kind === next)?.label ?? "";
    const titleIsAutoFilled =
      title.trim() === "" || kinds.some((option) => option.label === title);
    if (titleIsAutoFilled) setTitle(nextLabel);
  }

  async function ask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (asking || title.trim() === "" || kind === "") return;
    setAsking(true);
    setAskError(null);
    try {
      const response = await fetch(`/api/cases/${caseId}/document-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          title: title.trim(),
          // NULL, never "". An empty string would be a third value that renders as
          // an instruction the counsellor did not write.
          note: note.trim() === "" ? null : note.trim(),
          // A date input hands back a calendar day; the column is `timestamptz` and
          // the route's schema wants an instant. Sending one here rather than
          // letting the route guess a timezone keeps the conversion in the one place
          // that knows it was a day.
          dueAt: dueDay === "" ? null : new Date(`${dueDay}T00:00:00.000Z`).toISOString(),
        }),
      });
      if (!response.ok) {
        setAskError(saveErrorMessage(response.status));
        return;
      }
      setNote("");
      setDueDay("");
      router.refresh();
    } catch {
      setAskError(saveErrorMessage(500));
    } finally {
      setAsking(false);
    }
  }

  async function resolve(requestId: string) {
    if (resolvingId !== null) return;
    setResolvingId(requestId);
    setResolveError(null);
    try {
      const response = await fetch(`/api/cases/${caseId}/document-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "resolved" }),
      });
      if (!response.ok) {
        setResolveError(saveErrorMessage(response.status));
        return;
      }
      router.refresh();
    } catch {
      setResolveError(saveErrorMessage(500));
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="outstanding-requests" className="flex flex-col gap-3">
        <h2 id="outstanding-requests" className="text-title font-medium">
          Outstanding
        </h2>
        {outstanding.length === 0 ? (
          <p className="max-w-[64ch] text-body text-ink-soft">
            {/* Two different facts, two different sentences. "Nothing outstanding"
                on a case nobody has ever chased would read as progress that never
                happened. */}
            {requests.length === 0
              ? "Nothing has been asked for yet. Use the form below to ask this student for a document."
              : "Nothing is outstanding. Everything asked for has been received."}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {outstanding.map((request) => (
              <li key={request.id}>
                <Card padding="md" className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="text-body font-medium">{request.title}</p>
                    <p className="text-caption text-ink-soft">
                      {caption(request, { label: "Due", iso: request.dueAt })}
                    </p>
                    {request.note !== null ? (
                      <p className="max-w-[60ch] text-caption text-ink-soft">{request.note}</p>
                    ) : null}
                  </div>
                  {canRequest ? (
                    <div className="shrink-0">
                      <Button
                        type="button"
                        size="sm"
                        // `ghost`, not `primary`: a chase list of five items would be
                        // five filled buttons competing with the one action that
                        // creates work. Marking something received confirms what has
                        // already happened.
                        variant="ghost"
                        disabled={resolvingId !== null}
                        onClick={() => resolve(request.id)}
                      >
                        {resolvingId === request.id ? "Saving…" : "Mark received"}
                      </Button>
                    </div>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
        {resolveError !== null ? (
          <p role="alert" className="text-meta text-reach">
            {resolveError}
          </p>
        ) : null}
      </section>

      {resolved.length > 0 ? (
        <section aria-labelledby="resolved-requests" className="flex flex-col gap-3">
          <h2 id="resolved-requests" className="text-title font-medium">
            Resolved
          </h2>
          <ul className="flex flex-col gap-2">
            {resolved.map((request) => (
              <li key={request.id}>
                <Card padding="md" tone="tint" className="flex flex-col gap-1">
                  <p className="text-body">{request.title}</p>
                  <p className="text-caption text-ink-soft">
                    {caption(request, { label: "Received", iso: request.resolvedAt })}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {canRequest ? (
        <Card as="section" padding="lg" className="flex flex-col gap-4">
          <h2 className="text-title font-medium">Ask for a document</h2>
          <form onSubmit={ask} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="documentKind" className="text-meta text-ink-soft">
                Document
              </label>
              <Select
                id="documentKind"
                name="documentKind"
                value={kind}
                onChange={(event) => chooseKind(event.target.value)}
              >
                {kinds.map((option) => (
                  <option key={option.kind} value={option.kind}>
                    {option.group} · {option.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="requestTitle" className="text-meta text-ink-soft">
                What to ask for
              </label>
              <Input
                id="requestTitle"
                name="requestTitle"
                value={title}
                maxLength={200}
                onChange={(event) => setTitle(event.target.value)}
              />
              <p className="max-w-[60ch] text-caption text-ink-soft">
                Name the specific thing, not just the type — &ldquo;Father&apos;s bank
                statement&rdquo; and &ldquo;Applicant&apos;s bank statement&rdquo; are two different
                asks.
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="requestNote" className="text-meta text-ink-soft">
                Note (optional)
              </label>
              <Input
                id="requestNote"
                name="requestNote"
                value={note}
                maxLength={2000}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="requestDue" className="text-meta text-ink-soft">
                Due by (optional)
              </label>
              <Input
                id="requestDue"
                name="requestDue"
                type="date"
                value={dueDay}
                className="max-w-[16rem]"
                onChange={(event) => setDueDay(event.target.value)}
              />
            </div>

            {askError !== null ? (
              <p role="alert" className="text-meta text-reach">
                {askError}
              </p>
            ) : null}

            <div>
              <Button type="submit" size="sm" disabled={asking || title.trim() === ""}>
                {asking ? "Saving…" : "Ask for this"}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
