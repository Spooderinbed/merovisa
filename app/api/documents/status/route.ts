import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DocumentStatusSchema } from "@/lib/validation/documents";
import { setObtained } from "@/lib/documents/status-repo";

// POST /api/documents/status — toggle a document kind's "obtained" state for the
// signed-in user (MV-53, global checklist). owner is read from the session, never
// the body; the RLS server client scopes the write. Independent of uploads.
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = DocumentStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await setObtained(supabase, data.user.id, parsed.data.kind, parsed.data.obtained);
  return NextResponse.json({ ok: true }, { status: 200 });
}
