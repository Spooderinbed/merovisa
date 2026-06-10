import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPlanItemKind, setPlanItemStarted, setPlanItemStatus } from "@/lib/plan/repo";
import { completionFor } from "@/lib/plan/completion";

const BodySchema = z.union([
  z.object({ id: z.number().int().positive(), status: z.enum(["todo", "done", "dismissed"]) }),
  z.object({ id: z.number().int().positive(), started: z.boolean() }),
]);

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

  const adminDb = createSupabaseAdminClient();
  // Verified items complete from observed account state (invalidatePlan), never by hand.
  const kind = await getPlanItemKind(adminDb, data.user.id, parsed.data.id);
  const isVerified = kind !== null && completionFor(kind).completion === "verified";
  if (isVerified && ("started" in parsed.data || parsed.data.status === "done")) {
    return NextResponse.json(
      { error: "This item completes automatically from your account — it can't be updated by hand." },
      { status: 422 },
    );
  }

  const ok =
    "started" in parsed.data
      ? await setPlanItemStarted(adminDb, data.user.id, parsed.data.id, parsed.data.started)
      : await setPlanItemStatus(adminDb, data.user.id, parsed.data.id, parsed.data.status);
  return NextResponse.json({ ok }, { status: ok ? 200 : 500 });
}
