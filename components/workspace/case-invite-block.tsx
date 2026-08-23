"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveErrorMessage } from "./save-error";

/**
 * MV-193 — the unlinked case's invitation control (Stage 5 slice 1).
 *
 * ## What changed, and why the old sentence was right until now
 *
 * This panel used to say "Sending the invitation isn't built yet." Stage 3 shipped that
 * deliberately: spec §2, "Invitation actions become links only when Stage 5 exists;
 * before then the linkage marker remains visible without a dead control." This card is
 * what earns the control, so the sentence goes.
 *
 * ## The counsellor sends the link. The product says so.
 *
 * There is no transactional email infrastructure in this product — no Resend, no
 * SendGrid, no nodemailer, no mailer module anywhere — and adopting a vendor for one
 * slice would buy a new dependency, a new production secret, a new deliverability
 * surface and a new leg in the cross-border privacy review. So slice 1 mints a link and
 * hands it over, and **the copy states plainly that the counsellor is the one sending
 * it**. A panel that implied we had emailed the student would be the kind of quiet
 * dishonesty this product exists not to ship.
 *
 * ## The link is shown ONCE and the component says that too
 *
 * The plaintext token is returned by the mint call and by nothing else — it is not in
 * the row, not in the list read, not in the audit event. So the copy warns before the
 * counsellor navigates away, because there is no "show it again".
 *
 * ## Why this is a client boundary
 *
 * Two mutations that must not navigate away, and one piece of state — the freshly
 * minted link — that exists only in this render. `router.refresh()` re-renders the
 * server component in place so the invitation list updates without unmounting the link
 * the counsellor is about to copy.
 *
 * ## What is NOT imported here
 *
 * `lib/cases/permissions` and `lib/cases/invitations-repo` are `server-only`. Which
 * controls exist is decided on the server and arrives as props — MV-169 leaked the
 * permission matrix into the browser bundle through a component like this one, and only
 * `next build` caught it. Nothing here is a lock: the route re-decides
 * `case.invite_student` on every request and the database decides again.
 */

/** One invitation as the server read it. Carries no token and no digest, by design. */
export interface CaseInvitationView {
  id: string;
  email: string;
  state: "revoked" | "accepted" | "expired" | "outstanding";
  expiresAt: string;
  createdAt: string;
}

export interface CaseInviteBlockProps {
  caseId: string;
  /** Does the case carry an email already? Decides the caption, never the control. */
  hasEmail: boolean;
  /** The email on the case, if it has one — the form's starting value, not a constraint. */
  caseEmail: string | null;
  isNextAction: boolean;
  invitations: readonly CaseInvitationView[];
  /**
   * `case.invite_student`, decided on the server. Presentation only — see the header.
   * Today everyone who can open an unlinked case holds it, but the claim is asked for
   * explicitly rather than inferred from the page's read gate, because those two are
   * different questions and the matrix is free to move one without the other.
   */
  canInvite: boolean;
  /** A failed invitation read, so the panel can say "we could not tell" rather than "none". */
  listFailed: boolean;
}

/** "1 September 2026" — the same plain long form the rest of the workspace uses. */
function formatDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

const STATE_COPY: Record<CaseInvitationView["state"], string> = {
  outstanding: "Invitation sent",
  accepted: "Invitation accepted",
  expired: "Invitation expired",
  revoked: "Invitation revoked",
};

export function CaseInviteBlock({
  caseId,
  hasEmail,
  caseEmail,
  isNextAction,
  invitations,
  canInvite,
  listFailed,
}: CaseInviteBlockProps) {
  const router = useRouter();

  const [email, setEmail] = useState(caseEmail ?? "");
  const [minting, setMinting] = useState(false);
  const [mintError, setMintError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  /** The one render in which the plaintext token exists. Never persisted, never re-fetched. */
  const [freshLink, setFreshLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const outstanding = invitations.find((invitation) => invitation.state === "outstanding") ?? null;
  const history = invitations.filter((invitation) => invitation.state !== "outstanding");

  async function mint(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (minting || email.trim() === "") return;
    setMinting(true);
    setMintError(null);
    setCopied(false);
    try {
      const response = await fetch(`/api/cases/${caseId}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!response.ok) {
        // 409 is its own sentence: the state refused this, not the input, and the fix is
        // the Revoke button already on screen rather than a retry.
        setMintError(
          response.status === 409
            ? "An invitation is already outstanding for this case. Revoke it first if you need to send a new link."
            : saveErrorMessage(response.status),
        );
        return;
      }
      const payload = (await response.json()) as { link?: unknown };
      setFreshLink(typeof payload.link === "string" ? payload.link : null);
      router.refresh();
    } catch {
      setMintError(saveErrorMessage(500));
    } finally {
      setMinting(false);
    }
  }

  async function revoke(invitationId: string) {
    if (revokingId !== null) return;
    setRevokingId(invitationId);
    setRevokeError(null);
    try {
      const response = await fetch(`/api/cases/${caseId}/invitations/${invitationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revoked: true }),
      });
      if (!response.ok) {
        setRevokeError(saveErrorMessage(response.status));
        return;
      }
      // The revoked link is dead, so the copy box goes with it — leaving it on screen
      // would offer the counsellor a link that no longer works.
      setFreshLink(null);
      router.refresh();
    } catch {
      setRevokeError(saveErrorMessage(500));
    } finally {
      setRevokingId(null);
    }
  }

  async function copy() {
    if (freshLink === null) return;
    try {
      await navigator.clipboard.writeText(freshLink);
      setCopied(true);
    } catch {
      // A denied clipboard permission is not worth a red banner: the value is visible and
      // selectable in the box above, which is the fallback.
      setCopied(false);
    }
  }

  return (
    <section
      data-testid={isNextAction ? "case-next-action" : undefined}
      className={
        isNextAction
          ? "flex flex-col gap-3 rounded-lg border border-primary/25 bg-primary-tint p-5"
          : "flex flex-col gap-3 rounded-lg border border-line p-5"
      }
    >
      <div className="flex flex-col gap-1">
        {isNextAction ? (
          <span className="text-caption uppercase tracking-wide text-ink-faint">Next action</span>
        ) : null}
        <h2 className="text-title font-medium text-ink">
          {outstanding !== null ? "Invitation outstanding" : "Invite the student"}
        </h2>
      </div>
      <p className="max-w-[64ch] text-body text-ink-soft">
        Link their account before relying on a student-entered profile or visa read.
      </p>

      {listFailed ? (
        // Two facts, two sentences. "Nobody has been invited" on a case whose read failed
        // is how a second link gets minted for a student who already has one.
        <p className="max-w-[64ch] text-caption text-ink-soft">
          We could not read this case&rsquo;s invitations just now, so we cannot say whether one is
          already outstanding. Reload before sending a new link.
        </p>
      ) : null}

      {freshLink !== null ? (
        <div className="flex flex-col gap-2 rounded-lg border border-line p-4">
          <p className="text-meta font-medium text-ink">Send this link to the student yourself</p>
          <p className="max-w-[64ch] text-caption text-ink-soft">
            MeroVisa does not email it. Copy it now &mdash; it is shown once and cannot be shown
            again.
          </p>
          <code className="block break-all rounded-lg border border-line p-3 font-mono text-caption text-ink">
            {freshLink}
          </code>
          <div className="flex items-center gap-3">
            <Button type="button" size="sm" variant="ghost" onClick={copy}>
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
        </div>
      ) : null}

      {outstanding !== null ? (
        <div className="flex flex-col gap-2">
          <p className="max-w-[64ch] text-caption text-ink-soft">
            {STATE_COPY.outstanding} to {outstanding.email} on {formatDay(outstanding.createdAt)}.
            The link stops working on {formatDay(outstanding.expiresAt)}.
          </p>
          {canInvite ? (
            <div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={revokingId !== null}
                onClick={() => revoke(outstanding.id)}
              >
                {revokingId === outstanding.id ? "Revoking…" : "Revoke invitation"}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {outstanding === null && canInvite ? (
        <form onSubmit={mint} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="inviteEmail" className="text-meta text-ink-soft">
              Student&rsquo;s email
            </label>
            <Input
              id="inviteEmail"
              name="inviteEmail"
              type="email"
              value={email}
              maxLength={254}
              className="max-w-[24rem]"
              onChange={(event) => setEmail(event.target.value)}
            />
            <p className="max-w-[64ch] text-caption text-ink-soft">
              {hasEmail
                ? "They sign in with this address, so it has to be one they can open."
                : "There is no email on this case yet. Whatever you enter here is the address the student signs in with."}
            </p>
          </div>
          {mintError !== null ? (
            <p role="alert" className="text-meta text-reach">
              {mintError}
            </p>
          ) : null}
          <div>
            <Button type="submit" size="sm" disabled={minting || email.trim() === ""}>
              {minting ? "Creating…" : "Create invitation link"}
            </Button>
          </div>
        </form>
      ) : null}

      {revokeError !== null ? (
        <p role="alert" className="text-meta text-reach">
          {revokeError}
        </p>
      ) : null}

      {history.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {history.map((invitation) => (
            <li key={invitation.id} className="text-caption text-ink-soft">
              {STATE_COPY[invitation.state]} &middot; {invitation.email} &middot;{" "}
              {formatDay(invitation.createdAt)}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
