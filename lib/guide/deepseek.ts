import "server-only";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const MODEL = "deepseek-chat";

/**
 * Minimal server-side DeepSeek client (OpenAI-compatible chat completions). `server-only`
 * so the API key can never reach the browser. Reads DEEPSEEK_API_KEY / DEEPSEEK_BASE_URL
 * from the environment and returns the assistant's reply text. Throws on a missing key, a
 * non-ok response, or empty content so the route surfaces a clean failure rather than a
 * silent or fabricated answer. Temperature is low by default — the guide states grounded
 * facts, it does not brainstorm.
 */
export async function deepseekChat(
  messages: ChatMessage[],
  opts: { temperature?: number; maxTokens?: number; signal?: AbortSignal } = {},
): Promise<string> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("DEEPSEEK_API_KEY is not configured");
  const baseUrl = process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL;

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 800,
      stream: false,
    }),
    signal: opts.signal,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`DeepSeek request failed (${res.status}): ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek returned no content");
  return content;
}
