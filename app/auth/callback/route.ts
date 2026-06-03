import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { claimAssessment } from "@/lib/assessments/repo";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const claim = url.searchParams.get("claim");
  const origin = url.origin;

  if (!code) {
    return NextResponse.redirect(`${origin}/assess`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/assess?error=auth`);
  }

  if (claim) {
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;
    if (userId) {
      await claimAssessment(createSupabaseAdminClient(), {
        id: claim,
        userId,
        nowIso: new Date().toISOString(),
      });
    }
    return NextResponse.redirect(`${origin}/assessment/${claim}`);
  }

  return NextResponse.redirect(`${origin}/`);
}
