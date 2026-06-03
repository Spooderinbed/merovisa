import { NextResponse } from "next/server";
import { LeadSchema } from "@/lib/validation/lead";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createLead } from "@/lib/assessments/repo";

export async function POST(request: Request): Promise<Response> {
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
