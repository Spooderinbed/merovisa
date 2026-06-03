import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { claimAssessment, getOwnedAssessment } from "@/lib/assessments/repo";

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
      // RLS is the source of truth: if the user can now read it (just-claimed OR
      // already theirs from a prior sign-in), show it. Otherwise it was expired or
      // owned by someone else — send them back to start a fresh assessment.
      const owned = await getOwnedAssessment(supabase, claim);
      if (owned) return NextResponse.redirect(`${origin}/assessment/${claim}`);
    }
    return NextResponse.redirect(`${origin}/assess?error=expired`);
  }

  return NextResponse.redirect(`${origin}/`);
}
