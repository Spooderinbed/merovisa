import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit/upstash";
import { resolvePersonalCaseId } from "@/lib/cases/personal-case";
import { checkCasePermission } from "@/lib/cases/require-permission";
import { getPrimaryAssessmentForCase } from "@/lib/assessments/repo";
import { listOpenPlanForCase } from "@/lib/plan/repo";
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

  const caseId = await resolvePersonalCaseId(data.user.id, supabase);
  if (caseId !== null) {
    const { decision } = await checkCasePermission(data.user.id, caseId, "case.read", supabase);
    if (!decision.allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // No personal case means no grounding data — the guide still answers, on an
  // empty context, exactly as it does for a signed-in user who has not assessed.
  const [primaryRow, planItems] = caseId === null
    ? [null, []]
    : await Promise.all([
        getPrimaryAssessmentForCase(supabase, caseId),
        listOpenPlanForCase(supabase, caseId),
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
