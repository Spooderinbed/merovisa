import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOutcomesForUser } from "@/lib/outcomes/repo";

// GET /api/outcomes — the signed-in user's full outcome history (RLS owner-scoped).
export async function GET(): Promise<Response> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const outcomes = await getOutcomesForUser(supabase, data.user.id);
  return NextResponse.json({ ok: true, ...outcomes }, { status: 200 });
}
