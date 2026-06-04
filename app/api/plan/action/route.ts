import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { setPlanItemStatus } from "@/lib/plan/repo";

const BodySchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(["todo", "done", "dismissed"]),
});

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ok = await setPlanItemStatus(
    createSupabaseAdminClient(),
    data.user.id,
    parsed.data.id,
    parsed.data.status,
  );
  return NextResponse.json({ ok }, { status: ok ? 200 : 500 });
}
