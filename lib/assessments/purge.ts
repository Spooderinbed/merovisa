import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { ASSESSMENT_TTL_DAYS } from "./expiry";

type DB = SupabaseClient<Database>;

/**
 * MV-135 (audit O-2) — destroy unclaimed anonymous assessments.
 *
 * The 3-day expiry was only ever an ACCESS expiry: past `expires_at` both
 * `getRecoverableAssessment` and `claimAssessment` refuse the row, but the row itself
 * — a full profile snapshot with finances, education history and prior visa refusals,
 * for a person who never created an account and has no way to delete it — sat in the
 * table forever. This is the deletion.
 *
 * Policy: the deletion date IS the expiry date the student was already shown
 * ("Your assessment expires in 3 days"). Deriving the window from ASSESSMENT_TTL_DAYS
 * means the promise and the purge cannot drift apart if that TTL ever changes.
 * See `docs/data-retention-policy.md`.
 */
export const ANON_RETENTION_DAYS = ASSESSMENT_TTL_DAYS;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Rows created before this instant are past the retention window. */
export function anonRetentionCutoff(now: Date = new Date()): string {
  return new Date(now.getTime() - ANON_RETENTION_DAYS * MS_PER_DAY).toISOString();
}

export interface PurgeReport {
  cutoff: string;
  /** Candidate rows the scan returned. */
  scanned: number;
  /** Rows the database confirmed deleted. */
  purged: number;
  /** Candidates the app-layer re-check refused to delete (see the guard below). */
  skipped: number;
  /** The scan filled its batch — more rows remain for the next run. Never a silent cap. */
  truncated: boolean;
  failedSteps: string[];
}

/**
 * One run is bounded so a backlog can never turn into an unbounded delete; the
 * remainder is picked up by the next run and reported as `truncated`.
 */
const DEFAULT_BATCH_SIZE = 500;

/**
 * Delete unclaimed anonymous assessments that are past both their access expiry and
 * the retention window.
 *
 * Requires the SERVICE-ROLE admin client: `assessments` grants no delete to anon or
 * authenticated, and RLS is forced. That means the predicate below IS the only gate,
 * so it is applied twice — once in the scan, once again on the delete — with an
 * app-layer re-check in between. Two independent filters must BOTH regress before a
 * row anyone still owns can be destroyed.
 *
 * Three conditions, each load-bearing:
 *  - `owner is null` — a successful claim updates only { owner, claimed_at } and never
 *    extends `expires_at`, so a converted user's assessment looks exactly as expired as
 *    an abandoned one. This is what keeps their data.
 *  - `expires_at < now` — never destroy anything the visitor could still open.
 *  - `created_at < cutoff` — `created_at` is set by the database default, so a corrupted
 *    or clock-skewed `expires_at` still cannot bring a deletion forward.
 *
 * Deleting the assessment also removes any `leads` row hanging off it, via the
 * `leads_assessment_id_fkey` ON DELETE CASCADE — the captured email goes with the
 * assessment by design. That cascade is invisible at this call site; see the policy doc.
 */
export async function purgeUnclaimedAnonymousAssessments(
  db: DB,
  opts: { now?: Date; batchSize?: number; dryRun?: boolean } = {},
): Promise<PurgeReport> {
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const cutoff = anonRetentionCutoff(now);
  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
  const report: PurgeReport = { cutoff, scanned: 0, purged: 0, skipped: 0, truncated: false, failedSteps: [] };

  // Read only the columns the guard needs — never the profile/result payload.
  const { data, error } = await db
    .from("assessments")
    .select("id, owner, created_at, expires_at")
    .is("owner", null)
    .lt("expires_at", nowIso)
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(batchSize);

  if (error) {
    console.error("[purge] candidate scan failed", { error });
    report.failedSteps.push("assessments:scan");
    return report;
  }

  const candidates = (data ?? []) as Array<{
    id: string;
    owner: string | null;
    created_at: string;
    expires_at: string;
  }>;
  report.scanned = candidates.length;
  report.truncated = candidates.length >= batchSize;

  const cutoffMs = new Date(cutoff).getTime();
  const purgeable = candidates.filter((row) => {
    const ok =
      row.owner === null &&
      new Date(row.expires_at).getTime() < now.getTime() &&
      new Date(row.created_at).getTime() < cutoffMs;
    if (!ok) {
      // Either the row was claimed between the scan and here (benign — we simply keep
      // it), or the scan's filter regressed and returned something it never should have.
      // Refuse it and say so loudly; a destructive job must not paper over either case.
      console.warn("[purge] candidate refused by guard", { id: row.id, claimed: row.owner !== null });
    }
    return ok;
  });
  report.skipped = candidates.length - purgeable.length;
  if (purgeable.length === 0 || opts.dryRun) return report;

  const { data: deleted, error: deleteError } = await db
    .from("assessments")
    .delete()
    .in("id", purgeable.map((row) => row.id))
    .is("owner", null)
    .lt("expires_at", nowIso)
    .lt("created_at", cutoff)
    .select("id");

  if (deleteError) {
    console.error("[purge] delete failed", { error: deleteError, candidates: purgeable.length });
    report.failedSteps.push("assessments:delete");
    return report;
  }

  report.purged = ((deleted ?? []) as unknown[]).length;
  return report;
}
