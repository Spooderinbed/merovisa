import "server-only";
import { z } from "zod";

/**
 * MV-189 — the single write choke point for `public.audit_events` (spec §8).
 *
 * ## Why this module exists at all
 *
 * The plan does not offer auditing as a refinement. It is a CONDITION of the
 * service-role exception itself: service-role is reduced to "a short, enumerated
 * exception list … where every entry is named, justified, preceded by an explicit
 * case authorization check, **and audited**" (plan line 342). Before this module,
 * `lib/supabase/service-role-exceptions.ts` held eighteen sanctioned entries and
 * eighteen `auditEvent: null` — the first three clauses satisfied by all of them and
 * the fourth by none. A counsellor could upload, open and download a student's
 * passport scan and nothing anywhere recorded that it happened.
 *
 * ## Why it is a direct INSERT and not `private.write_audit_event` (spec §8.1, D11)
 *
 * `private.write_audit_event` exists, has since Stage 1, and is unreachable — not
 * because of its grants but because of SCHEMA EXPOSURE, which no grant fixes.
 * Measured in both directions: with EXECUTE granted to BOTH `service_role` and
 * `authenticated` and the schema cache reloaded, `POST /rest/v1/rpc/write_audit_event`
 * still answers `404 PGRST202` — *"Searched for the function `public`.write_audit_event"*.
 * PostgREST looked in `public` and never considered `private`. Forcing the schema with
 * `Content-Profile: private` answers `406 PGRST106` — *"Only the following schemas are
 * exposed: public, graphql_public"*. Zero rows were written by either attempt.
 *
 * Reaching the function would therefore mean exposing `private` — which holds
 * `actor_admin_org_ids`, `can_staff_case` and every other RLS helper, i.e. handing every
 * client a direct callable into the authorization layer to satisfy a logging concern —
 * or adding a `public` wrapper, a new grant and a migration so that a client which
 * ALREADY HOLDS INSERT on the table can take a longer road to the same row. Both are
 * worse. And this is not a workaround invented here: MV-152 wrote the conclusion down in
 * `20260730180000_case_aware_rls_policies.sql:750-753` — *"Audit rows are written by
 * server paths running as service_role."*
 *
 * Consequence: **this slice ships no migration**, and `private.write_audit_event` stays
 * inert by design rather than by omission.
 *
 * ## Why the client is a PARAMETER
 *
 * `eslint.config.mjs` enforces `merovisa/service-role-exception-list`: any module that
 * imports `lib/supabase/admin` or names `SUPABASE_SERVICE_ROLE_KEY` must appear in that
 * list. This module does neither — it takes the already-constructed client from the
 * route that owns the exception entry. The exception list stays a list of service-role
 * CALL SITES, which is what makes it reviewable; a shared writer appearing in it would
 * blur exactly that.
 */

/**
 * The five document-access actions, dotted / past-tense / noun-first — the vocabulary
 * `SANCTIONED_SERVICE_ROLE_CATEGORIES` already declares. `document.viewed` is reused
 * verbatim from that list rather than re-coined as a synonym.
 */
export const DOCUMENT_AUDIT_ACTIONS = [
  "document.uploaded",
  "document.viewed",
  "document.deleted",
  "document.version_uploaded",
  "document.downloaded",
] as const;

export type DocumentAuditAction = (typeof DOCUMENT_AUDIT_ACTIONS)[number];

/**
 * THE CLOSED METADATA ALLOW-LIST (spec §8.3, D13).
 *
 * The plan's constraint is explicit: "Sensitive document content, passport numbers, and
 * raw student details must not be copied into audit metadata" (line 275). The named trap
 * is `original_name` — on both `documents` and `case_document_versions` it is a
 * USER-SUPPLIED filename, and in this corridor it is routinely
 * `Ram_Bahadur_passport_2026.pdf`. A filename is raw student detail.
 *
 * So the permitted keys are enumerated rather than the forbidden ones excluded: a
 * deny-list silently admits every field a future table adds. Every key below carries a
 * uuid, an enum-ish token, a boolean or an integer — never free text.
 *
 * `tests/audit/audit-metadata-pii.test.ts` sweeps the call sites for the banned
 * identifiers as a second, independent layer: this list fences the KEY, the sweep fences
 * a free-text VALUE smuggled in under a permitted key.
 */
export const AUDIT_METADATA_KEYS = [
  "kind",
  "mime_type",
  "byte_size",
  "case_keyed",
  "version_id",
  "document_id",
  "request_id",
  "reason",
] as const;

export type AuditMetadataKey = (typeof AUDIT_METADATA_KEYS)[number];
export type AuditMetadata = Partial<Record<AuditMetadataKey, string | number | boolean | null>>;

/** The row shape, snake_case, exactly as `public.audit_events` names its columns. */
export interface AuditEventRow {
  organization_id: string | null;
  case_id: string;
  actor_user_id: string;
  action: DocumentAuditAction;
  entity_type: string;
  entity_id: string;
  metadata: AuditMetadata;
}

export interface AuditEventInput {
  /**
   * D14 — the AUTHENTICATED human, resolved from the server client before the route
   * ever reaches for service-role. Required, with no default: the service-role client is
   * the transport for this insert, never its subject, and an unattributed access event
   * is not evidence of anything.
   */
  actorUserId: string;
  /**
   * D15 — the case's own organization, or `null` for a personal case.
   *
   * `audit_events_select_admin` reads
   * `USING (organization_id = ANY (private.actor_admin_org_ids()))`, and in SQL
   * `NULL = ANY(…)` is `NULL`, not `true`. So a row written with a null organization
   * matches no admin and is readable by NOBODY, ever. For a self-serve student that is
   * the correct outcome — there is no org admin who should read their access log — but
   * the row must still carry whatever the case's organization actually IS, so the log
   * becomes readable the moment a consultancy exists, with no backfill.
   */
  organizationId: string | null;
  caseId: string;
  action: DocumentAuditAction;
  entityType: string;
  /** A uuid, always. A filename must never ride in here (D13). */
  entityId: string;
  metadata?: AuditMetadata;
}

/** A minimal structural client — anything with `.from()`, so the caller owns construction. */
export interface AuditWriteClient {
  from: (table: "audit_events") => {
    insert: (row: AuditEventRow) => PromiseLike<{ error: { message: string } | null }>;
  };
}

/**
 * Deliberately carries NO actor, case, organization or metadata value in its message.
 * The same reasoning `AuthorizationError` gives: this error is logged and may surface in
 * a trace, and an error raised BECAUSE a value looked like PII must not then print it.
 */
export class AuditWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuditWriteError";
  }
}

const Uuid = z.uuid();
const ACTIONS = new Set<string>(DOCUMENT_AUDIT_ACTIONS);
const ALLOWED_KEYS = new Set<string>(AUDIT_METADATA_KEYS);

/**
 * Write one audit row, or throw.
 *
 * ## D12 — FAIL-CLOSED, and why it throws rather than returning a boolean
 *
 * The plan settles the fork in a sentence written before this slice existed (line 504):
 * sensitive reads "are recorded at the same choke point that authorizes them, **which
 * guarantees that an authorized sensitive read and its audit row cannot be separated**".
 * "Cannot be separated" is not "should usually accompany".
 *
 * So this function throws, and the routes do not catch it into a warning. A boolean
 * return would be checked on the day it was written and unchecked forever after — and
 * the failure mode it guards is precisely the one MISTAKES.md records under Silent
 * failures: **a PostgREST `42501` RESOLVES rather than rejects**, so `await insert(...)`
 * succeeds while writing nothing. `error` is therefore destructured and checked, never
 * assumed away.
 *
 * WHERE a route calls this is part of D12 and lives at the call sites: the two
 * signed-URL mints audit BEFORE minting, so an audit failure means `createSignedUrl` is
 * never reached and no unaudited bearer of the bytes can exist; the three mutations
 * audit after their effect commits, because recording `document.uploaded` for an upload
 * that may still fail would be a lie in an evidence log. The invariant that holds across
 * all five, and that the route tests are named for: **no route returns a 2xx response
 * without its audit row committed.**
 */
export async function writeAuditEvent(
  db: AuditWriteClient,
  input: AuditEventInput,
): Promise<void> {
  if (!input.actorUserId) {
    throw new AuditWriteError("audit event requires an actor");
  }
  if (!ACTIONS.has(input.action)) {
    // The action is interpolated because it is a closed vocabulary, never user text.
    throw new AuditWriteError(`unknown audit action: ${input.action}`);
  }
  if (!Uuid.safeParse(input.entityId).success) {
    // The VALUE is withheld on purpose — this branch fires when it looks like a filename.
    throw new AuditWriteError("audit entity id must be a uuid");
  }

  const metadata = input.metadata ?? {};
  for (const key of Object.keys(metadata)) {
    if (!ALLOWED_KEYS.has(key)) {
      // The KEY names the fix; the value is exactly the PII this branch refused.
      throw new AuditWriteError(`metadata key not on the audit allow-list: ${key}`);
    }
  }

  let error: { message: string } | null;
  try {
    ({ error } = await db.from("audit_events").insert({
      organization_id: input.organizationId,
      case_id: input.caseId,
      actor_user_id: input.actorUserId,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId,
      metadata,
    }));
  } catch {
    // A transport failure, not a permissions one. Same outcome either way (D12).
    throw new AuditWriteError("audit write failed");
  }

  if (error) throw new AuditWriteError("audit write failed");
}
