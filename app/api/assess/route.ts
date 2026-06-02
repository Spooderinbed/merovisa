import { NextResponse } from "next/server";
import { ProfileSchema } from "@/lib/validation/profile";
import { assembleAssessment } from "@/lib/results/assemble";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });
  }

  const payload = assembleAssessment(parsed.data);
  return NextResponse.json(payload, { status: 200 });
}
