import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";

const DEV_EMAIL = "dev@merovisa.local";
const DEV_PASSWORD = "MerovisaDevPassword2026!";

/**
 * Dev-only auto sign-in endpoint. Idempotently creates a fixed dev user in
 * Supabase Auth, then signs in via password to set session cookies. Returns
 * 404 in production — the route is functionally dead outside development.
 *
 * Usage: navigate to /api/dev/sign-in (optional ?next=/profile) on localhost.
 */
export async function GET(request: Request): Promise<Response> {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not found", { status: 404 });
  }

  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next")) ?? "/dashboard";

  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch (e) {
    return NextResponse.json(
      { error: "Admin client init failed", detail: String(e) },
      { status: 500 },
    );
  }

  // Idempotent user creation. "User already registered" is expected on
  // subsequent calls and is silently ignored.
  const { error: createError } = await admin.auth.admin.createUser({
    email: DEV_EMAIL,
    password: DEV_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "Dev User" },
  });

  if (
    createError &&
    !createError.message?.toLowerCase().includes("already") &&
    !createError.message?.toLowerCase().includes("registered")
  ) {
    return NextResponse.json(
      { error: "Create user failed", detail: createError.message },
      { status: 500 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: DEV_EMAIL,
    password: DEV_PASSWORD,
  });

  if (signInError) {
    return NextResponse.json(
      { error: "Sign-in failed", detail: signInError.message },
      { status: 500 },
    );
  }

  return NextResponse.redirect(new URL(next, request.url));
}
