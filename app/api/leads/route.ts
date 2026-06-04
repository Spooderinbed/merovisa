import { NextResponse } from "next/server";
import { LeadSchema } from "@/lib/validation/lead";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createLead } from "@/lib/assessments/repo";
import { checkRateLimit, ipFromRequest } from "@/lib/rate-limit/upstash";

export async function POST(request: Request): Promise<Response> {
  const ip = ipFromRequest(request);
  if (!(await checkRateLimit("leads", ip, 5, "1 m"))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  if (!(await checkRateLimit("leads-daily", ip, 30, "1 d"))) {
    return NextResponse.json({ error: "Daily limit reached" }, { status: 429 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = LeadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });
  }

  try {
    await createLead(createSupabaseAdminClient(), parsed.data);
  } catch {
    return NextResponse.json({ error: "Could not save lead" }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
