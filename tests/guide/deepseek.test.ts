import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

import { deepseekChat } from "@/lib/guide/deepseek";

describe("deepseekChat", () => {
  const OLD_KEY = process.env.DEEPSEEK_API_KEY;
  const OLD_URL = process.env.DEEPSEEK_BASE_URL;

  beforeEach(() => {
    process.env.DEEPSEEK_API_KEY = "sk-test";
    process.env.DEEPSEEK_BASE_URL = "https://api.deepseek.com";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.DEEPSEEK_API_KEY = OLD_KEY;
    process.env.DEEPSEEK_BASE_URL = OLD_URL;
  });

  it("throws when the API key is not configured (never silently no-ops)", async () => {
    delete process.env.DEEPSEEK_API_KEY;
    await expect(deepseekChat([{ role: "user", content: "hi" }])).rejects.toThrow(/DEEPSEEK_API_KEY/);
  });

  it("posts OpenAI-compatible chat completions with a bearer token and returns the reply", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "grounded answer" } }] }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const out = await deepseekChat([{ role: "user", content: "why am I a reach?" }]);
    expect(out).toBe("grounded answer");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    const sent = JSON.parse(init.body as string);
    expect(sent.model).toBe("deepseek-chat");
    expect(sent.stream).toBe(false);
    // Low temperature keeps answers factual/grounded rather than creative.
    expect(sent.temperature).toBeLessThanOrEqual(0.3);
  });

  it("throws a clean error on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 500 })));
    await expect(deepseekChat([{ role: "user", content: "hi" }])).rejects.toThrow(
      /DeepSeek request failed \(500\)/,
    );
  });

  it("throws when the response carries no message content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [] }), { status: 200 })),
    );
    await expect(deepseekChat([{ role: "user", content: "hi" }])).rejects.toThrow(/no content/i);
  });

  it("bounds the request with a timeout signal so a hung provider still fails fast (calm 503)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await deepseekChat([{ role: "user", content: "hi" }]);

    // Even with no caller signal, the request carries an AbortSignal — a hung
    // DeepSeek call aborts and surfaces as the route's calm 503 rather than
    // hanging until the platform terminates the function.
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
