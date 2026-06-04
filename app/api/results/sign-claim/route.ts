import { NextResponse } from "next/server";
import { signClaim } from "@/lib/auth/hmac-claim";

const CLAIM_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const assessmentId = (body as { assessmentId?: string })?.assessmentId;
  if (!assessmentId || !/^[0-9a-f-]{36}$/.test(assessmentId)) {
    return NextResponse.json({ error: "Invalid assessmentId" }, { status: 422 });
  }
  try {
    const token = signClaim(assessmentId, Date.now() + CLAIM_TTL_MS);
    return NextResponse.json({ token });
  } catch (e) {
    console.error("[sign-claim] failed:", e);
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
}
