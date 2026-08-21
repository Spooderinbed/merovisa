import "server-only";
import type { CaseAuthorizationClient } from "@/lib/cases/context";
import { checkCasePermission } from "@/lib/cases/require-permission";
import { isWellFormedId } from "@/lib/cases/path-ids";
import type { CaseDenyReason, CaseScopedPermission } from "@/lib/cases/permissions";
import { isOwnCaseObjectPath } from "./case-object-path";

/**
 * `mintCaseScopedDownloadUrl` — the ONE way a counsellor reaches a file, vault or collaboration
 * (MV-190, card criteria 2 and 3; spec §4 (2)).
 *
 * ## Why the authorization is inside this function and not in front of it
 *
 * **A signed URL bypasses Storage RLS by design.** Once minted it is an unauthenticated bearer of
 * the bytes — anyone holding the string can fetch them, from anywhere, until it expires. So the
 * only place a case check can possibly bite is BEFORE the mint, in our own code. That makes
 * "the caller authorizes first" a property worth having by CONSTRUCTION rather than by convention:
 * there is no argument here that lets a caller assert it already checked, and no ordering for a
 * caller to get wrong. `tests/documents/signed-download.test.ts` asserts the refusals on the mint
 * call — `createSignedUrl` was never reached — rather than on a fetch returning 404, which would
 * be evidence about the Storage service rather than about us.
 *
 * This is also why the path is bounded here and not only in the database. `checkCasePermission`
 * answers a question about the CASE; the signature is about the PATH. Without
 * `isOwnCaseObjectPath` the two never meet, and an actor legitimately authorized on case A could
 * be handed case B's object by a caller that read the path from the wrong row. The
 * `case_document_versions_storage_path_case_prefix` CHECK stops such a row being WRITTEN; this
 * stops such a path being SIGNED. Neither subsumes the other — the vault's owner-keyed objects
 * have no constraint at all, and rows predating a constraint outlive it.
 *
 * ## The client split
 *
 * `db` is the AUTHENTICATED client — the permission lookup must run as the actor. `storage` is the
 * service-role client, because the bucket's only INSERT policy is `service_role`-scoped and a
 * private object cannot be signed by a client that cannot see it. This module names no key and
 * imports no admin factory: it uses the clients it is handed, so it adds no entry to
 * `lib/supabase/service-role-exceptions.ts` and the routes that already appear there keep owning
 * their own service-role construction.
 */

/**
 * Sixty seconds. Long enough for a browser to follow the redirect, short enough that the string is
 * not worth keeping — and asserted as a NUMBER in the suite, because "short-lived" in a comment is
 * not a test (card criterion 3). It is exported so the value has exactly one definition; the
 * default parameter below reads it rather than repeating it.
 */
export const SIGNED_DOWNLOAD_TTL_SECONDS = 60;

/** The slice of the Storage client this module uses. Narrow, so a test double is honest. */
export interface SignedUrlClient {
  from(bucket: string): {
    createSignedUrl(
      path: string,
      expiresIn: number,
    ): Promise<{ data: { signedUrl?: string } | null; error: unknown }>;
  };
}

export type SignedDownload =
  | { ok: true; url: string }
  /** The case id or the path was not a value we could act on. Not a statement about access. */
  | { ok: false; kind: "malformed" }
  /** The case check said no. `reason` is carried so a route can keep 403 / 404 / 500 apart. */
  | { ok: false; kind: "denied"; reason: CaseDenyReason | null }
  /** Authorized for this case, but the key belongs to a different one. */
  | { ok: false; kind: "path-outside-case" }
  /** We could not sign it. Retryable, and deliberately NOT reported as a denial. */
  | { ok: false; kind: "mint-failed" };

export async function mintCaseScopedDownloadUrl(params: {
  actorUserId: string;
  caseId: string;
  storagePath: string;
  db: CaseAuthorizationClient;
  storage: SignedUrlClient;
  /** `case.read` is the default; a caller acting on a write surface may raise it. */
  permission?: CaseScopedPermission;
  expiresInSeconds?: number;
}): Promise<SignedDownload> {
  const {
    actorUserId,
    caseId,
    storagePath,
    db,
    storage,
    permission = "case.read",
    expiresInSeconds = SIGNED_DOWNLOAD_TTL_SECONDS,
  } = params;

  // FORMAT FIRST, before any query. `cases.id` is a uuid, so a malformed value raises `22P02`
  // inside the permission lookup, which `getCaseContext` reports as `lookup-failed` and a route
  // turns into "could not check your access" — an outage on our side, blamed on us, for a request
  // that was never a candidate. `lib/cases/path-ids.ts` states the same for route segments.
  if (!isWellFormedId(caseId)) return { ok: false, kind: "malformed" };
  if (storagePath.trim().length === 0) return { ok: false, kind: "malformed" };

  const { decision } = await checkCasePermission(actorUserId, caseId, permission, db);
  if (!decision.allowed) return { ok: false, kind: "denied", reason: decision.reason ?? null };

  // AFTER the case check, because a path bound is not an access decision and must not be able to
  // answer one. A refusal here means the CALLER handed us a key from another case — a bug on our
  // side, not a permission answer about the actor.
  if (!isOwnCaseObjectPath(caseId, storagePath)) return { ok: false, kind: "path-outside-case" };

  let signedUrl: string | undefined;
  try {
    const { data } = await storage.from("documents").createSignedUrl(storagePath, expiresInSeconds);
    signedUrl = data?.signedUrl;
  } catch (err) {
    // A thrown client is still "we could not sign it". Propagating would surface as a 500 with a
    // stack instead of the retryable answer the caller can act on.
    console.error("[documents] signed-url mint threw", { caseId, err });
    return { ok: false, kind: "mint-failed" };
  }

  if (!signedUrl) return { ok: false, kind: "mint-failed" };
  return { ok: true, url: signedUrl };
}
