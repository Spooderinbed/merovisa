import { describe, it, expect, vi, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

/**
 * The redaction is only worth anything if it is WIRED. `redact-url.test.ts` proves
 * the function; this proves PostHog is initialized with it, which is the half a
 * pure unit test cannot reach.
 *
 * posthog-js is mocked here (the sibling `analytics-provider.test.tsx` uses the
 * real module on purpose, to prove the no-key path end to end).
 */
const { init } = vi.hoisted(() => ({ init: vi.fn() }));
vi.mock("posthog-js", () => ({ default: { __loaded: false, init } }));

import { AnalyticsProvider } from "@/components/analytics/analytics-provider";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

async function initConfig() {
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_placeholder");
  render(<AnalyticsProvider />);
  await waitFor(() => expect(init).toHaveBeenCalled());
  return init.mock.calls[0]?.[1] as {
    capture_pageview: string;
    sanitize_properties?: (properties: Record<string, unknown>, event: string) => unknown;
  };
}

describe("AnalyticsProvider — pageview URLs are sanitized before they leave the browser", () => {
  it("initializes posthog WITH a property sanitizer, alongside pageview capture", async () => {
    const config = await initConfig();
    expect(config.capture_pageview).toBe("history_change");
    expect(typeof config.sanitize_properties).toBe("function");
  });

  it("strips a searched student out of $current_url on the pageview PostHog would send", async () => {
    const config = await initConfig();
    const sanitized = config.sanitize_properties?.(
      {
        $current_url:
          "https://app.test/workspace/org-1/students?q=Placeholder+Name&status=closed",
      },
      "$pageview",
    ) as Record<string, string>;

    expect(sanitized.$current_url).not.toContain("Placeholder");
    // The status filter is a closed vocabulary, not free text, and stays readable.
    expect(sanitized.$current_url).toContain("status=closed");
  });
});
