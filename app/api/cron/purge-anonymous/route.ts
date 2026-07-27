import crypto from "crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { purgeUnclaimedAnonymousAssessments } from "@/lib/assessments/purge";

/**
 * MV-135 (audit O-2) — the scheduled trigger for the anonymous-assessment purge.
 *
 * Vercel Cron calls this once a day (see `vercel.json`) with the `CRON_SECRET` as a
 * bearer token. The route is only a trigger: the policy and the delete predicate live
 * in `lib/assessments/purge.ts`, per the architecture rule that business logic stays in
 * the Next.js codebase rather than in a database function or trigger.
 *
 * The gate FAILS CLOSED, deliberately unlike `lib/rate-limit/upstash.ts` — a rate
 * limiter that no-ops when unconfigured is merely permissive, but a delete trigger that
 * no-ops when unconfigured is an internet-reachable "destroy rows" button. An absent or
 * wrong secret returns 404 rather than 401, so the route does not advertise itself as a
 * gated endpoint worth attacking (the `/api/dev/sign-in` precedent).
 *
 * `?dryRun` reports what WOULD be deleted and deletes nothing. PRESENCE alone is enough —
 * any value, either casing — because this is a switch a human types by hand, once, against
 * production, and a safety control must never degrade to the irreversible mode on a typo.
 */
export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const presented = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, so compare lengths first.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function GET(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    // Only a request presenting itself as the platform scheduler earns a log line. That is
    // the alarm for a wedged gate — a secret left unset, or rotated without a redeploy,
    // stops retention silently while /trust keeps promising students deletion. Scanners hit
    // this same URL, so an unconditional log would bury the one daily signal in noise. The
    // header is a log-throttling hint only and is never part of the gate.
    if (request.headers.get("x-vercel-cron")) {
      console.error(
        "[cron/purge-anonymous] scheduled run REJECTED — CRON_SECRET is unset, or does not match what Vercel signs with. The purge is NOT running.",
      );
    }
    return new NextResponse("Not found", { status: 404 });
  }

  // `has`, not `=== "1"`: ?dryRun, ?dryrun=1 and ?dryRun=true must all be safe. Only the
  // absence of the parameter arms the irreversible branch.
  const params = new URL(request.url).searchParams;
  const dryRun = params.has("dryRun") || params.has("dryrun");

  let report;
  try {
    report = await purgeUnclaimedAnonymousAssessments(createSupabaseAdminClient(), { dryRun });
  } catch (err) {
    console.error("[cron/purge-anonymous] purge threw", err);
    return NextResponse.json({ error: "Purge failed" }, { status: 500 });
  }

  // The count is the only record that survives the deletion — emit it before returning
  // so the funnel denominator is not lost with the rows.
  console.log("[cron/purge-anonymous] run complete", { dryRun, ...report });

  // A partial failure must never report success: a green cron on a purge that did not
  // run would leave the data in place while the schedule claims it was cleared.
  if (report.failedSteps.length > 0) {
    return NextResponse.json({ ok: false, dryRun, ...report }, { status: 500 });
  }
  return NextResponse.json({ ok: true, dryRun, ...report }, { status: 200 });
}
