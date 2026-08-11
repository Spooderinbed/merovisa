import { describe, it, expect, vi, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

/**
 * The three DOM-scraping collectors posthog-js can turn on, refused IN CODE.
 *
 * `autocapture` and `disable_session_recording` were always set here. Heatmaps
 * were not, and a config posthog-js does not see falls back to
 * `_enabledServerSide` — a PostHog PROJECT-SETTINGS toggle that someone can flip
 * in a dashboard with no code change, no review and no deploy.
 *
 * That matters more than the other two because of the SHAPE of what heatmaps
 * send: `$heatmap_data` is an object whose KEYS are `window.location.href`.
 * `sanitize_properties` rewrites property VALUES, so a URL sitting in a key is
 * somewhere the redaction cannot reach — a searched student's name would leave
 * the browser intact (MV-170 adversarial review, 2026-08-10).
 *
 * posthog-js is mocked here, as in the sibling sanitize test.
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
  return init.mock.calls[0]?.[1] as Record<string, unknown>;
}

describe("AnalyticsProvider — every DOM-scraping collector is refused in code", () => {
  it("turns heatmaps off explicitly, rather than leaving it to a remote toggle", async () => {
    const config = await initConfig();
    // Not `toBeFalsy()`: `undefined` is exactly the defect — it is what hands the
    // decision to `_enabledServerSide`.
    expect(config.capture_heatmaps).toBe(false);
  });

  it("keeps the two collectors that were already refused refused", async () => {
    const config = await initConfig();
    expect(config.autocapture).toBe(false);
    expect(config.disable_session_recording).toBe(true);
  });
});
