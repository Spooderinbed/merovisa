import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit/upstash";
import { getPrimaryAssessmentForUser } from "@/lib/assessments/repo";
import { listOpenPlanForUser } from "@/lib/plan/repo";
import { buildGuideContext } from "@/lib/guide/context";
import { buildSafeHistoryMessages } from "@/lib/guide/history";
import { GUIDE_SYSTEM_PROMPT } from "@/lib/guide/system-prompt";
import { deepseekChat, type ChatMessage } from "@/lib/guide/deepseek";
import type { AssessmentPayload } from "@/lib/results/types";

const TurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(2000),
});

const BodySchema = z.object({
  message: z.string().min(1).max(2000),
  history: z.array(TurnSchema).max(12).optional(),
});

/**
 * The AI guide endpoint. It grounds the model in the student's own assessment and
 * MyVisa's sourced corridor data, then answers via DeepSeek. Trust-first: it never
 * fabricates a fallback answer — if the provider/key fails it returns a calm 503 so
 * the UI can say so honestly rather than invent guidance.
 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 422 });
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await checkRateLimit("guide", data.user.id, 20, "1 m"))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const [primaryRow, planItems] = await Promise.all([
    getPrimaryAssessmentForUser(supabase, data.user.id),
    listOpenPlanForUser(supabase, data.user.id),
  ]);
  const payload = (primaryRow?.result as unknown as AssessmentPayload | undefined) ?? null;
  const context = buildGuideContext({ payload, planItems });

  // The browser-supplied transcript is folded into a single, clearly-untrusted user
  // block — never re-emitted as role:"assistant" — so a client cannot forge a prior
  // guide turn ("your visa is guaranteed") and have the model treat it as its own fact.
  const messages: ChatMessage[] = [
    { role: "system", content: GUIDE_SYSTEM_PROMPT },
    { role: "system", content: context },
    ...buildSafeHistoryMessages(parsed.data.history),
    { role: "user", content: parsed.data.message },
  ];

  let reply: string;
  try {
    reply = await deepseekChat(messages);
  } catch (e) {
    console.error("[guide] provider call failed:", e);
    return NextResponse.json(
      { error: "The guide is unavailable right now. Please try again in a moment." },
      { status: 503 },
    );
  }

  return NextResponse.json({ reply }, { status: 200 });
}
