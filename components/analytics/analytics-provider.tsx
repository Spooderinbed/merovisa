"use client";

import { useEffect } from "react";

/**
 * Initializes PostHog once on the client. Renders nothing. Without
 * NEXT_PUBLIC_POSTHOG_KEY (dev/test/CI) it is a silent no-op — no init, no
 * network. The posthog-js bundle (~50–160KB) is dynamically imported only after
 * the key check passes, so anonymous visitors (incl. every marketing page) never
 * download it and it stays off the initial client chunk (MV-98). Autocapture and
 * session recording stay off by policy: the explicit catalog in
 * lib/analytics/events.ts is the only event surface.
 */
export function AnalyticsProvider() {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;
    void import("posthog-js").then(({ default: posthog }) => {
      if (posthog.__loaded) return;
      posthog.init(key, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com",
        autocapture: false,
        disable_session_recording: true,
        // "history_change" so App Router client navigations count as pageviews.
        capture_pageview: "history_change",
        respect_dnt: true,
      });
    });
  }, []);
  return null;
}
