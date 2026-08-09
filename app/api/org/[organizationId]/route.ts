import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkOrgPermission } from "@/lib/cases/require-org-permission";
import { renameOrganization } from "@/lib/org/repo";

/**
 * Access-matrix cell 2 — organization rename / settings. **Owner-only, not admin**
 * (canonical divergence #1): `organizations_update_owner` reads
 * `actor_owner_org_ids()`, and the TypeScript matrix reserves `org.settings` to
 * `owner` with the note "renaming the organization and transferring ownership stay
 * with the owner". An admin holds `org.manage` and must not reach this route.
 *
 * The order is authorize → write, and the denial tests assert the repository was
 * never called. `renameOrganization` reads the row back, so a policy refusal —
 * which Postgres reports as zero rows affected rather than an error — surfaces as
 * a 403 instead of a cheerful 200.
 *
 * Organization CREATION is deliberately absent and is not an oversight: spec F-2
 * records that `authenticated` holds no INSERT grant on `organizations` and there
 * is no INSERT policy. Provisioning stays a founder/ops action; no Stage 3 slice
 * grants it.
 */

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Exactly the two columns in `grant update (name, slug) on public.organizations`.
// `.strict()` is load-bearing: a payload naming `status` or `id` is refused here
// rather than silently dropped, so a client cannot believe it changed something.
const BodySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    slug: z.string().trim().min(2).max(48).regex(SLUG).optional(),
  })
  .strict()
  .refine((body) => body.name !== undefined || body.slug !== undefined, {
    message: "Provide a name or a slug",
  });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
): Promise<Response> {
  const { organizationId } = await params;

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

  const { decision } = await checkOrgPermission(data.user.id, organizationId, "org.settings", supabase);
  if (!decision.allowed) {
    return NextResponse.json({ error: "Forbidden", reason: decision.reason }, { status: 403 });
  }

  const result = await renameOrganization(organizationId, parsed.data, supabase);
  if (!result.ok) {
    if (result.reason === "slug-taken") {
      return NextResponse.json({ error: "That web address is already taken" }, { status: 409 });
    }
    if (result.reason === "denied") {
      return NextResponse.json({ error: "Forbidden", reason: "denied" }, { status: 403 });
    }
    return NextResponse.json({ error: "Could not save the organization" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
