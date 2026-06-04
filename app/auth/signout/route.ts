import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request): Promise<Response> {
  // CSRF defense: a cross-site POST will not carry our Origin (or it will
  // mismatch) and the browser will not include a same-site Referer header.
  // Reject anything that doesn't look same-origin.
  const self = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const sameOrigin =
    (origin && origin === self) ||
    (referer && referer.startsWith(`${self}/`));
  if (!sameOrigin) {
    return NextResponse.json({ error: "CSRF check failed" }, { status: 403 });
  }

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url));
}
