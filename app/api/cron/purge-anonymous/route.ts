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
 * wrong secret returns a bare 404, so the route is indistinguishable from one that does
 * not exist (the `/api/dev/sign-in` precedent). A missing secret is also logged, because
 * the failure mode of a fail-closed gate is a purge that silently stops running.
 *
 * `?dryRun=1` reports what WOULD be deleted and deletes nothing — the first production
 * run should use it, be read once, and only then be armed.
 */
export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/purge-anonymous] CRON_SECRET is not set — the purge cannot run");
    return false;
  }
  const presented = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, so compare lengths first.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function GET(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";

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
