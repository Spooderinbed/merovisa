import { NextResponse } from "next/server";
import { ProfileSchema } from "@/lib/validation/profile";
import { assembleAssessment } from "@/lib/results/assemble";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createAnonymousAssessment } from "@/lib/assessments/repo";
import { assessmentExpiry } from "@/lib/assessments/expiry";
import type { Json } from "@/lib/supabase/types";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });
  }

  const payload = assembleAssessment(parsed.data);

  // Persist anonymously so the assessment survives the OAuth redirect and can be
  // claimed on signup. A failed write must never block the user from seeing results.
  let id: string | null = null;
  try {
    id = await createAnonymousAssessment(createSupabaseAdminClient(), {
      profile: parsed.data as unknown as Json,
      result: payload as unknown as Json,
      ruleVersion: payload.result.ruleVersion,
      expiresAt: assessmentExpiry(),
    });
  } catch {
    id = null;
  }

  return NextResponse.json({ id, payload }, { status: 200 });
}
