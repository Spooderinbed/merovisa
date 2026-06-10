import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "@testing-library/react";
import posthog from "posthog-js"; // real module on purpose — proves the no-key path end to end
import { AnalyticsProvider } from "@/components/analytics/analytics-provider";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("AnalyticsProvider without a key (acceptance 5)", () => {
  it("mounts silently: posthog never initializes and zero network calls happen", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<AnalyticsProvider />);
    expect(posthog.__loaded).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
